import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { api } from '../api/client.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

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

  const value = useMemo(
    () => ({
      user,
      loading,
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
        return res.data;
      },
      async logout() {
        try {
          await api('/api/auth/logout', { method: 'POST' });
        } finally {
          setUser(null);
        }
      },
    }),
    [user, loading]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
