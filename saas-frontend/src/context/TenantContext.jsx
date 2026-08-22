import { createContext, useContext, useEffect, useState } from 'react';
import { storeClient } from '../api/client';

const TenantContext = createContext(null);

// Aplica el branding del tenant (logo, colores) como variables CSS globales apenas se resuelve
// la tienda, así toda la interfaz de la tienda pública se pinta con la marca del tenant sin
// tener que pasar props por cada componente.
export function TenantProvider({ children }) {
  const [tenant, setTenant] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    storeClient.get('/store/tenant')
      .then((res) => {
        setTenant(res.data);
        document.documentElement.style.setProperty('--color-primary', res.data.colorPrimary);
        document.documentElement.style.setProperty('--color-secondary', res.data.colorSecondary);
        document.title = res.data.name;
      })
      .catch((err) => setError(err.response?.data?.message || 'No se pudo cargar la tienda'))
      .finally(() => setLoading(false));
  }, []);

  return (
    <TenantContext.Provider value={{ tenant, loading, error }}>
      {children}
    </TenantContext.Provider>
  );
}

export function useTenant() {
  const ctx = useContext(TenantContext);
  if (!ctx) throw new Error('useTenant debe usarse dentro de TenantProvider');
  return ctx;
}
