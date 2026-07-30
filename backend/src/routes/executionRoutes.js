const router = require('express').Router({ mergeParams: true });
const { authenticate } = require('../middleware/auth');
const { requirePermission, requireProjectAccess } = require('../middleware/authorize');
const executionDashboardController = require('../controllers/executionDashboardController');

router.use(authenticate, requireProjectAccess((r) => r.params.projectId));

router.get('/dashboard', requirePermission('ejecucion', 'view'), executionDashboardController.getDashboard);

module.exports = router;
