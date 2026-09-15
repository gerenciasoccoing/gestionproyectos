const router = require('express').Router({ mergeParams: true });
const { authenticate } = require('../middleware/auth');
const { requirePermission, requireProjectAccess } = require('../middleware/authorize');
const { makeUploader } = require('../middleware/upload');
const { preventDuplicateSubmit } = require('../middleware/idempotency');
const controller = require('../controllers/projectDeliveryDocumentController');

const upload = makeUploader('delivery-documents', 'any');

router.use(authenticate, requireProjectAccess((r) => r.params.projectId));

router.get('/', requirePermission('entrega_final', 'view'), controller.list);
router.post('/', requirePermission('entrega_final', 'create'), upload.single('file'), preventDuplicateSubmit, controller.create);
router.delete('/:id', requirePermission('entrega_final', 'delete'), controller.remove);

module.exports = router;
