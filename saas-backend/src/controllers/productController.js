const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const { Product, Category } = require('../models');
const { relativePath } = require('../middleware/upload');
const { slugify } = require('./categoryController');

const list = asyncHandler(async (req, res) => {
  const where = { tenantId: req.staff.tenantId };
  if (req.query.categoryId) where.categoryId = req.query.categoryId;
  const products = await Product.findAll({
    where, include: [Category], order: [['createdAt', 'DESC']],
  });
  res.json(products);
});

const getOne = asyncHandler(async (req, res) => {
  const product = await Product.findOne({
    where: { id: req.params.id, tenantId: req.staff.tenantId }, include: [Category],
  });
  if (!product) throw new ApiError(404, 'Producto no encontrado');
  res.json(product);
});

const create = asyncHandler(async (req, res) => {
  const {
    name, description, sku, price, categoryId, trackInventory, stock, lowStockThreshold, active,
  } = req.body;
  if (!name || price === undefined) throw new ApiError(400, 'name y price son obligatorios');

  const product = await Product.create({
    tenantId: req.staff.tenantId,
    name,
    slug: slugify(name),
    description,
    sku,
    price,
    categoryId: categoryId || null,
    trackInventory: trackInventory !== false,
    stock: stock || 0,
    lowStockThreshold: lowStockThreshold ?? 5,
    active: active !== false,
    images: [],
  });
  res.status(201).json(product);
});

const update = asyncHandler(async (req, res) => {
  const product = await Product.findOne({ where: { id: req.params.id, tenantId: req.staff.tenantId } });
  if (!product) throw new ApiError(404, 'Producto no encontrado');

  const {
    name, description, sku, price, categoryId, trackInventory, lowStockThreshold, active,
  } = req.body;
  await product.update({
    ...(name !== undefined && { name, slug: slugify(name) }),
    ...(description !== undefined && { description }),
    ...(sku !== undefined && { sku }),
    ...(price !== undefined && { price }),
    ...(categoryId !== undefined && { categoryId: categoryId || null }),
    ...(trackInventory !== undefined && { trackInventory }),
    ...(lowStockThreshold !== undefined && { lowStockThreshold }),
    ...(active !== undefined && { active }),
  });
  res.json(product);
});

const remove = asyncHandler(async (req, res) => {
  const product = await Product.findOne({ where: { id: req.params.id, tenantId: req.staff.tenantId } });
  if (!product) throw new ApiError(404, 'Producto no encontrado');
  await product.destroy();
  res.status(204).send();
});

const uploadImages = asyncHandler(async (req, res) => {
  const product = await Product.findOne({ where: { id: req.params.id, tenantId: req.staff.tenantId } });
  if (!product) throw new ApiError(404, 'Producto no encontrado');
  const files = req.files || [];
  const newPaths = files.map((f) => relativePath(f));
  await product.update({ images: [...product.images, ...newPaths] });
  res.json(product);
});

module.exports = {
  list, getOne, create, update, remove, uploadImages,
};
