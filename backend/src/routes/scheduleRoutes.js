const router = require('express').Router({ mergeParams: true });
const { authenticate } = require('../middleware/auth');
const { requirePermission, requireProjectAccess } = require('../middleware/authorize');
const { preventDuplicateSubmit } = require('../middleware/idempotency');
const scheduleController = require('../controllers/scheduleController');

router.use(authenticate, requireProjectAccess((r) => r.params.projectId));

router.get('/', requirePermission('ejecucion', 'view'), scheduleController.get);
router.post('/generate', requirePermission('ejecucion', 'create'), preventDuplicateSubmit, scheduleController.generate);
router.get('/export-pdf', requirePermission('ejecucion', 'view'), scheduleController.exportPdf);
router.get('/export-excel', requirePermission('ejecucion', 'view'), scheduleController.exportExcel);

module.exports = router;
