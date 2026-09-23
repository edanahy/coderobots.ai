/**
 * Small display-formatting helpers shared by AdminUsersDashboard and
 * AdminUserDetail (the two /users admin pages).
 */

/**
 * Email first — the `students` free-text roster field is unreliable (not
 * consistently filled in), so it's demoted to a fallback rather than the
 * primary identifier scripts/merge_sessions_to_csv.py still prefers.
 */
export function displayName({ students, email, userId }) {
  if (email) return email;
  if (students && students.trim()) return students.trim().split('\n')[0];
  return userId;
}

export function formatRelative(iso) {
  if (!iso) return 'Never active';
  const diffMs = Date.now() - new Date(iso).getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'Just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 30) return `${diffDay}d ago`;
  const diffMonth = Math.floor(diffDay / 30);
  return `${diffMonth}mo ago`;
}

export function formatAbsolute(iso) {
  if (!iso) return 'Never';
  return new Date(iso).toLocaleString();
}
