import { useEffect, useRef } from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { EditorView } from '@codemirror/view';
import { useLanguage } from '../contexts/LanguageContext';
import { renderTerminalText } from '../utils/consoleText';
import './ModalBase.css';
import './ConsoleModal.css';

const ConsoleModal = ({ isOpen, consoleContent, onClose, onCopy }) => {
  const { t } = useLanguage();
  const modalRef = useRef(null);

  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
    }

    return () => {
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  // Stored captures can hold terminal escape codes (colours, REPL line
  // editing); show — and copy — the text as the terminal displayed it.
  const displayText = renderTerminalText(consoleContent);

  const handleBackdropClick = (e) => {
    if (e.target === modalRef.current) {
      onClose();
    }
  };

  return (
    <div className="modal-overlay" ref={modalRef} onClick={handleBackdropClick}>
      <div className="modal-content modal-content-wide console-box">
        <div className="console-header">{t('consoleOutput')}</div>
        <div className="console-editor-container">
          <CodeMirror
            value={displayText}
            height="100%"
            extensions={[
              EditorView.editable.of(false),
              EditorView.theme({
                '&': {
                  height: '100%',
                  fontSize: '14px',
                  backgroundColor: '#1e1e1e',
                },
                '.cm-scroller': {
                  overflow: 'auto',
                  fontFamily: 'Monaco, Courier New, monospace',
                  backgroundColor: '#1e1e1e',
                },
                '.cm-line': {
                  color: '#d4d4d4',
                },
                '.cm-gutters': {
                  backgroundColor: '#1e1e1e',
                  color: '#858585',
                  border: 'none',
                }
              })
            ]}
            basicSetup={{
              lineNumbers: true,
              highlightActiveLineGutter: false,
              highlightSpecialChars: true,
              history: false,
              foldGutter: false,
              drawSelection: false,
              dropCursor: false,
              allowMultipleSelections: false,
              indentOnInput: false,
              syntaxHighlighting: false,
              bracketMatching: false,
              closeBrackets: false,
              autocompletion: false,
              rectangularSelection: false,
              crosshairCursor: false,
              highlightActiveLine: false,
              highlightSelectionMatches: false,
              closeBracketsKeymap: false,
              defaultKeymap: false,
              searchKeymap: true,
              historyKeymap: false,
              foldKeymap: false,
              completionKeymap: false,
              lintKeymap: false,
            }}
            readOnly={true}
          />
        </div>
        <div className="console-actions">
          <button data-act="cancel" onClick={onClose}>{t('cancel')}</button>
          <button data-act="copy" onClick={() => onCopy?.(displayText)}>{t('copy')}</button>
        </div>
      </div>
    </div>
  );
};

export default ConsoleModal;

