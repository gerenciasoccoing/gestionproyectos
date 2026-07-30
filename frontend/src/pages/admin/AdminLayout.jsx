import { NavLink, Outlet } from 'react-router-dom';

const TABS = [
  { to: 'users', label: 'Usuarios' },
  { to: 'roles', label: 'Roles y Permisos' },
  { to: 'labor-parameters', label: 'Parámetros Laborales' },
  { to: 'company', label: 'Datos de la Empresa' },
];

export default function AdminLayout() {
  return (
    <div>
      <h1 className="text-xl font-bold text-gray-900 mb-3">Administración</h1>
      <nav className="flex gap-1 mb-4">
        {TABS.map((t) => (
          <NavLink
            key={t.to}
            to={t.to}
            className={({ isActive }) =>
              `px-3 py-1.5 text-sm rounded ${isActive ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'}`
            }
          >
            {t.label}
          </NavLink>
        ))}
      </nav>
      <Outlet />
    </div>
  );
}
