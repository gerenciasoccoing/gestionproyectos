const sequelize = require('../config/adminDatabase');
const { defineModels } = require('./defineModels');

// Conexión de administración: dueña de las tablas, exenta de Row-Level Security. Solo para
// arranque (sync/DDL/migraciones, ver server.js) y scripts de mantenimiento (seed.js,
// createPlatformAdmin.js) — nunca para atender una petición HTTP real, eso es models/index.js.
const models = defineModels(sequelize);

module.exports = { sequelize, ...models };
