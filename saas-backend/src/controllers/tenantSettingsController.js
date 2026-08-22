const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const { Tenant } = require('../models');
const { relativePath } = require('../middleware/upload');

async function loadOwnTenant(req) {
  const tenant = await Tenant.findByPk(req.staff.tenantId);
  if (!tenant) throw new ApiError(404, 'Tenant no encontrado');
  return tenant;
}

const getSettings = asyncHandler(async (req, res) => {
  const tenant = await loadOwnTenant(req);
  res.json({
    id: tenant.id,
    name: tenant.name,
    nit: tenant.nit,
    subdomain: tenant.subdomain,
    customDomain: tenant.customDomain,
    logoUrl: tenant.logoUrl,
    colorPrimary: tenant.colorPrimary,
    colorSecondary: tenant.colorSecondary,
    shippingType: tenant.shippingType,
    shippingFixedRate: tenant.shippingFixedRate,
    paymentProvider: tenant.paymentProvider,
    wompiPublicKey: tenant.wompiPublicKey,
    wompiSandbox: tenant.wompiSandbox,
    hasWompiPrivateKey: !!tenant.wompiPrivateKeyEnc,
    hasWompiEventsSecret: !!tenant.wompiEventsSecretEnc,
    hasWompiIntegritySecret: !!tenant.wompiIntegritySecretEnc,
  });
});

// Marca y envío: cualquier tenant_admin las puede editar.
const updateBranding = asyncHandler(async (req, res) => {
  const tenant = await loadOwnTenant(req);
  const {
    name, colorPrimary, colorSecondary, shippingType, shippingFixedRate,
  } = req.body;

  await tenant.update({
    ...(name !== undefined && { name }),
    ...(colorPrimary !== undefined && { colorPrimary }),
    ...(colorSecondary !== undefined && { colorSecondary }),
    ...(shippingType !== undefined && { shippingType }),
    ...(shippingFixedRate !== undefined && { shippingFixedRate }),
  });

  res.json(tenant);
});

const uploadLogo = asyncHandler(async (req, res) => {
  const tenant = await loadOwnTenant(req);
  if (!req.file) throw new ApiError(400, 'No se recibió ningún archivo');
  await tenant.update({ logoUrl: relativePath(req.file) });
  res.json({ logoUrl: tenant.logoUrl });
});

// Credenciales sensibles de la pasarela de pago: se guardan cifradas y nunca se devuelven en
// texto plano (solo se informa si ya están configuradas).
const updatePaymentCredentials = asyncHandler(async (req, res) => {
  const tenant = await loadOwnTenant(req);
  const {
    wompiPublicKey, wompiPrivateKey, wompiEventsSecret, wompiIntegritySecret, wompiSandbox,
  } = req.body;

  if (wompiPublicKey !== undefined) tenant.wompiPublicKey = wompiPublicKey;
  if (wompiSandbox !== undefined) tenant.wompiSandbox = wompiSandbox;
  if (wompiPrivateKey) tenant.setWompiPrivateKey(wompiPrivateKey);
  if (wompiEventsSecret) tenant.setWompiEventsSecret(wompiEventsSecret);
  if (wompiIntegritySecret) tenant.setWompiIntegritySecret(wompiIntegritySecret);

  await tenant.save();
  res.json({ message: 'Credenciales actualizadas' });
});

module.exports = {
  getSettings, updateBranding, uploadLogo, updatePaymentCredentials,
};
