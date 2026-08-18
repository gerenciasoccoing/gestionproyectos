const fs = require('fs');
const path = require('path');
const {
  sequelize, Company, CashBox,
  Contract, Employee, Expense, InventoryItem, Minute, PaymentReceipt, Policy,
  ProgressPhoto, Severance, SocialSecurityDocument, ThirdParty,
} = require('../models');
const { runWithCompany } = require('../utils/tenantContext');
const { UPLOAD_ROOT } = require('../middleware/upload');

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

// Backfillea companyId en TODAS las tablas de negocio hacia la primera empresa existente (en una
// instalación ya migrada, esa es SOCCOING S.A.S.) y luego bloquea la columna con NOT NULL. Recorre
// sequelize.models en vez de una lista de tablas a mano, así que cubre automáticamente cualquier
// modelo nuevo que se agregue más adelante sin tener que acordarse de tocar este archivo.
// En una instalación recién creada (sin ninguna empresa todavía, ej. antes de correr seed.js por
// primera vez) no hay nada que backfillear: todas las tablas están vacías, así que SET NOT NULL
// es seguro igual (no hay filas que puedan violarlo).
async function backfillTenantColumns() {
  const company = await Company.findOne({ order: [['createdAt', 'ASC']] });

  for (const model of Object.values(sequelize.models)) {
    if (!model.rawAttributes.companyId) continue; // Company y Permission quedan afuera
    const table = model.getTableName();
    if (company) {
      await sequelize.query(
        `UPDATE "${table}" SET "companyId" = :companyId WHERE "companyId" IS NULL`,
        { replacements: { companyId: company.id } }
      );
    }
    await sequelize.query(`ALTER TABLE "${table}" ALTER COLUMN "companyId" SET NOT NULL`);
  }

  return company;
}

// sync({alter:true}) tiene un problema conocido con `unique: true` puesto directo en una columna
// (a diferencia de un `indexes: [...]` con nombre explícito, que si se detecta bien entre
// reinicios): en cada arranque, si no reconoce la restricción existente como "la misma", agrega
// OTRA restricción UNIQUE nueva en vez de dejar la que ya había — llevaba así, acumulando, desde
// mucho antes de esta migración (67 duplicadas en Roles.name, 68 en Users.email, etc., una por
// cada reinicio del servidor a lo largo de la vida del proyecto). No afecta la integridad de los
// datos (la primera restricción ya garantizaba la unicidad, las demás eran puro peso extra en
// cada INSERT/UPDATE), pero vale la pena dejarlo limpio ya que se está tocando esta misma zona del
// esquema. Idempotente: agrupa por tabla+columnas, y si hay más de una restricción para el mismo
// grupo, deja la primera y borra el resto.
// La unicidad de Roles.name e InventoryItems.code cambió de significado con esta migración: antes
// era global (una sola restricción por columna), ahora es por empresa (companyId + name/code, ver
// Role.js/InventoryItem.js). Las restricciones viejas de una sola columna no se pueden dejar
// NINGUNA — a diferencia de las duplicadas de abajo, donde sí conviene dejar una — porque
// impedirían que dos empresas usen el mismo nombre de rol o código de equipo.
async function dropStaleGlobalUniqueConstraints() {
  const stale = await sequelize.query(`
    SELECT conrelid::regclass::text AS table_name, conname
    FROM pg_constraint c
    JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY(c.conkey)
    WHERE c.contype = 'u' AND cardinality(c.conkey) = 1
      AND ((c.conrelid::regclass::text = '"Roles"' AND a.attname = 'name')
        OR (c.conrelid::regclass::text = '"InventoryItems"' AND a.attname = 'code'))
  `, { type: sequelize.QueryTypes.SELECT });

  for (const { table_name: tableName, conname } of stale) {
    await sequelize.query(`ALTER TABLE ${tableName} DROP CONSTRAINT "${conname}"`);
  }
}

async function dropDuplicateUniqueConstraints() {
  await dropStaleGlobalUniqueConstraints();

  const duplicates = await sequelize.query(`
    SELECT conrelid::regclass::text AS table_name, array_agg(conname::text ORDER BY conname) AS names
    FROM pg_constraint
    WHERE contype = 'u' AND connamespace = 'public'::regnamespace
    GROUP BY conrelid, conkey
    HAVING count(*) > 1
  `, { type: sequelize.QueryTypes.SELECT });

  for (const { table_name: tableName, names } of duplicates) {
    for (const name of names.slice(1)) {
      // eslint-disable-next-line no-await-in-loop
      await sequelize.query(`ALTER TABLE ${tableName} DROP CONSTRAINT "${name}"`);
    }
  }
}

// Namespacing de archivos por empresa (gap señalado en el diseño multi-tenant, endurecido acá):
// hasta ahora todo se guardaba en uploads/{subfolder}/... sin distinguir empresa, así que en
// teoría (adivinando el nombre exacto de un archivo, 64 bits al azar) un usuario de otra empresa
// podía llegar a un archivo ajeno vía /api/files/. middleware/upload.js ya guarda los archivos
// NUEVOS bajo uploads/{companyId}/{subfolder}/... — esto migra los que ya existían de instalaciones
// previas a esa migración, moviéndolos a la carpeta de la primera empresa (que es a quien
// pertenecen: no existía ninguna otra empresa todavía cuando se subieron) y reescribiendo la ruta
// relativa guardada en cada tabla que la referencia. Idempotente: el rename de carpeta es un no-op
// si el destino ya existe (ya migrado), y el UPDATE de cada columna solo toca valores que todavía
// no empiezan con "{companyId}/".
const LEGACY_UPLOAD_SUBFOLDERS = [
  'contracts', 'employee-contracts', 'social-security', 'payment-receipts', 'paz-y-salvo',
  'progress-photos', 'third-parties', 'inventory', 'company', 'policies', 'minutes', 'expenses',
];

const UPLOAD_PATH_COLUMNS = [
  [Contract, 'filePath'],
  [Employee, 'contractFilePath'],
  [Expense, 'supportFilePath'],
  [Expense, 'paymentReceiptFilePath'],
  [InventoryItem, 'photoPath'],
  [Minute, 'filePath'],
  [PaymentReceipt, 'filePath'],
  [Policy, 'filePath'],
  [ProgressPhoto, 'filePath'],
  [Severance, 'pazYSalvoFilePath'],
  [SocialSecurityDocument, 'filePath'],
  [ThirdParty, 'rutFilePath'],
  [ThirdParty, 'bankCertificationFilePath'],
  [Company, 'logoPath'],
];

async function migrateUploadsToCompanyFolders(companyId) {
  if (!companyId) return;

  const companyDir = path.join(UPLOAD_ROOT, companyId);
  for (const subfolder of LEGACY_UPLOAD_SUBFOLDERS) {
    const oldDir = path.join(UPLOAD_ROOT, subfolder);
    const newDir = path.join(companyDir, subfolder);
    if (fs.existsSync(oldDir) && !fs.existsSync(newDir)) {
      fs.mkdirSync(companyDir, { recursive: true });
      fs.renameSync(oldDir, newDir);
    }
  }

  for (const [model, column] of UPLOAD_PATH_COLUMNS) {
    const table = model.getTableName();
    await sequelize.query(
      `UPDATE "${table}" SET "${column}" = :prefix || "${column}"
       WHERE "${column}" IS NOT NULL AND "${column}" NOT LIKE :prefixLike`,
      { replacements: { prefix: `${companyId}/`, prefixLike: `${companyId}/%` } }
    );
  }
}

async function applyPostSyncFixups() {
  await dropDuplicateUniqueConstraints();

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

  // Migración multi-tenant: companyId en cada tabla de negocio, backfilleado hacia la primera
  // empresa existente (ver backfillTenantColumns). Debe correr ANTES de crear la "Caja general"
  // de abajo, porque CashBox ya está protegida por los hooks de aislamiento y necesita un
  // companyId de contexto para poder crearse.
  const company = await backfillTenantColumns();
  await migrateUploadsToCompanyFolders(company?.id);

  if (company) {
    await runWithCompany(company.id, async () => {
      const [defaultCashBox] = await CashBox.findOrCreate({
        where: { name: 'Caja general' },
        defaults: { initialBalance: 0, status: 'activa' },
      });
      await sequelize.query(
        'UPDATE "Expenses" SET "cashBoxId" = :cashBoxId WHERE "cashBoxId" IS NULL;',
        { replacements: { cashBoxId: defaultCashBox.id } }
      );
    });
  }
  await sequelize.query('ALTER TABLE "Expenses" ALTER COLUMN "cashBoxId" SET NOT NULL;');
}

module.exports = { applyPostSyncFixups };
