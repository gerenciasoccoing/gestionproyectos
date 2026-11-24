const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const { MaterialCategory, Material } = require('../models');

// Sin filtro por defecto (mismo criterio que materialController.js/adminExpenseCategoryController.js):
// la pantalla de administración necesita ver las inactivas para poder reactivarlas; los selectores
// de formularios filtran del lado del cliente.
const list = asyncHandler(async (req, res) => {
  const categories = await MaterialCategory.findAll({ order: [['name', 'ASC']] });
  const counts = await Material.findAll({
    attributes: ['categoryId', [Material.sequelize.fn('COUNT', Material.sequelize.col('id')), 'count']],
    where: { active: true },
    group: ['categoryId'],
    raw: true,
  });
  const countByCategory = new Map(counts.map((c) => [c.categoryId, Number(c.count)]));
  res.json(categories.map((c) => ({ ...c.toJSON(), materialCount: countByCategory.get(c.id) || 0 })));
});

const create = asyncHandler(async (req, res) => {
  const { name } = req.body;
  if (!name || !name.trim()) throw new ApiError(400, 'name es obligatorio');
  const existing = await MaterialCategory.findOne({ where: { name: name.trim() } });
  if (existing) throw new ApiError(409, 'Ya existe una categoría con ese nombre');
  const category = await MaterialCategory.create({ name: name.trim() });
  res.status(201).json(category);
});

const update = asyncHandler(async (req, res) => {
  const category = await MaterialCategory.findByPk(req.params.id);
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
  const category = await MaterialCategory.findByPk(req.params.id);
  if (!category) throw new ApiError(404, 'Categoría no encontrada');
  const { active } = req.body;
  if (typeof active !== 'boolean') throw new ApiError(400, 'active debe ser true o false');
  if (category.isDefault && !active) throw new ApiError(400, 'La categoría "Materiales" no se puede desactivar.');
  category.active = active;
  await category.save();
  res.json(category);
});

// Eliminar: nunca la categoría por defecto ("Materiales" no se puede eliminar, ver la
// especificación), y solo si no tiene materiales activos ni inactivos — si los tiene, se pide
// reasignarlos primero (ver materialController.js#bulkRecategorize) en vez de borrarlos en cascada.
const remove = asyncHandler(async (req, res) => {
  const category = await MaterialCategory.findByPk(req.params.id);
  if (!category) throw new ApiError(404, 'Categoría no encontrada');
  if (category.isDefault) throw new ApiError(400, 'La categoría "Materiales" no se puede eliminar.');
  const materialCount = await Material.count({ where: { categoryId: category.id } });
  if (materialCount > 0) {
    throw new ApiError(409, `Esta categoría tiene ${materialCount} material(es) asignado(s). Reasígnelos a otra categoría antes de eliminarla.`);
  }
  await category.destroy();
  res.status(204).end();
});

module.exports = { list, create, update, setStatus, remove };
