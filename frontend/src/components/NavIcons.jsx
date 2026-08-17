// Íconos simples (trazo, 24x24) para el menú lateral. Un componente por sección para poder
// mostrarlos solos cuando el sidebar está colapsado a íconos.
const common = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.75, strokeLinecap: 'round', strokeLinejoin: 'round' };

export function ProjectsIcon(props) {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" {...common} {...props}>
      <path d="M3 21V9l9-6 9 6v12" />
      <path d="M9 21v-7h6v7" />
    </svg>
  );
}

export function QuotationsIcon(props) {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" {...common} {...props}>
      <path d="M7 3h8l4 4v14H7z" />
      <path d="M15 3v4h4M9 12h6M9 16h6" />
    </svg>
  );
}

export function PriceBookIcon(props) {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" {...common} {...props}>
      <path d="M4 4h9l7 7-9 9-7-7z" />
      <circle cx="8.5" cy="8.5" r="1.25" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function ApuIcon(props) {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" {...common} {...props}>
      <rect x="5" y="3" width="14" height="18" rx="1.5" />
      <path d="M8 7h8M8 11h2M12.5 11h2M17 11h.01M8 15h2M12.5 15h2M17 15h.01M8 18h2M12.5 18h2M17 18h.01" />
    </svg>
  );
}

export function ThirdPartiesIcon(props) {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" {...common} {...props}>
      <circle cx="9" cy="8" r="3.25" />
      <path d="M2.5 20c.7-3.4 3.3-5.5 6.5-5.5s5.8 2.1 6.5 5.5" />
      <path d="M16 4.2c1.6.4 2.75 1.85 2.75 3.55S17.6 11.1 16 11.5" />
      <path d="M18.5 14.7c2 .6 3.4 2.3 4 4.8" />
    </svg>
  );
}

export function InventoryIcon(props) {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" {...common} {...props}>
      <path d="M3.5 7.5L12 3l8.5 4.5L12 12 3.5 7.5z" />
      <path d="M3.5 7.5V16l8.5 4.5V12M20.5 7.5V16L12 20.5" />
    </svg>
  );
}

export function AdminIcon(props) {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" {...common} {...props}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 13a7.4 7.4 0 000-2l2-1.5-2-3.4-2.4.7a7.5 7.5 0 00-1.7-1l-.4-2.4h-4l-.4 2.4a7.5 7.5 0 00-1.7 1l-2.4-.7-2 3.4L6.6 11a7.4 7.4 0 000 2l-2 1.5 2 3.4 2.4-.7c.5.4 1.1.75 1.7 1l.4 2.4h4l.4-2.4c.6-.25 1.2-.6 1.7-1l2.4.7 2-3.4-2-1.5z" />
    </svg>
  );
}

export function MenuIcon(props) {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" {...props}>
      <path d="M4 6h16M4 12h16M4 18h16" strokeLinecap="round" />
    </svg>
  );
}

export function LogoutIcon(props) {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" {...common} {...props}>
      <path d="M9 4H6a2 2 0 00-2 2v12a2 2 0 002 2h3" />
      <path d="M16 16l4-4-4-4M20 12H9" />
    </svg>
  );
}
