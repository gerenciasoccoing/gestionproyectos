const multer = require('multer');
const path = require('path');
const router = require('express').Router({ mergeParams: true });
const { authenticate } = require('../middleware/auth');
const { requirePermission, requireProjectAccess } = require('../middleware/authorize');
const { makeUploader } = require('../middleware/upload');
const { preventDuplicateSubmit } = require('../middleware/idempotency');
const expenseController = require('../controllers/expenseController');

const upload = makeUploader('expenses', 'any');
const uploadFiles = upload.fields([
  { name: 'invoiceFile', maxCount: 1 },
  { name: 'paymentReceiptFile', maxCount: 1 },
]);

// En memoria (no se persiste): solo se usa para leer la factura y descartarla; el archivo
// definitivo se vuelve a subir (a disco, vía `upload`) cuando el usuario confirma el gasto.
const scanUpload = multer({
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

router.get('/summary', requirePermission('gastos', 'view'), expenseController.summary);
router.post('/budget', requirePermission('gastos', 'edit'), expenseController.setBudget);
router.post('/scan', requirePermission('gastos', 'create'), scanUpload.single('file'), expenseController.scan);
router.get('/', requirePermission('gastos', 'view'), expenseController.list);
router.post('/', requirePermission('gastos', 'create'), uploadFiles, preventDuplicateSubmit, expenseController.create);
router.put('/:id', requirePermission('gastos', 'edit'), uploadFiles, expenseController.update);
router.delete('/:id', requirePermission('gastos', 'delete'), expenseController.remove);

module.exports = router;
