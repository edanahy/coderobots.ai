import tuftsBrand from '../brands/tufts';

/**
 * Tufts EN1 instance — first "sub-brand" built on the generic tufts.js
 * brand. Copy this file's pattern for future Tufts course/program instances
 * (e.g. tufts-<other-class>.js): import the shared tuftsBrand and override
 * just the fields that differ, the same way instances/skolegpt-dk.js
 * overrides the shared brand.js.
 *
 * Settings below default to mirroring purdue.js (telemetry on, direct chat,
 * same serial platform set) since this starts as the same research tool
 * under a different brand — tune platforms/chat.mode/locales once EN1's
 * actual classroom needs (which hardware, whether to collect data, whether
 * instructors need /data /usage /view-data) are known.
 */
const config = {
  id: 'tufts-en1',
  brand: {
    ...tuftsBrand,
    name: 'Tufts EN1 (CodeRobots)',
  },

  // telemetry: true ⇒ Supabase persistence + required auth.
  // telemetry: false ⇒ localStorage persistence, anonymous, no budget UI,
  // no admin routes.
  telemetry: true,

  // Which registered platforms (src/platforms/index.js) users can pick.
  platforms: ['spike'],

  chat: {
    // 'direct': client-side priming, model picker, chat_with_budget endpoint.
    // 'tutor': server-side prompts via the tutor pipeline endpoint.
    mode: 'direct',
    showBudgetUI: true,
  },

  locales: {
    available: ['en'],
    default: 'en',
  },

  routes: {
    // Enables /data, /usage, /view-data.
    admin: true,
  },
};

export default config;
