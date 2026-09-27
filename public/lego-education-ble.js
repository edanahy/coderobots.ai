/**
 * LEGO Education Web Bluetooth API
 * 
 * JavaScript port of the LEGO Education Python BLE RPC protocol.
 * Enables browser-based communication with LEGO Education hardware
 * (Single Motor, Double Motor, Color Sensor, Controller) via Web Bluetooth.
 *
 * Function names match the Python API exactly (snake_case).
 *
 * Usage:
 *   const le = legoeducation;
 *   const singlemotor = new le.SingleMotor();
 *   await singlemotor.connect();
 *   await singlemotor.motor_run({ direction: le.MOTOR_MOVE_DIRECTION_CLOCKWISE });
 *
 * @version 1.1.0
 * @license MIT
 */

// ============================================================
//  BLE Service & Characteristic UUIDs
// ============================================================

const SERVICE_UUID        = '0000fd02-0000-1000-8000-00805f9b34fb';
const WRITE_CHAR_UUID     = '0000fd02-0001-1000-8000-00805f9b34fb';
const NOTIFY_CHAR_UUID    = '0000fd02-0002-1000-8000-00805f9b34fb';
const LEGO_COMPANY_ID     = 0x0397;

// ============================================================
//  RPC Version
// ============================================================

const RPC_VERSION_MAJOR = 1;
const RPC_VERSION_MINOR = 0;
const RPC_VERSION_BUILD = 73;

// ============================================================
//  Enum Constants
// ============================================================

const PRODUCT_GROUP_DEVICE_SINGLE_MOTOR = 512;
const PRODUCT_GROUP_DEVICE_DOUBLE_MOTOR = 513;
const PRODUCT_GROUP_DEVICE_COLOR_SENSOR = 514;
const PRODUCT_GROUP_DEVICE_CONTROLLER   = 515;

const MOTOR_BITS_LEFT  = 1;
const MOTOR_BITS_RIGHT = 2;
const MOTOR_BITS_BOTH  = 3;
const MOTOR_LEFT  = MOTOR_BITS_LEFT  - 1;
const MOTOR_RIGHT = MOTOR_BITS_RIGHT - 1;
const MOTOR_BOTH  = MOTOR_BITS_BOTH  - 1;

const DEVICE_FACE_TOP = 0, DEVICE_FACE_FRONT = 1, DEVICE_FACE_RIGHT = 2;
const DEVICE_FACE_BOTTOM = 3, DEVICE_FACE_BACK = 4, DEVICE_FACE_LEFT = 5;
const PROGRAM_ACTION_START = 0, PROGRAM_ACTION_STOP = 1;
const RESPONSE_STATUS_ACK = 0, RESPONSE_STATUS_NACK = 1;
const COMMAND_STATUS_COMPLETED = 0, COMMAND_STATUS_INTERRUPTED = 1, COMMAND_STATUS_NACK = 2;

const MOTOR_END_STATE_DEFAULT = -1, MOTOR_END_STATE_COAST = 0, MOTOR_END_STATE_BRAKE = 1;
const MOTOR_END_STATE_HOLD = 2, MOTOR_END_STATE_CONTINUE = 3;
const MOTOR_END_STATE_SMART_COAST = 4, MOTOR_END_STATE_SMART_BRAKE = 5;

const MOTOR_MOVE_DIRECTION_CLOCKWISE = 0, MOTOR_MOVE_DIRECTION_COUNTERCLOCKWISE = 1;
const MOTOR_MOVE_DIRECTION_SHORTEST = 2, MOTOR_MOVE_DIRECTION_LONGEST = 3;

const MOVEMENT_DIRECTION_FORWARD = 0, MOVEMENT_DIRECTION_BACKWARD = 1;
const MOVEMENT_DIRECTION_LEFT = 2, MOVEMENT_DIRECTION_RIGHT = 3;
const MOVEMENT_MOVE_DIRECTION_FORWARD = 0, MOVEMENT_MOVE_DIRECTION_BACKWARD = 1;
const MOVEMENT_TURN_DIRECTION_LEFT = 2, MOVEMENT_TURN_DIRECTION_RIGHT = 3;

const LIGHT_PATTERN_SOLID = 0, LIGHT_PATTERN_BREATHE = 1, LIGHT_PATTERN_PULSE = 2;
const LIGHT_PATTERN_SHORT_BLINK = 3, LIGHT_PATTERN_LONG_BLINK = 4, LIGHT_PATTERN_DOUBLE_BLINK = 5;

const SOUND_PATTERN_BEEP_SINGLE = 0, SOUND_PATTERN_BEEP_DOUBLE = 1;
const SOUND_PATTERN_BEEP_TRIPLE = 2, SOUND_PATTERN_BEEP_UP_MIDDLE_DOWN = 3;

const BUTTON_STATE_RELEASED = 0, BUTTON_STATE_PRESSED = 1;
const USB_POWER_STATE_USB_NOT_CONNECTED = 0, USB_POWER_STATE_USB_CONNECTED = 1;

const MOTION_GESTURE_NO_GESTURE = -1, MOTION_GESTURE_TAPPED = 0;
const MOTION_GESTURE_DOUBLE_TAPPED = 1, MOTION_GESTURE_COLLISION = 2;
const MOTION_GESTURE_SHAKE = 3, MOTION_GESTURE_FREEFALL = 4;

const MOTOR_STATE_READY = 0, MOTOR_STATE_RUNNING = 1, MOTOR_STATE_STALLED = 2;
const MOTOR_STATE_CMD_ABORTED = 3, MOTOR_STATE_REGULATION_ERROR = 4;
const MOTOR_STATE_MOTOR_DISCONNECTED = 5, MOTOR_STATE_HOLDING = 6;
const MOTOR_STATE_DC_RUNNING = 7, MOTOR_STATE_NOT_ALLOWED_TO_RUN = 8;

const MOTOR_GESTURE_NO_GESTURE = -1, MOTOR_GESTURE_SLOW_CLOCKWISE = 1;
const MOTOR_GESTURE_FAST_CLOCKWISE = 2, MOTOR_GESTURE_SLOW_COUNTERCLOCKWISE = 3;
const MOTOR_GESTURE_FAST_COUNTERCLOCKWISE = 4, MOTOR_GESTURE_WIGGLED = 5;

// ============================================================
//  App-Aligned Color Constants & Translation
// ============================================================

const LEGO_COLOR_NOCOLOR = 0, LEGO_COLOR_RED = 1, LEGO_COLOR_YELLOW = 2;
const LEGO_COLOR_BLUE = 3, LEGO_COLOR_TEAL = 4, LEGO_COLOR_GREEN = 5;
const LEGO_COLOR_PURPLE = 6, LEGO_COLOR_WHITE = 7, LEGO_COLOR_MAGENTA = 8;
const LEGO_COLOR_ORANGE = 9, LEGO_COLOR_AZURE = 10;

const _FW_NONE = -1, _FW_BLACK = 0, _FW_MAGENTA = 1, _FW_PURPLE = 2;
const _FW_BLUE = 3, _FW_AZURE = 4, _FW_TURQUOISE = 5, _FW_GREEN = 6;
const _FW_YELLOW = 7, _FW_ORANGE = 8, _FW_RED = 9, _FW_WHITE = 10;

const _FIRMWARE_TO_APP = new Map([
  [_FW_NONE, LEGO_COLOR_NOCOLOR], [_FW_BLACK, LEGO_COLOR_NOCOLOR],
  [_FW_MAGENTA, LEGO_COLOR_MAGENTA], [_FW_PURPLE, LEGO_COLOR_PURPLE],
  [_FW_BLUE, LEGO_COLOR_BLUE], [_FW_AZURE, LEGO_COLOR_AZURE],
  [_FW_TURQUOISE, LEGO_COLOR_TEAL], [_FW_GREEN, LEGO_COLOR_GREEN],
  [_FW_YELLOW, LEGO_COLOR_YELLOW], [_FW_ORANGE, LEGO_COLOR_ORANGE],
  [_FW_RED, LEGO_COLOR_RED], [_FW_WHITE, LEGO_COLOR_WHITE],
]);
const _APP_TO_FIRMWARE = new Map([
  [LEGO_COLOR_NOCOLOR, _FW_NONE], [LEGO_COLOR_RED, _FW_RED],
  [LEGO_COLOR_YELLOW, _FW_YELLOW], [LEGO_COLOR_BLUE, _FW_BLUE],
  [LEGO_COLOR_TEAL, _FW_TURQUOISE], [LEGO_COLOR_GREEN, _FW_GREEN],
  [LEGO_COLOR_PURPLE, _FW_PURPLE], [LEGO_COLOR_WHITE, _FW_WHITE],
  [LEGO_COLOR_MAGENTA, _FW_MAGENTA], [LEGO_COLOR_ORANGE, _FW_ORANGE],
  [LEGO_COLOR_AZURE, _FW_AZURE],
]);

function _firmwareToApp(fw) { return _FIRMWARE_TO_APP.has(fw) ? _FIRMWARE_TO_APP.get(fw) : LEGO_COLOR_NOCOLOR; }
function _appToFirmware(app) { return _APP_TO_FIRMWARE.has(app) ? _APP_TO_FIRMWARE.get(app) : _FW_NONE; }

const LEGO_COLOR_NAME_MAP = {
  [LEGO_COLOR_NOCOLOR]:'LEGO_COLOR_NOCOLOR', [LEGO_COLOR_RED]:'LEGO_COLOR_RED',
  [LEGO_COLOR_YELLOW]:'LEGO_COLOR_YELLOW', [LEGO_COLOR_BLUE]:'LEGO_COLOR_BLUE',
  [LEGO_COLOR_TEAL]:'LEGO_COLOR_TEAL', [LEGO_COLOR_GREEN]:'LEGO_COLOR_GREEN',
  [LEGO_COLOR_PURPLE]:'LEGO_COLOR_PURPLE', [LEGO_COLOR_WHITE]:'LEGO_COLOR_WHITE',
  [LEGO_COLOR_MAGENTA]:'LEGO_COLOR_MAGENTA', [LEGO_COLOR_ORANGE]:'LEGO_COLOR_ORANGE',
  [LEGO_COLOR_AZURE]:'LEGO_COLOR_AZURE',
};
const LEGO_COLOR_HEX_MAP = {
  [LEGO_COLOR_RED]:'#de1a21', [LEGO_COLOR_YELLOW]:'#ffd400', [LEGO_COLOR_BLUE]:'#006cb8',
  [LEGO_COLOR_GREEN]:'#61a836', [LEGO_COLOR_PURPLE]:'#4b2f91', [LEGO_COLOR_MAGENTA]:'#e4599e',
  [LEGO_COLOR_ORANGE]:'#f57d20', [LEGO_COLOR_AZURE]:'#78bfea',
};
const SENSOR_DETECTABLE_COLORS = new Set([LEGO_COLOR_RED,LEGO_COLOR_YELLOW,LEGO_COLOR_BLUE,LEGO_COLOR_TEAL,LEGO_COLOR_GREEN,LEGO_COLOR_PURPLE,LEGO_COLOR_WHITE]);
const CARD_COLORS = new Set([LEGO_COLOR_RED,LEGO_COLOR_YELLOW,LEGO_COLOR_BLUE,LEGO_COLOR_GREEN,LEGO_COLOR_PURPLE,LEGO_COLOR_MAGENTA,LEGO_COLOR_AZURE,LEGO_COLOR_ORANGE]);

// ============================================================
//  Message Type IDs
// ============================================================

const MSG = {
  INFO_REQUEST:0, INFO_RESPONSE:1,
  DEVICE_UUID_REQUEST:26, DEVICE_UUID_RESPONSE:27,
  PROGRAM_FLOW_NOTIFICATION:32,
  DEVICE_NOTIFICATION_REQUEST:40, DEVICE_NOTIFICATION_RESPONSE:41,
  DEVICE_NOTIFICATION:60,
  LIGHT_COLOR_COMMAND:110, LIGHT_COLOR_RESULT:111,
  PLAY_BEEP_COMMAND:112, PLAY_BEEP_RESULT:113,
  STOP_SOUND_COMMAND:114, STOP_SOUND_RESULT:115,
  MOTOR_RESET_RELATIVE_POSITION_COMMAND:120, MOTOR_RESET_RELATIVE_POSITION_RESULT:121,
  MOTOR_RUN_COMMAND:122, MOTOR_RUN_RESULT:123,
  MOTOR_RUN_FOR_DEGREES_COMMAND:124, MOTOR_RUN_FOR_DEGREES_RESULT:125,
  MOTOR_RUN_FOR_TIME_COMMAND:126, MOTOR_RUN_FOR_TIME_RESULT:127,
  MOTOR_RUN_TO_ABSOLUTE_POSITION_COMMAND:128, MOTOR_RUN_TO_ABSOLUTE_POSITION_RESULT:129,
  MOTOR_RUN_TO_RELATIVE_POSITION_COMMAND:130, MOTOR_RUN_TO_RELATIVE_POSITION_RESULT:131,
  MOTOR_SET_DUTY_CYCLE_COMMAND:132, MOTOR_SET_DUTY_CYCLE_RESULT:133,
  MOTOR_STOP_COMMAND:138, MOTOR_STOP_RESULT:139,
  MOTOR_SET_SPEED_COMMAND:140, MOTOR_SET_SPEED_RESULT:141,
  MOTOR_SET_END_STATE_COMMAND:142, MOTOR_SET_END_STATE_RESULT:143,
  MOTOR_SET_ACCELERATION_COMMAND:144, MOTOR_SET_ACCELERATION_RESULT:145,
  MOVEMENT_MOVE_COMMAND:150, MOVEMENT_MOVE_RESULT:151,
  MOVEMENT_MOVE_FOR_TIME_COMMAND:152, MOVEMENT_MOVE_FOR_TIME_RESULT:153,
  MOVEMENT_MOVE_FOR_DEGREES_COMMAND:154, MOVEMENT_MOVE_FOR_DEGREES_RESULT:155,
  MOVEMENT_MOVE_TANK_COMMAND:156, MOVEMENT_MOVE_TANK_RESULT:157,
  MOVEMENT_MOVE_TANK_FOR_DEGREES_COMMAND:158, MOVEMENT_MOVE_TANK_FOR_DEGREES_RESULT:159,
  MOVEMENT_TURN_FOR_DEGREES_COMMAND:160, MOVEMENT_TURN_FOR_DEGREES_RESULT:161,
  MOVEMENT_STOP_COMMAND:168, MOVEMENT_STOP_RESULT:169,
  MOVEMENT_SET_SPEED_COMMAND:170, MOVEMENT_SET_SPEED_RESULT:171,
  MOVEMENT_SET_END_STATE_COMMAND:172, MOVEMENT_SET_END_STATE_RESULT:173,
  MOVEMENT_SET_ACCELERATION_COMMAND:174, MOVEMENT_SET_ACCELERATION_RESULT:175,
  MOVEMENT_SET_TURN_STEERING_COMMAND:176, MOVEMENT_SET_TURN_STEERING_RESULT:177,
  IMU_SET_YAW_FACE_COMMAND:190, IMU_SET_YAW_FACE_RESULT:191,
  IMU_RESET_YAW_AXIS_COMMAND:192, IMU_RESET_YAW_AXIS_RESULT:193,
};

const NOTIF = { INFO_DEVICE:0, IMU_DEVICE:1, CARD:3, BUTTON_STATE:4, MOTOR:10, COLOR_SENSOR:12, CONTROLLER:15, IMU_GESTURE:16 };

// ============================================================
//  RPC Serialization Helpers
// ============================================================

function packFields(msgId, fields) {
  let size = 1;
  for (const [type] of fields) { switch(type) { case 'u8': case 'i8': size+=1; break; case 'u16': case 'i16': size+=2; break; case 'u32': case 'i32': size+=4; break; } }
  const buf = new ArrayBuffer(size); const dv = new DataView(buf); let off = 0;
  dv.setUint8(off++, msgId);
  for (const [type, value] of fields) {
    switch(type) {
      case 'u8': dv.setUint8(off,value); off+=1; break; case 'i8': dv.setInt8(off,value); off+=1; break;
      case 'u16': dv.setUint16(off,value,true); off+=2; break; case 'i16': dv.setInt16(off,value,true); off+=2; break;
      case 'u32': dv.setUint32(off,value>>>0,true); off+=4; break; case 'i32': dv.setInt32(off,value,true); off+=4; break;
    }
  }
  return new Uint8Array(buf);
}
const FIELD_BYTES = { u8:1, i8:1, u16:2, i16:2, u32:4, i32:4 };
function readField(dv, off, type) {
  const bytes = FIELD_BYTES[type];
  if (bytes === undefined) throw new Error(`Unknown field type: ${type}`);
  // Bounds-safe read: IMU notifications are declared as 20 bytes in
  // NOTIF_SIZE but _dImuDevice actually reads 22. Rather than crash the
  // whole notification pipeline when the packet is shorter than the
  // handler expects, return zero for OOB reads so the handler still
  // produces a well-formed object.
  if (off < 0 || off + bytes > dv.byteLength) return [0, off + bytes];
  switch(type) {
    case 'u8': return [dv.getUint8(off), off+1]; case 'i8': return [dv.getInt8(off), off+1];
    case 'u16': return [dv.getUint16(off,true), off+2]; case 'i16': return [dv.getInt16(off,true), off+2];
    case 'u32': return [dv.getUint32(off,true), off+4]; case 'i32': return [dv.getInt32(off,true), off+4];
  }
}

// ============================================================
//  RPC Message Builders
// ============================================================

const RPC = {
  infoRequest()                          { return packFields(MSG.INFO_REQUEST, []); },
  deviceUuidRequest()                    { return packFields(MSG.DEVICE_UUID_REQUEST, []); },
  programFlowNotification(action)        { return packFields(MSG.PROGRAM_FLOW_NOTIFICATION, [['u8',action]]); },
  deviceNotificationRequest(delay)       { return packFields(MSG.DEVICE_NOTIFICATION_REQUEST, [['u16',delay]]); },
  lightColorCommand(color,pattern,intensity) { return packFields(MSG.LIGHT_COLOR_COMMAND, [['i8',color],['u8',pattern],['u8',intensity]]); },
  playBeepCommand(pattern,frequency,reps){ return packFields(MSG.PLAY_BEEP_COMMAND, [['u8',pattern],['u16',frequency],['u8',reps]]); },
  stopSoundCommand()                     { return packFields(MSG.STOP_SOUND_COMMAND, []); },
  motorResetRelativePosition(m,pos)      { return packFields(MSG.MOTOR_RESET_RELATIVE_POSITION_COMMAND, [['u8',m],['i32',pos]]); },
  motorRun(m,dir)                        { return packFields(MSG.MOTOR_RUN_COMMAND, [['u8',m],['u8',dir]]); },
  motorRunForDegrees(m,deg,dir)          { return packFields(MSG.MOTOR_RUN_FOR_DEGREES_COMMAND, [['u8',m],['i32',deg],['u8',dir]]); },
  motorRunForTime(m,ms,dir)              { return packFields(MSG.MOTOR_RUN_FOR_TIME_COMMAND, [['u8',m],['u32',ms],['u8',dir]]); },
  motorRunToAbsolutePosition(m,pos,dir)  { return packFields(MSG.MOTOR_RUN_TO_ABSOLUTE_POSITION_COMMAND, [['u8',m],['u16',pos],['u8',dir]]); },
  motorRunToRelativePosition(m,pos)      { return packFields(MSG.MOTOR_RUN_TO_RELATIVE_POSITION_COMMAND, [['u8',m],['i32',pos]]); },
  motorSetDutyCycle(m,dc)                { return packFields(MSG.MOTOR_SET_DUTY_CYCLE_COMMAND, [['u8',m],['i16',dc]]); },
  motorStop(m)                           { return packFields(MSG.MOTOR_STOP_COMMAND, [['u8',m]]); },
  motorSetSpeed(m,spd)                   { return packFields(MSG.MOTOR_SET_SPEED_COMMAND, [['u8',m],['i8',spd]]); },
  motorSetEndState(m,es)                 { return packFields(MSG.MOTOR_SET_END_STATE_COMMAND, [['u8',m],['i8',es]]); },
  motorSetAcceleration(m,a,d)            { return packFields(MSG.MOTOR_SET_ACCELERATION_COMMAND, [['u8',m],['u8',a],['u8',d]]); },
  movementMove(dir)                      { return packFields(MSG.MOVEMENT_MOVE_COMMAND, [['u8',dir]]); },
  movementMoveForTime(ms,dir)            { return packFields(MSG.MOVEMENT_MOVE_FOR_TIME_COMMAND, [['u32',ms],['u8',dir]]); },
  movementMoveForDegrees(deg,dir)        { return packFields(MSG.MOVEMENT_MOVE_FOR_DEGREES_COMMAND, [['i32',deg],['u8',dir]]); },
  movementMoveTank(sL,sR)               { return packFields(MSG.MOVEMENT_MOVE_TANK_COMMAND, [['i8',sL],['i8',sR]]); },
  movementMoveTankForDegrees(deg,sL,sR)  { return packFields(MSG.MOVEMENT_MOVE_TANK_FOR_DEGREES_COMMAND, [['i32',deg],['i8',sL],['i8',sR]]); },
  movementTurnForDegrees(deg,dir)        { return packFields(MSG.MOVEMENT_TURN_FOR_DEGREES_COMMAND, [['i32',deg],['u8',dir]]); },
  movementStop()                         { return packFields(MSG.MOVEMENT_STOP_COMMAND, []); },
  movementSetSpeed(spd)                  { return packFields(MSG.MOVEMENT_SET_SPEED_COMMAND, [['i8',spd]]); },
  movementSetEndState(es)                { return packFields(MSG.MOVEMENT_SET_END_STATE_COMMAND, [['i8',es]]); },
  movementSetAcceleration(a,d)           { return packFields(MSG.MOVEMENT_SET_ACCELERATION_COMMAND, [['u8',a],['u8',d]]); },
  movementSetTurnSteering(s)             { return packFields(MSG.MOVEMENT_SET_TURN_STEERING_COMMAND, [['u8',s]]); },
  imuSetYawFace(f)                       { return packFields(MSG.IMU_SET_YAW_FACE_COMMAND, [['u8',f]]); },
  imuResetYawAxis(v)                     { return packFields(MSG.IMU_RESET_YAW_AXIS_COMMAND, [['i16',v]]); },
};

// ============================================================
//  Response Deserializers
// ============================================================

function deserializeInfoResponse(p) {
  const dv = new DataView(p.buffer, p.byteOffset, p.byteLength); let o=0, v;
  [v,o]=readField(dv,o,'u8'); const rpcMajor=v; [v,o]=readField(dv,o,'u8'); const rpcMinor=v;
  [v,o]=readField(dv,o,'u16'); const rpcBuild=v; [v,o]=readField(dv,o,'u8'); const fwMaj=v;
  [v,o]=readField(dv,o,'u8'); const fwMin=v; [v,o]=readField(dv,o,'u16'); const fwBld=v;
  [v,o]=readField(dv,o,'u8'); const blMaj=v; [v,o]=readField(dv,o,'u8'); const blMin=v;
  [v,o]=readField(dv,o,'u16'); const blBld=v; [v,o]=readField(dv,o,'u16'); const maxPkt=v;
  [v,o]=readField(dv,o,'u16'); const pgd=v;
  return { rpcVersion:`${rpcMajor}.${rpcMinor}.${rpcBuild}`, firmwareVersion:`${fwMaj}.${fwMin}.${fwBld}`,
    bootloaderVersion:`${blMaj}.${blMin}.${blBld}`, maxPacketSize:maxPkt, productGroupDevice:pgd,
    rpcMajor, rpcMinor, rpcBuild, firmwareMajor:fwMaj, firmwareMinor:fwMin, firmwareBuild:fwBld };
}
function deserializeDeviceUuidResponse(p) { return { uuid: Array.from(p.slice(0,8)) }; }
function deserializeStatusResult(p) { return { status: p[0] }; }
function deserializeMotorResult(p) { return { motorBitMask: p[0], status: p[1] }; }

// ============================================================
//  Notification Deserializers
// ============================================================

const NOTIF_SIZE = { [NOTIF.INFO_DEVICE]:1, [NOTIF.IMU_DEVICE]:20, [NOTIF.CARD]:3, [NOTIF.BUTTON_STATE]:1, [NOTIF.MOTOR]:12, [NOTIF.COLOR_SENSOR]:12, [NOTIF.CONTROLLER]:6, [NOTIF.IMU_GESTURE]:1 };

function _dInfoDevice(dv,o) { let v; [v,o]=readField(dv,o,'u8'); const bl=v; return {type:'InfoDeviceNotification',batteryLevel:bl,UsbPowerState:USB_POWER_STATE_USB_NOT_CONNECTED}; }
function _dImuDevice(dv,o) { let v; [v,o]=readField(dv,o,'u8'); const ori=v; [v,o]=readField(dv,o,'u8'); const yf=v;
  [v,o]=readField(dv,o,'i16'); const yaw=v; [v,o]=readField(dv,o,'i16'); const pitch=v; [v,o]=readField(dv,o,'i16'); const roll=v;
  [v,o]=readField(dv,o,'i16'); const ax=v; [v,o]=readField(dv,o,'i16'); const ay=v; [v,o]=readField(dv,o,'i16'); const az=v;
  [v,o]=readField(dv,o,'i16'); const gx=v; [v,o]=readField(dv,o,'i16'); const gy=v; [v,o]=readField(dv,o,'i16'); const gz=v;
  return {type:'ImuDeviceNotification',orientation:ori,yawFace:yf,yaw,pitch,roll,accelerometerX:ax,accelerometerY:ay,accelerometerZ:az,gyroscopeX:gx,gyroscopeY:gy,gyroscopeZ:gz}; }
function _dCard(dv,o) { let v; [v,o]=readField(dv,o,'i8'); const c=v; [v,o]=readField(dv,o,'u16'); const s=v; return {type:'CardNotification',color:c,serial:s}; }
function _dButton(dv,o) { let v; [v,o]=readField(dv,o,'u8'); return {type:'ButtonStateNotification',state:v}; }
function _dMotor(dv,o) { let v; [v,o]=readField(dv,o,'u8'); const mbm=v; [v,o]=readField(dv,o,'u8'); const ms=v;
  [v,o]=readField(dv,o,'u16'); const ap=v; [v,o]=readField(dv,o,'i16'); const pw=v; [v,o]=readField(dv,o,'i8'); const sp=v;
  [v,o]=readField(dv,o,'i32'); const pos=v; [v,o]=readField(dv,o,'i8'); const g=v;
  return {type:'MotorNotification',motorBitMask:mbm,motorState:ms,absolutePosition:ap,power:pw,speed:sp,position:pos,gesture:g}; }
function _dColorSensor(dv,o) { let v; [v,o]=readField(dv,o,'u8'); const c=v; [v,o]=readField(dv,o,'u8'); const ref=v;
  [v,o]=readField(dv,o,'u16'); const rr=v; [v,o]=readField(dv,o,'u16'); const rg=v; [v,o]=readField(dv,o,'u16'); const rb=v;
  [v,o]=readField(dv,o,'u16'); const h=v;
  [v,o]=readField(dv,o,'u8'); const s=v; [v,o]=readField(dv,o,'u8'); const val=v;
  return {type:'ColorSensorNotification',color:c,reflection:ref,rawRed:rr,rawGreen:rg,rawBlue:rb,hue:h,saturation:s,value:val}; }
function _dController(dv,o) { let v; [v,o]=readField(dv,o,'i8'); const lp=v; [v,o]=readField(dv,o,'i8'); const rp=v;
  [v,o]=readField(dv,o,'i16'); const la=v; [v,o]=readField(dv,o,'i16'); const ra=v;
  return {type:'ControllerNotification',leftPercent:lp,rightPercent:rp,leftAngle:la,rightAngle:ra}; }
function _dImuGesture(dv,o) { let v; [v,o]=readField(dv,o,'i8'); return {type:'ImuGestureNotification',gesture:v}; }

// ============================================================
//  Device Notification Parser
// ============================================================

function _hexDump(u8, start = 0, end = u8.length) {
  const parts = [];
  for (let i = start; i < end; i++) parts.push(u8[i].toString(16).padStart(2, '0'));
  return parts.join(' ');
}

let _legoDiagLastWarnMs = 0;
function _legoDiag(label, obj) {
  const now = (typeof performance !== 'undefined' ? performance.now() : Date.now());
  if (now - _legoDiagLastWarnMs < 2000) return;
  _legoDiagLastWarnMs = now;
  console.warn(`[LEGO-DIAG] ${label}`, obj);
  if (typeof window !== 'undefined') window.__LEGO_BLE_LAST_BAD_PAYLOAD = obj;
}

function device_notification_parser(payload) {
  const dv = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
  let off = 0, deviceDataLength; [deviceDataLength, off] = readField(dv, off, 'u16');
  const notifications = [], dataEnd = off + deviceDataLength;
  while (off < dataEnd) {
    const ntOff = off;
    const nt = dv.getUint8(off); off += 1;
    const size = NOTIF_SIZE[nt];
    if (size === undefined) {
      _legoDiag(`Unknown notification type: ${nt} at offset ${ntOff}`, {
        nt, ntOff, deviceDataLength, dataEnd,
        payloadLen: payload.length,
        payloadHex: _hexDump(payload),
        remainingHex: _hexDump(payload, ntOff),
        parsedSoFar: notifications.map(n => n.type),
        lastParsed: notifications[notifications.length - 1] || null,
      });
      break;
    }
    let item;
    switch(nt) {
      case NOTIF.INFO_DEVICE: item=_dInfoDevice(dv,off); break; case NOTIF.IMU_DEVICE: item=_dImuDevice(dv,off); break;
      case NOTIF.CARD: item=_dCard(dv,off); break; case NOTIF.BUTTON_STATE: item=_dButton(dv,off); break;
      case NOTIF.MOTOR: item=_dMotor(dv,off); break; case NOTIF.COLOR_SENSOR: item=_dColorSensor(dv,off); break;
      case NOTIF.CONTROLLER: item=_dController(dv,off); break; case NOTIF.IMU_GESTURE: item=_dImuGesture(dv,off); break;
    }
    if (item) {
      if (item.type === 'ColorSensorNotification' || item.type === 'CardNotification') item.color = _firmwareToApp(item.color);
      notifications.push(item);
    }
    off += size;
  }
  return notifications;
}

// ============================================================
//  Motor-Multiplexed Response IDs
// ============================================================

const MOTOR_MULTIPLEXED_RESPONSES = new Set([
  MSG.MOTOR_RESET_RELATIVE_POSITION_RESULT, MSG.MOTOR_RUN_RESULT,
  MSG.MOTOR_RUN_FOR_DEGREES_RESULT, MSG.MOTOR_RUN_FOR_TIME_RESULT,
  MSG.MOTOR_RUN_TO_ABSOLUTE_POSITION_RESULT, MSG.MOTOR_RUN_TO_RELATIVE_POSITION_RESULT,
  MSG.MOTOR_SET_DUTY_CYCLE_RESULT, MSG.MOTOR_STOP_RESULT,
  MSG.MOTOR_SET_SPEED_RESULT, MSG.MOTOR_SET_END_STATE_RESULT, MSG.MOTOR_SET_ACCELERATION_RESULT,
]);

// ============================================================
//  Base Device Class
// ============================================================

const DEFAULT_NOTIFICATION_DELAY = 100;

class LegoDevice {
  constructor() {
    this.connected = false; this.device = null; this.server = null; this.service = null;
    this._writeChar = null; this._notifyChar = null;
    this.max_packet_size = 244; this.product_id = null; this.search_name = null;
    this.info_device = null; this.button = null; this.scanned_card = null;
    this._pendingResponses = new Map(); this._notification_callback = null; this._debug = false;
  }

  set_debug(enabled) { this._debug = !!enabled; }
  _log(...args) { if (this._debug) console.log('[LegoEdu]', ...args); }

  async connect(options = {}) {
    const {
      notification_delay = DEFAULT_NOTIFICATION_DELAY,
      filters,
      optionalServices,
      exclusionFilters,
      device,
    } = options;
    if (!navigator.bluetooth) throw new Error('Web Bluetooth API is not available. Use Chrome/Edge on a supported platform.');
    if (device) {
      this._log('Reusing pre-resolved Bluetooth device...');
      this.device = device;
    } else {
      this._log('Requesting Bluetooth device...');
      const requestArgs = {
        filters: filters || [{ services: [SERVICE_UUID] }],
        optionalServices: optionalServices || [SERVICE_UUID],
      };
      if (exclusionFilters && exclusionFilters.length) requestArgs.exclusionFilters = exclusionFilters;
      this.device = await navigator.bluetooth.requestDevice(requestArgs);
    }
    this._log(`Selected device: ${this.device.name} (${this.device.id})`);
    this.device.addEventListener('gattserverdisconnected', () => {
      this._log('Device disconnected'); this.connected = false; this._rejectAllPending('Device disconnected');
      if (this._onDisconnect) this._onDisconnect();
    });
    this._log('Connecting to GATT server...');
    this.server = await this.device.gatt.connect();
    this.service = await this.server.getPrimaryService(SERVICE_UUID);
    this._writeChar = await this.service.getCharacteristic(WRITE_CHAR_UUID);
    this._notifyChar = await this.service.getCharacteristic(NOTIFY_CHAR_UUID);
    await this._notifyChar.startNotifications();
    this._notifyChar.addEventListener('characteristicvaluechanged', (e) => { this._handleNotification(new Uint8Array(e.target.value.buffer)); });
    this.connected = true;
    await this._sendRaw(RPC.programFlowNotification(PROGRAM_ACTION_START));
    const info = await this._sendAndWait(RPC.infoRequest(), MSG.INFO_RESPONSE, deserializeInfoResponse);
    if (info) { this.max_packet_size = info.maxPacketSize; this._log('Device info:', info); }
    await this._sendAndWait(RPC.deviceNotificationRequest(notification_delay), MSG.DEVICE_NOTIFICATION_RESPONSE, deserializeStatusResult);
    await new Promise(r => setTimeout(r, 200));
    return info;
  }

  async disconnect() {
    if (!this.connected) return;
    try { await this._sendRaw(RPC.programFlowNotification(PROGRAM_ACTION_STOP)); } catch(e) { this._log('Error sending STOP:', e); }
    try { if (this._notifyChar) await this._notifyChar.stopNotifications(); } catch(e) { this._log('Error stopping notifications:', e); }
    try { if (this.server && this.server.connected) this.server.disconnect(); } catch(e) { this._log('Error disconnecting:', e); }
    this.connected = false; this._rejectAllPending('Disconnected');
  }

  set_notification_callback(callback) { this._notification_callback = callback; }

  async _sendRaw(bytes) { if (!this._writeChar) throw new Error('Not connected'); await this._writeChar.writeValueWithoutResponse(bytes); }

  async _sendAndWait(cmdBytes, responseId, deserializer, timeout = 5000) {
    const key = responseId;
    return new Promise(async (resolve, reject) => {
      const timer = setTimeout(() => { this._removePending(key, entry); reject(new Error(`Timeout waiting for response 0x${responseId.toString(16)}`)); }, timeout);
      const entry = { resolve: (p) => { clearTimeout(timer); resolve(deserializer ? deserializer(p) : p); }, reject: (e) => { clearTimeout(timer); reject(e); } };
      if (!this._pendingResponses.has(key)) this._pendingResponses.set(key, []);
      this._pendingResponses.get(key).push(entry);
      try { await this._sendRaw(cmdBytes); } catch(err) { this._removePending(key, entry); clearTimeout(timer); reject(err); }
    });
  }

  async _sendAndWaitMotor(cmdBytes, responseId, motorBitMask, deserializer, timeout = 5000) {
    const key = `${responseId}:${motorBitMask}`;
    return new Promise(async (resolve, reject) => {
      const timer = setTimeout(() => { this._removePending(key, entry); reject(new Error(`Timeout waiting for motor response 0x${responseId.toString(16)} motor=${motorBitMask}`)); }, timeout);
      const entry = { resolve: (p) => { clearTimeout(timer); resolve(deserializer ? deserializer(p) : p); }, reject: (e) => { clearTimeout(timer); reject(e); } };
      if (!this._pendingResponses.has(key)) this._pendingResponses.set(key, []);
      this._pendingResponses.get(key).push(entry);
      try { await this._sendRaw(cmdBytes); } catch(err) { this._removePending(key, entry); clearTimeout(timer); reject(err); }
    });
  }

  async _sendNoWait(cmdBytes) { await this._sendRaw(cmdBytes); }

  _removePending(key, entry) {
    const arr = this._pendingResponses.get(key); if (!arr) return;
    const idx = arr.indexOf(entry); if (idx >= 0) arr.splice(idx, 1);
    if (arr.length === 0) this._pendingResponses.delete(key);
  }
  _rejectAllPending(reason) {
    for (const [, arr] of this._pendingResponses) for (const e of arr) { try { e.reject(new Error(reason)); } catch {} }
    this._pendingResponses.clear();
  }

  _handleNotification(data) {
    if (data.length < 1) return;
    const messageId = data[0], payload = data.subarray(1);
    let lookupKey = messageId;
    if (MOTOR_MULTIPLEXED_RESPONSES.has(messageId) && payload.length >= 1) {
      const ck = `${messageId}:${payload[0]}`; if (this._pendingResponses.has(ck)) lookupKey = ck;
    }
    if (this._pendingResponses.has(lookupKey)) {
      const arr = this._pendingResponses.get(lookupKey);
      if (arr && arr.length > 0) { const entry = arr.shift(); if (arr.length === 0) this._pendingResponses.delete(lookupKey); entry.resolve(payload); return; }
    }
    if (messageId === MSG.DEVICE_NOTIFICATION) this._handleDeviceNotification(payload);
  }
  _handleDeviceNotification(payload) {
    try {
      const notifications = device_notification_parser(payload);
      if (typeof window !== 'undefined' && window.__LEGO_BLE_DEBUG) {
        this._diagDumpCount = (this._diagDumpCount || 0) + 1;
        const maxDumps = window.__LEGO_BLE_DEBUG_MAX || 20;
        if (this._diagDumpCount <= maxDumps) {
          console.log(`[LEGO-DIAG] batch #${this._diagDumpCount}`, {
            payloadLen: payload.length,
            payloadHex: _hexDump(payload),
            parsed: notifications,
          });
        }
      }
      for (const item of notifications) this._updateLiveState(item);
      if (this._notification_callback) this._notification_callback(notifications);
    } catch(err) { console.error('Error parsing device notification:', err); }
  }
  _updateLiveState(item) {
    if (item.type === 'InfoDeviceNotification')  this.info_device  = item;
    if (item.type === 'CardNotification')        this.scanned_card = item;
    if (item.type === 'ButtonStateNotification') this.button       = item;
  }

  // --- Common Commands (all devices) ---
  async info()       { return this._sendAndWait(RPC.infoRequest(), MSG.INFO_RESPONSE, deserializeInfoResponse); }
  async device_uuid(){ return this._sendAndWait(RPC.deviceUuidRequest(), MSG.DEVICE_UUID_RESPONSE, deserializeDeviceUuidResponse); }

  async light_color(color, options = {}) {
    const { pattern = LIGHT_PATTERN_SOLID, intensity = 100, blocking = true } = options;
    const cmd = RPC.lightColorCommand(_appToFirmware(color), pattern, intensity);
    if (!blocking) return this._sendNoWait(cmd);
    return this._sendAndWait(cmd, MSG.LIGHT_COLOR_RESULT, deserializeStatusResult);
  }

  async beep(pattern = SOUND_PATTERN_BEEP_SINGLE, options = {}) {
    const { frequency = 440, count = 1, blocking = true } = options;
    const cmd = RPC.playBeepCommand(pattern, frequency, Math.max(0, count - 1));
    if (!blocking) return this._sendNoWait(cmd);
    return this._sendAndWait(cmd, MSG.PLAY_BEEP_RESULT, deserializeStatusResult);
  }

  async stop_beep(options = {}) {
    const { blocking = true } = options;
    const cmd = RPC.stopSoundCommand();
    if (!blocking) return this._sendNoWait(cmd);
    return this._sendAndWait(cmd, MSG.STOP_SOUND_RESULT, deserializeStatusResult);
  }

  async program_flow_notification(action) { await this._sendRaw(RPC.programFlowNotification(action)); }
}

// ============================================================
//  SingleMotor
// ============================================================

class SingleMotor extends LegoDevice {
  constructor() {
    super(); this.search_name = 'Single Motor'; this.product_id = PRODUCT_GROUP_DEVICE_SINGLE_MOTOR; this._motor_count = 1;
    this.motor = { type:'MotorNotification', motorBitMask:NaN, motorState:NaN, absolutePosition:NaN, power:NaN, speed:NaN, position:NaN, gesture:NaN };
  }
  _updateLiveState(item) { super._updateLiveState(item); if (item.type === 'MotorNotification') this.motor = item; }
  _motor_index_to_bit_mask(idx) { return 1 << idx; }

  async motor_set_speed(speed, options = {}) {
    const { motor = 0, blocking = true } = options; const mask = this._motor_index_to_bit_mask(motor);
    const cmd = RPC.motorSetSpeed(mask, speed);
    if (!blocking) return this._sendNoWait(cmd);
    return this._sendAndWaitMotor(cmd, MSG.MOTOR_SET_SPEED_RESULT, mask, deserializeMotorResult);
  }
  async motor_run(options = {}) {
    const { direction = MOTOR_MOVE_DIRECTION_CLOCKWISE, motor = 0, speed, blocking = true } = options;
    const mask = this._motor_index_to_bit_mask(motor);
    if (speed !== undefined && speed !== null) await this._sendNoWait(RPC.motorSetSpeed(mask, speed));
    const cmd = RPC.motorRun(mask, direction);
    if (!blocking) return this._sendNoWait(cmd);
    return this._sendAndWaitMotor(cmd, MSG.MOTOR_RUN_RESULT, mask, deserializeMotorResult);
  }
  async motor_run_for_degrees(degrees, options = {}) {
    const { direction = MOTOR_MOVE_DIRECTION_CLOCKWISE, motor = 0, speed, blocking = true } = options;
    const mask = this._motor_index_to_bit_mask(motor);
    if (speed !== undefined && speed !== null) await this._sendNoWait(RPC.motorSetSpeed(mask, speed));
    const cmd = RPC.motorRunForDegrees(mask, degrees, direction);
    if (!blocking) return this._sendNoWait(cmd);
    return this._sendAndWaitMotor(cmd, MSG.MOTOR_RUN_FOR_DEGREES_RESULT, mask, deserializeMotorResult);
  }
  async motor_run_for_time(time_ms, options = {}) {
    const { direction = MOTOR_MOVE_DIRECTION_CLOCKWISE, motor = 0, speed, blocking = true } = options;
    const mask = this._motor_index_to_bit_mask(motor);
    if (speed !== undefined && speed !== null) await this._sendNoWait(RPC.motorSetSpeed(mask, speed));
    const cmd = RPC.motorRunForTime(mask, time_ms, direction);
    if (!blocking) return this._sendNoWait(cmd);
    return this._sendAndWaitMotor(cmd, MSG.MOTOR_RUN_FOR_TIME_RESULT, mask, deserializeMotorResult);
  }
  async motor_run_to_absolute_position(position, options = {}) {
    const { direction = MOTOR_MOVE_DIRECTION_SHORTEST, motor = 0, speed, blocking = true } = options;
    const mask = this._motor_index_to_bit_mask(motor);
    if (speed !== undefined && speed !== null) await this._sendNoWait(RPC.motorSetSpeed(mask, speed));
    const cmd = RPC.motorRunToAbsolutePosition(mask, position, direction);
    if (!blocking) return this._sendNoWait(cmd);
    return this._sendAndWaitMotor(cmd, MSG.MOTOR_RUN_TO_ABSOLUTE_POSITION_RESULT, mask, deserializeMotorResult);
  }
  async motor_run_to_relative_position(position, options = {}) {
    const { motor = 0, speed, blocking = true } = options; const mask = this._motor_index_to_bit_mask(motor);
    if (speed !== undefined && speed !== null) await this._sendNoWait(RPC.motorSetSpeed(mask, speed));
    const cmd = RPC.motorRunToRelativePosition(mask, position);
    if (!blocking) return this._sendNoWait(cmd);
    return this._sendAndWaitMotor(cmd, MSG.MOTOR_RUN_TO_RELATIVE_POSITION_RESULT, mask, deserializeMotorResult);
  }
  async motor_reset_relative_position(options = {}) {
    const { motor = 0, position = 0, blocking = true } = options; const mask = this._motor_index_to_bit_mask(motor);
    const cmd = RPC.motorResetRelativePosition(mask, position);
    if (!blocking) return this._sendNoWait(cmd);
    return this._sendAndWaitMotor(cmd, MSG.MOTOR_RESET_RELATIVE_POSITION_RESULT, mask, deserializeMotorResult);
  }
  async motor_set_duty_cycle(duty_cycle, options = {}) {
    const { motor = 0, blocking = true } = options; const mask = this._motor_index_to_bit_mask(motor);
    const cmd = RPC.motorSetDutyCycle(mask, duty_cycle);
    if (!blocking) return this._sendNoWait(cmd);
    return this._sendAndWaitMotor(cmd, MSG.MOTOR_SET_DUTY_CYCLE_RESULT, mask, deserializeMotorResult);
  }
  async motor_stop(options = {}) {
    const { motor = 0, blocking = true } = options; const mask = this._motor_index_to_bit_mask(motor);
    const cmd = RPC.motorStop(mask);
    if (!blocking) return this._sendNoWait(cmd);
    return this._sendAndWaitMotor(cmd, MSG.MOTOR_STOP_RESULT, mask, deserializeMotorResult);
  }
  async motor_set_end_state(end_state, options = {}) {
    const { motor = 0, blocking = true } = options; const mask = this._motor_index_to_bit_mask(motor);
    const cmd = RPC.motorSetEndState(mask, end_state);
    if (!blocking) return this._sendNoWait(cmd);
    return this._sendAndWaitMotor(cmd, MSG.MOTOR_SET_END_STATE_RESULT, mask, deserializeMotorResult);
  }
  async motor_set_acceleration(acceleration, deceleration, options = {}) {
    const { motor = 0, blocking = true } = options; const mask = this._motor_index_to_bit_mask(motor);
    const cmd = RPC.motorSetAcceleration(mask, acceleration, deceleration);
    if (!blocking) return this._sendNoWait(cmd);
    return this._sendAndWaitMotor(cmd, MSG.MOTOR_SET_ACCELERATION_RESULT, mask, deserializeMotorResult);
  }
}

// ============================================================
//  DoubleMotor
// ============================================================

class DoubleMotor extends SingleMotor {
  constructor() {
    super(); this.search_name = 'Double Motor'; this.product_id = PRODUCT_GROUP_DEVICE_DOUBLE_MOTOR; this._motor_count = 2;
    const nm = () => ({type:'MotorNotification',motorBitMask:NaN,motorState:NaN,absolutePosition:NaN,power:NaN,speed:NaN,position:NaN,gesture:NaN});
    this.motor = [nm(), nm()];
    this.imu_gesture = { type:'ImuGestureNotification', gesture:NaN };
    this.imu_device = { type:'ImuDeviceNotification', orientation:NaN, yawFace:NaN, yaw:NaN, pitch:NaN, roll:NaN,
      accelerometerX:NaN, accelerometerY:NaN, accelerometerZ:NaN, gyroscopeX:NaN, gyroscopeY:NaN, gyroscopeZ:NaN };
  }
  _updateLiveState(item) {
    if (item.type === 'InfoDeviceNotification')  this.info_device = item;
    if (item.type === 'CardNotification')        this.scanned_card = item;
    if (item.type === 'ButtonStateNotification') this.button = item;
    if (item.type === 'MotorNotification') { const idx = Math.log2(item.motorBitMask); if (idx >= 0 && idx < 2) this.motor[idx] = item; }
    if (item.type === 'ImuGestureNotification')  this.imu_gesture = item;
    if (item.type === 'ImuDeviceNotification')   this.imu_device = item;
  }
  _motor_index_to_bit_mask(idx) { return idx === MOTOR_BOTH ? MOTOR_BITS_BOTH : (1 << idx); }

  async movement_move(options = {}) {
    const { direction = MOVEMENT_DIRECTION_FORWARD, speed, blocking = true } = options;
    if (speed !== undefined && speed !== null) await this._sendNoWait(RPC.movementSetSpeed(speed));
    const cmd = RPC.movementMove(direction);
    if (!blocking) return this._sendNoWait(cmd); return this._sendAndWait(cmd, MSG.MOVEMENT_MOVE_RESULT, deserializeStatusResult);
  }
  async movement_move_for_time(time_ms, options = {}) {
    const { direction = MOVEMENT_DIRECTION_FORWARD, speed, blocking = true } = options;
    if (speed !== undefined && speed !== null) await this._sendNoWait(RPC.movementSetSpeed(speed));
    const cmd = RPC.movementMoveForTime(time_ms, direction);
    if (!blocking) return this._sendNoWait(cmd); return this._sendAndWait(cmd, MSG.MOVEMENT_MOVE_FOR_TIME_RESULT, deserializeStatusResult);
  }
  async movement_move_for_degrees(degrees, options = {}) {
    const { direction = MOVEMENT_MOVE_DIRECTION_FORWARD, speed, blocking = true } = options;
    if (speed !== undefined && speed !== null) await this._sendNoWait(RPC.movementSetSpeed(speed));
    const cmd = RPC.movementMoveForDegrees(degrees, direction);
    if (!blocking) return this._sendNoWait(cmd); return this._sendAndWait(cmd, MSG.MOVEMENT_MOVE_FOR_DEGREES_RESULT, deserializeStatusResult);
  }
  async movement_move_tank(speed_left, speed_right, options = {}) {
    const { blocking = true } = options; const cmd = RPC.movementMoveTank(speed_left, speed_right);
    if (!blocking) return this._sendNoWait(cmd); return this._sendAndWait(cmd, MSG.MOVEMENT_MOVE_TANK_RESULT, deserializeStatusResult);
  }
  async movement_move_tank_for_degrees(degrees, options = {}) {
    const { speed_left = 50, speed_right = 50, blocking = true } = options;
    const cmd = RPC.movementMoveTankForDegrees(degrees, speed_left, speed_right);
    if (!blocking) return this._sendNoWait(cmd); return this._sendAndWait(cmd, MSG.MOVEMENT_MOVE_TANK_FOR_DEGREES_RESULT, deserializeStatusResult);
  }
  async movement_turn_for_degrees(degrees, options = {}) {
    const { direction = MOVEMENT_TURN_DIRECTION_LEFT, speed, blocking = true } = options;
    if (speed !== undefined && speed !== null) await this._sendNoWait(RPC.movementSetSpeed(speed));
    const cmd = RPC.movementTurnForDegrees(degrees, direction);
    if (!blocking) return this._sendNoWait(cmd); return this._sendAndWait(cmd, MSG.MOVEMENT_TURN_FOR_DEGREES_RESULT, deserializeStatusResult);
  }
  async movement_stop(options = {}) {
    const { blocking = true } = options; const cmd = RPC.movementStop();
    if (!blocking) return this._sendNoWait(cmd); return this._sendAndWait(cmd, MSG.MOVEMENT_STOP_RESULT, deserializeStatusResult);
  }
  async movement_set_speed(speed, options = {}) {
    const { blocking = true } = options; const cmd = RPC.movementSetSpeed(speed);
    if (!blocking) return this._sendNoWait(cmd); return this._sendAndWait(cmd, MSG.MOVEMENT_SET_SPEED_RESULT, deserializeStatusResult);
  }
  async movement_set_end_state(end_state, options = {}) {
    const { blocking = true } = options; const cmd = RPC.movementSetEndState(end_state);
    if (!blocking) return this._sendNoWait(cmd); return this._sendAndWait(cmd, MSG.MOVEMENT_SET_END_STATE_RESULT, deserializeStatusResult);
  }
  async movement_set_acceleration(acceleration, deceleration, options = {}) {
    const { blocking = true } = options; const cmd = RPC.movementSetAcceleration(acceleration, deceleration);
    if (!blocking) return this._sendNoWait(cmd); return this._sendAndWait(cmd, MSG.MOVEMENT_SET_ACCELERATION_RESULT, deserializeStatusResult);
  }
  async movement_set_turn_steering(steering, options = {}) {
    const { blocking = true } = options; const cmd = RPC.movementSetTurnSteering(steering);
    if (!blocking) return this._sendNoWait(cmd); return this._sendAndWait(cmd, MSG.MOVEMENT_SET_TURN_STEERING_RESULT, deserializeStatusResult);
  }
  async imu_set_yaw_face(yaw_face, options = {}) {
    const { blocking = true } = options; const cmd = RPC.imuSetYawFace(yaw_face);
    if (!blocking) return this._sendNoWait(cmd); return this._sendAndWait(cmd, MSG.IMU_SET_YAW_FACE_RESULT, deserializeStatusResult);
  }
  async imu_reset_yaw_axis(value = 0, options = {}) {
    const { blocking = true } = options; const cmd = RPC.imuResetYawAxis(value);
    if (!blocking) return this._sendNoWait(cmd); return this._sendAndWait(cmd, MSG.IMU_RESET_YAW_AXIS_RESULT, deserializeStatusResult);
  }
}

// ============================================================
//  Controller & ColorSensor
// ============================================================

class Controller extends LegoDevice {
  constructor() { super(); this.search_name='Controller'; this.product_id=PRODUCT_GROUP_DEVICE_CONTROLLER;
    this.sensor = {type:'ControllerNotification',leftPercent:NaN,rightPercent:NaN,leftAngle:NaN,rightAngle:NaN}; }
  _updateLiveState(item) { super._updateLiveState(item); if (item.type === 'ControllerNotification') this.sensor = item; }
}

class ColorSensor extends LegoDevice {
  constructor() { super(); this.search_name='Color Sensor'; this.product_id=PRODUCT_GROUP_DEVICE_COLOR_SENSOR;
    this.sensor = {type:'ColorSensorNotification',color:NaN,reflection:NaN,rawRed:NaN,rawGreen:NaN,rawBlue:NaN,hue:NaN,saturation:NaN,value:NaN}; }
  _updateLiveState(item) { super._updateLiveState(item); if (item.type === 'ColorSensorNotification') this.sensor = item; }
}

// ============================================================
//  Public API Export
// ============================================================

const legoeducation = {
  SingleMotor, DoubleMotor, Controller, ColorSensor, device_notification_parser,
  RPC, MSG, NOTIF, SERVICE_UUID, WRITE_CHAR_UUID, NOTIFY_CHAR_UUID,
  PRODUCT_GROUP_DEVICE_SINGLE_MOTOR, PRODUCT_GROUP_DEVICE_DOUBLE_MOTOR,
  PRODUCT_GROUP_DEVICE_COLOR_SENSOR, PRODUCT_GROUP_DEVICE_CONTROLLER,
  MOTOR_LEFT, MOTOR_RIGHT, MOTOR_BOTH, MOTOR_BITS_LEFT, MOTOR_BITS_RIGHT, MOTOR_BITS_BOTH,
  DEVICE_FACE_TOP, DEVICE_FACE_FRONT, DEVICE_FACE_RIGHT, DEVICE_FACE_BOTTOM, DEVICE_FACE_BACK, DEVICE_FACE_LEFT,
  PROGRAM_ACTION_START, PROGRAM_ACTION_STOP,
  RESPONSE_STATUS_ACK, RESPONSE_STATUS_NACK,
  COMMAND_STATUS_COMPLETED, COMMAND_STATUS_INTERRUPTED, COMMAND_STATUS_NACK,
  MOTOR_END_STATE_DEFAULT, MOTOR_END_STATE_COAST, MOTOR_END_STATE_BRAKE, MOTOR_END_STATE_HOLD,
  MOTOR_END_STATE_CONTINUE, MOTOR_END_STATE_SMART_COAST, MOTOR_END_STATE_SMART_BRAKE,
  MOTOR_MOVE_DIRECTION_CLOCKWISE, MOTOR_MOVE_DIRECTION_COUNTERCLOCKWISE,
  MOTOR_MOVE_DIRECTION_SHORTEST, MOTOR_MOVE_DIRECTION_LONGEST,
  MOVEMENT_DIRECTION_FORWARD, MOVEMENT_DIRECTION_BACKWARD, MOVEMENT_DIRECTION_LEFT, MOVEMENT_DIRECTION_RIGHT,
  MOVEMENT_MOVE_DIRECTION_FORWARD, MOVEMENT_MOVE_DIRECTION_BACKWARD,
  MOVEMENT_TURN_DIRECTION_LEFT, MOVEMENT_TURN_DIRECTION_RIGHT,
  LIGHT_PATTERN_SOLID, LIGHT_PATTERN_BREATHE, LIGHT_PATTERN_PULSE,
  LIGHT_PATTERN_SHORT_BLINK, LIGHT_PATTERN_LONG_BLINK, LIGHT_PATTERN_DOUBLE_BLINK,
  SOUND_PATTERN_BEEP_SINGLE, SOUND_PATTERN_BEEP_DOUBLE, SOUND_PATTERN_BEEP_TRIPLE, SOUND_PATTERN_BEEP_UP_MIDDLE_DOWN,
  BUTTON_STATE_RELEASED, BUTTON_STATE_PRESSED,
  USB_POWER_STATE_USB_NOT_CONNECTED, USB_POWER_STATE_USB_CONNECTED,
  MOTION_GESTURE_NO_GESTURE, MOTION_GESTURE_TAPPED, MOTION_GESTURE_DOUBLE_TAPPED,
  MOTION_GESTURE_COLLISION, MOTION_GESTURE_SHAKE, MOTION_GESTURE_FREEFALL,
  MOTOR_STATE_READY, MOTOR_STATE_RUNNING, MOTOR_STATE_STALLED, MOTOR_STATE_CMD_ABORTED,
  MOTOR_STATE_REGULATION_ERROR, MOTOR_STATE_MOTOR_DISCONNECTED, MOTOR_STATE_HOLDING,
  MOTOR_STATE_DC_RUNNING, MOTOR_STATE_NOT_ALLOWED_TO_RUN,
  MOTOR_GESTURE_NO_GESTURE, MOTOR_GESTURE_SLOW_CLOCKWISE, MOTOR_GESTURE_FAST_CLOCKWISE,
  MOTOR_GESTURE_SLOW_COUNTERCLOCKWISE, MOTOR_GESTURE_FAST_COUNTERCLOCKWISE, MOTOR_GESTURE_WIGGLED,
  LEGO_COLOR_NOCOLOR, LEGO_COLOR_RED, LEGO_COLOR_YELLOW, LEGO_COLOR_BLUE, LEGO_COLOR_TEAL,
  LEGO_COLOR_GREEN, LEGO_COLOR_PURPLE, LEGO_COLOR_WHITE, LEGO_COLOR_MAGENTA, LEGO_COLOR_ORANGE, LEGO_COLOR_AZURE,
  LEGO_COLOR_NAME_MAP, LEGO_COLOR_HEX_MAP, SENSOR_DETECTABLE_COLORS, CARD_COLORS,
};

if (typeof module !== 'undefined' && module.exports) module.exports = legoeducation;
if (typeof window !== 'undefined') window.legoeducation = legoeducation;
if (typeof globalThis !== 'undefined') globalThis.legoeducation = legoeducation;
