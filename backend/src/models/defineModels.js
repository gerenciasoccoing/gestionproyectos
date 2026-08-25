const { applyTenantScoping } = require('../utils/applyTenantScoping');

const modelDefiners = [
  require('./Company'),
  require('./PlatformAdmin'),
  require('./SupportAccessLog'),
  require('./CompanyRegistrationRequest'),
  require('./PasswordResetToken'),
  require('./User'),
  require('./Role'),
  require('./Permission'),
  require('./RolePermission'),
  require('./UserRole'),
  require('./ProjectUser'),
  require('./Consortium'),
  require('./Project'),
  require('./Contract'),
  require('./Policy'),
  require('./Minute'),
  require('./Milestone'),
  require('./PriceItem'),
  require('./PriceHistory'),
  require('./APU'),
  require('./APUComponent'),
  require('./Quotation'),
  require('./Budget'),
  require('./BudgetItem'),
  require('./ProgressEntry'),
  require('./ProgressPhoto'),
  require('./PurchaseOrder'),
  require('./PurchaseOrderItem'),
  require('./PurchaseReceipt'),
  require('./Employee'),
  require('./EmployeeContractDocument'),
  require('./SocialSecurityDocument'),
  require('./SocialSecurityProvider'),
  require('./PaymentReceipt'),
  require('./LaborParameters'),
  require('./Severance'),
  require('./Expense'),
  require('./ExpenseItem'),
  require('./ExpenseTax'),
  require('./ExpenseBudget'),
  require('./Risk'),
  require('./ThirdParty'),
  require('./PriceListImport'),
  require('./APUPriceHistory'),
  require('./InventoryItem'),
  require('./InventoryCheckout'),
  require('./InventoryCheckoutItem'),
  require('./InventoryCheckin'),
  require('./InventoryConfirmation'),
  require('./CashBox'),
  require('./CashBoxMovement'),
];

// Company (la tabla de empresas en sí), Permission (catálogo global fijo de permisos, no datos de
// una empresa), PlatformAdmin (cuentas de operador, no pertenecen a ninguna empresa) y
// SupportAccessLog (auditoría de plataforma, se escribe desde fuera de cualquier contexto de
// empresa) quedan explícitamente afuera del aislamiento multi-tenant — ni los hooks de la Capa 1
// (applyTenantScoping) ni las políticas RLS de la Capa 2 (ver postSyncFixups.js) se les aplican.
const TENANT_SCOPING_EXCLUDED = [
  'Company', 'Permission', 'PlatformAdmin', 'SupportAccessLog',
  'CompanyRegistrationRequest', 'PasswordResetToken',
];

// Fábrica reutilizable: models/index.js la llama con la conexión restringida (atiende peticiones
// HTTP, con Row-Level Security activa) y models/adminModels.js con la conexión dueña (sync/DDL/
// migraciones, exenta de RLS). Mismas definiciones de modelo en los dos casos — nunca hay que
// mantener dos copias del esquema.
function defineModels(sequelize) {
  const models = {};
  modelDefiners.forEach((define) => {
    const model = define(sequelize);
    models[model.name] = model;
  });

  Object.values(models).forEach((model) => {
    if (model.associate) model.associate(models);
  });

  Object.entries(models).forEach(([name, model]) => {
    if (!TENANT_SCOPING_EXCLUDED.includes(name)) applyTenantScoping(model);
  });

  return models;
}

module.exports = { defineModels, TENANT_SCOPING_EXCLUDED };
