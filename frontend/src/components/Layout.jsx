import { useState } from 'react';
import { Link, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Can from './Can';
import Logo from './Logo';

const NAV_LINKS = [
  { to: '/', label: 'Proyectos' },
  { to: '/quotations', label: 'Cotizaciones' },
  { to: '/price-book', label: 'Base de Precios' },
  { to: '/apus', label: 'APU' },
];

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);

  const handleLogout = () => { logout(); navigate('/login'); };

  return (
    <div className="min-h-screen flex flex-col">
      <header className="bg-gray-900 text-white px-4 py-2.5 border-b border-gray-800">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-6 min-w-0">
            <Link to="/" className="hover:opacity-90 transition-opacity shrink-0" onClick={() => setMenuOpen(false)}>
              <Logo size={32} dark />
            </Link>
            <nav className="hidden md:flex items-center gap-1 border-l border-gray-700 pl-6">
              {NAV_LINKS.map((l) => (
                <Link key={l.to} to={l.to} className="text-sm text-gray-300 hover:text-white hover:bg-white/5 px-3 py-1.5 rounded-md transition-colors">
                  {l.label}
                </Link>
              ))}
              <Can module="admin" action="view">
                <Link to="/admin" className="text-sm text-gray-300 hover:text-white hover:bg-white/5 px-3 py-1.5 rounded-md transition-colors">Administración</Link>
              </Can>
            </nav>
          </div>

          <div className="hidden md:flex items-center gap-3 text-sm shrink-0">
            <span className="text-gray-300 truncate max-w-[220px]">{user?.name} <span className="text-gray-500">({user?.roles?.join(', ')})</span></span>
            <button onClick={handleLogout} className="bg-gray-800 hover:bg-gray-700 px-3 py-1.5 rounded-md transition-colors">
              Cerrar sesión
            </button>
          </div>

          <button
            className="md:hidden p-2 -mr-2 text-gray-300 hover:text-white"
            onClick={() => setMenuOpen((o) => !o)}
            aria-label="Abrir menú"
          >
            {menuOpen ? (
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" /></svg>
            ) : (
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 6h16M4 12h16M4 18h16" strokeLinecap="round" /></svg>
            )}
          </button>
        </div>

        {menuOpen && (
          <nav className="md:hidden mt-3 pb-1 flex flex-col gap-1 border-t border-gray-800 pt-3">
            {NAV_LINKS.map((l) => (
              <Link key={l.to} to={l.to} onClick={() => setMenuOpen(false)} className="text-sm text-gray-300 hover:text-white hover:bg-white/5 px-3 py-2 rounded-md transition-colors">
                {l.label}
              </Link>
            ))}
            <Can module="admin" action="view">
              <Link to="/admin" onClick={() => setMenuOpen(false)} className="text-sm text-gray-300 hover:text-white hover:bg-white/5 px-3 py-2 rounded-md transition-colors">
                Administración
              </Link>
            </Can>
            <div className="flex items-center justify-between px-3 pt-2 mt-1 border-t border-gray-800 text-sm">
              <span className="text-gray-400 truncate">{user?.name} ({user?.roles?.join(', ')})</span>
              <button onClick={handleLogout} className="bg-gray-800 hover:bg-gray-700 px-3 py-1.5 rounded-md shrink-0 ml-2">
                Salir
              </button>
            </div>
          </nav>
        )}
      </header>
      <main className="flex-1 bg-gray-100 p-3 sm:p-4 overflow-x-hidden">
        <Outlet />
      </main>
    </div>
  );
}
