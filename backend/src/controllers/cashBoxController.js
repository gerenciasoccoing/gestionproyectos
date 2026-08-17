const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const { CashBox, CashBoxMovement } = require('../models');
const { getBalance } = require('../services/cashBoxService');

const list = asyncHandler(async (req, res) => {
  const cashBoxes = await CashBox.findAll({ order: [['name', 'ASC']] });
  const withBalance = await Promise.all(cashBoxes.map(async (cb) => ({
    ...cb.toJSON(),
    balance: await getBalance(cb.id),
  })));
  res.json(withBalance);
});

const get = asyncHandler(async (req, res) => {
  const cashBox = await CashBox.findByPk(req.params.id, {
    include: [{ model: CashBoxMovement, as: 'movements', order: [['date', 'DESC']] }],
  });
  if (!cashBox) throw new ApiError(404, 'Caja no encontrada');
  res.json({ ...cashBox.toJSON(), balance: await getBalance(cashBox.id) });
});

const create = asyncHandler(async (req, res) => {
  const { name, initialBalance } = req.body;
  if (!name || !name.trim()) throw new ApiError(400, 'name es obligatorio');
  if (initialBalance === undefined || Number(initialBalance) < 0) throw new ApiError(400, 'initialBalance es obligatorio y no puede ser negativo');

  const cashBox = await CashBox.create({
    name: name.trim(),
    initialBalance,
    createdBy: req.user.id,
  });
  res.status(201).json({ ...cashBox.toJSON(), balance: await getBalance(cashBox.id) });
});

const update = asyncHandler(async (req, res) => {
  const cashBox = await CashBox.findByPk(req.params.id);
  if (!cashBox) throw new ApiError(404, 'Caja no encontrada');
  const { name } = req.body;
  if (name !== undefined) {
    if (!name.trim()) throw new ApiError(400, 'name no puede quedar vacío');
    cashBox.name = name.trim();
  }
  await cashBox.save();
  res.json({ ...cashBox.toJSON(), balance: await getBalance(cashBox.id) });
});

// Activa o cierra la caja. Cerrada: ya no puede elegirse como origen de un gasto nuevo (validado
// en cashBoxService.assertCashBoxUsable), pero conserva todo su historial de ingresos/gastos.
const setStatus = asyncHandler(async (req, res) => {
  const cashBox = await CashBox.findByPk(req.params.id);
  if (!cashBox) throw new ApiError(404, 'Caja no encontrada');
  const { status } = req.body;
  if (!['activa', 'cerrada'].includes(status)) throw new ApiError(400, 'status debe ser activa o cerrada');
  cashBox.status = status;
  await cashBox.save();
  res.json({ ...cashBox.toJSON(), balance: await getBalance(cashBox.id) });
});

// Ingreso/adición de saldo (no se permite negativo: para corregir un ingreso mal digitado se
// espera crear un registro nuevo o contactar a un admin, igual que el resto de la app no expone
// edición de movimientos históricos de dinero).
const addMovement = asyncHandler(async (req, res) => {
  const cashBox = await CashBox.findByPk(req.params.id);
  if (!cashBox) throw new ApiError(404, 'Caja no encontrada');
  const { amount, date, concept } = req.body;
  if (amount === undefined || Number(amount) <= 0) throw new ApiError(400, 'amount es obligatorio y debe ser mayor a 0');
  if (!date) throw new ApiError(400, 'date es obligatorio');
  if (!concept || !concept.trim()) throw new ApiError(400, 'concept es obligatorio');

  await CashBoxMovement.create({
    cashBoxId: cashBox.id,
    amount,
    date,
    concept: concept.trim(),
    createdBy: req.user.id,
  });
  res.status(201).json({ ...cashBox.toJSON(), balance: await getBalance(cashBox.id) });
});

module.exports = { list, get, create, update, setStatus, addMovement };
