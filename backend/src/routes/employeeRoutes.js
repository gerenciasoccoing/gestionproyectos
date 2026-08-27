const router = require('express').Router({ mergeParams: true });
const { authenticate } = require('../middleware/auth');
const { requirePermission, requireProjectAccess } = require('../middleware/authorize');
const { makeUploader } = require('../middleware/upload');
const { preventDuplicateSubmit } = require('../middleware/idempotency');
const employeeController = require('../controllers/employeeController');
const severanceController = require('../controllers/severanceController');
const employeeContractController = require('../controllers/employeeContractController');
const payrollController = require('../controllers/payrollController');

const uploadContract = makeUploader('employee-contracts', 'document');
const uploadSocialSecurity = makeUploader('social-security', 'document');
const uploadPayment = makeUploader('payment-receipts', 'document');
const uploadPazYSalvo = makeUploader('paz-y-salvo', 'document');
const uploadCedula = makeUploader('employee-id-documents', 'any');

router.use(authenticate, requireProjectAccess((r) => r.params.projectId));

router.get('/', requirePermission('personal', 'view'), employeeController.list);
router.get('/:id', requirePermission('personal', 'view'), employeeController.get);
router.post('/', requirePermission('personal', 'create'), uploadContract.single('file'), preventDuplicateSubmit, employeeController.create);
router.put('/:id', requirePermission('personal', 'edit'), uploadContract.single('file'), employeeController.update);
router.delete('/:id', requirePermission('personal', 'delete'), employeeController.remove);
router.post('/preview-contract-value', requirePermission('personal', 'view'), employeeController.previewContractValue);

router.post('/:id/social-security', requirePermission('personal', 'edit'), uploadSocialSecurity.single('file'), preventDuplicateSubmit, employeeController.addSocialSecurityDocument);
router.post('/:id/payments', requirePermission('personal', 'edit'), uploadPayment.single('file'), preventDuplicateSubmit, employeeController.addPaymentReceipt);
router.post('/:id/payroll/preview', requirePermission('personal', 'edit'), payrollController.preview);
router.post('/:id/payroll/confirm', requirePermission('personal', 'edit'), preventDuplicateSubmit, payrollController.confirm);
router.post('/:id/cedula', requirePermission('personal', 'edit'), uploadCedula.single('file'), employeeController.uploadCedula);

router.post('/:id/severance/preview', requirePermission('personal', 'edit'), severanceController.preview);
router.post('/:id/severance', requirePermission('personal', 'edit'), preventDuplicateSubmit, severanceController.confirmRetirement);
router.post('/:id/severance/paz-y-salvo', requirePermission('personal', 'edit'), uploadPazYSalvo.single('file'), severanceController.uploadPazYSalvo);

router.get('/:id/contracts', requirePermission('personal', 'view'), employeeContractController.list);
router.post('/:id/contracts', requirePermission('personal', 'edit'), preventDuplicateSubmit, employeeContractController.generate);
router.post('/:id/contracts/:contractId/otrosi', requirePermission('personal', 'edit'), preventDuplicateSubmit, employeeContractController.generateOtrosi);
router.delete('/:id/contracts/:contractId', requirePermission('personal', 'delete'), employeeContractController.removeDocument);

module.exports = router;
