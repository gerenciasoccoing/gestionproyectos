const router = require('express').Router();
const { authenticate } = require('../middleware/auth');
const { requirePermission } = require('../middleware/authorize');
const withholdingTypeController = require('../controllers/withholdingTypeController');

router.use(authenticate);

// Sin requirePermission a propósito: cualquier usuario autenticado que registre pagos a caja
// (ver cashBoxMovementService.js) necesita leer el catálogo para el selector de retenciones,
// no solo quien administra Parámetros — mismo criterio que companySettingsController.get.
router.get('/', withholdingTypeController.list);
router.post('/', requirePermission('admin', 'create'), withholdingTypeController.create);
router.put('/:id', requirePermission('admin', 'edit'), withholdingTypeController.update);
router.post('/:id/status', requirePermission('admin', 'edit'), withholdingTypeController.setStatus);

module.exports = router;
