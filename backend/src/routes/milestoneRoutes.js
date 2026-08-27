const router = require('express').Router({ mergeParams: true });
const { authenticate } = require('../middleware/auth');
const { requirePermission, requireProjectAccess } = require('../middleware/authorize');
const { preventDuplicateSubmit } = require('../middleware/idempotency');
const milestoneController = require('../controllers/milestoneController');

router.use(authenticate, requireProjectAccess((r) => r.params.projectId));

router.get('/', requirePermission('ejecucion', 'view'), milestoneController.list);
router.post('/', requirePermission('ejecucion', 'create'), preventDuplicateSubmit, milestoneController.create);
router.put('/:id', requirePermission('ejecucion', 'edit'), milestoneController.update);
router.delete('/:id', requirePermission('ejecucion', 'delete'), milestoneController.remove);

module.exports = router;
