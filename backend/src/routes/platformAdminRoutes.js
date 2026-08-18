const router = require('express').Router();
const { authenticatePlatformAdmin } = require('../middleware/platformAdminAuth');
const platformAdminController = require('../controllers/platformAdminController');

router.post('/login', platformAdminController.login);
router.get('/companies', authenticatePlatformAdmin, platformAdminController.listCompanies);
router.post('/companies', authenticatePlatformAdmin, platformAdminController.createCompany);
router.patch('/companies/:id/status', authenticatePlatformAdmin, platformAdminController.setCompanyStatus);
router.patch('/companies/:id/plan', authenticatePlatformAdmin, platformAdminController.updateCompanyPlan);

module.exports = router;
