const router = require('express').Router();
const { authenticatePlatformAdmin } = require('../middleware/platformAdminAuth');
const platformAdminController = require('../controllers/platformAdminController');

router.post('/login', platformAdminController.login);
router.get('/companies', authenticatePlatformAdmin, platformAdminController.listCompanies);
router.post('/companies', authenticatePlatformAdmin, platformAdminController.createCompany);
router.patch('/companies/:id/status', authenticatePlatformAdmin, platformAdminController.setCompanyStatus);
router.patch('/companies/:id/plan', authenticatePlatformAdmin, platformAdminController.updateCompanyPlan);
router.patch('/companies/:id/features', authenticatePlatformAdmin, platformAdminController.updateCompanyFeatures);
router.post('/companies/:id/impersonate', authenticatePlatformAdmin, platformAdminController.impersonateCompany);
router.get('/support-access-log', authenticatePlatformAdmin, platformAdminController.listSupportAccessLog);
router.get('/registration-requests', authenticatePlatformAdmin, platformAdminController.listRegistrationRequests);
router.post('/registration-requests/:id/approve', authenticatePlatformAdmin, platformAdminController.approveRegistrationRequest);
router.post('/registration-requests/:id/reject', authenticatePlatformAdmin, platformAdminController.rejectRegistrationRequest);

module.exports = router;
