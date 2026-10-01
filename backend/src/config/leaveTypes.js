// Catálogo por defecto de licencias remuneradas (Colombia), sembrado al aprovisionar una empresa
// nueva y, para las que ya existían, en cada arranque — mismo criterio que
// config/withholdingTypes.js / config/adminExpenseCategories.js. defaultDurationDays es solo la
// duración SUGERIDA al registrar la novedad (prellena la fecha fin), siempre editable ahí.
const DEFAULT_LEAVE_TYPES = [
  // Ley 1822/2017: 18 semanas de licencia de maternidad, reconocidas por la EPS.
  { name: 'Licencia de maternidad', defaultDurationDays: 126, paidBy: 'eps' },
  // Ley 2114/2021: 2 semanas de licencia de paternidad, reconocidas por la EPS.
  { name: 'Licencia de paternidad', defaultDurationDays: 14, paidBy: 'eps' },
  // Ley 1280/2009: 5 días hábiles de licencia por luto, a cargo del empleador.
  { name: 'Licencia por luto', defaultDurationDays: 5, paidBy: 'empleador' },
  // Art. 57 CST núm. 6: duración no fijada por ley, a criterio de la empresa — a cargo del empleador.
  { name: 'Licencia por calamidad doméstica', defaultDurationDays: 3, paidBy: 'empleador' },
  { name: 'Otra licencia remunerada', defaultDurationDays: null, paidBy: 'empleador' },
];

module.exports = { DEFAULT_LEAVE_TYPES };
