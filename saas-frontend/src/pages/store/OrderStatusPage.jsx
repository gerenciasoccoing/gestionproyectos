import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { storeClient } from '../../api/client';
import { formatCurrency, formatDate } from '../../utils/format';

const STATUS_LABELS = {
  pending_payment: 'Esperando confirmación de pago',
  paid: 'Pago confirmado',
  failed: 'Pago rechazado',
  cancelled: 'Cancelado',
  fulfilled: 'Despachado',
};

export default function OrderStatusPage() {
  const { orderNumber } = useParams();
  const [order, setOrder] = useState(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    storeClient.get(`/store/orders/${orderNumber}`)
      .then((res) => setOrder(res.data))
      .catch(() => setNotFound(true));
  }, [orderNumber]);

  if (notFound) return <p className="text-gray-500">Pedido no encontrado.</p>;
  if (!order) return <p className="text-gray-500">Cargando…</p>;

  return (
    <div className="max-w-xl mx-auto bg-white rounded-xl shadow-sm p-6">
      <h1 className="text-lg font-bold">Pedido {order.orderNumber}</h1>
      <p className="text-sm text-gray-500 mb-4">{formatDate(order.createdAt)}</p>
      <p className="inline-block px-3 py-1 rounded-full text-sm font-medium mb-4" style={{ backgroundColor: 'var(--color-primary)', color: 'white' }}>
        {STATUS_LABELS[order.status] || order.status}
      </p>
      <div className="divide-y border-t border-b">
        {order.OrderItems?.map((item) => (
          <div key={item.id} className="flex justify-between py-2 text-sm">
            <span>{item.productName} × {item.quantity}</span>
            <span>{formatCurrency(item.subtotal)}</span>
          </div>
        ))}
      </div>
      <div className="mt-3 flex justify-between font-semibold">
        <span>Total</span>
        <span>{formatCurrency(order.total)}</span>
      </div>
    </div>
  );
}
