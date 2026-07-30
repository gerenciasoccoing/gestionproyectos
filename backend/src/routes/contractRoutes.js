const router = require('express').Router({ mergeParams: true });
const { authenticate } = require('../middleware/auth');
const { requirePermission, requireProjectAccess } = require('../middleware/authorize');
const { makeUploader } = require('../middleware/upload');
const contractController = require('../controllers/contractController');

const upload = makeUploader('contracts', 'document');

router.use(authenticate, requireProjectAccess((r) => r.params.projectId));

router.get('/', requirePermission('contractual', 'view'), contractController.list);
router.post('/', requirePermission('contractual', 'create'), upload.single('file'), contractController.create);
router.put('/:id', requirePermission('contractual', 'edit'), upload.single('file'), contractController.update);
router.delete('/:id', requirePermission('contractual', 'delete'), contractController.remove);

module.exports = router;
