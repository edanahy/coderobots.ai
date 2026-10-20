/**
 * "Save as Library" for SPIKE Prime over the USB REPL: store a code tab as
 * /flash/lib/<name>.py so any program can `import <name>`.
 *
 * Verified on hub firmware 1.8 / MicroPython 1.20: both REPL runs and slot
 * programs import with sys.path = ['', '.frozen', '/flash', '/flash/lib'].
 * The protocol (BLE / slot mode) can only write inside program slots, which
 * is why this lives on the REPL side.
 */

export const LIBRARY_DIR = '/flash/lib';

// Names a library can't usefully take: built-in and frozen modules win over
// /flash/lib (`help('modules')` on the hub), and /flash/main.py and
// /flash/boot.py shadow it because /flash comes first on sys.path.
const RESERVED_NAMES = new Set([
  'app', 'array', 'asyncio', 'binascii', 'bluetooth', 'boot', 'builtins', 'cmath',
  'collections', 'color', 'color_matrix', 'color_sensor', 'deflate', 'device',
  'distance_sensor', 'errno', 'force_sensor', 'gc', 'hashlib', 'heapq', 'hub', 'io',
  'json', 'machine', 'main', 'math', 'micropython', 'motor', 'motor_pair', 'orientation',
  'os', 'platform', 'random', 're', 'runloop', 'select', 'struct', 'sys', 'time',
  'uasyncio', 'uctypes', 'vfs', 'zlib',
]);

const PYTHON_KEYWORDS = new Set([
  'False', 'None', 'True', 'and', 'as', 'assert', 'async', 'await', 'break', 'class',
  'continue', 'def', 'del', 'elif', 'else', 'except', 'finally', 'for', 'from', 'global',
  'if', 'import', 'in', 'is', 'lambda', 'nonlocal', 'not', 'or', 'pass', 'raise',
  'return', 'try', 'while', 'with', 'yield',
]);

/** Best-effort module name from a code tab name ("My Helpers.py" → "my_helpers"). */
export function toModuleName(tabName) {
  const name = String(tabName || '')
    .trim()
    .replace(/\.py$/i, '')
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '');
  if (!name) return '';
  return /^[0-9]/.test(name) ? `lib_${name}` : name;
}

/** @returns {null | 'invalid' | 'reserved'} */
export function validateModuleName(name) {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name) || PYTHON_KEYWORDS.has(name)) return 'invalid';
  if (RESERVED_NAMES.has(name)) return 'reserved';
  return null;
}

// Hidden preamble for every REPL run: forget modules loaded from /flash so an
// edited library is re-imported (MicroPython otherwise keeps serving the
// cached copy from the previous run).
export const PURGE_USER_MODULES = `
def _purge_user_modules():
    import sys
    for name in list(sys.modules):
        if getattr(sys.modules[name], '__file__', '').startswith('/flash'):
            del sys.modules[name]
_purge_user_modules()
del _purge_user_modules
`;

async function readPrintJson(board, code) {
  const line = await board.readPrint(code);
  if (typeof line !== 'string') throw new Error('The hub is busy; try again.');
  try {
    return JSON.parse(line);
  } catch {
    throw new Error(line.trim() || 'Unexpected response from the hub');
  }
}

/** Names (without .py) of the libraries currently in /flash/lib. */
export async function listLibraries(board) {
  const files = await readPrintJson(board, `
import os, json
try:
    print(json.dumps(os.listdir('${LIBRARY_DIR}')))
except OSError:
    print('[]')
`);
  return files
    .filter((file) => file.endsWith('.py'))
    .map((file) => file.slice(0, -3))
    .sort();
}

export const formatBytes = (n) => (n < 1024 ? `${n} B` : `${(n / 1024).toFixed(1)} KB`);

// Above this the dialog warns that the library is large. A rough guess, not
// a measured limit: the hub compiles a module's source in RAM on import, and
// big modules can raise MemoryError there even though saving works.
export const LARGE_LIBRARY_BYTES = 24 * 1024;

// The upload is many small base64 lines, several per paste. Two hub limits
// shape it:
//  - The hub drops bytes from a large single USB write. With one ~2 KB
//    base64 line per paste, a 56 KB save kept only its final, ~1 KB line;
//    Hub OS has the same limit (see hubClient.js). microRepl's exec() sends each
//    line as one write with a 10 ms gap, so a line's length IS the burst
//    size. 96 bytes is 128 base64 chars, about 140 bytes per write, the
//    same size as the micro:bit-tested lines in postConnectFiles.js. Don't
//    "speed this up" by going back to one long line per paste. LINE_BYTES
//    must stay a multiple of 3 so every line decodes without padding.
//  - A paste whose line arrives damaged fails as a whole (SyntaxError) or
//    stops at that line, and Board.paste() hides the traceback. So each
//    paste here goes through readPrint and must answer with the file's new
//    size; a missing or wrong answer means resend from the size that landed.
//    That resume is only safe because each line also carries its decoded
//    length and refuses to write if it doesn't match: a line that lost
//    exactly 4 base64 chars still decodes, just 3 bytes short. With the
//    check, the file only ever holds whole, good lines.
const LINE_BYTES = 96;
const LINES_PER_PASTE = 32; // ~3 KB per paste: the retry unit
const PASTE_BYTES = LINE_BYTES * LINES_PER_PASTE;
// Failed steps in a row (without the confirmed size moving forward) before
// giving up. Counted per position, not per save, so big files aren't more
// likely to give up.
const MAX_FAILURES = 5;

// Only ever called on LINE_BYTES-sized slices, so the spread is small.
const toBase64 = (bytes) => btoa(String.fromCharCode(...bytes));

async function sha256Hex(bytes) {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * A failed save, with a `code` the UI can localize:
 * 'transfer' (retries exhausted; details { done, total }), 'verify' (the
 * hub's copy didn't match), or 'disconnected'. `message` is the technical
 * detail for the console. The hub's traceback is usually a SyntaxError from a
 * damaged line, so don't show it to students: they'd think their code is
 * wrong.
 */
export class LibrarySaveError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'LibrarySaveError';
    this.code = code;
    this.details = details;
  }
}

const startTempFile = (tmp) => `
import os
try:
    os.mkdir('${LIBRARY_DIR}')
except OSError:
    pass
open('${tmp}', 'wb').close()
print(os.stat('${tmp}')[6])
`;

const appendLines = (tmp, bytes) => {
  const lines = [];
  for (let i = 0; i < bytes.length; i += LINE_BYTES) {
    const line = bytes.subarray(i, i + LINE_BYTES);
    lines.push(`    _w('${toBase64(line)}', ${line.length})`);
  }
  return `
import os
from binascii import a2b_base64 as _d
def _w(s, n):
    b = _d(s)
    if len(b) != n:
        raise ValueError('damaged line')
    _f.write(b)
with open('${tmp}', 'ab') as _f:
${lines.join('\n')}
print(os.stat('${tmp}')[6])
`;
};

const probeSize = (tmp) => `
import os
try:
    print(os.stat('${tmp}')[6])
except OSError:
    print(-1)
`;

// Prints the file's SHA-256 as a JSON string, or null if this firmware has no
// hashlib.sha256 (then only the size check applies).
const hashFile = (tmp) => `
import json, binascii
try:
    import hashlib
    _h = hashlib.sha256()
except (ImportError, AttributeError):
    _h = None
if _h is not None:
    with open('${tmp}', 'rb') as _f:
        _b = _f.read(512)
        while _b:
            _h.update(_b)
            _b = _f.read(512)
    print(json.dumps(binascii.hexlify(_h.digest()).decode()))
else:
    print('null')
`;

// LittleFS renames over an existing file; FAT refuses, so fall back to
// remove + rename there. Safe to run twice: when tmp is already gone (its
// earlier run worked but the reply was lost), it only reports the size.
// Without that check a retry would fall into the except branch and delete the
// library it just committed.
const commitFile = (tmp, path) => `
import os
try:
    os.stat('${tmp}')
    _t = True
except OSError:
    _t = False
if _t:
    try:
        os.rename('${tmp}', '${path}')
    except OSError:
        os.remove('${path}')
        os.rename('${tmp}', '${path}')
print(os.stat('${path}')[6])
`;

const removeFile = (tmp) => `
import os
try:
    os.remove('${tmp}')
except OSError:
    pass
print(0)
`;

/**
 * Write `code` to /flash/lib/<name>.py, replacing any existing file, and
 * return the path written.
 *
 * The code goes to <name>.py.part first, and is checked (size, then SHA-256)
 * before it's renamed into place. So a failed or cancelled save leaves the
 * previous library untouched instead of truncated.
 *
 * @param {{ onProgress?: (sent: number, total: number) => void, signal?: AbortSignal }} [options]
 *   `signal` is checked between pastes, so a cancel takes effect within one
 *   paste (well under a second).
 */
export async function saveLibrary(board, name, code, { onProgress, signal } = {}) {
  const path = `${LIBRARY_DIR}/${name}.py`;
  const tmp = `${path}.part`;
  const bytes = new TextEncoder().encode(code);
  const total = bytes.length;
  let committing = false;
  let offset = 0; // bytes confirmed in tmp
  let failures = 0; // in a row, since offset last moved forward

  const failed = (detail) => {
    if (!board.connected) throw new LibrarySaveError('disconnected', 'The hub disconnected while saving');
    console.warn(`[SPIKE] library save step at ${offset}/${total} failed (${detail}); retrying`);
    if (++failures > MAX_FAILURES) {
      throw new LibrarySaveError(
        'transfer',
        `Gave up after ${MAX_FAILURES} failures in a row at ${offset} of ${total} bytes: ${detail}`,
        { done: offset, total },
      );
    }
  };
  // For steps that are safe to run twice (everything except appendLines):
  // retries a lost or garbled reply.
  const repeatable = async (pythonCode) => {
    for (;;) {
      try {
        return await readPrintJson(board, pythonCode);
      } catch (error) {
        failed(error?.message || String(error));
      }
    }
  };

  try {
    await repeatable(startTempFile(tmp));
    onProgress?.(0, total);

    while (offset < total) {
      signal?.throwIfAborted();
      const end = Math.min(offset + PASTE_BYTES, total);
      let reply;
      let detail;
      try {
        reply = await readPrintJson(board, appendLines(tmp, bytes.subarray(offset, end)));
        detail = `hub reported ${reply} bytes, expected ${end}`;
      } catch (error) {
        detail = error?.message || String(error);
      }
      if (reply === end) {
        offset = end;
        failures = 0;
        onProgress?.(offset, total);
        continue;
      }

      failed(detail);
      // The paste may have partly (or, if only the reply was lost, fully)
      // landed. Damaged lines never write, so whatever landed is whole lines
      // and safe to continue from. (`end` itself needn't be a whole number
      // of lines from `offset`: the file's last line is usually short.)
      const landed = await repeatable(probeSize(tmp));
      const wholeLines = landed === end || (landed - offset) % LINE_BYTES === 0;
      if (!Number.isInteger(landed) || landed < offset || landed > end || !wholeLines) {
        // Can't happen given the line-length check; fail rather than guess.
        throw new LibrarySaveError(
          'transfer',
          `Unexpected size ${landed} after a failed paste (${offset}–${end})`,
          { done: offset, total },
        );
      }
      // Data that landed is progress even if its reply didn't. (offset only
      // ever grows, so resetting here can't loop forever.)
      if (landed > offset) failures = 0;
      offset = landed;
      onProgress?.(offset, total);
    }

    signal?.throwIfAborted();
    const hubHash = await repeatable(hashFile(tmp));
    if (hubHash !== null && hubHash !== await sha256Hex(bytes)) {
      throw new LibrarySaveError('verify', `SHA-256 mismatch for ${tmp}`);
    }

    // Past this point the old library may already be gone, so a failure
    // keeps tmp rather than deleting the only good copy.
    committing = true;
    const size = await repeatable(commitFile(tmp, path));
    if (size !== total) throw new Error(`Saved ${path}, but the hub reports ${size} of ${total} bytes`);
    return path;
  } catch (error) {
    if (!committing && board.connected) {
      try {
        await readPrintJson(board, removeFile(tmp));
      } catch { /* best effort: a stray .part file is harmless */ }
    }
    throw error;
  }
}
