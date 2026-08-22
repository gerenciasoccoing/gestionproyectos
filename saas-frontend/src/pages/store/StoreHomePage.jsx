import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { storeClient, fileUrl } from '../../api/client';
import { formatCurrency } from '../../utils/format';

export default function StoreHomePage() {
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [categorySlug, setCategorySlug] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    storeClient.get('/store/categories').then((res) => setCategories(res.data)).catch(() => {});
  }, []);

  useEffect(() => {
    setLoading(true);
    storeClient.get('/store/products', { params: categorySlug ? { categorySlug } : {} })
      .then((res) => setProducts(res.data))
      .finally(() => setLoading(false));
  }, [categorySlug]);

  return (
    <div>
      {categories.length > 0 && (
        <div className="flex gap-2 mb-6 flex-wrap">
          <button
            type="button"
            onClick={() => setCategorySlug('')}
            className={`px-3 py-1.5 rounded-full text-sm border ${categorySlug === '' ? 'text-white border-transparent' : 'text-gray-600 border-gray-300'}`}
            style={categorySlug === '' ? { backgroundColor: 'var(--color-primary)' } : {}}
          >
            Todos
          </button>
          {categories.map((c) => (
            <button
              type="button"
              key={c.id}
              onClick={() => setCategorySlug(c.slug)}
              className={`px-3 py-1.5 rounded-full text-sm border ${categorySlug === c.slug ? 'text-white border-transparent' : 'text-gray-600 border-gray-300'}`}
              style={categorySlug === c.slug ? { backgroundColor: 'var(--color-primary)' } : {}}
            >
              {c.name}
            </button>
          ))}
        </div>
      )}

      {loading ? (
        <p className="text-gray-500">Cargando productos…</p>
      ) : products.length === 0 ? (
        <p className="text-gray-500">No hay productos disponibles todavía.</p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {products.map((p) => (
            <Link
              key={p.id}
              to={`/producto/${p.slug}`}
              className="bg-white rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-shadow"
            >
              <div className="aspect-square bg-gray-100 flex items-center justify-center overflow-hidden">
                {p.images?.[0] ? (
                  <img src={fileUrl(p.images[0])} alt={p.name} className="h-full w-full object-cover" />
                ) : (
                  <span className="text-gray-300 text-sm">Sin imagen</span>
                )}
              </div>
              <div className="p-3">
                <p className="font-medium text-sm text-gray-800 truncate">{p.name}</p>
                <p className="font-semibold" style={{ color: 'var(--color-primary)' }}>{formatCurrency(p.price)}</p>
                {p.trackInventory && p.stock <= 0 && (
                  <p className="text-xs text-red-500 mt-1">Agotado</p>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
