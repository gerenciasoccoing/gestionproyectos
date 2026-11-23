const router = require('express').Router();
const { authenticate } = require('../middleware/auth');
const { requirePermission } = require('../middleware/authorize');
const { preventDuplicateSubmit } = require('../middleware/idempotency');
const warehouseController = require('../controllers/warehouseController');

router.use(authenticate);

// Sin requirePermission en GET (mismo criterio que adminExpenseCategoryRoutes.js): la bodega se
// necesita como selector en formularios de varios módulos (entradas de OC, traslados, salidas).
router.get('/', warehouseController.list);
router.get('/:id', warehouseController.get);
router.post('/', requirePermission('bodegas', 'create'), preventDuplicateSubmit, warehouseController.create);
router.put('/:id', requirePermission('bodegas', 'edit'), warehouseController.update);

module.exports = router;
