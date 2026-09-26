/**
 * Lightweight xterm.js terminal for LEGO Education mode.
 *
 * Reuses the same CDN-hosted xterm version as microRepl.js so both paths
 * share a single xterm download in the browser cache. This terminal has no
 * serial attached — it's a pure sink for Pyodide stdout/stderr.
 */

const CDN = 'https://cdn.jsdelivr.net/npm';
const XTERM = '5.3.0';
const ADDON_FIT = '0.10.0';

let depsPromise = null;

// Make xterm actually fill its wrapper. Without this the .xterm element keeps
// its initial measured size (24 rows ≈ 360px) and FitAddon.fit() computes the
// same row count every time because it measures from an element whose size
// never changes. Injected once per document.
const FIT_STYLE_ID = 'lego-terminal-fit-fix';
const FIT_STYLE_CSS = `
  [data-lego-terminal-host] { position: relative; overflow: hidden; }
  [data-lego-terminal-host] > .xterm { position: absolute; inset: 0; width: 100%; height: 100%; }
  [data-lego-terminal-host] .xterm-viewport { width: 100% !important; height: 100% !important; }
  [data-lego-terminal-host] .xterm-screen { width: 100% !important; }
`;
function ensureFitStyles() {
  if (typeof document === 'undefined') return;
  if (document.getElementById(FIT_STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = FIT_STYLE_ID;
  style.textContent = FIT_STYLE_CSS;
  document.head.appendChild(style);
}

// xterm 5.3's Viewport schedules `syncScrollArea()` via setTimeout(0) from
// its constructor, and `_innerRefresh` fires in another deferred callback.
// Both call into RenderService.dimensions, which reads `_renderer.value` —
// and that can still be undefined by the time the timer fires, producing
// an UNCAUGHT "Cannot read properties of undefined (reading 'dimensions')"
// that we can't swallow at the call site because it happens in a later
// task. The terminal still works fine after this — the first render just
// loses a frame. Install a one-time global filter that silences it.
let globalHandlerInstalled = false;
function installXtermErrorShield() {
  if (globalHandlerInstalled || typeof window === 'undefined') return;
  globalHandlerInstalled = true;
  const isXtermDimensionsError = (msg, stack) => {
    if (typeof msg === 'string' && msg.includes("reading 'dimensions'")) return true;
    if (typeof stack === 'string' && stack.includes('RenderService')) return true;
    return false;
  };
  window.addEventListener('error', (ev) => {
    if (isXtermDimensionsError(ev.message, ev.error?.stack)) {
      ev.preventDefault();
      ev.stopImmediatePropagation();
    }
  }, true);
  window.addEventListener('unhandledrejection', (ev) => {
    const r = ev.reason;
    if (isXtermDimensionsError(r?.message, r?.stack)) {
      ev.preventDefault();
    }
  });
}

// Poll requestAnimationFrame until `el` has a non-zero layout box. Bails
// after ~1s so we don't wait forever on a detached node.
function waitForLayout(el) {
  return new Promise((resolve) => {
    let tries = 0;
    const check = () => {
      tries += 1;
      if (!el || !el.isConnected) return resolve();
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) return resolve();
      if (tries > 60) return resolve();
      requestAnimationFrame(check);
    };
    requestAnimationFrame(check);
  });
}

function ensureDeps() {
  if (depsPromise) return depsPromise;

  const href = `${CDN}/xterm@${XTERM}/css/xterm.min.css`;
  if (!document.querySelector(`link[rel="stylesheet"][href="${href}"]`)) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    document.head.appendChild(link);
  }

  depsPromise = Promise.all([
    import(/* @vite-ignore */ `${CDN}/xterm@${XTERM}/+esm`),
    import(/* @vite-ignore */ `${CDN}/@xterm/addon-fit@${ADDON_FIT}/+esm`),
  ]).then(([{ Terminal }, { FitAddon }]) => ({ Terminal, FitAddon }));

  return depsPromise;
}

const DARK_THEME = {
  background: '#191A19',
  foreground: '#F5F2E7',
  cursor: '#F5F2E7',
  selectionBackground: '#F5F2E7',
  selectionForeground: '#191A19',
};

/**
 * Create a terminal mounted in `target`, return a small controller object.
 *
 * @param {HTMLElement} target
 * @param {{ theme?: object }} [options] xterm theme (defaults to dark)
 * @returns {Promise<{write: (s:string)=>void, clear: ()=>void, dispose: ()=>void, fit: ()=>void, terminal: any}>}
 */
export async function createLegoTerminal(target, { theme = DARK_THEME } = {}) {
  installXtermErrorShield();
  ensureFitStyles();
  const { Terminal, FitAddon } = await ensureDeps();

  // Wait for the host element to actually have layout before opening.
  await waitForLayout(target);
  // Also wait for fonts to load — xterm measures glyph size on open().
  try { if (document.fonts?.ready) await document.fonts.ready; } catch {}

  const terminal = new Terminal({
    cursorBlink: true,
    cursorStyle: 'block',
    convertEol: true,
    theme,
  });

  const fitAddon = new FitAddon();
  terminal.loadAddon(fitAddon);
  target.setAttribute('data-lego-terminal-host', '');
  terminal.open(target);
  try { fitAddon.fit(); } catch {}

  // Reflow xterm whenever the target resizes (splitter drag, ControlPanel
  // gaining a new button row after connect, window resize, etc.). Without
  // this the .xterm element follows the container via CSS but the terminal
  // model keeps its original row count, so the bottom rows scroll past the
  // visible area.
  let resizeObserver = null;
  if (typeof ResizeObserver !== 'undefined') {
    let rafId = 0;
    resizeObserver = new ResizeObserver(() => {
      if (rafId) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        rafId = 0;
        try { fitAddon.fit(); } catch { /* torn down */ }
      });
    });
    resizeObserver.observe(target);
  }

  const controller = {
    terminal,
    write: (s) => terminal.write(s),
    clear: () => terminal.clear(),
    fit: () => { try { fitAddon.fit(); } catch {} },
    dispose: () => {
      try { resizeObserver?.disconnect(); } catch {}
      try { target.removeAttribute('data-lego-terminal-host'); } catch {}
      try { terminal.dispose(); } catch {}
    },
  };

  return controller;
}
