import { Link, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Can from './Can';

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="min-h-screen flex flex-col">
      <header className="bg-gray-900 text-white px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <Link to="/" className="font-semibold">Gestión de Proyectos</Link>
          <Link to="/" className="text-sm text-gray-300 hover:text-white">Proyectos</Link>
          <Link to="/quotations" className="text-sm text-gray-300 hover:text-white">Cotizaciones</Link>
          <Link to="/price-book" className="text-sm text-gray-300 hover:text-white">Base de Precios</Link>
          <Link to="/apus" className="text-sm text-gray-300 hover:text-white">APU</Link>
          <Can module="admin" action="view">
            <Link to="/admin" className="text-sm text-gray-300 hover:text-white">Administración</Link>
          </Can>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <span className="text-gray-300">{user?.name} ({user?.roles?.join(', ')})</span>
          <button
            onClick={() => { logout(); navigate('/login'); }}
            className="bg-gray-700 hover:bg-gray-600 px-3 py-1 rounded"
          >
            Cerrar sesión
          </button>
        </div>
      </header>
      <main className="flex-1 bg-gray-100 p-4">
        <Outlet />
      </main>
    </div>
  );
}
