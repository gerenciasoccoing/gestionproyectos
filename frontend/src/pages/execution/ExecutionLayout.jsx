import { NavLink, Outlet, useOutletContext } from 'react-router-dom';

const TABS = [
  { to: 'dashboard', label: 'Dashboard' },
  { to: 'minutes', label: 'Actas' },
  { to: 'milestones', label: 'Hitos' },
  { to: 'progress', label: 'Avance por ítem' },
  { to: 'purchase-orders', label: 'Órdenes de Compra' },
];

export default function ExecutionLayout() {
  const ctx = useOutletContext();
  return (
    <div>
      <nav className="flex gap-1 mb-3 overflow-x-auto whitespace-nowrap -mx-3 px-3 sm:mx-0 sm:px-0">
        {TABS.map((t) => (
          <NavLink
            key={t.to}
            to={t.to}
            className={({ isActive }) =>
              `shrink-0 px-3 py-1.5 text-sm rounded ${isActive ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'}`
            }
          >
            {t.label}
          </NavLink>
        ))}
      </nav>
      <Outlet context={ctx} />
    </div>
  );
}
