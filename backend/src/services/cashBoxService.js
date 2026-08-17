const ApiError = require('../utils/ApiError');
const { CashBox, CashBoxMovement, Expense } = require('../models');

// Saldo calculado en vivo (no se guarda en columna, ver comentario en el modelo CashBox):
// saldo inicial + ingresos (CashBoxMovement) - gastos registrados con esta caja (Expense.cashBoxId).
async function getBalance(cashBoxId, { transaction } = {}) {
  const cashBox = await CashBox.findByPk(cashBoxId, { transaction });
  if (!cashBox) return null;
  const [movements, expenses] = await Promise.all([
    CashBoxMovement.findAll({ where: { cashBoxId }, transaction }),
    Expense.findAll({ where: { cashBoxId }, transaction }),
  ]);
  const income = movements.reduce((sum, m) => sum + Number(m.amount), 0);
  const spent = expenses.reduce((sum, e) => sum + Number(e.amount), 0);
  return Number(cashBox.initialBalance) + income - spent;
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

module.exports = { getBalance, assertCashBoxUsable, overdraftWarning };
