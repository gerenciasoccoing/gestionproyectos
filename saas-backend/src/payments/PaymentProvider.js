// Contrato común que debe implementar cada pasarela de pago soportada. Así, agregar una
// pasarela nueva (ePayco, PayU...) es solo escribir un adaptador nuevo sin tocar checkout/webhook.
class PaymentProvider {
  /**
   * Arma los datos necesarios para que el frontend inicie el cobro de un pedido.
   * @param {import('../models').Order} order
   * @param {import('../models').Tenant} tenant
   * @returns {Promise<{ redirectUrl?: string, widget?: object }>}
   */
  // eslint-disable-next-line no-unused-vars
  async createPayment(order, tenant) {
    throw new Error('createPayment no implementado');
  }

  /**
   * Valida que un webhook entrante realmente proviene de la pasarela (firma/checksum).
   * @returns {boolean}
   */
  // eslint-disable-next-line no-unused-vars
  verifyWebhookSignature(payload, headers, tenant) {
    throw new Error('verifyWebhookSignature no implementado');
  }

  /**
   * Normaliza el evento de la pasarela a un formato común.
   * @returns {{ reference: string, status: 'approved'|'declined'|'pending', transactionId: string }}
   */
  // eslint-disable-next-line no-unused-vars
  parseWebhookEvent(payload) {
    throw new Error('parseWebhookEvent no implementado');
  }
}

module.exports = PaymentProvider;
