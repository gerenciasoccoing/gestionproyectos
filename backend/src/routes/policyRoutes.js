const router = require('express').Router({ mergeParams: true });
const { authenticate } = require('../middleware/auth');
const { requirePermission, requireProjectAccess } = require('../middleware/authorize');
const { makeUploader } = require('../middleware/upload');
const policyController = require('../controllers/policyController');

const upload = makeUploader('policies', 'document');

router.use(authenticate, requireProjectAccess((r) => r.params.projectId));

router.get('/', requirePermission('contractual', 'view'), policyController.list);
router.post('/', requirePermission('contractual', 'create'), upload.single('file'), policyController.create);
router.put('/:id', requirePermission('contractual', 'edit'), upload.single('file'), policyController.update);
router.delete('/:id', requirePermission('contractual', 'delete'), policyController.remove);

module.exports = router;
