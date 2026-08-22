import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client.js';
import { useAuth } from '../auth/AuthContext.jsx';
import FormField from '../components/FormField.jsx';

function clientPolicyErrors(password) {
  const errors = [];
  if (password.length < 8) errors.push('at least 8 characters');
  if (!/[a-z]/.test(password)) errors.push('a lowercase letter');
  if (!/[A-Z]/.test(password)) errors.push('an uppercase letter');
  if (!/\d/.test(password)) errors.push('a digit');
  return errors;
}

export default function ChangePassword() {
  const { user, isManager, mustChangePassword, refreshUser } = useAuth();
  const navigate = useNavigate();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [confirmError, setConfirmError] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const redirectTimer = useRef(null);

  useEffect(() => () => clearTimeout(redirectTimer.current), []);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    setConfirmError('');

    if (!currentPassword) {
      setError('Enter your current or temporary password.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setConfirmError('New passwords do not match');
      return;
    }
    const policy = clientPolicyErrors(newPassword);
    if (policy.length) {
      setError(`Password needs ${policy.join(', ')}`);
      return;
    }

    setSubmitting(true);
    try {
      await api('/api/auth/change-password', {
        method: 'POST',
        body: { current_password: currentPassword, new_password: newPassword },
      });
      await refreshUser();
      setSuccess(true);
      redirectTimer.current = setTimeout(
        () => navigate(isManager ? '/employees' : '/', { replace: true }),
        250
      );
    } catch (err) {
      setError(
        err.details?.map((d) => d.message).join('. ') || err.message || 'Could not change password'
      );
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <main className="w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="mb-4 flex justify-center">
            <span className="material-symbols-outlined text-5xl text-primary">lock_reset</span>
          </div>
          <h1 className="font-headline-lg mb-2 text-primary">Set a new password</h1>
          <p className="font-body-lg text-on-surface-variant">
            Signed in as <span className="font-semibold">{user?.login_id}</span> ({user?.email})
          </p>
        </div>

        {mustChangePassword && !success && (
          <div className="mb-4 rounded-xl border border-error/30 bg-error-container p-4 font-body-md text-on-error-container">
            Your account uses a temporary password. Choose a new one to continue.
          </div>
        )}

        {success && (
          <div
            role="status"
            className="mb-4 rounded-xl border border-primary/20 bg-primary-fixed p-4 font-body-md text-on-primary-fixed-variant"
          >
            Password updated. Redirecting…
          </div>
        )}

        <div className="rounded-[24px] bg-secondary-container p-8 shadow-sm">
          <form onSubmit={handleSubmit} noValidate className="space-y-4">
            <FormField label="Current or temporary password">
              <input
                type="password"
                autoComplete="current-password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className="input"
              />
            </FormField>
            <FormField label="New password">
              <input
                type="password"
                required
                autoComplete="new-password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="input"
              />
            </FormField>
            <FormField label="Confirm new password" error={confirmError}>
              <input
                type="password"
                autoComplete="new-password"
                aria-invalid={Boolean(confirmError)}
                value={confirmPassword}
                onChange={(e) => {
                  setConfirmPassword(e.target.value);
                  setConfirmError('');
                }}
                className="input"
              />
            </FormField>
            <p className="text-xs text-on-surface-variant">
              Minimum 8 characters with an uppercase letter, a lowercase letter and a digit.
            </p>
            {error && (
              <p role="alert" className="font-body-md text-error">
                {error}
              </p>
            )}
            <button
              type="submit"
              disabled={submitting || success}
              aria-busy={submitting}
              className="font-headline-md w-full rounded-lg bg-primary py-3 px-4 text-on-primary transition-colors duration-200 hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {success ? 'Saved' : submitting ? 'Saving…' : 'Save password'}
            </button>
          </form>
        </div>
      </main>
    </div>
  );
}
