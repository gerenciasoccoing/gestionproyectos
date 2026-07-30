const router = require('express').Router({ mergeParams: true });
const { authenticate } = require('../middleware/auth');
const { requirePermission, requireProjectAccess } = require('../middleware/authorize');
const { makeUploader } = require('../middleware/upload');
const minuteController = require('../controllers/minuteController');

const upload = makeUploader('minutes', 'document');

router.use(authenticate, requireProjectAccess((r) => r.params.projectId));

router.get('/', requirePermission('ejecucion', 'view'), minuteController.list);
router.post('/', requirePermission('ejecucion', 'create'), upload.single('file'), minuteController.create);
router.delete('/:id', requirePermission('ejecucion', 'delete'), minuteController.remove);

module.exports = router;
