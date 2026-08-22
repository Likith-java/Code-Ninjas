import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';

const DEMO_ACCOUNTS = [
  { role: 'Admin', email: 'admin@dayflow.com', password: 'Admin@123' },
  { role: 'HR', email: 'hr@dayflow.com', password: 'Hr@123456' },
  { role: 'Employee', email: 'employee@dayflow.com', password: 'Employee@123' },
];

function destinationFor(user) {
  if (user.must_change_password) return '/change-password';
  if (user.role === 'admin' || user.role === 'hr') return '/employees';
  return '/';
}

export default function Login() {
  const { user, loading, sessionExpired, login } = useAuth();
  const navigate = useNavigate();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (!loading && user) return <Navigate to={destinationFor(user)} replace />;

  const handleSubmit = async (event) => {
    event.preventDefault();
    setFormError('');

    const errors = {};
    if (!identifier.trim()) errors.identifier = 'Enter your email or login ID';
    if (!password) errors.password = 'Enter your password';
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setSubmitting(true);
    try {
      const signedIn = await login(identifier.trim(), password);
      navigate(destinationFor(signedIn), { replace: true });
    } catch (err) {
      setFormError(
        err.status === 401 ? 'Invalid email or password' : err.message || 'Sign in failed'
      );
      setSubmitting(false);
    }
  };

  const inputClass = (hasError) =>
    `font-body-lg w-full rounded-lg border bg-surface px-4 py-3 text-on-surface focus:border-transparent focus:outline-none focus:ring-2 focus:ring-primary ${
      hasError ? 'border-error' : 'border-outline-variant'
    }`;

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <main className="w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="mb-4 flex justify-center">
            <span className="material-symbols-outlined text-5xl text-primary">badge</span>
          </div>
          <h1 className="font-headline-lg mb-2 text-primary">Dayflow HRMS</h1>
          <p className="font-body-lg text-on-surface-variant">Sign in to your workspace</p>
        </div>

        <div className="rounded-[24px] bg-secondary-container p-8 shadow-sm">
          {sessionExpired && (
            <div
              role="status"
              className="mb-4 rounded-xl border border-primary/20 bg-primary-fixed p-4 font-body-md text-on-primary-fixed-variant"
            >
              Your session has expired. Please sign in again.
            </div>
          )}

          <form onSubmit={handleSubmit} noValidate className="space-y-4">
            <div>
              <label htmlFor="identifier" className="font-label-md mb-1 block text-on-surface-variant">
                Email or Login ID
              </label>
              <input
                id="identifier"
                name="identifier"
                type="text"
                autoComplete="username"
                value={identifier}
                onChange={(e) => {
                  setIdentifier(e.target.value);
                  setFieldErrors((prev) => ({ ...prev, identifier: undefined }));
                }}
                placeholder="you@company.com or JODO20220001"
                aria-invalid={Boolean(fieldErrors.identifier)}
                aria-describedby={fieldErrors.identifier ? 'identifier-error' : undefined}
                className={inputClass(Boolean(fieldErrors.identifier))}
              />
              {fieldErrors.identifier && (
                <p id="identifier-error" role="alert" className="font-body-md mt-1 text-error">
                  {fieldErrors.identifier}
                </p>
              )}
            </div>

            <div>
              <label htmlFor="password" className="font-label-md mb-1 block text-on-surface-variant">
                Password
              </label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setFieldErrors((prev) => ({ ...prev, password: undefined }));
                }}
                placeholder="••••••••"
                aria-invalid={Boolean(fieldErrors.password)}
                aria-describedby={fieldErrors.password ? 'password-error' : undefined}
                className={inputClass(Boolean(fieldErrors.password))}
              />
              {fieldErrors.password && (
                <p id="password-error" role="alert" className="font-body-md mt-1 text-error">
                  {fieldErrors.password}
                </p>
              )}
            </div>

            {formError && (
              <p role="alert" className="font-body-md text-error">
                {formError}
              </p>
            )}

            <button
              type="submit"
              disabled={submitting}
              aria-busy={submitting}
              className="font-headline-md w-full rounded-lg bg-primary py-3 px-4 text-on-primary transition-colors duration-200 hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting ? 'Signing in…' : 'Sign in'}
            </button>
          </form>
        </div>

        <div className="mt-6 rounded-xl border border-outline-variant/40 bg-surface-container-low p-4">
          <p className="font-label-md mb-2 uppercase tracking-wider text-on-surface-variant">
            Demo accounts
          </p>
          <ul className="font-body-md space-y-1 text-on-surface">
            {DEMO_ACCOUNTS.map((account) => (
              <li key={account.email}>
                <button
                  type="button"
                  onClick={() => {
                    setIdentifier(account.email);
                    setPassword(account.password);
                    setFieldErrors({});
                  }}
                  className="text-left hover:text-primary hover:underline"
                >
                  <span className="font-semibold">{account.role}</span> — {account.email} /{' '}
                  {account.password}
                </button>
              </li>
            ))}
          </ul>
        </div>
      </main>
    </div>
  );
}
