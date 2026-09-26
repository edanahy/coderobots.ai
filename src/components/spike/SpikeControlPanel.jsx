import { useLanguage } from '../../contexts/LanguageContext';
import { isWebBluetoothAvailable } from '../../utils/spike/bleTransport.js';
import './Spike.css';

// Material Icons "usb" and "bluetooth" (Apache 2.0).
const UsbIcon = () => (
  <svg className="spike-icon" viewBox="0 0 24 24" aria-hidden="true">
    <path d="M15 7v4h1v2h-3V5h2l-3-4-3 4h2v8H8v-2.07c.7-.37 1.2-1.08 1.2-1.93 0-1.21-.99-2.2-2.2-2.2S4.8 7.79 4.8 9c0 .85.5 1.56 1.2 1.93V13c0 1.11.89 2 2 2h3v3.05c-.71.37-1.2 1.1-1.2 1.95 0 1.22.99 2.2 2.2 2.2s2.2-.98 2.2-2.2c0-.85-.49-1.58-1.2-1.95V15h3c1.11 0 2-.89 2-2v-2h1V7h-4z" />
  </svg>
);

const BluetoothIcon = () => (
  <svg className="spike-icon" viewBox="0 0 24 24" aria-hidden="true">
    <path d="M17.71 7.71L12 2h-1v7.59L6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 11 14.41V22h1l5.71-5.71-4.3-4.29 4.3-4.29zM13 5.83l1.88 1.88L13 9.59V5.83zm1.88 10.46L13 18.17v-3.76l1.88 1.88z" />
  </svg>
);

const serialAvailable = () => typeof navigator !== 'undefined' && 'serial' in navigator;

/**
 * SPIKE Prime controls. Not connected: choose USB or Bluetooth. Connected:
 * a status chip (+ REPL/Slots toggle over USB), then either the REPL
 * controls (interactive MicroPython) or the Hub OS controls (download to a
 * slot, modelled on the LEGO SPIKE app).
 */
const SpikeControlPanel = ({
  spike,
  connected,
  isConnecting,
  onConnectUsb,
  onDisconnect,
  onClear,
  onRun,
  onStop,
  onReset,
}) => {
  const { t } = useLanguage();
  const { transport, mode, busy, hubName, hubRunning, deviceState, sensorsOpen, uploadProgress } = spike;
  const working = isConnecting || !!busy;

  if (!connected) {
    return (
      <div className="control-panel right-panel spike-panel">
        <div className="button-group">
          <button
            onClick={onConnectUsb}
            className="button connect-button spike-connect-button"
            disabled={working || !serialAvailable()}
            title={serialAvailable() ? t('spikeConnectUsbHint') : t('errWebSerialUnavailable')}
          >
            <UsbIcon />
            {isConnecting ? t('legoConnecting') : t('spikeConnectUsb')}
          </button>
          <button
            onClick={spike.connectBle}
            className="button spike-connect-button spike-ble-button"
            disabled={working || !isWebBluetoothAvailable()}
            title={isWebBluetoothAvailable() ? t('spikeConnectBleHint') : t('errWebBluetoothUnavailable')}
          >
            <BluetoothIcon />
            {busy === 'connecting' ? t('legoConnecting') : t('spikeConnectBle')}
          </button>
          <button onClick={onClear} className="button clear-console-button" disabled={working}>
            {t('clearConsole')}
          </button>
        </div>
      </div>
    );
  }

  const battery = deviceState?.battery;
  const inHubMode = mode === 'hub';

  return (
    <div className="control-panel right-panel spike-panel">
      <div className="button-group">
        <div className={`spike-chip spike-chip--${transport}`} title={transport === 'ble' ? t('spikeViaBluetooth') : t('spikeViaUsb')}>
          {transport === 'ble' ? <BluetoothIcon /> : <UsbIcon />}
          <span className="spike-chip-name">{hubName || 'SPIKE Prime'}</span>
          {inHubMode && battery != null && (
            <span className={`spike-chip-battery${battery <= 20 ? ' spike-chip-battery--low' : ''}`} title={t('spikeBattery')}>
              <span className="spike-battery-glyph" style={{ '--level': `${battery}%` }} />
              {battery}%
            </span>
          )}
          {inHubMode && (
            <span className={`spike-chip-state${hubRunning ? ' spike-chip-state--running' : ''}`}>
              {hubRunning ? t('spikeRunning') : t('spikeIdle')}
            </span>
          )}
        </div>

        {transport === 'usb' && (
          <div className="spike-mode-toggle" role="group" aria-label={t('spikeModeLabel')}>
            <button
              type="button"
              className={mode === 'repl' ? 'active' : ''}
              aria-pressed={mode === 'repl'}
              onClick={spike.enterReplMode}
              disabled={working || mode === 'repl'}
              title={t('spikeModeReplHint')}
            >
              {t('spikeModeRepl')}
            </button>
            <button
              type="button"
              className={inHubMode ? 'active' : ''}
              aria-pressed={inHubMode}
              onClick={spike.enterSlotMode}
              disabled={working || inHubMode}
              title={t('spikeModeSlotsHint')}
            >
              {t('spikeModeSlots')}
            </button>
          </div>
        )}

        <button
          onClick={onDisconnect}
          className="button disconnect-button"
          disabled={working}
        >
          {isConnecting ? t('disconnecting') : t('disconnect')}
        </button>
        <button onClick={onClear} className="button clear-console-button" disabled={isConnecting}>
          {t('clearConsole')}
        </button>
      </div>

      {inHubMode ? (
        <div className="button-group">
          <select
            value={spike.slot}
            onChange={(e) => spike.setSlot(Number(e.target.value))}
            className="slot-selector"
            title={t('selectProgramSlot')}
            disabled={!!busy}
          >
            {Array.from({ length: spike.slotCount }, (_, i) => (
              <option key={i} value={i}>{t('slotOption').replace('{n}', i)}</option>
            ))}
          </select>
          <button
            onClick={() => spike.download({ run: false })}
            className="button clear-console-button"
            disabled={!!busy}
            title={t('spikeDownloadHint')}
          >
            {t('spikeDownload')}
          </button>
          <button
            onClick={() => spike.download({ run: true })}
            className="button run-button spike-primary-action"
            disabled={!!busy}
            title={t('spikeDownloadAndRunHint')}
          >
            ▶ {t('spikeDownloadAndRun')}
          </button>
          <button
            onClick={spike.stopProgram}
            className="button stop-button"
            disabled={!hubRunning || busy === 'switching'}
          >
            ■ {t('stopProgram')}
          </button>
          <button
            onClick={spike.toggleSensors}
            className={`button clear-console-button spike-sensors-toggle${sensorsOpen ? ' active' : ''}`}
            aria-pressed={sensorsOpen}
          >
            {t('spikeSensors')} {sensorsOpen ? '◂' : '▸'}
          </button>
          {uploadProgress !== null && (
            <span className="spike-progress">
              {t('spikeDownloadingPct').replace('{pct}', uploadProgress)}
            </span>
          )}
        </div>
      ) : (
        <div className="button-group">
          <button onClick={onRun} className="button run-button" disabled={working}>
            {t('runProgram')}
          </button>
          <button onClick={onStop} className="button stop-button" disabled={working}>
            {t('stopProgram')}
          </button>
          <button onClick={onReset} className="button stop-button" disabled={working}>
            {t('resetDevice')}
          </button>
          <button
            onClick={spike.openLibrary}
            className="button clear-console-button"
            disabled={working}
            title={t('spikeSaveAsLibraryHint')}
          >
            {t('spikeSaveAsLibrary')}
          </button>
        </div>
      )}
    </div>
  );
};

export default SpikeControlPanel;
