import { Link, Outlet, useNavigate } from 'react-router-dom';
import { useStaffAuth } from '../../context/StaffAuthContext';

export default function SuperAdminLayout() {
  const { staffUser, logout } = useStaffAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/super-admin/login');
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-gray-900 text-white">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <Link to="/super-admin" className="font-bold">Administración de la plataforma</Link>
          <div className="flex items-center gap-4 text-sm">
            <span className="text-gray-300">{staffUser?.email}</span>
            <button type="button" onClick={handleLogout} className="text-red-300">Cerrar sesión</button>
          </div>
        </div>
      </header>
      <main className="max-w-5xl mx-auto px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}
