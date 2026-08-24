// Solución inmediata mientras se corrige el envío de correo de recuperación (ver diagnóstico):
// genera una contraseña temporal segura para admin@soccoing.com.co y la guarda ya hasheada con
// bcrypt (mismo estándar que login/resetPassword en authController.js) — nunca en texto plano en
// base de datos. La contraseña en claro solo se imprime una vez acá, en la terminal de quien corre
// el script a mano por SSH; no queda en ningún log persistente (una ejecución de `docker compose
// exec` no se guarda en `docker compose logs`, a diferencia del proceso principal del contenedor).
//
// Usa la conexión de administración (AdminUser, no el User con aislamiento multi-tenant): mismo
// motivo que login/forgotPassword en authController.js — la Capa 2 (RLS) no deja ver la fila del
// usuario sin el companyId de contexto, y acá no hay una petición HTTP autenticada de la que
// tomarlo.
//
// Uso: node src/scripts/resetAdminSoccoingPassword.js
require('dotenv').config();
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { User: AdminUser } = require('../models/adminModels');

const TARGET_EMAIL = 'admin@soccoing.com.co';

function generateTempPassword() {
  // 16 caracteres base64url (letras/dígitos/-/_): suficientemente largo e impredecible para uso
  // temporal, y se copia y pega en vez de escribirse a mano, así que no hace falta que sea
  // memorizable.
  return crypto.randomBytes(12).toString('base64url');
}

async function run() {
  const user = await AdminUser.findOne({ where: { email: TARGET_EMAIL }, hooks: false });
  if (!user) throw new Error(`No se encontró ningún usuario con email ${TARGET_EMAIL}.`);
  if (!user.active) throw new Error(`El usuario ${TARGET_EMAIL} está inactivo — actívalo desde Administración > Usuarios antes de restablecer la contraseña.`);

  const tempPassword = generateTempPassword();
  user.passwordHash = await bcrypt.hash(tempPassword, 10);
  await user.save({ hooks: false });

  console.log(`Contraseña temporal para ${TARGET_EMAIL}:`);
  console.log(tempPassword);
  console.log('\nEsta contraseña NO queda en ningún log — cópiala ahora. Pídele a la persona que la use para entrar y que la cambie de inmediato (próxima entrega: opción de "cambiar mi contraseña" dentro de la app).');
  process.exit(0);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
