const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Expense = sequelize.define('Expense', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    projectId: { type: DataTypes.UUID, allowNull: false },
    category: {
      type: DataTypes.ENUM('mano_obra', 'materiales', 'equipos', 'viaticos', 'imprevistos'),
      allowNull: false,
    },
    amount: { type: DataTypes.DECIMAL(18, 2), allowNull: false, validate: { min: 0 } },
    date: { type: DataTypes.DATEONLY, allowNull: false },
    description: { type: DataTypes.TEXT },
    supportFilePath: { type: DataTypes.STRING },
    source: { type: DataTypes.ENUM('manual', 'purchase_receipt', 'liquidacion'), defaultValue: 'manual' },
    sourceId: { type: DataTypes.UUID, allowNull: true },
    createdBy: { type: DataTypes.UUID, allowNull: true },
  });

  Expense.associate = (models) => {
    Expense.belongsTo(models.Project, { foreignKey: 'projectId' });
  };

  return Expense;
};
