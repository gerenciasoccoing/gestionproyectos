const router = require('express').Router();
const { authenticate } = require('../middleware/auth');
const { requirePermission } = require('../middleware/authorize');
const { preventDuplicateSubmit } = require('../middleware/idempotency');
const { makeUploader } = require('../middleware/upload');
const cashBoxController = require('../controllers/cashBoxController');

// Soporte de pago (opcional): JPG/PNG/PDF, máx. 10 MB — ver middleware/upload.js#ALLOWED_BY_KIND.
const uploadSupport = makeUploader('cash-box-movements', 'paymentSupport', 10);

router.use(authenticate);

router.get('/', requirePermission('cajas', 'view'), cashBoxController.list);
router.post('/', requirePermission('cajas', 'create'), preventDuplicateSubmit, cashBoxController.create);
router.get('/:id', requirePermission('cajas', 'view'), cashBoxController.get);
router.put('/:id', requirePermission('cajas', 'edit'), cashBoxController.update);
router.post('/:id/status', requirePermission('cajas', 'edit'), cashBoxController.setStatus);
router.post('/:id/movements', requirePermission('cajas', 'edit'), uploadSupport.single('support'), preventDuplicateSubmit, cashBoxController.addMovement);
router.put('/:id/movements/:movementId', requirePermission('cajas', 'edit'), uploadSupport.single('support'), cashBoxController.updateMovement);
router.delete('/:id/movements/:movementId', requirePermission('cajas', 'edit'), cashBoxController.removeMovement);

module.exports = router;
