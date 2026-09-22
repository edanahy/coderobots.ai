import brand from '../brand';

/**
 * Purdue research-tool instance: Supabase auth + full data collection,
 * budget-enforced multi-provider chat, all serial platforms.
 */
const config = {
  id: 'purdue',
  brand,

  // telemetry: true ⇒ Supabase persistence + required auth.
  // telemetry: false ⇒ localStorage persistence, anonymous, no budget UI,
  // no admin routes.
  telemetry: true,

  auth: {
    // Google sign-in is available but not enabled for this instance yet;
    // flip to true once Google is configured on this Supabase project.
    google: false,
  },

  // Which registered platforms (src/platforms/index.js) users can pick.
  platforms: ['lilybot', 'microbit', 'cutebot', 'esp32'],

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
