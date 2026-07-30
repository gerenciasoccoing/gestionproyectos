# Gestión de Proyectos de Construcción

Aplicación web de gestión de proyectos con control de acceso (RBAC) para una empresa de
construcción/ejecución de obras: sección contractual, ejecución (actas, avance por ítem,
órdenes de compra, dashboard), personal (seguridad social y liquidación de prestaciones
sociales), gastos, informes (EVM, curva S, riesgos) y cotizaciones (base de precios global,
APU, presupuestos, PDF de propuesta y conversión a proyecto).

## Stack

- **Backend**: Node.js + Express + Sequelize + PostgreSQL, autenticación JWT, `multer` para
  archivos, `pdfkit` para PDFs.
- **Frontend**: React + Vite + React Router + Tailwind CSS + Recharts.

El diseño de datos completo está documentado en [`docs/DATA_MODEL.md`](docs/DATA_MODEL.md).

## Estructura del repositorio

```
backend/    API REST (modelos, controladores, rutas, servicios de negocio)
frontend/   SPA en React
docs/       Diseño de modelo de datos
```

## Requisitos

- Node.js 18+
- PostgreSQL 14+ corriendo localmente (o accesible por red)

## 1. Backend

```bash
cd backend
cp .env.example .env    # ajustar DATABASE_URL, JWT_SECRET, CORS_ORIGIN si es necesario
npm install

# crear la base de datos (una sola vez)
createdb gestionproyectos   # o: psql -c "CREATE DATABASE gestionproyectos;"

# sembrar catálogo de permisos/roles, usuario admin, parámetros laborales y config. de empresa
npm run seed

npm run dev   # o: npm start
```

El seed crea (personalizable con variables de entorno `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD`):

- Usuario administrador: `admin@empresa.com` / `Admin123!`
- Roles: `admin`, `gerente_proyecto`, `residente_obra`, `financiero`, `comercial`
- Parámetros laborales de referencia (SMLV, %, topes) — **ajustar según la normativa vigente**
  desde Administración → Parámetros Laborales.

La API queda disponible en `http://localhost:4000/api`. Los archivos subidos se guardan en
`backend/uploads/` y se sirven de forma autenticada en `/api/files/*`.

## 2. Frontend

```bash
cd frontend
npm install
npm run dev
```

La SPA queda disponible en `http://localhost:5173`. La variable `VITE_API_URL` en
`.env.development` apunta por defecto a `http://localhost:4000/api`.

## Flujo sugerido para probar la aplicación

1. Ingresar con el usuario admin.
2. **Base de Precios**: crear insumos (material, mano de obra, equipo).
3. **APU**: crear un análisis de precio unitario referenciando insumos de la base de precios,
   con su AIU.
4. **Cotizaciones**: crear una cotización, agregar ítems basados en APU, generar el PDF de
   propuesta y "Convertir a proyecto" (crea el proyecto y asigna el mismo presupuesto como
   línea base, de forma atómica).
5. Dentro del proyecto:
   - **Contractual**: registrar contrato y pólizas.
   - **Ejecución → Avance por ítem**: registrar avances con fotos por cada ítem del
     presupuesto; **Órdenes de Compra**: crear orden, registrar recepciones (parciales o
     totales) — el gasto en "Materiales" se genera automáticamente — y cerrar la orden
     (normal o con faltantes justificados); **Dashboard**: ver % de avance, valor ejecutado
     y gasto acumulado, actualizado automáticamente.
   - **Personal**: agregar empleados, adjuntar seguridad social y comprobantes de pago; al
     retirar a alguien, previsualizar y confirmar la liquidación (desglose auditable).
   - **Gastos**: fijar presupuesto por categoría y ver el consolidado presupuesto/gasto/saldo.
   - **Informes**: EVM, curva S, hitos/actas, riesgos, avance por ítem con fotos, exportar PDF.
6. **Administración**: gestionar usuarios (asignación a proyectos), roles y permisos por
   módulo/acción, parámetros laborales y datos de la empresa (logo para el PDF de cotización).

## Notas de diseño

- El control de acceso se valida tanto en la UI (se ocultan acciones sin permiso) como en el
  backend (middleware `requirePermission` / `requireProjectAccess`), que es la única barrera
  real de seguridad.
- La conversión de cotización→proyecto y el registro de recepción→gasto son operaciones
  atómicas (transacciones de Sequelize).
- Las fórmulas de liquidación (cesantías, intereses, prima, vacaciones, indemnización) usan
  los `LaborParameters` vigentes a la fecha de retiro y quedan parametrizadas para poder
  crear nuevas versiones cuando cambie la normativa (ver `backend/src/services/severanceService.js`).
