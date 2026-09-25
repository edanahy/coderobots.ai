/**
 * Left replay panel: code tabs + read-only editor + recorded console + a static
 * action bar that highlights the button pressed by the current interaction event.
 */

import { useEffect, useRef } from 'react';
import CodeTabs from '../CodeTabs';
import ReplayCodeViewer from './ReplayCodeViewer';
import '../SPIKEEditor.css';
import './Replay.css';

const noop = () => {};

// Turn an unrecognized button key into a readable label, e.g.
// 'save_to_slot_11' -> 'Save To Slot 11', 'reset_device' -> 'Reset Device'.
const humanizeButton = (key) =>
  (key || '')
    .split('_')
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');

// Recorded interaction button_name -> display label (mirrors ControlPanel).
const ACTION_LABELS = [
  { key: 'connect', label: 'Connect' },
  { key: 'disconnect', label: 'Disconnect' },
  { key: 'run_device', label: '▶ Run Program' },
  { key: 'save_to_main_py', label: 'Save to main.py' },
  { key: 'download_to_microbit', label: 'Download' },
  { key: 'clear_download_microbit', label: 'Clear Download' },
  { key: 'clear_console', label: 'Clear Console' },
  { key: 'stop', label: 'Stop Program' },
  { key: 'reset', label: 'Reset Device' },
];

const ReplayEditorPane = ({ frame, profile }) => {
  const consoleRef = useRef(null);

  // Keep the console scrolled to the latest output.
  useEffect(() => {
    if (consoleRef.current) {
      consoleRef.current.scrollTop = consoleRef.current.scrollHeight;
    }
  }, [frame?.consoleText]);

  if (!frame) return null;

  const codeRecords = frame.codeTabs.map((t) => ({ id: t.name, name: t.name }));
  const activeCode = frame.codeTabs.find((t) => t.name === frame.activeCodeTab);
  const isInteraction = frame.highlightKind === 'interaction';
  const isConsole = frame.highlightKind === 'console';
  const pressedKey = isInteraction ? frame.event.buttonName : null;
  const knownPressed = ACTION_LABELS.some((a) => a.key === pressedKey);
  // Legacy single-buffer sessions had no tabs; only show tab chrome when the
  // format supports it (defaults to shown for unstamped/current sessions).
  const showCodeTabs = profile?.hasCodeTabs !== false;

  return (
    <div className="replay-editor spike-editor">
      {showCodeTabs && (
        <CodeTabs
          codeRecords={codeRecords}
          currentCodeId={frame.activeCodeTab}
          onSwitchCode={noop}
          onCreateCode={noop}
          onRenameCode={noop}
          onCloseCode={noop}
          readOnly
        />
      )}
      {showCodeTabs && frame.codeTabSwitched && (
        <div className="replay-tab-flash">Switched to code tab “{frame.activeCodeTab}”</div>
      )}

      <div className="replay-editor-body">
        <div className="editor-wrapper replay-editor-wrapper">
          <ReplayCodeViewer
            content={activeCode ? activeCode.content : '# (no code yet)\n'}
            changedLines={frame.highlightKind === 'code' ? frame.changedLines : null}
          />
        </div>

        <div className="control-panel right-panel replay-action-bar">
          <div className="button-group">
            {ACTION_LABELS.map((action) => {
              const active = pressedKey === action.key;
              const roleClass =
                action.key === 'connect'
                  ? 'connect-button'
                  : action.key === 'run_device'
                  ? 'run-button'
                  : action.key === 'stop' || action.key === 'disconnect'
                  ? 'stop-button'
                  : 'clear-console-button';
              return (
                <button
                  key={action.key}
                  className={`button ${roleClass} replay-action${active ? ' replay-action-active' : ''}`}
                  disabled
                >
                  {action.label}
                </button>
              );
            })}
            {isInteraction && !knownPressed && (
              <span className="button replay-action replay-action-active replay-action-unknown">
                {humanizeButton(pressedKey) || 'action'}
              </span>
            )}
          </div>
        </div>

        <div className={`terminal-wrapper replay-console-wrapper${isConsole ? ' replay-flash' : ''}`}>
          <pre className="replay-console" ref={consoleRef}>
            {frame.consoleText || ''}
          </pre>
        </div>
      </div>
    </div>
  );
};

export default ReplayEditorPane;
