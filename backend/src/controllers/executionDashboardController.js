const asyncHandler = require('../utils/asyncHandler');
const { Expense } = require('../models');
const { getBudgetItemsWithProgress } = require('../services/budgetService');

// Dashboard de ejecución: % avance físico, valor ejecutado y valor de gastos, calculados
// en el momento a partir de datos ya registrados (sin caché), para reflejar cambios "en tiempo real".
const getDashboard = asyncHandler(async (req, res) => {
  const projectId = req.params.projectId;
  const { budget, items } = await getBudgetItemsWithProgress(projectId);

  const totalBudgetedValue = items.reduce((sum, i) => sum + Number(i.totalCost), 0);
  const totalExecutedValue = items.reduce((sum, i) => sum + Number(i.executedValue), 0);
  const totalBudgetedQty = items.reduce((sum, i) => sum + Number(i.quantity), 0);
  const totalAccumulatedQty = items.reduce((sum, i) => sum + Number(i.accumulatedQty), 0);
  const physicalProgressPercent = totalBudgetedQty > 0
    ? Math.round((totalAccumulatedQty / totalBudgetedQty) * 10000) / 100
    : 0;

  const expenses = await Expense.findAll({ where: { projectId } });
  const totalExpenses = expenses.reduce((sum, e) => sum + Number(e.amount), 0);
  const expensesByCategory = ['mano_obra', 'materiales', 'equipos', 'viaticos', 'imprevistos'].map((category) => ({
    category,
    amount: expenses.filter((e) => e.category === category).reduce((sum, e) => sum + Number(e.amount), 0),
  }));

  res.json({
    budgetId: budget ? budget.id : null,
    physicalProgressPercent,
    executedValue: totalExecutedValue,
    budgetedValue: totalBudgetedValue,
    expensesValue: totalExpenses,
    expensesByCategory,
    items: items.map((i) => ({
      id: i.id,
      description: i.description,
      unit: i.unit,
      quantity: Number(i.quantity),
      accumulatedQty: i.accumulatedQty,
      percent: i.percent,
      unitCost: Number(i.unitCost),
      executedValue: i.executedValue,
      totalCost: Number(i.totalCost),
    })),
  });
});

module.exports = { getDashboard };
