const express = require('express');
const tenantAuthController = require('../controllers/tenantAuthController');
const { resolveTenant } = require('../middleware/tenantResolution');

const router = express.Router();
router.use(resolveTenant);

router.post('/login', tenantAuthController.login);

module.exports = router;
