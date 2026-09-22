import { useState, useRef, useEffect, useImperativeHandle, forwardRef } from 'react';
import Board from '../utils/microRepl.js';
import {
  openMicrobitUsbLink,
  looksLikeMissingMicroPython,
  findAuthorizedMicrobitSerialPort,
  waitForMicrobitSerialPort,
} from '../utils/microbitInstall.js';
import { applyPostConnectFiles, uploadFileToMicrobit } from '../utils/postConnectFiles.js';
import { createLegoTerminal } from '../utils/legoEducation/legoTerminal.js';
import {
  ensurePyodide,
  runPython,
  isPyodideReady,
  interruptPython,
  freezeBridge,
  terminatePyodide,
} from '../utils/legoEducation/pyodideRunner.js';
import {
  preloadLegoLibrary,
  connectDevice as legoConnectDevice,
  disconnectDevice as legoDisconnectDevice,
  renameDevice as legoRenameDevice,
  disconnectAll as legoDisconnectAll,
  stopAllMotion as legoStopAllMotion,
  getConnectionState as legoGetConnectionState,
  subscribe as legoSubscribe,
} from '../utils/legoEducation/legoDevices.js';
import {
  connectEsp32 as connectEsp32Arduino,
  flashBinary as flashEsp32Binary,
  resetEsp32,
  disconnectEsp32,
} from '../utils/esp32/esp32Flasher.js';
import { ESP32_USB_FILTERS, findAuthorizedEsp32SerialPort } from '../utils/esp32/esp32UsbFilters.js';
import { compileSketch, Esp32CompileError } from '../utils/esp32/esp32Compile.js';
import CodeEditor from './CodeEditor.jsx';
import ControlPanel from './ControlPanel.jsx';
import CodeTabs from './CodeTabs.jsx';
import FlashProgressModal from './FlashProgressModal.jsx';
import { useSession } from '../contexts/SessionContext';
import { useLanguage } from '../contexts/LanguageContext';
import { logConsole, logInteraction } from '../services/dataLogger';
import './SPIKEEditor.css';

const FIFO_SIZE = 10000;


const SPIKEEditor = forwardRef(({ sessionId }, ref) => {
  const { t } = useLanguage();
  // The Board and its callbacks are created once on mount, so they would
  // capture the first render's `t` (and thus the initial language). Read `t`
  // through this ref so status messages always use the current language.
  const tRef = useRef(t);
  useEffect(() => {
    tRef.current = t;
  });
  const [connected, setConnected] = useState(false);
  const [connectedBoard, setConnectedBoard] = useState(null);
  const [connectedPlatformId, setConnectedPlatformId] = useState(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [statusBanner, setStatusBanner] = useState({
    type: 'info',
    message: t('notConnected')
  });
  const [mode, setMode] = useState('disconnected');
  const [isRunning, setIsRunning] = useState(false);
  const [buffer, setBuffer] = useState('');
  // 'idle' | 'probing' | 'flashing' | 'reconnecting'
  const [connectPhase, setConnectPhase] = useState('idle');
  const [flashProgress, setFlashProgress] = useState(undefined);
  const [flashMessage, setFlashMessage] = useState('');
  // LEGO Education BLE: per-kind device lists for the ControlPanel icon row.
  const [legoConnectionState, setLegoConnectionState] = useState(legoGetConnectionState);
  // SPIKE Prime: which program slot (0-19) "Save to Slot" writes to.
  const [selectedSlot, setSelectedSlot] = useState(0);

  const {
    codeRecords,
    currentCodeId,
    currentCodeContent,
    activePlatform,
    switchCode,
    createNewCode,
    updateCodeName,
    updateCurrentCodeContent,
    createSnapshot
  } = useSession();

  const isLegoMode = activePlatform?.connectionType === 'lego-ble';
  // ESP32 C++/Arduino: sketches compile on the Modal arduino-cli service and
  // flash over WebSerial via esptool-js — no REPL, raw serial monitor only.
  const isArduinoMode = activePlatform?.connectionType === 'esp32-arduino';

  const editorRef = useRef(null);
  const boardRef = useRef(null);
  const replContainerRef = useRef(null);
  // LEGO Education BLE: xterm controller for Pyodide stdout/stderr (the serial
  // Board owns its own terminal; only one of the two is ever mounted).
  const legoTerminalRef = useRef(null);
  // Single-flight init of the lego terminal + Pyodide worker. Cleared on
  // failure (so the next connect retries) and on leaving lego mode.
  const legoRuntimePromiseRef = useRef(null);
  // Bumped every time lego mode is torn down, so in-flight async init can
  // detect it went stale and dispose whatever it just created.
  const legoModeGenRef = useRef(0);
  // ESP32 Arduino: the flasher session (serial port + monitor pump), the xterm
  // controller hosting its output, and the write-through wrapper handed to the
  // flasher so everything it prints also lands in the console buffer.
  const arduinoSessionRef = useRef(null);
  const arduinoTerminalRef = useRef(null);
  const arduinoIoRef = useRef(null);
  // Serializes compile+flash: a second flash on the same port mid-write
  // would corrupt it (state-based isRunning updates too late to guard).
  const arduinoFlashInFlightRef = useRef(false);
  const resizerRef = useRef(null);
  const containerRef = useRef(null);
  const isLocalChangeRef = useRef(false);
  // Prevents concurrent run/stop handlers from overlapping their paste calls,
  // which otherwise corrupts the REPL paste-mode handshake and hangs.
  const operationInFlightRef = useRef(false);
  // Authoritative copy of the console buffer so the once-created ondata
  // callback (and the run/reset/disconnect handlers) always read the latest
  // output without stale-closure issues.
  const bufferRef = useRef('');
  // Armed once a program's code has been fully sent to the device (after the
  // paste-mode handshake echoes are done). The next `>>> ` prompt seen by
  // ondata then marks the program as finished, so we save the console tail.
  const pendingRunSaveRef = useRef(false);
  // The Board (and its ondata callback) is created once on mount, capturing the
  // initial sessionId — which is null before the session loads. Read sessionId
  // through this ref so the run-finished save logs to the current session.
  const sessionIdRef = useRef(sessionId);
  useEffect(() => {
    sessionIdRef.current = sessionId;
  }, [sessionId]);

  const logInteractionSafe = async (action) => {
    if (!sessionIdRef.current) return;
    try {
      await logInteraction(action, sessionIdRef.current);
    } catch (error) {
      console.warn(`Failed to log interaction (${action}):`, error);
    }
  };

  const logConsoleSafe = async (content, action) => {
    if (!sessionIdRef.current || !content) return;
    try {
      await logConsole(content, sessionIdRef.current, action);
    } catch (error) {
      console.warn(`Failed to log console (${action}):`, error);
    }
  };

  // If a run is armed and the REPL prompt has returned (program finished),
  // save the console buffer (already capped at FIFO_SIZE, so this is
  // bounded). Checks the accumulated buffer rather than a single serial
  // chunk so a `>>> ` prompt split across reads is still detected.
  const maybeSaveRunConsole = () => {
    if (pendingRunSaveRef.current && bufferRef.current.endsWith('>>> ')) {
      pendingRunSaveRef.current = false;
      logConsoleSafe(bufferRef.current, 'run_device');
    }
  };

  const getConnectionErrorMessage = (error) => {
    // Use tRef so the once-created Board `onerror` callback still reports in
    // the currently selected language.
    const tr = tRef.current;
    const message = error?.message || tr('unknownSerialError');
    if (/WebUSB is not available/i.test(message)) {
      return tr('errWebUsbRequired');
    }
    if (/No device selected|no-device-selected/i.test(message)) {
      return tr('errNoMicrobitSelected');
    }
    if (/Bad response for 8 -> 17|reconnect-microbit/i.test(message) || /reconnect-microbit/i.test(error?.code || '')) {
      return tr('errUnstableWebUsb');
    }
    if (/WebUSB still unstable|WebUSB flashing link stayed unstable/i.test(message)) {
      return message;
    }
    if (/MicroPython install requires WebUSB access/i.test(message)) {
      return message;
    }
    if (/did not respond like a MicroPython REPL/i.test(message)) {
      return tr('errNotMicroPythonRepl');
    }
    if (/Failed to open serial port|NetworkError|busy|resource/i.test(message)) {
      return tr('errSerialPortBusy');
    }
    if (/No port selected by the user/i.test(message)) {
      return tr('errNoDeviceSelected');
    }
    return tr('errConnectionFailed').replace('{message}', message);
  };

  // Expose methods to parent via ref
  useImperativeHandle(ref, () => ({
    getCode: () => editorRef.current?.getCode() || currentCodeContent,
    getBuffer: () => buffer,
  }));

  // Update code editor when current code content changes (from session load or tab switch)
  useEffect(() => {
    if (!isLocalChangeRef.current && editorRef.current?.setCode) {
      editorRef.current.setCode(currentCodeContent);
    }
    isLocalChangeRef.current = false;
  }, [currentCodeContent]);

  // Disconnect the currently attached device when switching to a session whose
  // platform uses a different connection type (e.g. LilyBot/Pico → micro:bit),
  // OR whose connection type matches but whose postConnectFiles requirements
  // differ (e.g. plain micro:bit → Cutebot — we need to install the driver).
  useEffect(() => {
    if (!connected || !connectedBoard) return;
    const nextType = activePlatform?.connectionType;
    const nextId = activePlatform?.id || null;
    if (!nextType) return;

    const typeMismatch = nextType !== connectedBoard;
    const platformMismatch =
      !typeMismatch &&
      connectedPlatformId &&
      nextId &&
      nextId !== connectedPlatformId;

    if (!typeMismatch && !platformMismatch) return;

    const board = boardRef.current;
    if (!board) return;

    setStatusBanner({
      type: 'info',
      message: typeMismatch
        ? tRef.current('disconnectingPlatformChanged')
        : tRef.current('disconnectingSwitchingTo').replace('{label}', activePlatform.label),
    });
    logInteractionSafe('disconnect');
    logConsoleSafe(bufferRef.current, 'disconnect');
    board.disconnect().catch((error) => {
      console.error('Failed to auto-disconnect after platform switch:', error);
    });
  }, [activePlatform, connected, connectedBoard, connectedPlatformId]);

  // LEGO Education BLE lifecycle. While in lego mode, mirror the device
  // registry into local state and surface "any device connected" through the
  // same `connected`/status-banner channel the serial platforms use. On
  // leaving lego mode, disconnect every BLE device, kill the Pyodide worker
  // and dispose the lego terminal so serial platforms get a clean slate.
  useEffect(() => {
    if (!isLegoMode) return;

    const applyState = (next) => {
      setLegoConnectionState(next);
      const anyConnected = Object.values(next).some((devices) =>
        devices.some((device) => device.connected)
      );
      setConnected(anyConnected);
      setStatusBanner(
        anyConnected
          ? { type: 'success', message: tRef.current('legoEducationConnected') }
          : { type: 'info', message: tRef.current('notConnected') }
      );
    };

    applyState(legoGetConnectionState());
    const unsubscribe = legoSubscribe(applyState);

    return () => {
      unsubscribe();
      legoModeGenRef.current += 1;
      legoDisconnectAll().catch((error) => {
        console.warn('Failed to disconnect LEGO devices:', error);
      });
      try { terminatePyodide(); } catch (error) { console.warn(error); }
      legoRuntimePromiseRef.current = null;
      if (legoTerminalRef.current) {
        try { legoTerminalRef.current.dispose(); } catch { /* already gone */ }
        legoTerminalRef.current = null;
      }
      bufferRef.current = '';
      pendingRunSaveRef.current = false;
      setBuffer('');
      setConnected(false);
      setIsRunning(false);
    };
  }, [isLegoMode]);

  // ESP32 Arduino lifecycle: on leaving arduino mode, release the serial port
  // and dispose the terminal so other platforms get a clean slate. (Entering
  // the mode is lazy — the terminal mounts on the first connect.)
  useEffect(() => {
    if (!isArduinoMode) return;
    return () => {
      const session = arduinoSessionRef.current;
      if (session) {
        arduinoSessionRef.current = null;
        disconnectEsp32(session).catch((error) => {
          console.warn('Failed to disconnect ESP32:', error);
        });
      }
      if (arduinoTerminalRef.current) {
        try { arduinoTerminalRef.current.dispose(); } catch { /* already gone */ }
        arduinoTerminalRef.current = null;
      }
      arduinoIoRef.current = null;
      bufferRef.current = '';
      pendingRunSaveRef.current = false;
      setBuffer('');
      setConnected(false);
      setIsRunning(false);
    };
  }, [isArduinoMode]);

  const handleArduinoConnect = async () => {
    if (isConnecting || connected) return;
    setIsConnecting(true);
    void logInteractionSafe('connect_esp32_arduino');

    try {
      // Pick the port before any other await: on first use the terminal
      // factory downloads xterm from a CDN, and requestPort() must stay
      // inside the click's user-activation window.
      let port = await findAuthorizedEsp32SerialPort();
      if (!port) {
        setStatusBanner({ type: 'info', message: t('waitingEsp32Selection') });
        port = await navigator.serial.requestPort({ filters: ESP32_USB_FILTERS });
      }

      if (!arduinoTerminalRef.current) {
        const host = replContainerRef.current;
        if (!host) throw new Error('Terminal container is not mounted');
        arduinoTerminalRef.current = await createLegoTerminal(host);
      }
      const xterm = arduinoTerminalRef.current.terminal;

      // Everything the flasher/monitor prints is mirrored into the console
      // buffer so run logging, the console-content-changed event and "Add
      // Console to Chat" behave exactly like the serial path.
      const appendOutput = (text) => {
        bufferRef.current = (bufferRef.current + text).slice(-FIFO_SIZE);
        setBuffer(bufferRef.current);
      };
      const io = {
        write: (data) => { appendOutput(data); xterm.write(data); },
        writeln: (data) => { appendOutput(`${data}\n`); xterm.writeln(data); },
        clear: () => xterm.clear(),
      };
      arduinoIoRef.current = io;

      const session = await connectEsp32Arduino({ terminal: io, preselectedPort: port });
      arduinoSessionRef.current = session;
      setConnected(true);
      setConnectedPlatformId(activePlatform?.id || null);
      setStatusBanner({ type: 'success', message: tRef.current('esp32Connected') });
      io.write(`\r\n${tRef.current('esp32Connected')}\r\n`);
    } catch (error) {
      console.error('ESP32 connection failed:', error);
      setConnected(false);
      setConnectedPlatformId(null);
      const message = getConnectionErrorMessage(error);
      setStatusBanner({ type: 'error', message });
      arduinoIoRef.current?.write(`\r\n\x1b[31m${message}\x1b[0m\r\n`);
    } finally {
      setIsConnecting(false);
    }
  };

  // Arduino run path: compile the sketch on the Modal service, then flash the
  // binary over WebSerial; the monitor re-attaches afterwards and streams the
  // sketch's Serial output. Telemetry mirrors the serial path — snapshot +
  // interaction at dispatch, console tail once the flash settles.
  const handleArduinoRun = async () => {
    const session = arduinoSessionRef.current;
    const io = arduinoIoRef.current;
    if (!session || !connected || !io) return;
    if (arduinoFlashInFlightRef.current) return;
    arduinoFlashInFlightRef.current = true;
    setIsRunning(true);

    const codeToRun = editorRef.current?.getCode() || currentCodeContent;
    const startedAt = Date.now();
    try {
      await createSnapshot('run_device');
      await logInteractionSafe('run_device');

      io.write(`\r\n\x1b[36m${tRef.current('esp32Compiling')}\x1b[0m\r\n`);
      const compileResult = await compileSketch(codeToRun);

      io.write(`\x1b[36m${tRef.current('esp32Flashing')}\x1b[0m\r\n`);
      const xterm = arduinoTerminalRef.current?.terminal;
      await flashEsp32Binary(
        session,
        {
          merged: compileResult.merged,
          mergedOffset: compileResult.mergedOffset,
          app: compileResult.app,
          appOffset: compileResult.appOffset,
          partitionsHash: compileResult.partitionsHash,
          mode: 'auto',
        },
        (written, total) => {
          // Progress goes straight to the xterm (carriage-return updates would
          // spam the console buffer).
          const pct = Math.round((written / total) * 100);
          xterm?.write(`\rFlash: ${pct}% (${written}/${total})`);
        }
      );
      const seconds = ((Date.now() - startedAt) / 1000).toFixed(1);
      io.write(`\r\n\x1b[32mOK (${seconds}s)\x1b[0m\r\n`);
    } catch (error) {
      if (error instanceof Esp32CompileError) {
        io.write(`\r\n\x1b[31m${tRef.current('esp32CompileFailed')}\x1b[0m\r\n`);
        const details = error.stderr || error.message || '';
        if (details) {
          io.write(`\x1b[31m${String(details).replace(/\n/g, '\r\n')}\x1b[0m\r\n`);
        }
      } else {
        console.error('ESP32 flash failed:', error);
        io.write(`\r\n\x1b[31m${String(error?.message || error).replace(/\n/g, '\r\n')}\x1b[0m\r\n`);
      }
    } finally {
      arduinoFlashInFlightRef.current = false;
      setIsRunning(false);
      await logConsoleSafe(bufferRef.current, 'run_device');
    }
  };

  // Lazily mount the lego terminal and boot the Pyodide worker. Called on the
  // first successful device connect — NOT on platform switch — so the Pyodide
  // CDN download only happens for users who actually connect LEGO hardware.
  const ensureLegoRuntime = () => {
    if (legoRuntimePromiseRef.current) return legoRuntimePromiseRef.current;

    const generation = legoModeGenRef.current;
    const promise = (async () => {
      if (!legoTerminalRef.current) {
        const host = replContainerRef.current;
        if (!host) throw new Error('Terminal container is not mounted');
        const controller = await createLegoTerminal(host);
        if (generation !== legoModeGenRef.current) {
          try { controller.dispose(); } catch { /* already gone */ }
          return;
        }
        legoTerminalRef.current = controller;
      }

      // Mirror worker output into the console buffer so run logging, the
      // console-content-changed event and "Add Console to Chat" all behave
      // exactly like the serial path.
      const appendLegoOutput = (text) => {
        bufferRef.current = (bufferRef.current + text).slice(-FIFO_SIZE);
        setBuffer(bufferRef.current);
      };

      legoTerminalRef.current.write(`${tRef.current('legoLoadingPython')}\r\n`);
      await ensurePyodide({
        onStdout: (s) => {
          appendLegoOutput(s);
          legoTerminalRef.current?.write(s.replace(/\n/g, '\r\n'));
        },
        onStderr: (s) => {
          appendLegoOutput(s);
          legoTerminalRef.current?.write(`\x1b[31m${s.replace(/\n/g, '\r\n')}\x1b[0m`);
        },
      });
      if (generation !== legoModeGenRef.current) return;
      legoTerminalRef.current?.write(`\r\n${tRef.current('legoPythonReady')}\r\n`);
    })();

    legoRuntimePromiseRef.current = promise;
    promise.catch(() => {
      // Allow the next connect/run to retry a failed init.
      if (legoRuntimePromiseRef.current === promise) {
        legoRuntimePromiseRef.current = null;
      }
    });
    return promise;
  };

  // Kick off the BLE library fetch as soon as the picker opens so the actual
  // requestDevice() call inside connectDevice stays within the user gesture.
  const handleLegoPickerOpen = () => {
    void logInteractionSafe('open_lego_picker');
    preloadLegoLibrary();
  };

  const handleLegoDeviceConnect = async (kind, cardEmoji) => {
    void logInteractionSafe('connect_lego');
    const result = await legoConnectDevice(kind, cardEmoji);
    if (result?.ok) {
      ensureLegoRuntime().catch((error) => {
        console.error('[LEGO] Pyodide init failed:', error);
        const message = tRef.current('errConnectionFailed')
          .replace('{message}', error?.message || String(error));
        setStatusBanner({ type: 'error', message });
        legoTerminalRef.current?.write(`\r\n\x1b[31m${message}\x1b[0m\r\n`);
      });
    }
    return result;
  };

  const handleLegoDeviceRename = (kind, oldName, newName) => {
    void logInteractionSafe('rename_lego_device');
    return legoRenameDevice(kind, oldName, newName);
  };

  const handleLegoDeviceDisconnect = async (kind, name) => {
    void logInteractionSafe('disconnect');
    await legoDisconnectDevice(kind, name);
  };

  // Handle code changes in the editor (local state only, no database save)
  const handleCodeChange = (newCode) => {
    isLocalChangeRef.current = true;
    updateCurrentCodeContent(newCode);
  };

  // Initialize board on mount
  useEffect(() => {
    if (!boardRef.current) {
      boardRef.current = new Board({
        baudRate: 115200,
        dataType: 'string',
        onconnect: () => {
          console.log('Device connected');
          setIsConnecting(false);
          setConnected(true);
          setMode('repl');
          setStatusBanner({
            type: 'success',
            message: tRef.current('deviceConnectedRepl')
          });
        },
        ondisconnect: () => {
          console.log('Device disconnected');
          setIsConnecting(false);
          setConnected(false);
          setConnectedBoard(null);
          setConnectedPlatformId(null);
          setConnectPhase('idle');
          setMode('disconnected');
          bufferRef.current = '';
          pendingRunSaveRef.current = false;
          setBuffer('');
          setIsRunning(false);
          setStatusBanner({
            type: 'info',
            message: tRef.current('deviceDisconnected')
          });
        },
        onportselected: () => {
          setStatusBanner({
            type: 'info',
            message: tRef.current('attemptingToConnect')
          });
        },
        onerror: (error) => {
          console.error('Board error:', error);
          setIsConnecting(false);
          const message = getConnectionErrorMessage(error);
          setStatusBanner({
            type: 'error',
            message
          });
          const terminal = boardRef.current?.terminal;
          if (terminal) {
            terminal.write(`\r\n${message}\r\n`);
          }
        },
        ondata: (chunk) => {
          // Update buffer (FIFO). bufferRef is authoritative; state mirrors it.
          bufferRef.current = (bufferRef.current + chunk).slice(-FIFO_SIZE);
          setBuffer(bufferRef.current);

          // If a run was dispatched, a returned prompt means it finished — save
          // the console tail (checks the accumulated buffer, not just this chunk).
          maybeSaveRunConsole();

          // Check if execution finished (prompt appears)
          if (chunk.includes('>>> ')) {
            setTimeout(() => setIsRunning(false), 100);
          }
        },
        theme: {
          background: '#ffffff',
          foreground: '#000000'
        }
      });
    }
  }, []);

  // Notify other panels (e.g. ChatPanel's "Add Console to Chat" button) when the
  // console buffer gains or loses content. The buffer changes on connect (REPL
  // output arrives) and disconnect (buffer is cleared), neither of which
  // re-renders App/ChatPanel, so a window event is used to push the new state.
  const prevConsoleHasContentRef = useRef(false);
  useEffect(() => {
    const hasContent = buffer.trim().length > 0;
    if (hasContent !== prevConsoleHasContentRef.current) {
      prevConsoleHasContentRef.current = hasContent;
      window.dispatchEvent(
        new CustomEvent('console-content-changed', { detail: { hasContent } })
      );
    }
  }, [buffer]);

  // Resizable pane logic
  useEffect(() => {
    const resizer = resizerRef.current;
    const container = containerRef.current;
    if (!resizer || !container) return;

    let isDragging = false;

    const handleMouseDown = (e) => {
      e.preventDefault();
      isDragging = true;
      document.body.style.cursor = 'row-resize';
      document.body.style.userSelect = 'none';
    };

    const handleMouseMove = (e) => {
      if (!isDragging) return;
      const rect = container.getBoundingClientRect();
      const offsetY = e.clientY - rect.top;
      const percent = (offsetY / rect.height) * 100;
      container.style.gridTemplateRows = `${percent}% 5px auto`;
      
      // Resize the terminal to fit the new container size
      if (boardRef.current) {
        boardRef.current.resize();
      }
    };

    const handleMouseUp = () => {
      if (isDragging) {
        isDragging = false;
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      }
    };

    resizer.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      resizer.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, []);

  // Resize terminal when container size changes
  useEffect(() => {
    const terminalContainer = replContainerRef.current;
    if (!terminalContainer) return;

    const resizeObserver = new ResizeObserver(() => {
      if (boardRef.current) {
        boardRef.current.resize();
      }
    });

    resizeObserver.observe(terminalContainer);

    return () => {
      resizeObserver.disconnect();
    };
  }, []);

  const handleDisconnect = async () => {
    if (isArduinoMode) {
      const session = arduinoSessionRef.current;
      // Closing the port mid-flash would corrupt the write in progress.
      if (!session || isConnecting || arduinoFlashInFlightRef.current) return;
      setIsConnecting(true);
      try {
        setStatusBanner({ type: 'info', message: t('disconnecting') });
        await logInteractionSafe('disconnect');
        await logConsoleSafe(bufferRef.current, 'disconnect');
        arduinoSessionRef.current = null;
        await disconnectEsp32(session);
        setConnected(false);
        setConnectedPlatformId(null);
        setIsRunning(false);
        bufferRef.current = '';
        setBuffer('');
        setStatusBanner({ type: 'info', message: t('deviceDisconnected') });
        arduinoIoRef.current?.write(`\r\n${t('deviceDisconnected')}\r\n`);
      } finally {
        setIsConnecting(false);
      }
      return;
    }

    const board = boardRef.current;
    if (!board || isConnecting) return;

    setIsConnecting(true);
    try {
      if (!connected) return;
      setStatusBanner({
        type: 'info',
        message: t('disconnecting')
      });
      await logInteractionSafe('disconnect');
      await logConsoleSafe(bufferRef.current, 'disconnect');
      await board.disconnect();
    }
    finally {
      setIsConnecting(false);
    }
  };

  // Connect micro:bit via a linear state machine:
  //   idle → probing → (flashing → reconnecting →) probing → connected
  // No "arm + click again" step: flashing happens inline on the first click.
  const connectMicrobit = async (board) => {
    setConnectPhase('probing');
    setFlashProgress(undefined);
    setFlashMessage(t('flashMsgOpeningSerial'));

    // Step 1: Try serial, preferring an already-authorized port (no picker).
    const cachedPort = await findAuthorizedMicrobitSerialPort();
    if (!cachedPort) {
      setStatusBanner({
        type: 'info',
        message: t('waitingMicrobitSelection')
      });
    }

    try {
      await board.connect(replContainerRef.current, true, {
        boardType: 'microbit',
        serialPort: cachedPort || null,
      });
      setConnectedBoard('microbit');
      setConnectPhase('idle');
      return;
    } catch (error) {
      if (!looksLikeMissingMicroPython(error)) throw error;
      // Serial probe failed in a way consistent with no MicroPython installed.
      // Fall through to flash.
    }

    // Step 2: Open WebUSB + flash. This prompts the USB picker only if the
    // device is not already authorized.
    setConnectPhase('flashing');
    setFlashProgress(undefined);
    setFlashMessage(t('flashMsgOpeningWebUsb'));

    let installerSession = null;
    try {
      installerSession = await openMicrobitUsbLink({
        reuseExisting: true,
        onStatus: (message) => setFlashMessage(message),
      });

      await installerSession.flashBundledFirmware({
        onStatus: (message) => setFlashMessage(message),
        onProgress: (pct) => setFlashProgress(pct),
      });
    } finally {
      if (installerSession) {
        try { await installerSession.close(); } catch {}
      }
    }

    // Step 3: Wait for the board to re-enumerate as a serial device, then
    // reconnect silently using the cached grant.
    setConnectPhase('reconnecting');
    setFlashProgress(undefined);
    setFlashMessage(t('flashMsgReconnecting'));

    const reenumeratedPort = await waitForMicrobitSerialPort(8000);
    if (!reenumeratedPort) {
      throw new Error(t('errMicrobitNotReappear'));
    }

    setFlashMessage(t('flashMsgReconnectingRepl'));
    await board.connect(replContainerRef.current, true, {
      boardType: 'microbit',
      serialPort: reenumeratedPort,
    });
    setConnectedBoard('microbit');
    setConnectPhase('idle');
  };

  const connectPico = async (board) => {
    setStatusBanner({
      type: 'info',
      message: t('waitingPicoSelection')
    });
    await board.connect(replContainerRef.current, true, { boardType: 'pico' });
    await board.interrupt(150);
    if (activePlatform?.stopCode) {
      // paste, not eval — eval strips the trailing newline that closes the
      // for-block, so the stop loop never actually runs and pins stay high.
      await board.paste(activePlatform.stopCode, { hidden: true });
    }
    setConnectedBoard('pico');
  };

  const connectEsp32 = async (board) => {
    setStatusBanner({
      type: 'info',
      message: t('waitingEsp32Selection')
    });
    await board.connect(replContainerRef.current, true, { boardType: 'esp32' });
    await board.interrupt(150);
    if (activePlatform?.stopCode) {
      await board.paste(activePlatform.stopCode, { hidden: true });
    }
    setConnectedBoard('esp32');
  };

  const connectSpike = async (board) => {
    setStatusBanner({
      type: 'info',
      message: t('waitingSpikeSelection')
    });
    await board.connect(replContainerRef.current, true, { boardType: 'spike' });
    await board.interrupt(150);
    if (activePlatform?.stopCode) {
      await board.paste(activePlatform.stopCode, { hidden: true });
    }
    setConnectedBoard('spike');
    setMode('repl');
  };

  const handleConnect = async (targetBoard) => {
    const board = boardRef.current;
    if (!board || isConnecting || connected) return;

    setIsConnecting(true);
    void logInteractionSafe(`connect_${targetBoard}`);

    try {
      if (targetBoard === 'microbit') {
        await connectMicrobit(board);
        // Interrupt any running program after successful micro:bit connect.
        await board.interrupt(150);
        // Stop any platform-specific hardware (e.g. Cutebot motors). No-op for
        // plain micro:bit since its stopCode is empty.
        if (activePlatform?.stopCode) {
          try {
            await board.paste(activePlatform.stopCode, { hidden: true });
          } catch (error) {
            console.error('Failed to run platform stop code on connect:', error);
          }
        }
        // Install any platform-required files (e.g. cutebot.py). Skips the
        // upload when the file already exists with the expected size.
        try {
          await applyPostConnectFiles(board, activePlatform);
        } catch (error) {
          console.error('Post-connect file install failed:', error);
          setStatusBanner({
            type: 'error',
            message: t('errInstallDriverMicrobit').replace('{label}', error?.label || t('driver')),
          });
        }
      } else if (targetBoard === 'esp32') {
        await connectEsp32(board);
        try {
          await applyPostConnectFiles(board, activePlatform);
        } catch (error) {
          console.error('Post-connect file install failed:', error);
          setStatusBanner({
            type: 'error',
            message: t('errInstallDriverDevice').replace('{label}', error?.label || t('driver')),
          });
        }
      } else if (targetBoard === 'spike') {
        await connectSpike(board);
      } else {
        await connectPico(board);
      }
      setConnectedPlatformId(activePlatform?.id || null);
    } catch (error) {
      console.error('Connection failed:', error);
      setConnected(false);
      setConnectedBoard(null);
      setConnectedPlatformId(null);
      setMode('disconnected');
      setIsRunning(false);
      const message = getConnectionErrorMessage(error);
      setStatusBanner({ type: 'error', message });
      const terminal = board.terminal;
      if (terminal) terminal.write(`\r\n${message}\r\n`);
    } finally {
      setConnectPhase('idle');
      setFlashProgress(undefined);
      setFlashMessage('');
      setIsConnecting(false);
    }
  };

  // Interrupt the running program and run the platform's stop code. No guard —
  // callers that hold `operationInFlightRef` reuse this without re-entering it.
  const stopRunningCode = async () => {
    const board = boardRef.current;
    if (!board || !connected) return;

    setIsRunning(false);
    await board.interrupt();
    await new Promise(resolve => setTimeout(resolve, 100));

    if (activePlatform?.stopCode) {
      try {
        await board.paste(activePlatform.stopCode, { hidden: true });
      } catch (error) {
        console.error('Failed to run platform stop code:', error);
      }
    }
  };

  // LEGO run path: dispatch the code to the Pyodide worker instead of pasting
  // over serial. Telemetry mirrors the serial path — snapshot + interaction at
  // dispatch, console tail once the program finishes. No operationInFlightRef
  // here: that lock protects the serial paste handshake, and holding it across
  // the whole (possibly long) Python run would block the Stop button.
  const handleLegoRun = async () => {
    if (!connected) return;
    const codeToRun = editorRef.current?.getCode() || currentCodeContent;

    await createSnapshot('run_device');
    await logInteractionSafe('run_device');

    if (!isPyodideReady()) {
      legoTerminalRef.current?.write(`\r\n\x1b[33m${tRef.current('legoLoadingPython')}\x1b[0m\r\n`);
      // A failed init leaves the promise cleared — retry it here.
      ensureLegoRuntime().catch(() => {});
      return;
    }

    setIsRunning(true);
    try {
      legoTerminalRef.current?.write('\r\n>>> run\r\n');
      await runPython(codeToRun);
    } catch (error) {
      // KeyboardInterrupt is expected when the user presses Stop — it's how
      // the script unwinds. Don't surface it as a failure. ("Programmet blev
      // stoppet" is the bridge's message when an RPC is rejected mid-stop.)
      const msg = String(error?.message || error);
      if (msg.includes('KeyboardInterrupt') || msg.includes('Programmet blev stoppet')) {
        legoTerminalRef.current?.write('\r\n\x1b[33m[stopped]\x1b[0m\r\n');
      } else {
        console.error('Pyodide run failed:', error);
        legoTerminalRef.current?.write(`\r\n\x1b[31m${msg.replace(/\n/g, '\r\n')}\x1b[0m\r\n`);
      }
    } finally {
      setIsRunning(false);
      await logConsoleSafe(bufferRef.current, 'run_device');
    }
  };

  const handleRun = async () => {
    if (isArduinoMode) {
      await handleArduinoRun();
      return;
    }
    if (isLegoMode) {
      await handleLegoRun();
      return;
    }

    const board = boardRef.current;
    if (!board || !connected) return;
    if (operationInFlightRef.current) return;
    operationInFlightRef.current = true;

    try {
      const codeToRun = editorRef.current?.getCode() || currentCodeContent;

      await createSnapshot('run_device');
      await logInteractionSafe('run_device');

      if (isRunning) {
        await stopRunningCode();
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      setIsRunning(true);
      try {
        await board.paste(codeToRun, { hidden: false });
        // Code is now fully sent (paste-mode echoes are done). Arm the save so
        // the returning `>>> ` prompt — the program finishing — saves the console.
        pendingRunSaveRef.current = true;
        board.terminal?.focus();
        // Backstop: a fast program may have already printed its prompt before
        // the next ondata fires; re-check shortly after arming.
        setTimeout(maybeSaveRunConsole, 200);
      } catch (error) {
        console.error('Run failed:', error);
        setIsRunning(false);
      }
    } finally {
      operationInFlightRef.current = false;
    }
  };

  const handleCtrlC = async () => {
    // Arduino has no Stop button (a sketch can't be interrupted — see
    // ControlPanel); guard against stray calls reaching the serial path,
    // where `connected` is true but the serial Board isn't attached.
    if (isArduinoMode) return;
    if (isLegoMode) {
      await logInteractionSafe('send_ctrl_c');
      setIsRunning(false);
      // Freeze the bridge FIRST so the Python worker can no longer issue
      // device commands — any in-flight RPC fails immediately, and any
      // subsequent motor_run gets rejected on arrival instead of racing
      // ahead of our motor_stop below.
      try { freezeBridge(); } catch (e) { console.warn(e); }
      // Raise KeyboardInterrupt so the script unwinds instead of
      // continuing to issue (now-failing) commands.
      try { interruptPython(); } catch (e) { console.warn(e); }
      // Halt motors directly from the main thread — this BLE call is
      // not routed through the paused bridge.
      try { await legoStopAllMotion(); } catch (e) { console.warn(e); }
      // Send stop a second time once any late GATT writes have drained,
      // in case the firmware received a motor_run after our first stop.
      setTimeout(() => { legoStopAllMotion().catch(() => {}); }, 150);
      legoTerminalRef.current?.write('\r\n\x1b[33m[stop]\x1b[0m\r\n');
      return;
    }

    const board = boardRef.current;
    if (!board || !connected) return;
    if (operationInFlightRef.current) return;
    operationInFlightRef.current = true;

    try {
      await logInteractionSafe('send_ctrl_c');
      await stopRunningCode();
    } finally {
      operationInFlightRef.current = false;
    }
  };

  const handleReset = async () => {
    if (isArduinoMode) {
      const session = arduinoSessionRef.current;
      // Never reset mid-flash — it would corrupt the write in progress.
      if (!session || !connected || arduinoFlashInFlightRef.current) return;
      await logInteractionSafe('reset_device');
      await logConsoleSafe(bufferRef.current, 'reset_device');
      setIsRunning(false);
      arduinoIoRef.current?.write('\r\n\x1b[33m[reset]\x1b[0m\r\n');
      try {
        // Hard-reset via esptool-js — the flashed sketch restarts from setup().
        await resetEsp32(session);
      } catch (error) {
        console.warn('ESP32 reset failed:', error);
      }
      return;
    }

    const board = boardRef.current;
    if (!board || !connected) return;

    await logInteractionSafe('reset_device');
    await logConsoleSafe(bufferRef.current, 'reset_device');

    // We've saved the console here; don't let the reset's own `>>> ` prompt
    // trigger a duplicate run_device save.
    pendingRunSaveRef.current = false;
    setIsRunning(false);
    await board.reset();
    await new Promise(resolve => setTimeout(resolve, 1000));
    await board.interrupt();
    setMode('repl');
    board.terminal?.focus();
  };

  const handleClear = async () => {
    // Log interaction and console before clearing
    await logInteractionSafe('clear_console');
    await logConsoleSafe(bufferRef.current, 'clear_console');

    if (boardRef.current?.terminal) {
      boardRef.current.terminal.clear();
    }
    legoTerminalRef.current?.clear();
    arduinoTerminalRef.current?.clear();
    bufferRef.current = '';
    setBuffer('');
  };

  const handleSaveToMain = async () => {
    const board = boardRef.current;
    if (!board || !connected) {
      alert(t('cannotSaveToMainPyDevice'));
      return;
    }

    const codeToSave = editorRef.current?.getCode() || currentCodeContent;

    // Create snapshot before saving to main.py
    await createSnapshot('save_to_main_py');

    // Log interaction before saving to main.py
    await logInteractionSafe('save_to_main_py');

    try {
      if (connectedBoard === 'esp32') {
        // ESP32 raw REPL mode times out on board.upload() — use chunked paste-mode
        // writes instead (same mechanism as postConnectFiles / cutebot driver install).
        await uploadFileToMicrobit(board, 'main.py', codeToSave, { label: 'main.py' });
      } else {
        await board.upload('main.py', codeToSave);
      }
      await board.reset();
      setMode('repl');
      board.terminal?.focus();
    } catch (error) {
      console.error('Failed to save to main.py:', error);
      alert(`${t('failedToSaveMainPy')}${error.message}`);
    }
  };

  // SPIKE Prime: leave Program Slot mode and go back to an interactive REPL.
  const handleEnterReplMode = async () => {
    const board = boardRef.current;
    if (!board || !connected) return;

    await logInteractionSafe('switch_to_repl_mode');
    await board.interrupt(150);
    setMode('repl');
    board.terminal?.focus();
  };

  // SPIKE Prime: reset the hub into whichever program slot it's set to run,
  // leaving the REPL (so Run/Stop no longer apply until back in REPL mode).
  const handleEnterProgramSlotMode = async () => {
    const board = boardRef.current;
    if (!board || !connected) return;

    await logInteractionSafe('switch_to_program_slot_mode');
    setIsRunning(false);
    await board.reset();
    setMode('program-slot');
    board.terminal?.focus();
  };

  // SPIKE Prime: write the current code as /flash/program/<slot>/program.py so
  // it runs autonomously on the hub, untethered from the browser.
  const handleSaveToSlot = async () => {
    const board = boardRef.current;
    if (!board || !connected) {
      alert(t('cannotSaveToSlotDevice'));
      return;
    }

    const codeToSave = editorRef.current?.getCode() || currentCodeContent;

    await createSnapshot(`save_to_slot_${selectedSlot}`);
    await logInteractionSafe(`save_to_slot_${selectedSlot}`);

    const slotStr = String(selectedSlot).padStart(2, '0');
    const escapedCode = JSON.stringify(codeToSave);

    const script = `
import os
import sys

slot_dir_name = "${slotStr}"
code_to_write = ${escapedCode}
program_dir = "program"
target_file = "program.py"

# Ensure we are in the root directory
if (not os.getcwd() == '/flash'):
    os.chdir('/flash')

# Check for 'program' directory, create if it doesn't exist
if program_dir not in os.listdir():
    os.mkdir(program_dir)
os.chdir(program_dir)

# Check for the specific slot directory, create if it doesn't exist
if slot_dir_name not in os.listdir():
    os.mkdir(slot_dir_name)
os.chdir(slot_dir_name)

# Clean up old program files to ensure our .py file runs
for filename in ['program.mpy', 'program.py']:
    try:
        os.remove(filename)
    except OSError:
        pass # File didn't exist, which is fine

# Write the new program file in chunks of chunk_size characters
with open(target_file, "w") as f:
    f.write(code_to_write)

# Try to return to the root directory
os.chdir('/flash')
`;

    try {
      await board.paste(script, { hidden: false });
      await board.reset();
      setMode('program-slot');
      board.terminal?.focus();
    } catch (error) {
      console.error('Failed to save to slot:', error);
      alert(`${t('failedToSaveToSlot')}${error.message}`);
    }
  };

  const handleClearMain = async () => {
    const board = boardRef.current;
    if (!board || !connected || connectedBoard !== 'esp32') {
      alert(t('cannotClearMainPy'));
      return;
    }
    if (operationInFlightRef.current) return;
    operationInFlightRef.current = true;

    try {
      await logInteractionSafe('clear_main_esp32');

      setIsRunning(false);
      await board.interrupt();
      await new Promise(resolve => setTimeout(resolve, 100));

      try {
        await board.runStatement('import os');
        await board.runStatement("os.remove('main.py') if 'main.py' in os.listdir() else None");
        await board.reset();
        setMode('repl');
        board.terminal?.focus();
      } catch (error) {
        console.error('Failed to clear main.py from ESP32:', error);
        alert(`${t('failedToClearMainPy')}${error.message}`);
      }
    } finally {
      operationInFlightRef.current = false;
    }
  };

  const handleClearDownload = async () => {
    const board = boardRef.current;
    if (!board || !connected || connectedBoard !== 'microbit') {
      alert(t('cannotClearDownload'));
      return;
    }
    if (operationInFlightRef.current) return;
    operationInFlightRef.current = true;

    try {
      await logInteractionSafe('clear_download_microbit');

      setIsRunning(false);
      await board.interrupt();
      await new Promise(resolve => setTimeout(resolve, 100));

      try {
        await board.runStatement('import os');
        await board.runStatement("os.remove('main.py') if 'main.py' in os.listdir() else None");
        await board.reset();
        setMode('repl');
        board.terminal?.focus();
      } catch (error) {
        console.error('Failed to clear download from micro:bit:', error);
        alert(`${t('failedToClearDownload')}${error.message}`);
      }
    } finally {
      operationInFlightRef.current = false;
    }
  };

  const handleDownload = async () => {
    const board = boardRef.current;
    if (!board || !connected || connectedBoard !== 'microbit') {
      alert(t('cannotDownload'));
      return;
    }
    if (operationInFlightRef.current) return;
    operationInFlightRef.current = true;

    try {
      const codeToSave = editorRef.current?.getCode() || currentCodeContent;

      await createSnapshot('download_to_microbit');
      await logInteractionSafe('download_to_microbit');

      // Free the REPL prompt before paste-mode writes.
      setIsRunning(false);
      await board.interrupt();
      await new Promise(resolve => setTimeout(resolve, 100));

      try {
        await uploadFileToMicrobit(board, 'main.py', codeToSave, { label: 'main.py' });
        await board.reset();
        setMode('repl');
        board.terminal?.focus();
      } catch (error) {
        console.error('Failed to download to micro:bit:', error);
        alert(`${t('failedToDownload')}${error.message}`);
      }
    } finally {
      operationInFlightRef.current = false;
    }
  };

  return (
    <div className="spike-editor">
      <FlashProgressModal
        open={connectPhase === 'flashing' || connectPhase === 'reconnecting'}
        phase={connectPhase}
        progress={flashProgress}
        message={flashMessage}
      />
      <CodeTabs
        codeRecords={codeRecords}
        currentCodeId={currentCodeId}
        onSwitchCode={switchCode}
        onCreateCode={createNewCode}
        onRenameCode={updateCodeName}
      />
      <div className="parent" ref={containerRef}>
        <div className="child top-child">
          <div className="editor-wrapper">
            <CodeEditor
              ref={editorRef}
              initialCode={currentCodeContent}
              onChange={handleCodeChange}
              language={activePlatform?.editorLanguage || 'python'}
            />
          </div>
        </div>

        <div className="resizer" ref={resizerRef}></div>

        <div className="child bottom-child">
          <div className="status-and-control-row">
            <ControlPanel
              connected={connected}
              connectedBoard={connectedBoard}
              platformConnectionType={activePlatform?.connectionType}
              isConnecting={isConnecting}
              onConnectMicrobit={() => handleConnect('microbit')}
              onConnectPico={() => handleConnect('pico')}
              onConnectEsp32={() => handleConnect('esp32')}
              onConnectEsp32Arduino={handleArduinoConnect}
              onConnectSpike={() => handleConnect('spike')}
              onDisconnect={handleDisconnect}
              onRun={handleRun}
              onCtrlC={handleCtrlC}
              onReset={handleReset}
              onClear={handleClear}
              onSaveToMain={handleSaveToMain}
              onDownload={handleDownload}
              onClearDownload={handleClearDownload}
              onClearMain={handleClearMain}
              mode={mode}
              selectedSlot={selectedSlot}
              onSlotChange={setSelectedSlot}
              onEnterReplMode={handleEnterReplMode}
              onEnterProgramSlotMode={handleEnterProgramSlotMode}
              onSaveToSlot={handleSaveToSlot}
              legoConnectionState={legoConnectionState}
              onLegoPickerOpen={handleLegoPickerOpen}
              onLegoConnectDevice={handleLegoDeviceConnect}
              onLegoRenameDevice={handleLegoDeviceRename}
              onLegoDisconnectDevice={handleLegoDeviceDisconnect}
            />
            {!connected && (
              <div className={`status-banner ${statusBanner.type}`}>
                {statusBanner.message}
              </div>
            )}
          </div>
          <div className="terminal-wrapper" ref={replContainerRef}>
            {/* The micro_repl Board will render the xterm terminal here */}
          </div>
        </div>
      </div>
    </div>
  );
});

SPIKEEditor.displayName = 'SPIKEEditor';

export default SPIKEEditor;

