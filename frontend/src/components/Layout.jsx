import { Link, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Can from './Can';
import Logo from './Logo';

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="min-h-screen flex flex-col">
      <header className="bg-gray-900 text-white px-4 py-2.5 flex items-center justify-between border-b border-gray-800">
        <div className="flex items-center gap-6">
          <Link to="/" className="hover:opacity-90 transition-opacity">
            <Logo size={32} dark />
          </Link>
          <nav className="flex items-center gap-1 border-l border-gray-700 pl-6">
            <Link to="/" className="text-sm text-gray-300 hover:text-white hover:bg-white/5 px-3 py-1.5 rounded-md transition-colors">Proyectos</Link>
            <Link to="/quotations" className="text-sm text-gray-300 hover:text-white hover:bg-white/5 px-3 py-1.5 rounded-md transition-colors">Cotizaciones</Link>
            <Link to="/price-book" className="text-sm text-gray-300 hover:text-white hover:bg-white/5 px-3 py-1.5 rounded-md transition-colors">Base de Precios</Link>
            <Link to="/apus" className="text-sm text-gray-300 hover:text-white hover:bg-white/5 px-3 py-1.5 rounded-md transition-colors">APU</Link>
            <Can module="admin" action="view">
              <Link to="/admin" className="text-sm text-gray-300 hover:text-white hover:bg-white/5 px-3 py-1.5 rounded-md transition-colors">Administración</Link>
            </Can>
          </nav>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <span className="text-gray-300">{user?.name} <span className="text-gray-500">({user?.roles?.join(', ')})</span></span>
          <button
            onClick={() => { logout(); navigate('/login'); }}
            className="bg-gray-800 hover:bg-gray-700 px-3 py-1.5 rounded-md transition-colors"
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
