const express = require('express');
const superAdminController = require('../controllers/superAdminController');
const { authenticateStaff, requireStaffRole } = require('../middleware/auth');

const router = express.Router();
router.use(authenticateStaff, requireStaffRole('super_admin'));

router.get('/tenants', superAdminController.listTenants);
router.get('/tenants/:id', superAdminController.getTenant);
router.post('/tenants', superAdminController.createTenant);
router.put('/tenants/:id', superAdminController.updateTenant);
router.patch('/tenants/:id/status', superAdminController.setTenantStatus);

module.exports = router;
