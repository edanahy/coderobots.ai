/**
 * Authentication Context
 * Provides authentication state and functions globally.
 *
 * Instances with telemetry use Supabase email/password auth; no-telemetry
 * instances run fully anonymous — a static local user, no login, no
 * Supabase calls.
 */

import { createContext, useContext, useState, useEffect } from 'react';
import {
  signInWithPassword,
  signUpWithPassword,
  signInWithGoogle,
  signOut,
  getSession,
  onAuthStateChange,
  isAdmin as checkIsAdmin,
  ensureAccessLevel,
  violatesRequiredDomain,
} from '../services/auth';
import instance from '../config/instance';

const AuthContext = createContext();

const ANONYMOUS_USER = {
  id: 'local',
  email: null,
  user_metadata: { access_level: 'anonymous' },
  app_metadata: {},
};

const ANONYMOUS_AUTH_VALUE = {
  user: ANONYMOUS_USER,
  session: null,
  loading: false,
  isAdmin: false,
  authError: null,
  signInWithPassword: async () => {},
  signUpWithPassword: async () => {},
  signInWithGoogle: async () => {},
  signOut: async () => {},
};

const AnonymousAuthProvider = ({ children }) => (
  <AuthContext.Provider value={ANONYMOUS_AUTH_VALUE}>
    {children}
  </AuthContext.Provider>
);

const SupabaseAuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [authError, setAuthError] = useState(null);

  useEffect(() => {
    // Check active session on mount
    getSession().then(async (session) => {
      if (session?.user) {
        if (violatesRequiredDomain(session.user)) {
          await signOut();
          setAuthError(`Please sign in with a @${instance.auth.emailDomain} account.`);
          setLoading(false);
          return;
        }

        await ensureAccessLevel(session.user);

        setSession(session);
        setUser(session.user);
        setIsAdmin(checkIsAdmin(session.user));
        setAuthError(null);
      }
      setLoading(false);
    });

    // Listen for auth changes
    const { data: authListener } = onAuthStateChange(async (event, session) => {
      if (session?.user) {
        if (violatesRequiredDomain(session.user)) {
          await signOut();
          setSession(null);
          setUser(null);
          setIsAdmin(false);
          setAuthError(`Please sign in with a @${instance.auth.emailDomain} account.`);
          setLoading(false);
          return;
        }

        await ensureAccessLevel(session.user);

        setSession(session);
        setUser(session.user);
        setIsAdmin(checkIsAdmin(session.user));
        setAuthError(null);
      } else {
        setSession(null);
        setUser(null);
        setIsAdmin(false);
      }
      setLoading(false);
    });

    return () => {
      authListener?.subscription?.unsubscribe();
    };
  }, []);

  // Refresh session on window focus
  useEffect(() => {
    const handleFocus = async () => {
      console.log('Window focused, refreshing session...');
      const currentSession = await getSession();
      if (currentSession) {
        setSession(currentSession);
        setUser(currentSession.user);
      }
    };

    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, []);

  const handlePasswordSignIn = async (email, password) => {
    try {
      setAuthError(null);
      await signInWithPassword(email, password);
    } catch (error) {
      setAuthError(error.message);
      console.error('Password sign-in error:', error);
      throw error;
    }
  };

  const handlePasswordSignUp = async (email, password) => {
    try {
      setAuthError(null);
      await signUpWithPassword(email, password);
    } catch (error) {
      setAuthError(error.message);
      console.error('Password sign-up error:', error);
      throw error;
    }
  };

  const handleGoogleSignIn = async () => {
    try {
      setAuthError(null);
      await signInWithGoogle();
    } catch (error) {
      setAuthError(error.message);
      console.error('Google sign-in error:', error);
      throw error;
    }
  };

  const handleSignOut = async () => {
    try {
      await signOut();
      setUser(null);
      setSession(null);
      setIsAdmin(false);
      setAuthError(null);
    } catch (error) {
      console.error('Sign out error:', error);
    }
  };

  const value = {
    user,
    session,
    loading,
    isAdmin,
    authError,
    signInWithPassword: handlePasswordSignIn,
    signUpWithPassword: handlePasswordSignUp,
    signInWithGoogle: handleGoogleSignIn,
    signOut: handleSignOut,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const AuthProvider = instance.telemetry
  ? SupabaseAuthProvider
  : AnonymousAuthProvider;

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
