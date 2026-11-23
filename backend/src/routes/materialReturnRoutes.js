const router = require('express').Router();
const { authenticate } = require('../middleware/auth');
const { requirePermission } = require('../middleware/authorize');
const { preventDuplicateSubmit } = require('../middleware/idempotency');
const materialReturnController = require('../controllers/materialReturnController');

router.use(authenticate);

router.get('/', requirePermission('devoluciones_material', 'view'), materialReturnController.list);
router.get('/returnable/:issueId', requirePermission('devoluciones_material', 'view'), materialReturnController.getReturnable);
router.get('/:id', requirePermission('devoluciones_material', 'view'), materialReturnController.get);
router.get('/:id/pdf', requirePermission('devoluciones_material', 'view'), materialReturnController.exportPdf);
router.get('/:id/signature', requirePermission('devoluciones_material', 'view'), materialReturnController.getSignature);
router.post('/', requirePermission('devoluciones_material', 'create'), preventDuplicateSubmit, materialReturnController.create);
router.post('/:id/sign', requirePermission('devoluciones_material', 'edit'), preventDuplicateSubmit, materialReturnController.sign);
router.post('/:id/reject', requirePermission('devoluciones_material', 'edit'), preventDuplicateSubmit, materialReturnController.reject);
router.post('/:id/void', requirePermission('devoluciones_material', 'edit'), preventDuplicateSubmit, materialReturnController.voidSigned);
router.post('/:id/request-signature', requirePermission('devoluciones_material', 'edit'), materialReturnController.requestSignature);

module.exports = router;
