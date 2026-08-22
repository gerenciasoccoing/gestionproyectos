const ApiError = require('../utils/ApiError');
const { CashBox, CashBoxMovement, Expense } = require('../models');

// Saldo calculado en vivo (no se guarda en columna, ver comentario en el modelo CashBox):
// saldo inicial + ingresos (CashBoxMovement) - gastos registrados con esta caja (Expense.cashBoxId).
async function getBalance(cashBoxId, { transaction } = {}) {
  const cashBox = await CashBox.findByPk(cashBoxId, { transaction });
  if (!cashBox) return null;
  // Secuencial, no Promise.all: dentro de una petición HTTP ambas consultas comparten la misma
  // transacción/conexión (por RLS, ver middleware/auth.js), y Postgres no procesa dos consultas a
  // la vez sobre la misma conexión.
  const movements = await CashBoxMovement.findAll({ where: { cashBoxId }, transaction });
  const expenses = await Expense.findAll({ where: { cashBoxId }, transaction });
  const income = movements.reduce((sum, m) => sum + Number(m.amount), 0);
  const spent = expenses.reduce((sum, e) => sum + Number(e.amount), 0);
  return Number(cashBox.initialBalance) + income - spent;
}

// Igual que getBalance, pero para varias cajas a la vez con 2 consultas totales (no 2 por caja):
// usada por cashBoxController#list, que se pide en casi cualquier pantalla con selector de caja
// (Órdenes de Compra, Gastos, Proveedores...). Devuelve un Map cashBoxId -> saldo.
async function getBalancesForCashBoxes(cashBoxes) {
  const ids = cashBoxes.map((cb) => cb.id);
  const movements = await CashBoxMovement.findAll({ where: { cashBoxId: ids } });
  const expenses = await Expense.findAll({ where: { cashBoxId: ids } });
  const incomeById = new Map();
  for (const m of movements) incomeById.set(m.cashBoxId, (incomeById.get(m.cashBoxId) || 0) + Number(m.amount));
  const spentById = new Map();
  for (const e of expenses) spentById.set(e.cashBoxId, (spentById.get(e.cashBoxId) || 0) + Number(e.amount));

  const balances = new Map();
  for (const cb of cashBoxes) {
    balances.set(cb.id, Number(cb.initialBalance) + (incomeById.get(cb.id) || 0) - (spentById.get(cb.id) || 0));
  }
  return balances;
}

// Valida que la caja exista y esté activa (una caja cerrada no puede elegirse como origen de un
// gasto nuevo). No valida saldo suficiente: el sobregiro está permitido explícitamente, con
// advertencia (ver overdraftWarning) en vez de bloqueo.
async function assertCashBoxUsable(cashBoxId, { transaction } = {}) {
  if (!cashBoxId) throw new ApiError(400, 'cashBoxId es obligatorio');
  const cashBox = await CashBox.findByPk(cashBoxId, { transaction });
  if (!cashBox) throw new ApiError(404, 'Caja no encontrada');
  if (cashBox.status !== 'activa') {
    throw new ApiError(400, `La caja "${cashBox.name}" está cerrada y no puede usarse como origen de un gasto`);
  }
  return cashBox;
}

// Se llama DESPUÉS de crear el Expense (misma transacción) para conocer el saldo resultante real.
// Devuelve un mensaje de advertencia (no lanza error) si el saldo quedó negativo.
async function overdraftWarning(cashBoxId, { transaction } = {}) {
  const balance = await getBalance(cashBoxId, { transaction });
  if (balance === null || balance >= 0) return null;
  const cashBox = await CashBox.findByPk(cashBoxId, { transaction });
  return `Este gasto dejó la caja "${cashBox.name}" en saldo negativo (${balance.toFixed(2)}).`;
}

module.exports = { getBalance, getBalancesForCashBoxes, assertCashBoxUsable, overdraftWarning };
