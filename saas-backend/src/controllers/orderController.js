const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const { Order, OrderItem } = require('../models');

const list = asyncHandler(async (req, res) => {
  const where = { tenantId: req.staff.tenantId };
  if (req.query.status) where.status = req.query.status;
  const orders = await Order.findAll({ where, order: [['createdAt', 'DESC']], limit: 200 });
  res.json(orders);
});

const getOne = asyncHandler(async (req, res) => {
  const order = await Order.findOne({
    where: { id: req.params.id, tenantId: req.staff.tenantId }, include: [OrderItem],
  });
  if (!order) throw new ApiError(404, 'Pedido no encontrado');
  res.json(order);
});

// El tenant solo puede marcar como despachado (fulfilled) o cancelar un pedido que aún no
// haya sido pagado; el paso a "paid" siempre lo dispara el webhook de la pasarela de pago.
const updateStatus = asyncHandler(async (req, res) => {
  const order = await Order.findOne({ where: { id: req.params.id, tenantId: req.staff.tenantId } });
  if (!order) throw new ApiError(404, 'Pedido no encontrado');

  const { status } = req.body;
  const allowedTransitions = {
    paid: ['fulfilled'],
    pending_payment: ['cancelled'],
  };
  if (!allowedTransitions[order.status]?.includes(status)) {
    throw new ApiError(400, `No se puede pasar el pedido de ${order.status} a ${status}`);
  }

  await order.update({ status });
  res.json(order);
});

module.exports = { list, getOne, updateStatus };
