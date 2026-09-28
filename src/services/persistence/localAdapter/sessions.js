/**
 * Session manager adapter (browser-local).
 * Mirrors supabaseAdapter/sessions.js contracts: same signatures, same row
 * shapes, null/[] on failure.
 */

import { insertRow, updateRow, selectRows, nowIso } from './store';

export const getUserSessions = async () =>
  selectRows('sessions', () => true, 'start_time', false);

export const createNewSession = async ({ hardwarePlatform, name, initialCode } = {}) => {
  if (!hardwarePlatform) {
    console.error('hardwarePlatform is required to create a session');
    return null;
  }

  const now = nowIso();
  const session = insertRow('sessions', {
    hardware_platform: hardwarePlatform,
    name: name || null,
    start_time: now,
    last_updated: now,
    loaded_timestamps: [],
    current_conversation_id: null,
    current_code_id: null,
    current_console_id: null,
  });

  const conversation = insertRow('conversations', {
    session_id: session.id,
    name: 'Chat 1',
    start_time: now,
    last_updated: now,
  });

  const code = insertRow('code', {
    session_id: session.id,
    name: 'Code tab 1',
    content: initialCode || '# Start your new project here!',
    save_source: 'init',
    timestamp: now,
  });

  const consoleRecord = insertRow('console', {
    session_id: session.id,
    content: '',
    save_source: 'init',
    timestamp: now,
  });

  const updated = updateRow('sessions', session.id, {
    current_conversation_id: conversation.id,
    current_code_id: code.id,
    current_console_id: consoleRecord.id,
  });

  console.log(`✅ Successfully created new local session with ID: ${updated.id}`);
  return updated;
};

export const updateSessionCode = async (sessionId, newCodeId) => {
  if (!sessionId || !newCodeId) {
    console.error('session_id and new_code_id are required');
    return null;
  }
  return updateRow('sessions', sessionId, {
    current_code_id: newCodeId,
    last_updated: nowIso(),
  });
};

export const updateSessionConsole = async (sessionId, newConsoleId) => {
  if (!sessionId || !newConsoleId) {
    console.error('session_id and new_console_id are required');
    return null;
  }
  return updateRow('sessions', sessionId, {
    current_console_id: newConsoleId,
    last_updated: nowIso(),
  });
};

export const updateSessionName = async (sessionId, name) => {
  if (!sessionId) {
    console.error('session_id is required');
    return null;
  }
  return updateRow('sessions', sessionId, {
    name: name || null,
    last_updated: nowIso(),
  });
};

export const getSessionConversations = async (sessionId) => {
  if (!sessionId) {
    console.error('session_id is required');
    return [];
  }
  return selectRows('conversations', (r) => r.session_id === sessionId, 'start_time', true);
};

export const createConversation = async (sessionId, name = 'Chat 1') => {
  if (!sessionId) {
    console.error('session_id is required');
    return null;
  }
  const now = nowIso();
  return insertRow('conversations', {
    session_id: sessionId,
    name,
    start_time: now,
    last_updated: now,
  });
};

export const updateConversationName = async (conversationId, name) => {
  if (!conversationId) {
    console.error('conversation_id is required');
    return null;
  }
  return updateRow('conversations', conversationId, {
    name: name || 'Unnamed Chat',
    last_updated: nowIso(),
  });
};

// Soft delete: the row stays (hidden from the tab bar), matching Supabase.
export const closeConversation = async (conversationId) => {
  if (!conversationId) {
    console.error('conversation_id is required');
    return null;
  }
  return updateRow('conversations', conversationId, { deleted_at: nowIso() });
};

export const updateSessionConversation = async (sessionId, conversationId) => {
  if (!sessionId || !conversationId) {
    console.error('session_id and conversation_id are required');
    return null;
  }
  return updateRow('sessions', sessionId, {
    current_conversation_id: conversationId,
    last_updated: nowIso(),
  });
};

export const getSessionCode = async (sessionId) => {
  if (!sessionId) {
    console.error('session_id is required');
    return [];
  }
  return selectRows('code', (r) => r.session_id === sessionId, 'timestamp', true);
};

export const createCode = async (sessionId, name = 'Code Tab', content = '# Start your new code here!\n') => {
  if (!sessionId) {
    console.error('session_id is required');
    return null;
  }
  return insertRow('code', {
    session_id: sessionId,
    name,
    content,
    save_source: 'tab_create',
    timestamp: nowIso(),
  });
};

export const updateCodeName = async (codeId, name) => {
  if (!codeId) {
    console.error('code_id is required');
    return null;
  }
  return updateRow('code', codeId, { name: name || 'Code Tab' });
};

// Soft delete: the row stays (hidden from the tab bar), matching Supabase.
export const closeCode = async (codeId) => {
  if (!codeId) {
    console.error('code_id is required');
    return null;
  }
  return updateRow('code', codeId, { deleted_at: nowIso() });
};

export const updateCodeContent = async (codeId, content) => {
  if (!codeId) {
    console.error('code_id is required');
    return null;
  }
  return updateRow('code', codeId, { content, save_source: 'live_edit' });
};

export const createCodeSnapshot = async (codeId, sessionId, content, saveSource) => {
  if (!codeId || !sessionId) {
    console.error('code_id and session_id are required');
    return null;
  }
  return insertRow('code_snapshots', {
    code_id: codeId,
    session_id: sessionId,
    content,
    save_source: saveSource,
    timestamp: nowIso(),
  });
};

export const getCodeSnapshots = async (codeId) => {
  if (!codeId) {
    console.error('code_id is required');
    return [];
  }
  return selectRows('code_snapshots', (r) => r.code_id === codeId, 'timestamp', false);
};

export const setSessionHardwarePlatform = async (sessionId, platformId) => {
  if (!sessionId || !platformId) {
    console.error('session_id and platform_id are required');
    return null;
  }
  return updateRow('sessions', sessionId, {
    hardware_platform: platformId,
    last_updated: nowIso(),
  });
};
