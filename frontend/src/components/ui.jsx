export function money(n) {
  return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(Number(n || 0));
}

export function Card({ title, actions, children, className = '' }) {
  return (
    <div className={`bg-white rounded-lg shadow-sm border border-gray-200 p-4 mb-4 ${className}`}>
      {(title || actions) && (
        <div className="flex items-center flex-wrap justify-between gap-2 mb-3">
          {title && <h3 className="font-semibold text-gray-800">{title}</h3>}
          <div className="flex flex-wrap gap-2">{actions}</div>
        </div>
      )}
      {children}
    </div>
  );
}

export function Button({ children, variant = 'primary', className = '', ...props }) {
  const variants = {
    primary: 'bg-blue-600 hover:bg-blue-700 text-white',
    secondary: 'bg-gray-200 hover:bg-gray-300 text-gray-800',
    danger: 'bg-red-600 hover:bg-red-700 text-white',
    ghost: 'bg-transparent hover:bg-gray-100 text-gray-700',
  };
  return (
    <button
      className={`px-3 py-1.5 rounded text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed ${variants[variant]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

// className se aplica al <label> (el elemento real dentro de un grid/flex, ej. col-span-*),
// no al control interno, para que utilidades de posicionamiento del contenedor funcionen.
export function Input({ label, className = '', ...props }) {
  return (
    <label className={`flex flex-col gap-1 text-sm text-gray-600 ${className}`}>
      {label && <span>{label}</span>}
      <input
        className="border border-gray-300 rounded px-2 py-1.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-400 w-full"
        {...props}
      />
    </label>
  );
}

export function Select({ label, className = '', children, ...props }) {
  return (
    <label className={`flex flex-col gap-1 text-sm text-gray-600 ${className}`}>
      {label && <span>{label}</span>}
      <select
        className="border border-gray-300 rounded px-2 py-1.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-400 w-full"
        {...props}
      >
        {children}
      </select>
    </label>
  );
}

export function TextArea({ label, className = '', ...props }) {
  return (
    <label className={`flex flex-col gap-1 text-sm text-gray-600 ${className}`}>
      {label && <span>{label}</span>}
      <textarea
        className="border border-gray-300 rounded px-2 py-1.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-400 w-full"
        {...props}
      />
    </label>
  );
}

export function Table({ columns, children }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm text-left">
        <thead>
          <tr className="border-b border-gray-200 text-gray-500">
            {columns.map((c) => (
              <th key={c} className="py-2 pr-3 font-medium">{c}</th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

export function Badge({ children, color = 'gray' }) {
  const colors = {
    gray: 'bg-gray-100 text-gray-700',
    green: 'bg-green-100 text-green-700',
    yellow: 'bg-yellow-100 text-yellow-700',
    red: 'bg-red-100 text-red-700',
    blue: 'bg-blue-100 text-blue-700',
  };
  return <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${colors[color]}`}>{children}</span>;
}

export function ErrorText({ children }) {
  if (!children) return null;
  return <p className="text-sm text-red-600 mt-1">{children}</p>;
}

export function extractError(err) {
  return err?.response?.data?.message || err?.message || 'Ocurrió un error inesperado';
}
