// MIT License
//
// NOTE: The MIT License applies to the microRepl.js file and no other files
// in this repository. 
// 
// Copyright © 2024, Andrea Giammarchi, @WebReflection
// 
// Modifications made by Duncan Johnson, @DuncanAJohnson
// Copyright © 2026
//
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the “Software”), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software
// is furnished to do so, subject to the following conditions:
// 
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.

const CONTROL_A = '\x01';
const CONTROL_B = '\x02';
const CONTROL_C = '\x03';
const CONTROL_D = '\x04';
const CONTROL_E = '\x05';
const ENTER = '\r\n';
const END = `${ENTER}>>> `;
const SOFT_REBOOT = 'MPY: soft reboot';
const CONTROL_C_REPL = 'Ctrl+C for the REPL';
const EXPRESSION = '__code_last_line_expression__';
const LINE_SEPARATOR = /(?:\r\n|\r|\n)/;
const MACHINE = [
  'from sys import implementation as _',
  'print(hasattr(_, "_machine") and _._machine or _.name)',
  '_=None',
  'del _',
  ENTER,
].join(';');

// Xterm.js dependencies via CDN
const CDN = 'https://cdn.jsdelivr.net/npm';
const CODEDENT = '0.1.2';
const XTERM = '5.3.0';
const ADDON_FIT = '0.10.0';
const ADDON_WEB_LINKS = '0.11.0';

const { assign } = Object;
const { parse } = JSON;
const { serial } = navigator;
const defaultOptions = { hidden: true, raw: false };
const HANDSHAKE_TIMEOUT_MS = 1000;
const PROMPT_TIMEOUT_MS = 12000;

const decoder = new TextDecoder;
const encoder = new TextEncoder;

/**
 * @param {Element} target
 * @returns {Promise<unknown>[]}
 */
const FIT_STYLE_ID = 'microrepl-xterm-fit-fix';
const FIT_STYLE_CSS = `
  .xterm { position: absolute; inset: 0; width: 100%; height: 100%; }
  .xterm .xterm-viewport { width: 100% !important; height: 100% !important; }
  .xterm .xterm-screen { width: 100% !important; }
  [data-microrepl-target] { position: relative; overflow: hidden; }
`;

const dependencies = ({ ownerDocument }) => {
  const rel = 'stylesheet';
  const href = `${CDN}/xterm@${XTERM}/css/xterm.min.css`;
  const link = `link[rel="${rel}"][href="${href}"]`;
  if (!ownerDocument.querySelector(link)) {
    ownerDocument.head.append(
      assign(ownerDocument.createElement('link'), { rel, href })
    );
  }
  if (!ownerDocument.getElementById(FIT_STYLE_ID)) {
    const style = ownerDocument.createElement('style');
    style.id = FIT_STYLE_ID;
    style.textContent = FIT_STYLE_CSS;
    ownerDocument.head.append(style);
  }
  return [
    
    import(/* @vite-ignore */ `${CDN}/codedent@${CODEDENT}/+esm`),
    import(/* @vite-ignore */ `${CDN}/xterm@${XTERM}/+esm`),
    import(/* @vite-ignore */ `${CDN}/@xterm/addon-fit@${ADDON_FIT}/+esm`),
    import(/* @vite-ignore */ `${CDN}/@xterm/addon-web-links@${ADDON_WEB_LINKS}/+esm`),
  ];
};

const exec = async (code, writer, raw = false) => {
  for (const line of code.split(LINE_SEPARATOR)) {
    await writer.write(`${line}\r`);
    await sleep(10);
  }
  if (raw) {
    await writer.write(CONTROL_D);
    await sleep(10);
  }
};

const noop = () => {};

/**
 * @param {string} action
 * @returns {Error}
 */
const reason = (action, evaluating) => new Error(
  evaluating ?
    `Unable to ${action} while evaluating` :
    `Unable to ${action} when disconnected`
);

const sleep = async delay => new Promise(res => setTimeout(res, delay));
const withTimeout = async (promise, timeoutMs, message) => {
  let timeoutId;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error(message)), timeoutMs);
      })
    ]);
  }
  finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
};

const machineNameFromOutput = output => {
  const noise = new Set([
    '>>>',
    '...',
    SOFT_REBOOT,
    CONTROL_C_REPL,
    '=== ',
    '=== paste mode; Ctrl-C to cancel, Ctrl-D to finish ===',
    'from sys import implementation as _',
    'print(hasattr(_, "_machine") and _._machine or _.name)',
    '_=None',
    'del _',
  ]);

  const lines = output
    .split(LINE_SEPARATOR)
    .map(line => line.trim())
    .filter(Boolean);

  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i];
    if (noise.has(line)) continue;
    if (line.startsWith('===')) continue;
    if (/^(Traceback|KeyboardInterrupt)/.test(line)) continue;
    return line;
  }
  return '';
};

/**
 * Return a specific value or infer it from the live element.
 * @param {Element} target
 * @param {string} value
 * @param {string} property
 * @returns {string}
 */
const style = (target, value, property) => (
  value === 'infer' ?
    getComputedStyle(target).getPropertyValue(property) :
    value
);

/**
 * @typedef {Object} MicroREPLOptions
 * @prop {number} [baudRate=115200]
 * @prop {string} [dataType='buffer']
 * @prop {() => void} [onconnect]
 * @prop {() => void} [ondisconnect]
 * @prop {() => void} [onportselected]
 * @prop {(error:Error) => void} [onerror=console.error]
 * @prop {(buffer:Uint8Array) => void} [ondata]
 * @prop {(chunk:string) => void} [oninput] keystrokes/pastes typed into the terminal and sent to the board
 * @prop {() => void} [onsoftreset] the user pressed Ctrl-D in the terminal (soft reset)
 * @prop {{ background:string, foreground:string }} [theme]
 */

/** @type {MicroREPLOptions} */
const options = {
  baudRate: 115200,
  dataType: 'buffer',
  onconnect: noop,
  ondisconnect: noop,
  onportselected: noop,
  onerror: console.error,
  ondata: noop,
  theme: {
    background: "#191A19",
    foreground: "#F5F2E7",
  }
};

/**
 * @typedef {Object} MicroREPLBoard
 * @prop {boolean} connected
 * @prop {number} baudRate
 * @prop {string} name
 * @prop {import('xterm').Terminal} terminal
 * @prop {(target:Element | string) => Promise<MicroREPLBoard | void>} connect
 * @prop {() => Promise<void>} disconnect
 * @prop {() => Promise<void>} reset
 * @prop {(code:string) => Promise<void>} write
 * @prop {(code:string, options?: { hidden:boolean }) => Promise<void>} eval
 */

/**
 * @param {MicroREPLOptions} options
 * @returns {MicroREPLBoard}
 */
export default function Board({
  baudRate = options.baudRate,
  dataType = options.dataType,
  onconnect = options.onconnect,
  ondisconnect = options.ondisconnect,
  onportselected = options.onportselected,
  onerror = options.onerror,
  ondata = options.ondata,
  oninput = noop,
  onsoftreset = noop,
  onresult = parse,
  theme = options.theme,
} = options) {
  let evaluating = 0;
  let resetting = false;
  let showEval = false;
  let port = null;
  let terminal = null;
  let fitAddon = null;
  let resizeObserver = null;
  let name = 'unknown';
  let accumulator = '';
  // When set, every incoming chunk goes here (raw bytes) instead of to the
  // REPL/terminal handling, and terminal keystrokes are not forwarded. Used by
  // SPIKE Prime's Hub OS mode, where the port carries binary protocol frames.
  let rawReceiver = null;
  let aborter, dedent, readerClosed, writer, writerClosed;

  const promptReady = value => /(?:\r\n|\r|\n)>>> $/.test(value) || value.endsWith('>>> ');

  // last meaningful line
  const lml = () => accumulator.split(ENTER).at(-2);

  const forIt = async (timeoutMs = 15000, action = 'response') => {
    const started = Date.now();
    while (!promptReady(accumulator)) {
      if (Date.now() - started > timeoutMs) {
        accumulator = '';
        throw new Error(`Timed out while waiting for ${action}`);
      }
      await sleep(5);
    }
    const result = lml();
    accumulator = '';
    return result;
  };

  // Paste-mode eval that returns stdout as raw text. Does NOT gate on the
  // `evaluating` flag — callers must manage that themselves. Used both by the
  // public `readPrint` method and internally by `upload`'s verify step (which
  // is already inside an evaluating=2 critical section).
  const readPrintInternal = async (code) => {
    await writer.write(CONTROL_C);
    await sleep(30);
    await writer.write(CONTROL_E);
    await sleep(50);
    await exec(dedent(code), writer);
    await writer.write(CONTROL_D);
    return await forIt(15000, 'readPrint result');
  };

  const cleanupPartialConnection = async () => {
    const sp = port;
    const t = terminal;
    port = null;
    terminal = null;
    fitAddon = null;
    if (resizeObserver) {
      try { resizeObserver.disconnect(); } catch { /* already gone */ }
      resizeObserver = null;
    }
    accumulator = '';
    evaluating = 0;
    showEval = false;
    resetting = false;
    rawReceiver = null;

    try { if (aborter) aborter.abort('connect-failure'); } catch {}
    try { if (writer) await writer.close(); } catch {}
    try { if (writerClosed) await writerClosed; } catch {}
    try { if (readerClosed) await readerClosed; } catch {}
    try { if (sp) await sp.close(); } catch {}
    try { if (t) t.dispose(); } catch {}

    aborter = undefined;
    dedent = undefined;
    readerClosed = undefined;
    writer = undefined;
    writerClosed = undefined;
  };

  const board = {
    // board instanceof Board
    __proto__: Board.prototype,

    get connected() { return !!port },
    get baudRate() { return baudRate },
    get name() { return name },
    get terminal() { return terminal },

    /**
     * Resize the terminal to fit its container
     */
    resize: () => {
      if (fitAddon) {
        fitAddon.fit();
      }
    },

    /**
     * On user action, connects the board and bootstrap an Xterm.js REPL in the target node.
     * @param {string | Element} target where the REPL shows its output or accepts its input.
     * @returns
     */
    connect: async (target, named = true, { boardType = 'generic', serialPort = null } = {}) => {
      if (port) return board;
      if (typeof target === 'string') {
        target = (
          document.getElementById(target) ||
          document.querySelector(target)
        );
      }
      if (!target) throw new Error('Unable to find terminal container for REPL');
      try {
        const libs = dependencies(target);

        // If the caller has a pre-authorized port (e.g. from navigator.serial.getPorts()
        // or after a WebUSB flash), reuse it silently — no picker.
        port = serialPort || await serial.requestPort({});
        onportselected();

        const [
          { default: codedent },
          { Terminal },
          { FitAddon },
          { WebLinksAddon },
        ] = await Promise.all(libs.concat(port.open({ baudRate })));

        const { background, foreground } = theme;
        const color = style(target, foreground, 'color');
        const behind = style(target, background, 'background-color');

        dedent = codedent;

        terminal = new Terminal({
          cursorBlink: true,
          cursorStyle: "block",
          theme: {
            cursor: color,
            foreground: color,
            selectionForeground: behind,
            background: behind,
            selectionBackground: color,
          },
        });

        // Like a TextEncoderStream, but raw Uint8Array writes (writeBytes)
        // pass through untouched alongside the usual string writes.
        const tes = new TransformStream({
          transform(chunk, controller) {
            controller.enqueue(typeof chunk === 'string' ? encoder.encode(chunk) : chunk);
          },
        });
        writerClosed = tes.readable.pipeTo(port.writable);
        writer = tes.writable.getWriter();

        let machine = Promise.withResolvers();
        let waitForMachine = false;

        const reveal = chunk => {
          if (dataType === 'string')
            ondata(decoder.decode(chunk));
          else
            ondata(chunk);
          terminal.write(chunk);
        };

        const writable = new WritableStream({
          write(chunk) {
            if (rawReceiver) {
              rawReceiver(chunk);
              return;
            }
            if (evaluating) {
              if (1 < evaluating)
                accumulator += decoder.decode(chunk);
              else if (showEval)
                reveal(chunk);
            }
            else if (waitForMachine) {
              accumulator += decoder.decode(chunk);
              if (promptReady(accumulator)) {
                const detected = machineNameFromOutput(accumulator);
                if (detected) machine.resolve(detected);
                accumulator = '';
              }
            }
            else {
              if (resetting) {
                const value = decoder.decode(chunk);
                if (value.includes(SOFT_REBOOT)) {
                  resetting = false;
                  const chunks = value.split(LINE_SEPARATOR);
                  for (let i = 0; i < chunks.length; i++) {
                    if (chunks[i] === SOFT_REBOOT)
                      chunks[i] += ` - ${CONTROL_C_REPL}`;
                  }
                  chunk = encoder.encode(chunks.join(ENTER));
                }
              }
              reveal(chunk);
            }
          }
        });

        aborter = new AbortController;
        readerClosed = port.readable.pipeTo(writable, aborter).catch(() => {
          if (port) board.disconnect();
        });

        let pastMode = false;
        terminal.attachCustomKeyEventHandler(event => {
          // No typing into a binary protocol stream.
          if (rawReceiver) return false;
          const { type, code, composed, ctrlKey, shiftKey } = event;
          if (type === 'keydown') {
            if (composed && ctrlKey && !shiftKey) {
              if (pastMode)
                pastMode = code !== 'KeyD';
              else {
                if (code === 'KeyE')
                  pastMode = true;
                else if (code === 'KeyD') {
                  event.preventDefault();
                  if (evaluating) {
                    evaluating = 0;
                    accumulator = '';
                  }
                  board.reset();
                  onsoftreset();
                  return false;
                }
              }
            }
            // prevent errors with huge content passed in paste mode
            else if (pastMode && composed && ctrlKey && shiftKey && code === 'KeyV') {
              event.preventDefault();
              navigator.clipboard.readText().then(async code => {
                while (evaluating) await sleep(10);
                await exec(code, writer);
              });
              return false;
            }
          }
          return true;
        });

        terminal.onData(chunk => {
          if (!evaluating && writer && !rawReceiver) {
            writer.write(chunk);
            oninput(chunk);
          }
        });

        fitAddon = new FitAddon;
        terminal.loadAddon(fitAddon);
        terminal.loadAddon(new WebLinksAddon);
        target.setAttribute('data-microrepl-target', '');
        terminal.open(target);
        fitAddon.fit();
        terminal.focus();

        // Reflow xterm whenever the target container resizes (drag of the
        // splitter, ControlPanel gaining a new button row, window resize,
        // etc.). Without this, xterm keeps its initial row count and either
        // clips the bottom rows or overflows the container.
        if (typeof ResizeObserver !== 'undefined') {
          let rafId = 0;
          resizeObserver = new ResizeObserver(() => {
            if (rafId) cancelAnimationFrame(rafId);
            rafId = requestAnimationFrame(() => {
              rafId = 0;
              try { fitAddon?.fit(); } catch { /* terminal torn down */ }
            });
          });
          resizeObserver.observe(target);
        }

        if (named) {
          // Bootstrap with board name details. Some tools (e.g. Thonny)
          // can leave the REPL in a non-friendly state, so normalize first.
          const probeMachine = async () => {
            machine = Promise.withResolvers();
            await writer.write(CONTROL_B);
            await sleep(30);
            await writer.write(CONTROL_C);
            await sleep(30);
            accumulator = '';
            waitForMachine = true;
            await writer.write(CONTROL_E);
            await writer.write(MACHINE);
            await writer.write(CONTROL_D);
          };

          terminal.clear();
          await probeMachine();

          try {
            try {
              name = await withTimeout(
                machine.promise,
                HANDSHAKE_TIMEOUT_MS,
                'Selected serial device did not respond like a MicroPython REPL'
              );
            }
            catch (firstAttemptError) {
              await probeMachine();
              name = await withTimeout(
                machine.promise,
                HANDSHAKE_TIMEOUT_MS,
                firstAttemptError.message
              );
            }
          }
          finally {
            accumulator = '';
            waitForMachine = false;
            if (name) {
              terminal.clear();
              terminal.write('\x1b[M');
              terminal.write(`${name}${ENTER}`);
            }
          }
        }
        else {
          machine.resolve(name);
          terminal.write(`${CONTROL_C_REPL}${ENTER}`);
        }

        // Ensure a stable prompt before returning. This avoids transient
        // post-connect states where hidden evals can appear stuck.
        await board.waitForPrompt(PROMPT_TIMEOUT_MS);

        onconnect();

        return board;
      }
      catch (error) {
        await cleanupPartialConnection();
        onerror(error);
        throw error;
      }
    },

    /**
     * Destroy the terminal after disconnecting the board.
     */
    disconnect: async () => {
      if (port || terminal) {
        const sp = port;
        const t = terminal;
        port = null;
        terminal = null;
        fitAddon = null;
        if (resizeObserver) {
          try { resizeObserver.disconnect(); } catch { /* already gone */ }
          resizeObserver = null;
        }
        accumulator = '';
        evaluating = 0;
        showEval = false;
        rawReceiver = null;
        try {
          if (aborter) aborter.abort('disconnect');
          if (writer) await writer.close().catch(() => {});
          if (writerClosed) await writerClosed.catch(() => {});
          if (readerClosed) await readerClosed.catch(() => {});
          if (sp) await sp.close().catch(() => {});
          if (t) t.dispose();
        }
        finally {
          aborter = undefined;
          dedent = undefined;
          readerClosed = undefined;
          writer = undefined;
          writerClosed = undefined;
          ondisconnect();
        }
      }
    },

    /**
     * Evaluate code and optionally returns last line, if single reference, after a `json.dumps`.
     * @param {string} code Python code to evaluate
     * @param {{ hidden?: boolean }} [options] if `hidden` is true, show all lines/errors on terminal
     * @returns {Promise<any>} if last line of the `code` was a single reference, it returns its JSON parsed value
     */
    eval: async (code, { hidden = true } = defaultOptions) => {
      if (port && !evaluating) {
        evaluating = 1;
        showEval = !hidden;
        try {
          let outcome = null;
          const lines = dedent(code).split(LINE_SEPARATOR);
          while (lines.length && !lines.at(-1).trim()) lines.pop();
          let asRef = false, asPatch = false, result = '';
          if (lines.length) {
            result = lines.at(-1);
            asRef = /^[a-zA-Z0-9._]+$/.test(result);
            if (!asRef && /^\S+/.test(result) && !/[;=]/.test(result)) {
              asRef = asPatch = true;
              lines.pop();
              lines.push(`${EXPRESSION}=${result}`, EXPRESSION);
              result = EXPRESSION;
            }
            await exec(lines.join(ENTER), writer);
          }
          if (asRef) {
            await writer.write(
              `import json;print(json.dumps(${result}))${ENTER}`
            );
            evaluating = 2;
            outcome = onresult(await forIt(15000, 'evaluation result'));
          }
          // free ram on patched code evaluation
          if (asPatch) {
            evaluating = 0;
            showEval = false;
            await board.paste(`${EXPRESSION}=None`, defaultOptions);
          }
          return outcome;
        }
        finally {
          evaluating = 0;
          showEval = false;
        }
      }
      else onerror(reason('eval', evaluating));
    },

    /**
     * Set the board in paste mode then send the whole code to evaluate.
     * @param {string} code Python code to evaluate
     * @param {{ hidden?: boolean, raw?: boolean }} [options] if `hidden` is `false`,
     *  it shows all lines/errors on terminal. If `raw` is `true`, it puts the terminal in raw mode.
     */
    paste: async (code, { hidden = true, raw = false } = defaultOptions) => {
      if (port && !evaluating) {
        showEval = !hidden;
        evaluating = hidden ? 2 : 1;
        try {
          if (!raw) {
            await writer.write(CONTROL_C);
            await sleep(30);
          }
          await writer.write(raw ? CONTROL_A : CONTROL_E);
          await sleep(50);
          await exec(dedent(code), writer, raw);
          await writer.write(raw ? CONTROL_B : CONTROL_D);
          if (hidden) await forIt(15000, 'paste mode completion');
          // terminal.write('\x1b[M\x1b[A');
        }
        finally {
          evaluating = 0;
          showEval = false;
        }
      }
      else onerror(reason('paste', evaluating));
    },

    /**
     * Type a single-line statement at the friendly REPL and wait for the next
     * `>>> ` prompt before returning. The supplied code MUST be a single
     * complete statement (no multi-line blocks). The device naturally
     * throttles us because the REPL echoes every character before accepting
     * the next, so this is the safe path for shipping arbitrary content to
     * platforms with small USB-CDC buffers (e.g. micro:bit) where paste-mode
     * blocks overflow.
     * @param {string} code one complete Python statement (no embedded newlines)
     * @returns {Promise<void>}
     */
    runStatement: async (code) => {
      if (port && !evaluating) {
        evaluating = 2;
        showEval = false;
        try {
          accumulator = '';
          // Chunk into ~32-byte writes with a small sleep between chunks so the
          // micro:bit USB-CDC RX buffer (~64 bytes) doesn't overflow. Without
          // this throttle, long lines lose chars in the middle and the device
          // ends up in `... ` continuation mode that breaks subsequent
          // statements.
          const CHUNK = 32;
          for (let i = 0; i < code.length; i += CHUNK) {
            await writer.write(code.slice(i, i + CHUNK));
            if (code.length - i > CHUNK) await sleep(5);
          }
          await writer.write('\r');
          // forIt returns the last meaningful line before the `>>> ` prompt —
          // for a Python traceback that's the error line ("ImportError: ..."),
          // which lets us surface device-side errors instead of silently
          // marching past them (showEval=false hides them from the terminal).
          const lastLine = (await forIt(10000, 'statement completion')) || '';
          if (/^[A-Z]\w*Error\b/.test(lastLine.trim())) {
            throw new Error(`Device error: ${lastLine.trim()}`);
          }
        }
        finally {
          evaluating = 0;
          showEval = false;
        }
      }
      else onerror(reason('runStatement', evaluating));
    },

    /**
     * Paste-evaluate `code` and return the last meaningful line of stdout as a
     * raw string. Unlike `eval`, this does NOT use `json.dumps`, so it works on
     * platforms (e.g. micro:bit) where the `json` module is unavailable. The
     * supplied code MUST end with a single `print(<value>)` statement; the
     * caller is responsible for parsing the returned text.
     * @param {string} code Python code to evaluate
     * @returns {Promise<string>} the captured printed line
     */
    readPrint: async (code) => {
      if (port && !evaluating) {
        showEval = false;
        evaluating = 2;
        try {
          return await readPrintInternal(code);
        }
        finally {
          evaluating = 0;
          showEval = false;
        }
      }
      else onerror(reason('readPrint', evaluating));
    },

    /**
     * Upload a file to the board showing some progress while doing that.
     * @param {string} path the name of the file to upload.
     * @param {string | File | Blob} content the file content as string or blob or as file.
     * @param {(current, total) => void} onprogress an optional callback to receive current uploaded and total.
     */
    upload: async (path, content, onprogress = noop) => {
      if (port && !evaluating) {
        const { stringify } = JSON;
        const { fromCharCode } = String;

        const base64 = view => {
          let b64 = '';
          for (let args = 2000, i = 0; i < view.length; i += args)
            b64 += fromCharCode(...view.slice(i, i + args));
          return btoa(b64);
        };

        const update = (i, length) => {
          onprogress(i, length);
          const value = (i * 100 / length).toFixed(2);
          terminal.write(`\x1b[M... uploading ${path} ${value}% `);
        };

        const view = typeof content === 'string' ?
          encoder.encode(content) :
          new Uint8Array(await content.arrayBuffer())
        ;

        const code = dedent(`
            with open(${stringify(path)},"wb") as f:
              import binascii
              f.write(binascii.a2b_base64("${base64(view)}"))
              f.close()
        `);

        let i = 0, { length } = code;

        evaluating = 2;
        try {
          // enter raw mode
          await writer.write(CONTROL_A);
          // notify beginning
          update(i, length);
          // write the whole code
          while (i < length) {
            await writer.write(code[i++]);
            update(i, length);
            // pause every 256 chars to allow UI
            // to show changes (too greedy otherwise)
            if (!(i % 256)) await sleep(0);
          }
          // commit raw code
          await writer.write(CONTROL_D);
          // exit raw mode
          await writer.write(CONTROL_B);
          terminal.write(`\x1b[M... decoding ${path} `);
          await forIt(30000, 'upload completion');
          terminal.write(`\x1b[M... verifying ${path} `);
          // Use raw print() rather than json.dumps() so verification works on
          // platforms where the json module is unavailable (e.g. micro:bit).
          const sizeText = await readPrintInternal(`
            import os
            print(os.stat(${stringify(path)})[6])
          `);
          const result = view.length === parseInt(sizeText, 10);
          const message = result ? 'uploaded' : '\x1b[1mfailed\x1b[22m to upload';
          terminal.write(`\x1b[M... ${message} ${path} ${ENTER}>>> `);
          terminal.focus();
          return result;
        }
        finally {
          evaluating = 0;
        }
      }
      else onerror(reason('upload', evaluating));
    },

    /**
     * Send a Ctrl+C interrupt even while evaluating.
     * @param {number} delay how long to wait after interrupt
     */
    interrupt: async (delay = 100) => {
      if (port && writer) {
        await writer.write(CONTROL_C);
        await sleep(delay);
        evaluating = 0;
        showEval = false;
        accumulator = '';
        terminal?.focus();
      }
      else onerror(reason('interrupt', evaluating));
    },

    /**
     * Wait until the REPL prompt is visible and stable.
     * @param {number} timeoutMs
     */
    waitForPrompt: async (timeoutMs = PROMPT_TIMEOUT_MS) => {
      if (port && writer) {
        const prevEvaluating = evaluating;
        const prevShowEval = showEval;
        evaluating = 2;
        showEval = false;
        try {
          accumulator = '';
          await writer.write(CONTROL_C);
          await sleep(30);
          await writer.write(ENTER);
          await forIt(timeoutMs, 'REPL prompt');
        }
        finally {
          evaluating = prevEvaluating;
          showEval = prevShowEval;
          accumulator = '';
        }
      } else {
        onerror(reason('wait for prompt', evaluating));
      }
    },

    /**
     * Reset the board and put it back in REPL mode + focus.
     * @param {number} delay how long before the REPL should be reactivated
     */
    reset: async (delay = 500) => {
      if (port) {
        if (evaluating) {
          // interrupt current program
          await board.interrupt(delay);
        }
        // reset the board
        resetting = true;
        await writer.write(CONTROL_D);
        await sleep(delay);
        terminal.focus();
      }
      else onerror(reason('reset', evaluating));
    },

    /**
     * Raw write to the board any string as it is.
     * @param {string} code any raw string to write directly to the board
     */
    write: async code => {
      if (port && !evaluating) await writer.write(code);
      else onerror(reason('write', evaluating));
    },

    /**
     * Route incoming bytes to `fn` (or back to the REPL/terminal with null).
     * @param {((chunk: Uint8Array) => void) | null} fn
     */
    setRawReceiver: fn => {
      rawReceiver = typeof fn === 'function' ? fn : null;
    },

    /**
     * Write raw bytes to the port, bypassing text encoding.
     * @param {Uint8Array} bytes
     */
    writeBytes: async bytes => {
      if (port && writer) await writer.write(bytes);
      else throw reason('write', evaluating);
    },
  };

  return board;
}

