const multer = require('multer');
const path = require('path');
const router = require('express').Router({ mergeParams: true });
const { authenticate } = require('../middleware/auth');
const { requirePermission, requireProjectAccess } = require('../middleware/authorize');
const budgetController = require('../controllers/budgetController');

// Almacenamiento en memoria (no se persiste el archivo, solo se parsea y se descarta).
const importUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!['.xlsx', '.xls'].includes(ext)) return cb(new Error('El archivo debe ser .xlsx o .xls'));
    cb(null, true);
  },
});

router.use(authenticate, requireProjectAccess((r) => r.params.projectId));

router.get('/', requirePermission('ejecucion', 'view'), budgetController.getProjectBudget);
router.post('/', requirePermission('ejecucion', 'create'), budgetController.createBudgetVersion);
router.put('/:budgetId', requirePermission('ejecucion', 'edit'), budgetController.updateBudget);
router.post('/import', requirePermission('ejecucion', 'create'), importUpload.single('file'), budgetController.importFromFile);
router.post('/:budgetId/items', requirePermission('ejecucion', 'create'), budgetController.addItem);
router.delete('/:budgetId/items/:itemId', requirePermission('ejecucion', 'delete'), budgetController.removeItem);
router.post('/export-pdf', requirePermission('ejecucion', 'view'), budgetController.exportPdf);
router.post('/export-excel', requirePermission('ejecucion', 'view'), budgetController.exportExcel);

module.exports = router;
