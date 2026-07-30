const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Permission = sequelize.define('Permission', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    module: { type: DataTypes.STRING, allowNull: false },
    action: { type: DataTypes.STRING, allowNull: false },
  }, {
    indexes: [{ unique: true, fields: ['module', 'action'] }],
  });

  Permission.associate = (models) => {
    Permission.belongsToMany(models.Role, { through: models.RolePermission, foreignKey: 'permissionId' });
  };

  return Permission;
};
