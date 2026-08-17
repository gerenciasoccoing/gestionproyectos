import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { storeClient, fileUrl } from '../../api/client';
import { formatCurrency } from '../../utils/format';
import { useCart } from '../../context/CartContext';

export default function ProductDetailPage() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const { addItem } = useCart();
  const [product, setProduct] = useState(null);
  const [quantity, setQuantity] = useState(1);
  const [notFound, setNotFound] = useState(false);
  const [added, setAdded] = useState(false);

  useEffect(() => {
    setNotFound(false);
    setProduct(null);
    storeClient.get(`/store/products/${slug}`)
      .then((res) => setProduct(res.data))
      .catch(() => setNotFound(true));
  }, [slug]);

  if (notFound) return <p className="text-gray-500">Producto no encontrado.</p>;
  if (!product) return <p className="text-gray-500">Cargando…</p>;

  const outOfStock = product.trackInventory && product.stock <= 0;

  return (
    <div className="grid md:grid-cols-2 gap-8">
      <div className="aspect-square bg-white rounded-xl overflow-hidden flex items-center justify-center shadow-sm">
        {product.images?.[0] ? (
          <img src={fileUrl(product.images[0])} alt={product.name} className="h-full w-full object-cover" />
        ) : (
          <span className="text-gray-300">Sin imagen</span>
        )}
      </div>
      <div>
        <h1 className="text-2xl font-bold text-gray-900">{product.name}</h1>
        <p className="text-xl font-semibold mt-2" style={{ color: 'var(--color-primary)' }}>{formatCurrency(product.price)}</p>
        {product.description && <p className="text-gray-600 mt-4 whitespace-pre-line">{product.description}</p>}

        {outOfStock ? (
          <p className="mt-6 text-red-500 font-medium">Producto agotado</p>
        ) : (
          <div className="mt-6 flex items-center gap-3">
            <input
              type="number"
              min="1"
              max={product.trackInventory ? product.stock : undefined}
              value={quantity}
              onChange={(e) => setQuantity(Math.max(1, Number(e.target.value)))}
              className="w-20 border border-gray-300 rounded-lg px-3 py-2"
            />
            <button
              type="button"
              onClick={() => { addItem(product, quantity); setAdded(true); }}
              className="px-5 py-2 rounded-lg text-white font-medium"
              style={{ backgroundColor: 'var(--color-primary)' }}
            >
              Agregar al carrito
            </button>
          </div>
        )}

        {added && (
          <div className="mt-4 flex gap-3">
            <button type="button" onClick={() => setAdded(false)} className="text-sm text-gray-500 underline">Seguir comprando</button>
            <button type="button" onClick={() => navigate('/carrito')} className="text-sm font-medium underline" style={{ color: 'var(--color-primary)' }}>Ir al carrito</button>
          </div>
        )}
      </div>
    </div>
  );
}
