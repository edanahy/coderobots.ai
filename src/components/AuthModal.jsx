/**
 * Authentication Modal Component
 * Displays sign-in/sign-up UI: Google (primary, when instance.auth.google
 * is enabled) with email/password as a fallback, or email/password only.
 */

import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import instance from '../config/instance';
import googleLogo from '../assets/google-logo.svg';
import './ModalBase.css';
import './AuthModal.css';

const googleEnabled = Boolean(instance.auth?.google);
// Defaults to true (i.e. showing email/password) so existing instances that
// don't set this keep today's behavior with no migration needed.
const emailPasswordEnabled = instance.auth?.emailPassword !== false;

const AuthModal = ({ visible }) => {
  const { signInWithPassword, signUpWithPassword, signInWithGoogle, authError } =
    useAuth();
  const { t } = useLanguage();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const [showEmailForm, setShowEmailForm] = useState(
    !googleEnabled && emailPasswordEnabled
  );

  if (!visible) return null;

  const handlePasswordAuth = async (e) => {
    e.preventDefault();
    try {
      if (isSignUp) {
        await signUpWithPassword(email, password);
      } else {
        await signInWithPassword(email, password);
      }
    } catch (error) {
      // Error is handled by AuthContext
      console.error('Password auth error:', error);
    }
  };

  const handleGoogleAuth = async () => {
    try {
      await signInWithGoogle();
    } catch (error) {
      // Error is handled by AuthContext
      console.error('Google auth error:', error);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content auth-modal">
        <h2>{t('authWelcome')}</h2>
        <p>{t('authSignInPrompt')}</p>

        {instance.auth?.emailDomain && (
          <p className="auth-domain-hint">
            {t('authOnlyDomainAllowed')} @{instance.auth.emailDomain}
          </p>
        )}

        {authError && (
          <div className="auth-error">
            {authError}
          </div>
        )}

        {googleEnabled && (
          <button
            type="button"
            onClick={handleGoogleAuth}
            className="auth-button google-button"
          >
            <img src={googleLogo} alt="" />
            {t('authContinueWithGoogle')}
          </button>
        )}

        {googleEnabled && emailPasswordEnabled && !showEmailForm && (
          <button
            type="button"
            onClick={() => setShowEmailForm(true)}
            className="auth-toggle-button"
          >
            {t('authSignInEmailInstead')}
          </button>
        )}

        {emailPasswordEnabled && showEmailForm && (
          <>
            {googleEnabled && (
              <div className="auth-divider">
                <span>{t('authOr')}</span>
              </div>
            )}

            <form onSubmit={handlePasswordAuth} className="auth-form">
              <input
                type="email"
                placeholder={t('email')}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="auth-input"
              />
              <input
                type="password"
                placeholder={t('password')}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="auth-input"
              />
              <button type="submit" className="auth-button password-button">
                {isSignUp ? t('signUp') : t('signIn')}
              </button>
            </form>

            <button
              type="button"
              onClick={() => setIsSignUp(!isSignUp)}
              className="auth-toggle-button"
            >
              {isSignUp ? t('authHaveAccount') : t('authNeedAccount')}
            </button>
          </>
        )}
      </div>
    </div>
  );
};

export default AuthModal;
