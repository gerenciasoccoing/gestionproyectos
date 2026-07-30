require('dotenv').config();
const app = require('./app');
const { sequelize } = require('./models');

const PORT = process.env.PORT || 4000;

async function start() {
  await sequelize.authenticate();
  await sequelize.sync(); // en producción usar migraciones; aquí se usa sync para agilizar el setup local
  app.listen(PORT, () => {
    console.log(`API escuchando en puerto ${PORT}`);
  });
}

start().catch((err) => {
  console.error('Error al iniciar el servidor:', err);
  process.exit(1);
});
