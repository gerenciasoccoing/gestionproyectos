// Catálogo por defecto de tipos de retención (Colombia), sembrado al aprovisionar una empresa
// nueva (companyProvisioningService.js) y, para las que ya existían antes de esta funcionalidad,
// en cada arranque (ver postSyncFixups.js#seedWithholdingTypesForExistingCompanies) — mismo
// criterio ya usado para el catálogo de EPS/pensión/ARL (config/socialSecurityProviders.js).
// defaultPercent es solo el punto de partida al agregar una retención a un pago: siempre editable
// ahí, y el Administrador puede además ajustar el % por defecto del tipo desde Administración >
// Parámetros > Retenciones sin afectar los pagos ya registrados (ver
// CashBoxMovementWithholding.percent, que guarda el valor USADO en ese pago, no una referencia
// viva al tipo).
const DEFAULT_WITHHOLDING_TYPES = [
  { name: 'Retención en la fuente', defaultPercent: 2, recoverable: false },
  { name: 'ReteICA', defaultPercent: 0.966, recoverable: false },
  { name: 'ReteIVA', defaultPercent: 15, recoverable: false },
  { name: 'Retención de garantía', defaultPercent: 5, recoverable: true },
  { name: 'Estampilla pro-adulto mayor', defaultPercent: 2, recoverable: false },
  { name: 'Estampilla pro-cultura', defaultPercent: 1, recoverable: false },
  { name: 'Estampilla pro-universidad', defaultPercent: 1, recoverable: false },
  { name: 'Contribución especial de obra pública', defaultPercent: 5, recoverable: false },
  { name: 'Otras', defaultPercent: 0, recoverable: false },
];

module.exports = { DEFAULT_WITHHOLDING_TYPES };
