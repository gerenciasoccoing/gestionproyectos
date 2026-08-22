const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const {
  Product, Order, OrderItem, sequelize,
} = require('../models');
const { getPaymentProvider } = require('../payments');

async function generateOrderNumber(tenantId, transaction) {
  const count = await Order.count({ where: { tenantId }, transaction });
  const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  return `ORD-${datePart}-${String(count + 1).padStart(5, '0')}`;
}

// Checkout de invitado o de cliente registrado (req.customer es opcional). El precio y el stock
// SIEMPRE se validan contra la base de datos: nunca se confía en lo que envía el frontend salvo
// el productId y la cantidad deseada, exactamente como exige un carrito server-validated.
const createOrder = asyncHandler(async (req, res) => {
  const { tenant } = req;
  const { items, customer } = req.body;
  if (!Array.isArray(items) || items.length === 0) throw new ApiError(400, 'El carrito está vacío');
  if (!customer || !customer.name || !customer.email) {
    throw new ApiError(400, 'Los datos del cliente (nombre, email) son obligatorios');
  }

  const order = await sequelize.transaction(async (transaction) => {
    let subtotal = 0;
    const lineItems = [];

    for (const rawItem of items) {
      const quantity = Number(rawItem.quantity);
      if (!rawItem.productId || !Number.isInteger(quantity) || quantity <= 0) {
        throw new ApiError(400, 'Cada ítem del carrito requiere productId y quantity válidos');
      }
      const product = await Product.findOne({
        where: { id: rawItem.productId, tenantId: tenant.id, active: true }, transaction,
      });
      if (!product) throw new ApiError(400, `Producto no disponible: ${rawItem.productId}`);
      if (product.trackInventory && product.stock < quantity) {
        throw new ApiError(400, `Stock insuficiente para ${product.name}`);
      }

      const lineSubtotal = Number(product.price) * quantity;
      subtotal += lineSubtotal;
      lineItems.push({
        productId: product.id, productName: product.name, unitPrice: product.price, quantity, subtotal: lineSubtotal,
      });
    }

    const shippingCost = tenant.shippingType === 'free' ? 0 : Number(tenant.shippingFixedRate);
    const tax = 0; // El IVA se calcula al emitir la factura electrónica (fase de facturación).
    const total = subtotal + shippingCost + tax;

    const orderNumber = await generateOrderNumber(tenant.id, transaction);
    const createdOrder = await Order.create({
      tenantId: tenant.id,
      customerId: req.customer ? req.customer.id : null,
      orderNumber,
      customerName: customer.name,
      customerEmail: customer.email,
      customerPhone: customer.phone || null,
      shippingAddress: customer.address || null,
      subtotal,
      shippingCost,
      tax,
      total,
      paymentProvider: tenant.paymentProvider,
    }, { transaction });

    await OrderItem.bulkCreate(
      lineItems.map((item) => ({ ...item, orderId: createdOrder.id })),
      { transaction },
    );

    return createdOrder;
  });

  const provider = getPaymentProvider(tenant);
  const payment = await provider.createPayment(order, tenant);
  await order.update({ paymentReference: order.orderNumber });

  res.status(201).json({ order, payment });
});

const getOrderStatus = asyncHandler(async (req, res) => {
  const order = await Order.findOne({
    where: { tenantId: req.tenant.id, orderNumber: req.params.orderNumber },
    include: [OrderItem],
  });
  if (!order) throw new ApiError(404, 'Pedido no encontrado');
  res.json(order);
});

module.exports = { createOrder, getOrderStatus };
