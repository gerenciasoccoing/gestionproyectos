import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { materialsApi } from '../api';
import { money } from './ui';

const DEBOUNCE_MS = 300;

// Selector de material con autocompletar para el ítem de una Orden de Compra (ver la
// especificación: "el campo de material es un selector con búsqueda que autocompleta por nombre o
// código. Muestra la unidad, la categoría y el último costo de compra como referencia"). Búsqueda
// del lado del servidor con debounce (ver materialController.js#search) — nunca carga el catálogo
// completo en memoria, a diferencia de SearchSelect (que sí, y por eso no sirve acá con miles de
// materiales).
//
// Sigue siendo, ante todo, un campo de TEXTO LIBRE (value/onTextChange): el nombre del ítem de la OC
// (PurchaseOrderItem.name) nunca deja de ser texto propio del ítem — escribir algo que no aparece en
// la lista es simplemente "material nuevo", tal como ya resuelve resolveNewItemMaterial() del lado
// del servidor. onPick solo se dispara cuando el usuario elige una sugerencia concreta; a partir de
// ahí el padre decide copiar name/unit del material elegido y guardar su materialId.
export default function MaterialSearchSelect({ value, materialId, onTextChange, onPick, placeholder }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const rootRef = useRef(null);
  const debounceRef = useRef(null);

  useEffect(() => {
    function onDocMouseDown(e) {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', onDocMouseDown);
    return () => document.removeEventListener('mousedown', onDocMouseDown);
  }, []);

  const runSearch = (q) => {
    clearTimeout(debounceRef.current);
    if (!q || !q.trim()) { setResults([]); return; }
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await materialsApi.search(q);
        setResults(res);
      } finally {
        setLoading(false);
      }
    }, DEBOUNCE_MS);
  };

  const handleTextChange = (text) => {
    onTextChange(text);
    runSearch(text);
    setOpen(true);
  };

  const pick = (material) => {
    onPick(material);
    setResults([]);
    setOpen(false);
  };

  return (
    <div className="flex flex-col gap-1 text-sm text-gray-600 relative" ref={rootRef}>
      <label className="flex items-center gap-1">
        {t('execution.purchaseOrders.itemName')}
        {materialId && <span className="text-xs text-green-700">({t('materialsInventory.catalog.title')})</span>}
      </label>
      <input
        type="text"
        className="border border-gray-300 rounded px-2 py-1.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-400 w-full"
        value={value}
        placeholder={placeholder}
        onChange={(e) => handleTextChange(e.target.value)}
        onFocus={() => { if (value) runSearch(value); setOpen(true); }}
        required
      />
      {open && (loading || results.length > 0) && (
        <div className="absolute z-20 top-full left-0 right-0 mt-1 bg-white border border-gray-300 rounded shadow-lg max-h-64 overflow-y-auto">
          {loading && <div className="px-2 py-1.5 text-xs text-gray-400">{t('common.loading')}</div>}
          {results.map((m) => (
            <div
              key={m.id}
              className="px-2 py-1.5 text-sm cursor-pointer hover:bg-blue-50 flex justify-between items-center gap-2"
              onMouseDown={(e) => { e.preventDefault(); pick(m); }}
            >
              <span>
                <span className="font-medium">{m.name}</span>
                <span className="text-xs text-gray-500"> · {m.code} · {m.unit || '-'}{m.categoryName ? ` · ${m.categoryName}` : ''}</span>
              </span>
              {m.lastPurchaseCost != null && <span className="text-xs text-gray-500 whitespace-nowrap">{money(m.lastPurchaseCost)}</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
