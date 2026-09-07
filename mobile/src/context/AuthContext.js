import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { authApi } from '../api';
import { setOnSessionExpired } from '../api/client';

const AuthContext = createContext(null);

// Misma lógica que frontend/src/context/AuthContext.jsx: al abrir la app con un token guardado,
// se refresca contra /auth/me (roles/permisos/proyectos pueden haber cambiado desde el último
// login) en vez de confiar ciegamente en lo guardado; isAdmin se deriva de roles.includes('admin'),
// igual que la web — nunca de un campo aparte.
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const clearSession = useCallback(async () => {
    await AsyncStorage.multiRemove(['token', 'user']);
    setUser(null);
  }, []);

  useEffect(() => {
    setOnSessionExpired(() => setUser(null));
  }, []);

  useEffect(() => {
    (async () => {
      const token = await AsyncStorage.getItem('token');
      if (!token) {
        setLoading(false);
        return;
      }
      try {
        const me = await authApi.me();
        await AsyncStorage.setItem('user', JSON.stringify(me));
        setUser(me);
      } catch {
        await clearSession();
      } finally {
        setLoading(false);
      }
    })();
  }, [clearSession]);

  const login = useCallback(async (email, password) => {
    const { token, user: u } = await authApi.login(email, password);
    await AsyncStorage.setItem('token', token);
    // El login no trae isAdmin/projectIds (ver backend/authController.js) — se completan con /me
    // antes de guardar la sesión, para que "can()" funcione desde el primer momento.
    const me = await authApi.me();
    await AsyncStorage.setItem('user', JSON.stringify(me));
    setUser(me);
    return me;
  }, []);

  const logout = useCallback(() => clearSession(), [clearSession]);

  const isAdmin = Boolean(user?.roles?.includes('admin'));

  const can = useCallback((moduleName, action) => {
    if (!user) return false;
    if (isAdmin) return true;
    return Boolean(user.permissions?.includes(`${moduleName}:${action}`));
  }, [user, isAdmin]);

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, can, isAdmin }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
