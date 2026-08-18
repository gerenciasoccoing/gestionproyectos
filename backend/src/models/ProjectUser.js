const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const ProjectUser = sequelize.define('ProjectUser', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    // Aislamiento multi-tenant (ver applyTenantScoping.js): asignado automáticamente por los
    // hooks de Sequelize a partir del usuario autenticado, nunca a mano en un controlador.
    companyId: { type: DataTypes.UUID, allowNull: true },
    userId: { type: DataTypes.UUID, allowNull: false },
    projectId: { type: DataTypes.UUID, allowNull: false },
    roleInProject: { type: DataTypes.STRING },
  });

  return ProjectUser;
};
