const router = require('express').Router({ mergeParams: true });
const { authenticate } = require('../middleware/auth');
const { requirePermission, requireProjectAccess } = require('../middleware/authorize');
const budgetController = require('../controllers/budgetController');

router.use(authenticate, requireProjectAccess((r) => r.params.projectId));

router.get('/', requirePermission('ejecucion', 'view'), budgetController.getProjectBudget);
router.post('/', requirePermission('ejecucion', 'create'), budgetController.createBudgetVersion);
router.put('/:budgetId', requirePermission('ejecucion', 'edit'), budgetController.updateBudget);
router.post('/:budgetId/items', requirePermission('ejecucion', 'create'), budgetController.addItem);
router.delete('/:budgetId/items/:itemId', requirePermission('ejecucion', 'delete'), budgetController.removeItem);

module.exports = router;
