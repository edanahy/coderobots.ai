/**
 * Console text helpers. The live terminal (xterm.js) interprets ANSI/VT100
 * escape codes; stored console captures and the viewers that show them
 * (ConsoleModal in chat and /users, the replay console) don't.
 *
 * - App-generated notices are coloured for the terminal only: stripAnsi()
 *   them before they enter the console record.
 * - Device output is stored as received (e.g. MicroPython's REPL line editing
 *   sends backspace / erase-line codes); viewers renderTerminalText() it.
 */

// CSI (ESC [ … final byte), OSC (ESC ] … BEL or ESC \), and two-byte ESC codes.
// Matching control characters is the point here.
/* eslint-disable no-control-regex -- ANSI escape sequences are control characters */
const ANSI_PATTERN = /\x1b\[[0-?]*[ -/]*[@-~]|\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)|\x1b[@-Z\\-_]/g;
const ANSI_AT_START = /^(?:\x1b\[([0-?]*)[ -/]*([@-~])|\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)|\x1b[@-Z\\-_])/;
const TERMINAL_CONTROLS = /[\x1b\b\r]/;
/* eslint-enable no-control-regex */

/** Remove escape codes (colours, cursor moves), leaving the text itself. */
export const stripAnsi = (text) => String(text ?? '').replace(ANSI_PATTERN, '');

/**
 * Reconstruct what a terminal would have shown for `raw`: colours dropped,
 * and backspace, cursor left/right (ESC[nD / ESC[nC), erase-to-end-of-line
 * (ESC[K) and carriage-return overwrites applied line by line.
 */
export function renderTerminalText(raw) {
  const text = String(raw ?? '');
  if (!TERMINAL_CONTROLS.test(text)) return text;

  const lines = [];
  let line = [];
  let col = 0;

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (ch === '\x1b') {
      const match = ANSI_AT_START.exec(text.slice(i, i + 64));
      if (!match) continue; // stray ESC: drop it
      i += match[0].length - 1;
      const [, params = '', command] = match;
      const n = parseInt(params, 10);
      if (command === 'D') col = Math.max(0, col - (n || 1));
      else if (command === 'C') col += n || 1;
      else if (command === 'K') {
        if (!n) line.length = Math.min(line.length, col); // 0: cursor to end
        else if (n === 2) line = [];
      }
      // Everything else (colours, modes) has no effect on the text.
      continue;
    }
    if (ch === '\n') {
      lines.push(line.join(''));
      line = [];
      col = 0;
    } else if (ch === '\r') {
      col = 0;
    } else if (ch === '\b') {
      col = Math.max(0, col - 1);
    } else {
      while (line.length < col) line.push(' ');
      line[col] = ch;
      col += 1;
    }
  }
  lines.push(line.join(''));
  return lines.join('\n');
}
