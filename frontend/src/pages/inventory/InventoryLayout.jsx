import { NavLink, Outlet } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

export default function InventoryLayout() {
  const { t } = useTranslation();
  const TABS = [
    { to: 'catalog', label: t('inventory.tabs.catalog') },
    { to: 'checkouts', label: t('inventory.tabs.checkouts') },
  ];

  return (
    <div>
      <h1 className="text-xl font-bold text-gray-900 mb-3">{t('inventory.title')}</h1>
      <nav className="flex gap-1 mb-4 overflow-x-auto whitespace-nowrap -mx-3 px-3 sm:mx-0 sm:px-0">
        {TABS.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            className={({ isActive }) =>
              `shrink-0 px-3 py-1.5 text-sm rounded ${isActive ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'}`
            }
          >
            {tab.label}
          </NavLink>
        ))}
      </nav>
      <Outlet />
    </div>
  );
}
