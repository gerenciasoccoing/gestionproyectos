const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const UserRole = sequelize.define('UserRole', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    userId: { type: DataTypes.UUID, allowNull: false },
    roleId: { type: DataTypes.UUID, allowNull: false },
  });

  return UserRole;
};
