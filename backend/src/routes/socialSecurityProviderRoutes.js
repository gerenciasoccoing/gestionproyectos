const router = require('express').Router();
const { authenticate } = require('../middleware/auth');
const { requirePermission } = require('../middleware/authorize');
const socialSecurityProviderController = require('../controllers/socialSecurityProviderController');

router.use(authenticate);

router.get('/', requirePermission('personal', 'view'), socialSecurityProviderController.list);
router.post('/', requirePermission('personal', 'edit'), socialSecurityProviderController.create);

module.exports = router;
