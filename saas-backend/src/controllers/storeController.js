const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const { Category, Product } = require('../models');

// Todas las rutas de este controlador son públicas (sin auth) y ya tienen req.tenant resuelto
// por el middleware resolveTenant según el dominio/subdominio de la request.
const getTenantInfo = asyncHandler(async (req, res) => {
  const { tenant } = req;
  res.json({
    name: tenant.name,
    logoUrl: tenant.logoUrl,
    colorPrimary: tenant.colorPrimary,
    colorSecondary: tenant.colorSecondary,
    shippingType: tenant.shippingType,
    shippingFixedRate: tenant.shippingFixedRate,
  });
});

const listCategories = asyncHandler(async (req, res) => {
  const categories = await Category.findAll({ where: { tenantId: req.tenant.id, active: true }, order: [['name', 'ASC']] });
  res.json(categories);
});

const listProducts = asyncHandler(async (req, res) => {
  const where = { tenantId: req.tenant.id, active: true };
  if (req.query.categorySlug) {
    const category = await Category.findOne({ where: { tenantId: req.tenant.id, slug: req.query.categorySlug } });
    where.categoryId = category ? category.id : null;
  }
  const products = await Product.findAll({ where, include: [Category], order: [['createdAt', 'DESC']] });
  res.json(products);
});

const getProduct = asyncHandler(async (req, res) => {
  const product = await Product.findOne({
    where: { tenantId: req.tenant.id, slug: req.params.slug, active: true }, include: [Category],
  });
  if (!product) throw new ApiError(404, 'Producto no encontrado');
  res.json(product);
});

module.exports = {
  getTenantInfo, listCategories, listProducts, getProduct,
};
