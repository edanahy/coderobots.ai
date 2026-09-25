/**
 * Session Manager Service
 * CRUD for sessions, conversations, code records, and snapshots.
 *
 * Facade over the persistence adapter (src/services/persistence/): the
 * Supabase implementation lives in persistence/supabaseAdapter/sessions.js,
 * the browser-local one in persistence/localAdapter/. Callers keep importing
 * from here regardless of which backend the instance uses.
 */

import { adapter } from './persistence';

export const getUserSessions = (...args) => adapter.sessions.getUserSessions(...args);
export const createNewSession = (...args) => adapter.sessions.createNewSession(...args);
export const updateSessionCode = (...args) => adapter.sessions.updateSessionCode(...args);
export const updateSessionConsole = (...args) => adapter.sessions.updateSessionConsole(...args);
export const updateSessionName = (...args) => adapter.sessions.updateSessionName(...args);
export const getSessionConversations = (...args) => adapter.sessions.getSessionConversations(...args);
export const createConversation = (...args) => adapter.sessions.createConversation(...args);
export const updateConversationName = (...args) => adapter.sessions.updateConversationName(...args);
export const closeConversation = (...args) => adapter.sessions.closeConversation(...args);
export const updateSessionConversation = (...args) => adapter.sessions.updateSessionConversation(...args);
export const getSessionCode = (...args) => adapter.sessions.getSessionCode(...args);
export const createCode = (...args) => adapter.sessions.createCode(...args);
export const updateCodeName = (...args) => adapter.sessions.updateCodeName(...args);
export const closeCode = (...args) => adapter.sessions.closeCode(...args);
export const updateCodeContent = (...args) => adapter.sessions.updateCodeContent(...args);
export const createCodeSnapshot = (...args) => adapter.sessions.createCodeSnapshot(...args);
export const getCodeSnapshots = (...args) => adapter.sessions.getCodeSnapshots(...args);
export const setSessionHardwarePlatform = (...args) => adapter.sessions.setSessionHardwarePlatform(...args);
