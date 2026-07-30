const router = require('express').Router();
const { authenticate } = require('../middleware/auth');
const { requirePermission } = require('../middleware/authorize');
const laborParametersController = require('../controllers/laborParametersController');

router.use(authenticate);

router.get('/', requirePermission('admin', 'view'), laborParametersController.list);
router.post('/', requirePermission('admin', 'create'), laborParametersController.create);

module.exports = router;
