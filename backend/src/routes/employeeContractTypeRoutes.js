// Catálogo de tipos de contrato de personal (para el selector del formulario de trabajador) — no
// depende de un proyecto, por eso vive aparte de employeeRoutes.js en vez de anidado bajo un
// proyecto en particular.
const router = require('express').Router();
const { authenticate } = require('../middleware/auth');
const employeeContractController = require('../controllers/employeeContractController');

router.use(authenticate);
router.get('/', employeeContractController.listContractTypes);

module.exports = router;
