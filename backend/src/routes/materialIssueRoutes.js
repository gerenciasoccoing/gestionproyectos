const router = require('express').Router();
const { authenticate } = require('../middleware/auth');
const { requirePermission } = require('../middleware/authorize');
const { preventDuplicateSubmit } = require('../middleware/idempotency');
const materialIssueController = require('../controllers/materialIssueController');

router.use(authenticate);

router.get('/', requirePermission('salidas_material', 'view'), materialIssueController.list);
router.get('/:id', requirePermission('salidas_material', 'view'), materialIssueController.get);
router.get('/:id/pdf', requirePermission('salidas_material', 'view'), materialIssueController.exportPdf);
router.get('/:id/signature', requirePermission('salidas_material', 'view'), materialIssueController.getSignature);
router.post('/', requirePermission('salidas_material', 'create'), preventDuplicateSubmit, materialIssueController.create);
router.post('/:id/sign', requirePermission('salidas_material', 'edit'), preventDuplicateSubmit, materialIssueController.sign);
router.post('/:id/reject', requirePermission('salidas_material', 'edit'), preventDuplicateSubmit, materialIssueController.reject);
router.post('/:id/void', requirePermission('salidas_material', 'edit'), preventDuplicateSubmit, materialIssueController.voidSigned);
router.post('/:id/request-signature', requirePermission('salidas_material', 'edit'), materialIssueController.requestSignature);

module.exports = router;
