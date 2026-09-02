const router = require('express').Router({ mergeParams: true });
const { authenticate } = require('../middleware/auth');
const { requirePermission, requireProjectAccess } = require('../middleware/authorize');
const reportController = require('../controllers/reportController');

router.use(authenticate, requireProjectAccess((r) => r.params.projectId));

router.get('/evm', requirePermission('informes', 'view'), reportController.evm);
router.get('/s-curve', requirePermission('informes', 'view'), reportController.sCurve);
router.get('/milestones-minutes', requirePermission('informes', 'view'), reportController.milestonesAndMinutesSummary);
router.get('/progress-by-item', requirePermission('informes', 'view'), reportController.progressByItem);
router.get('/export-pdf', requirePermission('informes', 'view'), reportController.exportPdf);
router.get('/client-pdf', requirePermission('informes', 'view'), reportController.clientReportPdf);
router.get('/internal-pdf', requirePermission('informes', 'view'), reportController.internalReportPdf);

module.exports = router;
