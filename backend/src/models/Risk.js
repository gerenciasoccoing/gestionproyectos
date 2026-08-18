const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Risk = sequelize.define('Risk', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    // Aislamiento multi-tenant (ver applyTenantScoping.js): asignado automáticamente por los
    // hooks de Sequelize a partir del usuario autenticado, nunca a mano en un controlador.
    companyId: { type: DataTypes.UUID, allowNull: true },
    projectId: { type: DataTypes.UUID, allowNull: false },
    description: { type: DataTypes.TEXT, allowNull: false },
    impact: { type: DataTypes.ENUM('alto', 'medio', 'bajo'), allowNull: false },
    probability: { type: DataTypes.ENUM('alta', 'media', 'baja'), allowNull: false },
    status: {
      type: DataTypes.ENUM('identificado', 'mitigado', 'materializado', 'cerrado'),
      defaultValue: 'identificado',
    },
  });

  Risk.associate = (models) => {
    Risk.belongsTo(models.Project, { foreignKey: 'projectId' });
  };

  return Risk;
};
