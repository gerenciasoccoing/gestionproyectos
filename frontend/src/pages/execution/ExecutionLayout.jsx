import { NavLink, Outlet, useOutletContext } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

export default function ExecutionLayout() {
  const { t } = useTranslation();
  const ctx = useOutletContext();

  const TABS = [
    { to: 'dashboard', label: t('execution.tabs.dashboard') },
    { to: 'minutes', label: t('execution.tabs.minutes') },
    { to: 'milestones', label: t('execution.tabs.milestones') },
    { to: 'progress', label: t('execution.tabs.progress') },
    { to: 'purchase-orders', label: t('execution.tabs.purchaseOrders') },
  ];

  return (
    <div>
      <nav className="flex gap-1 mb-3 overflow-x-auto whitespace-nowrap -mx-3 px-3 sm:mx-0 sm:px-0">
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
      <Outlet context={ctx} />
    </div>
  );
}
