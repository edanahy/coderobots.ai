/**
 * Session Context
 * Manages active session state and provides session switching logic
 */

import { createContext, useContext, useState, useCallback, useRef, useEffect, useMemo } from 'react';
import {
  getUserSessions,
  createNewSession,
  updateSessionName as updateSessionNameService,
  getSessionConversations,
  createConversation,
  updateConversationName as updateConversationNameService,
  closeConversation as closeConversationService,
  updateSessionConversation,
  getSessionCode,
  createCode,
  updateCodeName as updateCodeNameService,
  closeCode as closeCodeService,
  updateCodeContent as updateCodeContentService,
  updateSessionCode as updateSessionCodeService,
  createCodeSnapshot,
  setSessionHardwarePlatform,
} from '../services/sessionManager';
import {
  getConversationHistory,
  getLatestCode,
  updateSessionOnLoad,
  logInteraction,
} from '../services/dataLogger';
import { getPlatform } from '../platforms';
import { getCurrentUserHardwareConfig, getHardwareCatalog, toPromptHardwareConfig } from '../services/hardwareConfig';
import instance from '../config/instance';

const SessionContext = createContext();

// Platforms this instance exposes for new sessions, in the order the
// instance config lists them. getPlatform() stays unfiltered so legacy
// sessions on a disabled platform remain readable.
const AVAILABLE_PLATFORMS = instance.platforms
  .map((id) => getPlatform(id))
  .filter(Boolean);

// Closed tabs are soft-deleted (deleted_at set) and hidden from the UI.
const openOnly = (rows) => rows.filter((row) => !row.deleted_at);

// The id to activate for a session: its stored pointer if that tab is still
// open, otherwise the first open tab (the stored one was closed or is stale).
const pickOpenTabId = (rows, currentId) => {
  const open = openOnly(rows);
  if (open.some((row) => row.id === currentId)) return currentId;
  return open.length > 0 ? open[0].id : currentId;
};

export const SessionProvider = ({ children }) => {
  const [activeSession, setActiveSession] = useState(null);
  const [conversationHistory, setConversationHistory] = useState([]);
  // All rows including closed tabs (new tab names count them, so a new
  // "Chat 3" never reuses a closed tab's name); only open ones are exposed.
  const [conversations, setConversations] = useState([]);
  const [currentConversationId, setCurrentConversationId] = useState(null);
  const [codeRecords, setCodeRecords] = useState([]);
  const [currentCodeId, setCurrentCodeId] = useState(null);
  const [currentCodeContent, setCurrentCodeContent] = useState('# Start your project here!\n');
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [pendingPlatformSession, setPendingPlatformSession] = useState(null);
  const [hardwarePromptConfig, setHardwarePromptConfig] = useState(null);
  const loadHardwarePromptConfig = useCallback(async () => {
    try {
      const [catalog, config] = await Promise.all([
        getHardwareCatalog(),
        getCurrentUserHardwareConfig(),
      ]);
      setHardwarePromptConfig(toPromptHardwareConfig(config, catalog));
    } catch (error) {
      console.error('Error loading hardware prompt configuration:', error);
      setHardwarePromptConfig(null);
    }
  }, []);

  
  // Debounce timer for live code saving
  const saveDebounceTimer = useRef(null);
  // The edit the debounce timer will save: { codeId, sessionId, content }
  const pendingSaveRef = useRef(null);

  const openConversations = useMemo(() => openOnly(conversations), [conversations]);
  const openCodeRecords = useMemo(() => openOnly(codeRecords), [codeRecords]);

  /**
   * Load all user sessions from database
   */
  const loadSessions = useCallback(async () => {
    setLoading(true);
    try {
      const userSessions = await getUserSessions();
      setSessions(userSessions);
      return userSessions;
    } catch (error) {
      console.error('Error loading sessions:', error);
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * Load conversations for the current session
   */
  const loadConversations = useCallback(async (sessionId) => {
    if (!sessionId) {
      setConversations([]);
      return [];
    }
    
    try {
      const sessionConversations = await getSessionConversations(sessionId);
      setConversations(sessionConversations);
      return sessionConversations;
    } catch (error) {
      console.error('Error loading conversations:', error);
      return [];
    }
  }, []);

  /**
   * Load code records for the current session
   */
  const loadCodeRecords = useCallback(async (sessionId) => {
    if (!sessionId) {
      setCodeRecords([]);
      return [];
    }
    
    try {
      const sessionCode = await getSessionCode(sessionId);
      setCodeRecords(sessionCode);
      return sessionCode;
    } catch (error) {
      console.error('Error loading code records:', error);
      return [];
    }
  }, []);

  /**
   * Switch to an existing session. New sessions must be created via
   * createSessionWithPlatform (which requires the user to pick a platform).
   */
  const setActiveSessionById = useCallback(async (sessionId) => {
    setLoading(true);
    try {
      // Save current code before switching sessions
      if (currentCodeId && currentCodeContent && activeSession) {
        await updateCodeContentService(currentCodeId, currentCodeContent);
        console.log(`✅ Saved current code before switching sessions`);
      }

      // Load existing session
      const allSessions = await getUserSessions();
      const session = allSessions.find((s) => s.id === sessionId);

      if (!session) {
        console.error(`Session ${sessionId} not found`);
        return false;
      }

      // Legacy row: force the user to pick a platform before activating.
      if (!session.hardware_platform) {
        setPendingPlatformSession({ id: session.id, name: session.name || '' });
        return 'pending-platform';
      }

      // Update session timestamps
      await updateSessionOnLoad(sessionId);

      // Load all conversations and code records for this session
      const sessionConversations = await loadConversations(session.id);
      const sessionCodeRecords = await loadCodeRecords(session.id);

      // If the stored current tab was closed, repoint the session at the
      // first open tab so it never resumes on a hidden one.
      let loadedSession = session;
      const conversationId = pickOpenTabId(sessionConversations, session.current_conversation_id);
      if (conversationId !== session.current_conversation_id) {
        loadedSession = (await updateSessionConversation(session.id, conversationId)) || loadedSession;
      }
      const codeId = pickOpenTabId(sessionCodeRecords, session.current_code_id);
      if (codeId !== session.current_code_id) {
        loadedSession = (await updateSessionCodeService(session.id, codeId)) || loadedSession;
      }

      // Load conversation history
      if (conversationId) {
        const history = await getConversationHistory(conversationId);
        setConversationHistory(history);
        setCurrentConversationId(conversationId);
      }

      setActiveSession(loadedSession);

      // Set current code if available (rows were just fetched, so their
      // content is the latest saved)
      const openCode = openOnly(sessionCodeRecords);
      const currentCode = openCode.find((code) => code.id === codeId);
      if (currentCode) {
        setCurrentCodeId(codeId);
        setCurrentCodeContent(currentCode.content ?? '# Start your project here!\n');
      } else if (openCode.length > 0) {
        // Fall back to first open code record
        setCurrentCodeId(openCode[0].id);
        setCurrentCodeContent(openCode[0].content || '# Start your project here!\n');
      }
      
      console.log(`✅ Active session set to: ${session.id}`);
      logInteraction('switch_session', session.id);
      return true;
    } catch (error) {
      console.error('Error setting active session:', error);
      return false;
    } finally {
      setLoading(false);
    }
  }, [loadConversations, currentCodeId, currentCodeContent, activeSession, loadCodeRecords]);

  /**
   * Create a new session with a required hardware platform and optional name.
   */
  const createSessionWithPlatform = useCallback(async ({ name, platformId }) => {
    if (!platformId || !getPlatform(platformId)) {
      console.error('createSessionWithPlatform requires a valid platformId');
      return false;
    }
    setLoading(true);
    try {
      if (currentCodeId && currentCodeContent && activeSession) {
        await updateCodeContentService(currentCodeId, currentCodeContent);
      }

      const session = await createNewSession({
        hardwarePlatform: platformId,
        name: name || null,
        initialCode: getPlatform(platformId)?.starterCode,
      });
      if (!session) {
        console.error('Failed to create new session');
        return false;
      }

      setConversationHistory([]);
      setCurrentConversationId(session.current_conversation_id);
      setActiveSession(session);

      await loadSessions();
      await loadConversations(session.id);
      const sessionCodeRecords = await loadCodeRecords(session.id);

      if (session.current_code_id) {
        const latestCode = await getLatestCode(session.id);
        if (latestCode !== null) {
          setCurrentCodeId(session.current_code_id);
          setCurrentCodeContent(latestCode);
        } else if (sessionCodeRecords.length > 0) {
          setCurrentCodeId(sessionCodeRecords[0].id);
          setCurrentCodeContent(sessionCodeRecords[0].content || '# Start your project here!\n');
        }
      } else if (sessionCodeRecords.length > 0) {
        setCurrentCodeId(sessionCodeRecords[0].id);
        setCurrentCodeContent(sessionCodeRecords[0].content || '# Start your project here!\n');
      }

      console.log(`✅ Created new ${platformId} session: ${session.id}`);
      logInteraction(`create_session_${platformId}`, session.id);
      return true;
    } catch (error) {
      console.error('Error creating session with platform:', error);
      return false;
    } finally {
      setLoading(false);
    }
  }, [activeSession, currentCodeId, currentCodeContent, loadSessions, loadConversations, loadCodeRecords]);

  /**
   * Back-fill the hardware platform on a legacy session, then activate it.
   */
  const assignPlatformToSession = useCallback(async (sessionId, platformId) => {
    if (!sessionId || !platformId || !getPlatform(platformId)) {
      console.error('assignPlatformToSession requires sessionId and valid platformId');
      return false;
    }
    const updated = await setSessionHardwarePlatform(sessionId, platformId);
    if (!updated) return false;
    logInteraction(`assign_platform_${platformId}`, sessionId);
    setPendingPlatformSession(null);
    await loadSessions();
    return await setActiveSessionById(sessionId);
  }, [loadSessions]);  // eslint-disable-line react-hooks/exhaustive-deps

  const clearPendingPlatformSession = useCallback(() => {
    setPendingPlatformSession(null);
  }, []);

  const activePlatform = getPlatform(activeSession?.hardware_platform) || null;

  /**
   * Get the initial system priming message for building conversation
   */
  const getSystemPriming = useCallback(() => {
    if (!activePlatform) return '';
    return activePlatform.buildPriming(hardwarePromptConfig);
  }, [activePlatform, hardwarePromptConfig]);

  /**
   * Clear conversation history (for UI)
   */
  const clearConversation = useCallback(() => {
    setConversationHistory([]);
  }, []);

  /**
   * Update the name of the active session
   */
  const updateSessionName = useCallback(async (sessionId, name) => {
    try {
      const updatedSession = await updateSessionNameService(sessionId, name);
      if (updatedSession) {
        // Update active session if it's the one being renamed
        if (activeSession && activeSession.id === sessionId) {
          setActiveSession(updatedSession);
        }
        logInteraction('rename_session', sessionId);
        // Reload sessions list to reflect the change
        await loadSessions();
        return true;
      }
      return false;
    } catch (error) {
      console.error('Error updating session name:', error);
      return false;
    }
  }, [activeSession, loadSessions]);

  /**
   * Switch to a different conversation within the current session
   */
  const switchConversation = useCallback(async (conversationId) => {
    if (!activeSession) {
      console.error('No active session');
      return false;
    }

    try {
      // Load conversation history
      const history = await getConversationHistory(conversationId);
      setConversationHistory(history);
      setCurrentConversationId(conversationId);

      // Update session's current conversation
      const updatedSession = await updateSessionConversation(activeSession.id, conversationId);
      if (updatedSession) {
        setActiveSession(updatedSession);
      }

      logInteraction('switch_conversation', activeSession.id);
      console.log(`✅ Switched to conversation ${conversationId}`);
      return true;
    } catch (error) {
      console.error('Error switching conversation:', error);
      return false;
    }
  }, [activeSession]);

  /**
   * Create a new conversation in the current session
   */
  const createNewConversation = useCallback(async () => {
    if (!activeSession) {
      console.error('No active session');
      return null;
    }

    try {
      const name = `Chat ${conversations.length + 1}`;
      const newConversation = await createConversation(activeSession.id, name);
      if (newConversation) {
        logInteraction('create_conversation', activeSession.id);
        // Reload conversations list
        await loadConversations(activeSession.id);

        // Switch to the new conversation
        await switchConversation(newConversation.id);

        return newConversation;
      }
      return null;
    } catch (error) {
      console.error('Error creating conversation:', error);
      return null;
    }
  }, [activeSession, conversations.length, loadConversations, switchConversation]);

  /**
   * Rename a conversation
   */
  const updateConversationName = useCallback(async (conversationId, name) => {
    if (!activeSession) {
      console.error('No active session');
      return false;
    }

    try {
      const updatedConversation = await updateConversationNameService(conversationId, name);
      if (updatedConversation) {
        logInteraction('rename_conversation', activeSession.id);
        // Reload conversations list to reflect the change
        await loadConversations(activeSession.id);
        return true;
      }
      return false;
    } catch (error) {
      console.error('Error updating conversation name:', error);
      return false;
    }
  }, [activeSession, loadConversations]);

  /**
   * Close a conversation (chat tab). Soft delete — the row and its messages
   * stay in the database, the tab is just hidden. The last open tab can't be
   * closed. Closing the active tab first switches to its right-hand
   * neighbour (or left, if it was last), so the session never points at a
   * closed tab even if the close write then fails.
   */
  const closeConversation = useCallback(async (conversationId) => {
    if (!activeSession) {
      console.error('No active session');
      return false;
    }
    if (openConversations.length <= 1) return false;
    const index = openConversations.findIndex((c) => c.id === conversationId);
    if (index === -1) return false;

    try {
      if (conversationId === currentConversationId) {
        const neighbor = openConversations[index + 1] || openConversations[index - 1];
        const switched = await switchConversation(neighbor.id);
        if (!switched) return false;
      }

      const closed = await closeConversationService(conversationId);
      if (!closed) return false;
      logInteraction('close_conversation', activeSession.id);
      await loadConversations(activeSession.id);
      return true;
    } catch (error) {
      console.error('Error closing conversation:', error);
      return false;
    }
  }, [activeSession, openConversations, currentConversationId, switchConversation, loadConversations]);

  /**
   * Switch to a different code record within the current session
   */
  const switchCode = useCallback(async (codeId) => {
    if (!activeSession) {
      console.error('No active session');
      return false;
    }

    try {
      // Reload code records and use the returned value (not the state which updates asynchronously)
      const freshCodeRecords = await loadCodeRecords(activeSession.id);
      // Find the code record
      const codeRecord = freshCodeRecords.find(code => code.id === codeId);
      if (!codeRecord) {
        console.error(`Code record ${codeId} not found`);
        return false;
      }

      setCurrentCodeId(codeId);
      setCurrentCodeContent(codeRecord.content || '# Start your project here!\n');

      // Update session's current code
      const updatedSession = await updateSessionCodeService(activeSession.id, codeId);
      if (updatedSession) {
        setActiveSession(updatedSession);
      }

      logInteraction('switch_code_tab', activeSession.id);
      console.log(`✅ Switched to code ${codeId}`);
      return true;
    } catch (error) {
      console.error('Error switching code:', error);
      return false;
    }
  }, [activeSession, loadCodeRecords]);

  /**
   * Create a new code record in the current session
   */
  const createNewCode = useCallback(async () => {
    if (!activeSession) {
      console.error('No active session');
      return null;
    }

    try {
      const name = `Code tab ${codeRecords.length + 1}`;
      const starterCode = getPlatform(activeSession.hardware_platform)?.starterCode;
      const newCode = await createCode(activeSession.id, name, starterCode);
      if (newCode) {
        logInteraction('create_code_tab', activeSession.id);
        // Switch to the new code record (this will reload code records internally)
        await switchCode(newCode.id);

        return newCode;
      }
      return null;
    } catch (error) {
      console.error('Error creating code record:', error);
      return null;
    }
  }, [activeSession, codeRecords.length, switchCode]);

  /**
   * Rename a code record
   */
  const updateCodeName = useCallback(async (codeId, name) => {
    if (!activeSession) {
      console.error('No active session');
      return false;
    }

    try {
      const updatedCode = await updateCodeNameService(codeId, name);
      if (updatedCode) {
        logInteraction('rename_code_tab', activeSession.id);
        // Reload code records list to reflect the change
        await loadCodeRecords(activeSession.id);
        return true;
      }
      return false;
    } catch (error) {
      console.error('Error updating code name:', error);
      return false;
    }
  }, [activeSession, loadCodeRecords]);

  /**
   * Save the pending debounced edit now (if any) instead of waiting for the
   * timer. The timer itself calls this too.
   */
  const savePendingCode = useCallback(async () => {
    if (saveDebounceTimer.current) {
      clearTimeout(saveDebounceTimer.current);
      saveDebounceTimer.current = null;
    }
    const pending = pendingSaveRef.current;
    pendingSaveRef.current = null;
    if (!pending) return;

    try {
      await updateCodeContentService(pending.codeId, pending.content);
      console.log(`🔄 Auto-saved code (debounced)`);

      // Also log a snapshot so every manual edit is preserved historically
      if (pending.sessionId && pending.content) {
        const snapshot = await createCodeSnapshot(
          pending.codeId,
          pending.sessionId,
          pending.content,
          'live_edit'
        );
        if (snapshot) {
          console.log(`📸 Created code snapshot (live_edit)`);
        }
      }
    } catch (error) {
      console.error('Error auto-saving code:', error);
    }
  }, []);

  /**
   * Update the content of the current code record with debounced live save
   */
  const updateCurrentCodeContent = useCallback((content) => {
    setCurrentCodeContent(content);
    
    // Clear existing timer
    if (saveDebounceTimer.current) {
      clearTimeout(saveDebounceTimer.current);
    }
    
    // Set new timer for live save (1 second after user stops typing)
    pendingSaveRef.current = currentCodeId
      ? { codeId: currentCodeId, sessionId: activeSession?.id, content }
      : null;
    saveDebounceTimer.current = setTimeout(savePendingCode, 1000); // 1 second debounce
  }, [currentCodeId, activeSession, savePendingCode]);

  /**
   * Close a code record (code tab). Soft delete — the row and its snapshots
   * stay in the database, the tab is just hidden. Same rules as
   * closeConversation; closing the active tab also saves any pending
   * debounced edit first so the last second of typing isn't lost.
   */
  const closeCode = useCallback(async (codeId) => {
    if (!activeSession) {
      console.error('No active session');
      return false;
    }
    if (openCodeRecords.length <= 1) return false;
    const index = openCodeRecords.findIndex((c) => c.id === codeId);
    if (index === -1) return false;

    try {
      if (codeId === currentCodeId) {
        await savePendingCode();
        const neighbor = openCodeRecords[index + 1] || openCodeRecords[index - 1];
        const switched = await switchCode(neighbor.id);
        if (!switched) return false;
      }

      const closed = await closeCodeService(codeId);
      if (!closed) return false;
      logInteraction('close_code_tab', activeSession.id);
      await loadCodeRecords(activeSession.id);
      return true;
    } catch (error) {
      console.error('Error closing code record:', error);
      return false;
    }
  }, [activeSession, openCodeRecords, currentCodeId, savePendingCode, switchCode, loadCodeRecords]);

  /**
   * Create a code snapshot (for historical record keeping)
   * @param {string} saveSource - The source/reason for the snapshot
   * @param {string} [content] - Optional content to snapshot (defaults to currentCodeContent)
   */
  const createSnapshot = useCallback(async (saveSource, content = null) => {
    const contentToSave = content !== null ? content : currentCodeContent;
    
    if (!activeSession || !currentCodeId || !contentToSave) {
      console.error('No active session, current code, or content');
      return null;
    }

    try {
      // Create snapshot
      const snapshot = await createCodeSnapshot(
        currentCodeId,
        activeSession.id,
        contentToSave,
        saveSource
      );

      if (snapshot) {
        console.log(`📸 Created code snapshot (${saveSource})`);
        return snapshot.id;
      }
      return null;
    } catch (error) {
      console.error('Error creating code snapshot:', error);
      return null;
    }
  }, [activeSession, currentCodeId, currentCodeContent]);

  // Auto-select the first code tab if records are loaded but none is selected
  useEffect(() => {
    if (openCodeRecords.length > 0 && !currentCodeId) {
      setCurrentCodeId(openCodeRecords[0].id);
      setCurrentCodeContent(openCodeRecords[0].content || '# Start your project here!\n');
    }
  }, [openCodeRecords, currentCodeId]);

  // Cleanup debounce timer on unmount
  useEffect(() => {
    return () => {
      if (saveDebounceTimer.current) {
        clearTimeout(saveDebounceTimer.current);
      }
    };
  }, []);

  useEffect(() => {
    loadHardwarePromptConfig();
  }, [loadHardwarePromptConfig]);

  useEffect(() => {
    const handler = () => {
      loadHardwarePromptConfig();
    };
    window.addEventListener('hardware-config-updated', handler);
    return () => {
      window.removeEventListener('hardware-config-updated', handler);
    };
  }, [loadHardwarePromptConfig]);

  
  const value = {
    activeSession,
    conversationHistory,
    conversations: openConversations,
    currentConversationId,
    codeRecords: openCodeRecords,
    currentCodeId,
    currentCodeContent,
    sessions,
    loading,
    activePlatform,
    availablePlatforms: AVAILABLE_PLATFORMS,
    pendingPlatformSession,
    clearPendingPlatformSession,
    createSessionWithPlatform,
    assignPlatformToSession,
    loadSessions,
    setActiveSessionById,
    getSystemPriming,
    clearConversation,
    updateSessionName,
    switchConversation,
    createNewConversation,
    updateConversationName,
    closeConversation,
    loadConversations,
    switchCode,
    createNewCode,
    updateCodeName,
    closeCode,
    updateCurrentCodeContent,
    createSnapshot,
    loadCodeRecords,
  };

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
};

export const useSession = () => {
  const context = useContext(SessionContext);
  if (!context) {
    throw new Error('useSession must be used within a SessionProvider');
  }
  return context;
};

