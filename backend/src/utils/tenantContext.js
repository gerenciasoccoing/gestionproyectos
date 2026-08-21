const { AsyncLocalStorage } = require('async_hooks');

// Lleva el companyId (y, desde la Capa 2 de RLS, la transacción activa) del usuario autenticado
// durante toda la duración de una petición HTTP, sin tener que pasarlos a mano por cada
// función/controlador. Todo lo que corra "dentro" (controladores, servicios, hooks de Sequelize)
// puede leer getCurrentCompanyId()/getCurrentTransaction() en cualquier punto de esa misma cadena
// de ejecución asíncrona.
const storage = new AsyncLocalStorage();

// Uso normal (scripts, seed.js, alta de empresa desde el panel de super-admin, backfills): no hay
// transacción ambiente todavía, así que abre una propia de corta vida en la conexión restringida
// (models/index.js) — necesaria para que la Capa 2 (RLS) tenga el GUC app.current_company_id
// seteado en la MISMA conexión/transacción que usan las consultas de adentro — y hace commit/
// rollback automáticamente al terminar fn. Si YA hay una transacción ambiente (ver
// runInTransactionContext, usado por middleware/auth.js para envolver toda una petición HTTP), la
// reusa en vez de abrir una nueva — evita transacciones anidadas.
async function runWithCompany(companyId, fn) {
  const existing = storage.getStore();
  if (existing?.transaction) {
    return storage.run({ ...existing, companyId }, fn);
  }
  const { sequelize } = require('../models');
  return sequelize.transaction(async (t) => {
    await sequelize.query(
      "SELECT set_config('app.current_company_id', :companyId, true)",
      { transaction: t, replacements: { companyId } }
    );
    return storage.run({ companyId, transaction: t }, fn);
  });
}

// Variante de bajo nivel para middleware/auth.js: ahí la transacción de la petición ya viene
// abierta y comprometida/revertida según el ciclo de vida real de la respuesta HTTP (res.on
// 'finish'/'close'), no según cuándo se resuelve la función que arma req.user — por eso no puede
// usar el sequelize.transaction() manejado de runWithCompany (que haría commit apenas terminara esa
// función, mucho antes de que la petición realmente termine).
function runInTransactionContext(companyId, transaction, fn) {
  return storage.run({ companyId, transaction }, fn);
}

function getCurrentCompanyId() {
  return storage.getStore()?.companyId || null;
}

function getCurrentTransaction() {
  return storage.getStore()?.transaction || null;
}

// Para middleware que envuelve operaciones que pueden "escapar" del contexto async activo (ver
// middleware/upload.js): captura el store actual (companyId + transacción) ANTES de la operación
// y lo reinstala después con runWithStore, sin importar en qué contexto haya terminado esa
// operación. Reinstala el MISMO objeto (misma transacción/conexión con el GUC de RLS ya seteado),
// a diferencia de volver a abrir un contexto nuevo con solo el companyId.
function getCurrentStore() {
  return storage.getStore() || null;
}

function runWithStore(store, fn) {
  if (!store) return fn();
  return storage.run(store, fn);
}

module.exports = {
  runWithCompany,
  runInTransactionContext,
  getCurrentCompanyId,
  getCurrentTransaction,
  getCurrentStore,
  runWithStore,
};
