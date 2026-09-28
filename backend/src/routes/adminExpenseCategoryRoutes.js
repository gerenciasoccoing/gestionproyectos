const router = require('express').Router();
const { authenticate } = require('../middleware/auth');
const { requirePermission } = require('../middleware/authorize');
const adminExpenseCategoryController = require('../controllers/adminExpenseCategoryController');

router.use(authenticate);

// Sin requirePermission en GET a propósito: el formulario de gasto administrativo necesita leer el
// catálogo para su selector de categoría, no solo quien lo administra — mismo criterio que
// withholdingTypeRoutes.js. Las mutaciones quedan bajo el módulo 'gastos_admin' (mismo módulo que
// gobierna crear gastos administrativos y ver su reporte, por defecto solo Admin y Gerente).
router.get('/', adminExpenseCategoryController.list);
router.post('/', requirePermission('gastos_admin', 'create'), adminExpenseCategoryController.create);
router.put('/:id', requirePermission('gastos_admin', 'edit'), adminExpenseCategoryController.update);
router.post('/:id/status', requirePermission('gastos_admin', 'edit'), adminExpenseCategoryController.setStatus);

module.exports = router;
