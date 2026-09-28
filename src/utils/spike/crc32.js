/**
 * CRC32 as the SPIKE Prime protocol expects it: standard IEEE CRC-32 (same
 * as Python's binascii.crc32), with the input zero-padded to a multiple of
 * 4 bytes. `seed` chains a running CRC across transfer chunks.
 */

const TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

export function spikeCrc32(data, seed = 0) {
  let crc = (seed ^ 0xffffffff) >>> 0;
  const update = (byte) => {
    crc = TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  };
  for (const byte of data) update(byte);
  const remainder = data.length % 4;
  if (remainder) {
    for (let i = remainder; i < 4; i += 1) update(0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
