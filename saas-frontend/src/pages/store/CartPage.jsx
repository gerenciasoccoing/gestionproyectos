import { Link, useNavigate } from 'react-router-dom';
import { useCart } from '../../context/CartContext';
import { formatCurrency } from '../../utils/format';

export default function CartPage() {
  const { items, updateQuantity, removeItem, subtotal } = useCart();
  const navigate = useNavigate();

  if (items.length === 0) {
    return (
      <div className="text-center py-16">
        <p className="text-gray-500 mb-4">Tu carrito está vacío.</p>
        <Link to="/" className="font-medium underline" style={{ color: 'var(--color-primary)' }}>Ver productos</Link>
      </div>
    );
  }

  return (
    <div className="max-w-xl mx-auto">
      <h1 className="text-xl font-bold mb-4">Tu carrito</h1>
      <div className="bg-white rounded-xl divide-y shadow-sm">
        {items.map((item) => (
          <div key={item.productId} className="flex items-center justify-between p-4">
            <div>
              <p className="font-medium text-gray-800">{item.name}</p>
              <p className="text-sm text-gray-500">{formatCurrency(item.price)} c/u</p>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min="1"
                value={item.quantity}
                onChange={(e) => updateQuantity(item.productId, Number(e.target.value))}
                className="w-16 border border-gray-300 rounded-lg px-2 py-1 text-center"
              />
              <button type="button" onClick={() => removeItem(item.productId)} className="text-red-500 text-sm">Quitar</button>
            </div>
          </div>
        ))}
      </div>
      <div className="mt-4 flex items-center justify-between text-lg font-semibold">
        <span>Subtotal</span>
        <span>{formatCurrency(subtotal)}</span>
      </div>
      <p className="text-sm text-gray-500 mt-1">El envío se calcula en el siguiente paso.</p>
      <button
        type="button"
        onClick={() => navigate('/checkout')}
        className="mt-6 w-full py-3 rounded-lg text-white font-medium"
        style={{ backgroundColor: 'var(--color-primary)' }}
      >
        Continuar al pago
      </button>
    </div>
  );
}
