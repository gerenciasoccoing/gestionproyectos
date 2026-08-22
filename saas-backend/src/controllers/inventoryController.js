const { Op } = require('sequelize');
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const { Product, InventoryMovement, sequelize } = require('../models');
const { applyStockChange } = require('../services/inventoryService');

// Entradas manuales de stock (compra a proveedor) o ajustes (corrección de conteo físico).
const adjustStock = asyncHandler(async (req, res) => {
  const product = await Product.findOne({ where: { id: req.params.productId, tenantId: req.staff.tenantId } });
  if (!product) throw new ApiError(404, 'Producto no encontrado');

  const { type, quantity, reason } = req.body;
  if (!['in', 'out', 'adjustment'].includes(type)) throw new ApiError(400, 'type debe ser in, out o adjustment');
  if (quantity === undefined || Number.isNaN(Number(quantity)) || Number(quantity) < 0) {
    throw new ApiError(400, 'quantity debe ser un número mayor o igual a 0');
  }

  await sequelize.transaction(async (transaction) => {
    await applyStockChange(product, {
      type, quantity: Number(quantity), reason, userId: req.staff.id,
    }, transaction);
  });

  await product.reload();
  res.json(product);
});

const movements = asyncHandler(async (req, res) => {
  const where = { tenantId: req.staff.tenantId };
  if (req.query.productId) where.productId = req.query.productId;
  const items = await InventoryMovement.findAll({
    where, include: [Product], order: [['createdAt', 'DESC']], limit: 200,
  });
  res.json(items);
});

const lowStock = asyncHandler(async (req, res) => {
  const products = await Product.findAll({
    where: {
      tenantId: req.staff.tenantId,
      trackInventory: true,
      stock: { [Op.lte]: sequelize.col('lowStockThreshold') },
    },
    order: [['stock', 'ASC']],
  });
  res.json(products);
});

module.exports = { adjustStock, movements, lowStock };
