import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { authApi } from '../api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    const raw = localStorage.getItem('user');
    return raw ? JSON.parse(raw) : null;
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) {
      setLoading(false);
      return;
    }
    authApi.me()
      .then((me) => {
        const nextUser = { ...me, permissions: me.permissions };
        setUser(nextUser);
        localStorage.setItem('user', JSON.stringify(nextUser));
      })
      .catch(() => {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        setUser(null);
      })
      .finally(() => setLoading(false));
  }, []);

  const login = useCallback(async (email, password) => {
    const { token, user: u } = await authApi.login(email, password);
    localStorage.setItem('token', token);
    localStorage.setItem('user', JSON.stringify(u));
    setUser(u);
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setUser(null);
  }, []);

  const isAdmin = user?.roles?.includes('admin');

  const can = useCallback((moduleName, action) => {
    if (!user) return false;
    if (isAdmin) return true;
    return user.permissions?.includes(`${moduleName}:${action}`);
  }, [user, isAdmin]);

  // Módulo "plus" activado para la empresa (ver Company.enabledFeatures) — a diferencia de can(),
  // esto NO se salta ni siendo admin: es un interruptor de producto que solo controla el
  // super-administrador de la plataforma (ver HasFeature.jsx).
  const hasFeature = useCallback((featureKey) => {
    if (!user) return false;
    return Boolean(user.enabledFeatures?.includes(featureKey));
  }, [user]);

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, can, isAdmin, hasFeature }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
