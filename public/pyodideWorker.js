/**
 * Pyodide Web Worker for LEGO Education mode.
 *
 * Runs Pyodide off the main thread so long-running Python code (time.sleep
 * loops, busy-waits on sensor values) does not freeze the UI. BLE instances
 * still live on the main thread — we reach them from Python via a
 * synchronous RPC channel built on SharedArrayBuffer + Atomics.wait:
 *
 *     Python           JS (this worker)           Main thread
 *     -------          ------------------         -----------
 *     le.motor_run ──► LEGO_BRIDGE.rpc(json) ──►  bridge listener
 *                      Atomics.wait(flag,0)       runs BLE call
 *                              ◄──────────────── writes SAB, Atomics.notify
 *                      reads SAB, returns json
 *     returns   ◄──────
 *
 * Because the worker blocks on Atomics.wait (not the event loop), the
 * main thread is free to process the RPC and update UI state while
 * Python is "waiting".
 */

const PYODIDE_VERSION = 'v0.26.4';
const PYODIDE_CDN = `https://cdn.jsdelivr.net/pyodide/${PYODIDE_VERSION}/full`;

importScripts(`${PYODIDE_CDN}/pyodide.js`);

let pyodide = null;
let flagView = null;    // Int32Array over the shared flag buffer
let dataBuffer = null;  // Uint8Array over the shared payload buffer
let interruptView = null; // Uint8Array over the shared interrupt buffer

const DATA_HEADER_BYTES = 4; // uint32 length prefix

// Decode whatever the main thread wrote into the shared payload buffer.
function readSharedResponse() {
  const view = new DataView(dataBuffer.buffer);
  const len = view.getUint32(0, true);
  // Copy out of the SharedArrayBuffer before decoding — TextDecoder on a
  // shared view throws in some browsers.
  const copy = new Uint8Array(len);
  copy.set(dataBuffer.subarray(DATA_HEADER_BYTES, DATA_HEADER_BYTES + len));
  return new TextDecoder().decode(copy);
}

// Synchronous RPC called from Python via `js.LEGO_BRIDGE.rpc(json_str)`.
// Sends a message to the main thread, blocks on the shared flag until the
// response has been written, then returns the response JSON as a string.
function syncRpc(reqJson) {
  if (!flagView || !dataBuffer) {
    throw new Error('LEGO bridge not initialized');
  }
  // Clear the flag so we block until the main thread flips it back to 1.
  Atomics.store(flagView, 0, 0);
  self.postMessage({ type: 'ble-rpc', req: reqJson });
  // Block (worker-side only — main thread is never paused).
  const result = Atomics.wait(flagView, 0, 0);
  if (result === 'timed-out') {
    throw new Error('LEGO bridge RPC timed out');
  }
  return readSharedResponse();
}

// Install `self.LEGO_BRIDGE` so Python can call `js.LEGO_BRIDGE.rpc(...)`.
self.LEGO_BRIDGE = { rpc: syncRpc };

async function initPyodide(indexURL) {
  // eslint-disable-next-line no-undef -- loadPyodide is a global defined by importScripts(pyodide.js) above
  pyodide = await loadPyodide({
    indexURL,
    stdout: (s) => self.postMessage({ type: 'stdout', data: s + '\n' }),
    stderr: (s) => self.postMessage({ type: 'stderr', data: s + '\n' }),
  });

  if (interruptView) {
    try { pyodide.setInterruptBuffer(interruptView); } catch (e) {
      console.warn('[pyodideWorker] setInterruptBuffer failed:', e);
    }
  }

  // Drop legoeducation.py into the Pyodide virtual FS so student code can
  // `import legoeducation as le`.
  const res = await fetch('/legoeducation.py', { cache: 'no-cache' });
  if (!res.ok) throw new Error(`fetch /legoeducation.py: ${res.status}`);
  const source = await res.text();
  pyodide.FS.writeFile('legoeducation.py', source, { encoding: 'utf8' });
}

self.onmessage = async (ev) => {
  const msg = ev.data || {};
  switch (msg.type) {
    case 'init-bridge': {
      flagView = new Int32Array(msg.flag);
      dataBuffer = new Uint8Array(msg.data);
      interruptView = new Uint8Array(msg.interrupt);
      // If Pyodide loaded before the bridge arrived, hook the interrupt
      // buffer in retroactively.
      if (pyodide) {
        try { pyodide.setInterruptBuffer(interruptView); } catch {}
      }
      break;
    }
    case 'init': {
      try {
        await initPyodide(msg.indexURL);
        self.postMessage({ type: 'ready' });
      } catch (err) {
        self.postMessage({ type: 'init-error', error: String(err?.message || err) });
      }
      break;
    }
    case 'run': {
      if (!pyodide) {
        self.postMessage({ type: 'run-error', error: 'Pyodide not initialised' });
        return;
      }
      try {
        await pyodide.runPythonAsync(msg.code);
        self.postMessage({ type: 'run-done' });
      } catch (err) {
        const text = err?.message || String(err);
        self.postMessage({ type: 'stderr', data: text + '\n' });
        self.postMessage({ type: 'run-error', error: text });
      }
      break;
    }
    default:
      // Ignore unknown messages.
      break;
  }
};
