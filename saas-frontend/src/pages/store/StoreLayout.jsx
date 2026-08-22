import { Link, Outlet } from 'react-router-dom';
import { useTenant } from '../../context/TenantContext';
import { useCart } from '../../context/CartContext';

export default function StoreLayout() {
  const { tenant, loading, error } = useTenant();
  const { totalQuantity } = useCart();

  if (loading) return <div className="flex h-screen items-center justify-center text-gray-500">Cargando tienda…</div>;
  if (error || !tenant) {
    return (
      <div className="flex h-screen items-center justify-center text-center px-4">
        <div>
          <p className="text-xl font-semibold text-gray-800">Tienda no encontrada</p>
          <p className="text-gray-500 mt-2">{error || 'Verifica el dominio o subdominio de la tienda.'}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      <header className="sticky top-0 z-10 bg-white shadow-sm">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2 font-bold text-lg" style={{ color: 'var(--color-secondary)' }}>
            {tenant.logoUrl && <img src={tenant.logoUrl} alt={tenant.name} className="h-8 w-8 rounded object-cover" />}
            {tenant.name}
          </Link>
          <Link
            to="/carrito"
            className="relative rounded-full px-4 py-2 text-white text-sm font-medium"
            style={{ backgroundColor: 'var(--color-primary)' }}
          >
            Carrito
            {totalQuantity > 0 && (
              <span className="absolute -top-2 -right-2 bg-white text-xs font-bold rounded-full h-5 w-5 flex items-center justify-center border" style={{ color: 'var(--color-primary)' }}>
                {totalQuantity}
              </span>
            )}
          </Link>
        </div>
      </header>
      <main className="flex-1 max-w-6xl mx-auto w-full px-4 py-6">
        <Outlet />
      </main>
      <footer className="text-center text-xs text-gray-400 py-6">
        {tenant.name} · Tienda en línea
      </footer>
    </div>
  );
}
