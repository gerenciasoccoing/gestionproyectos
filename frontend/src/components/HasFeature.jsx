import { useAuth } from '../context/AuthContext';

// Oculta su contenido si la empresa no tiene activado el módulo "plus" (ver Can.jsx, mismo patrón
// pero a nivel de empresa en vez de permiso de usuario — ver Company.enabledFeatures).
export default function HasFeature({ feature, children, fallback = null }) {
  const { hasFeature } = useAuth();
  if (!hasFeature(feature)) return fallback;
  return children;
}
