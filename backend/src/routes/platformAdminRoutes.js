const router = require('express').Router();
const { requirePlatformSecret } = require('../middleware/platformAdminAuth');
const platformAdminController = require('../controllers/platformAdminController');

router.post('/companies', requirePlatformSecret, platformAdminController.createCompany);

module.exports = router;
