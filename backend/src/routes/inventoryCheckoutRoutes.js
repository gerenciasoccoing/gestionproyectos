const router = require('express').Router();
const { authenticate } = require('../middleware/auth');
const { requirePermission } = require('../middleware/authorize');
const inventoryCheckoutController = require('../controllers/inventoryCheckoutController');

router.use(authenticate);

router.get('/', requirePermission('inventario', 'view'), inventoryCheckoutController.list);
router.post('/', requirePermission('inventario', 'create'), inventoryCheckoutController.create);
router.get('/:id', requirePermission('inventario', 'view'), inventoryCheckoutController.get);
router.post('/:id/checkin', requirePermission('inventario', 'edit'), inventoryCheckoutController.checkin);
router.post('/:id/items/:itemId/justify', requirePermission('inventario', 'edit'), inventoryCheckoutController.justify);
router.post('/:id/notify-salida', requirePermission('inventario', 'create'), inventoryCheckoutController.notifySalida);
router.post('/:id/notify-entrada', requirePermission('inventario', 'edit'), inventoryCheckoutController.notifyEntrada);

module.exports = router;
