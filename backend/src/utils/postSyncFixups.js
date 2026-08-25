const fs = require('fs');
const path = require('path');
// Conexión de administración: este archivo hace DDL (ALTER TABLE, políticas RLS, creación del rol
// restringido) y backfills que cruzan empresas — todo eso exige el rol dueño de las tablas, no el
// restringido que usa la app en tiempo real (ver models/adminModels.js).
const {
  sequelize, Company, CashBox,
  Contract, Employee, Expense, InventoryItem, Minute, PaymentReceipt, Policy,
  ProgressPhoto, Severance, SocialSecurityDocument, SocialSecurityProvider, ThirdParty,
} = require('../models/adminModels');
const { TENANT_SCOPING_EXCLUDED } = require('../models/defineModels');
const { runInTransactionContext } = require('../utils/tenantContext');
const { UPLOAD_ROOT } = require('../middleware/upload');
const { DEFAULT_SOCIAL_SECURITY_PROVIDERS } = require('../config/socialSecurityProviders');

// Mismo criterio que applyTenantScoping.js: algunos modelos excluidos del aislamiento (ej.
// SupportAccessLog) igual tienen una columna companyId como dato simple (a qué empresa se accedió),
// sin que la FILA esté scopeada a esa empresa — no deben backfillearse como si lo estuvieran ni
// llevar política RLS, o cualquier operador vería solo su propio "companyId" de referencia en vez
// del historial completo de todas las empresas.
function isTenantScopedModel(model) {
  return Boolean(model.rawAttributes.companyId) && !TENANT_SCOPING_EXCLUDED.includes(model.name);
}

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
    if (!isTenantScopedModel(model)) continue;
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

// Capa 2 del aislamiento multi-tenant (Row-Level Security): un respaldo a nivel de PostgreSQL,
// independiente del código de la aplicación (Capa 1, ver applyTenantScoping.js) — protege incluso
// si algún día un desarrollador agrega una consulta nueva y se olvida el filtro. Solo tiene efecto
// real para un rol de base de datos que NO sea dueño de las tablas (por defecto, PostgreSQL exime
// al dueño de sus propias políticas RLS, a propósito acá — así los scripts de migración/backfill
// de esta misma conexión de administración, que necesitan ver/tocar filas de cualquier empresa,
// siguen funcionando sin choques). Por eso el rol restringido de ensureAppDbRole() es la pieza que
// hace que esto sea protección real y no solo teoría.
const APP_DB_USER = process.env.APP_DB_USER || 'gestionproyectos_app';

async function ensureAppDbRole() {
  const password = process.env.APP_DB_PASSWORD;
  if (!password) {
    throw new Error('Falta APP_DB_PASSWORD: es la contraseña del rol restringido de base de datos que usa la app en tiempo real (Capa 2, RLS).');
  }

  const [[{ exists }]] = await sequelize.query(
    'SELECT EXISTS (SELECT FROM pg_roles WHERE rolname = :user) AS exists',
    { replacements: { user: APP_DB_USER } }
  );
  if (exists) {
    await sequelize.query(`ALTER ROLE "${APP_DB_USER}" WITH LOGIN PASSWORD :password`, { replacements: { password } });
  } else {
    await sequelize.query(`CREATE ROLE "${APP_DB_USER}" WITH LOGIN PASSWORD :password`, { replacements: { password } });
    console.log(`[postSyncFixups] Rol de base de datos "${APP_DB_USER}" creado (Capa 2, RLS).`);
  }

  const dbName = sequelize.getDatabaseName();
  await sequelize.query(`GRANT CONNECT ON DATABASE "${dbName}" TO "${APP_DB_USER}"`);
  await sequelize.query(`GRANT USAGE ON SCHEMA public TO "${APP_DB_USER}"`);
  await sequelize.query(`GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO "${APP_DB_USER}"`);
  // Red de seguridad de fondo: si por cualquier motivo (un cliente que aborta la petición a medio
  // camino, un bug futuro) una transacción se queda abierta sin que nadie mande más consultas ni la
  // cierre, Postgres la revierte solo pasado este tiempo, en vez de dejarla ocupando una conexión
  // del pool para siempre (visto en producción: middleware/auth.js#authenticate — ver el comentario
  // ahí — puede dejar una transacción "idle in transaction" colgada si el cliente corta la petición
  // en el momento exacto en que una consulta sigue en vuelo). 30s es de sobra para cualquier
  // operación real de la app (hasta la más pesada, exportar el catálogo completo de APU, responde
  // en menos de 1s), así que nunca debería interrumpir trabajo legítimo.
  await sequelize.query(`ALTER ROLE "${APP_DB_USER}" SET idle_in_transaction_session_timeout = '30s'`);
  // Para que las tablas que se creen en un sync() futuro (un modelo nuevo, en un despliegue
  // posterior) queden con estos mismos permisos sin tener que acordarse de correr este GRANT de
  // nuevo — aplica a lo que cree ESTA MISMA conexión (dueña), que es quien siempre corre sync().
  await sequelize.query(`ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO "${APP_DB_USER}"`);
}

// Política de aislamiento por tabla: USING controla qué filas se pueden ver/actualizar/borrar,
// WITH CHECK controla qué filas se pueden insertar/dejar tras un update — sin WITH CHECK, un
// UPDATE podría "mover" una fila a otra empresa aunque no pudiera verla después. NULLIF(...,'')
// sobre current_setting(..., true) (el true = no lanzar error si no está seteado) hace que, si el
// GUC no está seteado (cualquier código que no haya pasado por el contexto de empresa), la
// comparación sea contra NULL y por lo tanto nunca sea verdadera — sin GUC, cero filas visibles;
// nunca "todas las filas" por accidente. Sin FORCE ROW LEVEL SECURITY a propósito (ver comentario
// de más arriba): el rol dueño de las tablas (esta misma conexión) queda exento.
async function applyRowLevelSecurity() {
  for (const model of Object.values(sequelize.models)) {
    if (!isTenantScopedModel(model)) continue;
    const table = model.getTableName();
    await sequelize.query(`ALTER TABLE "${table}" ENABLE ROW LEVEL SECURITY`);
    await sequelize.query(`DROP POLICY IF EXISTS tenant_isolation ON "${table}"`);
    await sequelize.query(`
      CREATE POLICY tenant_isolation ON "${table}"
        USING ("companyId" = NULLIF(current_setting('app.current_company_id', true), '')::uuid)
        WITH CHECK ("companyId" = NULLIF(current_setting('app.current_company_id', true), '')::uuid)
    `);
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
    // No hace falta transacción/GUC acá: esta conexión (administración) no está sujeta a RLS, solo
    // necesita companyId en el contexto de JS para que el hook de la Capa 1 estampe la fila nueva.
    await runInTransactionContext(company.id, null, async () => {
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

  await backfillPurchaseOrderCashBox();

  // PurchaseOrderItem.name y ExpenseItem.description pasaron de STRING (VARCHAR 255) a TEXT: las
  // descripciones de dotación/EPP con tallas y medidas superan 255 caracteres y tumbaban el INSERT
  // en producción ("value too long for type character varying(255)"). sync({alter:true}) no
  // cambia el tipo de una columna existente (mismo problema conocido que con NOT NULL, ver arriba),
  // así que se ajusta a mano. ALTER COLUMN ... TYPE TEXT es un no-op seguro si ya es TEXT.
  await sequelize.query('ALTER TABLE "PurchaseOrderItems" ALTER COLUMN "name" TYPE TEXT;');
  await sequelize.query('ALTER TABLE "ExpenseItems" ALTER COLUMN "description" TYPE TEXT;');

  // PaymentReceipt.filePath pasó de obligatorio a opcional: ahora un registro también puede venir
  // de calcular la nómina (payrollService.js), que no parte de un archivo subido a mano. Mismo
  // problema conocido: sync({alter:true}) no relaja un NOT NULL existente por sí solo.
  await sequelize.query('ALTER TABLE "PaymentReceipts" ALTER COLUMN "filePath" DROP NOT NULL;');

  await seedSocialSecurityProvidersForExistingCompanies();

  await ensureAppDbRole();
  await applyRowLevelSecurity();
}

// SocialSecurityProvider (catálogo de EPS/pensión/ARL) se siembra con sus valores por defecto al
// crear una empresa nueva (companyProvisioningService.js), pero las empresas que ya existían antes
// de esta funcionalidad nunca pasaron por ahí — sin esto se quedarían con el selector vacío. Corre
// en cada arranque; findOrCreate por empresa hace que sea un no-op seguro una vez sembrado.
async function seedSocialSecurityProvidersForExistingCompanies() {
  const companies = await Company.findAll();
  for (const company of companies) {
    // eslint-disable-next-line no-await-in-loop
    await runInTransactionContext(company.id, null, async () => {
      for (const [type, names] of Object.entries(DEFAULT_SOCIAL_SECURITY_PROVIDERS)) {
        for (const name of names) {
          // eslint-disable-next-line no-await-in-loop
          await SocialSecurityProvider.findOrCreate({ where: { type, name } });
        }
      }
    });
  }
}

// Migración de "caja por ítem" a "caja por orden" (corrección del bug de diseño reportado: antes
// se elegía una caja distinta en cada recepción/traslado a gastos de una misma orden). Para cada
// orden que todavía no tiene cashBoxId: mira TODOS los gastos que ya generó en su historia (el de
// "Pasar a gastos" vía expenseId, y los de cada recepción parcial vía PurchaseReceipt.expenseId) y,
// si todos usaron la MISMA caja, se la asigna automáticamente. Si mezcló más de una caja entre sus
// ítems (o nunca generó ningún gasto todavía), queda en null: no se inventa una caja para una
// orden ambigua o nueva, alguien debe asignarla a mano (ver purchaseOrderController.updateOrder)
// antes de poder registrar más recepciones o trasladarla a gastos. Solo toca filas con cashBoxId
// NULL, así que es idempotente y seguro de correr en cada arranque.
async function backfillPurchaseOrderCashBox() {
  await sequelize.query(`
    WITH order_cashboxes AS (
      SELECT po.id AS order_id, e."cashBoxId" AS cash_box_id
      FROM "PurchaseOrders" po
      JOIN "Expenses" e ON e.id = po."expenseId"
      WHERE po."expenseId" IS NOT NULL
      UNION
      SELECT poi."purchaseOrderId" AS order_id, e."cashBoxId" AS cash_box_id
      FROM "PurchaseOrderItems" poi
      JOIN "PurchaseReceipts" pr ON pr."purchaseOrderItemId" = poi.id
      JOIN "Expenses" e ON e.id = pr."expenseId"
    ),
    distinct_counts AS (
      SELECT order_id, COUNT(DISTINCT cash_box_id) AS n, MIN(cash_box_id::text)::uuid AS only_cash_box_id
      FROM order_cashboxes
      GROUP BY order_id
    )
    UPDATE "PurchaseOrders" po
    SET "cashBoxId" = dc.only_cash_box_id
    FROM distinct_counts dc
    WHERE po.id = dc.order_id AND dc.n = 1 AND po."cashBoxId" IS NULL;
  `);
}

module.exports = { applyPostSyncFixups };
