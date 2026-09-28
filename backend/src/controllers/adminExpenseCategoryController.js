const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const { AdminExpenseCategory } = require('../models');

// Sin filtro por defecto: la pantalla de administración necesita ver las inactivas también (para
// poder reactivarlas), y el selector del formulario de gasto administrativo filtra las inactivas
// del lado del cliente. Mismo criterio que withholdingTypeController.list.
const list = asyncHandler(async (req, res) => {
  const categories = await AdminExpenseCategory.findAll({ order: [['name', 'ASC']] });
  res.json(categories);
});

const create = asyncHandler(async (req, res) => {
  const { name } = req.body;
  if (!name || !name.trim()) throw new ApiError(400, 'name es obligatorio');

  const category = await AdminExpenseCategory.create({
    name: name.trim(),
    createdBy: req.user.id,
  });
  res.status(201).json(category);
});

// No se permite eliminar (ver DELETE ausente a propósito): una categoría ya usada en un gasto no
// se puede borrar sin dejar huérfanos esos gastos — solo se edita o desactiva (status abajo).
const update = asyncHandler(async (req, res) => {
  const category = await AdminExpenseCategory.findByPk(req.params.id);
  if (!category) throw new ApiError(404, 'Categoría no encontrada');
  const { name } = req.body;
  if (name !== undefined) {
    if (!name.trim()) throw new ApiError(400, 'name no puede quedar vacío');
    category.name = name.trim();
  }
  await category.save();
  res.json(category);
});

const setStatus = asyncHandler(async (req, res) => {
  const category = await AdminExpenseCategory.findByPk(req.params.id);
  if (!category) throw new ApiError(404, 'Categoría no encontrada');
  const { active } = req.body;
  if (typeof active !== 'boolean') throw new ApiError(400, 'active debe ser true o false');
  category.active = active;
  await category.save();
  res.json(category);
});

module.exports = { list, create, update, setStatus };
