import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { staffClient } from '../api/client';

const StaffAuthContext = createContext(null);

export function StaffAuthProvider({ children }) {
  const [staffUser, setStaffUser] = useState(() => {
    const raw = localStorage.getItem('staff_user');
    return raw ? JSON.parse(raw) : null;
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('staff_token');
    if (!token) { setLoading(false); return; }
    staffClient.get('/auth/me')
      .then((res) => {
        setStaffUser(res.data);
        localStorage.setItem('staff_user', JSON.stringify(res.data));
      })
      .catch(() => {
        localStorage.removeItem('staff_token');
        localStorage.removeItem('staff_user');
        setStaffUser(null);
      })
      .finally(() => setLoading(false));
  }, []);

  // endpoint: '/auth/login' para super-admin, '/tenant-auth/login' para admin/operador de tienda.
  const login = useCallback(async (endpoint, email, password) => {
    const res = await staffClient.post(endpoint, { email, password });
    localStorage.setItem('staff_token', res.data.token);
    localStorage.setItem('staff_user', JSON.stringify(res.data.user));
    setStaffUser(res.data.user);
    return res.data.user;
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem('staff_token');
    localStorage.removeItem('staff_user');
    setStaffUser(null);
  }, []);

  return (
    <StaffAuthContext.Provider value={{ staffUser, loading, login, logout }}>
      {children}
    </StaffAuthContext.Provider>
  );
}

export function useStaffAuth() {
  const ctx = useContext(StaffAuthContext);
  if (!ctx) throw new Error('useStaffAuth debe usarse dentro de StaffAuthProvider');
  return ctx;
}
