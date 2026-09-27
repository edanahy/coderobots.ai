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

// Paste-mode lines are sent whole, so keep each base64 chunk modest.
const BASE64_CHUNK = 2048;

function toBase64(bytes) {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

/**
 * Write `code` to /flash/lib/<name>.py (replacing any existing file) and
 * verify the stored size. Returns the path written.
 */
export async function saveLibrary(board, name, code) {
  const path = `${LIBRARY_DIR}/${name}.py`;
  const bytes = new TextEncoder().encode(code);
  const base64 = toBase64(bytes);

  await board.paste(`
import os
try:
    os.mkdir('${LIBRARY_DIR}')
except OSError:
    pass
open('${path}', 'wb').close()
`, { hidden: true });

  for (let i = 0; i < base64.length; i += BASE64_CHUNK) {
    await board.paste(`
import binascii
with open('${path}', 'ab') as f:
    f.write(binascii.a2b_base64('${base64.slice(i, i + BASE64_CHUNK)}'))
`, { hidden: true });
  }

  const size = await readPrintJson(board, `
import os
print(os.stat('${path}')[6])
`);
  if (size !== bytes.length) {
    throw new Error(`Saved ${size} of ${bytes.length} bytes — please try again.`);
  }
  return path;
}
