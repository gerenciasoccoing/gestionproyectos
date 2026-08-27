const router = require('express').Router({ mergeParams: true });
const { authenticate } = require('../middleware/auth');
const { requirePermission, requireProjectAccess } = require('../middleware/authorize');
const { preventDuplicateSubmit } = require('../middleware/idempotency');
const riskController = require('../controllers/riskController');

router.use(authenticate, requireProjectAccess((r) => r.params.projectId));

router.get('/', requirePermission('informes', 'view'), riskController.list);
router.post('/', requirePermission('informes', 'create'), preventDuplicateSubmit, riskController.create);
router.put('/:id', requirePermission('informes', 'edit'), riskController.update);
router.delete('/:id', requirePermission('informes', 'delete'), riskController.remove);

module.exports = router;
