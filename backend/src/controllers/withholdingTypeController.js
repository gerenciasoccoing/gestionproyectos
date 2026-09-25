const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const { WithholdingType } = require('../models');

// Sin filtro por defecto: la pantalla de administración necesita ver los inactivos también (para
// poder reactivarlos), y el selector de retenciones del formulario de ingreso filtra los inactivos
// del lado del cliente. Si algún día el catálogo crece mucho, se puede agregar ?active=true acá.
const list = asyncHandler(async (req, res) => {
  const types = await WithholdingType.findAll({ order: [['name', 'ASC']] });
  res.json(types);
});

const create = asyncHandler(async (req, res) => {
  const { name, defaultPercent, recoverable } = req.body;
  if (!name || !name.trim()) throw new ApiError(400, 'name es obligatorio');
  const percent = defaultPercent !== undefined ? Number(defaultPercent) : 0;
  if (Number.isNaN(percent) || percent < 0 || percent > 100) throw new ApiError(400, 'defaultPercent debe estar entre 0 y 100');

  const type = await WithholdingType.create({
    name: name.trim(),
    defaultPercent: percent,
    recoverable: Boolean(recoverable),
    createdBy: req.user.id,
  });
  res.status(201).json(type);
});

// No se permite eliminar (ver DELETE ausente a propósito): un tipo ya usado en un pago no se puede
// borrar sin dejar huérfanas sus retenciones — solo se edita o desactiva (status abajo).
const update = asyncHandler(async (req, res) => {
  const type = await WithholdingType.findByPk(req.params.id);
  if (!type) throw new ApiError(404, 'Tipo de retención no encontrado');
  const { name, defaultPercent, recoverable } = req.body;
  if (name !== undefined) {
    if (!name.trim()) throw new ApiError(400, 'name no puede quedar vacío');
    type.name = name.trim();
  }
  if (defaultPercent !== undefined) {
    const percent = Number(defaultPercent);
    if (Number.isNaN(percent) || percent < 0 || percent > 100) throw new ApiError(400, 'defaultPercent debe estar entre 0 y 100');
    type.defaultPercent = percent;
  }
  if (recoverable !== undefined) type.recoverable = Boolean(recoverable);
  await type.save();
  res.json(type);
});

const setStatus = asyncHandler(async (req, res) => {
  const type = await WithholdingType.findByPk(req.params.id);
  if (!type) throw new ApiError(404, 'Tipo de retención no encontrado');
  const { active } = req.body;
  if (typeof active !== 'boolean') throw new ApiError(400, 'active debe ser true o false');
  type.active = active;
  await type.save();
  res.json(type);
});

module.exports = { list, create, update, setStatus };
