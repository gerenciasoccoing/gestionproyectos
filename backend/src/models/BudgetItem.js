const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const BudgetItem = sequelize.define('BudgetItem', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    budgetId: { type: DataTypes.UUID, allowNull: false },
    apuId: { type: DataTypes.UUID, allowNull: true },
    // Código generado por el sistema para ítems sin APU (manuales o extraídos por IA): un ítem
    // con apuId ya muestra el código de su APU, así que este campo solo se llena cuando apuId es
    // null, para que la columna de código nunca quede vacía. Único a nivel de toda la base (ver
    // budgetService.generateUniqueItemCode, que también evita coincidir con un código de APU).
    itemCode: { type: DataTypes.STRING, allowNull: true, unique: true },
    description: { type: DataTypes.STRING, allowNull: false },
    // Aclaración opcional del usuario, independiente de la descripción (que cuando el ítem viene
    // de un APU se autocompleta con el nombre del APU y no debe pedirse ni duplicarse a mano).
    notes: { type: DataTypes.STRING, allowNull: true },
    unit: { type: DataTypes.STRING, allowNull: false },
    quantity: { type: DataTypes.DECIMAL(18, 4), allowNull: false, validate: { min: 0 } },
    unitCost: { type: DataTypes.DECIMAL(18, 2), allowNull: false, validate: { min: 0 } },
    totalCost: { type: DataTypes.DECIMAL(18, 2), allowNull: false, validate: { min: 0 } },
  });

  BudgetItem.associate = (models) => {
    BudgetItem.belongsTo(models.Budget, { foreignKey: 'budgetId' });
    BudgetItem.belongsTo(models.APU, { foreignKey: 'apuId' });
    BudgetItem.hasMany(models.ProgressEntry, { foreignKey: 'budgetItemId', as: 'progressEntries' });
    BudgetItem.hasMany(models.PurchaseOrderItem, { foreignKey: 'budgetItemId' });
  };

  return BudgetItem;
};
