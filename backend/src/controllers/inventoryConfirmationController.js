// Endpoints PÚBLICOS (sin authenticate, ver inventoryConfirmationRoutes.js): la persona
// responsable abre el enlace desde WhatsApp sin iniciar sesión. Nunca devolver más que
// buildPublicSummary — ni ids internos, ni otros movimientos, ni datos de otros equipos/usuarios.
const asyncHandler = require('../utils/asyncHandler');
const { getConfirmationByToken, confirmToken, buildPublicSummary } = require('../services/inventoryService');

const get = asyncHandler(async (req, res) => {
  const confirmation = await getConfirmationByToken(req.params.token);
  res.json(buildPublicSummary(confirmation));
});

const confirm = asyncHandler(async (req, res) => {
  await confirmToken(req.params.token);
  const confirmation = await getConfirmationByToken(req.params.token);
  res.json(buildPublicSummary(confirmation));
});

module.exports = { get, confirm };
