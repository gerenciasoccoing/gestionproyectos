const { Sequelize } = require('sequelize');
require('dotenv').config();

// Conexión de administración (dueña de las tablas): la única que puede hacer sync()/DDL/migraciones
// y la única que se salta las políticas de Row-Level Security por ser la dueña de las tablas (ver
// postSyncFixups.js#applyRowLevelSecurity — deliberadamente sin FORCE ROW LEVEL SECURITY, así que
// solo el rol dueño queda exento). Se usa exclusivamente en el arranque (server.js) y en scripts de
// mantenimiento (seed.js, createPlatformAdmin.js) — nunca para atender peticiones HTTP, eso corre
// por config/database.js con el rol restringido.
const adminSequelize = new Sequelize(
  process.env.ADMIN_DATABASE_URL || process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/gestionproyectos',
  {
    dialect: 'postgres',
    logging: false,
  }
);

module.exports = adminSequelize;
