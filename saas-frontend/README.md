# Plataforma SaaS Multi-Tenant de E-commerce — Frontend

SPA en React que sirve tres áreas independientes, todas en esta misma app pero con layouts y
autenticación separados:

- **Tienda pública** (`/`, `/producto/:slug`, `/carrito`, `/checkout`, `/pedido/:orderNumber`):
  el tenant se resuelve por el dominio/subdominio real de la request (en local, por el header
  `X-Tenant-Subdomain` que el cliente API agrega automáticamente, ver `.env.development`). El
  branding (logo, colores) se aplica en tiempo real como variables CSS (`--color-primary`,
  `--color-secondary`) leídas de `GET /api/store/tenant`.
- **Panel de tienda** (`/admin/*`): login de `tenant_admin` / `tenant_operator`, productos,
  categorías, inventario (ajustes + historial + alertas de stock bajo), pedidos, configuración
  (marca, envío, credenciales de Wompi — solo `tenant_admin`).
- **Panel de plataforma** (`/super-admin/*`): login del dueño de la plataforma, alta de tenants
  nuevos (con su primer usuario `tenant_admin`), listado, suspender/reactivar, dominio propio.

## Cómo correrlo en local

```bash
cd saas-frontend
npm install
npm run dev
```

Requiere el backend (`../saas-backend`) corriendo y con el seed ejecutado (`npm run seed`),
que crea el tenant de prueba `demo` referenciado en `.env.development`.

## Notas de arquitectura

- `src/context/TenantContext.jsx`: resuelve la tienda pública y aplica su marca.
- `src/context/StaffAuthContext.jsx`: sesión compartida por los paneles de tenant y
  super-admin (el rol del JWT decide a cuál puede entrar cada usuario, ver
  `src/components/ProtectedStaffRoute.jsx`).
- `src/context/CartContext.jsx`: carrito en `localStorage`, aislado por tenant de forma natural
  porque cada tenant sirve su tienda desde su propio dominio/subdominio en producción.
