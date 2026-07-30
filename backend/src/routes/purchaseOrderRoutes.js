const router = require('express').Router({ mergeParams: true });
const { authenticate } = require('../middleware/auth');
const { requirePermission, requireProjectAccess } = require('../middleware/authorize');
const purchaseOrderController = require('../controllers/purchaseOrderController');

router.use(authenticate, requireProjectAccess((r) => r.params.projectId));

router.get('/report', requirePermission('ordenes_compra', 'view'), purchaseOrderController.report);
router.get('/', requirePermission('ordenes_compra', 'view'), purchaseOrderController.list);
router.post('/', requirePermission('ordenes_compra', 'create'), purchaseOrderController.create);
router.get('/:id', requirePermission('ordenes_compra', 'view'), purchaseOrderController.get);
router.post('/:id/items/:itemId/receipts', requirePermission('ordenes_compra', 'edit'), purchaseOrderController.addReceipt);
router.post('/:id/close', requirePermission('ordenes_compra', 'edit'), purchaseOrderController.close);

module.exports = router;
