const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const { Category } = require('../models');

function slugify(text) {
  return String(text).toLowerCase().trim()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

const list = asyncHandler(async (req, res) => {
  const categories = await Category.findAll({ where: { tenantId: req.staff.tenantId }, order: [['name', 'ASC']] });
  res.json(categories);
});

const create = asyncHandler(async (req, res) => {
  const { name, active } = req.body;
  if (!name) throw new ApiError(400, 'El nombre es obligatorio');
  const category = await Category.create({
    tenantId: req.staff.tenantId, name, slug: slugify(name), active: active !== false,
  });
  res.status(201).json(category);
});

const update = asyncHandler(async (req, res) => {
  const category = await Category.findOne({ where: { id: req.params.id, tenantId: req.staff.tenantId } });
  if (!category) throw new ApiError(404, 'Categoría no encontrada');
  const { name, active } = req.body;
  await category.update({
    ...(name !== undefined && { name, slug: slugify(name) }),
    ...(active !== undefined && { active }),
  });
  res.json(category);
});

const remove = asyncHandler(async (req, res) => {
  const category = await Category.findOne({ where: { id: req.params.id, tenantId: req.staff.tenantId } });
  if (!category) throw new ApiError(404, 'Categoría no encontrada');
  await category.destroy();
  res.status(204).send();
});

module.exports = {
  list, create, update, remove, slugify,
};
