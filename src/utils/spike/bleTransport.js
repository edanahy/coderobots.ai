/**
 * Web Bluetooth transport for the SPIKE Prime protocol
 * (https://lego.github.io/spike-prime-docs/connect.html). The hub exposes one
 * GATT service with an RX characteristic (we write, without response) and a
 * TX characteristic (hub → us, via notifications). "RX"/"TX" are named from
 * the hub's point of view.
 */

export const SPIKE_BLE_SERVICE = '0000fd02-0000-1000-8000-00805f9b34fb';
const RX_CHARACTERISTIC = '0000fd02-0001-1000-8000-00805f9b34fb';
const TX_CHARACTERISTIC = '0000fd02-0002-1000-8000-00805f9b34fb';

// Safe default until InfoResponse reports the hub's real limit (the default
// BLE MTU leaves 20 bytes of payload per write).
const DEFAULT_PACKET_SIZE = 20;

export const isWebBluetoothAvailable = () =>
  typeof navigator !== 'undefined' && !!navigator.bluetooth;

/**
 * Show the browser's Bluetooth picker filtered to SPIKE Prime hubs. Must be
 * called directly from a click handler (before any other await) to keep the
 * user-activation the browser requires.
 */
export function requestSpikeBleDevice() {
  return navigator.bluetooth.requestDevice({ filters: [{ services: [SPIKE_BLE_SERVICE] }] });
}

/**
 * Connect GATT on an already-picked device and return a transport.
 * `onDisconnect` fires when the link drops for any reason (hub switched off,
 * out of range, or close()).
 */
export async function openSpikeBleTransport(device, { onDisconnect } = {}) {
  const server = await device.gatt.connect();
  const service = await server.getPrimaryService(SPIKE_BLE_SERVICE);
  const rx = await service.getCharacteristic(RX_CHARACTERISTIC);
  const tx = await service.getCharacteristic(TX_CHARACTERISTIC);

  let receiver = null;
  const handleValue = (event) => {
    const value = event.target.value;
    // Copy: the DataView's backing buffer isn't guaranteed to stay ours.
    receiver?.(new Uint8Array(value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength)));
  };
  tx.addEventListener('characteristicvaluechanged', handleValue);
  await tx.startNotifications();

  let closed = false;
  const handleGattDisconnected = () => {
    if (closed) return;
    closed = true;
    tx.removeEventListener('characteristicvaluechanged', handleValue);
    device.removeEventListener('gattserverdisconnected', handleGattDisconnected);
    receiver = null;
    onDisconnect?.();
  };
  device.addEventListener('gattserverdisconnected', handleGattDisconnected);

  // GATT operations can't overlap ("operation already in progress"), so all
  // writes go through one chain. The hub client already splits frames into
  // maxPacketSize packets; one write() is one GATT write.
  let writeChain = Promise.resolve();

  const transport = {
    kind: 'ble',
    deviceName: device.name || '',
    maxPacketSize: DEFAULT_PACKET_SIZE,
    packetGapMs: 0,
    setReceiver(fn) {
      receiver = typeof fn === 'function' ? fn : null;
    },
    write(bytes) {
      const run = () => rx.writeValueWithoutResponse(bytes.slice());
      const result = writeChain.then(run, run);
      writeChain = result.catch(() => {});
      return result;
    },
    async close() {
      try { await tx.stopNotifications(); } catch { /* already disconnected */ }
      if (device.gatt.connected) device.gatt.disconnect();
      handleGattDisconnected();
    },
  };
  return transport;
}
