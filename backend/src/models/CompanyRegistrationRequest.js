const { DataTypes } = require('sequelize');

// Solicitud pública de alta de empresa (formulario "Registrar empresa" en el login, sin sesión).
// No es una Company todavía — solo un registro a revisar por un operador de plataforma (ver
// platformAdminController). Si se aprueba, se ejecuta el mismo alta que ya existía desde el panel
// de super-admin (provisionCompany) y companyId queda apuntando a la empresa creada. Excluido del
// aislamiento multi-tenant (ver defineModels.js#TENANT_SCOPING_EXCLUDED): es un dato de plataforma,
// no de ninguna empresa, y se crea desde un endpoint público sin companyId en contexto.
module.exports = (sequelize) => {
  const CompanyRegistrationRequest = sequelize.define('CompanyRegistrationRequest', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    companyName: { type: DataTypes.STRING, allowNull: false },
    nit: { type: DataTypes.STRING, allowNull: true },
    contactName: { type: DataTypes.STRING, allowNull: false },
    contactEmail: { type: DataTypes.STRING, allowNull: false },
    phone: { type: DataTypes.STRING, allowNull: true },
    status: {
      type: DataTypes.ENUM('pending', 'approved', 'rejected'),
      allowNull: false,
      defaultValue: 'pending',
    },
    rejectionReason: { type: DataTypes.TEXT, allowNull: true },
    decidedAt: { type: DataTypes.DATE, allowNull: true },
    decidedBy: { type: DataTypes.UUID, allowNull: true }, // PlatformAdmin.id
    companyId: { type: DataTypes.UUID, allowNull: true }, // seteado al aprobar
  });

  return CompanyRegistrationRequest;
};
