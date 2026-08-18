const { sequelize } = require('../models');

// Ajustes que deben correr ANTES de sequelize.sync(), porque sync() decide si crear una tabla
// nueva mirando si ya existe una con el nombre que espera el modelo actual — si renombráramos
// DESPUÉS de sync (como hace postSyncFixups.js con columnas), sync ya habría creado una
// "Companies" vacía y los datos reales de la vieja "CompanySettings" quedarían huérfanos.
//
// Seguro de correr en cada arranque: cada paso primero comprueba en information_schema si ya se
// aplicó, así que en arranques posteriores (la tabla ya se llama "Companies") no hace nada.
async function applyPreSyncFixups() {
  const [[{ exists: oldExists }]] = await sequelize.query(
    `SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'CompanySettings') AS exists`
  );
  const [[{ exists: newExists }]] = await sequelize.query(
    `SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'Companies') AS exists`
  );
  if (oldExists && !newExists) {
    await sequelize.query('ALTER TABLE "CompanySettings" RENAME TO "Companies"');
    console.log('[preSyncFixups] Tabla "CompanySettings" renombrada a "Companies" (migración multi-tenant).');
  }

  // El tipo ENUM de Postgres para "currency" quedó con el nombre viejo (Postgres los nombra
  // enum_<tabla>_<columna>) — sync() intentará crear uno nuevo "enum_Companies_currency" y
  // castear la columna a ese tipo, lo cual falla porque Postgres no permite convertir entre dos
  // ENUM distintos aunque tengan los mismos valores. Se renombra el tipo también, así sync() lo
  // encuentra ya con el nombre que espera y no intenta crear uno nuevo.
  const [[{ exists: oldEnumExists }]] = await sequelize.query(
    `SELECT EXISTS (SELECT FROM pg_type WHERE typname = 'enum_CompanySettings_currency') AS exists`
  );
  if (oldEnumExists) {
    await sequelize.query('ALTER TYPE "enum_CompanySettings_currency" RENAME TO "enum_Companies_currency"');
    console.log('[preSyncFixups] Tipo enum_CompanySettings_currency renombrado a enum_Companies_currency.');
  }
}

module.exports = { applyPreSyncFixups };
