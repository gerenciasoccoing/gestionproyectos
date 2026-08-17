import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { TenantProvider } from './context/TenantContext';
import { CartProvider } from './context/CartContext';
import { StaffAuthProvider } from './context/StaffAuthContext';
import ProtectedStaffRoute from './components/ProtectedStaffRoute';

import StoreLayout from './pages/store/StoreLayout';
import StoreHomePage from './pages/store/StoreHomePage';
import ProductDetailPage from './pages/store/ProductDetailPage';
import CartPage from './pages/store/CartPage';
import CheckoutPage from './pages/store/CheckoutPage';
import OrderStatusPage from './pages/store/OrderStatusPage';

import AdminLoginPage from './pages/admin/AdminLoginPage';
import AdminLayout from './pages/admin/AdminLayout';
import DashboardPage from './pages/admin/DashboardPage';
import ProductsPage from './pages/admin/ProductsPage';
import CategoriesPage from './pages/admin/CategoriesPage';
import InventoryPage from './pages/admin/InventoryPage';
import OrdersPage from './pages/admin/OrdersPage';
import SettingsPage from './pages/admin/SettingsPage';

import SuperAdminLoginPage from './pages/superadmin/SuperAdminLoginPage';
import SuperAdminLayout from './pages/superadmin/SuperAdminLayout';
import TenantsListPage from './pages/superadmin/TenantsListPage';
import NewTenantPage from './pages/superadmin/NewTenantPage';
import TenantDetailPage from './pages/superadmin/TenantDetailPage';

export default function App() {
  return (
    <BrowserRouter>
      <StaffAuthProvider>
        <Routes>
          {/* Tienda pública del tenant resuelto por dominio/subdominio */}
          <Route element={<TenantProvider><CartProvider><StoreLayout /></CartProvider></TenantProvider>}>
            <Route path="/" element={<StoreHomePage />} />
            <Route path="/producto/:slug" element={<ProductDetailPage />} />
            <Route path="/carrito" element={<CartPage />} />
            <Route path="/checkout" element={<CheckoutPage />} />
            <Route path="/pedido/:orderNumber" element={<OrderStatusPage />} />
          </Route>

          {/* Panel de administración del tenant */}
          <Route path="/admin/login" element={<AdminLoginPage />} />
          <Route
            path="/admin"
            element={(
              <ProtectedStaffRoute roles={['tenant_admin', 'tenant_operator']} loginPath="/admin/login">
                <AdminLayout />
              </ProtectedStaffRoute>
            )}
          >
            <Route index element={<DashboardPage />} />
            <Route path="productos" element={<ProductsPage />} />
            <Route path="categorias" element={<CategoriesPage />} />
            <Route path="inventario" element={<InventoryPage />} />
            <Route path="pedidos" element={<OrdersPage />} />
            <Route path="configuracion" element={<SettingsPage />} />
          </Route>

          {/* Panel super-admin (dueño de la plataforma) */}
          <Route path="/super-admin/login" element={<SuperAdminLoginPage />} />
          <Route
            path="/super-admin"
            element={(
              <ProtectedStaffRoute roles={['super_admin']} loginPath="/super-admin/login">
                <SuperAdminLayout />
              </ProtectedStaffRoute>
            )}
          >
            <Route index element={<TenantsListPage />} />
            <Route path="nuevo" element={<NewTenantPage />} />
            <Route path="tenants/:id" element={<TenantDetailPage />} />
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </StaffAuthProvider>
    </BrowserRouter>
  );
}
