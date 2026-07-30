const { Contract, Milestone, Expense, ProgressEntry } = require('../models');
const { getBudgetItemsWithProgress } = require('./budgetService');

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

async function getProjectTimeframe(projectId) {
  const contract = await Contract.findOne({ where: { projectId }, order: [['signedDate', 'ASC']] });
  if (contract) return { start: new Date(contract.signedDate), end: new Date(contract.endDate) };

  const milestones = await Milestone.findAll({ where: { projectId }, order: [['plannedDate', 'ASC']] });
  if (milestones.length) {
    return {
      start: new Date(milestones[0].plannedDate),
      end: new Date(milestones[milestones.length - 1].plannedDate),
    };
  }
  const now = new Date();
  return { start: now, end: now };
}

// Indicadores de Valor Ganado (EVM). PV se aproxima linealmente entre el inicio y fin
// contractual/planeado del proyecto sobre el valor total del presupuesto (línea base),
// ante ausencia de una curva de avance planeado explícita por ítem/fecha.
async function computeEVM(projectId, asOfDate = new Date()) {
  const { items } = await getBudgetItemsWithProgress(projectId);
  const { start, end } = await getProjectTimeframe(projectId);

  const budgetAtCompletion = items.reduce((sum, i) => sum + Number(i.totalCost), 0);
  const EV = items.reduce((sum, i) => sum + Number(i.executedValue), 0);

  const totalMs = end.getTime() - start.getTime();
  const elapsedMs = new Date(asOfDate).getTime() - start.getTime();
  const elapsedFraction = totalMs > 0 ? clamp(elapsedMs / totalMs, 0, 1) : 1;
  const PV = budgetAtCompletion * elapsedFraction;

  const expenses = await Expense.findAll({ where: { projectId } });
  const AC = expenses.reduce((sum, e) => sum + Number(e.amount), 0);

  const CV = EV - AC;
  const SV = EV - PV;
  const CPI = AC > 0 ? EV / AC : null;
  const SPI = PV > 0 ? EV / PV : null;

  return {
    asOfDate, start, end, budgetAtCompletion,
    PV, EV, AC, CV, SV, CPI, SPI,
  };
}

// Curva S: puntos mensuales de PV acumulado (planeado, lineal) vs EV/AC acumulado (real).
async function computeSCurve(projectId) {
  const { items } = await getBudgetItemsWithProgress(projectId);
  const { start, end } = await getProjectTimeframe(projectId);
  const budgetAtCompletion = items.reduce((sum, i) => sum + Number(i.totalCost), 0);

  const budgetItemIds = items.map((i) => i.id);
  const entries = budgetItemIds.length
    ? await ProgressEntry.findAll({ where: { budgetItemId: budgetItemIds } })
    : [];
  const expenses = await Expense.findAll({ where: { projectId } });

  const unitCostByItem = Object.fromEntries(items.map((i) => [i.id, Number(i.unitCost)]));

  const months = [];
  const cursor = new Date(start.getFullYear(), start.getMonth(), 1);
  const last = new Date(end.getFullYear(), end.getMonth(), 1);
  while (cursor <= last) {
    months.push(new Date(cursor));
    cursor.setMonth(cursor.getMonth() + 1);
  }
  if (months.length === 0) months.push(new Date(start));

  const totalMs = end.getTime() - start.getTime();

  return months.map((monthDate) => {
    const monthEnd = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0);
    const elapsedMs = monthEnd.getTime() - start.getTime();
    const fraction = totalMs > 0 ? clamp(elapsedMs / totalMs, 0, 1) : 1;
    const planned = budgetAtCompletion * fraction;

    const actualEV = entries
      .filter((e) => new Date(e.date) <= monthEnd)
      .reduce((sum, e) => sum + Number(e.quantityExecuted) * (unitCostByItem[e.budgetItemId] || 0), 0);

    const actualAC = expenses
      .filter((e) => new Date(e.date) <= monthEnd)
      .reduce((sum, e) => sum + Number(e.amount), 0);

    return {
      month: `${monthDate.getFullYear()}-${String(monthDate.getMonth() + 1).padStart(2, '0')}`,
      planned,
      actualEV,
      actualAC,
    };
  });
}

module.exports = { computeEVM, computeSCurve, getProjectTimeframe };
