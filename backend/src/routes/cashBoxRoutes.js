const router = require('express').Router();
const { authenticate } = require('../middleware/auth');
const { requirePermission } = require('../middleware/authorize');
const { preventDuplicateSubmit } = require('../middleware/idempotency');
const cashBoxController = require('../controllers/cashBoxController');

router.use(authenticate);

router.get('/', requirePermission('cajas', 'view'), cashBoxController.list);
router.post('/', requirePermission('cajas', 'create'), preventDuplicateSubmit, cashBoxController.create);
router.get('/:id', requirePermission('cajas', 'view'), cashBoxController.get);
router.put('/:id', requirePermission('cajas', 'edit'), cashBoxController.update);
router.post('/:id/status', requirePermission('cajas', 'edit'), cashBoxController.setStatus);
router.post('/:id/movements', requirePermission('cajas', 'edit'), preventDuplicateSubmit, cashBoxController.addMovement);

module.exports = router;
