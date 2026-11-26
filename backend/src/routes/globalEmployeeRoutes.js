const multer = require('multer');
const path = require('path');
const router = require('express').Router();
const { authenticate } = require('../middleware/auth');
const { requirePermission } = require('../middleware/authorize');
const { makeUploader } = require('../middleware/upload');
const { preventDuplicateSubmit } = require('../middleware/idempotency');
const { Employee, EmployeeAssignment } = require('../models');
const { requireEmployeeAccess } = require('../utils/employeeProjectAccess');
const employeeController = require('../controllers/employeeController');
const employeeAssignmentController = require('../controllers/employeeAssignmentController');
const severanceController = require('../controllers/severanceController');
const employeeContractController = require('../controllers/employeeContractController');
const aiDocumentController = require('../controllers/aiDocumentController');
const payrollController = require('../controllers/payrollController');
const employeeLeaveController = require('../controllers/employeeLeaveController');
const employeeDeductionController = require('../controllers/employeeDeductionController');

// Montado en /employees (sin :projectId en la URL): Personal del menú principal, donde se ve TODO
// el personal de la empresa (administrativo + de proyecto) con sus propios filtros. Es el mismo
// controlador que /projects/:projectId/employees (employeeRoutes.js) — ver el comentario al inicio
// de employeeController.js. La seguridad por proyecto se resuelve consultando el trabajador mismo
// (requireEmployeeAccess, ver utils/employeeProjectAccess.js): un trabajador administrativo
// (projectId null) pasa siempre; uno de proyecto exige que el usuario esté asignado a ese proyecto
// O a cualquier otro contrato donde tenga una EmployeeAssignment activa.

const uploadContract = makeUploader('employee-contracts', 'document');
const uploadSocialSecurity = makeUploader('social-security', 'document');
const uploadPayment = makeUploader('payment-receipts', 'document');
const uploadPazYSalvo = makeUploader('paz-y-salvo', 'document');
const uploadCedula = makeUploader('employee-id-documents', 'any');
const uploadLeaveSupport = makeUploader('employee-leaves', 'paymentSupport');
const uploadDeductionSupport = makeUploader('employee-deductions', 'paymentSupport');
const uploadExternalContract = makeUploader('employee-contracts-external', 'any');

const scanContractUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!['.pdf', '.jpg', '.jpeg', '.png', '.webp'].includes(ext)) {
      return cb(new Error('El archivo debe ser PDF, JPG, PNG o WEBP'));
    }
    cb(null, true);
  },
});

router.use(authenticate);

router.get('/', requirePermission('personal', 'view'), employeeController.list);
router.get('/:id', requirePermission('personal', 'view'), requireEmployeeAccess({ Employee, EmployeeAssignment }), employeeController.get);
router.post('/', requirePermission('personal', 'create'), uploadContract.single('file'), preventDuplicateSubmit, employeeController.create);
router.put('/:id', requirePermission('personal', 'edit'), requireEmployeeAccess({ Employee, EmployeeAssignment }), uploadContract.single('file'), employeeController.update);
router.delete('/:id', requirePermission('personal', 'delete'), requireEmployeeAccess({ Employee, EmployeeAssignment }), employeeController.remove);
router.post('/preview-contract-value', requirePermission('personal', 'view'), employeeController.previewContractValue);

router.post('/:id/social-security', requirePermission('personal', 'edit'), requireEmployeeAccess({ Employee, EmployeeAssignment }), uploadSocialSecurity.single('file'), preventDuplicateSubmit, employeeController.addSocialSecurityDocument);
router.post('/:id/payments', requirePermission('personal', 'edit'), requireEmployeeAccess({ Employee, EmployeeAssignment }), uploadPayment.single('file'), preventDuplicateSubmit, employeeController.addPaymentReceipt);
router.post('/:id/payroll/preview', requirePermission('personal', 'edit'), requireEmployeeAccess({ Employee, EmployeeAssignment }), payrollController.preview);
router.post('/:id/payroll/confirm', requirePermission('personal', 'edit'), requireEmployeeAccess({ Employee, EmployeeAssignment }), preventDuplicateSubmit, payrollController.confirm);
router.post('/:id/cedula', requirePermission('personal', 'edit'), requireEmployeeAccess({ Employee, EmployeeAssignment }), uploadCedula.single('file'), employeeController.uploadCedula);

router.get('/:id/assignments', requirePermission('personal', 'view'), requireEmployeeAccess({ Employee, EmployeeAssignment }), employeeAssignmentController.list);
router.post('/:id/assignments', requirePermission('personal', 'edit'), requireEmployeeAccess({ Employee, EmployeeAssignment }), preventDuplicateSubmit, employeeAssignmentController.create);
router.put('/:id/assignments/:assignmentId', requirePermission('personal', 'edit'), requireEmployeeAccess({ Employee, EmployeeAssignment }), employeeAssignmentController.update);
router.post('/:id/assignments/:assignmentId/finalize', requirePermission('personal', 'edit'), requireEmployeeAccess({ Employee, EmployeeAssignment }), employeeAssignmentController.finalize);
router.delete('/:id/assignments/:assignmentId', requirePermission('personal', 'delete'), requireEmployeeAccess({ Employee, EmployeeAssignment }), employeeAssignmentController.remove);

router.post('/:id/severance/preview', requirePermission('personal', 'edit'), requireEmployeeAccess({ Employee, EmployeeAssignment }), severanceController.preview);
router.post('/:id/severance', requirePermission('personal', 'edit'), requireEmployeeAccess({ Employee, EmployeeAssignment }), preventDuplicateSubmit, severanceController.confirmRetirement);
router.post('/:id/severance/paz-y-salvo', requirePermission('personal', 'edit'), requireEmployeeAccess({ Employee, EmployeeAssignment }), uploadPazYSalvo.single('file'), severanceController.uploadPazYSalvo);

router.get('/:id/contracts', requirePermission('personal', 'view'), requireEmployeeAccess({ Employee, EmployeeAssignment }), employeeContractController.list);
router.post('/:id/contracts', requirePermission('personal', 'edit'), requireEmployeeAccess({ Employee, EmployeeAssignment }), preventDuplicateSubmit, employeeContractController.generate);
router.post('/:id/contracts/scan', requirePermission('personal', 'edit'), requireEmployeeAccess({ Employee, EmployeeAssignment }), scanContractUpload.single('file'), aiDocumentController.scanDocument('employeeContract'));
router.post('/:id/contracts/external', requirePermission('personal', 'edit'), requireEmployeeAccess({ Employee, EmployeeAssignment }), uploadExternalContract.single('file'), preventDuplicateSubmit, employeeContractController.uploadExternal);
router.put('/:id/contracts/:contractId/file', requirePermission('personal', 'edit'), requireEmployeeAccess({ Employee, EmployeeAssignment }), uploadExternalContract.single('file'), employeeContractController.replaceFile);
router.post('/:id/contracts/:contractId/otrosi', requirePermission('personal', 'edit'), requireEmployeeAccess({ Employee, EmployeeAssignment }), preventDuplicateSubmit, employeeContractController.generateOtrosi);
router.delete('/:id/contracts/:contractId', requirePermission('personal', 'delete'), requireEmployeeAccess({ Employee, EmployeeAssignment }), employeeContractController.removeDocument);
router.post('/:id/contracts/:contractId/request-signature', requirePermission('personal', 'edit'), requireEmployeeAccess({ Employee, EmployeeAssignment }), preventDuplicateSubmit, employeeContractController.sendForSignature);

router.get('/:id/leaves', requirePermission('personal', 'view'), requireEmployeeAccess({ Employee, EmployeeAssignment }), employeeLeaveController.list);
router.post('/:id/leaves', requirePermission('personal', 'edit'), requireEmployeeAccess({ Employee, EmployeeAssignment }), uploadLeaveSupport.single('file'), preventDuplicateSubmit, employeeLeaveController.create);
router.delete('/:id/leaves/:leaveId', requirePermission('personal', 'delete'), requireEmployeeAccess({ Employee, EmployeeAssignment }), employeeLeaveController.remove);
router.get('/:id/vacation-balance', requirePermission('personal', 'view'), requireEmployeeAccess({ Employee, EmployeeAssignment }), employeeLeaveController.vacationBalance);

router.get('/:id/deductions', requirePermission('personal', 'view'), requireEmployeeAccess({ Employee, EmployeeAssignment }), employeeDeductionController.list);
router.post('/:id/deductions', requirePermission('personal', 'edit'), requireEmployeeAccess({ Employee, EmployeeAssignment }), uploadDeductionSupport.single('file'), preventDuplicateSubmit, employeeDeductionController.create);
router.post('/:id/deductions/:deductionId/status', requirePermission('personal', 'edit'), requireEmployeeAccess({ Employee, EmployeeAssignment }), employeeDeductionController.setStatus);
router.delete('/:id/deductions/:deductionId', requirePermission('personal', 'delete'), requireEmployeeAccess({ Employee, EmployeeAssignment }), employeeDeductionController.remove);

module.exports = router;
