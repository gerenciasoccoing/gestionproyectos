const { Op } = require('sequelize');
const { CashBoxMovement, CashBoxMovementWithholding, CashBox, User } = require('../models');
const { getBudgetItemsWithProgress } = require('./budgetService');

// Valor ejecutado del proyecto (avance por ítem, el mismo que muestra el Dashboard de Ejecución —
// ver executionDashboardController.js / reportEngineService.getExecutionSnapshot). A propósito NO
// es el valor con IVA (ver budgetService.sumBudgetItemsWithVat, usado para "valor total del
// contrato"): el saldo real compara lo ejecutado en obra contra lo efectivamente reconocido/pagado
// por el cliente, dos cifras que ya conviven sin IVA en el Dashboard — mezclar bases habría
// distorsionado esa comparación, igual que se decidió al agregar la detección de IVA.
async function getExecutedValue(projectId) {
  const { items } = await getBudgetItemsWithProgress(projectId);
  return items.reduce((sum, i) => sum + Number(i.executedValue), 0);
}

// Todos los ingresos de caja asociados a este proyecto, con sus retenciones y datos de caja/
// usuario para el listado de "Pagos al proyecto". { from, to } (YYYY-MM-DD) y withholdingTypeId
// son opcionales, para los filtros de esa pantalla.
async function getProjectMovements(projectId, { from, to, withholdingTypeId } = {}) {
  const where = { projectId };
  if (from || to) {
    where.date = {};
    if (from) where.date[Op.gte] = from;
    if (to) where.date[Op.lte] = to;
  }
  const movements = await CashBoxMovement.findAll({
    where,
    include: [
      { model: CashBoxMovementWithholding, as: 'withholdings' },
      { model: CashBox, attributes: ['id', 'name'] },
      { model: User, attributes: ['id', 'name'] },
    ],
    order: [['date', 'DESC'], ['createdAt', 'DESC']],
  });
  if (!withholdingTypeId) return movements;
  return movements.filter((m) => m.withholdings.some((w) => w.withholdingTypeId === withholdingTypeId));
}

// Resumen de "Pagos al proyecto": totales (siempre sobre TODOS los pagos del proyecto, sin
// filtro de fecha — los filtros de la pantalla solo acotan el LISTADO, no el resumen ni el saldo
// real, que deben reflejar la realidad completa del proyecto en todo momento, incluido el chequeo
// de cierre). recoverablePending es la suma de retenciones recuperables aún no devueltas, para la
// advertencia informativa del modal de cierre.
async function getProjectPaymentsSummary(projectId) {
  const [executedValue, movements] = await Promise.all([
    getExecutedValue(projectId),
    getProjectMovements(projectId),
  ]);

  const totalGross = movements.reduce((sum, m) => sum + Number(m.grossAmount ?? m.amount), 0);
  const totalNet = movements.reduce((sum, m) => sum + Number(m.amount), 0);

  const withholdingsByType = new Map();
  let recoverablePending = 0;
  for (const m of movements) {
    for (const w of m.withholdings || []) {
      const key = w.typeName;
      const entry = withholdingsByType.get(key) || { typeName: key, total: 0 };
      entry.total += Number(w.value);
      withholdingsByType.set(key, entry);
      if (w.recoverable && !w.returned) recoverablePending += Number(w.value);
    }
  }

  const totalWithholdings = totalGross - totalNet;
  const saldoReal = executedValue - totalGross;
  const percentPaid = executedValue > 0 ? Math.round((totalGross / executedValue) * 10000) / 100 : 0;

  return {
    executedValue,
    totalGross,
    totalWithholdings,
    totalNet,
    withholdingsByType: [...withholdingsByType.values()],
    recoverablePending,
    saldoReal,
    percentPaid,
  };
}

// Usado por projectController.js#update (guarda de cierre): solo necesita el número, no todo el
// resumen — pero reutiliza exactamente el mismo cálculo (una sola fuente de verdad para "saldo
// real", sin importar si lo pide el modal de cierre o la pantalla de Pagos al proyecto).
async function getProjectSaldoReal(projectId) {
  const summary = await getProjectPaymentsSummary(projectId);
  return summary.saldoReal;
}

module.exports = { getExecutedValue, getProjectMovements, getProjectPaymentsSummary, getProjectSaldoReal };
