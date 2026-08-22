import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api/client.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [sessionExpired, setSessionExpired] = useState(false);
  const signedInRef = useRef(false);
  signedInRef.current = Boolean(user);

  // Restore the session from the httpOnly cookie on load (handles page refresh).
  useEffect(() => {
    let cancelled = false;
    api('/api/auth/me')
      .then((res) => !cancelled && setUser(res.data))
      .catch(() => !cancelled && setUser(null))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, []);

  // Any API call answered with 401 while signed in means the session was
  // expired or revoked server-side: drop the local user so route guards send
  // the user back to sign-in. Ignored when anonymous (e.g. a failed login
  // attempt also returns 401 but must not look like an expiry).
  useEffect(() => {
    const handleSessionExpired = () => {
      if (!signedInRef.current) return;
      setUser(null);
      setSessionExpired(true);
    };
    window.addEventListener('auth:session-expired', handleSessionExpired);
    return () => window.removeEventListener('auth:session-expired', handleSessionExpired);
  }, []);

  const value = useMemo(
    () => ({
      user,
      loading,
      sessionExpired,
      isAdmin: user?.role === 'admin' || user?.role === 'hr',
      isManager: user?.role === 'admin' || user?.role === 'hr',
      mustChangePassword: Boolean(user?.must_change_password),
      async refreshUser() {
        const res = await api('/api/auth/me');
        setUser(res.data);
        return res.data;
      },
      async login(identifier, password) {
        const res = await api('/api/auth/login', { method: 'POST', body: { identifier, password } });
        setUser(res.data);
        setSessionExpired(false);
        return res.data;
      },
      async logout() {
        try {
          await api('/api/auth/logout', { method: 'POST' });
        } finally {
          setUser(null);
          setSessionExpired(false);
        }
      },
    }),
    [user, loading, sessionExpired]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
