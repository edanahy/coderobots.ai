/**
 * Remembers recent AI chat responses so a paste into the code editor can be
 * attributed to the AI (`paste_ai_code`) or not (`paste_code`) — whether the
 * student used a code block's Copy button or selected the text by hand.
 * In-memory only; nothing here is logged or persisted.
 */

const MAX_TEXTS = 300;
// Shorter pastes (a name, a number) match AI text by coincidence too often.
const MIN_MATCH_CHARS = 12;

const texts = new Set();

const normalize = (text) => String(text || '').replace(/\s+/g, ' ').trim();

/** Register a completed AI response (idempotent). */
export function rememberAiText(content) {
  const normalized = normalize(content);
  if (!normalized || texts.has(normalized)) return;
  texts.add(normalized);
  if (texts.size > MAX_TEXTS) texts.delete(texts.values().next().value);
}

/** True when `text` appears (whitespace-insensitively) in a remembered AI response. */
export function isFromAi(text) {
  const normalized = normalize(text);
  if (normalized.replace(/ /g, '').length < MIN_MATCH_CHARS) return false;
  for (const aiText of texts) {
    if (aiText.includes(normalized)) return true;
  }
  return false;
}
