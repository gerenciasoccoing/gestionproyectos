const router = require('express').Router();
const { authenticate } = require('../middleware/auth');
const { requirePermission } = require('../middleware/authorize');
const leaveTypeController = require('../controllers/leaveTypeController');

router.use(authenticate);

// Sin requirePermission en GET a propósito: el formulario de novedades necesita leer el catálogo
// para su selector de licencia remunerada, no solo quien lo administra — mismo criterio que
// withholdingTypeRoutes.js.
router.get('/', leaveTypeController.list);
router.post('/', requirePermission('admin', 'create'), leaveTypeController.create);
router.put('/:id', requirePermission('admin', 'edit'), leaveTypeController.update);
router.post('/:id/status', requirePermission('admin', 'edit'), leaveTypeController.setStatus);

module.exports = router;
