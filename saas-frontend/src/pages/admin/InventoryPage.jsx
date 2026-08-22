import { useEffect, useState } from 'react';
import { staffClient } from '../../api/client';
import { formatDate } from '../../utils/format';

const TYPE_LABELS = { in: 'Entrada', out: 'Salida', adjustment: 'Ajuste' };

export default function InventoryPage() {
  const [products, setProducts] = useState([]);
  const [movements, setMovements] = useState([]);
  const [lowStock, setLowStock] = useState([]);
  const [form, setForm] = useState({ productId: '', type: 'in', quantity: '', reason: '' });
  const [error, setError] = useState('');

  const load = () => {
    staffClient.get('/tenant/products').then((res) => setProducts(res.data));
    staffClient.get('/tenant/inventory/movements').then((res) => setMovements(res.data));
    staffClient.get('/tenant/inventory/low-stock').then((res) => setLowStock(res.data));
  };

  useEffect(() => { load(); }, []);

  const handleChange = (e) => setForm((f) => ({ ...f, [e.target.name]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!form.productId) { setError('Selecciona un producto'); return; }
    try {
      await staffClient.post(`/tenant/inventory/${form.productId}/adjust`, {
        type: form.type, quantity: Number(form.quantity), reason: form.reason,
      });
      setForm({ productId: '', type: 'in', quantity: '', reason: '' });
      load();
    } catch (err) {
      setError(err.response?.data?.message || 'No se pudo registrar el movimiento');
    }
  };

  return (
    <div>
      <h1 className="text-xl font-bold text-gray-900 mb-4">Inventario</h1>

      {lowStock.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6">
          <p className="font-semibold text-amber-800 mb-1">Stock bajo</p>
          <ul className="text-sm text-amber-700">
            {lowStock.map((p) => <li key={p.id}>{p.name}: {p.stock} unidades (mínimo {p.lowStockThreshold})</li>)}
          </ul>
        </div>
      )}

      <form onSubmit={handleSubmit} className="bg-white rounded-xl shadow-sm p-4 mb-6 grid sm:grid-cols-4 gap-3">
        <select name="productId" value={form.productId} onChange={handleChange} className="border border-gray-300 rounded-lg px-3 py-2 sm:col-span-2">
          <option value="">Selecciona un producto</option>
          {products.map((p) => <option key={p.id} value={p.id}>{p.name} (stock: {p.stock})</option>)}
        </select>
        <select name="type" value={form.type} onChange={handleChange} className="border border-gray-300 rounded-lg px-3 py-2">
          <option value="in">Entrada (compra)</option>
          <option value="out">Salida</option>
          <option value="adjustment">Ajuste (nuevo stock total)</option>
        </select>
        <input name="quantity" type="number" min="0" value={form.quantity} onChange={handleChange} placeholder={form.type === 'adjustment' ? 'Nuevo stock' : 'Cantidad'} required className="border border-gray-300 rounded-lg px-3 py-2" />
        <input name="reason" value={form.reason} onChange={handleChange} placeholder="Motivo (compra, conteo físico, etc.)" className="border border-gray-300 rounded-lg px-3 py-2 sm:col-span-3" />
        <button type="submit" className="px-4 py-2 rounded-lg bg-indigo-600 text-white font-medium">Registrar</button>
        {error && <p className="sm:col-span-4 text-red-500 text-sm">{error}</p>}
      </form>

      <div className="bg-white rounded-xl shadow-sm">
        <p className="font-semibold text-gray-800 px-4 pt-4">Historial de movimientos</p>
        <div className="divide-y">
          {movements.map((m) => (
            <div key={m.id} className="flex justify-between px-4 py-2 text-sm">
              <div>
                <span className="font-medium">{m.Product?.name}</span>
                <span className="text-gray-500"> · {TYPE_LABELS[m.type]} · {m.reason || 'Sin motivo'}</span>
              </div>
              <div className="text-right text-gray-500 shrink-0">
                {m.previousStock} → {m.newStock}
                <div className="text-xs">{formatDate(m.createdAt)}</div>
              </div>
            </div>
          ))}
          {movements.length === 0 && <p className="px-4 py-6 text-sm text-gray-500">No hay movimientos registrados.</p>}
        </div>
      </div>
    </div>
  );
}
