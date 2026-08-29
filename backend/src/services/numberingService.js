const { Expense, Project } = require('../models');

// Consecutivo de Gastos (no existía antes de este servicio): mismo patrón que
// purchaseOrderService.js#nextOrderNumber (MAX + 1 dentro de la transacción de la petición, para
// que dos creaciones simultáneas no colisionen). Los gastos creados antes de este campo quedan con
// expenseNumber null, nunca se les asigna nada retroactivo.
async function nextExpenseNumber(transaction) {
  const max = await Expense.max('expenseNumber', { transaction });
  return (max || 0) + 1;
}

// Primeros 3 dígitos de Project.contractNumber, para usar como prefijo visual en gastos/órdenes
// de compra/contratos laborales AL MOMENTO DE CREARSE cada uno — null si el proyecto no tiene
// número de contrato asignado (comportamiento sin cambios: se crea igual, solo sin prefijo) o si
// el registro no tiene proyecto. Se guarda en el registro mismo (no se recalcula después) para que
// cambiar el número del contrato más adelante no altere el prefijo de lo ya creado.
async function contractPrefixForProject(projectId, transaction) {
  if (!projectId) return null;
  const project = await Project.findByPk(projectId, { transaction });
  if (!project?.contractNumber) return null;
  return project.contractNumber.slice(0, 3);
}

module.exports = { nextExpenseNumber, contractPrefixForProject };
