const router = require('express').Router();
const { authenticate } = require('../middleware/auth');
const { requirePermission } = require('../middleware/authorize');
const { preventDuplicateSubmit } = require('../middleware/idempotency');
const materialCategoryController = require('../controllers/materialCategoryController');

router.use(authenticate);

// Sin requirePermission en GET (mismo criterio que materialRoutes.js): el selector de categoría se
// necesita en formularios de varios roles, no solo de quien las administra.
router.get('/', materialCategoryController.list);
router.post('/', requirePermission('inventario_materiales', 'create'), preventDuplicateSubmit, materialCategoryController.create);
router.put('/:id', requirePermission('inventario_materiales', 'edit'), materialCategoryController.update);
router.post('/:id/status', requirePermission('inventario_materiales', 'edit'), materialCategoryController.setStatus);
router.delete('/:id', requirePermission('inventario_materiales', 'delete'), materialCategoryController.remove);

module.exports = router;
