import { Navigate, useLocation } from 'react-router-dom';
import { useStaffAuth } from '../context/StaffAuthContext';

export default function ProtectedStaffRoute({ children, roles, loginPath }) {
  const { staffUser, loading } = useStaffAuth();
  const location = useLocation();

  if (loading) return <div className="flex h-screen items-center justify-center text-gray-500">Cargando…</div>;
  if (!staffUser || !roles.includes(staffUser.role)) {
    return <Navigate to={loginPath} replace state={{ from: location }} />;
  }
  return children;
}
