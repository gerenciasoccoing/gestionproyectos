const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const ProjectUser = sequelize.define('ProjectUser', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    userId: { type: DataTypes.UUID, allowNull: false },
    projectId: { type: DataTypes.UUID, allowNull: false },
    roleInProject: { type: DataTypes.STRING },
  });

  return ProjectUser;
};
