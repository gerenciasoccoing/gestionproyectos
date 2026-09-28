// Catálogo por defecto de categorías de Gasto Administrativo General, sembrado al aprovisionar una
// empresa nueva (companyProvisioningService.js) y, para las que ya existían antes de esta
// funcionalidad, en cada arranque (ver postSyncFixups.js#seedAdminExpenseCategoriesForExistingCompanies)
// — mismo criterio ya usado para los catálogos de EPS/pensión/ARL y de Retenciones. 'Otros' es la
// categoría de destino de la migración de gastos preexistentes sin proyecto (ver postSyncFixups.js),
// por eso su nombre debe coincidir exactamente con el usado ahí.
const DEFAULT_ADMIN_EXPENSE_CATEGORIES = [
  'Personal administrativo de planta',
  'Papelería y útiles de oficina',
  'Mantenimiento de infraestructura física',
  'Servicios públicos',
  'Arriendo',
  'Aseo y cafetería',
  'Otros',
];

module.exports = { DEFAULT_ADMIN_EXPENSE_CATEGORIES };
