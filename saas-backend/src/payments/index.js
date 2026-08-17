const WompiProvider = require('./WompiProvider');

const providers = {
  wompi: new WompiProvider(),
};

// Fábrica: cada tenant elige su pasarela (hoy solo Wompi). Añadir una nueva pasarela es
// registrar aquí un adaptador nuevo que cumpla el contrato de PaymentProvider.
function getPaymentProvider(tenant) {
  const provider = providers[tenant.paymentProvider];
  if (!provider) throw new Error(`Pasarela de pago no soportada: ${tenant.paymentProvider}`);
  return provider;
}

module.exports = { getPaymentProvider };
