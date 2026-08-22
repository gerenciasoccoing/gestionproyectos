const crypto = require('crypto');
const PaymentProvider = require('./PaymentProvider');

// Adaptador de Wompi (https://docs.wompi.co) usando el Web Checkout (widget/redirect hospedado
// por Wompi): evita tener que manejar datos de tarjeta directamente. Soporta PSE, tarjetas,
// Nequi y Bancolombia según lo habilitado en la cuenta del tenant.
function centsFromDecimal(amount) {
  return Math.round(Number(amount) * 100);
}

function getByPath(obj, dotPath) {
  return dotPath.split('.').reduce((acc, key) => (acc == null ? undefined : acc[key]), obj);
}

class WompiProvider extends PaymentProvider {
  async createPayment(order, tenant) {
    if (!tenant.wompiPublicKey) {
      throw new Error('El tenant no tiene configurada la llave pública de Wompi');
    }
    const integritySecret = tenant.getWompiIntegritySecret();
    if (!integritySecret) {
      throw new Error('El tenant no tiene configurado el secreto de integridad de Wompi');
    }

    const amountInCents = centsFromDecimal(order.total);
    const currency = 'COP';
    const signature = crypto
      .createHash('sha256')
      .update(`${order.orderNumber}${amountInCents}${currency}${integritySecret}`)
      .digest('hex');

    const base = tenant.wompiSandbox ? 'https://checkout.wompi.co/p/' : 'https://checkout.wompi.co/p/';
    const params = new URLSearchParams({
      'public-key': tenant.wompiPublicKey,
      currency,
      'amount-in-cents': String(amountInCents),
      reference: order.orderNumber,
      'signature:integrity': signature,
      'customer-data:email': order.customerEmail,
      'customer-data:full-name': order.customerName,
    });
    if (process.env.STOREFRONT_BASE_URL) {
      params.set('redirect-url', `${process.env.STOREFRONT_BASE_URL.replace(/\/$/, '')}/pedido/${order.orderNumber}`);
    }

    return { redirectUrl: `${base}?${params.toString()}` };
  }

  verifyWebhookSignature(payload, tenant) {
    const eventsSecret = tenant.getWompiEventsSecret();
    if (!eventsSecret) return false;
    const { signature, timestamp } = payload || {};
    if (!signature || !signature.properties || !signature.checksum) return false;

    const concatenated = signature.properties.map((prop) => getByPath(payload.data, prop)).join('');
    const checksum = crypto
      .createHash('sha256')
      .update(`${concatenated}${timestamp}${eventsSecret}`)
      .digest('hex');

    return checksum === signature.checksum;
  }

  parseWebhookEvent(payload) {
    const transaction = payload?.data?.transaction || {};
    const statusMap = { APPROVED: 'approved', DECLINED: 'declined', VOIDED: 'declined', ERROR: 'declined' };
    return {
      reference: transaction.reference,
      status: statusMap[transaction.status] || 'pending',
      transactionId: transaction.id,
    };
  }
}

module.exports = WompiProvider;
