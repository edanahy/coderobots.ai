/**
 * Database Schemas
 * Zod schemas for all Supabase database tables
 * Use these schemas to validate data before database operations
 */

import { z } from 'zod';

// ============================================================================
// TABLE NAMES
// ============================================================================

export const TABLES = {
  SESSIONS: 'sessions',
  CONVERSATIONS: 'conversations',
  MESSAGES: 'messages',
  CODE: 'code',
  CODE_SNAPSHOTS: 'code_snapshots',
  CONSOLE: 'console',
  INTERACTIONS: 'interactions',
  USER_PROFILES: 'user_profiles',
};

// ============================================================================
// BASE FIELD SCHEMAS
// ============================================================================

// Common field types used across tables
const fields = {
  id: z.number().int().positive(),
  idOptional: z.number().int().positive().optional().nullable(),
  userId: z.uuid(),
  timestamp: z.string().datetime({ offset: true }),
  timestampOptional: z.string().datetime({ offset: true }).optional().nullable(),
  content: z.string().optional().nullable().default(''),
  saveSource: z.string().min(1),
  name: z.string().optional().nullable(),
};

// ============================================================================
// SESSIONS TABLE
// ============================================================================

/**
 * Full session record from database
 */
export const sessionSchema = z.object({
  id: fields.id,
  user_id: fields.userId.optional().nullable(),
  start_time: fields.timestamp,
  last_updated: fields.timestamp,
  loaded_timestamps: z.array(z.string().datetime({ offset: true })).optional().nullable(),
  current_code_id: fields.idOptional,
  current_console_id: fields.idOptional,
  current_conversation_id: fields.idOptional,
  name: z.string().optional().nullable().default('Unnamed Session'),
  hardware_platform: z.string().optional().nullable(),
});

/**
 * Data for creating a new session
 */
export const sessionInsertSchema = z.object({
  user_id: fields.userId,
  hardware_platform: z.string(),
  name: z.string().optional().nullable(),
});

/**
 * Data for updating an existing session
 */
export const sessionUpdateSchema = z.object({
  name: z.string().optional().nullable(),
  current_code_id: fields.idOptional,
  current_console_id: fields.idOptional,
  current_conversation_id: fields.idOptional,
  last_updated: fields.timestamp.optional(),
  loaded_timestamps: z.array(z.string().datetime({ offset: true })).optional(),
}).partial();

// ============================================================================
// CONVERSATIONS TABLE
// ============================================================================

/**
 * Full conversation record from database
 */
export const conversationSchema = z.object({
  id: fields.id,
  user_id: fields.userId,
  session_id: fields.id,
  start_time: fields.timestamp,
  last_updated: fields.timestamp,
  name: z.string().optional().nullable().default('Unnamed Chat'),
});

/**
 * Data for creating a new conversation
 */
export const conversationInsertSchema = z.object({
  user_id: fields.userId,
  session_id: fields.id,
  name: z.string().optional().default('Unnamed Chat'),
});

/**
 * Data for updating an existing conversation
 */
export const conversationUpdateSchema = z.object({
  name: z.string().optional(),
  last_updated: fields.timestamp.optional(),
}).partial();

// ============================================================================
// MESSAGES TABLE
// ============================================================================

/**
 * Valid message roles
 */
export const messageRoleSchema = z.enum(['system', 'user', 'assistant']);

/**
 * Full message record from database
 */
export const messageSchema = z.object({
  id: fields.id,
  user_id: fields.userId,
  conversation_id: fields.id,
  role: messageRoleSchema,
  content: z.string().optional().nullable(),
  coding_level: z.string().optional().nullable(),
  ai_model: z.string().optional().nullable(),
  prompt_tokens: z.number().int().optional().nullable(),
  completion_tokens: z.number().int().optional().nullable(),
  code_context_id: fields.idOptional,
  console_context_id: fields.idOptional,
  lang: z.string().optional().nullable(),
  timestamp: fields.timestamp,
});

/**
 * Data for creating a new message
 */
export const messageInsertSchema = z.object({
  user_id: fields.userId,
  conversation_id: fields.id,
  role: messageRoleSchema,
  content: z.string().optional().nullable(),
  coding_level: z.string().optional().nullable(),
  ai_model: z.string().optional().nullable(),
  prompt_tokens: z.number().int().optional().nullable(),
  completion_tokens: z.number().int().optional().nullable(),
  code_context_id: fields.idOptional,
  console_context_id: fields.idOptional,
  lang: z.string().optional().nullable(),
});

// messages is write-once from the app (insert-only Data API grant — see
// INSTALL.md §11.9); there is no update path, so no messageUpdateSchema.

// ============================================================================
// CODE TABLE
// ============================================================================

/**
 * `save_source` (on both `code` and `code_snapshots`) is a free-form string,
 * not a DB-level enum — new hardware platforms are expected to introduce new
 * values (e.g. `save_to_slot_<n>` for SPIKE program slots), so it's
 * intentionally left as an unconstrained string below rather than a closed
 * Zod enum that would need editing for every new platform. Known values as
 * of this writing (see DATA_COLLECTION.md for the authoritative, maintained
 * list): init, tab_create, live_edit, manual_save, chat_context, ai_replace,
 * run_device, save_to_main_py, save_to_slot_<n>, download_to_microbit.
 */

/**
 * Full code record from database
 */
export const codeSchema = z.object({
  id: fields.id,
  user_id: fields.userId,
  session_id: fields.id,
  timestamp: fields.timestamp,
  content: z.string().optional().nullable().default(''),
  save_source: z.string().min(1),
  name: z.string().optional().nullable().default('Code Tab'),
});

/**
 * Data for creating a new code record
 */
export const codeInsertSchema = z.object({
  user_id: fields.userId,
  session_id: fields.id,
  content: z.string().optional().default(''),
  save_source: z.string().min(1),
  name: z.string().optional().default('Code Tab'),
});

/**
 * Data for updating an existing code record
 */
export const codeUpdateSchema = z.object({
  content: z.string().optional(),
  save_source: z.string().optional(),
  name: z.string().optional(),
}).partial();

// ============================================================================
// CODE SNAPSHOTS TABLE
// ============================================================================

/**
 * Full code snapshot record from database
 */
export const codeSnapshotSchema = z.object({
  id: fields.id,
  user_id: fields.userId,
  code_id: fields.id,
  session_id: fields.id,
  timestamp: fields.timestamp,
  content: z.string().optional().nullable().default(''),
  save_source: z.string().min(1),
});

/**
 * Data for creating a new code snapshot
 */
export const codeSnapshotInsertSchema = z.object({
  user_id: fields.userId,
  code_id: fields.id,
  session_id: fields.id,
  content: z.string().optional().default(''),
  save_source: z.string().min(1),
});

// ============================================================================
// CONSOLE TABLE
// ============================================================================

/**
 * Full console record from database
 */
export const consoleSchema = z.object({
  id: fields.id,
  user_id: fields.userId,
  session_id: fields.id,
  timestamp: fields.timestamp,
  content: z.string().optional().nullable().default(''),
  save_source: z.string().min(1),
});

/**
 * Data for creating a new console record
 */
export const consoleInsertSchema = z.object({
  user_id: fields.userId,
  session_id: fields.id,
  content: z.string().optional().default(''),
  save_source: z.string().min(1),
});

// ============================================================================
// INTERACTIONS TABLE
// ============================================================================

/**
 * Full interaction record from database
 */
export const interactionSchema = z.object({
  id: fields.id,
  user_id: fields.userId,
  session_id: fields.id,
  timestamp: fields.timestamp,
  button_name: z.string().min(1),
});

/**
 * Data for creating a new interaction record
 */
export const interactionInsertSchema = z.object({
  user_id: fields.userId,
  session_id: fields.id,
  button_name: z.string().min(1),
});

// ============================================================================
// USER PROFILES TABLE
// ============================================================================

/**
 * Full user_profiles record from database
 */
export const userProfileSchema = z.object({
  user_id: fields.userId,
  email: z.string().email().optional().nullable(),
  students: z.string().optional().nullable(),
  created_at: fields.timestamp,
  updated_at: fields.timestamp,
});

/**
 * Data for upserting a user_profiles row
 */
export const userProfileUpsertSchema = z.object({
  user_id: fields.userId,
  email: z.string().email().optional().nullable(),
  students: z.string().optional().nullable(),
});

// ============================================================================
// VALIDATION HELPERS
// ============================================================================

/**
 * Validate data against a schema and return result
 * @param {z.ZodSchema} schema - Zod schema to validate against
 * @param {unknown} data - Data to validate
 * @returns {{ success: boolean, data?: any, error?: z.ZodError }}
 */
export const validate = (schema, data) => {
  const result = schema.safeParse(data);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return { success: false, error: result.error };
};

/**
 * Validate data and throw if invalid
 * @param {z.ZodSchema} schema - Zod schema to validate against
 * @param {unknown} data - Data to validate
 * @returns {any} Validated and parsed data
 * @throws {z.ZodError} If validation fails
 */
export const validateOrThrow = (schema, data) => {
  return schema.parse(data);
};

/**
 * Create a validated insert payload (strips unknown fields)
 * @param {z.ZodSchema} schema - Zod schema for insert
 * @param {object} data - Data to validate
 * @returns {object} Validated data ready for insert
 */
export const prepareInsert = (schema, data) => {
  return schema.parse(data);
};

// ============================================================================
// TYPE EXPORTS (for JSDoc typing)
// ============================================================================

/**
 * @typedef {z.infer<typeof sessionSchema>} Session
 * @typedef {z.infer<typeof sessionInsertSchema>} SessionInsert
 * @typedef {z.infer<typeof sessionUpdateSchema>} SessionUpdate
 * 
 * @typedef {z.infer<typeof conversationSchema>} Conversation
 * @typedef {z.infer<typeof conversationInsertSchema>} ConversationInsert
 * @typedef {z.infer<typeof conversationUpdateSchema>} ConversationUpdate
 * 
 * @typedef {z.infer<typeof messageSchema>} Message
 * @typedef {z.infer<typeof messageInsertSchema>} MessageInsert
 *
 * @typedef {z.infer<typeof codeSchema>} Code
 * @typedef {z.infer<typeof codeInsertSchema>} CodeInsert
 * @typedef {z.infer<typeof codeUpdateSchema>} CodeUpdate
 * 
 * @typedef {z.infer<typeof codeSnapshotSchema>} CodeSnapshot
 * @typedef {z.infer<typeof codeSnapshotInsertSchema>} CodeSnapshotInsert
 * 
 * @typedef {z.infer<typeof consoleSchema>} Console
 * @typedef {z.infer<typeof consoleInsertSchema>} ConsoleInsert
 * 
 * @typedef {z.infer<typeof interactionSchema>} Interaction
 * @typedef {z.infer<typeof interactionInsertSchema>} InteractionInsert
 */

