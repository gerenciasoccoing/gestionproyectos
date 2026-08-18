require('dotenv').config();
const bcrypt = require('bcryptjs');
const { sequelize, Company, User, Role, Permission, LaborParameters } = require('./models');
const { MODULES, ACTIONS, DEFAULT_ROLE_PERMISSIONS } = require('./config/permissions');
const { applyPreSyncFixups } = require('./utils/preSyncFixups');
const { applyPostSyncFixups } = require('./utils/postSyncFixups');
const { runWithCompany } = require('./utils/tenantContext');

// Todo lo que sigue (roles, usuario admin, parámetros laborales) es "de empresa" y pasa por los
// hooks de aislamiento multi-tenant (ver applyTenantScoping.js), así que tiene que correr dentro
// de un contexto de empresa — a diferencia de una petición HTTP normal, este script no tiene uno
// puesto por el middleware de auth, así que lo abrimos a mano acá.
async function seedCompany(company) {
  return runWithCompany(company.id, async () => {
    // Catálogo de permisos (module:action) — global, no de empresa, ver Permission.
    const permissionMap = {};
    for (const moduleName of MODULES) {
      for (const action of ACTIONS) {
        const [perm] = await Permission.findOrCreate({ where: { module: moduleName, action } });
        permissionMap[`${moduleName}:${action}`] = perm;
      }
    }

    // Roles por defecto con su matriz de permisos, propios de esta empresa.
    for (const [roleName, perms] of Object.entries(DEFAULT_ROLE_PERMISSIONS)) {
      const [role] = await Role.findOrCreate({ where: { name: roleName, companyId: company.id } });
      const permissions = perms.map((key) => permissionMap[key]).filter(Boolean);
      await role.setPermissions(permissions);
    }

    // Usuario administrador inicial de esta empresa.
    const adminEmail = process.env.SEED_ADMIN_EMAIL || 'admin@empresa.com';
    const adminPassword = process.env.SEED_ADMIN_PASSWORD || 'Admin123!';
    const [admin] = await User.findOrCreate({
      where: { email: adminEmail },
      defaults: { name: 'Administrador', passwordHash: await bcrypt.hash(adminPassword, 10) },
    });
    const adminRole = await Role.findOne({ where: { name: 'admin', companyId: company.id } });
    await admin.setRoles([adminRole]);

    // Parámetros laborales vigentes (Colombia 2026, valores de referencia parametrizables).
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

    console.log('Seed completado.');
    console.log(`Usuario admin: ${adminEmail} / contraseña: ${adminPassword}`);
  });
}

async function seed() {
  await sequelize.authenticate();
  await applyPreSyncFixups();
  await sequelize.sync({ alter: true });
  await applyPostSyncFixups();

  // Instalación existente (ej. producción, ya migrada a multi-tenant): usa la primera empresa que
  // encuentre — no crea una nueva ni pisa sus datos. Instalación nueva (ej. este sandbox de
  // desarrollo, sin ninguna empresa todavía): crea una empresa por defecto para arrancar.
  let company = await Company.findOne({ order: [['createdAt', 'ASC']] });
  if (!company) {
    company = await Company.create({ companyName: 'Mi Empresa Constructora' });
  }
  // El default de % prestaciones subió de 70% a 85%: si la instancia ya tenía guardado el valor
  // viejo (nunca personalizado a mano), se actualiza; si alguien ya lo cambió a otra cosa, se respeta.
  if (Number(company.defaultPrestacionalPercent) === 70) {
    await company.update({ defaultPrestacionalPercent: 85 });
  }

  await seedCompany(company);
  process.exit(0);
}

seed().catch((err) => {
  console.error('Error en seed:', err);
  process.exit(1);
});
