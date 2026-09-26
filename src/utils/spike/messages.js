/**
 * Message encoders/decoders for the LEGO SPIKE Prime protocol
 * (https://lego.github.io/spike-prime-docs/messages.html). Every message is
 * a uint8 type id followed by little-endian fields; strings are
 * null-terminated UTF-8.
 */

export const MSG = {
  INFO_REQUEST: 0x00,
  INFO_RESPONSE: 0x01,
  START_FILE_UPLOAD_REQUEST: 0x0c,
  START_FILE_UPLOAD_RESPONSE: 0x0d,
  TRANSFER_CHUNK_REQUEST: 0x10,
  TRANSFER_CHUNK_RESPONSE: 0x11,
  GET_HUB_NAME_REQUEST: 0x18,
  GET_HUB_NAME_RESPONSE: 0x19,
  PROGRAM_FLOW_REQUEST: 0x1e,
  PROGRAM_FLOW_RESPONSE: 0x1f,
  PROGRAM_FLOW_NOTIFICATION: 0x20,
  CONSOLE_NOTIFICATION: 0x21,
  DEVICE_NOTIFICATION_REQUEST: 0x28,
  DEVICE_NOTIFICATION_RESPONSE: 0x29,
  TUNNEL_MESSAGE: 0x32,
  DEVICE_NOTIFICATION: 0x3c,
  CLEAR_SLOT_REQUEST: 0x46,
  CLEAR_SLOT_RESPONSE: 0x47,
};

export const PROGRAM_ACTION = { START: 0, STOP: 1 };

const encoder = new TextEncoder();

const view = (bytes) => new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

// Encode a null-terminated UTF-8 string, rejecting it if it (plus the
// terminator) wouldn't fit the protocol's fixed-size field.
function cString(text, maxBytes) {
  const encoded = encoder.encode(text);
  if (encoded.length + 1 > maxBytes) {
    throw new Error(`"${text}" is too long (max ${maxBytes - 1} bytes)`);
  }
  const out = new Uint8Array(encoded.length + 1);
  out.set(encoded);
  return out;
}

export const encodeInfoRequest = () => Uint8Array.of(MSG.INFO_REQUEST);

export const encodeGetHubNameRequest = () => Uint8Array.of(MSG.GET_HUB_NAME_REQUEST);

export function encodeStartFileUploadRequest(fileName, slot, crc) {
  const name = cString(fileName, 32);
  const out = new Uint8Array(1 + name.length + 1 + 4);
  out[0] = MSG.START_FILE_UPLOAD_REQUEST;
  out.set(name, 1);
  out[1 + name.length] = slot;
  view(out).setUint32(2 + name.length, crc, true);
  return out;
}

export function encodeTransferChunkRequest(runningCrc, chunk) {
  const out = new Uint8Array(1 + 4 + 2 + chunk.length);
  const dv = view(out);
  out[0] = MSG.TRANSFER_CHUNK_REQUEST;
  dv.setUint32(1, runningCrc, true);
  dv.setUint16(5, chunk.length, true);
  out.set(chunk, 7);
  return out;
}

export const encodeProgramFlowRequest = (action, slot) =>
  Uint8Array.of(MSG.PROGRAM_FLOW_REQUEST, action, slot);

export const encodeClearSlotRequest = (slot) => Uint8Array.of(MSG.CLEAR_SLOT_REQUEST, slot);

export function encodeDeviceNotificationRequest(intervalMs) {
  const out = new Uint8Array(3);
  out[0] = MSG.DEVICE_NOTIFICATION_REQUEST;
  view(out).setUint16(1, intervalMs, true);
  return out;
}

/** Generic "status" responses: byte 1 is 0x00 = acknowledged. */
export const isAcknowledged = (payload) => payload.length > 1 && payload[1] === 0x00;

export function decodeInfoResponse(payload) {
  const dv = view(payload);
  return {
    rpcMajor: payload[1],
    rpcMinor: payload[2],
    rpcBuild: dv.getUint16(3, true),
    firmwareMajor: payload[5],
    firmwareMinor: payload[6],
    firmwareBuild: dv.getUint16(7, true),
    maxPacketSize: dv.getUint16(9, true),
    maxMessageSize: dv.getUint16(11, true),
    maxChunkSize: dv.getUint16(13, true),
    productGroupDevice: dv.getUint16(15, true),
  };
}

const nullTerminated = (bytes) => {
  const end = bytes.indexOf(0);
  return end === -1 ? bytes : bytes.subarray(0, end);
};

export const decodeHubName = (payload) =>
  new TextDecoder().decode(nullTerminated(payload.subarray(1)));

/** Raw UTF-8 bytes of a console message (decode with a streaming decoder). */
export const consoleBytes = (payload) => nullTerminated(payload.subarray(1));

/** true when the hub reports a program started, false when it stopped. */
export const decodeProgramFlowNotification = (payload) => payload[1] === PROGRAM_ACTION.START;

// Enumerations (https://lego.github.io/spike-prime-docs/enums.html).
export const PORTS = ['A', 'B', 'C', 'D', 'E', 'F'];
export const MOTOR_TYPES = { 0x30: 'medium', 0x31: 'large', 0x41: 'small' };
export const COLORS = {
  0: 'black', 1: 'magenta', 2: 'purple', 3: 'blue', 4: 'azure', 5: 'turquoise',
  6: 'green', 7: 'yellow', 8: 'orange', 9: 'red', 10: 'white',
};
export const HUB_FACES = ['top', 'front', 'right', 'bottom', 'back', 'left'];

const portName = (index) => PORTS[index] ?? `?${index}`;

// Device-message parsers keyed by id: [total size incl. id byte, parse fn].
const DEVICE_MESSAGES = {
  0x00: [2, (p) => ({ type: 'battery', level: p[1] })],
  0x01: [21, (p, dv) => ({
    type: 'imu',
    faceUp: HUB_FACES[p[1]] ?? null,
    yawFace: HUB_FACES[p[2]] ?? null,
    // Angles are decidegrees (a hub lying flat reads accel ≈ (9, 0, 985)
    // milli-g alongside pitch ≈ -5, i.e. -0.5°).
    yaw: dv.getInt16(3, true) / 10,
    pitch: dv.getInt16(5, true) / 10,
    roll: dv.getInt16(7, true) / 10,
    accel: [dv.getInt16(9, true), dv.getInt16(11, true), dv.getInt16(13, true)],
    gyro: [dv.getInt16(15, true), dv.getInt16(17, true), dv.getInt16(19, true)],
  })],
  0x02: [26, (p) => ({ type: 'display', pixels: Array.from(p.subarray(1, 26)) })],
  0x0a: [12, (p, dv) => ({
    type: 'motor',
    port: portName(p[1]),
    motorType: MOTOR_TYPES[p[2]] ?? 'motor',
    absolutePosition: dv.getInt16(3, true),
    power: dv.getInt16(5, true),
    speed: dv.getInt8(7),
    position: dv.getInt32(8, true),
  })],
  0x0b: [4, (p) => ({ type: 'force', port: portName(p[1]), value: p[2], pressed: p[3] === 1 })],
  0x0c: [9, (p, dv) => ({
    type: 'color',
    port: portName(p[1]),
    color: COLORS[dv.getInt8(2)] ?? null,
    rgb: [dv.getUint16(3, true), dv.getUint16(5, true), dv.getUint16(7, true)],
  })],
  0x0d: [4, (p, dv) => {
    const distance = dv.getInt16(2, true);
    return { type: 'distance', port: portName(p[1]), distance: distance < 0 ? null : distance };
  }],
  0x0e: [11, (p) => ({
    type: 'colorMatrix',
    port: portName(p[1]),
    pixels: Array.from(p.subarray(2, 11)).map((v) => ({ brightness: v >> 4, color: COLORS[v & 0x0f] ?? null })),
  })],
};

/**
 * Parse a DeviceNotification into a full snapshot of the hub's state. Each
 * notification lists every attached device, so ports absent from it are
 * empty.
 */
export function decodeDeviceNotification(payload) {
  const snapshot = { battery: null, imu: null, display: null, ports: {} };
  const size = view(payload).getUint16(1, true);
  let data = payload.subarray(3, 3 + size);
  while (data.length) {
    const entry = DEVICE_MESSAGES[data[0]];
    if (!entry || data.length < entry[0]) break; // unknown/truncated: stop parsing
    const [length, parse] = entry;
    const message = parse(data, view(data));
    if (message.type === 'battery') snapshot.battery = message.level;
    else if (message.type === 'imu') snapshot.imu = message;
    else if (message.type === 'display') snapshot.display = message.pixels;
    else snapshot.ports[message.port] = message;
    data = data.subarray(length);
  }
  return snapshot;
}
