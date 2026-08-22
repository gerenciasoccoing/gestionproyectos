const express = require('express');
const categoryController = require('../controllers/categoryController');
const productController = require('../controllers/productController');
const inventoryController = require('../controllers/inventoryController');
const orderController = require('../controllers/orderController');
const tenantSettingsController = require('../controllers/tenantSettingsController');
const { authenticateStaff, requireTenantStaff, requireStaffRole } = require('../middleware/auth');
const { makeUploader } = require('../middleware/upload');

// Todas las rutas de panel de un tenant (tenant_admin y tenant_operator). El tenant_operator
// gestiona pedidos/inventario/gastos pero no configuración sensible (settings de pago/marca),
// que queda restringida a tenant_admin con requireStaffRole.
const router = express.Router();
router.use(authenticateStaff, requireTenantStaff);

router.get('/categories', categoryController.list);
router.post('/categories', categoryController.create);
router.put('/categories/:id', categoryController.update);
router.delete('/categories/:id', categoryController.remove);

router.get('/products', productController.list);
router.get('/products/:id', productController.getOne);
router.post('/products', productController.create);
router.put('/products/:id', productController.update);
router.delete('/products/:id', productController.remove);
router.post('/products/:id/images', makeUploader('products', 'image').array('images', 6), productController.uploadImages);

router.post('/inventory/:productId/adjust', inventoryController.adjustStock);
router.get('/inventory/movements', inventoryController.movements);
router.get('/inventory/low-stock', inventoryController.lowStock);

router.get('/orders', orderController.list);
router.get('/orders/:id', orderController.getOne);
router.patch('/orders/:id/status', orderController.updateStatus);

router.get('/settings', tenantSettingsController.getSettings);
router.put('/settings/branding', requireStaffRole('tenant_admin'), tenantSettingsController.updateBranding);
router.post('/settings/logo', requireStaffRole('tenant_admin'), makeUploader('logos', 'image').single('logo'), tenantSettingsController.uploadLogo);
router.put('/settings/payment', requireStaffRole('tenant_admin'), tenantSettingsController.updatePaymentCredentials);

module.exports = router;
