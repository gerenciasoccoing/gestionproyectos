const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const BudgetItem = sequelize.define('BudgetItem', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    // Aislamiento multi-tenant (ver applyTenantScoping.js): asignado automáticamente por los
    // hooks de Sequelize a partir del usuario autenticado, nunca a mano en un controlador.
    companyId: { type: DataTypes.UUID, allowNull: true },
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
    // Detección de IVA para ítems SIN APU (contratos de suministro, ver budgetService.js): un ítem
    // con apuId siempre queda en 'no_aplica' (el costo directo de un APU es costo de construcción,
    // nunca lleva IVA). 'revisar' es el estado seguro por defecto cuando ni la IA ni el usuario
    // confirmaron con certeza si el precio incluye IVA — a propósito nunca se asume 'incluido' ni
    // 'no_incluido' en silencio (ver computeVatFields/updateBudgetItemVat en budgetService.js).
    vatStatus: {
      type: DataTypes.ENUM('no_aplica', 'incluido', 'no_incluido', 'revisar'),
      allowNull: false,
      defaultValue: 'no_aplica',
    },
    // Tarifa usada para calcular vatAmount (null cuando vatStatus es 'no_aplica' o 'revisar').
    vatPercent: { type: DataTypes.DECIMAL(5, 2), allowNull: true },
    // Monto de IVA calculado sobre totalCost, para trazabilidad/auditoría en cualquier estado:
    // si vatStatus='no_incluido', es lo que se SUMA a totalCost para obtener el total con IVA
    // (ver budgetItemTotalWithVat); si vatStatus='incluido', es el IVA que ya viene embebido en
    // totalCost (informativo, nunca se vuelve a sumar); 0 en 'no_aplica'/'revisar'.
    vatAmount: { type: DataTypes.DECIMAL(18, 2), allowNull: false, defaultValue: 0 },
  });

  BudgetItem.associate = (models) => {
    BudgetItem.belongsTo(models.Budget, { foreignKey: 'budgetId' });
    BudgetItem.belongsTo(models.APU, { foreignKey: 'apuId' });
    BudgetItem.hasMany(models.ProgressEntry, { foreignKey: 'budgetItemId', as: 'progressEntries' });
    BudgetItem.hasMany(models.PurchaseOrderItem, { foreignKey: 'budgetItemId' });
    BudgetItem.hasOne(models.BudgetScheduleItem, { foreignKey: 'budgetItemId', as: 'scheduleItem', onDelete: 'CASCADE' });
  };

  return BudgetItem;
};
