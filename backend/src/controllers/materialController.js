const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const { Material, MaterialCategory, PurchaseOrder } = require('../models');
const materialCatalogService = require('../services/materialCatalogService');
const { nextMaterialCode } = require('../services/numberingService');
const { getCurrentTransaction } = require('../utils/tenantContext');

const MATERIAL_INCLUDE = [
  { model: MaterialCategory, as: 'category', attributes: ['id', 'name'] },
  { model: PurchaseOrder, as: 'originPurchaseOrder', attributes: ['id', 'orderNumber'] },
];

// Sin filtro por defecto (mismo criterio que adminExpenseCategoryController.js): la pantalla de
// administración necesita ver los inactivos para poder reactivarlos; los selectores de formularios
// (entradas de OC, traslados, salidas) filtran del lado del cliente. Admite ?categoryId= para el
// filtro por categoría del catálogo.
const list = asyncHandler(async (req, res) => {
  const where = {};
  if (req.query.categoryId) where.categoryId = req.query.categoryId;
  const materials = await Material.findAll({ where, include: MATERIAL_INCLUDE, order: [['name', 'ASC']] });
  const costs = await materialCatalogService.getLastPurchaseCosts(materials.map((m) => m.id));
  res.json(materials.map((m) => ({
    ...m.toJSON(),
    lastPurchaseCost: costs.get(m.id)?.unitPrice ?? (m.referenceCost != null ? Number(m.referenceCost) : null),
  })));
});

// Búsqueda del lado del servidor para el selector con autocompletar de la OC (ver
// materialCatalogService.js#searchMaterials) — por prefijo de nombre o código, con respaldo
// "contiene" para sugerir "¿quisiste decir...?" cuando el prefijo no encuentra nada.
const search = asyncHandler(async (req, res) => {
  const { q, categoryId } = req.query;
  const results = await materialCatalogService.searchMaterials({ q, categoryId, limit: 20 });
  res.json(results);
});

const create = asyncHandler(async (req, res) => {
  const { name, unit, description, categoryId, code, referenceCost } = req.body;
  if (!name || !name.trim()) throw new ApiError(400, 'name es obligatorio');
  // nextMaterialCode hace una consulta SQL cruda (fuera del alcance de applyTenantScoping.js, ver
  // numberingService.js) — necesita la transacción ambiente de la petición a mano para que la
  // política RLS (Capa 2) la deje pasar, igual criterio que cualquier otro consecutivo atómico de
  // esta app.
  const transaction = getCurrentTransaction();
  const resolvedCategoryId = categoryId || (await materialCatalogService.getDefaultCategory(transaction)).id;
  const resolvedCode = code && code.trim() ? code.trim() : await nextMaterialCode(transaction);
  try {
    const material = await Material.create({
      name: name.trim(), unit: unit || null, description: description || null, categoryId: resolvedCategoryId,
      code: resolvedCode, origin: 'manual', referenceCost: referenceCost !== undefined && referenceCost !== '' ? referenceCost : null,
    });
    res.status(201).json(material);
  } catch (err) {
    if (err.name === 'SequelizeUniqueConstraintError') {
      throw new ApiError(409, 'Ya existe un material con ese nombre y unidad, o ese código ya está en uso.');
    }
    throw err;
  }
});

const update = asyncHandler(async (req, res) => {
  const material = await Material.findByPk(req.params.id);
  if (!material) throw new ApiError(404, 'Material no encontrado');
  const { name, unit, description, categoryId, code, referenceCost } = req.body;
  if (name !== undefined) {
    if (!name.trim()) throw new ApiError(400, 'name no puede quedar vacío');
    material.name = name.trim();
  }
  if (unit !== undefined) material.unit = unit || null;
  if (description !== undefined) material.description = description || null;
  if (referenceCost !== undefined) material.referenceCost = referenceCost !== '' ? referenceCost : null;
  if (categoryId !== undefined) {
    if (categoryId) {
      const category = await MaterialCategory.findByPk(categoryId);
      if (!category) throw new ApiError(400, 'Categoría no encontrada');
    }
    material.categoryId = categoryId || null;
  }
  if (code !== undefined) material.code = code && code.trim() ? code.trim() : null;
  try {
    await material.save();
  } catch (err) {
    if (err.name === 'SequelizeUniqueConstraintError') {
      throw new ApiError(409, 'Ya existe un material con ese nombre y unidad, o ese código ya está en uso.');
    }
    throw err;
  }
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

// Recategorización masiva (ver la especificación: "acción masiva para seleccionar varios
// materiales y cambiarles la categoría a la vez").
const bulkRecategorize = asyncHandler(async (req, res) => {
  const { materialIds, categoryId } = req.body;
  if (!Array.isArray(materialIds) || !materialIds.length) throw new ApiError(400, 'materialIds es obligatorio');
  if (!categoryId) throw new ApiError(400, 'categoryId es obligatorio');
  const count = await materialCatalogService.bulkRecategorize(materialIds, categoryId);
  res.json({ updated: count });
});

const merge = asyncHandler(async (req, res) => {
  const { intoMaterialId } = req.body;
  if (!intoMaterialId) throw new ApiError(400, 'intoMaterialId es obligatorio');
  const survivor = await materialCatalogService.mergeMaterials({ survivorMaterialId: intoMaterialId, loserMaterialId: req.params.id });
  res.json(survivor);
});

// Eliminar (borrado real): solo si el material nunca se usó en ninguna OC ni movimiento de bodega
// (ver materialCatalogService.js#assertMaterialDeletable) — si tiene historia, se rechaza con un
// mensaje claro y la UI ofrece desactivar en su lugar.
const remove = asyncHandler(async (req, res) => {
  const material = await Material.findByPk(req.params.id);
  if (!material) throw new ApiError(404, 'Material no encontrado');
  await materialCatalogService.assertMaterialDeletable(material.id);
  await material.destroy();
  res.status(204).end();
});

module.exports = { list, search, create, update, setStatus, bulkRecategorize, merge, remove };
