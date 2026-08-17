const sequelize = require('../config/database');

const modelDefiners = [
  require('./Tenant'),
  require('./User'),
  require('./Customer'),
  require('./Category'),
  require('./Product'),
  require('./InventoryMovement'),
  require('./Order'),
  require('./OrderItem'),
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
