/**
 * Code Tabs Component
 * Displays a horizontal scrollable list of code tabs for code file management.
 * Click an inactive tab to switch to it; click the active tab to rename it.
 * The hover "×" closes a tab (disabled on the last one).
 */

import { useState, useRef } from 'react';
import './CodeTabs.css';
import { useLanguage } from '../contexts/LanguageContext';

const CodeTabs = ({
  codeRecords,
  currentCodeId,
  onSwitchCode,
  onCreateCode,
  onRenameCode,
  onCloseCode,
  readOnly = false,
}) => {
  const { t } = useLanguage();
  const [editingId, setEditingId] = useState(null);
  const [editingName, setEditingName] = useState('');
  const tabsContainerRef = useRef(null);
  const canClose = codeRecords.length > 1;

  const handleStartEdit = (codeRecord, index) => {
    setEditingId(codeRecord.id);
    setEditingName(codeRecord.name || `Code tab ${index + 1}`);
  };

  const handleSaveEdit = async (codeId, previousName) => {
    const newName = editingName.trim();
    // Skip no-op saves: clicking the active tab and clicking away shouldn't
    // log a rename.
    if (newName && newName !== previousName) {
      await onRenameCode(codeId, newName);
    }
    setEditingId(null);
    setEditingName('');
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditingName('');
  };

  const handleKeyDown = (e, codeId, previousName) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSaveEdit(codeId, previousName);
    } else if (e.key === 'Escape') {
      handleCancelEdit();
    }
  };

  const handleTabClick = (codeRecord, index, isActive) => {
    if (readOnly || editingId === codeRecord.id) return;
    if (isActive) {
      handleStartEdit(codeRecord, index);
    } else {
      onSwitchCode(codeRecord.id);
    }
  };

  const handleClose = (e, codeRecord, displayName) => {
    e.stopPropagation();
    if (!canClose) return;
    if (window.confirm(t('closeTabConfirm').replace('{name}', displayName))) {
      onCloseCode(codeRecord.id);
    }
  };

  const handleWheel = (e) => {
    if (tabsContainerRef.current && e.deltaY !== 0) {
      e.preventDefault();
      tabsContainerRef.current.scrollBy({ left: e.deltaY, behavior: 'auto' });
    }
  };

  return (
    <div className="code-tabs-wrapper">
      <div
        className="code-tabs-container"
        ref={tabsContainerRef}
        onWheel={handleWheel}
      >
        {codeRecords.map((codeRecord, index) => {
          const isActive = codeRecord.id === currentCodeId;
          const isEditing = editingId === codeRecord.id;
          const displayName = codeRecord.name || `Code tab ${index + 1}`;

          return (
            <div
              key={codeRecord.id}
              className={`code-tab ${isActive ? 'active' : ''} ${readOnly ? 'read-only' : ''}`}
              onClick={() => handleTabClick(codeRecord, index, isActive)}
              title={isEditing ? undefined : displayName}
            >
              {isEditing ? (
                <input
                  type="text"
                  className="code-tab-input"
                  value={editingName}
                  onChange={(e) => setEditingName(e.target.value)}
                  onBlur={() => handleSaveEdit(codeRecord.id, displayName)}
                  onKeyDown={(e) => handleKeyDown(e, codeRecord.id, displayName)}
                  aria-label={t('renameTab')}
                  autoFocus
                  onClick={(e) => e.stopPropagation()}
                />
              ) : (
                <>
                  <span className="code-tab-name">
                    {displayName}
                  </span>
                  {!readOnly && (
                    // aria-disabled rather than disabled: a disabled button
                    // may not show its tooltip or stop the click reaching the
                    // tab (which would start a rename).
                    <button
                      type="button"
                      className={`code-tab-close ${canClose ? '' : 'disabled'}`}
                      onClick={(e) => handleClose(e, codeRecord, displayName)}
                      aria-disabled={!canClose}
                      aria-label={canClose ? t('closeTab') : t('cannotCloseLastTab')}
                      title={canClose ? t('closeTab') : t('cannotCloseLastTab')}
                    >
                      &times;
                    </button>
                  )}
                </>
              )}
            </div>
          );
        })}
        {!readOnly && (
          <button className="code-tab-add" onClick={onCreateCode} aria-label={t('addNewCode')}>
            +
          </button>
        )}
      </div>
    </div>
  );
};

export default CodeTabs;
