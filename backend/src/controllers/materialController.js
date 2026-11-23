const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const { Material } = require('../models');

// Sin filtro por defecto (mismo criterio que adminExpenseCategoryController.js): la pantalla de
// administración necesita ver los inactivos para poder reactivarlos; los selectores de formularios
// (entradas de OC, traslados, salidas) filtran del lado del cliente.
const list = asyncHandler(async (req, res) => {
  const materials = await Material.findAll({ order: [['name', 'ASC']] });
  res.json(materials);
});

const create = asyncHandler(async (req, res) => {
  const { name, unit } = req.body;
  if (!name || !name.trim()) throw new ApiError(400, 'name es obligatorio');
  const existing = await Material.findOne({ where: { name: name.trim() } });
  if (existing) throw new ApiError(409, 'Ya existe un material con ese nombre');
  const material = await Material.create({ name: name.trim(), unit: unit || null });
  res.status(201).json(material);
});

const update = asyncHandler(async (req, res) => {
  const material = await Material.findByPk(req.params.id);
  if (!material) throw new ApiError(404, 'Material no encontrado');
  const { name, unit } = req.body;
  if (name !== undefined) {
    if (!name.trim()) throw new ApiError(400, 'name no puede quedar vacío');
    material.name = name.trim();
  }
  if (unit !== undefined) material.unit = unit || null;
  await material.save();
  res.json(material);
});

const setStatus = asyncHandler(async (req, res) => {
  const material = await Material.findByPk(req.params.id);
  if (!material) throw new ApiError(404, 'Material no encontrado');
  const { active } = req.body;
  if (typeof active !== 'boolean') throw new ApiError(400, 'active debe ser true o false');
  material.active = active;
  await material.save();
  res.json(material);
});

module.exports = { list, create, update, setStatus };
