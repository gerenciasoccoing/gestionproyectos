const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Role = sequelize.define('Role', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    name: { type: DataTypes.STRING, allowNull: false, unique: true },
    description: { type: DataTypes.STRING },
  });

  Role.associate = (models) => {
    Role.belongsToMany(models.User, { through: models.UserRole, foreignKey: 'roleId' });
    Role.belongsToMany(models.Permission, { through: models.RolePermission, foreignKey: 'roleId' });
  };

  return Role;
};
