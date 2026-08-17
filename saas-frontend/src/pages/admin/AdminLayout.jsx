import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useStaffAuth } from '../../context/StaffAuthContext';

const NAV_ITEMS = [
  { to: '/admin', label: 'Panel', end: true },
  { to: '/admin/productos', label: 'Productos' },
  { to: '/admin/categorias', label: 'Categorías' },
  { to: '/admin/inventario', label: 'Inventario' },
  { to: '/admin/pedidos', label: 'Pedidos' },
  { to: '/admin/configuracion', label: 'Configuración', adminOnly: true },
];

export default function AdminLayout() {
  const { staffUser, logout } = useStaffAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/admin/login');
  };

  return (
    <div className="min-h-screen flex">
      <aside className="w-56 bg-white border-r flex flex-col">
        <div className="p-4 font-bold text-gray-900 border-b">Panel de tienda</div>
        <nav className="flex-1 p-2 space-y-1">
          {NAV_ITEMS.filter((item) => !item.adminOnly || staffUser?.role === 'tenant_admin').map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) => `block px-3 py-2 rounded-lg text-sm font-medium ${isActive ? 'bg-indigo-50 text-indigo-700' : 'text-gray-600 hover:bg-gray-50'}`}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="p-3 border-t text-sm">
          <p className="text-gray-500 truncate">{staffUser?.email}</p>
          <button type="button" onClick={handleLogout} className="text-red-500 mt-1">Cerrar sesión</button>
        </div>
      </aside>
      <main className="flex-1 p-6 bg-gray-50">
        <Outlet />
      </main>
    </div>
  );
}
