const { sequelize } = require('../models');

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
}

module.exports = { applyPostSyncFixups };
