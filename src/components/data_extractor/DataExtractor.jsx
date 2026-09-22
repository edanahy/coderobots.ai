/**
 * Data Extractor Component
 * Admin-only page for exporting data from multiple tables with shared filters
 */

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import TableExporter from './TableExporter';
import { exportAllTablesAsZip } from '../../services/dataExport';
import './DataExtractor.css';

const MESSAGE_COLUMNS = [
  { key: 'id', label: 'ID', default: true },
  { key: 'user_id', label: 'User ID', default: false },
  { key: 'conversation_id', label: 'Conversation ID', default: false },
  { key: 'role', label: 'Role', default: true },
  { key: 'content', label: 'Content', default: true },
  { key: 'coding_level', label: 'Coding Level', default: true },
  { key: 'ai_model', label: 'AI Model', default: true },
  { key: 'prompt_tokens', label: 'Prompt Tokens', default: false },
  { key: 'completion_tokens', label: 'Completion Tokens', default: false },
  { key: 'code_context_id', label: 'Code Context ID', default: false },
  { key: 'console_context_id', label: 'Console Context ID', default: false },
  { key: 'lang', label: 'Language', default: false },
  { key: 'timestamp', label: 'Timestamp', default: true },
];

const SESSION_COLUMNS = [
  { key: 'id', label: 'ID', default: true },
  { key: 'user_id', label: 'User ID', default: false },
  { key: 'start_time', label: 'Start Time', default: true },
  { key: 'last_updated', label: 'Last Updated', default: true },
  { key: 'loaded_timestamps', label: 'Loaded Timestamps', default: false },
  { key: 'current_code_id', label: 'Current Code ID', default: false },
  { key: 'current_console_id', label: 'Current Console ID', default: false },
  { key: 'current_conversation_id', label: 'Current Conversation ID', default: false },
  { key: 'name', label: 'Name', default: true },
  { key: 'hardware_platform', label: 'Hardware Platform', default: true },
];

const CONSOLE_COLUMNS = [
  { key: 'id', label: 'ID', default: true },
  { key: 'user_id', label: 'User ID', default: false },
  { key: 'session_id', label: 'Session ID', default: false },
  { key: 'timestamp', label: 'Timestamp', default: true },
  { key: 'content', label: 'Content', default: true },
  { key: 'save_source', label: 'Save Source', default: true },
];

const CODE_COLUMNS = [
  { key: 'id', label: 'ID', default: true },
  { key: 'user_id', label: 'User ID', default: false },
  { key: 'session_id', label: 'Session ID', default: false },
  { key: 'name', label: 'Name', default: true },
  { key: 'content', label: 'Content', default: true },
  { key: 'save_source', label: 'Save Source', default: true },
  { key: 'timestamp', label: 'Timestamp', default: true },
];

const CODE_SNAPSHOT_COLUMNS = [
  { key: 'id', label: 'ID', default: true },
  { key: 'user_id', label: 'User ID', default: false },
  { key: 'code_id', label: 'Code ID', default: false },
  { key: 'session_id', label: 'Session ID', default: false },
  { key: 'timestamp', label: 'Timestamp', default: true },
  { key: 'content', label: 'Content', default: true },
  { key: 'save_source', label: 'Save Source', default: true },
];

const INTERACTION_COLUMNS = [
  { key: 'id', label: 'ID', default: true },
  { key: 'user_id', label: 'User ID', default: false },
  { key: 'session_id', label: 'Session ID', default: false },
  { key: 'timestamp', label: 'Timestamp', default: true },
  { key: 'button_name', label: 'Button Name', default: true },
];

const CONVERSATION_COLUMNS = [
  { key: 'id', label: 'ID', default: true },
  { key: 'user_id', label: 'User ID', default: false },
  { key: 'session_id', label: 'Session ID', default: false },
  { key: 'start_time', label: 'Start Time', default: true },
  { key: 'last_updated', label: 'Last Updated', default: true },
  { key: 'name', label: 'Name', default: true },
];

const USER_PROFILE_COLUMNS = [
  { key: 'user_id', label: 'User ID', default: true },
  { key: 'email', label: 'Email', default: true },
  { key: 'students', label: 'Students', default: true },
  { key: 'created_at', label: 'Created At', default: false },
  { key: 'updated_at', label: 'Updated At', default: false },
];

const ALL_TABLES = [
  { tableName: 'Messages', columns: MESSAGE_COLUMNS },
  { tableName: 'Sessions', columns: SESSION_COLUMNS },
  { tableName: 'Console', columns: CONSOLE_COLUMNS },
  { tableName: 'Code', columns: CODE_COLUMNS },
  { tableName: 'Code Snapshots', columns: CODE_SNAPSHOT_COLUMNS },
  { tableName: 'Interactions', columns: INTERACTION_COLUMNS },
  { tableName: 'Conversations', columns: CONVERSATION_COLUMNS },
  { tableName: 'User Profiles', columns: USER_PROFILE_COLUMNS },
];

function DataExtractor() {
  const { user, isAdmin, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  // Shared filter states
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [emailsInput, setEmailsInput] = useState('');

  const [exportingAll, setExportingAll] = useState(false);
  const [exportAllError, setExportAllError] = useState(null);
  const [exportAllResult, setExportAllResult] = useState(null);

  // Redirect non-admins
  useEffect(() => {
    if (!authLoading && (!user || !isAdmin)) {
      navigate('/');
    }
  }, [user, isAdmin, authLoading, navigate]);

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

  const parsedEmails = emailsInput
    .split(/[,\n]/)
    .map(email => email.trim())
    .filter(email => email.length > 0);

  const handleExportAll = async () => {
    setExportingAll(true);
    setExportAllError(null);
    setExportAllResult(null);

    try {
      const summary = await exportAllTablesAsZip({
        tables: ALL_TABLES,
        startTime,
        endTime,
        emails: parsedEmails,
        zipFileName: `data_export_${new Date().toISOString().split('T')[0]}.zip`,
      });
      setExportAllResult(summary);
    } catch (err) {
      setExportAllError(`Export failed: ${err.message}`);
    } finally {
      setExportingAll(false);
    }
  };

  return (
    <div className="admin-page">
      <header className="admin-header">
        <div className="admin-header-inner">
          <div className="admin-header-left">
            <button
              type="button"
              onClick={() => navigate('/')}
              className="admin-back-button"
            >
              ← Back
            </button>
            <h1 className="admin-title">
              Data Extractor
            </h1>
          </div>
          <div className="admin-user">
            Logged in as <span className="admin-user-email">{user.email}</span>
          </div>
        </div>
      </header>

      <main className="admin-main-extractor">
        <div className="admin-extractor-inner">
          <div className="admin-filters-row">
            <div className="admin-filters-grid">
              <div className="admin-card">
                <h2 className="admin-section-title">Time Range</h2>
                <div className="admin-card-spacer">
                  <div>
                    <label className="admin-label">Start Time</label>
                    <input
                      type="datetime-local"
                      value={startTime}
                      onChange={(e) => setStartTime(e.target.value)}
                      className="admin-input"
                    />
                  </div>
                  <div>
                    <label className="admin-label">End Time</label>
                    <input
                      type="datetime-local"
                      value={endTime}
                      onChange={(e) => setEndTime(e.target.value)}
                      className="admin-input"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => { setStartTime(''); setEndTime(''); }}
                    className="admin-text-button"
                  >
                    Clear dates
                  </button>
                </div>
              </div>

              <div className="admin-card">
                <div className="admin-card-header">
                  <h2 className="admin-section-title">User Filter</h2>
                  <button
                    type="button"
                    onClick={() => setEmailsInput('')}
                    className="admin-text-button admin-text-button-small"
                  >
                    Clear
                  </button>
                </div>

                <div className="admin-card-spacer-small">
                  <div>
                    <label className="admin-label">
                      Emails <span className="admin-label-hint">(comma or newline separated)</span>
                    </label>
                    <textarea
                      value={emailsInput}
                      onChange={(e) => setEmailsInput(e.target.value)}
                      placeholder="Leave empty for all users"
                      rows={4}
                      className="admin-input admin-input-textarea"
                    />
                  </div>
                  <div className="admin-filter-summary">
                    {parsedEmails.length === 0
                      ? 'All users will be included'
                      : `${parsedEmails.length} email${parsedEmails.length !== 1 ? 's' : ''} specified`}
                  </div>
                </div>
              </div>
            </div>

            <div className="admin-filter-summary">
              {parsedEmails.length === 0 ? 'All users' : `${parsedEmails.length} user${parsedEmails.length !== 1 ? 's' : ''}`}
              {' • '}
              {!startTime && !endTime ? 'All time' : `${startTime || 'Beginning'} to ${endTime || 'Now'}`}
            </div>

            <div className="admin-export-all-row">
              <button
                type="button"
                onClick={handleExportAll}
                disabled={exportingAll}
                className="admin-export-all-btn"
              >
                {exportingAll ? (
                  <span className="table-exporter-export-content">
                    <svg className="spinner" width="16" height="16" viewBox="0 0 24 24">
                      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" opacity="0.25" />
                      <path fill="currentColor" opacity="0.75" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    Exporting all tables...
                  </span>
                ) : (
                  'Export Everything (.zip)'
                )}
              </button>
            </div>

            {exportAllError && (
              <div className="admin-error-banner">
                {exportAllError}
              </div>
            )}

            {exportAllResult && (
              <div className="admin-success-banner">
                Exported {exportAllResult.length} tables:{' '}
                {exportAllResult.map(r => `${r.tableName} (${r.rowCount})`).join(', ')}
              </div>
            )}
          </div>

          <div className="admin-exporters-scroll">
            <TableExporter
              tableName="Messages"
              columns={MESSAGE_COLUMNS}
              startTime={startTime}
              endTime={endTime}
              emails={parsedEmails}
            />

            <TableExporter
              tableName="Sessions"
              columns={SESSION_COLUMNS}
              startTime={startTime}
              endTime={endTime}
              emails={parsedEmails}
            />

            <TableExporter
              tableName="Console"
              columns={CONSOLE_COLUMNS}
              startTime={startTime}
              endTime={endTime}
              emails={parsedEmails}
            />

            <TableExporter
              tableName="Code"
              columns={CODE_COLUMNS}
              startTime={startTime}
              endTime={endTime}
              emails={parsedEmails}
            />

            <TableExporter
              tableName="Code Snapshots"
              columns={CODE_SNAPSHOT_COLUMNS}
              startTime={startTime}
              endTime={endTime}
              emails={parsedEmails}
            />

            <TableExporter
              tableName="Interactions"
              columns={INTERACTION_COLUMNS}
              startTime={startTime}
              endTime={endTime}
              emails={parsedEmails}
            />

            <TableExporter
              tableName="Conversations"
              columns={CONVERSATION_COLUMNS}
              startTime={startTime}
              endTime={endTime}
              emails={parsedEmails}
            />

            <TableExporter
              tableName="User Profiles"
              columns={USER_PROFILE_COLUMNS}
              startTime={startTime}
              endTime={endTime}
              emails={parsedEmails}
            />
          </div>
        </div>
      </main>
    </div>
  );
}

export default DataExtractor;
