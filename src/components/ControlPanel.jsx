import { useState, useRef, useEffect, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { useLanguage } from '../contexts/LanguageContext';
import LegoCardPickerModal from './LegoCardPickerModal';

const KIND_LETTER = {
  singlemotor: 'S',
  doublemotor: 'D',
  colorsensor: 'C',
  controller: 'R',
};

const KIND_LABEL_KEY = {
  singlemotor: 'legoSingleMotor',
  doublemotor: 'legoDoubleMotor',
  colorsensor: 'legoColorSensor',
  controller: 'legoController',
};

const KIND_ORDER = ['singlemotor', 'doublemotor', 'colorsensor', 'controller'];

// One icon per LEGO device kind, with a hover popover listing the connected
// devices of that kind (rename inline, disconnect via ×).
const LegoDeviceIcon = ({ kind, letter, devices, label, onRename, onDisconnect, t }) => {
  const wrapperRef = useRef(null);
  const popoverRef = useRef(null);
  const closeTimerRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ left: 0, bottom: 0 });
  const [editing, setEditing] = useState(null);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState('');

  // Position the portal popover above the icon, anchored via fixed coords.
  useLayoutEffect(() => {
    if (!open || !wrapperRef.current) return;
    const update = () => {
      const r = wrapperRef.current.getBoundingClientRect();
      setPos({ left: r.left, bottom: window.innerHeight - r.top + 4 });
    };
    update();
    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
    };
  }, [open]);

  // Click-outside closes immediately.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e) => {
      if (wrapperRef.current?.contains(e.target)) return;
      if (popoverRef.current?.contains(e.target)) return;
      setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  // Cancel any pending close on unmount.
  useEffect(() => () => {
    if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
  }, []);

  const cancelClose = () => {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  };
  const scheduleClose = () => {
    cancelClose();
    closeTimerRef.current = setTimeout(() => {
      closeTimerRef.current = null;
      setOpen(false);
    }, 200);
  };

  const startEdit = (name) => { setEditing({ name }); setDraft(name); setError(''); };
  const commitEdit = () => {
    if (!editing) return;
    const result = onRename(kind, editing.name, draft);
    if (result?.ok === false) {
      setError(result.error === 'in-use' ? t('legoRenameError') : (result.error || ''));
      return;
    }
    setEditing(null); setDraft(''); setError('');
  };
  const cancelEdit = () => { setEditing(null); setDraft(''); setError(''); };

  const count = devices.length;

  return (
    <div
      ref={wrapperRef}
      className="lego-icon-wrapper"
      onMouseEnter={() => { cancelClose(); setOpen(true); }}
      onMouseLeave={scheduleClose}
      onFocus={() => { cancelClose(); setOpen(true); }}
      onBlur={(e) => {
        const next = e.relatedTarget;
        if (next && (wrapperRef.current?.contains(next) || popoverRef.current?.contains(next))) return;
        scheduleClose();
      }}
    >
      <button
        type="button"
        className={`lego-icon-button${count > 0 ? ' lego-icon-button--has' : ''}`}
        title={label}
      >
        <span className="lego-icon-letter">{letter}</span>
        <span className="lego-icon-count">{count}</span>
      </button>
      {open && createPortal(
        <div
          ref={popoverRef}
          className="lego-icon-popover"
          role="dialog"
          style={{ left: pos.left, bottom: pos.bottom }}
          onMouseEnter={cancelClose}
          onMouseLeave={scheduleClose}
        >
          <div className="lego-icon-popover-header">
            <div className="lego-icon-popover-title">{label}</div>
          </div>
          {devices.length === 0 ? (
            <div className="lego-icon-popover-empty">{t('legoNoDevicesOfType')}</div>
          ) : (
            <ul className="lego-icon-popover-list">
              {devices.map((d) => {
                const isEditing = editing?.name === d.name;
                return (
                  <li key={d.name} className="lego-icon-popover-row">
                    <div className="lego-icon-popover-row-id">
                      <span className="lego-icon-popover-id-label">{t('legoDeviceIdLabel')}=</span>
                      {isEditing ? (
                        <input
                          autoFocus
                          className="lego-icon-popover-id-input"
                          value={draft}
                          onChange={(e) => setDraft(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') commitEdit();
                            else if (e.key === 'Escape') cancelEdit();
                          }}
                          onBlur={commitEdit}
                        />
                      ) : (
                        <button
                          type="button"
                          className="lego-icon-popover-id-value"
                          onClick={() => startEdit(d.name)}
                          title={t('legoDeviceIdLabel')}
                        >
                          {d.name}
                        </button>
                      )}
                      <button
                        type="button"
                        className="lego-icon-popover-disconnect"
                        onClick={() => onDisconnect(kind, d.name)}
                        title={t('disconnect')}
                      >
                        ×
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          {error && <div className="lego-icon-popover-error">{error}</div>}
        </div>,
        document.body
      )}
    </div>
  );
};

const ControlPanel = ({
  connected,
  connectedBoard = null,
  platformConnectionType = null,
  isConnecting = false,
  onConnectMicrobit,
  onConnectPico,
  onConnectEsp32,
  onConnectEsp32Arduino,
  onDisconnect,
  onRun,
  onCtrlC,
  onReset,
  onClear,
  onSaveToMain,
  onDownload,
  onClearDownload,
  onClearMain,
  legoConnectionState = null,
  onLegoPickerOpen,
  onLegoConnectDevice,
  onLegoRenameDevice,
  onLegoDisconnectDevice
}) => {
  const { t } = useLanguage();
  const isLego = platformConnectionType === 'lego-ble';
  const isArduino = platformConnectionType === 'esp32-arduino';
  const [legoPickerOpen, setLegoPickerOpen] = useState(false);

  return (
    <div className="control-panel right-panel">
      <div className="button-group">
        {isLego ? (
          <>
            <button
              onClick={() => {
                onLegoPickerOpen?.();
                setLegoPickerOpen(true);
              }}
              className="button connect-button"
            >
              {t('legoConnectHardware')}
            </button>
            <div className="lego-icon-row">
              {KIND_ORDER.map((kind) => (
                <LegoDeviceIcon
                  key={kind}
                  kind={kind}
                  letter={KIND_LETTER[kind]}
                  label={t(KIND_LABEL_KEY[kind])}
                  devices={legoConnectionState?.[kind] || []}
                  onRename={onLegoRenameDevice}
                  onDisconnect={onLegoDisconnectDevice}
                  t={t}
                />
              ))}
            </div>
          </>
        ) : connected ? (
          <button
            onClick={onDisconnect}
            className="button disconnect-button"
            disabled={isConnecting}
          >
            {isConnecting ? t('disconnecting') : t('disconnect')}
          </button>
        ) : (
          <>
            {platformConnectionType === 'microbit' && (
              <button
                onClick={onConnectMicrobit}
                className="button connect-button"
                disabled={isConnecting}
              >
                {isConnecting ? t('legoConnecting') : t('connectMicrobit')}
              </button>
            )}
            {platformConnectionType === 'pico' && (
              <button
                onClick={onConnectPico}
                className="button connect-button"
                disabled={isConnecting}
              >
                {isConnecting ? t('legoConnecting') : t('connectPico')}
              </button>
            )}
            {platformConnectionType === 'esp32' && (
              <button
                onClick={onConnectEsp32}
                className="button connect-button"
                disabled={isConnecting}
              >
                {isConnecting ? t('legoConnecting') : t('connectEsp32')}
              </button>
            )}
            {platformConnectionType === 'esp32-arduino' && (
              <button
                onClick={onConnectEsp32Arduino}
                className="button connect-button"
                disabled={isConnecting}
              >
                {isConnecting ? t('legoConnecting') : t('connectEsp32')}
              </button>
            )}
          </>
        )}
        <button onClick={onClear} className="button clear-console-button" disabled={isConnecting}>
          {t('clearConsole')}
        </button>
      </div>

      {connected && (
        <div className="button-group">
          <button onClick={onRun} className="button run-button">
            {isArduino ? t('esp32CompileAndUpload') : t('runProgram')}
          </button>
          {connectedBoard === 'pico' && (
            <button onClick={onSaveToMain} className="button run-button">
              {t('saveToMainPy')}
            </button>
          )}
          {connectedBoard === 'microbit' && (
            <button onClick={onDownload} className="button run-button">
              {t('download')}
            </button>
          )}
          {connectedBoard === 'microbit' && (
            <button onClick={onClearDownload} className="button clear-console-button">
              {t('clearDownload')}
            </button>
          )}
          {connectedBoard === 'esp32' && (
            <button onClick={onSaveToMain} className="button run-button">
              {t('saveToMainPy')}
            </button>
          )}
          {connectedBoard === 'esp32' && (
            <button onClick={onClearMain} className="button clear-console-button">
              {t('clearMainPy')}
            </button>
          )}
          {/* An Arduino sketch can't be interrupted — the only control is a
              hard reset (which restarts it from setup()), so a "Stop" button
              would be misleading. Arduino gets Reset only. */}
          {!isArduino && (
            <button onClick={onCtrlC} className="button stop-button">
              {t('stopProgram')}
            </button>
          )}
          {/* LEGO has no serial REPL to reset — stop goes through interruptPython */}
          {!isLego && (
            <button onClick={onReset} className="button stop-button">
              {t('resetDevice')}
            </button>
          )}
        </div>
      )}

      {isLego && (
        <LegoCardPickerModal
          visible={legoPickerOpen}
          onConnect={onLegoConnectDevice}
          onClose={() => setLegoPickerOpen(false)}
        />
      )}
    </div>
  );
};

export default ControlPanel;
