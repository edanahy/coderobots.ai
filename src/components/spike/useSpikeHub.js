/**
 * SPIKE Prime connection state for SPIKEEditor.
 *
 * Two transports, two interaction models:
 *   - USB (WebSerial, via the shared microRepl Board): starts in the
 *     MicroPython REPL; "Slot mode" soft-reboots the hub into Hub OS and
 *     switches the port to the LEGO protocol.
 *   - Bluetooth (Web Bluetooth): Hub OS / LEGO protocol only — no REPL.
 *
 * In Hub OS (USB slot mode or BLE) everything goes through SpikeHubClient:
 * download to a slot, start/stop, decoded console output, sensor streaming.
 * The REPL side (Run/Stop/Reset) stays in SPIKEEditor; this hook adds
 * "Save as Library" there.
 */

import { useEffect, useRef, useState } from 'react';
import { SpikeHubClient } from '../../utils/spike/hubClient.js';
import { createBoardTransport } from '../../utils/spike/boardTransport.js';
import {
  isWebBluetoothAvailable,
  openSpikeBleTransport,
  requestSpikeBleDevice,
} from '../../utils/spike/bleTransport.js';
import { listLibraries, saveLibrary } from '../../utils/spike/replLibrary.js';
import { RUN_OUTPUT_LIMIT, SPIKE_RUN, runEndEvent } from '../../utils/spike/runLog.js';
import { createLegoTerminal } from '../../utils/legoEducation/legoTerminal.js';

// Sensor panel open: fast updates. Closed: a slow heartbeat so the battery
// level in the status chip stays current.
const SENSOR_INTERVAL_MS = 200;
const HEARTBEAT_INTERVAL_MS = 5000;

const SLOT_STORAGE_KEY = 'coderobots_spike_slot';
const SLOT_COUNT = 20;

// The hub confirms a start/stop we requested within milliseconds; a program
// start/stop notification with no request of ours in this window came from
// the hub itself (its button, or the program finishing).
const APP_ACTION_WINDOW_MS = 5000;

// Match the USB (microRepl Board) terminal's light theme set in SPIKEEditor.
const BLE_TERMINAL_THEME = {
  background: '#ffffff',
  foreground: '#000000',
  cursor: '#000000',
  selectionBackground: '#000000',
  selectionForeground: '#ffffff',
};

const color = (code) => (text) => `\x1b[${code}m${text}\x1b[0m`;
const cyan = color(36);
const green = color(32);
const red = color(31);
const dim = color(90);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function readStoredSlot() {
  try {
    const value = Number(localStorage.getItem(SLOT_STORAGE_KEY));
    return Number.isInteger(value) && value >= 0 && value < SLOT_COUNT ? value : 0;
  } catch {
    return 0;
  }
}

const formatBytes = (n) => (n < 1024 ? `${n} B` : `${(n / 1024).toFixed(1)} KB`);

/**
 * @param {object} options — read through a ref, so callbacks always see the
 *   latest values: enabled, boardRef, terminalHostRef, tRef,
 *   operationInFlightRef, appendOutput(text), setConnected, setStatusBanner,
 *   onReplRunReset(), onDisconnected(), logInteraction(name),
 *   logConsole(content, source), getConsole(), createSnapshot(source),
 *   getCode(), stopCode
 */
export default function useSpikeHub(options) {
  const optionsRef = useRef(options);
  useEffect(() => {
    optionsRef.current = options;
  });
  const opt = () => optionsRef.current;
  const t = (key) => opt().tRef.current(key);

  const [transport, setTransport] = useState(null); // null | 'usb' | 'ble'
  const [mode, setMode] = useState('repl'); // 'repl' | 'hub'
  const [busy, setBusy] = useState(null); // null | 'connecting' | 'switching' | 'uploading'
  const [hubName, setHubName] = useState('');
  const [hubRunning, setHubRunning] = useState(false);
  const [deviceState, setDeviceState] = useState(null);
  const [sensorsOpen, setSensorsOpen] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(null);
  const [slot, setSlotState] = useState(readStoredSlot);
  const [library, setLibrary] = useState({ open: false, existing: null, saving: false, error: '' });

  // Mirrors for callbacks that outlive a render (client/BLE/Board events).
  const transportRef = useRef(null);
  const modeRef = useRef('repl');
  const busyRef = useRef(null);
  const hubRunningRef = useRef(false);
  const sensorsOpenRef = useRef(false);
  const clientRef = useRef(null);
  const linkRef = useRef(null); // protocol transport: board-backed (USB) or BLE
  const bleTerminalRef = useRef(null);
  const atLineStartRef = useRef(true);
  const bleDisconnectedRef = useRef(() => {});
  // Run logging (Hub OS): when we last asked the hub to start/stop a program,
  // and the output of the current run (for error detection).
  const appStartAtRef = useRef(0);
  const appStopAtRef = useRef(0);
  const runOutputRef = useRef('');
  // Set before we close the BLE link ourselves, so the disconnect handler can
  // tell a manual disconnect from a lost connection.
  const bleClosingRef = useRef(false);

  const setTransportBoth = (value) => { transportRef.current = value; setTransport(value); };
  const setModeBoth = (value) => { modeRef.current = value; setMode(value); };
  const setBusyBoth = (value) => { busyRef.current = value; setBusy(value); };
  const setHubRunningBoth = (value) => { hubRunningRef.current = value; setHubRunning(value); };

  const setSlot = (value) => {
    setSlotState(value);
    try { localStorage.setItem(SLOT_STORAGE_KEY, String(value)); } catch { /* storage unavailable */ }
  };

  // --- terminal output -----------------------------------------------------

  const writeTerminal = (text) => {
    if (transportRef.current === 'ble') bleTerminalRef.current?.write(text);
    else opt().boardRef.current?.terminal?.write(text);
  };

  // Text that is part of the console record (hub output and our notices).
  const emit = (text) => {
    if (!text) return;
    opt().appendOutput(text);
    writeTerminal(text);
    atLineStartRef.current = /[\r\n]$/.test(text);
  };

  const emitLine = (text) => emit(`${atLineStartRef.current ? '' : '\r\n'}${text}\r\n`);

  const disposeBleTerminal = () => {
    if (!bleTerminalRef.current) return;
    try { bleTerminalRef.current.dispose(); } catch { /* already gone */ }
    bleTerminalRef.current = null;
  };

  // --- protocol client -----------------------------------------------------

  const requestedRecently = (ref) => Date.now() - ref.current < APP_ACTION_WINDOW_MS;

  // Every Hub OS program start/stop the hub reports is logged — including
  // ones started with the hub's own button — so "download once, run many
  // times" shows up as repeated spike_run_started_hub events.
  const handleProgramFlow = (running) => {
    setHubRunningBoth(running);
    emitLine(dim(running ? t('spikeProgramStarted') : t('spikeProgramEnded')));
    if (running) {
      const byApp = requestedRecently(appStartAtRef);
      appStartAtRef.current = 0;
      runOutputRef.current = '';
      void opt().logInteraction(byApp ? SPIKE_RUN.STARTED_APP : SPIKE_RUN.STARTED_HUB);
      return;
    }
    const stopped = requestedRecently(appStopAtRef);
    appStopAtRef.current = 0;
    void opt().logInteraction(runEndEvent({ stopped, output: runOutputRef.current }));
    runOutputRef.current = '';
    // A program ending is the Hub OS equivalent of the REPL prompt returning.
    opt().logConsole(opt().getConsole(), 'run_device');
  };

  const handleHubConsole = (text) => {
    if (hubRunningRef.current) {
      runOutputRef.current = (runOutputRef.current + text).slice(-RUN_OUTPUT_LIMIT);
    }
    emit(text);
  };

  const startClient = async (link) => {
    const client = new SpikeHubClient(link, {
      onConsole: handleHubConsole,
      onProgramFlow: handleProgramFlow,
      onDevice: setDeviceState,
    });
    clientRef.current = client;
    await client.handshake();
    try {
      setHubName(await client.getHubName());
    } catch (error) {
      console.warn('[SPIKE] could not read hub name:', error);
    }
    return client;
  };

  const detachClient = () => {
    clientRef.current?.dispose();
    clientRef.current = null;
    setHubRunningBoth(false);
    setDeviceState(null);
    setUploadProgress(null);
  };

  // Keep streaming in step with the sensor panel whenever a client is live.
  useEffect(() => {
    sensorsOpenRef.current = sensorsOpen;
    const client = clientRef.current;
    if (!client || mode !== 'hub') return;
    client
      .setDeviceNotifications(sensorsOpen ? SENSOR_INTERVAL_MS : HEARTBEAT_INTERVAL_MS)
      .catch((error) => console.warn('[SPIKE] could not change sensor streaming:', error));
  }, [sensorsOpen, mode]);

  // --- USB -----------------------------------------------------------------

  // Called by SPIKEEditor once the Board has connected in REPL mode.
  const handleUsbConnected = () => {
    setTransportBoth('usb');
    setModeBoth('repl');
    atLineStartRef.current = false;
  };

  // Called from the Board's ondisconnect (manual disconnect, unplug, hub off).
  const handleUsbDisconnected = () => {
    if (transportRef.current !== 'usb') return;
    detachClient();
    linkRef.current?.close();
    linkRef.current = null;
    setTransportBoth(null);
    setModeBoth('repl');
    setBusyBoth(null);
    setHubName('');
  };

  // Before closing the port from slot mode: stop the hub streaming into it.
  const prepareUsbDisconnect = async () => {
    if (transportRef.current !== 'usb' || modeRef.current !== 'hub') return;
    try { await clientRef.current?.setDeviceNotifications(0); } catch { /* closing anyway */ }
    detachClient();
    linkRef.current?.close();
    linkRef.current = null;
  };

  // REPL → Hub OS: soft reboot (Ctrl-D), then speak the protocol on the port.
  const enterSlotMode = async () => {
    const board = opt().boardRef.current;
    if (transportRef.current !== 'usb' || modeRef.current !== 'repl' || busyRef.current) return;
    if (!board?.connected || opt().operationInFlightRef.current) return;
    opt().operationInFlightRef.current = true;
    setBusyBoth('switching');
    void opt().logInteraction('switch_to_program_slot_mode');
    opt().onReplRunReset();

    try {
      await board.interrupt(150); // stop anything running in the REPL first
      const link = createBoardTransport(board, { onText: emit });
      linkRef.current = link;
      link.expectRebootBanner();
      emitLine(cyan(t('spikeEnteringSlotMode')));
      await board.writeBytes(Uint8Array.of(0x04));
      await startClient(link);
      setModeBoth('hub');
      emitLine(cyan(t('spikeSlotModeReady')));
    } catch (error) {
      console.error('[SPIKE] entering slot mode failed:', error);
      void opt().logInteraction('spike_slot_mode_failed');
      detachClient();
      linkRef.current?.close();
      linkRef.current = null;
      emitLine(red(t('spikeSlotModeFailed').replace('{message}', error?.message || String(error))));
      // Fall back to the REPL rather than leaving the port half-switched.
      try {
        await board.interrupt(150);
        await board.waitForPrompt();
      } catch { /* the Board reports its own errors */ }
      setModeBoth('repl');
    } finally {
      setBusyBoth(null);
      opt().operationInFlightRef.current = false;
    }
  };

  // Hub OS → REPL: Ctrl-C drops the hub out of Hub OS into MicroPython.
  const enterReplMode = async () => {
    const board = opt().boardRef.current;
    if (transportRef.current !== 'usb' || modeRef.current !== 'hub' || busyRef.current) return;
    if (!board?.connected) return;
    opt().operationInFlightRef.current = true;
    setBusyBoth('switching');
    void opt().logInteraction('switch_to_repl_mode');

    try {
      // Ctrl-C below kills a running slot program without a stop
      // notification (the client is detached first), so close the run here.
      if (hubRunningRef.current) {
        void opt().logInteraction(SPIKE_RUN.STOPPED);
        void opt().logConsole(opt().getConsole(), 'run_device');
      }
      try { await clientRef.current?.setDeviceNotifications(0); } catch { /* leaving anyway */ }
      detachClient();
      linkRef.current?.close();
      linkRef.current = null;
      await board.interrupt(150);
      await board.waitForPrompt();
      const { stopCode } = opt();
      if (stopCode) await board.paste(stopCode, { hidden: true });
      setModeBoth('repl');
      atLineStartRef.current = false; // the Board wrote the banner, not emit()
      emitLine(cyan(t('spikeReplModeReady')));
      // The REPL banner can land inside the hidden steps above (e.g. when a
      // program was still running), so ask for a visible prompt.
      await board.write('\r');
      atLineStartRef.current = false;
      board.terminal?.focus();
    } catch (error) {
      console.error('[SPIKE] entering REPL mode failed:', error);
      emitLine(red(error?.message || String(error)));
    } finally {
      setBusyBoth(null);
      opt().operationInFlightRef.current = false;
    }
  };

  // --- Bluetooth -----------------------------------------------------------

  const connectBle = async () => {
    const { setStatusBanner } = opt();
    if (!isWebBluetoothAvailable()) {
      setStatusBanner({ type: 'error', message: t('errWebBluetoothUnavailable') });
      return;
    }
    if (busyRef.current || transportRef.current) return;
    setBusyBoth('connecting');
    void opt().logInteraction('connect_spike_ble');

    // requestDevice() must be the first await to keep the click's user
    // activation (xterm's CDN download happens only after it).
    let device;
    try {
      setStatusBanner({ type: 'info', message: t('spikeBleChooseHub') });
      device = await requestSpikeBleDevice();
    } catch (error) {
      setBusyBoth(null);
      void opt().logInteraction('spike_connect_failed_ble'); // includes a cancelled picker
      setStatusBanner(error?.name === 'NotFoundError'
        ? { type: 'info', message: t('errNoDeviceSelected') }
        : { type: 'error', message: t('errConnectionFailed').replace('{message}', error?.message || String(error)) });
      return;
    }

    let link = null;
    try {
      setStatusBanner({ type: 'info', message: t('spikeBleConnecting').replace('{name}', device.name || 'SPIKE Prime') });
      link = await openSpikeBleTransport(device, { onDisconnect: () => bleDisconnectedRef.current() });
      linkRef.current = link;
      transportRef.current = 'ble';
      if (!bleTerminalRef.current) {
        bleTerminalRef.current = await createLegoTerminal(opt().terminalHostRef.current, {
          theme: BLE_TERMINAL_THEME,
        });
      }
      await startClient(link);
      setTransportBoth('ble');
      setModeBoth('hub');
      opt().setConnected(true);
      void opt().logInteraction('spike_connected_ble');
      atLineStartRef.current = true;
      emitLine(cyan(t('spikeBleConnected').replace('{name}', device.name || 'SPIKE Prime')));
    } catch (error) {
      console.error('[SPIKE] Bluetooth connection failed:', error);
      void opt().logInteraction('spike_connect_failed_ble');
      detachClient();
      transportRef.current = null;
      linkRef.current = null;
      try { await link?.close(); } catch { /* already closed */ }
      disposeBleTerminal();
      setTransportBoth(null);
      setStatusBanner({
        type: 'error',
        message: t('errConnectionFailed').replace('{message}', error?.message || String(error)),
      });
    } finally {
      setBusyBoth(null);
    }
  };

  // Hub switched off, out of range, or our own disconnect.
  const handleBleDisconnected = () => {
    if (transportRef.current !== 'ble') return;
    if (!bleClosingRef.current) {
      // Not initiated in the app: capture the console before it's cleared.
      void opt().logInteraction('spike_connection_lost_ble');
      void opt().logConsole(opt().getConsole(), 'connection_lost');
    }
    bleClosingRef.current = false;
    linkRef.current = null;
    detachClient();
    disposeBleTerminal();
    setTransportBoth(null);
    setModeBoth('repl');
    setBusyBoth(null);
    setHubName('');
    opt().onDisconnected();
  };
  useEffect(() => {
    bleDisconnectedRef.current = handleBleDisconnected;
  });

  const disconnectBle = async () => {
    if (transportRef.current !== 'ble' || busyRef.current === 'uploading') return;
    await opt().logInteraction('disconnect');
    await opt().logConsole(opt().getConsole(), 'disconnect');
    bleClosingRef.current = true;
    await linkRef.current?.close(); // fires handleBleDisconnected
  };

  // Leaving the SPIKE platform: drop Bluetooth. (USB is closed by
  // SPIKEEditor's platform-switch effect via board.disconnect().)
  useEffect(() => {
    if (!options.enabled) return undefined;
    return () => {
      if (transportRef.current === 'ble') {
        const link = linkRef.current;
        // Same record as SPIKEEditor's platform-switch disconnect for USB.
        void opt().logInteraction('disconnect');
        void opt().logConsole(opt().getConsole(), 'disconnect');
        bleClosingRef.current = true;
        bleDisconnectedRef.current();
        link?.close().catch(() => {});
      }
    };
  }, [options.enabled]);

  // --- Hub OS actions (USB slot mode and BLE) ------------------------------

  const download = async ({ run }) => {
    const client = clientRef.current;
    if (!client || busyRef.current) return;
    const targetSlot = slot;
    const code = opt().getCode() || '';
    const bytes = new TextEncoder().encode(code.endsWith('\n') ? code : `${code}\n`);

    setBusyBoth('uploading');
    setUploadProgress(0);
    let uploaded = false;
    try {
      // Snapshot exactly the code being sent.
      await opt().createSnapshot(run ? 'run_device' : `save_to_slot_${targetSlot}`, code);
      await opt().logInteraction(run ? `download_and_run_slot_${targetSlot}` : `save_to_slot_${targetSlot}`);

      // The hub won't take a new program while one is running.
      if (hubRunningRef.current) {
        appStopAtRef.current = Date.now();
        await client.stopProgram(targetSlot);
        await sleep(150);
      }
      emitLine(cyan(t('spikeDownloading').replace('{slot}', targetSlot)));
      // Clearing first also removes a program.mpy left by the LEGO app, which
      // would otherwise run instead of our program.py.
      await client.clearSlot(targetSlot);
      await client.uploadFile(targetSlot, 'program.py', bytes, (sent, total) => {
        setUploadProgress(total ? Math.round((sent / total) * 100) : 100);
      });
      uploaded = true;
      emitLine(green(t('spikeDownloaded').replace('{slot}', targetSlot).replace('{size}', formatBytes(bytes.length))));
      if (run) {
        appStartAtRef.current = Date.now();
        await client.startProgram(targetSlot);
      }
    } catch (error) {
      console.error('[SPIKE] download failed:', error);
      appStartAtRef.current = 0;
      void opt().logInteraction(uploaded
        ? `spike_run_start_failed_slot_${targetSlot}`
        : `spike_download_failed_slot_${targetSlot}`);
      emitLine(red(t('spikeDownloadFailed').replace('{message}', error?.message || String(error))));
    } finally {
      setBusyBoth(null);
      setUploadProgress(null);
    }
  };

  const stopProgram = async () => {
    const client = clientRef.current;
    if (!client) return;
    void opt().logInteraction('stop_slot_program');
    appStopAtRef.current = Date.now();
    try {
      // The hub stops whatever is running regardless of the slot given.
      await client.stopProgram(slot);
    } catch (error) {
      appStopAtRef.current = 0;
      emitLine(red(error?.message || String(error)));
    }
  };

  const toggleSensors = () => {
    void opt().logInteraction(sensorsOpenRef.current ? 'close_hub_sensors' : 'open_hub_sensors');
    setSensorsOpen((open) => !open);
  };

  // --- Save as Library (USB REPL) ------------------------------------------

  const openLibrary = async () => {
    const board = opt().boardRef.current;
    if (transportRef.current !== 'usb' || modeRef.current !== 'repl' || busyRef.current) return;
    if (!board?.connected || opt().operationInFlightRef.current) return;
    setLibrary({ open: true, existing: null, saving: false, error: '' });
    opt().operationInFlightRef.current = true;
    try {
      opt().onReplRunReset(); // listing interrupts any running program
      const existing = await listLibraries(board);
      setLibrary((state) => ({ ...state, existing }));
    } catch (error) {
      setLibrary((state) => ({ ...state, existing: [], error: error?.message || String(error) }));
    } finally {
      opt().operationInFlightRef.current = false;
    }
  };

  const saveAsLibrary = async (name) => {
    const board = opt().boardRef.current;
    if (!board?.connected || opt().operationInFlightRef.current) return;
    opt().operationInFlightRef.current = true;
    setLibrary((state) => ({ ...state, saving: true, error: '' }));
    try {
      const code = opt().getCode() || '';
      await opt().createSnapshot('save_to_library', code);
      // Module names are validated identifiers, safe to embed like slot numbers.
      await opt().logInteraction(`save_to_library_${name}`);
      opt().onReplRunReset();
      const path = await saveLibrary(board, name, code);
      setLibrary({ open: false, existing: null, saving: false, error: '' });
      emitLine(green(t('spikeLibrarySaved').replace('{path}', path).replace('{name}', name)));
      await board.write('\r'); // fresh >>> prompt under the message
      atLineStartRef.current = false;
    } catch (error) {
      void opt().logInteraction('spike_library_save_failed');
      setLibrary((state) => ({ ...state, saving: false, error: error?.message || String(error) }));
    } finally {
      opt().operationInFlightRef.current = false;
    }
  };

  const closeLibrary = () => setLibrary((state) => (state.saving ? state : { ...state, open: false }));

  const clearTerminal = () => bleTerminalRef.current?.clear();

  return {
    transport,
    mode,
    busy,
    hubName,
    hubRunning,
    deviceState,
    sensorsOpen,
    uploadProgress,
    slot,
    slotCount: SLOT_COUNT,
    library,
    setSlot,
    handleUsbConnected,
    handleUsbDisconnected,
    prepareUsbDisconnect,
    enterSlotMode,
    enterReplMode,
    connectBle,
    disconnectBle,
    download,
    stopProgram,
    toggleSensors,
    openLibrary,
    saveAsLibrary,
    closeLibrary,
    clearTerminal,
  };
}
