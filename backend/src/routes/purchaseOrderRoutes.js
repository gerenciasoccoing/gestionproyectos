const router = require('express').Router({ mergeParams: true });
const { authenticate } = require('../middleware/auth');
const { requirePermission, requireProjectAccess } = require('../middleware/authorize');
const { preventDuplicateSubmit } = require('../middleware/idempotency');
const purchaseOrderController = require('../controllers/purchaseOrderController');

router.use(authenticate, requireProjectAccess((r) => r.params.projectId));

router.get('/report', requirePermission('ordenes_compra', 'view'), purchaseOrderController.report);
router.get('/', requirePermission('ordenes_compra', 'view'), purchaseOrderController.list);
router.post('/', requirePermission('ordenes_compra', 'create'), preventDuplicateSubmit, purchaseOrderController.create);
router.get('/:id', requirePermission('ordenes_compra', 'view'), purchaseOrderController.get);
router.get('/:id/pdf', requirePermission('ordenes_compra', 'view'), purchaseOrderController.exportPdf);
router.put('/:id', requirePermission('ordenes_compra', 'edit'), purchaseOrderController.updateOrder);
router.delete('/:id', requirePermission('ordenes_compra', 'delete'), purchaseOrderController.remove);
router.put('/:id/items/:itemId', requirePermission('ordenes_compra', 'edit'), purchaseOrderController.updateItem);
router.post('/:id/convert-to-expense', requirePermission('ordenes_compra', 'edit'), preventDuplicateSubmit, purchaseOrderController.convertToExpense);
router.post('/:id/items/:itemId/receipts', requirePermission('ordenes_compra', 'edit'), preventDuplicateSubmit, purchaseOrderController.addReceipt);
router.post('/:id/close', requirePermission('ordenes_compra', 'edit'), purchaseOrderController.close);

module.exports = router;
