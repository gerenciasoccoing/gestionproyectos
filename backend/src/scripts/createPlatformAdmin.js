// Crea (o actualiza la contraseña de) la cuenta de operador de la plataforma. No se expone por
// HTTP a propósito — a diferencia de un usuario de empresa, no hay ningún flujo de "olvidé mi
// contraseña" ni panel desde donde crear la primera cuenta, así que este bootstrap se corre a mano
// una sola vez (y de nuevo si hace falta rotar la contraseña) con acceso directo al servidor.
//
// Uso: PLATFORM_ADMIN_NAME=... PLATFORM_ADMIN_EMAIL=... PLATFORM_ADMIN_PASSWORD=... node src/scripts/createPlatformAdmin.js
require('dotenv').config();
const bcrypt = require('bcryptjs');
const { sequelize, PlatformAdmin } = require('../models');

async function run() {
  const name = process.env.PLATFORM_ADMIN_NAME;
  const email = process.env.PLATFORM_ADMIN_EMAIL;
  const password = process.env.PLATFORM_ADMIN_PASSWORD;
  if (!name || !email || !password) {
    console.error('Faltan variables: PLATFORM_ADMIN_NAME, PLATFORM_ADMIN_EMAIL, PLATFORM_ADMIN_PASSWORD');
    process.exit(1);
  }
  if (password.length < 8) {
    console.error('PLATFORM_ADMIN_PASSWORD debe tener al menos 8 caracteres');
    process.exit(1);
  }

  await sequelize.authenticate();
  const passwordHash = await bcrypt.hash(password, 10);
  const [admin, created] = await PlatformAdmin.findOrCreate({
    where: { email },
    defaults: { name, passwordHash },
  });
  if (!created) {
    await admin.update({ name, passwordHash, active: true });
    console.log(`Cuenta de operador actualizada: ${email}`);
  } else {
    console.log(`Cuenta de operador creada: ${email}`);
  }
  process.exit(0);
}

run().catch((err) => {
  console.error('Error creando la cuenta de operador:', err);
  process.exit(1);
});
