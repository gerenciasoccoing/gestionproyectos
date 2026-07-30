import { useAuth } from '../context/AuthContext';

// Oculta su contenido si el usuario no tiene el permiso "modulo:accion" (control de acceso en la UI).
export default function Can({ module, action, children, fallback = null }) {
  const { can } = useAuth();
  if (!can(module, action)) return fallback;
  return children;
}
