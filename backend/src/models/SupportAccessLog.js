const { DataTypes } = require('sequelize');

// Registro de auditoría de "acceso de soporte": cada vez que un operador de la plataforma entra a
// la sesión de una empresa desde el panel de super-admin (ver platformAdminController.impersonateCompany),
// queda una fila acá con quién, a qué empresa, como qué usuario y por qué. Los nombres/emails van
// denormalizados a propósito: el historial debe seguir siendo legible aunque la cuenta de operador
// o el usuario impersonado se borren después. Tabla de plataforma, no de una empresa — fuera del
// aislamiento multi-tenant (ver TENANT_SCOPING_EXCLUDED en models/index.js).
module.exports = (sequelize) => {
  const SupportAccessLog = sequelize.define('SupportAccessLog', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    platformAdminId: { type: DataTypes.UUID, allowNull: false },
    platformAdminName: { type: DataTypes.STRING, allowNull: false },
    companyId: { type: DataTypes.UUID, allowNull: false },
    companyName: { type: DataTypes.STRING, allowNull: false },
    impersonatedUserEmail: { type: DataTypes.STRING, allowNull: false },
    reason: { type: DataTypes.STRING, allowNull: true },
  }, { updatedAt: false });

  return SupportAccessLog;
};
