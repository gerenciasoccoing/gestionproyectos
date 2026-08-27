const router = require('express').Router();
const { authenticate } = require('../middleware/auth');
const { requirePermission } = require('../middleware/authorize');
const { preventDuplicateSubmit } = require('../middleware/idempotency');
const userController = require('../controllers/userController');

router.use(authenticate);

router.get('/', requirePermission('admin', 'view'), userController.list);
router.post('/', requirePermission('admin', 'create'), preventDuplicateSubmit, userController.create);
router.put('/:id', requirePermission('admin', 'edit'), userController.update);
router.delete('/:id', requirePermission('admin', 'delete'), userController.remove);
router.put('/:id/projects', requirePermission('admin', 'edit'), userController.assignProjects);

module.exports = router;
