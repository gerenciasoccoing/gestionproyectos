const multer = require('multer');
const path = require('path');
const router = require('express').Router({ mergeParams: true });
const { authenticate } = require('../middleware/auth');
const { requirePermission, requireProjectAccess } = require('../middleware/authorize');
const { makeUploader } = require('../middleware/upload');
const { preventDuplicateSubmit } = require('../middleware/idempotency');
const employeeController = require('../controllers/employeeController');
const severanceController = require('../controllers/severanceController');
const employeeContractController = require('../controllers/employeeContractController');
const aiDocumentController = require('../controllers/aiDocumentController');
const payrollController = require('../controllers/payrollController');
const employeeLeaveController = require('../controllers/employeeLeaveController');
const employeeDeductionController = require('../controllers/employeeDeductionController');

const uploadContract = makeUploader('employee-contracts', 'document');
const uploadSocialSecurity = makeUploader('social-security', 'document');
const uploadPayment = makeUploader('payment-receipts', 'document');
const uploadPazYSalvo = makeUploader('paz-y-salvo', 'document');
const uploadCedula = makeUploader('employee-id-documents', 'any');
// 'paymentSupport' = PDF/JPG/PNG, exactamente lo pedido para el soporte de una novedad.
const uploadLeaveSupport = makeUploader('employee-leaves', 'paymentSupport');
const uploadDeductionSupport = makeUploader('employee-deductions', 'paymentSupport');
const uploadExternalContract = makeUploader('employee-contracts-external', 'any');

// En memoria (no se persiste): solo se usa para leer el contrato con IA y descartarlo — mismo
// patrón que contractRoutes.js. Un .docx no se acepta acá (aiVisionService no lo lee nativamente,
// ver el comentario en externalContractService.js); sí se acepta al subir el archivo definitivo.
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
router.post('/:id/contracts/scan', requirePermission('personal', 'edit'), scanContractUpload.single('file'), aiDocumentController.scanDocument('employeeContract'));
router.post('/:id/contracts/external', requirePermission('personal', 'edit'), uploadExternalContract.single('file'), preventDuplicateSubmit, employeeContractController.uploadExternal);
router.put('/:id/contracts/:contractId/file', requirePermission('personal', 'edit'), uploadExternalContract.single('file'), employeeContractController.replaceFile);
router.post('/:id/contracts/:contractId/otrosi', requirePermission('personal', 'edit'), preventDuplicateSubmit, employeeContractController.generateOtrosi);
router.delete('/:id/contracts/:contractId', requirePermission('personal', 'delete'), employeeContractController.removeDocument);
router.post('/:id/contracts/:contractId/request-signature', requirePermission('personal', 'edit'), preventDuplicateSubmit, employeeContractController.sendForSignature);

router.get('/:id/leaves', requirePermission('personal', 'view'), employeeLeaveController.list);
router.post('/:id/leaves', requirePermission('personal', 'edit'), uploadLeaveSupport.single('file'), preventDuplicateSubmit, employeeLeaveController.create);
router.delete('/:id/leaves/:leaveId', requirePermission('personal', 'delete'), employeeLeaveController.remove);
router.get('/:id/vacation-balance', requirePermission('personal', 'view'), employeeLeaveController.vacationBalance);

router.get('/:id/deductions', requirePermission('personal', 'view'), employeeDeductionController.list);
router.post('/:id/deductions', requirePermission('personal', 'edit'), uploadDeductionSupport.single('file'), preventDuplicateSubmit, employeeDeductionController.create);
router.post('/:id/deductions/:deductionId/status', requirePermission('personal', 'edit'), employeeDeductionController.setStatus);
router.delete('/:id/deductions/:deductionId', requirePermission('personal', 'delete'), employeeDeductionController.remove);

module.exports = router;
