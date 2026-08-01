// Marca ERGY-PROJECT: ícono de barras ascendentes (avance/gestión de proyectos) sobre
// un badge con degradé, más el nombre. `iconOnly` para usarlo sin texto (ej. favicon-like).
export default function Logo({ size = 40, iconOnly = false, dark = false }) {
  return (
    <div className="flex items-center gap-2.5 select-none">
      <svg width={size} height={size} viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg" className="shrink-0">
        <defs>
          <linearGradient id="ergyGradient" x1="0" y1="0" x2="40" y2="40" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#2563eb" />
            <stop offset="1" stopColor="#0ea5e9" />
          </linearGradient>
        </defs>
        <rect width="40" height="40" rx="10" fill="url(#ergyGradient)" />
        <rect x="9" y="21" width="5" height="10" rx="1.5" fill="white" fillOpacity="0.55" />
        <rect x="17.5" y="15" width="5" height="16" rx="1.5" fill="white" fillOpacity="0.8" />
        <rect x="26" y="9" width="5" height="22" rx="1.5" fill="white" />
        <path d="M9 16.5L17 10.5L23 13.5L31 7" stroke="white" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      {!iconOnly && (
        <span className={`font-bold tracking-tight leading-none ${dark ? 'text-white' : 'text-gray-900'}`} style={{ fontSize: size * 0.42 }}>
          ERGY<span className="text-blue-600">-PROJECT</span>
        </span>
      )}
    </div>
  );
}
