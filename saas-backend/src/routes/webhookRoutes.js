const express = require('express');
const webhookController = require('../controllers/webhookController');

const router = express.Router();

// Wompi llama directamente a esta URL (no al subdominio del tenant), por eso el tenant va
// en la propia ruta en vez de resolverse por Host.
router.post('/wompi/:tenantSubdomain', webhookController.wompiWebhook);

module.exports = router;
