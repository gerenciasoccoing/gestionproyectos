const sequelize = require('../config/database');
const { applyTenantScoping } = require('../utils/applyTenantScoping');

const modelDefiners = [
  require('./Company'),
  require('./PlatformAdmin'),
  require('./User'),
  require('./Role'),
  require('./Permission'),
  require('./RolePermission'),
  require('./UserRole'),
  require('./ProjectUser'),
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
  require('./SocialSecurityDocument'),
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

const models = {};
modelDefiners.forEach((define) => {
  const model = define(sequelize);
  models[model.name] = model;
});

Object.values(models).forEach((model) => {
  if (model.associate) model.associate(models);
});

// Aislamiento multi-tenant: todos los modelos de negocio quedan protegidos por los hooks de
// applyTenantScoping.js. Company (la tabla de empresas en sí), Permission (catálogo global fijo
// de permisos, no datos de una empresa) y PlatformAdmin (cuentas de operador, no pertenecen a
// ninguna empresa) quedan explícitamente afuera.
const TENANT_SCOPING_EXCLUDED = ['Company', 'Permission', 'PlatformAdmin'];
Object.entries(models).forEach(([name, model]) => {
  if (!TENANT_SCOPING_EXCLUDED.includes(name)) applyTenantScoping(model);
});

module.exports = { sequelize, ...models };
