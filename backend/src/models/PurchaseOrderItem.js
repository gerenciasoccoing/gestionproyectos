const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const PurchaseOrderItem = sequelize.define('PurchaseOrderItem', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    // Aislamiento multi-tenant (ver applyTenantScoping.js): asignado automáticamente por los
    // hooks de Sequelize a partir del usuario autenticado, nunca a mano en un controlador.
    companyId: { type: DataTypes.UUID, allowNull: true },
    purchaseOrderId: { type: DataTypes.UUID, allowNull: false },
    budgetItemId: { type: DataTypes.UUID, allowNull: true }, // vínculo opcional al ítem de presupuesto
    // TEXT, no STRING/VARCHAR(255): las descripciones de dotación/EPP suelen incluir tallas,
    // medidas y detalles que superan 255 caracteres (ver INSERT fallido en producción con
    // "value too long for type character varying(255)").
    name: { type: DataTypes.TEXT, allowNull: false },
    unit: { type: DataTypes.STRING, allowNull: false },
    quantityOrdered: { type: DataTypes.DECIMAL(18, 4), allowNull: false, validate: { min: 0 } },
    unitPrice: { type: DataTypes.DECIMAL(18, 2), allowNull: false, validate: { min: 0 } },
    totalValue: { type: DataTypes.DECIMAL(18, 2), allowNull: false, validate: { min: 0 } },
    // % de IVA de este ítem (Colombia: 19% general). Editable por ítem porque una misma orden
    // puede mezclar productos gravados a distinta tarifa (ej. exentos al 0%).
    vatPercent: { type: DataTypes.DECIMAL(5, 2), allowNull: false, defaultValue: 19, validate: { min: 0, max: 100 } },
  });

  PurchaseOrderItem.associate = (models) => {
    PurchaseOrderItem.belongsTo(models.PurchaseOrder, { foreignKey: 'purchaseOrderId' });
    PurchaseOrderItem.belongsTo(models.BudgetItem, { foreignKey: 'budgetItemId' });
    PurchaseOrderItem.hasMany(models.PurchaseReceipt, { foreignKey: 'purchaseOrderItemId', as: 'receipts', onDelete: 'CASCADE' });
  };

  return PurchaseOrderItem;
};
