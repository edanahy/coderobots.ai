/**
 * Admin Users Service
 * Roster overview + per-user activity drill-down for the /users admin page.
 *
 * Bypasses the persistence-adapter seam and queries Supabase directly, the
 * same way src/services/adminUsage.js and dataExport.js already do for
 * admin-only routes — RLS's "admins can read all rows" policies (see
 * INSTALL.md §11.8) make this safe without any new grants.
 */

import { supabase } from './supabase';

const PAGE_SIZE = 1000;

/**
 * Paginated select, optionally transformed (e.g. .eq('user_id', ...)).
 */
async function fetchAllRows(table, columns, applyFilters) {
  const rows = [];
  let page = 0;

  while (true) {
    const from = page * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;
    let query = supabase.from(table).select(columns).range(from, to);
    if (applyFilters) {
      query = applyFilters(query);
    }

    const { data, error } = await query;
    if (error) {
      throw new Error(`Failed to load ${table}: ${error.message}`);
    }

    rows.push(...data);
    if (data.length < PAGE_SIZE) {
      break;
    }
    page += 1;
  }

  return rows;
}

function bumpLastActive(entry, iso) {
  if (!iso) return;
  if (!entry.lastActiveIso || iso > entry.lastActiveIso) {
    entry.lastActiveIso = iso;
  }
}

/**
 * One row per registered user (including zero-activity signups), with
 * activity counts and a "last active" timestamp derived from whichever of
 * sessions/messages/code_snapshots/interactions is most recent for them.
 * There is no real "last login" available client-side (auth.users.last_sign_in_at
 * isn't exposed via RLS), so this is the practical substitute.
 */
export async function fetchAdminUserRoster() {
  const profiles = await fetchAllRows('user_profiles', 'user_id, email, students, created_at');

  const byUser = new Map();
  for (const p of profiles) {
    byUser.set(p.user_id, {
      userId: p.user_id,
      email: p.email || '',
      students: p.students || '',
      createdAt: p.created_at,
      lastActiveIso: null,
      sessionCount: 0,
      platforms: new Set(),
      userMessages: 0,
      assistantMessages: 0,
      runCount: 0,
      interactionCount: 0,
    });
  }

  const sessions = await fetchAllRows('sessions', 'user_id, hardware_platform, last_updated, loaded_timestamps');
  for (const s of sessions) {
    const entry = byUser.get(s.user_id);
    if (!entry) continue;
    entry.sessionCount += 1;
    if (s.hardware_platform) entry.platforms.add(s.hardware_platform);
    bumpLastActive(entry, s.last_updated);
    const timestamps = s.loaded_timestamps || [];
    if (timestamps.length > 0) {
      bumpLastActive(entry, timestamps[timestamps.length - 1]);
    }
  }

  // No `content` — this is a roster-level count/timestamp pass, not a read.
  const messages = await fetchAllRows('messages', 'user_id, role, timestamp');
  for (const m of messages) {
    const entry = byUser.get(m.user_id);
    if (!entry) continue;
    if (m.role === 'user') entry.userMessages += 1;
    else if (m.role === 'assistant') entry.assistantMessages += 1;
    bumpLastActive(entry, m.timestamp);
  }

  // live_edit snapshots fire purely from typing (1s debounce) — the only
  // signal for a student who codes silently without chatting or clicking a
  // toolbar button. Excluded from displayed counts, used only for last-active.
  const codeSnapshots = await fetchAllRows('code_snapshots', 'user_id, timestamp');
  for (const c of codeSnapshots) {
    const entry = byUser.get(c.user_id);
    if (!entry) continue;
    bumpLastActive(entry, c.timestamp);
  }

  const interactions = await fetchAllRows('interactions', 'user_id, button_name, timestamp');
  for (const i of interactions) {
    const entry = byUser.get(i.user_id);
    if (!entry) continue;
    entry.interactionCount += 1;
    if (i.button_name === 'run_device') entry.runCount += 1;
    bumpLastActive(entry, i.timestamp);
  }

  return Array.from(byUser.values()).map((entry) => ({
    ...entry,
    platforms: Array.from(entry.platforms),
  }));
}

/**
 * Profile + session list (unfiltered, whole history) plus a merged,
 * newest-first activity feed across messages/code_snapshots/console/
 * interactions for one user, optionally bounded to a time range.
 */
export async function fetchAdminUserDetail(userId, { startIso, endIso } = {}) {
  const [profileRows, sessions, codeRows] = await Promise.all([
    fetchAllRows('user_profiles', 'user_id, email, students, created_at', (q) => q.eq('user_id', userId)),
    fetchAllRows('sessions', 'id, name, hardware_platform, start_time, last_updated, loaded_timestamps', (q) => q.eq('user_id', userId)),
    fetchAllRows('code', 'id, name', (q) => q.eq('user_id', userId)),
  ]);

  const profileRow = profileRows[0] || { user_id: userId, email: '', students: '', created_at: null };
  const codeNameById = new Map(codeRows.map((c) => [c.id, c.name || 'Code Tab']));

  const applyRange = (q) => {
    let query = q.eq('user_id', userId);
    if (startIso) query = query.gte('timestamp', startIso);
    if (endIso) query = query.lte('timestamp', endIso);
    return query;
  };

  const [messages, codeSnapshots, consoleRows, interactions] = await Promise.all([
    fetchAllRows(
      'messages',
      'id, conversation_id, role, content, coding_level, ai_model, prompt_tokens, completion_tokens, timestamp',
      applyRange
    ),
    fetchAllRows('code_snapshots', 'id, code_id, content, save_source, timestamp', applyRange),
    fetchAllRows('console', 'id, content, save_source, timestamp', applyRange),
    fetchAllRows('interactions', 'id, button_name, timestamp', applyRange),
  ]);

  const feed = [];
  for (const m of messages) {
    feed.push({
      type: 'message',
      timestamp: m.timestamp,
      role: m.role,
      content: m.content || '',
      aiModel: m.ai_model,
      codingLevel: m.coding_level,
      promptTokens: m.prompt_tokens,
      completionTokens: m.completion_tokens,
    });
  }
  for (const c of codeSnapshots) {
    feed.push({
      type: 'code',
      timestamp: c.timestamp,
      saveSource: c.save_source,
      content: c.content || '',
      codeTabName: codeNameById.get(c.code_id) || 'Code Tab',
    });
  }
  for (const c of consoleRows) {
    feed.push({
      type: 'console',
      timestamp: c.timestamp,
      saveSource: c.save_source,
      content: c.content || '',
    });
  }
  for (const i of interactions) {
    feed.push({
      type: 'interaction',
      timestamp: i.timestamp,
      buttonName: i.button_name,
    });
  }

  feed.sort((a, b) => (a.timestamp < b.timestamp ? 1 : a.timestamp > b.timestamp ? -1 : 0));

  return {
    profile: {
      userId: profileRow.user_id,
      email: profileRow.email || '',
      students: profileRow.students || '',
      createdAt: profileRow.created_at,
    },
    sessions: sessions
      .map((s) => ({
        id: s.id,
        name: s.name,
        platform: s.hardware_platform,
        startTime: s.start_time,
        lastUpdated: s.last_updated,
        loadCount: (s.loaded_timestamps || []).length,
      }))
      .sort((a, b) => (a.startTime < b.startTime ? 1 : -1)),
    feed,
  };
}

// Exact button_name -> friendly label. Values sourced from the authoritative
// list in DATA_COLLECTION.md — keep in sync when a new one is added there.
const EXACT_INTERACTION_LABELS = {
  disconnect: 'Disconnected hardware',
  run_device: 'Ran code on the device',
  send_ctrl_c: 'Sent Ctrl-C (stop)',
  reset_device: 'Reset the device',
  clear_console: 'Cleared the console',
  save_to_main_py: 'Saved as main.py',
  download_to_microbit: 'Flashed code to micro:bit',
  switch_to_repl_mode: 'Switched to REPL mode',
  switch_to_program_slot_mode: 'Switched to Program Slot mode',
  clear_main_esp32: 'Cleared ESP32 main file',
  clear_download_microbit: 'Cleared queued micro:bit download',
  connect_lego: 'Connected a LEGO device',
  connect_esp32_arduino: 'Connected ESP32 (Arduino)',
  open_lego_picker: 'Opened LEGO device picker',
  rename_lego_device: 'Renamed a LEGO device',
  switch_session: 'Switched to a different session',
  rename_session: 'Renamed the session',
  switch_conversation: 'Switched chat tabs',
  create_conversation: 'Created a new chat tab',
  rename_conversation: 'Renamed a chat tab',
  switch_code_tab: 'Switched code tabs',
  create_code_tab: 'Created a new code tab',
  rename_code_tab: 'Renamed a code tab',
  send_message: 'Sent a chat message',
  copy_ai_code: 'Copied AI-suggested code',
  replace_ai_code: 'Replaced code with an AI suggestion',
  manual_save: 'Manually saved the session',
};

// Prefix -> formatter, for button_names that embed a specific target
// (checked only after the exact map above, so e.g. connect_lego is never
// reached here). Order doesn't matter — prefixes don't overlap.
const PREFIX_INTERACTION_LABELS = [
  ['connect_', (rest) => `Connected to ${rest}`],
  ['create_session_', (rest) => `Created a new ${rest} session`],
  ['assign_platform_', (rest) => `Assigned hardware platform: ${rest}`],
  ['switch_model_', (rest) => `Switched AI model to ${rest}`],
  ['save_to_slot_', (rest) => `Saved to program slot ${rest}`],
];

function titleCase(value) {
  return value.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Friendly label for an interactions.button_name value. Falls back to a
 * Title-Cased version of the raw string for anything unmapped, so a future
 * platform's new interaction names don't break the activity feed.
 */
export function describeInteraction(buttonName) {
  if (!buttonName) return 'Unknown action';
  if (EXACT_INTERACTION_LABELS[buttonName]) {
    return EXACT_INTERACTION_LABELS[buttonName];
  }
  for (const [prefix, format] of PREFIX_INTERACTION_LABELS) {
    if (buttonName.startsWith(prefix)) {
      return format(buttonName.slice(prefix.length));
    }
  }
  return titleCase(buttonName);
}
