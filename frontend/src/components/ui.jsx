import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import i18n from '../i18n';

// La moneda es una configuración del negocio (ver CompanySettings), independiente del idioma de
// la interfaz: se fija una sola vez al cargar la app (Layout.jsx) y money() la usa desde acá en
// vez de recibirla por props en cada uno de sus ~20 usos en toda la app.
const CURRENCY_FORMATS = {
  COP: { locale: 'es-CO', currency: 'COP', maximumFractionDigits: 0 },
  USD: { locale: 'en-US', currency: 'USD', maximumFractionDigits: 2 },
  EUR: { locale: 'es-ES', currency: 'EUR', maximumFractionDigits: 2 },
};
let currentCurrency = 'COP';

export function setCurrencyConfig(currency) {
  if (CURRENCY_FORMATS[currency]) currentCurrency = currency;
}

export function money(n) {
  const { locale, currency, maximumFractionDigits } = CURRENCY_FORMATS[currentCurrency];
  return new Intl.NumberFormat(locale, { style: 'currency', currency, maximumFractionDigits }).format(Number(n || 0));
}

// Convierte una fecha ISO (AAAA-MM-DD, como las que devuelve la API) al formato del idioma
// activo: DD/MM/AAAA en español, MM/DD/AAAA en inglés. Los valores no cambian, solo el orden en
// que se muestran; si el valor no es una fecha ISO válida se devuelve tal cual.
export function formatDate(isoDate) {
  if (!isoDate) return '';
  const match = String(isoDate).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return isoDate;
  const [, year, month, day] = match;
  return i18n.language === 'en' ? `${month}/${day}/${year}` : `${day}/${month}/${year}`;
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

// Rango Unicode de marcas diacríticas combinantes (U+0300-U+036F), construido con
// fromCharCode para evitar caracteres combinantes literales sueltos en el código fuente.
const COMBINING_MARKS_START = String.fromCharCode(0x0300);
const COMBINING_MARKS_END = String.fromCharCode(0x036f);
const COMBINING_MARKS = new RegExp(`[${COMBINING_MARKS_START}-${COMBINING_MARKS_END}]`, 'g');

function normalizeSearch(s) {
  return String(s ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(COMBINING_MARKS, '');
}

const SEARCH_SELECT_MAX_RESULTS = 50;

// Combobox con filtro de texto para listas largas (ej. base de precios, APU). options es
// [{ value, label }]. A diferencia de Select, escribir filtra las opciones en vez de saltar
// a la que empieza con esa letra.
export function SearchSelect({ label, className = '', options, value, onChange, placeholder, disabled = false }) {
  const { t } = useTranslation();
  const effectivePlaceholder = placeholder ?? t('common.selectPlaceholder');
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(0);
  const rootRef = useRef(null);

  useEffect(() => {
    function onDocMouseDown(e) {
      if (rootRef.current && !rootRef.current.contains(e.target)) {
        setOpen(false);
        setQuery('');
      }
    }
    document.addEventListener('mousedown', onDocMouseDown);
    return () => document.removeEventListener('mousedown', onDocMouseDown);
  }, []);

  const selected = options.find((o) => o.value === value);

  const filtered = useMemo(() => {
    const q = normalizeSearch(query);
    if (!q) return options;
    return options.filter((o) => normalizeSearch(o.label).includes(q));
  }, [options, query]);

  const shown = filtered.slice(0, SEARCH_SELECT_MAX_RESULTS);

  const selectOption = (opt) => {
    onChange(opt.value);
    setQuery('');
    setOpen(false);
  };

  const handleKeyDown = (e) => {
    if (!open) {
      if (e.key === 'ArrowDown' || e.key === 'Enter') { e.preventDefault(); setOpen(true); setHighlighted(0); }
      return;
    }
    if (e.key === 'ArrowDown') { e.preventDefault(); setHighlighted((h) => Math.min(h + 1, shown.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setHighlighted((h) => Math.max(h - 1, 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); if (shown[highlighted]) selectOption(shown[highlighted]); }
    else if (e.key === 'Escape') { setOpen(false); setQuery(''); }
  };

  return (
    <div className={`flex flex-col gap-1 text-sm text-gray-600 relative ${className}`} ref={rootRef}>
      {label && <label className="block">{label}</label>}
      <input
        type="text"
        disabled={disabled}
        className="border border-gray-300 rounded px-2 py-1.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-400 w-full disabled:bg-gray-100"
        value={open ? query : (selected ? selected.label : '')}
        placeholder={effectivePlaceholder}
        onFocus={(e) => { setOpen(true); setQuery(''); setHighlighted(0); e.target.select(); }}
        onChange={(e) => { setQuery(e.target.value); setOpen(true); setHighlighted(0); }}
        onKeyDown={handleKeyDown}
      />
      {open && (
        <div className="absolute z-20 top-full left-0 right-0 mt-1 bg-white border border-gray-300 rounded shadow-lg max-h-64 overflow-y-auto">
          <div
            className={`px-2 py-1.5 text-sm text-gray-400 cursor-pointer hover:bg-blue-50 ${!value ? 'bg-blue-50' : ''}`}
            onMouseDown={(e) => { e.preventDefault(); selectOption({ value: '', label: '' }); }}
          >
            {effectivePlaceholder}
          </div>
          {shown.map((o, i) => (
            <div
              key={o.value}
              className={`px-2 py-1.5 text-sm cursor-pointer hover:bg-blue-50 ${i === highlighted ? 'bg-blue-100' : ''} ${o.value === value ? 'font-medium' : ''}`}
              onMouseDown={(e) => { e.preventDefault(); selectOption(o); }}
              onMouseEnter={() => setHighlighted(i)}
            >
              {o.label}
            </div>
          ))}
          {shown.length === 0 && <div className="px-2 py-1.5 text-sm text-gray-400">{t('common.noResults')}</div>}
          {filtered.length > SEARCH_SELECT_MAX_RESULTS && (
            <div className="px-2 py-1 text-xs text-gray-400 border-t border-gray-100">
              {t('common.showingResults', { shown: SEARCH_SELECT_MAX_RESULTS, total: filtered.length })}
            </div>
          )}
        </div>
      )}
    </div>
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
  const raw = err?.response?.data?.message;
  if (raw) return i18n.t(`errors.${raw}`, raw);
  return err?.message || i18n.t('common.unexpectedError');
}
