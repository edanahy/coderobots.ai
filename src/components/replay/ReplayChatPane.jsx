/**
 * Right replay panel: chat tabs + read-only message list.
 *
 * The message rendering mirrors ChatPanel.renderMessage exactly (4-backtick
 * console blocks and 3-backtick code blocks become buttons that open the reused
 * CodeModal / ConsoleModal; markdown via marked + DOMPurify, same bubble colors).
 * The message produced by the current event is highlighted ("new chats").
 */

import { useEffect, useRef, useState } from 'react';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import ChatTabs from '../ChatTabs';
import CodeModal from '../CodeModal';
import ConsoleModal from '../ConsoleModal';
import '../ChatPanel.css';
import './Replay.css';

marked.setOptions({ breaks: true, gfm: true });

const noop = () => {};

const ReplayChatPane = ({ frame, profile }) => {
  const bodyRef = useRef(null);
  const [codeModal, setCodeModal] = useState({ open: false, code: '', lang: '' });
  const [consoleModal, setConsoleModal] = useState({ open: false, content: '' });
  const [expandedSystem, setExpandedSystem] = useState({}); // message index -> expanded?

  const conversations = frame?.conversations || [];
  const activeChatTab = frame?.activeChatTab;
  const activeConv = conversations.find((c) => c.name === activeChatTab) || conversations[0];
  const messages = activeConv?.messages || [];
  // Legacy single-conversation sessions had no chat tabs.
  const showChatTabs = profile?.hasChatTabs !== false;

  // Highlight the message created by the current event (if it's in this tab).
  const highlightIndex =
    frame?.highlightKind === 'message' && activeConv?.name === activeChatTab
      ? frame.newMessageIndex
      : -1;

  useEffect(() => {
    if (bodyRef.current) {
      bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
    }
  }, [frame]);

  const renderMessage = (message, index) => {
    const highlight = index === highlightIndex ? ' replay-highlight' : '';

    // System priming messages were hidden from students by the old editor; show
    // them here as a distinct block that is collapsed by default.
    if (message.role === 'system') {
      const expanded = !!expandedSystem[index];
      const html = expanded
        ? DOMPurify.sanitize(marked.parse(message.content || '', { async: false }))
        : '';
      return (
        <div key={index} className="chat-msg-wrap align-left">
          <div className="chat-label">System Prompt</div>
          <div className={`chat-bubble chat-bubble-system${highlight}`}>
            <button
              className="replay-system-toggle"
              onClick={() => setExpandedSystem((s) => ({ ...s, [index]: !s[index] }))}
            >
              {expanded ? '▾ Hide system prompt' : '▸ Show system prompt'}
            </button>
            {expanded && (
              <div className="markdown-content" dangerouslySetInnerHTML={{ __html: html }} />
            )}
          </div>
        </div>
      );
    }

    const isUser = message.role === 'user';
    const label = isUser ? 'User' : 'AI Bot';
    const color = isUser ? '#fbe2d7' : '#d8f6d8';
    const align = isUser ? 'align-right' : 'align-left';

    const consoleSegments = (message.content || '').split(/````([\s\S]*?)````/g);

    return (
      <div key={index} className={`chat-msg-wrap ${align}`}>
        <div className="chat-label">{label}</div>
        <div className={`chat-bubble${highlight}`} style={{ backgroundColor: color }}>
          {consoleSegments.map((consoleSeg, consoleIdx) => {
            if (consoleIdx % 2 === 1) {
              const consoleText = consoleSeg.trim();
              return (
                <button
                  key={consoleIdx}
                  className="console-btn"
                  onClick={() => setConsoleModal({ open: true, content: consoleText })}
                >
                  VIEW ATTACHED CONSOLE LOG
                </button>
              );
            }
            const codeSegments = consoleSeg.split(/```([\s\S]*?)```/g);
            return codeSegments.map((codeSeg, codeIdx) => {
              if (codeIdx % 2 === 0) {
                if (codeSeg.trim()) {
                  const html = DOMPurify.sanitize(marked.parse(codeSeg, { async: false }));
                  return (
                    <div
                      key={`${consoleIdx}-${codeIdx}`}
                      className="markdown-content"
                      dangerouslySetInnerHTML={{ __html: html }}
                    />
                  );
                }
                return null;
              }
              let codeText = codeSeg;
              let lang = '';
              const firstNL = codeSeg.indexOf('\n');
              if (firstNL !== -1) {
                const firstLine = codeSeg.slice(0, firstNL).trim();
                if (/^[a-zA-Z0-9+#-]+$/.test(firstLine)) {
                  lang = firstLine;
                  codeText = codeSeg.slice(firstNL + 1);
                }
              }
              return (
                <div
                  key={`${consoleIdx}-${codeIdx}`}
                  style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}
                >
                  <button
                    className="code-btn"
                    onClick={() => setCodeModal({ open: true, code: codeText, lang })}
                  >
                    VIEW CODE SNIPPET
                  </button>
                </div>
              );
            });
          })}
        </div>
      </div>
    );
  };

  return (
    <div className="chat-panel">
      {showChatTabs && conversations.length > 0 && (
        <ChatTabs
          conversations={conversations.map((c) => ({ id: c.name, name: c.name }))}
          currentConversationId={activeChatTab}
          onSwitchConversation={noop}
          onCreateConversation={noop}
          onRenameConversation={noop}
          onCloseConversation={noop}
          readOnly
        />
      )}
      {showChatTabs && frame?.chatTabSwitched && (
        <div className="replay-tab-flash">Switched to chat “{activeChatTab}”</div>
      )}

      <div className="chat-body" ref={bodyRef}>
        <div className="chat-disclaimer">Replay — recorded session, read only.</div>
        {messages.length === 0 ? (
          <div className="replay-empty-chat">No chat messages yet.</div>
        ) : (
          messages.map((msg, idx) => renderMessage(msg, idx))
        )}
      </div>

      <CodeModal
        isOpen={codeModal.open}
        code={codeModal.code}
        lang={codeModal.lang}
        onClose={() => setCodeModal({ open: false, code: '', lang: '' })}
        onCopy={() => navigator.clipboard?.writeText(codeModal.code)}
        onReplace={() => setCodeModal({ open: false, code: '', lang: '' })}
      />
      <ConsoleModal
        isOpen={consoleModal.open}
        consoleContent={consoleModal.content}
        onClose={() => setConsoleModal({ open: false, content: '' })}
        onCopy={() => navigator.clipboard?.writeText(consoleModal.content)}
      />
    </div>
  );
};

export default ReplayChatPane;
