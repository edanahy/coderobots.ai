/**
 * Session Manager Service
 * Handles fetching and creating user sessions from Supabase
 * Ported from Python SessionManager class
 */

import { supabase } from '../../supabase';
import {
  TABLES,
  sessionInsertSchema,
  sessionUpdateSchema,
  conversationInsertSchema,
  conversationUpdateSchema,
  codeInsertSchema,
  codeUpdateSchema,
  codeSnapshotInsertSchema,
  consoleInsertSchema,
  validate,
} from '../../dbSchemas';

/**
 * Get all sessions for the current user
 */
export const getUserSessions = async () => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      console.error('No authenticated user');
      return [];
    }

    const { data, error } = await supabase
      .from(TABLES.SESSIONS)
      .select('*')
      .eq('user_id', user.id)
      .order('start_time', { ascending: false });

    if (error) {
      console.error('Error fetching sessions:', error);
      return [];
    }

    console.log(`✅ Fetched ${data?.length || 0} sessions`);
    return data || [];
  } catch (error) {
    console.error('Error in getUserSessions:', error);
    return [];
  }
};

/**
 * Create a new session with associated conversation, code, and console records
 */
export const createNewSession = async ({ hardwarePlatform, name, initialCode } = {}) => {
  try {
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      console.error('No authenticated user');
      return null;
    }

    if (!hardwarePlatform) {
      console.error('hardwarePlatform is required to create a session');
      return null;
    }

    console.log('Creating new session...');

    // Step 1: Create placeholder session to get ID
    const sessionPayload = {
      user_id: user.id,
      hardware_platform: hardwarePlatform,
      ...(name ? { name } : {}),
    };

    const sessionValidation = validate(sessionInsertSchema, sessionPayload);
    if (!sessionValidation.success) {
      console.error('Session validation failed:', sessionValidation.error.issues);
      return null;
    }

    const { data: placeholderSession, error: placeholderError } = await supabase
      .from(TABLES.SESSIONS)
      .insert(sessionValidation.data)
      .select()
      .single();

    if (placeholderError || !placeholderSession) {
      console.error('Error creating placeholder session:', placeholderError);
      return null;
    }

    const sessionId = placeholderSession.id;

    // Step 2: Create conversation
    const convoPayload = {
      user_id: user.id,
      session_id: sessionId,
      name: 'Chat 1',
    };

    const convoValidation = validate(conversationInsertSchema, convoPayload);
    if (!convoValidation.success) {
      console.error('Conversation validation failed:', convoValidation.error.issues);
      return null;
    }

    const { data: newConvo, error: convoError } = await supabase
      .from(TABLES.CONVERSATIONS)
      .insert(convoValidation.data)
      .select()
      .single();

    if (convoError || !newConvo) {
      console.error('Error creating conversation:', convoError);
      return null;
    }

    const convoId = newConvo.id;

    // Step 3: Create initial code record
    const codePayload = {
      user_id: user.id,
      session_id: sessionId,
      name: 'Code tab 1',
      content: initialCode || '# Start your new project here!',
      save_source: 'init',
    };

    const codeValidation = validate(codeInsertSchema, codePayload);
    if (!codeValidation.success) {
      console.error('Code validation failed:', codeValidation.error.issues);
      return null;
    }

    const { data: newCode, error: codeError } = await supabase
      .from(TABLES.CODE)
      .insert(codeValidation.data)
      .select()
      .single();

    if (codeError || !newCode) {
      console.error('Error creating code record:', codeError);
      return null;
    }

    const codeId = newCode.id;

    // Step 4: Create initial console record
    const consolePayload = {
      user_id: user.id,
      session_id: sessionId,
      content: '',
      save_source: 'init',
    };

    const consoleValidation = validate(consoleInsertSchema, consolePayload);
    if (!consoleValidation.success) {
      console.error('Console validation failed:', consoleValidation.error.issues);
      return null;
    }

    const { data: newConsole, error: consoleError } = await supabase
      .from(TABLES.CONSOLE)
      .insert(consoleValidation.data)
      .select()
      .single();

    if (consoleError || !newConsole) {
      console.error('Error creating console record:', consoleError);
      return null;
    }

    const consoleId = newConsole.id;

    // Step 5: Update session with foreign keys
    const updatePayload = {
      current_conversation_id: convoId,
      current_code_id: codeId,
      current_console_id: consoleId,
    };

    const updateValidation = validate(sessionUpdateSchema, updatePayload);
    if (!updateValidation.success) {
      console.error('Session update validation failed:', updateValidation.error.issues);
      return null;
    }

    const { data: updatedSession, error: updateError } = await supabase
      .from(TABLES.SESSIONS)
      .update(updateValidation.data)
      .eq('id', sessionId)
      .select()
      .single();

    if (updateError || !updatedSession) {
      console.error('Error updating session:', updateError);
      return null;
    }

    console.log(`✅ Successfully created new session with ID: ${updatedSession.id}`);
    return updatedSession;
  } catch (error) {
    console.error('Error in createNewSession:', error);
    return null;
  }
};

/**
 * Update session's current_code_id
 */
export const updateSessionCode = async (sessionId, newCodeId) => {
  try {
    if (!sessionId || !newCodeId) {
      console.error('session_id and new_code_id are required');
      return null;
    }

    const updatePayload = {
      current_code_id: newCodeId,
      last_updated: new Date().toISOString(),
    };

    const validation = validate(sessionUpdateSchema, updatePayload);
    if (!validation.success) {
      console.error('Session update validation failed:', validation.error.issues);
      return null;
    }

    const { data, error } = await supabase
      .from(TABLES.SESSIONS)
      .update(validation.data)
      .eq('id', sessionId)
      .select()
      .single();


    if (error) {
      console.error('Error updating session code:', error);
      return null;
    }

    console.log(`✅ Successfully updated session's code pointer`);
    return data;
  } catch (error) {
    console.error('Error in updateSessionCode:', error);
    return null;
  }
};

/**
 * Update session's current_console_id
 */
export const updateSessionConsole = async (sessionId, newConsoleId) => {
  try {
    if (!sessionId || !newConsoleId) {
      console.error('session_id and new_console_id are required');
      return null;
    }

    const updatePayload = {
      current_console_id: newConsoleId,
      last_updated: new Date().toISOString(),
    };

    const validation = validate(sessionUpdateSchema, updatePayload);
    if (!validation.success) {
      console.error('Session update validation failed:', validation.error.issues);
      return null;
    }

    const { data, error } = await supabase
      .from(TABLES.SESSIONS)
      .update(validation.data)
      .eq('id', sessionId)
      .select()
      .single();

    if (error) {
      console.error('Error updating session console:', error);
      return null;
    }

    console.log(`✅ Successfully updated session's console pointer`);
    return data;
  } catch (error) {
    console.error('Error in updateSessionConsole:', error);
    return null;
  }
};

/**
 * Update session's name
 */
export const updateSessionName = async (sessionId, name) => {
  try {
    if (!sessionId) {
      console.error('session_id is required');
      return null;
    }

    const updatePayload = {
      name: name || null,
      last_updated: new Date().toISOString(),
    };

    const validation = validate(sessionUpdateSchema, updatePayload);
    if (!validation.success) {
      console.error('Session update validation failed:', validation.error.issues);
      return null;
    }

    const { data, error } = await supabase
      .from(TABLES.SESSIONS)
      .update(validation.data)
      .eq('id', sessionId)
      .select()
      .single();

    if (error) {
      console.error('Error updating session name:', error);
      return null;
    }

    console.log(`✅ Successfully updated session name`);
    return data;
  } catch (error) {
    console.error('Error in updateSessionName:', error);
    return null;
  }
};

/**
 * Get all conversations for a session
 */
export const getSessionConversations = async (sessionId) => {
  try {
    if (!sessionId) {
      console.error('session_id is required');
      return [];
    }

    const { data, error } = await supabase
      .from(TABLES.CONVERSATIONS)
      .select('*')
      .eq('session_id', sessionId)
      .order('start_time', { ascending: true });

    if (error) {
      console.error('Error fetching conversations:', error);
      return [];
    }

    return data || [];
  } catch (error) {
    console.error('Error in getSessionConversations:', error);
    return [];
  }
};

/**
 * Create a new conversation for a session
 */
export const createConversation = async (sessionId, name = 'Chat 1') => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user || !sessionId) {
      console.error('User and session_id are required');
      return null;
    }

    const payload = {
      user_id: user.id,
      session_id: sessionId,
      name,
    };

    const validation = validate(conversationInsertSchema, payload);
    if (!validation.success) {
      console.error('Conversation validation failed:', validation.error.issues);
      return null;
    }

    const { data, error } = await supabase
      .from(TABLES.CONVERSATIONS)
      .insert(validation.data)
      .select()
      .single();

    if (error) {
      console.error('Error creating conversation:', error);
      return null;
    }

    console.log(`✅ Created new conversation with ID: ${data.id}`);
    return data;
  } catch (error) {
    console.error('Error in createConversation:', error);
    return null;
  }
};

/**
 * Update conversation name
 */
export const updateConversationName = async (conversationId, name) => {
  try {
    if (!conversationId) {
      console.error('conversation_id is required');
      return null;
    }

    const updatePayload = {
      name: name || 'Unnamed Chat',
      last_updated: new Date().toISOString(),
    };

    const validation = validate(conversationUpdateSchema, updatePayload);
    if (!validation.success) {
      console.error('Conversation update validation failed:', validation.error.issues);
      return null;
    }

    const { data, error } = await supabase
      .from(TABLES.CONVERSATIONS)
      .update(validation.data)
      .eq('id', conversationId)
      .select()
      .single();

    if (error) {
      console.error('Error updating conversation name:', error);
      return null;
    }

    console.log(`✅ Successfully updated conversation name`);
    return data;
  } catch (error) {
    console.error('Error in updateConversationName:', error);
    return null;
  }
};

/**
 * Close a conversation (chat tab). Soft delete: stamps deleted_at so the tab
 * is hidden from the UI, but the row and its messages are kept for research.
 */
export const closeConversation = async (conversationId) => {
  try {
    if (!conversationId) {
      console.error('conversation_id is required');
      return null;
    }

    const updatePayload = {
      deleted_at: new Date().toISOString(),
    };

    const validation = validate(conversationUpdateSchema, updatePayload);
    if (!validation.success) {
      console.error('Conversation update validation failed:', validation.error.issues);
      return null;
    }

    const { data, error } = await supabase
      .from(TABLES.CONVERSATIONS)
      .update(validation.data)
      .eq('id', conversationId)
      .select()
      .single();

    if (error) {
      console.error('Error closing conversation:', error);
      return null;
    }

    console.log(`✅ Closed conversation ${conversationId}`);
    return data;
  } catch (error) {
    console.error('Error in closeConversation:', error);
    return null;
  }
};

/**
 * Update session's current conversation
 */
export const updateSessionConversation = async (sessionId, conversationId) => {
  try {
    if (!sessionId || !conversationId) {
      console.error('session_id and conversation_id are required');
      return null;
    }

    const updatePayload = {
      current_conversation_id: conversationId,
      last_updated: new Date().toISOString(),
    };

    const validation = validate(sessionUpdateSchema, updatePayload);
    if (!validation.success) {
      console.error('Session update validation failed:', validation.error.issues);
      return null;
    }

    const { data, error } = await supabase
      .from(TABLES.SESSIONS)
      .update(validation.data)
      .eq('id', sessionId)
      .select()
      .single();

    if (error) {
      console.error('Error updating session conversation:', error);
      return null;
    }

    console.log(`✅ Successfully updated session's current conversation`);
    return data;
  } catch (error) {
    console.error('Error in updateSessionConversation:', error);
    return null;
  }
};

/**
 * Get all code records for a session
 */
export const getSessionCode = async (sessionId) => {
  try {
    if (!sessionId) {
      console.error('session_id is required');
      return [];
    }

    const { data, error } = await supabase
      .from(TABLES.CODE)
      .select('*')
      .eq('session_id', sessionId)
      .order('timestamp', { ascending: true });

    if (error) {
      console.error('Error fetching code records:', error);
      return [];
    }

    return data || [];
  } catch (error) {
    console.error('Error in getSessionCode:', error);
    return [];
  }
};

/**
 * Create a new code record for a session
 */
export const createCode = async (sessionId, name = 'Code Tab', content = '# Start your new code here!\n') => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user || !sessionId) {
      console.error('User and session_id are required');
      return null;
    }

    const payload = {
      user_id: user.id,
      session_id: sessionId,
      name: name,
      content: content,
      save_source: 'tab_create',
    };

    const validation = validate(codeInsertSchema, payload);
    if (!validation.success) {
      console.error('Code validation failed:', validation.error.issues);
      return null;
    }

    const { data, error } = await supabase
      .from(TABLES.CODE)
      .insert(validation.data)
      .select()
      .single();

    if (error) {
      console.error('Error creating code record:', error);
      return null;
    }

    console.log(`✅ Created new code record with ID: ${data.id}`);
    return data;
  } catch (error) {
    console.error('Error in createCode:', error);
    return null;
  }
};

/**
 * Update code record name
 */
export const updateCodeName = async (codeId, name) => {
  try {
    if (!codeId) {
      console.error('code_id is required');
      return null;
    }

    const updatePayload = {
      name: name || 'Code Tab',
    };

    const validation = validate(codeUpdateSchema, updatePayload);
    if (!validation.success) {
      console.error('Code update validation failed:', validation.error.issues);
      return null;
    }

    const { data, error } = await supabase
      .from(TABLES.CODE)
      .update(validation.data)
      .eq('id', codeId)
      .select()
      .single();

    if (error) {
      console.error('Error updating code name:', error);
      return null;
    }

    console.log(`✅ Successfully updated code name`);
    return data;
  } catch (error) {
    console.error('Error in updateCodeName:', error);
    return null;
  }
};

/**
 * Close a code record (code tab). Soft delete: stamps deleted_at so the tab
 * is hidden from the UI, but the row and its snapshots are kept for research.
 */
export const closeCode = async (codeId) => {
  try {
    if (!codeId) {
      console.error('code_id is required');
      return null;
    }

    const updatePayload = {
      deleted_at: new Date().toISOString(),
    };

    const validation = validate(codeUpdateSchema, updatePayload);
    if (!validation.success) {
      console.error('Code update validation failed:', validation.error.issues);
      return null;
    }

    const { data, error } = await supabase
      .from(TABLES.CODE)
      .update(validation.data)
      .eq('id', codeId)
      .select()
      .single();

    if (error) {
      console.error('Error closing code record:', error);
      return null;
    }

    console.log(`✅ Closed code record ${codeId}`);
    return data;
  } catch (error) {
    console.error('Error in closeCode:', error);
    return null;
  }
};

/**
 * Update code record content (live autosave)
 */
export const updateCodeContent = async (codeId, content) => {
  try {
    if (!codeId) {
      console.error('code_id is required');
      return null;
    }

    const updatePayload = {
      content: content,
      save_source: 'live_edit',
    };

    const validation = validate(codeUpdateSchema, updatePayload);
    if (!validation.success) {
      console.error('Code update validation failed:', validation.error.issues);
      return null;
    }

    const { data, error } = await supabase
      .from(TABLES.CODE)
      .update(validation.data)
      .eq('id', codeId)
      .select()
      .single();

    if (error) {
      console.error('Error updating code content:', error);
      return null;
    }

    console.log(`✅ Live saved code content`);
    return data;
  } catch (error) {
    console.error('Error in updateCodeContent:', error);
    return null;
  }
};

/**
 * Create a code snapshot (historical record)
 */
export const createCodeSnapshot = async (codeId, sessionId, content, saveSource) => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user || !codeId || !sessionId) {
      console.error('User, code_id, and session_id are required');
      return null;
    }

    const payload = {
      user_id: user.id,
      code_id: codeId,
      session_id: sessionId,
      content: content,
      save_source: saveSource,
    };

    const validation = validate(codeSnapshotInsertSchema, payload);
    if (!validation.success) {
      console.error('Code snapshot validation failed:', validation.error.issues);
      return null;
    }

    const { data, error } = await supabase
      .from(TABLES.CODE_SNAPSHOTS)
      .insert(validation.data)
      .select()
      .single();

    if (error) {
      console.error('Error creating code snapshot:', error);
      return null;
    }

    console.log(`✅ Created code snapshot (source: ${saveSource})`);
    return data;
  } catch (error) {
    console.error('Error in createCodeSnapshot:', error);
    return null;
  }
};

/**
 * Get code snapshots for a specific code record
 */
export const getCodeSnapshots = async (codeId) => {
  try {
    if (!codeId) {
      console.error('code_id is required');
      return [];
    }

    const { data, error } = await supabase
      .from(TABLES.CODE_SNAPSHOTS)
      .select('*')
      .eq('code_id', codeId)
      .order('timestamp', { ascending: false });

    if (error) {
      console.error('Error fetching code snapshots:', error);
      return [];
    }

    return data || [];
  } catch (error) {
    console.error('Error in getCodeSnapshots:', error);
    return [];
  }
};

/**
 * Assign a hardware platform to an existing session.
 * Writes directly since sessionUpdateSchema intentionally excludes hardware_platform
 * (platform is fixed at creation for new sessions, and this path is only used to
 * back-fill legacy rows).
 */
export const setSessionHardwarePlatform = async (sessionId, platformId) => {
  try {
    if (!sessionId || !platformId) {
      console.error('session_id and platform_id are required');
      return null;
    }

    const { data, error } = await supabase
      .from(TABLES.SESSIONS)
      .update({
        hardware_platform: platformId,
        last_updated: new Date().toISOString(),
      })
      .eq('id', sessionId)
      .select()
      .single();

    if (error) {
      console.error('Error setting session hardware platform:', error);
      return null;
    }

    console.log(`✅ Set hardware_platform=${platformId} on session ${sessionId}`);
    return data;
  } catch (error) {
    console.error('Error in setSessionHardwarePlatform:', error);
    return null;
  }
};
