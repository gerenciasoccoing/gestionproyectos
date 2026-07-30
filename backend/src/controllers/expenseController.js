const { Op } = require('sequelize');
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const { Expense, ExpenseBudget } = require('../models');
const { relativePath } = require('../middleware/upload');

const CATEGORIES = ['mano_obra', 'materiales', 'equipos', 'viaticos', 'imprevistos'];

const list = asyncHandler(async (req, res) => {
  const { from, to, category } = req.query;
  const where = { projectId: req.params.projectId };
  if (category) where.category = category;
  if (from || to) {
    where.date = {};
    if (from) where.date[Op.gte] = from;
    if (to) where.date[Op.lte] = to;
  }
  const expenses = await Expense.findAll({ where, order: [['date', 'DESC']] });
  res.json(expenses);
});

const create = asyncHandler(async (req, res) => {
  const { category, amount, date, description } = req.body;
  if (!category || !CATEGORIES.includes(category)) throw new ApiError(400, `category debe ser uno de: ${CATEGORIES.join(', ')}`);
  if (amount === undefined || Number(amount) < 0) throw new ApiError(400, 'amount es obligatorio y no puede ser negativo');
  if (!date) throw new ApiError(400, 'date es obligatorio');

  const expense = await Expense.create({
    projectId: req.params.projectId,
    category,
    amount,
    date,
    description,
    supportFilePath: relativePath(req.file),
    source: 'manual',
    createdBy: req.user.id,
  });
  res.status(201).json(expense);
});

const update = asyncHandler(async (req, res) => {
  const expense = await Expense.findOne({ where: { id: req.params.id, projectId: req.params.projectId } });
  if (!expense) throw new ApiError(404, 'Gasto no encontrado');
  if (expense.source !== 'manual') throw new ApiError(400, 'Este gasto se generó automáticamente y no puede editarse manualmente');

  const { category, amount, date, description } = req.body;
  if (category !== undefined) {
    if (!CATEGORIES.includes(category)) throw new ApiError(400, `category debe ser uno de: ${CATEGORIES.join(', ')}`);
    expense.category = category;
  }
  if (amount !== undefined) {
    if (Number(amount) < 0) throw new ApiError(400, 'amount no puede ser negativo');
    expense.amount = amount;
  }
  if (date !== undefined) expense.date = date;
  if (description !== undefined) expense.description = description;
  if (req.file) expense.supportFilePath = relativePath(req.file);
  await expense.save();
  res.json(expense);
});

const remove = asyncHandler(async (req, res) => {
  const expense = await Expense.findOne({ where: { id: req.params.id, projectId: req.params.projectId } });
  if (!expense) throw new ApiError(404, 'Gasto no encontrado');
  if (expense.source !== 'manual') throw new ApiError(400, 'Este gasto se generó automáticamente y no puede eliminarse manualmente');
  await expense.destroy();
  res.status(204).send();
});

// Presupuesto por categoría (para el consolidado presupuesto vs. gasto vs. saldo).
const setBudget = asyncHandler(async (req, res) => {
  const { category, budgetedAmount } = req.body;
  if (!CATEGORIES.includes(category)) throw new ApiError(400, `category debe ser uno de: ${CATEGORIES.join(', ')}`);
  if (budgetedAmount === undefined || Number(budgetedAmount) < 0) throw new ApiError(400, 'budgetedAmount no puede ser negativo');

  const [budget] = await ExpenseBudget.findOrCreate({
    where: { projectId: req.params.projectId, category },
    defaults: { budgetedAmount },
  });
  budget.budgetedAmount = budgetedAmount;
  await budget.save();
  res.json(budget);
});

// Vista consolidada: presupuesto vs. gasto acumulado vs. saldo disponible, por categoría.
const summary = asyncHandler(async (req, res) => {
  const [budgets, expenses] = await Promise.all([
    ExpenseBudget.findAll({ where: { projectId: req.params.projectId } }),
    Expense.findAll({ where: { projectId: req.params.projectId } }),
  ]);

  const summaryRows = CATEGORIES.map((category) => {
    const budgeted = budgets.find((b) => b.category === category);
    const budgetedAmount = budgeted ? Number(budgeted.budgetedAmount) : 0;
    const spent = expenses.filter((e) => e.category === category).reduce((sum, e) => sum + Number(e.amount), 0);
    return {
      category,
      budgetedAmount,
      spent,
      available: budgetedAmount - spent,
    };
  });

  res.json({
    rows: summaryRows,
    totals: {
      budgetedAmount: summaryRows.reduce((s, r) => s + r.budgetedAmount, 0),
      spent: summaryRows.reduce((s, r) => s + r.spent, 0),
      available: summaryRows.reduce((s, r) => s + r.available, 0),
    },
  });
});

module.exports = { list, create, update, remove, setBudget, summary };
