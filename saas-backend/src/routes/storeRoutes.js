const express = require('express');
const storeController = require('../controllers/storeController');
const customerAuthController = require('../controllers/customerAuthController');
const checkoutController = require('../controllers/checkoutController');
const { resolveTenant } = require('../middleware/tenantResolution');
const { authenticateCustomer, authenticateCustomerOptional } = require('../middleware/auth');

// Rutas públicas de la tienda de un tenant: todas pasan primero por resolveTenant, que
// determina el tenant según el dominio/subdominio de la request.
const router = express.Router();
router.use(resolveTenant);

router.get('/tenant', storeController.getTenantInfo);
router.get('/categories', storeController.listCategories);
router.get('/products', storeController.listProducts);
router.get('/products/:slug', storeController.getProduct);

router.post('/auth/register', customerAuthController.register);
router.post('/auth/login', customerAuthController.login);
router.get('/auth/me', authenticateCustomer, customerAuthController.me);

router.post('/checkout', authenticateCustomerOptional, checkoutController.createOrder);
router.get('/orders/:orderNumber', checkoutController.getOrderStatus);

module.exports = router;
