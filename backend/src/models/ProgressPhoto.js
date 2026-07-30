const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const ProgressPhoto = sequelize.define('ProgressPhoto', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    progressEntryId: { type: DataTypes.UUID, allowNull: false },
    filePath: { type: DataTypes.STRING, allowNull: false },
  });

  ProgressPhoto.associate = (models) => {
    ProgressPhoto.belongsTo(models.ProgressEntry, { foreignKey: 'progressEntryId' });
  };

  return ProgressPhoto;
};
