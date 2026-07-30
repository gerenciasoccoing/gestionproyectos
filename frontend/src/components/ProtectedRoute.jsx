import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function ProtectedRoute({ children, module, action }) {
  const { user, loading, can } = useAuth();

  if (loading) return <div className="p-8 text-center text-gray-500">Cargando...</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (module && action && !can(module, action)) {
    return (
      <div className="p-8 text-center text-red-600">
        No tiene permisos para ver esta sección.
      </div>
    );
  }
  return children;
}
