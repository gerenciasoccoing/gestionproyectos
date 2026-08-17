const { sequelize, CashBox } = require('../models');

// sequelize.sync({ alter: true }) añade columnas nuevas de forma segura, pero no siempre
// relaja restricciones NOT NULL en columnas existentes (limitación conocida en Postgres).
// APUComponent.priceItemId pasó de obligatorio a opcional (los ítems de transporte pueden
// no referenciar un insumo de la base de precios), así que se ajusta aquí explícitamente.
// DROP NOT NULL sobre una columna que ya es nullable no falla (es un no-op), por lo que
// esto es seguro de ejecutar en cada arranque.
// PurchaseOrder.projectId pasó de obligatorio a opcional (una orden puede crearse desde la ficha
// de un proveedor sin proyecto asignado todavía) y se agregó orderNumber (consecutivo para el
// PDF). sync({alter:true}) añade la columna nueva pero no relaja el NOT NULL existente, así que
// se ajusta aquí; y las órdenes que ya existían quedan sin orderNumber tras el alter, así que se
// numeran una sola vez (solo toca filas con orderNumber NULL, por lo que es un no-op en arranques
// posteriores, una vez que toda fila nueva ya se crea con su número asignado por la aplicación).
async function applyPostSyncFixups() {
  await sequelize.query('ALTER TABLE "APUComponents" ALTER COLUMN "priceItemId" DROP NOT NULL;');
  await sequelize.query('ALTER TABLE "PurchaseOrders" ALTER COLUMN "projectId" DROP NOT NULL;');
  await sequelize.query(`
    UPDATE "PurchaseOrders" po
    SET "orderNumber" = sub.rn
    FROM (
      SELECT id, ROW_NUMBER() OVER (ORDER BY "createdAt" ASC) AS rn
      FROM "PurchaseOrders"
      WHERE "orderNumber" IS NULL
    ) sub
    WHERE po.id = sub.id;
  `);

  // Expense.projectId pasó de obligatorio a opcional (un gasto puede registrarse desde la vista
  // general sin proyecto) y se agregaron cashBoxId (obligatoria en la práctica) y supplierId
  // (opcional). Migración en orden: 1) relaja projectId, 2) asegura una "Caja general" para los
  // gastos que ya existían sin caja, 3) los backfillea, 4) recién ahí exige cashBoxId a nivel de
  // base de datos (antes del backfill fallaría por las filas existentes). El backfill solo toca
  // filas con cashBoxId NULL y el SET NOT NULL es un no-op si ya estaba así, por lo que es seguro
  // ejecutar esto en cada arranque.
  await sequelize.query('ALTER TABLE "Expenses" ALTER COLUMN "projectId" DROP NOT NULL;');
  const [defaultCashBox] = await CashBox.findOrCreate({
    where: { name: 'Caja general' },
    defaults: { initialBalance: 0, status: 'activa' },
  });
  await sequelize.query(
    'UPDATE "Expenses" SET "cashBoxId" = :cashBoxId WHERE "cashBoxId" IS NULL;',
    { replacements: { cashBoxId: defaultCashBox.id } }
  );
  await sequelize.query('ALTER TABLE "Expenses" ALTER COLUMN "cashBoxId" SET NOT NULL;');
}

module.exports = { applyPostSyncFixups };
