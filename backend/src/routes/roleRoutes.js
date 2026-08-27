const router = require('express').Router();
const { authenticate } = require('../middleware/auth');
const { requirePermission } = require('../middleware/authorize');
const { preventDuplicateSubmit } = require('../middleware/idempotency');
const roleController = require('../controllers/roleController');

router.use(authenticate);

router.get('/permissions-catalog', requirePermission('admin', 'view'), roleController.listPermissionsCatalog);
router.get('/', requirePermission('admin', 'view'), roleController.list);
router.post('/', requirePermission('admin', 'create'), preventDuplicateSubmit, roleController.create);
router.put('/:id', requirePermission('admin', 'edit'), roleController.update);
router.delete('/:id', requirePermission('admin', 'delete'), roleController.remove);

module.exports = router;
