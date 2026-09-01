const router = require('express').Router();
const { authenticate } = require('../middleware/auth');
const { requirePermission, requireOptionalProjectAccess } = require('../middleware/authorize');
const { PurchaseOrder } = require('../models');
const { preventDuplicateSubmit } = require('../middleware/idempotency');
const purchaseOrderController = require('../controllers/purchaseOrderController');

// Montado en /purchase-orders (sin :projectId en la URL): punto de entrada usado desde la ficha
// de un proveedor, donde el proyecto es opcional. Es el mismo controlador que
// /projects/:projectId/purchase-orders (purchaseOrderRoutes.js) — ver el comentario al inicio de
// purchaseOrderController.js. La seguridad por proyecto se resuelve consultando la orden misma
// (requireOptionalProjectAccess), ya que aquí no viene en la URL.
router.use(authenticate);

const byIdParam = async (req) => PurchaseOrder.findByPk(req.params.id);

router.get('/', requirePermission('ordenes_compra', 'view'), purchaseOrderController.listBySupplier);
router.post('/', requirePermission('ordenes_compra', 'create'), preventDuplicateSubmit, purchaseOrderController.create);
router.get('/:id', requirePermission('ordenes_compra', 'view'), requireOptionalProjectAccess(byIdParam), purchaseOrderController.get);
router.get('/:id/pdf', requirePermission('ordenes_compra', 'view'), requireOptionalProjectAccess(byIdParam), purchaseOrderController.exportPdf);
router.put('/:id', requirePermission('ordenes_compra', 'edit'), requireOptionalProjectAccess(byIdParam), purchaseOrderController.updateOrder);
router.delete('/:id', requirePermission('ordenes_compra', 'delete'), requireOptionalProjectAccess(byIdParam), purchaseOrderController.remove);
router.put('/:id/items/:itemId', requirePermission('ordenes_compra', 'edit'), requireOptionalProjectAccess(byIdParam), purchaseOrderController.updateItem);
router.post('/:id/convert-to-expense', requirePermission('ordenes_compra', 'edit'), requireOptionalProjectAccess(byIdParam), preventDuplicateSubmit, purchaseOrderController.convertToExpense);
router.post('/:id/items/:itemId/receipts', requirePermission('ordenes_compra', 'edit'), requireOptionalProjectAccess(byIdParam), preventDuplicateSubmit, purchaseOrderController.addReceipt);
router.post('/:id/close', requirePermission('ordenes_compra', 'edit'), requireOptionalProjectAccess(byIdParam), purchaseOrderController.close);
router.post('/:id/approve', requirePermission('ordenes_compra', 'edit'), requireOptionalProjectAccess(byIdParam), purchaseOrderController.approve);
router.post('/:id/reject', requirePermission('ordenes_compra', 'edit'), requireOptionalProjectAccess(byIdParam), purchaseOrderController.reject);

module.exports = router;
