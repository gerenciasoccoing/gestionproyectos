const multer = require('multer');
const path = require('path');
const router = require('express').Router();
const { authenticate } = require('../middleware/auth');
const { requirePermission, requireOptionalProjectAccess } = require('../middleware/authorize');
const { makeUploader } = require('../middleware/upload');
const { preventDuplicateSubmit } = require('../middleware/idempotency');
const { Expense } = require('../models');
const expenseController = require('../controllers/expenseController');

// Montado en /expenses (sin :projectId en la URL): la vista general de Gastos, donde el proyecto
// es opcional y hay filtros adicionales (proyecto/proveedor/caja/fechas). Es el mismo controlador
// que /projects/:projectId/expenses (expenseRoutes.js) — ver el comentario al inicio de
// expenseController.js. La seguridad por proyecto se resuelve consultando el gasto mismo
// (requireOptionalProjectAccess), ya que aquí no viene en la URL.

const upload = makeUploader('expenses', 'any');
const uploadFiles = upload.fields([
  { name: 'invoiceFile', maxCount: 1 },
  { name: 'paymentReceiptFile', maxCount: 1 },
]);

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

router.use(authenticate);

const byIdParam = async (req) => Expense.findByPk(req.params.id);

router.get('/', requirePermission('gastos', 'view'), expenseController.list);
router.post('/', requirePermission('gastos', 'create'), uploadFiles, preventDuplicateSubmit, expenseController.create);
router.post('/scan', requirePermission('gastos', 'create'), scanUpload.single('file'), expenseController.scan);
router.put('/:id', requirePermission('gastos', 'edit'), requireOptionalProjectAccess(byIdParam), uploadFiles, expenseController.update);
router.delete('/:id', requirePermission('gastos', 'delete'), requireOptionalProjectAccess(byIdParam), expenseController.remove);

module.exports = router;
