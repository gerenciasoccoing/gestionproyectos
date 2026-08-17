const router = require('express').Router();
const { authenticate } = require('../middleware/auth');
const { requirePermission, requireOptionalProjectAccess } = require('../middleware/authorize');
const { PurchaseOrder } = require('../models');
const purchaseOrderController = require('../controllers/purchaseOrderController');

// Montado en /purchase-orders (sin :projectId en la URL): punto de entrada usado desde la ficha
// de un proveedor, donde el proyecto es opcional. Es el mismo controlador que
// /projects/:projectId/purchase-orders (purchaseOrderRoutes.js) — ver el comentario al inicio de
// purchaseOrderController.js. La seguridad por proyecto se resuelve consultando la orden misma
// (requireOptionalProjectAccess), ya que aquí no viene en la URL.
router.use(authenticate);

const byIdParam = async (req) => PurchaseOrder.findByPk(req.params.id);

router.get('/', requirePermission('ordenes_compra', 'view'), purchaseOrderController.listBySupplier);
router.post('/', requirePermission('ordenes_compra', 'create'), purchaseOrderController.create);
router.get('/:id', requirePermission('ordenes_compra', 'view'), requireOptionalProjectAccess(byIdParam), purchaseOrderController.get);
router.get('/:id/pdf', requirePermission('ordenes_compra', 'view'), requireOptionalProjectAccess(byIdParam), purchaseOrderController.exportPdf);
router.put('/:id/items/:itemId', requirePermission('ordenes_compra', 'edit'), requireOptionalProjectAccess(byIdParam), purchaseOrderController.updateItem);
router.post('/:id/convert-to-expense', requirePermission('ordenes_compra', 'edit'), requireOptionalProjectAccess(byIdParam), purchaseOrderController.convertToExpense);
router.post('/:id/items/:itemId/receipts', requirePermission('ordenes_compra', 'edit'), requireOptionalProjectAccess(byIdParam), purchaseOrderController.addReceipt);
router.post('/:id/close', requirePermission('ordenes_compra', 'edit'), requireOptionalProjectAccess(byIdParam), purchaseOrderController.close);

module.exports = router;
