const router = require('express').Router();
const { preventDuplicateSubmit } = require('../middleware/idempotency');
const companyRegistrationController = require('../controllers/companyRegistrationController');

// Sin authenticate: es el formulario público "Registrar empresa" del login.
router.post('/', preventDuplicateSubmit, companyRegistrationController.create);

module.exports = router;
