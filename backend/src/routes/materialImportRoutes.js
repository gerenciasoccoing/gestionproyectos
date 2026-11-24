const multer = require('multer');
const path = require('path');
const router = require('express').Router();
const { authenticate } = require('../middleware/auth');
const { requirePermission } = require('../middleware/authorize');
const { preventDuplicateSubmit } = require('../middleware/idempotency');
const materialImportController = require('../controllers/materialImportController');

// Almacenamiento en memoria (no se persiste el archivo, solo se parsea y se descarta) — mismo
// criterio que budgetRoutes.js#importUpload.
const importUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!['.xlsx', '.xls', '.csv'].includes(ext)) return cb(new Error('El archivo debe ser .xlsx, .xls o .csv'));
    cb(null, true);
  },
});

router.use(authenticate);

router.get('/template', materialImportController.downloadTemplate);
// "Solo pueden importar los roles que tengan permiso para crear materiales" (ver la especificación)
// — mismo permiso que crear un material a mano, 'inventario_materiales:create'.
router.post('/parse', requirePermission('inventario_materiales', 'create'), importUpload.single('file'), materialImportController.parse);
router.post('/commit', requirePermission('inventario_materiales', 'create'), preventDuplicateSubmit, materialImportController.commit);
router.post('/export-errors', requirePermission('inventario_materiales', 'create'), materialImportController.exportErrors);

module.exports = router;
