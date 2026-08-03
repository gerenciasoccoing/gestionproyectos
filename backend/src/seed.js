require('dotenv').config();
const bcrypt = require('bcryptjs');
const { sequelize, User, Role, Permission, LaborParameters, CompanySettings } = require('./models');
const { MODULES, ACTIONS, DEFAULT_ROLE_PERMISSIONS } = require('./config/permissions');

async function seed() {
  await sequelize.sync({ alter: true });

  // Catálogo de permisos (module:action)
  const permissionMap = {};
  for (const moduleName of MODULES) {
    for (const action of ACTIONS) {
      const [perm] = await Permission.findOrCreate({ where: { module: moduleName, action } });
      permissionMap[`${moduleName}:${action}`] = perm;
    }
  }

  // Roles por defecto con su matriz de permisos
  for (const [roleName, perms] of Object.entries(DEFAULT_ROLE_PERMISSIONS)) {
    const [role] = await Role.findOrCreate({ where: { name: roleName } });
    const permissions = perms.map((key) => permissionMap[key]).filter(Boolean);
    await role.setPermissions(permissions);
  }

  // Usuario administrador inicial
  const adminEmail = process.env.SEED_ADMIN_EMAIL || 'admin@empresa.com';
  const adminPassword = process.env.SEED_ADMIN_PASSWORD || 'Admin123!';
  const [admin] = await User.findOrCreate({
    where: { email: adminEmail },
    defaults: { name: 'Administrador', passwordHash: await bcrypt.hash(adminPassword, 10) },
  });
  const adminRole = await Role.findOne({ where: { name: 'admin' } });
  await admin.setRoles([adminRole]);

  // Parámetros laborales vigentes (Colombia 2026, valores de referencia parametrizables)
  const existingParams = await LaborParameters.findOne();
  if (!existingParams) {
    await LaborParameters.create({
      effectiveDate: '2026-01-01',
      smlv: 1423500,
      auxTransporte: 200000,
      cesantiasDivisor: 360,
      interesesCesantiasPercent: 12,
      primaDivisor: 360,
      vacacionesDivisor: 720,
      topeAuxTransporteSalarios: 2,
      indemnizacionRules: { baseDays: 30, extraDaysPerYear: 20, thresholdYears: 1 },
      notes: 'Valores de referencia iniciales; actualizar según normativa vigente.',
    });
  }

  await CompanySettings.findOrCreate({ where: {}, defaults: { companyName: 'Mi Empresa Constructora' } });

  console.log('Seed completado.');
  console.log(`Usuario admin: ${adminEmail} / contraseña: ${adminPassword}`);
  process.exit(0);
}

seed().catch((err) => {
  console.error('Error en seed:', err);
  process.exit(1);
});
