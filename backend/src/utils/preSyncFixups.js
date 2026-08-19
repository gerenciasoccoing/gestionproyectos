// Conexión de administración: este archivo hace DDL (ALTER TABLE/TYPE), exige el rol dueño de las
// tablas (ver models/adminModels.js).
const { sequelize } = require('../models/adminModels');

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

  await dropRowLevelSecurityPolicies();
}

// sync({alter:true}) reintenta "re-tipar" columnas en cada arranque aunque el tipo no haya
// cambiado realmente (una particularidad conocida de Sequelize con columnas UUID) — y PostgreSQL
// no permite alterar el tipo de una columna de la que depende una política RLS, aunque el tipo
// resultante sea idéntico. Sin esto, la Capa 2 (RLS, ver postSyncFixups.js#applyRowLevelSecurity)
// rompería sync() en TODOS los arranques después del primero. Se quitan acá (antes de sync) y se
// vuelven a crear después (postSyncFixups.js) — recrear ~40 políticas en cada arranque es barato
// comparado con el resto de este archivo (ya recorre todo el esquema de por sí). DROP POLICY
// IF EXISTS + DISABLE es un no-op seguro si no hay nada que quitar (primer arranque).
async function dropRowLevelSecurityPolicies() {
  const policies = await sequelize.query(
    `SELECT tablename FROM pg_policies WHERE policyname = 'tenant_isolation'`,
    { type: sequelize.QueryTypes.SELECT }
  );
  for (const { tablename } of policies) {
    await sequelize.query(`DROP POLICY IF EXISTS tenant_isolation ON "${tablename}"`);
    await sequelize.query(`ALTER TABLE "${tablename}" DISABLE ROW LEVEL SECURITY`);
  }
}

module.exports = { applyPreSyncFixups };
