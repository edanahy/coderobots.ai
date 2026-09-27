/**
 * Framing for the LEGO SPIKE Prime protocol (Hub OS), used identically over
 * USB serial and BLE. Port of LEGO's reference implementation
 * (github.com/LEGO/spike-prime-docs examples/python/cobs.py):
 *
 *   1. COBS-escape 0x00, 0x01 and 0x02 (not just 0x00 like standard COBS)
 *   2. XOR every byte with 0x03 (so the output never contains Ctrl-C, which
 *      would drop the hub out of Hub OS into the MicroPython REPL)
 *   3. Terminate with 0x02 (optionally prefix 0x01 for high priority)
 */

const DELIMITER = 0x02;
const HIGH_PRIORITY = 0x01;
const NO_DELIMITER = 0xff;
const COBS_CODE_OFFSET = DELIMITER;
const MAX_BLOCK_SIZE = 84;
const XOR = 0x03;

export function cobsEncode(data) {
  const out = [];
  let codeIndex = 0;
  let block = 0;
  const beginBlock = () => {
    codeIndex = out.length;
    out.push(NO_DELIMITER); // patched below once the block's end is known
    block = 1;
  };

  beginBlock();
  for (const byte of data) {
    if (byte > DELIMITER) {
      out.push(byte);
      block += 1;
    }
    if (byte <= DELIMITER || block > MAX_BLOCK_SIZE) {
      if (byte <= DELIMITER) {
        out[codeIndex] = byte * MAX_BLOCK_SIZE + block + COBS_CODE_OFFSET;
      }
      beginBlock();
    }
  }
  out[codeIndex] = block + COBS_CODE_OFFSET;
  return Uint8Array.from(out);
}

export function cobsDecode(data) {
  const out = [];
  const unescape = (code) => {
    if (code === NO_DELIMITER) return [null, MAX_BLOCK_SIZE + 1];
    let value = Math.floor((code - COBS_CODE_OFFSET) / MAX_BLOCK_SIZE);
    let block = (code - COBS_CODE_OFFSET) % MAX_BLOCK_SIZE;
    if (block === 0) {
      block = MAX_BLOCK_SIZE;
      value -= 1;
    }
    return [value, block];
  };

  if (!data.length) return new Uint8Array(0);
  let [value, block] = unescape(data[0]);
  for (let i = 1; i < data.length; i += 1) {
    block -= 1;
    if (block > 0) {
      out.push(data[i]);
      continue;
    }
    if (value !== null) out.push(value);
    [value, block] = unescape(data[i]);
  }
  return Uint8Array.from(out);
}

/** Encode, escape and frame one message payload for transmission. */
export function pack(payload) {
  const encoded = cobsEncode(payload);
  const frame = new Uint8Array(encoded.length + 1);
  for (let i = 0; i < encoded.length; i += 1) frame[i] = encoded[i] ^ XOR;
  frame[encoded.length] = DELIMITER;
  return frame;
}

/** Reverse of pack() for a frame body (delimiters already stripped). */
export function unpackBody(body) {
  const unxored = new Uint8Array(body.length);
  for (let i = 0; i < body.length; i += 1) unxored[i] = body[i] ^ XOR;
  return cobsDecode(unxored);
}

/**
 * Streaming deframer. Feed it raw bytes as they arrive (in any chunking);
 * it calls onMessage(payload) for every complete, decoded message and
 * onError(error) for frames that fail to decode (which are dropped).
 *
 * Follows the priority rules in the protocol docs: 0x01 starts a
 * high-priority message (pausing any low-priority one in progress), 0x02
 * ends whichever message is in progress.
 */
export class FrameParser {
  constructor(onMessage, onError = () => {}) {
    this.onMessage = onMessage;
    this.onError = onError;
    this.low = [];
    this.high = [];
    this.inHigh = false;
  }

  push(bytes) {
    for (const byte of bytes) {
      if (byte === HIGH_PRIORITY) {
        // A second 0x01 before the high-priority message ended is a sync
        // error: drop it and start over.
        if (this.inHigh) this.high = [];
        this.inHigh = true;
      } else if (byte === DELIMITER) {
        if (this.inHigh) {
          this.emit(this.high);
          this.high = [];
          this.inHigh = false; // resume the paused low-priority message
        } else {
          this.emit(this.low);
          this.low = [];
        }
      } else if (this.inHigh) {
        this.high.push(byte);
      } else {
        this.low.push(byte);
      }
    }
  }

  emit(body) {
    if (!body.length) return;
    let payload;
    try {
      payload = unpackBody(body);
    } catch (error) {
      this.onError(error);
      return;
    }
    if (payload.length) this.onMessage(payload);
  }

  reset() {
    this.low = [];
    this.high = [];
    this.inHigh = false;
  }
}
