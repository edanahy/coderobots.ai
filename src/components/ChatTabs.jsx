/**
 * Chat Tabs Component
 * Displays a horizontal scrollable list of chat tabs for conversation management.
 * Click an inactive tab to switch to it; click the active tab to rename it.
 * The hover "×" closes a tab (disabled on the last one).
 */

import { useState, useRef } from 'react';
import './ChatTabs.css';
import { useLanguage } from '../contexts/LanguageContext';

const ChatTabs = ({
  conversations,
  currentConversationId,
  onSwitchConversation,
  onCreateConversation,
  onRenameConversation,
  onCloseConversation,
  readOnly = false,
}) => {
  const { t } = useLanguage();
  const [editingId, setEditingId] = useState(null);
  const [editingName, setEditingName] = useState('');
  const tabsContainerRef = useRef(null);
  const canClose = conversations.length > 1;

  const handleStartEdit = (conversation, index) => {
    setEditingId(conversation.id);
    setEditingName(conversation.name || `Chat ${index + 1}`);
  };

  const handleSaveEdit = async (conversationId, previousName) => {
    const newName = editingName.trim();
    // Skip no-op saves: clicking the active tab and clicking away shouldn't
    // log a rename.
    if (newName && newName !== previousName) {
      await onRenameConversation(conversationId, newName);
    }
    setEditingId(null);
    setEditingName('');
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditingName('');
  };

  const handleKeyDown = (e, conversationId, previousName) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSaveEdit(conversationId, previousName);
    } else if (e.key === 'Escape') {
      handleCancelEdit();
    }
  };

  const handleTabClick = (conversation, index, isActive) => {
    if (readOnly || editingId === conversation.id) return;
    if (isActive) {
      handleStartEdit(conversation, index);
    } else {
      onSwitchConversation(conversation.id);
    }
  };

  const handleClose = (e, conversation, displayName) => {
    e.stopPropagation();
    if (!canClose) return;
    if (window.confirm(t('closeTabConfirm').replace('{name}', displayName))) {
      onCloseConversation(conversation.id);
    }
  };

  const handleWheel = (e) => {
    if (tabsContainerRef.current && e.deltaY !== 0) {
      e.preventDefault();
      tabsContainerRef.current.scrollBy({ left: e.deltaY, behavior: 'auto' });
    }
  };

  return (
    <div className="chat-tabs-wrapper">
      <div
        className="chat-tabs-container"
        ref={tabsContainerRef}
        onWheel={handleWheel}
      >
        {conversations.map((conversation, index) => {
          const isActive = conversation.id === currentConversationId;
          const isEditing = editingId === conversation.id;
          const displayName = conversation.name || `Chat ${index + 1}`;

          return (
            <div
              key={conversation.id}
              className={`chat-tab ${isActive ? 'active' : ''} ${readOnly ? 'read-only' : ''}`}
              onClick={() => handleTabClick(conversation, index, isActive)}
              title={isEditing ? undefined : displayName}
            >
              {isEditing ? (
                <input
                  type="text"
                  className="chat-tab-input"
                  value={editingName}
                  onChange={(e) => setEditingName(e.target.value)}
                  onBlur={() => handleSaveEdit(conversation.id, displayName)}
                  onKeyDown={(e) => handleKeyDown(e, conversation.id, displayName)}
                  aria-label={t('renameTab')}
                  autoFocus
                  onClick={(e) => e.stopPropagation()}
                />
              ) : (
                <>
                  <span className="chat-tab-name">
                    {displayName}
                  </span>
                  {!readOnly && (
                    // aria-disabled rather than disabled: a disabled button
                    // may not show its tooltip or stop the click reaching the
                    // tab (which would start a rename).
                    <button
                      type="button"
                      className={`chat-tab-close ${canClose ? '' : 'disabled'}`}
                      onClick={(e) => handleClose(e, conversation, displayName)}
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
          <button className="chat-tab-add" onClick={onCreateConversation} aria-label={t('addNewChat')}>
            +
          </button>
        )}
      </div>
    </div>
  );
};

export default ChatTabs;
