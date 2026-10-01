const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const { LeaveType } = require('../models');

// Sin filtro por defecto: la pantalla de administración necesita ver las inactivas también, y el
// selector de novedades filtra las inactivas del lado del cliente — mismo criterio que
// withholdingTypeController.list.
const list = asyncHandler(async (req, res) => {
  const types = await LeaveType.findAll({ order: [['name', 'ASC']] });
  res.json(types);
});

const create = asyncHandler(async (req, res) => {
  const { name, defaultDurationDays, paidBy } = req.body;
  if (!name || !name.trim()) throw new ApiError(400, 'name es obligatorio');
  if (!['empleador', 'eps', 'arl'].includes(paidBy)) throw new ApiError(400, 'paidBy debe ser empleador, eps o arl');

  const type = await LeaveType.create({
    name: name.trim(),
    defaultDurationDays: defaultDurationDays === '' || defaultDurationDays === undefined ? null : Number(defaultDurationDays),
    paidBy,
    createdBy: req.user.id,
  });
  res.status(201).json(type);
});

// No se permite eliminar: un tipo ya usado en una novedad no se puede borrar sin dejar huérfana esa
// novedad — solo se edita o desactiva (status abajo).
const update = asyncHandler(async (req, res) => {
  const type = await LeaveType.findByPk(req.params.id);
  if (!type) throw new ApiError(404, 'Tipo de licencia no encontrado');
  const { name, defaultDurationDays, paidBy } = req.body;
  if (name !== undefined) {
    if (!name.trim()) throw new ApiError(400, 'name no puede quedar vacío');
    type.name = name.trim();
  }
  if (defaultDurationDays !== undefined) {
    type.defaultDurationDays = defaultDurationDays === '' ? null : Number(defaultDurationDays);
  }
  if (paidBy !== undefined) {
    if (!['empleador', 'eps', 'arl'].includes(paidBy)) throw new ApiError(400, 'paidBy debe ser empleador, eps o arl');
    type.paidBy = paidBy;
  }
  await type.save();
  res.json(type);
});

const setStatus = asyncHandler(async (req, res) => {
  const type = await LeaveType.findByPk(req.params.id);
  if (!type) throw new ApiError(404, 'Tipo de licencia no encontrado');
  const { active } = req.body;
  if (typeof active !== 'boolean') throw new ApiError(400, 'active debe ser true o false');
  type.active = active;
  await type.save();
  res.json(type);
});

module.exports = { list, create, update, setStatus };
