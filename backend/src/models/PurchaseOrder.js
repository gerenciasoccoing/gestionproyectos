const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const PurchaseOrder = sequelize.define('PurchaseOrder', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    // Aislamiento multi-tenant (ver applyTenantScoping.js): asignado automáticamente por los
    // hooks de Sequelize a partir del usuario autenticado, nunca a mano en un controlador.
    companyId: { type: DataTypes.UUID, allowNull: true },
    // Opcional: una orden puede crearse desde la ficha de un proveedor sin asignarla todavía a un
    // proyecto. Cuando sí tiene projectId, aparece en el listado de compras de ese proyecto (ver
    // purchaseOrderController.list) exactamente igual que las creadas desde Ejecución de proyecto.
    projectId: { type: DataTypes.UUID, allowNull: true },
    // Consecutivo legible para el PDF/UI (no es el id interno). Se asigna en purchaseOrderService
    // al crear la orden; las filas preexistentes se numeran una sola vez en postSyncFixups.
    orderNumber: { type: DataTypes.INTEGER, allowNull: true },
    supplier: { type: DataTypes.STRING, allowNull: false },
    date: { type: DataTypes.DATEONLY, allowNull: false },
    status: {
      type: DataTypes.ENUM('abierta', 'parcial', 'cerrada', 'cerrada_con_faltantes'),
      defaultValue: 'abierta',
    },
    closureReason: { type: DataTypes.TEXT, allowNull: true },
    supplierId: { type: DataTypes.UUID, allowNull: true }, // vínculo opcional a Terceros (proveedor)
    // gasto generado por "Pasar a Gastos" (ver conversión en purchaseOrderController.convertToExpense).
    // Una vez asignado, la orden no puede convertirse de nuevo ni editar sus ítems.
    expenseId: { type: DataTypes.UUID, allowNull: true },
    createdBy: { type: DataTypes.UUID, allowNull: true },
    // Caja de la que sale el pago de TODA la orden, elegida una sola vez (antes se pedía de nuevo
    // en cada recepción/traslado a gastos, lo que permitía — por error — pagar ítems de una misma
    // orden desde cajas distintas). addReceipt y convertToExpense ya no reciben cashBoxId: usan
    // este campo. Nullable solo por las órdenes que ya existían antes de esta migración y cuyo
    // historial mezcló más de una caja entre sus ítems (ver postSyncFixups#backfillPurchaseOrderCashBox);
    // esas quedan en revisión manual y no admiten nuevas recepciones/traslados hasta que alguien les
    // asigne una caja (ver updateOrder).
    cashBoxId: { type: DataTypes.UUID, allowNull: true },
    // Retención en la fuente de la orden completa: porcentaje aplicado sobre el subtotal (antes de
    // IVA), se resta del total general. 0 = sin retención.
    retentionPercent: { type: DataTypes.DECIMAL(5, 2), allowNull: false, defaultValue: 0, validate: { min: 0, max: 100 } },
  });

  PurchaseOrder.associate = (models) => {
    PurchaseOrder.belongsTo(models.Project, { foreignKey: 'projectId' });
    PurchaseOrder.belongsTo(models.ThirdParty, { foreignKey: 'supplierId', as: 'supplierParty' });
    PurchaseOrder.belongsTo(models.Expense, { foreignKey: 'expenseId', as: 'expense' });
    PurchaseOrder.belongsTo(models.CashBox, { foreignKey: 'cashBoxId' });
    PurchaseOrder.hasMany(models.PurchaseOrderItem, { foreignKey: 'purchaseOrderId', as: 'items', onDelete: 'CASCADE' });
  };

  return PurchaseOrder;
};
