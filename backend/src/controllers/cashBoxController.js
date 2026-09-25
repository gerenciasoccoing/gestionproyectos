const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const { CashBox, CashBoxMovement, CashBoxMovementWithholding, Project, User } = require('../models');
const { getBalance, getBalancesForCashBoxes } = require('../services/cashBoxService');
const { createMovement, updateMovement: updateMovementService, deleteMovement } = require('../services/cashBoxMovementService');
const { relativePath } = require('../middleware/upload');

const MOVEMENT_INCLUDE = [
  { model: CashBoxMovementWithholding, as: 'withholdings' },
  { model: Project, attributes: ['id', 'name', 'contractNumber'] },
  { model: User, attributes: ['id', 'name'] },
];

const list = asyncHandler(async (req, res) => {
  const cashBoxes = await CashBox.findAll({ order: [['name', 'ASC']] });
  const balances = await getBalancesForCashBoxes(cashBoxes);
  res.json(cashBoxes.map((cb) => ({ ...cb.toJSON(), balance: balances.get(cb.id) })));
});

const get = asyncHandler(async (req, res) => {
  const cashBox = await CashBox.findByPk(req.params.id, {
    include: [{ model: CashBoxMovement, as: 'movements', include: MOVEMENT_INCLUDE, order: [['date', 'DESC']] }],
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

// El body llega como multipart/form-data (por el soporte de pago opcional): withholdings viaja
// serializado como JSON en un campo de texto, no como array nativo.
function parseWithholdings(body) {
  if (!body.withholdings) return [];
  if (Array.isArray(body.withholdings)) return body.withholdings;
  try {
    const parsed = JSON.parse(body.withholdings);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    throw new ApiError(400, 'withholdings debe ser un JSON válido');
  }
}

// El proyecto asociado (opcional) solo puede ser uno al que el usuario tenga acceso — mismo
// criterio que requireProjectAccess, pero acá el projectId viene del body (no de la URL), así que
// se valida a mano en vez de como middleware.
function assertProjectAccess(req, projectId) {
  if (!projectId) return;
  if (req.user.isAdmin) return;
  if (!req.user.projectIds.includes(projectId)) {
    throw new ApiError(403, 'No tiene acceso al proyecto seleccionado');
  }
}

// Ingreso/adición de saldo a la caja. Sin proyecto: monto/fecha/concepto, igual que siempre. Con
// proyecto: valor bruto + retenciones opcionales (ver cashBoxMovementService.js), y el saldo de la
// caja aumenta solo en el NETO — o es una devolución de retención puntual (isWithholdingReturn).
const addMovement = asyncHandler(async (req, res) => {
  const cashBox = await CashBox.findByPk(req.params.id);
  if (!cashBox) throw new ApiError(404, 'Caja no encontrada');
  const projectId = req.body.projectId || null;
  assertProjectAccess(req, projectId);

  await createMovement({
    cashBoxId: cashBox.id,
    body: {
      ...req.body,
      projectId,
      withholdings: parseWithholdings(req.body),
      isWithholdingReturn: req.body.isWithholdingReturn === true || req.body.isWithholdingReturn === 'true',
      supportFilePath: req.file ? relativePath(req.file) : null,
    },
    userId: req.user.id,
  });
  res.status(201).json({ ...cashBox.toJSON(), balance: await getBalance(cashBox.id) });
});

const updateMovement = asyncHandler(async (req, res) => {
  const cashBox = await CashBox.findByPk(req.params.id);
  if (!cashBox) throw new ApiError(404, 'Caja no encontrada');
  const movement = await CashBoxMovement.findOne({ where: { id: req.params.movementId, cashBoxId: cashBox.id } });
  if (!movement) throw new ApiError(404, 'Ingreso no encontrado');
  const projectId = req.body.projectId !== undefined ? (req.body.projectId || null) : movement.projectId;
  assertProjectAccess(req, projectId);

  await updateMovementService(movement, {
    ...req.body,
    projectId,
    withholdings: parseWithholdings(req.body),
    isWithholdingReturn: req.body.isWithholdingReturn === true || req.body.isWithholdingReturn === 'true',
    supportFilePath: req.file ? relativePath(req.file) : undefined,
  });
  res.json({ ...cashBox.toJSON(), balance: await getBalance(cashBox.id) });
});

const removeMovement = asyncHandler(async (req, res) => {
  const cashBox = await CashBox.findByPk(req.params.id);
  if (!cashBox) throw new ApiError(404, 'Caja no encontrada');
  const movement = await CashBoxMovement.findOne({ where: { id: req.params.movementId, cashBoxId: cashBox.id } });
  if (!movement) throw new ApiError(404, 'Ingreso no encontrado');
  await deleteMovement(movement);
  res.json({ ...cashBox.toJSON(), balance: await getBalance(cashBox.id) });
});

module.exports = { list, get, create, update, setStatus, addMovement, updateMovement, removeMovement };
