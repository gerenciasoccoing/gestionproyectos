require('dotenv').config();
const app = require('./app');
const { sequelize } = require('./models');
const { applyPreSyncFixups } = require('./utils/preSyncFixups');
const { applyPostSyncFixups } = require('./utils/postSyncFixups');

const PORT = process.env.PORT || 4000;

async function start() {
  await sequelize.authenticate();
  await applyPreSyncFixups();
  // en producción usar migraciones; aquí se usa sync({ alter: true }) para agilizar el setup
  // local y aplicar cambios de esquema (columnas nuevas) sin perder los datos existentes.
  await sequelize.sync({ alter: true });
  await applyPostSyncFixups();
  app.listen(PORT, () => {
    console.log(`API escuchando en puerto ${PORT}`);
  });
}

start().catch((err) => {
  console.error('Error al iniciar el servidor:', err);
  process.exit(1);
});
