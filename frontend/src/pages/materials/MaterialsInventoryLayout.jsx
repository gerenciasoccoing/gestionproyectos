import { NavLink, Outlet } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

// Inventario de Materiales: bodegas/lotes/costeo PEPS/traslados/salidas/devoluciones/kardex/análisis
// por contrato. Módulo aparte de InventoryLayout.jsx (ese sigue siendo solo Equipos y Herramientas,
// sin cambios) — mismo patrón de pestañas, se amplía en cada fase con más tabs (traslados, salidas,
// devoluciones, kardex).
export default function MaterialsInventoryLayout() {
  const { t } = useTranslation();
  const TABS = [
    { to: 'stock', label: t('materialsInventory.tabs.stock') },
    { to: 'transfers', label: t('materialsInventory.tabs.transfers') },
    { to: 'issues', label: t('materialsInventory.tabs.issues') },
    { to: 'returns', label: t('materialsInventory.tabs.returns') },
    { to: 'kardex', label: t('materialsInventory.tabs.kardex') },
    { to: 'warehouses', label: t('materialsInventory.tabs.warehouses') },
    { to: 'catalog', label: t('materialsInventory.tabs.catalog') },
  ];

  return (
    <div>
      <h1 className="text-xl font-bold text-gray-900 mb-3">{t('materialsInventory.title')}</h1>
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
