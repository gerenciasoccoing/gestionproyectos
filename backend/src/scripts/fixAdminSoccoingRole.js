// Corrige el usuario admin@soccoing.com.co, creado en algún momento sin ningún rol asignado (el
// bug raíz: userController.create permitía guardar un usuario con roleIds=[] o sin ese campo, ver
// commit que agrega la validación en userController.js). Sin rol, ese usuario no tiene ningún
// permiso (Set vacío en auth.js), lo que se manifiesta como errores al abrir la app y accesos
// denegados en cualquier módulo.
//
// Diagnostica primero (imprime los roles que el usuario tenga hoy, si alguno) y solo agrega el rol
// "Coordinador" de la empresa SOCCOING — no reemplaza el conjunto de roles, así que es seguro
// correrlo más de una vez (queda como no-op si el usuario ya lo tiene).
//
// Uso: node src/scripts/fixAdminSoccoingRole.js
require('dotenv').config();
const { Company, User, Role } = require('../models');
const { Op } = require('sequelize');
const { runWithCompany } = require('../utils/tenantContext');

const TARGET_EMAIL = 'admin@soccoing.com.co';
const TARGET_ROLE_NAME = 'Coordinador';

async function run() {
  const company = await Company.findOne({ where: { companyName: { [Op.iLike]: '%soccoing%' } } });
  if (!company) throw new Error('No se encontró ninguna empresa con nombre que contenga "SOCCOING".');
  console.log(`Empresa: ${company.companyName} (${company.id})`);

  await runWithCompany(company.id, async () => {
    const user = await User.findOne({ where: { email: TARGET_EMAIL }, include: [Role] });
    if (!user) throw new Error(`No se encontró ningún usuario con email ${TARGET_EMAIL} en esta empresa.`);

    console.log(`Usuario: ${user.name} (${user.id})`);
    console.log(`Roles actuales: ${user.Roles.length ? user.Roles.map((r) => r.name).join(', ') : '(ninguno)'}`);

    // Búsqueda sin distinguir mayúsculas/minúsculas: el rol se crea a mano desde Administración >
    // Roles, así que el nombre exacto ("Coordinador", "COORDINADOR", etc.) queda a criterio de
    // quien lo creó.
    const role = await Role.findOne({ where: { name: { [Op.iLike]: TARGET_ROLE_NAME } } });
    if (!role) throw new Error(`No existe el rol "${TARGET_ROLE_NAME}" en la empresa ${company.companyName}. Créalo primero desde Administración > Roles.`);

    if (user.Roles.some((r) => r.id === role.id)) {
      console.log(`El usuario ya tiene el rol "${TARGET_ROLE_NAME}". Nada que hacer.`);
      return;
    }

    await user.addRole(role);
    console.log(`Rol "${TARGET_ROLE_NAME}" asignado a ${TARGET_EMAIL}.`);
  });

  console.log('Listo.');
  process.exit(0);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
