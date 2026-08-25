const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const ApiError = require('../utils/ApiError');
const { Company, User, Role, Permission, LaborParameters, CashBox, SocialSecurityProvider } = require('../models');
const { DEFAULT_SOCIAL_SECURITY_PROVIDERS } = require('../config/socialSecurityProviders');
// Chequeo de correo duplicado ANTES de tener companyId de contexto (ver provisionCompany): con la
// Capa 2 (RLS) activa, la conexión restringida no ve NINGUNA fila sin ese contexto — un
// User.findOne de la conexión normal acá siempre devolvería null, sin importar si el correo ya
// existe. Se usa la conexión de administración, exenta de RLS, mismo criterio que
// authController#login.
const { User: AdminUser } = require('../models/adminModels');
const { MODULES, ACTIONS, DEFAULT_ROLE_PERMISSIONS } = require('../config/permissions');
const { runWithCompany } = require('../utils/tenantContext');

// Deja lista una empresa recién creada para operar: roles por defecto con su matriz de permisos,
// el primer usuario administrador, parámetros laborales de referencia y una caja para poder
// registrar gastos desde el primer día. Compartido por seed.js (arranque de la instalación) y
// platformAdminController.createCompany (alta de una empresa cliente nueva) para no duplicar esta
// lógica en dos lugares — una corrección futura solo se hace una vez.
async function seedDefaultsForCompany(company, { adminName, adminEmail, adminPassword }) {
  return runWithCompany(company.id, async () => {
    const permissionMap = {};
    for (const moduleName of MODULES) {
      for (const action of ACTIONS) {
        const [perm] = await Permission.findOrCreate({ where: { module: moduleName, action } });
        permissionMap[`${moduleName}:${action}`] = perm;
      }
    }

    for (const [roleName, perms] of Object.entries(DEFAULT_ROLE_PERMISSIONS)) {
      const [role] = await Role.findOrCreate({ where: { name: roleName, companyId: company.id } });
      const permissions = perms.map((key) => permissionMap[key]).filter(Boolean);
      await role.setPermissions(permissions);
    }

    const [admin] = await User.findOrCreate({
      where: { email: adminEmail },
      defaults: { name: adminName, passwordHash: await bcrypt.hash(adminPassword, 10) },
    });
    const adminRole = await Role.findOne({ where: { name: 'admin', companyId: company.id } });
    await admin.setRoles([adminRole]);

    const existingParams = await LaborParameters.findOne();
    if (!existingParams) {
      // Valores de referencia iniciales (Colombia 2026): la empresa los ajusta después según su
      // propia normativa vigente, esto solo evita arrancar con el módulo de Personal sin ningún
      // parámetro cargado.
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

    await CashBox.findOrCreate({
      where: { name: 'Caja general' },
      defaults: { initialBalance: 0, status: 'activa' },
    });

    for (const [type, names] of Object.entries(DEFAULT_SOCIAL_SECURITY_PROVIDERS)) {
      for (const name of names) {
        // eslint-disable-next-line no-await-in-loop
        await SocialSecurityProvider.findOrCreate({ where: { type, name } });
      }
    }

    return admin;
  });
}

// Alta completa de una empresa cliente nueva: crea la fila de Company y la deja operativa con
// seedDefaultsForCompany. El catálogo de APU/precios queda vacío a propósito (se decidió no
// copiar ninguna plantilla): la empresa lo carga con la importación de Excel que ya existe, o a
// mano desde cero.
//
// adminPassword es OPCIONAL: cuando la llama platformAdminController.createCompany (alta manual),
// el operador la escribe a mano. Cuando la llama la aprobación de una solicitud de registro
// (platformAdminController.approveRegistrationRequest), el solicitante nunca eligió una — se
// genera una al azar, inutilizable en la práctica (nadie la conoce), y quien aprueba manda al
// admin un enlace de "definir tu contraseña" (mismo mecanismo que forgot-password, ver
// authController#forgotPassword) en vez de una contraseña por correo.
async function provisionCompany({ companyName, nit, address, phone, contactEmail, adminName, adminEmail, adminPassword }) {
  if (!companyName || !adminName || !adminEmail) {
    throw new ApiError(400, 'companyName, adminName y adminEmail son obligatorios');
  }
  if (adminPassword && adminPassword.length < 8) {
    throw new ApiError(400, 'adminPassword debe tener al menos 8 caracteres');
  }
  const password = adminPassword || crypto.randomBytes(32).toString('hex');

  const existingUser = await AdminUser.findOne({ where: { email: adminEmail }, hooks: false });
  if (existingUser) {
    throw new ApiError(409, 'Ya existe un usuario con ese correo en la plataforma');
  }

  const company = await Company.create({ companyName, nit, address, phone, contactEmail });
  const admin = await seedDefaultsForCompany(company, { adminName, adminEmail, adminPassword: password });
  return { company, admin };
}

module.exports = { seedDefaultsForCompany, provisionCompany };
