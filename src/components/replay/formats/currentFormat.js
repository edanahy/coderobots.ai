/**
 * Adapter for the current merged-session CSV (produced by
 * scripts/merge_sessions_to_csv.py): 21 columns with per-tab names, token stats,
 * and dereferenced attached-context content. Schema version 1.
 */

import { zipRow, isBlank } from './csvRows';
import { emptyCanonicalEvent } from './canonical';

const profile = {
  schemaVersion: 1,
  formatId: 'current-v1',
  label: 'Current session export',
  hasCodeTabs: true,
  hasChatTabs: true,
  // A `role: 'system'` message row is logged once per conversation as of
  // the direct-chat system-priming fix — sessions exported from before that
  // change simply won't have one, same as any other older-data omission.
  hasSystemMessages: true,
  hasTokenStats: true,
  hasContextContent: true,
};

/** True for a Schema Version 1 stamp, or (for older unstamped files) the
 *  presence of the current-only "Code Tab Name" column. */
function detect({ columns, metaByKey }) {
  if (Number(metaByKey['Schema Version']) === 1) return true;
  return Array.isArray(columns) && columns.includes('Code Tab Name');
}

function parse({ columns, eventRows, metaByKey }) {
  const meta = {
    student: metaByKey['Student'] || '',
    sessionId: metaByKey['Session ID'] || '',
    sessionName: metaByKey['Session Name'] || '',
    platform: metaByKey['Hardware Platform'] || '',
    startedAt: metaByKey['Started At'] || '',
    lastUpdated: metaByKey['Last Updated'] || '',
  };

  const events = eventRows.map((row) => {
    const obj = zipRow(columns, row);
    const ev = emptyCanonicalEvent();
    ev.type = obj['Type'] || '';
    ev.timestamp = obj['Timestamp'] || '';
    ev.codeTabName = obj['Code Tab Name'] || '';
    ev.code = obj['Code'] || '';
    ev.codeSaveSource = obj['Code Save Source'] || '';
    ev.console = obj['Console'] || '';
    ev.consoleSaveSource = obj['Console Save Source'] || '';
    ev.buttonName = obj['Button Clicked'] || '';
    ev.chatTabName = obj['Chat Tab Name'] || '';
    ev.messageAuthor = obj['Message Author'] || '';
    ev.message = obj['Message'] || '';
    ev.aiModel = obj['AI Model'] || '';
    ev.codingLevel = obj['LLM Coding Level'] || '';
    ev.promptTokens = obj['Prompt Tokens'] || '';
    ev.completionTokens = obj['Completion Tokens'] || '';
    ev.codeContextAttached = !isBlank(obj['Attached Code Context']);
    ev.consoleContextAttached = !isBlank(obj['Attached Console Context']);
    return ev;
  });

  return { meta, events, profile };
}

export default {
  id: profile.formatId,
  label: profile.label,
  schemaVersion: profile.schemaVersion,
  detect,
  parse,
  profile,
};
