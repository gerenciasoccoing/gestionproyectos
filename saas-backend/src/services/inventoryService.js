const ApiError = require('../utils/ApiError');
const { Product, InventoryMovement, OrderItem, sequelize } = require('../models');

// Único punto de escritura de stock: todo cambio de inventario pasa por aquí y queda
// registrado en InventoryMovement, tanto si viene de una venta como de un ajuste manual.
async function applyStockChange(product, { type, quantity, reason, orderId, userId }, transaction) {
  const previousStock = product.stock;
  let newStock;
  if (type === 'in') newStock = previousStock + quantity;
  else if (type === 'out') newStock = previousStock - quantity;
  else newStock = quantity; // adjustment: quantity es el nuevo stock absoluto

  if (newStock < 0) throw new ApiError(400, `Stock insuficiente para ${product.name}`);

  await product.update({ stock: newStock }, { transaction });
  await InventoryMovement.create({
    tenantId: product.tenantId,
    productId: product.id,
    type,
    quantity: type === 'adjustment' ? newStock - previousStock : quantity,
    previousStock,
    newStock,
    reason,
    orderId: orderId || null,
    userId: userId || null,
  }, { transaction });

  return product;
}

// Descuenta stock de todos los ítems de un pedido pagado. Es idempotente vía order.stockDeducted
// para que un webhook duplicado no descuente dos veces.
async function deductStockForOrder(order) {
  if (order.stockDeducted) return;

  await sequelize.transaction(async (transaction) => {
    const items = await OrderItem.findAll({ where: { orderId: order.id }, transaction });
    for (const item of items) {
      if (!item.productId) continue;
      const product = await Product.findByPk(item.productId, { transaction, lock: transaction.LOCK.UPDATE });
      if (!product || !product.trackInventory) continue;
      await applyStockChange(product, {
        type: 'out',
        quantity: item.quantity,
        reason: `Venta pedido ${order.orderNumber}`,
        orderId: order.id,
      }, transaction);
    }
    await order.update({ stockDeducted: true }, { transaction });
  });
}

module.exports = { applyStockChange, deductStockForOrder };
