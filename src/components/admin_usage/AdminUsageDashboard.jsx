import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BarChart, Bar, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useAuth } from '../../contexts/AuthContext';
import { fetchAdminUsageAnalytics, formatUsd } from '../../services/adminUsage';
import './AdminUsageDashboard.css';

function formatDateForInput(date) {
  return date.toISOString().split('T')[0];
}

function formatDayLabel(isoDate) {
  const date = new Date(`${isoDate}T00:00:00Z`);
  return `${date.getUTCMonth() + 1}/${date.getUTCDate()}`;
}

function AdminUsageDashboard() {
  const { user, isAdmin, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [preset, setPreset] = useState('past_week');
  const [customStartDate, setCustomStartDate] = useState(() => formatDateForInput(new Date(Date.now() - 6 * 24 * 60 * 60 * 1000)));
  const [customEndDate, setCustomEndDate] = useState(() => formatDateForInput(new Date()));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [analytics, setAnalytics] = useState(null);

  useEffect(() => {
    if (!authLoading && (!user || !isAdmin)) {
      navigate('/');
    }
  }, [user, isAdmin, authLoading, navigate]);

  const loadAnalytics = async () => {
    setLoading(true);
    setError(null);

    try {
      const result = await fetchAdminUsageAnalytics({
        preset,
        customStartDate,
        customEndDate,
      });
      setAnalytics(result);
    } catch (err) {
      setError(err.message || 'Failed to load analytics');
      setAnalytics(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!user || !isAdmin) {
      return;
    }
    loadAnalytics();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- these are loadAnalytics' inputs; it's recreated each render, so listing it would refetch forever
  }, [user, isAdmin, preset, customStartDate, customEndDate]);

  const chartData = useMemo(() => {
    if (!analytics) return [];
    return analytics.dailySpend.map((day) => ({
      ...day,
      dayLabel: formatDayLabel(day.date),
    }));
  }, [analytics]);

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
            <button
              type="button"
              onClick={() => navigate('/')}
              className="admin-back-button"
            >
              ← Back
            </button>
            <h1 className="admin-title">
              Admin Usage Dashboard
            </h1>
          </div>
          <div className="admin-user">
            Logged in as <span className="admin-user-email">{user.email}</span>
          </div>
        </div>
      </header>

      <main className="admin-main">
        <div className="admin-content">
          <div className="admin-card">
            <h2 className="admin-section-title">Time Range</h2>
            <div className="admin-preset-row">
              <button
                type="button"
                onClick={() => setPreset('past_week')}
                className={`admin-button ${preset === 'past_week' ? 'active' : ''}`}
              >
                Past Week
              </button>
              <button
                type="button"
                onClick={() => setPreset('past_month')}
                className={`admin-button ${preset === 'past_month' ? 'active' : ''}`}
              >
                Past Month
              </button>
              <button
                type="button"
                onClick={() => setPreset('custom')}
                className={`admin-button ${preset === 'custom' ? 'active' : ''}`}
              >
                Custom
              </button>
            </div>

            {preset === 'custom' && (
              <div className="admin-date-grid">
                <div>
                  <label className="admin-label">Start Date</label>
                  <input
                    type="date"
                    value={customStartDate}
                    onChange={(e) => setCustomStartDate(e.target.value)}
                    className="admin-input"
                  />
                </div>
                <div>
                  <label className="admin-label">End Date</label>
                  <input
                    type="date"
                    value={customEndDate}
                    onChange={(e) => setCustomEndDate(e.target.value)}
                    className="admin-input"
                  />
                </div>
              </div>
            )}
          </div>

          {error && (
            <div className="admin-error-banner">
              {error}
            </div>
          )}

          <div className="admin-card">
            <h2 className="admin-section-title">Total Spend</h2>
            <div className="admin-total-spend-value">
              {loading || !analytics ? '—' : formatUsd(analytics.totalSpendUsd)}
            </div>
            {analytics && (
              <div className="admin-total-spend-meta">
                {analytics.range.startIso} to {analytics.range.endIso}
              </div>
            )}
          </div>

          <div className="admin-card">
            <h2 className="admin-section-title">Daily Spend (USD)</h2>
            <div className="admin-chart-container">
              {loading ? (
                <div className="admin-chart-loading">Loading chart...</div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                    <XAxis dataKey="dayLabel" stroke="#94a3b8" tick={{ fill: '#94a3b8', fontSize: 12 }} />
                    <YAxis stroke="#94a3b8" tick={{ fill: '#94a3b8', fontSize: 12 }} />
                    <Tooltip
                      formatter={(value) => formatUsd(Number(value || 0))}
                      contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #334155' }}
                      labelStyle={{ color: '#cbd5e1' }}
                    />
                    <Bar dataKey="costUsd" fill="#10b981" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          <div className="admin-card">
            <h2 className="admin-section-title">Usage by User</h2>
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>User</th>
                    <th>LLM Calls</th>
                    <th>Spend (USD)</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan={3} className="empty">Loading users...</td>
                    </tr>
                  ) : analytics && analytics.users.length > 0 ? (
                    analytics.users.map((item) => (
                      <tr key={item.userId}>
                        <td>{item.email || item.userId}</td>
                        <td>{item.llmCalls.toLocaleString()}</td>
                        <td>{formatUsd(item.costUsd)}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={3} className="empty">No usage in selected range.</td>
                    </tr>
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

export default AdminUsageDashboard;
