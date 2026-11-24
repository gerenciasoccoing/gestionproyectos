const router = require('express').Router();
const { authenticate } = require('../middleware/auth');
const { requirePermission } = require('../middleware/authorize');
const { preventDuplicateSubmit } = require('../middleware/idempotency');
const materialController = require('../controllers/materialController');

router.use(authenticate);

// Sin requirePermission en GET (mismo criterio que adminExpenseCategoryRoutes.js): el catálogo se
// necesita como selector en formularios de varios roles, no solo de quien lo administra.
router.get('/', materialController.list);
router.get('/search', materialController.search);
router.post('/', requirePermission('inventario_materiales', 'create'), preventDuplicateSubmit, materialController.create);
router.post('/bulk-recategorize', requirePermission('inventario_materiales', 'edit'), materialController.bulkRecategorize);
router.put('/:id', requirePermission('inventario_materiales', 'edit'), materialController.update);
router.post('/:id/status', requirePermission('inventario_materiales', 'edit'), materialController.setStatus);
router.post('/:id/merge', requirePermission('inventario_materiales', 'edit'), materialController.merge);
router.delete('/:id', requirePermission('inventario_materiales', 'delete'), materialController.remove);

module.exports = router;
