const sequelize = require('../config/database');
const { defineModels } = require('./defineModels');

// Conexión restringida: la que usa toda la aplicación en tiempo real (todos los controladores,
// servicios, middlewares). El rol de base de datos detrás de config/database.js NO es dueño de las
// tablas (ver ensureAppDbRole en postSyncFixups.js), así que las políticas de Row-Level Security sí
// se le aplican — esta es la conexión protegida por la Capa 2 del aislamiento multi-tenant.
const models = defineModels(sequelize);

module.exports = { sequelize, ...models };
