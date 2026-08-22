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
  const { user, loading, login } = useAuth();
  const navigate = useNavigate();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (!loading && user) return <Navigate to={destinationFor(user)} replace />;

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const signedIn = await login(identifier.trim(), password);
      navigate(destinationFor(signedIn), { replace: true });
    } catch (err) {
      setError(err.message || 'Sign in failed');
      setSubmitting(false);
    }
  };

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
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="identifier" className="font-label-md mb-1 block text-on-surface-variant">
                Email or Login ID
              </label>
              <input
                id="identifier"
                type="text"
                autoComplete="username"
                required
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                placeholder="you@company.com or JODO20220001"
                className="font-body-lg w-full rounded-lg border border-outline-variant bg-surface px-4 py-3 text-on-surface focus:border-transparent focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            <div>
              <label htmlFor="password" className="font-label-md mb-1 block text-on-surface-variant">
                Password
              </label>
              <input
                id="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="font-body-lg w-full rounded-lg border border-outline-variant bg-surface px-4 py-3 text-on-surface focus:border-transparent focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            {error && <p className="font-body-md text-error">{error}</p>}
            <button
              type="submit"
              disabled={submitting}
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
