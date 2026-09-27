/**
 * Transport-agnostic client for the LEGO SPIKE Prime protocol (Hub OS).
 *
 * The same protocol runs over BLE and over USB serial whenever the hub is in
 * Hub OS ("slot") mode, so this client only needs a transport of the shape:
 *
 *   { write(bytes): Promise, setReceiver(fn|null), maxPacketSize }
 *
 * Responses carry no correlation id — only their message type — so requests
 * are serialized: exactly one is outstanding at a time. Console output,
 * program start/stop and device (sensor) updates arrive as unsolicited
 * notifications and are forwarded to the callbacks.
 */

import { FrameParser, pack } from './cobs.js';
import { spikeCrc32 } from './crc32.js';
import {
  MSG,
  PROGRAM_ACTION,
  consoleBytes,
  decodeDeviceNotification,
  decodeHubName,
  decodeInfoResponse,
  decodeProgramFlowNotification,
  encodeClearSlotRequest,
  encodeDeviceNotificationRequest,
  encodeGetHubNameRequest,
  encodeInfoRequest,
  encodeProgramFlowRequest,
  encodeStartFileUploadRequest,
  encodeTransferChunkRequest,
  isAcknowledged,
} from './messages.js';

const hex = (id) => `0x${id.toString(16).padStart(2, '0')}`;

export class SpikeHubClient {
  constructor(transport, { onConsole, onProgramFlow, onDevice } = {}) {
    this.transport = transport;
    this.onConsole = onConsole || (() => {});
    this.onProgramFlow = onProgramFlow || (() => {});
    this.onDevice = onDevice || (() => {});
    this.info = null;
    this.disposed = false;
    this.pending = null;
    this.queue = Promise.resolve();
    // Console messages are split at arbitrary points (often one per print()
    // argument), so a multi-byte UTF-8 character can straddle two of them.
    this.textDecoder = new TextDecoder();
    this.parser = new FrameParser(
      (payload) => this.handleMessage(payload),
      (error) => console.warn('[SPIKE] dropped undecodable frame:', error)
    );
    transport.setReceiver((bytes) => this.parser.push(bytes));
  }

  handleMessage(payload) {
    const id = payload[0];
    if (this.pending && this.pending.responseId === id) {
      const { resolve } = this.pending;
      this.pending = null;
      resolve(payload);
      return;
    }
    switch (id) {
      case MSG.CONSOLE_NOTIFICATION: {
        const text = this.textDecoder.decode(consoleBytes(payload), { stream: true });
        if (text) this.onConsole(text);
        break;
      }
      case MSG.PROGRAM_FLOW_NOTIFICATION:
        this.onProgramFlow(decodeProgramFlowNotification(payload));
        break;
      case MSG.DEVICE_NOTIFICATION:
        this.onDevice(decodeDeviceNotification(payload));
        break;
      default:
        // Late responses to timed-out requests, tunnel messages, etc.
        break;
    }
  }

  // Frames go out in packets of at most `maxPacketSize` bytes (from
  // InfoResponse). Over USB the hub also needs a short gap between packets:
  // a 4 KB chunk written in one burst is silently dropped, while the same
  // frame as 512-byte packets 5 ms apart is accepted.
  async send(payload) {
    if (this.disposed) throw new Error('SPIKE hub connection is closed');
    const frame = pack(payload);
    const size = Math.min(this.transport.maxPacketSize || frame.length, frame.length);
    for (let offset = 0; offset < frame.length; offset += size) {
      if (offset && this.transport.packetGapMs) {
        await new Promise((resolve) => setTimeout(resolve, this.transport.packetGapMs));
      }
      await this.transport.write(frame.subarray(offset, offset + size));
    }
  }

  /**
   * Send `payload` and resolve with the first message of type `responseId`.
   * Retries (re-sending the request) only when `attempts` > 1, which is only
   * safe for idempotent requests.
   */
  request(payload, responseId, { timeoutMs = 2000, attempts = 1 } = {}) {
    const run = async () => {
      for (let attempt = 1; attempt <= attempts; attempt += 1) {
        if (this.disposed) throw new Error('SPIKE hub connection is closed');
        const response = new Promise((resolve) => {
          this.pending = { responseId, resolve };
        });
        let timer;
        const timeout = new Promise((resolve) => {
          timer = setTimeout(() => resolve(null), timeoutMs);
        });
        try {
          await this.send(payload);
          const result = await Promise.race([response, timeout]);
          if (result) return result;
        } finally {
          clearTimeout(timer);
          if (this.pending?.responseId === responseId) this.pending = null;
        }
      }
      throw new Error(`SPIKE hub did not respond (waiting for ${hex(responseId)})`);
    };
    const result = this.queue.then(run, run);
    this.queue = result.catch(() => {});
    return result;
  }

  /**
   * First exchange on every connection: learn packet/chunk limits. After a
   * soft reboot Hub OS needs ~1.5-2 s before it answers, so keep asking until
   * `timeoutMs` has passed.
   */
  async handshake({ timeoutMs = 6000 } = {}) {
    // A lone delimiter terminates any half-received frame on the hub side.
    await this.transport.write(Uint8Array.of(0x02));
    const attempts = Math.max(1, Math.ceil(timeoutMs / 400));
    const payload = await this.request(encodeInfoRequest(), MSG.INFO_RESPONSE, {
      timeoutMs: 400,
      attempts,
    });
    this.info = decodeInfoResponse(payload);
    if (this.info.maxPacketSize) this.transport.maxPacketSize = this.info.maxPacketSize;
    return this.info;
  }

  async getHubName() {
    const payload = await this.request(encodeGetHubNameRequest(), MSG.GET_HUB_NAME_RESPONSE, { attempts: 2 });
    return decodeHubName(payload);
  }

  /** @returns {Promise<boolean>} false when the slot was already empty. */
  async clearSlot(slot) {
    const payload = await this.request(encodeClearSlotRequest(slot), MSG.CLEAR_SLOT_RESPONSE);
    return isAcknowledged(payload);
  }

  /** Write `bytes` as `fileName` inside program slot `slot` (/flash/program/NN/). */
  async uploadFile(slot, fileName, bytes, onProgress = () => {}) {
    if (!this.info) throw new Error('Handshake required before uploading');
    const start = await this.request(
      encodeStartFileUploadRequest(fileName, slot, spikeCrc32(bytes)),
      MSG.START_FILE_UPLOAD_RESPONSE,
      { timeoutMs: 5000 }
    );
    if (!isAcknowledged(start)) throw new Error(`Hub refused upload of ${fileName} to slot ${slot}`);

    // Chunks must stay 4-byte aligned so the running CRC (which pads each
    // chunk to 4 bytes) matches the whole-file CRC sent above.
    const limit = Math.min(this.info.maxChunkSize, this.info.maxMessageSize - 7);
    const chunkSize = Math.max(4, limit - (limit % 4));
    let runningCrc = 0;
    onProgress(0, bytes.length);
    for (let offset = 0; offset < bytes.length; offset += chunkSize) {
      const chunk = bytes.subarray(offset, offset + chunkSize);
      runningCrc = spikeCrc32(chunk, runningCrc);
      const response = await this.request(
        encodeTransferChunkRequest(runningCrc, chunk),
        MSG.TRANSFER_CHUNK_RESPONSE,
        { timeoutMs: 5000 }
      );
      if (!isAcknowledged(response)) throw new Error(`Hub rejected chunk at byte ${offset} of ${fileName}`);
      onProgress(Math.min(offset + chunk.length, bytes.length), bytes.length);
    }
  }

  async startProgram(slot) {
    const payload = await this.request(
      encodeProgramFlowRequest(PROGRAM_ACTION.START, slot),
      MSG.PROGRAM_FLOW_RESPONSE,
      { timeoutMs: 3000 }
    );
    if (!isAcknowledged(payload)) throw new Error(`Hub could not start slot ${slot} (is it empty?)`);
  }

  async stopProgram(slot) {
    const payload = await this.request(
      encodeProgramFlowRequest(PROGRAM_ACTION.STOP, slot),
      MSG.PROGRAM_FLOW_RESPONSE,
      { timeoutMs: 3000 }
    );
    return isAcknowledged(payload);
  }

  /** Stream DeviceNotifications every `intervalMs` (0 turns streaming off). */
  async setDeviceNotifications(intervalMs) {
    const payload = await this.request(
      encodeDeviceNotificationRequest(intervalMs),
      MSG.DEVICE_NOTIFICATION_RESPONSE,
      { attempts: 2 }
    );
    return isAcknowledged(payload);
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.pending = null;
    try { this.transport.setReceiver(null); } catch { /* transport already gone */ }
    const tail = this.textDecoder.decode();
    if (tail) this.onConsole(tail);
  }
}
