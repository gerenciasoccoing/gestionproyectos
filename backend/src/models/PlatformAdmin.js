const { DataTypes } = require('sequelize');

// Cuenta de un operador de la plataforma (no de una empresa cliente): puede listar empresas,
// activarlas/desactivarlas y crear empresas nuevas desde el panel de super-admin. Deliberadamente
// fuera del aislamiento multi-tenant (ver TENANT_SCOPING_EXCLUDED en models/index.js) — no
// pertenece a ninguna empresa, por eso su JWT no lleva companyId (ver platformAdminAuth.js) y así
// nunca puede confundirse con el token de un usuario normal.
module.exports = (sequelize) => {
  const PlatformAdmin = sequelize.define('PlatformAdmin', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    name: { type: DataTypes.STRING, allowNull: false },
    email: { type: DataTypes.STRING, allowNull: false, unique: true, validate: { isEmail: true } },
    passwordHash: { type: DataTypes.STRING, allowNull: false },
    active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
  });

  return PlatformAdmin;
};
