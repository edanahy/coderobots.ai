/**
 * USB transport for the SPIKE Prime protocol, layered on the microRepl Board
 * that already owns the WebSerial port. While this transport is attached the
 * Board hands every incoming byte to us instead of its REPL/terminal logic.
 *
 * Entering Hub OS from the REPL is a MicroPython soft reboot (Ctrl-D), which
 * first prints a plain-text banner ("MPY: sync filesystems / MPY: soft
 * reboot") before Hub OS starts speaking framed binary. expectRebootBanner()
 * routes bytes to `onText` until that banner has passed.
 */

const REBOOT_MARKER = 'soft reboot\r\n';

// latin1 keeps a 1:1 byte↔char mapping, so a marker index is a byte offset.
const latin1 = new TextDecoder('latin1');

export function createBoardTransport(board, { onText } = {}) {
  let receiver = null;
  let textMode = false;
  let textTail = '';
  let textTimer = null;

  const toBinary = (rest) => {
    textMode = false;
    textTail = '';
    clearTimeout(textTimer);
    textTimer = null;
    if (rest?.length) receiver?.(rest);
  };

  board.setRawReceiver((chunk) => {
    if (!textMode) {
      receiver?.(chunk);
      return;
    }
    const text = latin1.decode(chunk);
    const index = (textTail + text).indexOf(REBOOT_MARKER);
    if (index === -1) {
      onText?.(text);
      textTail = (textTail + text).slice(-REBOOT_MARKER.length);
      return;
    }
    // textTail is shorter than the marker, so the marker always ends inside
    // this chunk.
    const end = index + REBOOT_MARKER.length - textTail.length;
    onText?.(text.slice(0, end));
    toBinary(chunk.subarray(end));
  });

  return {
    kind: 'usb',
    // Replaced by the hub's limit after the handshake (512 on firmware 1.8).
    maxPacketSize: 512,
    packetGapMs: 5,
    setReceiver(fn) {
      receiver = typeof fn === 'function' ? fn : null;
    },
    write: (bytes) => board.writeBytes(bytes),
    /** Treat input as text until the soft-reboot banner (or `timeoutMs`). */
    expectRebootBanner(timeoutMs = 3000) {
      textMode = true;
      textTail = '';
      clearTimeout(textTimer);
      textTimer = setTimeout(() => toBinary(), timeoutMs);
    },
    close() {
      clearTimeout(textTimer);
      receiver = null;
      board.setRawReceiver(null);
    },
  };
}
