const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const { Tenant, Order } = require('../models');
const { getPaymentProvider } = require('../payments');
const { deductStockForOrder } = require('../services/inventoryService');

// La pasarela llama a esta URL directamente (no pasa por el subdominio del tenant), así que el
// tenant se identifica por el segmento de la ruta, no por resolveTenant/Host.
const wompiWebhook = asyncHandler(async (req, res) => {
  const tenant = await Tenant.findOne({ where: { subdomain: req.params.tenantSubdomain } });
  if (!tenant) throw new ApiError(404, 'Tenant no encontrado');

  const provider = getPaymentProvider(tenant);
  const validSignature = provider.verifyWebhookSignature(req.body, tenant);
  if (!validSignature) throw new ApiError(401, 'Firma de webhook inválida');

  const event = provider.parseWebhookEvent(req.body);
  const order = await Order.findOne({ where: { tenantId: tenant.id, orderNumber: event.reference } });
  if (!order) throw new ApiError(404, 'Pedido no encontrado para esta referencia');

  await order.update({
    paymentStatus: event.status,
    paymentTransactionId: event.transactionId,
    ...(event.status === 'approved' && order.status === 'pending_payment' && { status: 'paid' }),
    ...(event.status === 'declined' && order.status === 'pending_payment' && { status: 'failed' }),
  });

  if (event.status === 'approved') {
    await deductStockForOrder(order);
  }

  res.json({ received: true });
});

module.exports = { wompiWebhook };
