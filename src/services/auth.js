/**
 * Authentication Service
 * Handles email/password authentication and session management
 */

import { supabase } from './supabase';
import instance from '../config/instance';

const CAMPS_EMAIL_DOMAINS = ['tufts.edu', 'purdue.edu'];

/**
 * Check if user is admin for UI gating.
 * Source of truth is JWT/app metadata role used by RLS policies.
 */
export const isAdmin = (userOrEmail) => {
  if (!userOrEmail) return false;

  if (typeof userOrEmail === 'object') {
    const role = userOrEmail.app_metadata?.role;
    if (role === 'admin') {
      return true;
    }
  }
};

/**
 * Determine access level based on email domain
 * @param {string} email - User's email address
 * @returns {string} - 'camps' or 'standard'
 */
export const getAccessLevelFromEmail = (email) => {
  if (!email) return 'standard';

  const lowerEmail = email.toLowerCase();

  for (const domain of CAMPS_EMAIL_DOMAINS) {
    if (lowerEmail.endsWith(`@${domain.toLowerCase()}`)) {
      return 'camps';
    }
  }

  return 'standard';
};

/**
 * Sign in with email and password
 */
export const signInWithPassword = async (email, password) => {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    console.error('Password sign-in error:', error);
    throw error;
  }

  return data;
};

/**
 * Sign up with email and password
 */
export const signUpWithPassword = async (email, password) => {
  const accessLevel = getAccessLevelFromEmail(email);

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        access_level: accessLevel,
      },
    },
  });

  if (error) {
    console.error('Password sign-up error:', error);
    throw error;
  }

  return data;
};

/**
 * Sign in with Google via Supabase OAuth. Redirects the browser to Google's
 * consent screen; the resulting session is picked up afterward through
 * onAuthStateChange, same as password auth.
 */
export const signInWithGoogle = async () => {
  const emailDomain = instance.auth?.emailDomain;

  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: window.location.origin,
      queryParams: {
        // Without this, Google silently reuses whatever Google session is
        // already active in the browser and skips the account picker once
        // consent has been granted once — a real problem on a shared/lab
        // machine where the previous student's Google session could
        // otherwise carry over unnoticed.
        prompt: 'select_account',
        // Pre-filters the account chooser toward this Workspace domain.
        // UX hint only — not a security boundary, see violatesRequiredDomain.
        ...(emailDomain && { hd: emailDomain }),
      },
    },
  });

  if (error) {
    console.error('Google sign-in error:', error);
    throw error;
  }
};

/**
 * Whether a signed-in user falls outside this instance's required email
 * domain (if `instance.auth.emailDomain` is configured). Applies regardless
 * of auth method, since Google's `hd` hint above isn't Google-enforced for
 * an External consent screen — this is the real gate.
 */
export const violatesRequiredDomain = (user) => {
  const requiredDomain = instance.auth?.emailDomain;
  if (!requiredDomain || !user?.email) return false;

  return !user.email.toLowerCase().endsWith(`@${requiredDomain.toLowerCase()}`);
};

/**
 * Sign out current user
 */
export const signOut = async () => {
  const { error } = await supabase.auth.signOut();
  if (error) {
    console.error('Sign out error:', error);
    throw error;
  }
};

/**
 * Get current session
 */
export const getSession = async () => {
  const { data, error } = await supabase.auth.getSession();
  if (error) {
    console.error('Get session error:', error);
    throw error;
  }
  return data.session;
};

/**
 * Get current user
 */
export const getUser = async () => {
  const { data, error } = await supabase.auth.getUser();
  if (error) {
    console.error('Get user error:', error);
    throw error;
  }
  return data.user;
};

/**
 * Listen for auth state changes
 */
export const onAuthStateChange = (callback) => {
  return supabase.auth.onAuthStateChange(callback);
};

/**
 * Check and set access level for users that signed up before access_level was tracked.
 * @param {Object} user - Optional user object (if already available from session)
 */
export const ensureAccessLevel = async (user = null) => {
  try {
    if (!user) {
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('getUser timeout')), 5000)
      );

      const getUserPromise = supabase.auth.getUser();

      const result = await Promise.race([getUserPromise, timeoutPromise]);
      user = result.data?.user;
    }

    if (!user) {
      return;
    }

    if (user.user_metadata?.access_level) {
      return;
    }

    const accessLevel = getAccessLevelFromEmail(user.email);

    console.log('Setting access level to:', accessLevel);

    const { error } = await supabase.auth.updateUser({
      data: {
        access_level: accessLevel,
      },
    });

    if (error) {
      console.error('Error setting access level:', error);
    } else {
      console.log(`Access level set to '${accessLevel}' for ${user.email}`);
    }
  } catch (error) {
    console.error('Error in ensureAccessLevel:', error);
    // Don't throw - we don't want to block auth flow
  }
};
