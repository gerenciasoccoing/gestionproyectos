const router = require('express').Router();
const { authenticate } = require('../middleware/auth');
const { requirePermission, requireOptionalProjectAccess } = require('../middleware/authorize');
const { makeUploader } = require('../middleware/upload');
const { preventDuplicateSubmit } = require('../middleware/idempotency');
const { Employee } = require('../models');
const employeeController = require('../controllers/employeeController');
const severanceController = require('../controllers/severanceController');
const employeeContractController = require('../controllers/employeeContractController');
const payrollController = require('../controllers/payrollController');
const employeeLeaveController = require('../controllers/employeeLeaveController');
const employeeDeductionController = require('../controllers/employeeDeductionController');

// Montado en /employees (sin :projectId en la URL): Personal del menú principal, donde se ve TODO
// el personal de la empresa (administrativo + de proyecto) con sus propios filtros. Es el mismo
// controlador que /projects/:projectId/employees (employeeRoutes.js) — ver el comentario al inicio
// de employeeController.js. La seguridad por proyecto se resuelve consultando el trabajador mismo
// (requireOptionalProjectAccess, igual que globalExpenseRoutes.js): un trabajador administrativo
// (projectId null) pasa siempre, uno de proyecto exige que el usuario esté asignado a ese proyecto.

const uploadContract = makeUploader('employee-contracts', 'document');
const uploadSocialSecurity = makeUploader('social-security', 'document');
const uploadPayment = makeUploader('payment-receipts', 'document');
const uploadPazYSalvo = makeUploader('paz-y-salvo', 'document');
const uploadCedula = makeUploader('employee-id-documents', 'any');
const uploadLeaveSupport = makeUploader('employee-leaves', 'paymentSupport');
const uploadDeductionSupport = makeUploader('employee-deductions', 'paymentSupport');

router.use(authenticate);

const byIdParam = async (req) => Employee.findByPk(req.params.id);

router.get('/', requirePermission('personal', 'view'), employeeController.list);
router.get('/:id', requirePermission('personal', 'view'), requireOptionalProjectAccess(byIdParam), employeeController.get);
router.post('/', requirePermission('personal', 'create'), uploadContract.single('file'), preventDuplicateSubmit, employeeController.create);
router.put('/:id', requirePermission('personal', 'edit'), requireOptionalProjectAccess(byIdParam), uploadContract.single('file'), employeeController.update);
router.delete('/:id', requirePermission('personal', 'delete'), requireOptionalProjectAccess(byIdParam), employeeController.remove);
router.post('/preview-contract-value', requirePermission('personal', 'view'), employeeController.previewContractValue);

router.post('/:id/social-security', requirePermission('personal', 'edit'), requireOptionalProjectAccess(byIdParam), uploadSocialSecurity.single('file'), preventDuplicateSubmit, employeeController.addSocialSecurityDocument);
router.post('/:id/payments', requirePermission('personal', 'edit'), requireOptionalProjectAccess(byIdParam), uploadPayment.single('file'), preventDuplicateSubmit, employeeController.addPaymentReceipt);
router.post('/:id/payroll/preview', requirePermission('personal', 'edit'), requireOptionalProjectAccess(byIdParam), payrollController.preview);
router.post('/:id/payroll/confirm', requirePermission('personal', 'edit'), requireOptionalProjectAccess(byIdParam), preventDuplicateSubmit, payrollController.confirm);
router.post('/:id/cedula', requirePermission('personal', 'edit'), requireOptionalProjectAccess(byIdParam), uploadCedula.single('file'), employeeController.uploadCedula);

router.post('/:id/severance/preview', requirePermission('personal', 'edit'), requireOptionalProjectAccess(byIdParam), severanceController.preview);
router.post('/:id/severance', requirePermission('personal', 'edit'), requireOptionalProjectAccess(byIdParam), preventDuplicateSubmit, severanceController.confirmRetirement);
router.post('/:id/severance/paz-y-salvo', requirePermission('personal', 'edit'), requireOptionalProjectAccess(byIdParam), uploadPazYSalvo.single('file'), severanceController.uploadPazYSalvo);

router.get('/:id/contracts', requirePermission('personal', 'view'), requireOptionalProjectAccess(byIdParam), employeeContractController.list);
router.post('/:id/contracts', requirePermission('personal', 'edit'), requireOptionalProjectAccess(byIdParam), preventDuplicateSubmit, employeeContractController.generate);
router.post('/:id/contracts/:contractId/otrosi', requirePermission('personal', 'edit'), requireOptionalProjectAccess(byIdParam), preventDuplicateSubmit, employeeContractController.generateOtrosi);
router.delete('/:id/contracts/:contractId', requirePermission('personal', 'delete'), requireOptionalProjectAccess(byIdParam), employeeContractController.removeDocument);
router.post('/:id/contracts/:contractId/request-signature', requirePermission('personal', 'edit'), requireOptionalProjectAccess(byIdParam), preventDuplicateSubmit, employeeContractController.sendForSignature);

router.get('/:id/leaves', requirePermission('personal', 'view'), requireOptionalProjectAccess(byIdParam), employeeLeaveController.list);
router.post('/:id/leaves', requirePermission('personal', 'edit'), requireOptionalProjectAccess(byIdParam), uploadLeaveSupport.single('file'), preventDuplicateSubmit, employeeLeaveController.create);
router.delete('/:id/leaves/:leaveId', requirePermission('personal', 'delete'), requireOptionalProjectAccess(byIdParam), employeeLeaveController.remove);
router.get('/:id/vacation-balance', requirePermission('personal', 'view'), requireOptionalProjectAccess(byIdParam), employeeLeaveController.vacationBalance);

router.get('/:id/deductions', requirePermission('personal', 'view'), requireOptionalProjectAccess(byIdParam), employeeDeductionController.list);
router.post('/:id/deductions', requirePermission('personal', 'edit'), requireOptionalProjectAccess(byIdParam), uploadDeductionSupport.single('file'), preventDuplicateSubmit, employeeDeductionController.create);
router.post('/:id/deductions/:deductionId/status', requirePermission('personal', 'edit'), requireOptionalProjectAccess(byIdParam), employeeDeductionController.setStatus);
router.delete('/:id/deductions/:deductionId', requirePermission('personal', 'delete'), requireOptionalProjectAccess(byIdParam), employeeDeductionController.remove);

module.exports = router;
