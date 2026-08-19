require('dotenv').config();
const app = require('./app');
const { sequelize: appSequelize } = require('./models');
const { sequelize: adminSequelize } = require('./models/adminModels');
const { applyPreSyncFixups } = require('./utils/preSyncFixups');
const { applyPostSyncFixups } = require('./utils/postSyncFixups');

const PORT = process.env.PORT || 4000;

async function start() {
  // Arranque en dos conexiones (ver models/adminModels.js): la de administración hace todo el
  // trabajo de sync/DDL/migraciones —incluida la creación del rol restringido y las políticas RLS
  // (Capa 2 del aislamiento multi-tenant, ver postSyncFixups.js)— y recién después se confirma que
  // la conexión restringida (la que atiende peticiones HTTP reales) puede conectarse, ya con ese
  // rol existiendo.
  await adminSequelize.authenticate();
  await applyPreSyncFixups();
  // en producción usar migraciones; aquí se usa sync({ alter: true }) para agilizar el setup
  // local y aplicar cambios de esquema (columnas nuevas) sin perder los datos existentes.
  await adminSequelize.sync({ alter: true });
  await applyPostSyncFixups();

  await appSequelize.authenticate();
  app.listen(PORT, () => {
    console.log(`API escuchando en puerto ${PORT}`);
  });
}

start().catch((err) => {
  console.error('Error al iniciar el servidor:', err);
  process.exit(1);
});
