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
    `w-full rounded-xl border bg-surface/80 pl-11 pr-4 py-3 text-sm text-on-surface transition-all duration-200 placeholder:text-on-surface-variant/40 focus:border-primary focus:bg-white focus:outline-none focus:ring-4 focus:ring-primary/10 ${
      hasError ? 'border-error ring-1 ring-error/30' : 'border-outline-variant/60 hover:border-outline-variant'
    }`;

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background p-4 sm:p-6">
      {/* Ambient background glow elements using palette colors */}
      <div className="pointer-events-none absolute -top-40 -left-40 h-96 w-96 rounded-full bg-primary-fixed opacity-40 blur-3xl"></div>
      <div className="pointer-events-none absolute -bottom-40 -right-40 h-96 w-96 rounded-full bg-secondary-container opacity-50 blur-3xl"></div>
      <div className="pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-[500px] w-[500px] rounded-full bg-primary/5 blur-3xl"></div>

      <main className="relative z-10 w-full max-w-md">
        {/* Brand Header */}
        <div className="mb-8 text-center">
          <div className="mb-4 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-tr from-primary to-primary-container text-white shadow-lg shadow-primary/20 ring-4 ring-primary/10">
            <span className="material-symbols-outlined text-[28px]">badge</span>
          </div>
          <h1 className="font-headline-lg text-2xl sm:text-3xl font-bold tracking-tight text-primary">
            Dayflow HRMS
          </h1>
          <p className="mt-1 text-sm font-medium text-on-surface-variant">
            Sign in to your workspace
          </p>
        </div>

        {/* Main Glassmorphic Form Card */}
        <div className="rounded-3xl border border-white/80 bg-white/90 p-7 sm:p-9 shadow-card-elevated backdrop-blur-xl">
          {sessionExpired && (
            <div
              role="status"
              className="mb-5 flex items-center gap-3 rounded-xl border border-primary/20 bg-primary-fixed/60 p-3.5 text-xs font-semibold text-primary"
            >
              <span className="material-symbols-outlined text-primary text-[18px]">info</span>
              <span>Your session has expired. Please sign in again.</span>
            </div>
          )}

          <form onSubmit={handleSubmit} noValidate className="space-y-5">
            <div>
              <label htmlFor="identifier" className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-on-surface-variant">
                Email or Login ID
              </label>
              <div className="relative">
                <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-on-surface-variant/60">
                  <span className="material-symbols-outlined text-[20px]">person</span>
                </span>
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
              </div>
              {fieldErrors.identifier && (
                <p id="identifier-error" role="alert" className="mt-1.5 flex items-center gap-1 text-xs font-semibold text-error">
                  <span className="material-symbols-outlined text-[14px]">error</span>
                  <span>{fieldErrors.identifier}</span>
                </p>
              )}
            </div>

            <div>
              <label htmlFor="password" className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-on-surface-variant">
                Password
              </label>
              <div className="relative">
                <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-on-surface-variant/60">
                  <span className="material-symbols-outlined text-[20px]">lock</span>
                </span>
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
              </div>
              {fieldErrors.password && (
                <p id="password-error" role="alert" className="mt-1.5 flex items-center gap-1 text-xs font-semibold text-error">
                  <span className="material-symbols-outlined text-[14px]">error</span>
                  <span>{fieldErrors.password}</span>
                </p>
              )}
            </div>

            {formError && (
              <div role="alert" className="flex items-center gap-2.5 rounded-xl border border-error/20 bg-red-50 p-3.5 text-xs font-semibold text-error">
                <span className="material-symbols-outlined text-[18px]">warning</span>
                <span>{formError}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              aria-busy={submitting}
              aria-label="Sign in"
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-primary to-primary-container py-3.5 px-4 text-sm font-bold text-white shadow-md shadow-primary/20 transition-all duration-200 hover:shadow-lg hover:shadow-primary/30 hover:-translate-y-0.5 active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting ? (
                <>
                  <span aria-hidden="true" className="material-symbols-outlined animate-spin text-[20px]">progress_activity</span>
                  <span>Signing in…</span>
                </>
              ) : (
                <>
                  <span>Sign in</span>
                  <span aria-hidden="true" className="material-symbols-outlined text-[18px]">arrow_forward</span>
                </>
              )}
            </button>
          </form>
        </div>

        {/* 1-Click Interactive Demo Accounts */}
        <div className="mt-6 rounded-2xl border border-outline-variant/30 bg-white/70 p-4 shadow-xs backdrop-blur-md">
          <div className="mb-2.5 flex items-center justify-between">
            <p className="text-[11px] font-bold uppercase tracking-widest text-on-surface-variant/80">
              Demo Accounts (1-Click Auto-Fill)
            </p>
            <span className="text-[10px] text-on-surface-variant font-medium">Click to populate</span>
          </div>

          <div className="grid grid-cols-3 gap-2">
            {DEMO_ACCOUNTS.map((account) => {
              const isSelected = identifier === account.email;
              return (
                <button
                  key={account.email}
                  type="button"
                  onClick={() => {
                    setIdentifier(account.email);
                    setPassword(account.password);
                    setFieldErrors({});
                    setFormError('');
                  }}
                  className={`flex flex-col items-start rounded-xl border p-2.5 text-left transition-all duration-150 ${
                    isSelected
                      ? 'border-primary bg-primary/5 shadow-xs ring-1 ring-primary/20'
                      : 'border-outline-variant/30 bg-surface/50 hover:bg-white hover:border-outline-variant/70 hover:shadow-2xs'
                  }`}
                >
                  <div className="flex w-full items-center justify-between">
                    <span className="text-xs font-bold text-primary">{account.role}</span>
                    {isSelected && (
                      <span className="material-symbols-outlined text-[14px] text-primary">check_circle</span>
                    )}
                  </div>
                  <span className="mt-1 truncate w-full text-[10px] text-on-surface-variant/80">
                    {account.email.split('@')[0]}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </main>
    </div>
  );
}
