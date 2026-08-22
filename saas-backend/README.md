# Plataforma SaaS Multi-Tenant de E-commerce — Backend

API multi-tenant para la plataforma de e-commerce + inventario + gastos + facturación
electrónica descrita en la especificación del producto. Es una aplicación **independiente**
del sistema de gestión de proyectos de construcción que vive en `../backend` — no comparte base
de datos ni código con él.

Alcance implementado en esta primera entrega (Fases 1 y 2 de la hoja de ruta):

- **Núcleo multi-tenant**: tabla `Tenants` raíz, todas las demás tablas llevan `tenantId`,
  middleware único de resolución de tenant por dominio propio / subdominio / header de
  desarrollo (`src/middleware/tenantResolution.js`), y todo query de negocio queda scoped por
  `req.tenant.id` o `req.staff.tenantId`.
- **E-commerce básico**: catálogo (categorías/productos con imágenes), carrito (en el
  frontend), checkout con validación de precios/stock en servidor, pasarela de pago Wompi vía
  Web Checkout, webhook firmado que confirma el pago.
- **Inventario**: stock por producto, descuento automático al confirmarse el pago, entradas/
  ajustes manuales, historial de movimientos, alertas de stock bajo.
- **Roles**: `super_admin` (dueño de la plataforma, sin tenant), `tenant_admin` (configura
  tienda, marca, envío, credenciales de pago), `tenant_operator` (pedidos/inventario, sin
  acceso a configuración sensible).
- **White-label**: logo y colores por tenant, aplicados como variables CSS en el storefront.

Pendiente para fases posteriores (ver la especificación completa): módulo de Gastos,
facturación electrónica ante la DIAN vía Proveedor Tecnológico (`InvoiceProvider` +
adaptadores), notas crédito/débito, dominios propios en producción y planes de suscripción SaaS.

## Stack

Node.js + Express + Sequelize + PostgreSQL, JWT, `multer` para imágenes/logos. Mismas
convenciones que `../backend` para que ambos proyectos sean fáciles de mantener en paralelo.

## Arquitectura multi-tenant

- **Resolución de tenant** (`src/middleware/tenantResolution.js`): dominio propio
  (`Tenant.customDomain`) → subdominio bajo `BASE_DOMAIN` → (solo fuera de producción) header
  `X-Tenant-Subdomain` o `?tenant=`, para poder probar varios tenants en local sin DNS real.
- **Rutas de tienda pública** (`/api/store/*`) y **login de panel de tienda**
  (`/api/tenant-auth/login`) resuelven el tenant así. **Rutas de panel protegidas**
  (`/api/tenant/*`) ya no necesitan volver a resolverlo: usan el `tenantId` que quedó grabado
  en el JWT al iniciar sesión.
- **Credenciales sensibles** (llaves de Wompi) se cifran en reposo con AES-256-GCM
  (`src/utils/crypto.js`, clave en `ENCRYPTION_KEY`) y nunca se devuelven en texto plano por la API.
- **Pasarela de pago** desacoplada detrás de `PaymentProvider` (`src/payments/`): agregar
  ePayco/PayU en el futuro es escribir un adaptador nuevo sin tocar checkout ni el webhook.

## Requisitos

- Node.js 18+
- PostgreSQL 14+

## Cómo correrlo en local

```bash
cd saas-backend
cp .env.example .env
# Generar ENCRYPTION_KEY (32 bytes hex):
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
# pegar el resultado en ENCRYPTION_KEY dentro de .env

npm install
createdb saas_ecommerce   # o: psql -c "CREATE DATABASE saas_ecommerce;"
npm run seed              # crea super-admin + tenant "demo" con productos de muestra
npm run dev                # o: npm start
```

El seed imprime las credenciales creadas. Por defecto:

- Super-admin: `superadmin@tuapp.com` / `changeme123` (login en `/api/auth/login`, sin tenant)
- Tenant demo, subdominio `demo`:
  - Admin: `admin@demo.com` / `demo1234`
  - Operador: `operador@demo.com` / `demo1234`
  - (login de ambos en `/api/tenant-auth/login`, requiere resolver el tenant `demo` primero)

En local, como no hay subdominios reales, todas las rutas de tienda/login de tenant aceptan el
header `X-Tenant-Subdomain: demo` (o `?tenant=demo`) para simular `demo.tuapp.com`. El frontend
ya lo hace automáticamente en modo desarrollo (ver `saas-frontend/.env.development`).

## Probar el pago con Wompi (sandbox)

1. Como `tenant_admin`, configura en `PUT /api/tenant/settings/payment` la llave pública y los
   tres secretos de una cuenta sandbox de Wompi (https://comercios.wompi.co).
2. El checkout (`POST /api/store/checkout`) devuelve `payment.redirectUrl` hacia el Web
   Checkout de Wompi con la referencia y la firma de integridad ya calculadas.
3. Wompi notifica el resultado al webhook `POST /api/webhooks/wompi/:tenantSubdomain`
   (configúralo en el dashboard de Wompi apuntando a esa URL pública). El webhook valida la
   firma con el secreto de eventos, marca el pedido como pagado/rechazado y — si fue aprobado —
   descuenta el inventario automáticamente (`src/services/inventoryService.js`, idempotente).

## Estructura

```
src/
  config/       Conexión a la base de datos
  models/       Tenant, User, Customer, Category, Product, InventoryMovement, Order, OrderItem
  middleware/   Resolución de tenant, autenticación (staff y cliente), subida de archivos
  payments/     Contrato PaymentProvider + adaptador WompiProvider
  services/     Lógica de inventario compartida entre venta y ajuste manual
  controllers/  Un controlador por recurso
  routes/       Rutas públicas de tienda, panel de tenant, super-admin, webhooks
```
