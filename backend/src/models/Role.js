const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Role = sequelize.define('Role', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    // Aislamiento multi-tenant (ver applyTenantScoping.js): asignado automáticamente por los
    // hooks de Sequelize a partir del usuario autenticado, nunca a mano en un controlador.
    companyId: { type: DataTypes.UUID, allowNull: true },
    name: { type: DataTypes.STRING, allowNull: false },
    description: { type: DataTypes.STRING },
  }, {
    // Único por empresa, no global: cada empresa tiene su propio rol "administrador", etc.
    indexes: [{ unique: true, fields: ['companyId', 'name'] }],
  });

  Role.associate = (models) => {
    Role.belongsToMany(models.User, { through: models.UserRole, foreignKey: 'roleId' });
    Role.belongsToMany(models.Permission, { through: models.RolePermission, foreignKey: 'roleId' });
  };

  return Role;
};
