const router = require('express').Router({ mergeParams: true });
const { authenticate } = require('../middleware/auth');
const { requirePermission, requireProjectAccess } = require('../middleware/authorize');
const { preventDuplicateSubmit } = require('../middleware/idempotency');
const { makeUploader } = require('../middleware/upload');
const purchaseOrderController = require('../controllers/purchaseOrderController');

const uploadPaymentReceipt = makeUploader('purchase-order-payments', 'any');

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
router.put('/:id/items/:itemId/receipts/:receiptId', requirePermission('ordenes_compra', 'edit'), purchaseOrderController.updateReceipt);
router.post('/:id/close', requirePermission('ordenes_compra', 'edit'), purchaseOrderController.close);
router.post('/:id/approve', requirePermission('ordenes_compra', 'edit'), purchaseOrderController.approve);
router.post('/:id/reject', requirePermission('ordenes_compra', 'edit'), purchaseOrderController.reject);
router.post('/:id/payments', requirePermission('ordenes_compra', 'edit'), uploadPaymentReceipt.single('file'), preventDuplicateSubmit, purchaseOrderController.addPayment);

module.exports = router;
