import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useCart } from '../../context/CartContext';
import { useTenant } from '../../context/TenantContext';
import { storeClient } from '../../api/client';
import { formatCurrency } from '../../utils/format';

export default function CheckoutPage() {
  const { items, subtotal, clear } = useCart();
  const { tenant } = useTenant();
  const [form, setForm] = useState({
    name: '', email: '', phone: '', address: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  if (items.length === 0) return <Navigate to="/carrito" replace />;

  const shippingCost = tenant?.shippingType === 'free' ? 0 : Number(tenant?.shippingFixedRate || 0);
  const total = subtotal + shippingCost;

  const handleChange = (e) => setForm((f) => ({ ...f, [e.target.name]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const res = await storeClient.post('/store/checkout', {
        items: items.map((i) => ({ productId: i.productId, quantity: i.quantity })),
        customer: form,
      });
      clear();
      if (res.data.payment?.redirectUrl) {
        window.location.href = res.data.payment.redirectUrl;
      }
    } catch (err) {
      setError(err.response?.data?.message || 'No se pudo procesar el pedido');
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-xl mx-auto">
      <h1 className="text-xl font-bold mb-4">Finalizar compra</h1>
      <form onSubmit={handleSubmit} className="bg-white rounded-xl shadow-sm p-5 space-y-3">
        <div>
          <label className="block text-sm text-gray-600 mb-1" htmlFor="name">Nombre completo</label>
          <input id="name" name="name" required value={form.name} onChange={handleChange} className="w-full border border-gray-300 rounded-lg px-3 py-2" />
        </div>
        <div>
          <label className="block text-sm text-gray-600 mb-1" htmlFor="email">Email</label>
          <input id="email" name="email" type="email" required value={form.email} onChange={handleChange} className="w-full border border-gray-300 rounded-lg px-3 py-2" />
        </div>
        <div>
          <label className="block text-sm text-gray-600 mb-1" htmlFor="phone">Teléfono</label>
          <input id="phone" name="phone" value={form.phone} onChange={handleChange} className="w-full border border-gray-300 rounded-lg px-3 py-2" />
        </div>
        <div>
          <label className="block text-sm text-gray-600 mb-1" htmlFor="address">Dirección de envío</label>
          <input id="address" name="address" value={form.address} onChange={handleChange} className="w-full border border-gray-300 rounded-lg px-3 py-2" />
        </div>

        <div className="border-t pt-3 space-y-1 text-sm">
          <div className="flex justify-between"><span>Subtotal</span><span>{formatCurrency(subtotal)}</span></div>
          <div className="flex justify-between"><span>Envío</span><span>{formatCurrency(shippingCost)}</span></div>
          <div className="flex justify-between font-semibold text-base"><span>Total</span><span>{formatCurrency(total)}</span></div>
        </div>

        {error && <p className="text-red-500 text-sm">{error}</p>}

        <button
          type="submit"
          disabled={submitting}
          className="w-full py-3 rounded-lg text-white font-medium disabled:opacity-60"
          style={{ backgroundColor: 'var(--color-primary)' }}
        >
          {submitting ? 'Procesando…' : 'Pagar ahora'}
        </button>
      </form>
    </div>
  );
}
