const { Op } = require('sequelize');
const { PurchaseOrderItem, PurchaseReceipt, PurchaseOrder, BudgetItem } = require('../models');

async function getItemWithDelivery(itemId) {
  const item = await PurchaseOrderItem.findByPk(itemId, { include: [{ model: PurchaseReceipt, as: 'receipts' }] });
  if (!item) return null;
  const delivered = item.receipts.reduce((sum, r) => sum + Number(r.quantityReceived), 0);
  const pending = Number(item.quantityOrdered) - delivered;
  return { item, delivered, pending };
}

async function getOrderItemsWithDelivery(purchaseOrderId) {
  const items = await PurchaseOrderItem.findAll({
    where: { purchaseOrderId },
    include: [{ model: PurchaseReceipt, as: 'receipts' }],
  });
  return items.map((item) => {
    const delivered = item.receipts.reduce((sum, r) => sum + Number(r.quantityReceived), 0);
    const pending = Number(item.quantityOrdered) - delivered;
    return { ...item.toJSON(), delivered, pending };
  });
}

async function isOrderFullyDelivered(purchaseOrderId) {
  const items = await getOrderItemsWithDelivery(purchaseOrderId);
  return items.every((i) => i.pending <= 0);
}

// Consecutivo legible de la orden (para UI/PDF, distinto del id interno). Se calcula dentro de la
// misma transacción de creación; el riesgo de colisión entre dos creaciones simultáneas es
// aceptable para un consecutivo de exhibición (no es una clave de negocio con restricción única).
async function nextOrderNumber(transaction) {
  const max = await PurchaseOrder.max('orderNumber', { transaction });
  return (max || 0) + 1;
}

// Reporte consolidado de compras (materiales) por proyecto y rango de fechas opcional,
// basado en la fecha de cada recepción.
async function getPurchaseReport(projectId, { from, to } = {}) {
  const dateWhere = {};
  if (from) dateWhere[Op.gte] = from;
  if (to) dateWhere[Op.lte] = to;

  const receipts = await PurchaseReceipt.findAll({
    where: Object.keys(dateWhere).length ? { date: dateWhere } : {},
    include: [{
      model: PurchaseOrderItem,
      required: true,
      include: [
        { model: PurchaseOrder, where: { projectId }, required: true },
        { model: BudgetItem, required: false },
      ],
    }],
    order: [['date', 'DESC']],
  });

  const rows = receipts.map((r) => ({
    receiptId: r.id,
    date: r.date,
    material: r.PurchaseOrderItem.name,
    unit: r.PurchaseOrderItem.unit,
    quantityReceived: Number(r.quantityReceived),
    unitCost: Number(r.PurchaseOrderItem.unitPrice),
    totalCost: Number(r.quantityReceived) * Number(r.PurchaseOrderItem.unitPrice),
    supplier: r.PurchaseOrderItem.PurchaseOrder.supplier,
    purchaseOrderId: r.PurchaseOrderItem.PurchaseOrder.id,
    orderStatus: r.PurchaseOrderItem.PurchaseOrder.status,
    budgetItemId: r.PurchaseOrderItem.budgetItemId,
    budgetItemDescription: r.PurchaseOrderItem.BudgetItem ? r.PurchaseOrderItem.BudgetItem.description : null,
  }));

  return {
    rows,
    totals: {
      quantity: rows.reduce((s, r) => s + r.quantityReceived, 0),
      cost: rows.reduce((s, r) => s + r.totalCost, 0),
    },
  };
}

module.exports = {
  getItemWithDelivery, getOrderItemsWithDelivery, isOrderFullyDelivered, getPurchaseReport, nextOrderNumber,
};
