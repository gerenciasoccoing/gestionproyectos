const router = require('express').Router({ mergeParams: true });
const { authenticate } = require('../middleware/auth');
const { requirePermission, requireProjectAccess } = require('../middleware/authorize');
const { makeUploader } = require('../middleware/upload');
const employeeController = require('../controllers/employeeController');
const severanceController = require('../controllers/severanceController');

const uploadContract = makeUploader('employee-contracts', 'document');
const uploadSocialSecurity = makeUploader('social-security', 'document');
const uploadPayment = makeUploader('payment-receipts', 'document');
const uploadPazYSalvo = makeUploader('paz-y-salvo', 'document');

router.use(authenticate, requireProjectAccess((r) => r.params.projectId));

router.get('/', requirePermission('personal', 'view'), employeeController.list);
router.get('/:id', requirePermission('personal', 'view'), employeeController.get);
router.post('/', requirePermission('personal', 'create'), uploadContract.single('file'), employeeController.create);
router.put('/:id', requirePermission('personal', 'edit'), uploadContract.single('file'), employeeController.update);

router.post('/:id/social-security', requirePermission('personal', 'edit'), uploadSocialSecurity.single('file'), employeeController.addSocialSecurityDocument);
router.post('/:id/payments', requirePermission('personal', 'edit'), uploadPayment.single('file'), employeeController.addPaymentReceipt);

router.post('/:id/severance/preview', requirePermission('personal', 'edit'), severanceController.preview);
router.post('/:id/severance', requirePermission('personal', 'edit'), severanceController.confirmRetirement);
router.post('/:id/severance/paz-y-salvo', requirePermission('personal', 'edit'), uploadPazYSalvo.single('file'), severanceController.uploadPazYSalvo);

module.exports = router;
