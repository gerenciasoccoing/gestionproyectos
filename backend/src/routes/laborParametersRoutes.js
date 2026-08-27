const router = require('express').Router();
const { authenticate } = require('../middleware/auth');
const { requirePermission } = require('../middleware/authorize');
const { preventDuplicateSubmit } = require('../middleware/idempotency');
const laborParametersController = require('../controllers/laborParametersController');

router.use(authenticate);

router.get('/', requirePermission('admin', 'view'), laborParametersController.list);
router.get('/current', requirePermission('personal', 'view'), laborParametersController.current);
router.post('/', requirePermission('admin', 'create'), preventDuplicateSubmit, laborParametersController.create);

module.exports = router;
