const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Milestone = sequelize.define('Milestone', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    // Aislamiento multi-tenant (ver applyTenantScoping.js): asignado automáticamente por los
    // hooks de Sequelize a partir del usuario autenticado, nunca a mano en un controlador.
    companyId: { type: DataTypes.UUID, allowNull: true },
    projectId: { type: DataTypes.UUID, allowNull: false },
    name: { type: DataTypes.STRING, allowNull: false },
    plannedDate: { type: DataTypes.DATEONLY, allowNull: false },
    actualDate: { type: DataTypes.DATEONLY, allowNull: true },
    status: {
      type: DataTypes.ENUM('pendiente', 'cumplido', 'atrasado'),
      defaultValue: 'pendiente',
    },
  });

  Milestone.associate = (models) => {
    Milestone.belongsTo(models.Project, { foreignKey: 'projectId' });
  };

  return Milestone;
};
