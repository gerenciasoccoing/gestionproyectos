const ApiError = require('./ApiError');
const { getCurrentCompanyId } = require('./tenantContext');
const { Company } = require('../models');

// Tope blando del esqueleto de planes (ver Company.js): sin cobro ni bloqueo automático de la
// empresa, solo impide crear un registro más una vez alcanzado el límite configurado para esta
// empresa desde el panel de super-admin. limitField null/undefined = sin límite (el default para
// toda empresa hasta que un operador le asigne uno). model.count() ya queda filtrado a la empresa
// actual por los hooks de aislamiento multi-tenant (applyTenantScoping.js), así que where solo
// necesita la condición extra propia de este límite (ej. status: 'activo').
async function assertWithinLimit(model, limitField, where = {}) {
  const companyId = getCurrentCompanyId();
  const company = await Company.findByPk(companyId, { hooks: false });
  const limit = company?.[limitField];
  if (limit == null) return;

  const count = await model.count({ where });
  if (count >= limit) {
    throw new ApiError(
      409,
      `Se alcanzó el límite de tu plan (${limit}). Contacta al administrador para ampliarlo.`
    );
  }
}

module.exports = { assertWithinLimit };
