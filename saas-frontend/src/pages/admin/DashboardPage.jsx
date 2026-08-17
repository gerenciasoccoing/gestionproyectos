import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { staffClient } from '../../api/client';
import { formatCurrency } from '../../utils/format';

export default function DashboardPage() {
  const [orders, setOrders] = useState([]);
  const [lowStock, setLowStock] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      staffClient.get('/tenant/orders'),
      staffClient.get('/tenant/inventory/low-stock'),
    ]).then(([ordersRes, lowStockRes]) => {
      setOrders(ordersRes.data);
      setLowStock(lowStockRes.data);
    }).finally(() => setLoading(false));
  }, []);

  if (loading) return <p className="text-gray-500">Cargando…</p>;

  const paidOrders = orders.filter((o) => ['paid', 'fulfilled'].includes(o.status));
  const totalRevenue = paidOrders.reduce((sum, o) => sum + Number(o.total), 0);
  const pendingCount = orders.filter((o) => o.status === 'pending_payment').length;

  return (
    <div>
      <h1 className="text-xl font-bold text-gray-900 mb-4">Panel</h1>
      <div className="grid sm:grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-xl shadow-sm p-4">
          <p className="text-sm text-gray-500">Ventas confirmadas</p>
          <p className="text-2xl font-bold text-gray-900">{formatCurrency(totalRevenue)}</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm p-4">
          <p className="text-sm text-gray-500">Pedidos pendientes de pago</p>
          <p className="text-2xl font-bold text-gray-900">{pendingCount}</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm p-4">
          <p className="text-sm text-gray-500">Productos con stock bajo</p>
          <p className="text-2xl font-bold text-gray-900">{lowStock.length}</p>
        </div>
      </div>

      {lowStock.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm p-4 mb-6">
          <p className="font-semibold text-gray-800 mb-2">Alertas de stock bajo</p>
          <ul className="text-sm text-gray-600 space-y-1">
            {lowStock.map((p) => (
              <li key={p.id} className="flex justify-between">
                <span>{p.name}</span>
                <span className="text-red-500">{p.stock} en stock (mínimo {p.lowStockThreshold})</span>
              </li>
            ))}
          </ul>
          <Link to="/admin/inventario" className="text-indigo-600 text-sm font-medium mt-2 inline-block">Ir a inventario →</Link>
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm p-4">
        <p className="font-semibold text-gray-800 mb-2">Últimos pedidos</p>
        {orders.slice(0, 5).map((o) => (
          <div key={o.id} className="flex justify-between text-sm py-1 border-b last:border-0">
            <span>{o.orderNumber} · {o.customerName}</span>
            <span>{formatCurrency(o.total)}</span>
          </div>
        ))}
        {orders.length === 0 && <p className="text-sm text-gray-500">Aún no hay pedidos.</p>}
      </div>
    </div>
  );
}
