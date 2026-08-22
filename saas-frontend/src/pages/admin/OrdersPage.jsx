import { useEffect, useState } from 'react';
import { staffClient } from '../../api/client';
import { formatCurrency, formatDate } from '../../utils/format';

const STATUS_LABELS = {
  pending_payment: 'Pendiente de pago',
  paid: 'Pagado',
  failed: 'Pago fallido',
  cancelled: 'Cancelado',
  fulfilled: 'Despachado',
};

const STATUS_COLORS = {
  pending_payment: 'bg-amber-100 text-amber-700',
  paid: 'bg-green-100 text-green-700',
  failed: 'bg-red-100 text-red-700',
  cancelled: 'bg-gray-100 text-gray-500',
  fulfilled: 'bg-indigo-100 text-indigo-700',
};

export default function OrdersPage() {
  const [orders, setOrders] = useState([]);
  const [expandedId, setExpandedId] = useState(null);

  const load = () => staffClient.get('/tenant/orders').then((res) => setOrders(res.data));
  useEffect(() => { load(); }, []);

  const toggleExpand = async (order) => {
    if (expandedId === order.id) { setExpandedId(null); return; }
    const res = await staffClient.get(`/tenant/orders/${order.id}`);
    setOrders((prev) => prev.map((o) => (o.id === order.id ? res.data : o)));
    setExpandedId(order.id);
  };

  const markFulfilled = async (order) => {
    await staffClient.patch(`/tenant/orders/${order.id}/status`, { status: 'fulfilled' });
    load();
  };

  const cancelOrder = async (order) => {
    if (!window.confirm('¿Cancelar este pedido?')) return;
    await staffClient.patch(`/tenant/orders/${order.id}/status`, { status: 'cancelled' });
    load();
  };

  return (
    <div>
      <h1 className="text-xl font-bold text-gray-900 mb-4">Pedidos</h1>
      <div className="bg-white rounded-xl shadow-sm divide-y">
        {orders.map((o) => (
          <div key={o.id} className="px-4 py-3">
            <div className="flex items-center justify-between">
              <button type="button" onClick={() => toggleExpand(o)} className="text-left">
                <p className="font-medium text-gray-800">{o.orderNumber} · {o.customerName}</p>
                <p className="text-sm text-gray-500">{formatDate(o.createdAt)} · {formatCurrency(o.total)}</p>
              </button>
              <div className="flex items-center gap-2">
                <span className={`text-xs font-medium px-2 py-1 rounded-full ${STATUS_COLORS[o.status]}`}>{STATUS_LABELS[o.status]}</span>
                {o.status === 'paid' && <button type="button" onClick={() => markFulfilled(o)} className="text-indigo-600 text-sm">Marcar despachado</button>}
                {o.status === 'pending_payment' && <button type="button" onClick={() => cancelOrder(o)} className="text-red-500 text-sm">Cancelar</button>}
              </div>
            </div>
            {expandedId === o.id && o.OrderItems && (
              <div className="mt-2 pl-2 border-l-2 border-gray-100 text-sm text-gray-600 space-y-1">
                {o.OrderItems.map((item) => (
                  <div key={item.id} className="flex justify-between">
                    <span>{item.productName} × {item.quantity}</span>
                    <span>{formatCurrency(item.subtotal)}</span>
                  </div>
                ))}
                <p>Envío: {formatCurrency(o.shippingCost)}</p>
                {o.customerPhone && <p>Teléfono: {o.customerPhone}</p>}
                {o.shippingAddress && <p>Dirección: {o.shippingAddress}</p>}
              </div>
            )}
          </div>
        ))}
        {orders.length === 0 && <p className="px-4 py-6 text-sm text-gray-500">Aún no hay pedidos.</p>}
      </div>
    </div>
  );
}
