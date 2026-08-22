const express = require('express');

const router = express.Router();

router.use('/auth', require('./authRoutes'));
router.use('/tenant-auth', require('./tenantAuthRoutes'));
router.use('/super-admin', require('./superAdminRoutes'));
router.use('/tenant', require('./tenantRoutes'));
router.use('/store', require('./storeRoutes'));
router.use('/webhooks', require('./webhookRoutes'));

module.exports = router;
