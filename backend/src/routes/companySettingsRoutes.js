const router = require('express').Router();
const { authenticate } = require('../middleware/auth');
const { requirePermission } = require('../middleware/authorize');
const { makeUploader } = require('../middleware/upload');
const companySettingsController = require('../controllers/companySettingsController');

const upload = makeUploader('company', 'image');

router.use(authenticate);

router.get('/', companySettingsController.get);
router.put('/', requirePermission('admin', 'edit'), upload.single('logo'), companySettingsController.update);

module.exports = router;
