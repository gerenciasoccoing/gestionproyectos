import { useEffect, useState } from 'react';
import { NavLink, Outlet, Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';
import { companyApi } from '../api';
import { setCurrencyConfig } from './ui';
import Can from './Can';
import Logo from './Logo';
import LanguageSwitcher from './LanguageSwitcher';
import {
  ProjectsIcon, QuotationsIcon, PriceBookIcon, ApuIcon, SuppliersIcon, ThirdPartiesIcon, InventoryIcon, AdminIcon,
  ExpensesIcon, CashBoxIcon, MenuIcon, LogoutIcon,
} from './NavIcons';

// Ancho del sidebar expandido/colapsado (a íconos). Se comparte entre el <aside> y el spacer del
// header para que el layout no salte al alternar.
const SIDEBAR_W = 224;
const SIDEBAR_W_COLLAPSED = 64;

function SidebarLink({ to, label, icon, collapsed, end, onNavigate }) {
  return (
    <NavLink
      to={to}
      end={end}
      onClick={onNavigate}
      title={collapsed ? label : undefined}
      className={({ isActive }) => [
        'flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors',
        collapsed ? 'justify-center' : '',
        isActive ? 'bg-blue-600/90 text-white' : 'text-gray-300 hover:text-white hover:bg-white/10',
      ].join(' ')}
    >
      <span className="shrink-0">{icon}</span>
      {!collapsed && <span className="truncate">{label}</span>}
    </NavLink>
  );
}

export default function Layout() {
  const { t } = useTranslation();
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  // En pantallas pequeñas arranca colapsado a íconos (ahorra espacio horizontal); en escritorio,
  // expandido. A partir de ahí el usuario controla el estado con el botón de menú.
  const [collapsed, setCollapsed] = useState(() => typeof window !== 'undefined' && window.innerWidth < 768);

  const NAV_LINKS = [
    { to: '/', label: t('nav.projects'), icon: <ProjectsIcon />, end: true },
    { to: '/quotations', label: t('nav.quotations'), icon: <QuotationsIcon /> },
    { to: '/price-book', label: t('nav.priceBook'), icon: <PriceBookIcon /> },
    { to: '/apus', label: t('nav.apu'), icon: <ApuIcon /> },
    { to: '/suppliers', label: t('nav.suppliers'), icon: <SuppliersIcon /> },
    { to: '/clients', label: t('nav.clients'), icon: <ThirdPartiesIcon /> },
  ];

  // La moneda es una configuración del negocio (independiente del idioma de la interfaz): se
  // carga una vez al montar la app autenticada y money() la usa desde entonces.
  useEffect(() => { companyApi.get().then((s) => setCurrencyConfig(s.currency)); }, []);

  const handleLogout = () => { logout(); navigate('/login'); };
  const sidebarWidth = collapsed ? SIDEBAR_W_COLLAPSED : SIDEBAR_W;

  return (
    <div className="min-h-screen flex flex-col">
      <header className="h-14 bg-gray-900 text-white flex items-center justify-between px-3 sm:px-4 border-b border-gray-800 shrink-0 z-10">
        <div className="flex items-center gap-1 min-w-0">
          <button
            onClick={() => setCollapsed((c) => !c)}
            className="p-2 -ml-1 text-gray-300 hover:text-white hover:bg-white/5 rounded-md transition-colors shrink-0"
            aria-label={t('nav.toggleSidebar')}
            title={t('nav.toggleSidebar')}
          >
            <MenuIcon />
          </button>
          <Link to="/" className="hover:opacity-90 transition-opacity shrink-0 flex items-center ml-1">
            <span className="hidden sm:flex"><Logo size={30} dark /></span>
            <span className="sm:hidden flex"><Logo size={30} dark iconOnly /></span>
          </Link>
        </div>

        <div className="flex items-center gap-2 sm:gap-3 text-sm shrink-0 min-w-0">
          <span className="hidden sm:inline text-gray-300 truncate max-w-[220px]">
            {user?.name} <span className="text-gray-500">({user?.roles?.join(', ')})</span>
          </span>
          <LanguageSwitcher />
          <button
            onClick={handleLogout}
            className="bg-gray-800 hover:bg-gray-700 px-2.5 sm:px-3 py-1.5 rounded-md transition-colors flex items-center gap-1.5"
            title={t('nav.logout')}
          >
            <span className="sm:hidden"><LogoutIcon /></span>
            <span className="hidden sm:inline">{t('nav.logout')}</span>
          </button>
        </div>
      </header>

      <div className="flex flex-1 min-h-0">
        <aside
          style={{ width: sidebarWidth }}
          className="bg-gray-900 text-white shrink-0 border-r border-gray-800 sticky top-14 h-[calc(100vh-56px)] overflow-y-auto overflow-x-hidden transition-[width] duration-150 flex flex-col"
        >
          <nav className="flex-1 py-3 px-2 flex flex-col gap-1">
            {NAV_LINKS.map((l) => (
              <SidebarLink key={l.to} {...l} collapsed={collapsed} />
            ))}
            <Can module="inventario" action="view">
              <SidebarLink to="/inventory" label={t('nav.inventory')} icon={<InventoryIcon />} collapsed={collapsed} />
            </Can>
            <Can module="gastos" action="view">
              <SidebarLink to="/expenses" label={t('nav.expenses')} icon={<ExpensesIcon />} collapsed={collapsed} />
            </Can>
            <Can module="cajas" action="view">
              <SidebarLink to="/cash-boxes" label={t('nav.cashBoxes')} icon={<CashBoxIcon />} collapsed={collapsed} />
            </Can>
            <Can module="admin" action="view">
              <SidebarLink to="/admin" label={t('nav.admin')} icon={<AdminIcon />} collapsed={collapsed} />
            </Can>
          </nav>
        </aside>

        <main className="flex-1 min-w-0 bg-gray-100 p-3 sm:p-4 overflow-x-hidden">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
