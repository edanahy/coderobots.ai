/**
 * Admin User Detail
 * Per-student drill-down for the /users admin page: profile summary, full
 * session list (unfiltered), and a merged, newest-first activity feed
 * across messages/code_snapshots/console/interactions bounded to a time
 * range (defaults to Past Week — "what has this student been doing
 * lately" is the actual gut-check question).
 *
 * This is the live/interactive equivalent of what
 * scripts/merge_sessions_to_csv.py already does offline for CSV export.
 */

import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import { useAuth } from '../../contexts/AuthContext';
import { fetchAdminUserDetail, describeInteraction } from '../../services/adminUsers';
import { buildTimeRange } from '../../services/adminUsage';
import { getPlatform } from '../../platforms';
import { displayName, formatRelative, formatAbsolute } from './format';
import CodeModal from '../CodeModal';
import ConsoleModal from '../ConsoleModal';
import './AdminUserDetail.css';

marked.setOptions({ breaks: true, gfm: true });

function formatDateForInput(date) {
  return date.toISOString().split('T')[0];
}

function platformLabel(id) {
  return getPlatform(id)?.label || id || '—';
}

const ROLE_LABELS = { user: 'You', assistant: 'AI', system: 'System' };

function AdminUserDetail() {
  const { userId } = useParams();
  const { user, isAdmin, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  const [preset, setPreset] = useState('past_week');
  const [customStartDate, setCustomStartDate] = useState(() =>
    formatDateForInput(new Date(Date.now() - 6 * 24 * 60 * 60 * 1000))
  );
  const [customEndDate, setCustomEndDate] = useState(() => formatDateForInput(new Date()));

  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [expandedSystem, setExpandedSystem] = useState({});
  const [codeModal, setCodeModal] = useState({ open: false, code: '', lang: '' });
  const [consoleModal, setConsoleModal] = useState({ open: false, content: '' });

  useEffect(() => {
    if (!authLoading && (!user || !isAdmin)) {
      navigate('/');
    }
  }, [user, isAdmin, authLoading, navigate]);

  useEffect(() => {
    if (!user || !isAdmin || !userId) return;
    let cancelled = false;

    setLoading(true);
    setError(null);
    try {
      const { start, end } = buildTimeRange({ preset, customStartDate, customEndDate });
      fetchAdminUserDetail(userId, { startIso: start.toISOString(), endIso: end.toISOString() })
        .then((result) => {
          if (!cancelled) setDetail(result);
        })
        .catch((err) => {
          if (!cancelled) setError(err.message || 'Failed to load user activity');
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    } catch (err) {
      setError(err.message || 'Invalid date range');
      setLoading(false);
    }

    return () => {
      cancelled = true;
    };
  }, [user, isAdmin, userId, preset, customStartDate, customEndDate]);

  const openCodeModal = (code, lang = '') => setCodeModal({ open: true, code, lang });
  const closeCodeModal = () => setCodeModal({ open: false, code: '', lang: '' });
  const openConsoleModal = (content) => setConsoleModal({ open: true, content });
  const closeConsoleModal = () => setConsoleModal({ open: false, content: '' });

  const renderMessageBody = (content) => {
    const consoleSegments = content.split(/````([\s\S]*?)````/g);
    return consoleSegments.map((consoleSeg, consoleIdx) => {
      if (consoleIdx % 2 === 1) {
        const consoleText = consoleSeg.trim();
        return (
          <button key={consoleIdx} className="admin-users-inline-btn" onClick={() => openConsoleModal(consoleText)}>
            View attached console log
          </button>
        );
      }
      const codeSegments = consoleSeg.split(/```([\s\S]*?)```/g);
      return codeSegments.map((codeSeg, codeIdx) => {
        if (codeIdx % 2 === 0) {
          if (!codeSeg.trim()) return null;
          const html = DOMPurify.sanitize(marked.parse(codeSeg, { async: false }));
          return (
            <div key={`${consoleIdx}-${codeIdx}`} className="markdown-content" dangerouslySetInnerHTML={{ __html: html }} />
          );
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
          <button
            key={`${consoleIdx}-${codeIdx}`}
            className="admin-users-inline-btn"
            onClick={() => openCodeModal(codeText, lang)}
          >
            View code snippet
          </button>
        );
      });
    });
  };

  const renderFeedItem = (item, index) => {
    const timeLabel = formatAbsolute(item.timestamp);

    if (item.type === 'message') {
      if (item.role === 'system') {
        const expanded = !!expandedSystem[index];
        return (
          <div key={index} className="admin-users-feed-row">
            <div className="admin-users-feed-meta">
              <span className="admin-users-feed-time">{timeLabel}</span>
              <span className="admin-users-feed-tag admin-users-tag-system">System Prompt</span>
            </div>
            <button
              className="admin-users-inline-btn"
              onClick={() => setExpandedSystem((s) => ({ ...s, [index]: !s[index] }))}
            >
              {expanded ? '▾ Hide system prompt' : '▸ Show system prompt'}
            </button>
            {expanded && (
              <div
                className="markdown-content"
                dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(marked.parse(item.content, { async: false })) }}
              />
            )}
          </div>
        );
      }
      return (
        <div key={index} className="admin-users-feed-row">
          <div className="admin-users-feed-meta">
            <span className="admin-users-feed-time">{timeLabel}</span>
            <span className={`admin-users-feed-tag ${item.role === 'user' ? 'admin-users-tag-user' : 'admin-users-tag-ai'}`}>
              {ROLE_LABELS[item.role] || item.role}
            </span>
            {item.aiModel && <span className="admin-users-feed-detail">{item.aiModel}</span>}
            {item.codingLevel && <span className="admin-users-feed-detail">{item.codingLevel}</span>}
            {(item.promptTokens != null || item.completionTokens != null) && (
              <span className="admin-users-feed-detail">
                {item.promptTokens ?? '—'} / {item.completionTokens ?? '—'} tok
              </span>
            )}
          </div>
          <div className="admin-users-feed-body">{renderMessageBody(item.content)}</div>
        </div>
      );
    }

    if (item.type === 'code') {
      return (
        <div key={index} className="admin-users-feed-row">
          <div className="admin-users-feed-meta">
            <span className="admin-users-feed-time">{timeLabel}</span>
            <span className="admin-users-feed-tag admin-users-tag-code">Code saved</span>
            <span className="admin-users-feed-detail">{item.saveSource} · {item.codeTabName}</span>
          </div>
          <button className="admin-users-inline-btn" onClick={() => openCodeModal(item.content, 'python')}>
            View code
          </button>
        </div>
      );
    }

    if (item.type === 'console') {
      return (
        <div key={index} className="admin-users-feed-row">
          <div className="admin-users-feed-meta">
            <span className="admin-users-feed-time">{timeLabel}</span>
            <span className="admin-users-feed-tag admin-users-tag-console">Console captured</span>
            <span className="admin-users-feed-detail">{item.saveSource}</span>
          </div>
          <button className="admin-users-inline-btn" onClick={() => openConsoleModal(item.content)}>
            View console
          </button>
        </div>
      );
    }

    // interaction
    return (
      <div key={index} className="admin-users-feed-row">
        <div className="admin-users-feed-meta">
          <span className="admin-users-feed-time">{timeLabel}</span>
          <span className="admin-users-feed-tag admin-users-tag-interaction">{describeInteraction(item.buttonName)}</span>
        </div>
      </div>
    );
  };

  const feedItems = useMemo(() => detail?.feed || [], [detail]);

  if (authLoading) {
    return (
      <div className="admin-loading">
        <div className="admin-loading-text">Loading...</div>
      </div>
    );
  }

  if (!user || !isAdmin) {
    return null;
  }

  return (
    <div className="admin-page">
      <header className="admin-header">
        <div className="admin-header-inner">
          <div className="admin-header-left">
            <button type="button" onClick={() => navigate('/users')} className="admin-back-button">
              ← Back to Users
            </button>
            <h1 className="admin-title">
              {detail ? displayName(detail.profile) : 'Loading...'}
            </h1>
          </div>
          <div className="admin-user">
            Logged in as <span className="admin-user-email">{user.email}</span>
          </div>
        </div>
      </header>

      <main className="admin-main">
        <div className="admin-content">
          {error && <div className="admin-error-banner">{error}</div>}

          {detail && (
            <>
              <div className="admin-card">
                <h2 className="admin-section-title">Profile</h2>
                <div className="admin-users-profile-grid">
                  <div><span className="admin-label">Email</span>{detail.profile.email || '—'}</div>
                  <div><span className="admin-label">Roster name(s)</span>{detail.profile.students || '—'}</div>
                  <div><span className="admin-label">First seen</span>{formatAbsolute(detail.profile.createdAt)}</div>
                </div>
              </div>

              <div className="admin-card">
                <h2 className="admin-section-title">Sessions ({detail.sessions.length})</h2>
                <div className="admin-table-wrap">
                  <table className="admin-table">
                    <thead>
                      <tr>
                        <th>Name</th>
                        <th>Platform</th>
                        <th>Started</th>
                        <th>Last updated</th>
                        <th>Reactivations</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detail.sessions.length === 0 ? (
                        <tr><td colSpan={5} className="empty">No sessions yet.</td></tr>
                      ) : (
                        detail.sessions.map((s) => (
                          <tr key={s.id}>
                            <td>{s.name || 'Unnamed Session'}</td>
                            <td>{platformLabel(s.platform)}</td>
                            <td>{formatAbsolute(s.startTime)}</td>
                            <td title={formatAbsolute(s.lastUpdated)}>{formatRelative(s.lastUpdated)}</td>
                            <td>{s.loadCount}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="admin-card">
                <h2 className="admin-section-title">Recent Activity</h2>
                <div className="admin-preset-row">
                  <button type="button" onClick={() => setPreset('past_week')} className={`admin-button ${preset === 'past_week' ? 'active' : ''}`}>
                    Past Week
                  </button>
                  <button type="button" onClick={() => setPreset('past_month')} className={`admin-button ${preset === 'past_month' ? 'active' : ''}`}>
                    Past Month
                  </button>
                  <button type="button" onClick={() => setPreset('custom')} className={`admin-button ${preset === 'custom' ? 'active' : ''}`}>
                    Custom
                  </button>
                </div>

                {preset === 'custom' && (
                  <div className="admin-date-grid">
                    <div>
                      <label className="admin-label">Start Date</label>
                      <input type="date" value={customStartDate} onChange={(e) => setCustomStartDate(e.target.value)} className="admin-input" />
                    </div>
                    <div>
                      <label className="admin-label">End Date</label>
                      <input type="date" value={customEndDate} onChange={(e) => setCustomEndDate(e.target.value)} className="admin-input" />
                    </div>
                  </div>
                )}

                <div className="admin-users-feed">
                  {loading ? (
                    <div className="admin-users-feed-empty">Loading activity...</div>
                  ) : feedItems.length === 0 ? (
                    <div className="admin-users-feed-empty">No activity in this range.</div>
                  ) : (
                    feedItems.map((item, idx) => renderFeedItem(item, idx))
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </main>

      <CodeModal
        isOpen={codeModal.open}
        code={codeModal.code}
        lang={codeModal.lang}
        onClose={closeCodeModal}
        onCopy={() => navigator.clipboard?.writeText(codeModal.code)}
        onReplace={closeCodeModal}
      />
      <ConsoleModal
        isOpen={consoleModal.open}
        consoleContent={consoleModal.content}
        onClose={closeConsoleModal}
        onCopy={() => navigator.clipboard?.writeText(consoleModal.content)}
      />
    </div>
  );
}

export default AdminUserDetail;
