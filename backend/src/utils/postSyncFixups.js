const { sequelize } = require('../models');

// sequelize.sync({ alter: true }) añade columnas nuevas de forma segura, pero no siempre
// relaja restricciones NOT NULL en columnas existentes (limitación conocida en Postgres).
// APUComponent.priceItemId pasó de obligatorio a opcional (los ítems de transporte pueden
// no referenciar un insumo de la base de precios), así que se ajusta aquí explícitamente.
// DROP NOT NULL sobre una columna que ya es nullable no falla (es un no-op), por lo que
// esto es seguro de ejecutar en cada arranque.
async function applyPostSyncFixups() {
  await sequelize.query('ALTER TABLE "APUComponents" ALTER COLUMN "priceItemId" DROP NOT NULL;');
}

module.exports = { applyPostSyncFixups };
