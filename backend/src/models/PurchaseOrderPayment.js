const { DataTypes } = require('sequelize');

// Abono (pago parcial) sobre una Orden de Compra, independiente del estado de recepción de sus
// ítems — una orden puede tener varios, este es el histórico completo (no solo el último). Cuando
// la orden se pasa a Gastos (ver convertToExpense), estos registros NO se mueven ni se duplican:
// el gasto resultante queda trazable a la orden vía Expense.sourceId, así que el detalle del gasto
// simplemente consulta estos abonos por purchaseOrderId para mostrarlos con sus comprobantes.
module.exports = (sequelize) => {
  const PurchaseOrderPayment = sequelize.define('PurchaseOrderPayment', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    // Aislamiento multi-tenant (ver applyTenantScoping.js): asignado automáticamente por los
    // hooks de Sequelize a partir del usuario autenticado, nunca a mano en un controlador.
    companyId: { type: DataTypes.UUID, allowNull: true },
    purchaseOrderId: { type: DataTypes.UUID, allowNull: false },
    amount: { type: DataTypes.DECIMAL(18, 2), allowNull: false, validate: { min: 0 } },
    date: { type: DataTypes.DATEONLY, allowNull: false },
    // Obligatorio a propósito: un abono sin comprobante no es distinguible de uno inventado.
    receiptFilePath: { type: DataTypes.STRING, allowNull: false },
    notes: { type: DataTypes.TEXT, allowNull: true },
    createdBy: { type: DataTypes.UUID, allowNull: true },
  });

  PurchaseOrderPayment.associate = (models) => {
    PurchaseOrderPayment.belongsTo(models.PurchaseOrder, { foreignKey: 'purchaseOrderId' });
  };

  return PurchaseOrderPayment;
};
