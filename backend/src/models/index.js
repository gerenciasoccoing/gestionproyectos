const sequelize = require('../config/database');

const modelDefiners = [
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
  require('./CompanySettings'),
  require('./ThirdParty'),
  require('./PriceListImport'),
  require('./APUPriceHistory'),
  require('./InventoryItem'),
  require('./InventoryCheckout'),
  require('./InventoryCheckoutItem'),
  require('./InventoryCheckin'),
];

const models = {};
modelDefiners.forEach((define) => {
  const model = define(sequelize);
  models[model.name] = model;
});

Object.values(models).forEach((model) => {
  if (model.associate) model.associate(models);
});

module.exports = { sequelize, ...models };
