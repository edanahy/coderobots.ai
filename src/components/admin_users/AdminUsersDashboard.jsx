/**
 * Admin Users Dashboard
 * Roster overview for the /users admin page — one row per registered user
 * (including zero-activity signups), sortable/filterable/searchable, with a
 * "last active" signal derived from sessions/messages/code_snapshots/
 * interactions (there's no real last-login available client-side).
 *
 * Companion to /usage (AI cost/tokens) — this page is activity/engagement,
 * deliberately not duplicating cost/token info.
 */

import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { fetchAdminUserRoster } from '../../services/adminUsers';
import { getPlatform } from '../../platforms';
import { displayName, formatRelative, formatAbsolute } from './format';
import './AdminUsersDashboard.css';

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

function isActiveRecently(iso) {
  if (!iso) return false;
  return Date.now() - new Date(iso).getTime() <= SEVEN_DAYS_MS;
}

const COLUMNS = [
  { key: 'student', label: 'Student', getValue: (e) => displayName(e).toLowerCase() },
  { key: 'createdAt', label: 'First seen', getValue: (e) => e.createdAt || '' },
  { key: 'lastActive', label: 'Last active', getValue: (e) => e.lastActiveIso },
  { key: 'sessions', label: 'Sessions', getValue: (e) => e.sessionCount, numeric: true },
  { key: 'platforms', label: 'Platform(s)', getValue: (e) => e.platforms.join(', ') },
  { key: 'messages', label: 'Messages (you/AI)', getValue: (e) => e.userMessages + e.assistantMessages, numeric: true },
  { key: 'interactions', label: 'Runs / Interactions', getValue: (e) => e.interactionCount, numeric: true },
];

function compareValues(a, b, key) {
  if (key === 'lastActive') {
    // Nulls (never active) sort first regardless of direction's later negation.
    if (a === null && b === null) return 0;
    if (a === null) return -1;
    if (b === null) return 1;
    return a < b ? -1 : a > b ? 1 : 0;
  }
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return String(a).localeCompare(String(b));
}

function platformLabel(id) {
  return getPlatform(id)?.label || id;
}

function AdminUsersDashboard() {
  const { user, isAdmin, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  const [roster, setRoster] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  const [filterPreset, setFilterPreset] = useState('all');
  const [sortKey, setSortKey] = useState('lastActive');
  const [sortDir, setSortDir] = useState('asc');

  useEffect(() => {
    if (!authLoading && (!user || !isAdmin)) {
      navigate('/');
    }
  }, [user, isAdmin, authLoading, navigate]);

  useEffect(() => {
    if (!user || !isAdmin) return;
    let cancelled = false;

    setLoading(true);
    setError(null);
    fetchAdminUserRoster()
      .then((rows) => {
        if (!cancelled) setRoster(rows);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message || 'Failed to load users');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [user, isAdmin]);

  const handleSort = (key) => {
    if (key === sortKey) {
      setSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  const rows = useMemo(() => {
    const column = COLUMNS.find((c) => c.key === sortKey) || COLUMNS[0];
    const query = search.trim().toLowerCase();

    const filtered = roster.filter((entry) => {
      if (filterPreset === 'active' && !isActiveRecently(entry.lastActiveIso)) return false;
      if (filterPreset === 'inactive' && isActiveRecently(entry.lastActiveIso)) return false;
      if (query) {
        const haystack = `${displayName(entry)} ${entry.email}`.toLowerCase();
        if (!haystack.includes(query)) return false;
      }
      return true;
    });

    const sorted = [...filtered].sort((a, b) => {
      const cmp = compareValues(column.getValue(a), column.getValue(b), column.key);
      return sortDir === 'asc' ? cmp : -cmp;
    });

    return sorted;
  }, [roster, search, filterPreset, sortKey, sortDir]);

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
            <button type="button" onClick={() => navigate('/')} className="admin-back-button">
              ← Back
            </button>
            <h1 className="admin-title">Users</h1>
          </div>
          <div className="admin-user">
            Logged in as <span className="admin-user-email">{user.email}</span>
          </div>
        </div>
      </header>

      <main className="admin-main">
        <div className="admin-content">
          <div className="admin-card">
            <h2 className="admin-section-title">Roster</h2>
            <div className="admin-users-controls">
              <input
                type="text"
                placeholder="Search by name or email..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="admin-input admin-users-search"
              />
              <div className="admin-preset-row">
                <button
                  type="button"
                  onClick={() => setFilterPreset('all')}
                  className={`admin-button ${filterPreset === 'all' ? 'active' : ''}`}
                >
                  All
                </button>
                <button
                  type="button"
                  onClick={() => setFilterPreset('active')}
                  className={`admin-button ${filterPreset === 'active' ? 'active' : ''}`}
                >
                  Active (7d)
                </button>
                <button
                  type="button"
                  onClick={() => setFilterPreset('inactive')}
                  className={`admin-button ${filterPreset === 'inactive' ? 'active' : ''}`}
                >
                  Inactive or Never
                </button>
              </div>
            </div>

            {error && <div className="admin-error-banner">{error}</div>}

            <div className="admin-table-wrap">
              <table className="admin-table admin-users-table">
                <thead>
                  <tr>
                    {COLUMNS.map((col) => (
                      <th key={col.key} onClick={() => handleSort(col.key)} className="admin-users-sortable-th">
                        {col.label}
                        {sortKey === col.key ? (sortDir === 'asc' ? ' ▲' : ' ▼') : ''}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan={COLUMNS.length} className="empty">Loading users...</td>
                    </tr>
                  ) : rows.length === 0 ? (
                    <tr>
                      <td colSpan={COLUMNS.length} className="empty">No users match this filter.</td>
                    </tr>
                  ) : (
                    rows.map((entry) => (
                      <tr
                        key={entry.userId}
                        className="admin-users-row"
                        onClick={() => navigate(`/users/${entry.userId}`)}
                      >
                        <td>{displayName(entry)}</td>
                        <td>{entry.createdAt ? new Date(entry.createdAt).toLocaleDateString() : '—'}</td>
                        <td
                          className={entry.lastActiveIso ? '' : 'admin-users-never-active'}
                          title={formatAbsolute(entry.lastActiveIso)}
                        >
                          {formatRelative(entry.lastActiveIso)}
                        </td>
                        <td>{entry.sessionCount}</td>
                        <td>{entry.platforms.map(platformLabel).join(', ') || '—'}</td>
                        <td>{entry.userMessages} / {entry.assistantMessages}</td>
                        <td>{entry.runCount} / {entry.interactionCount}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

export default AdminUsersDashboard;
