const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const User = sequelize.define('User', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    name: { type: DataTypes.STRING, allowNull: false },
    email: { type: DataTypes.STRING, allowNull: false, unique: true, validate: { isEmail: true } },
    passwordHash: { type: DataTypes.STRING, allowNull: false },
    active: { type: DataTypes.BOOLEAN, defaultValue: true },
  });

  User.associate = (models) => {
    User.belongsToMany(models.Role, { through: models.UserRole, foreignKey: 'userId' });
    User.belongsToMany(models.Project, { through: models.ProjectUser, foreignKey: 'userId' });
  };

  return User;
};
