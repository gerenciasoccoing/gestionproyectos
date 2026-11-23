const router = require('express').Router();
const { authenticate } = require('../middleware/auth');
const { requirePermission } = require('../middleware/authorize');
const { preventDuplicateSubmit } = require('../middleware/idempotency');
const materialTransferController = require('../controllers/materialTransferController');

router.use(authenticate);

router.get('/', requirePermission('traslados_material', 'view'), materialTransferController.list);
router.get('/:id', requirePermission('traslados_material', 'view'), materialTransferController.get);
router.get('/:id/pdf', requirePermission('traslados_material', 'view'), materialTransferController.exportPdf);
router.get('/:id/signature', requirePermission('traslados_material', 'view'), materialTransferController.getSignature);
router.post('/', requirePermission('traslados_material', 'create'), preventDuplicateSubmit, materialTransferController.create);
router.post('/:id/confirm', requirePermission('traslados_material', 'edit'), preventDuplicateSubmit, materialTransferController.confirm);
router.post('/:id/reject', requirePermission('traslados_material', 'edit'), preventDuplicateSubmit, materialTransferController.reject);
router.post('/:id/void', requirePermission('traslados_material', 'edit'), preventDuplicateSubmit, materialTransferController.voidSigned);
router.post('/:id/request-signature', requirePermission('traslados_material', 'edit'), materialTransferController.requestSignature);

module.exports = router;
