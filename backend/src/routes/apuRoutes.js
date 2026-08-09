const multer = require('multer');
const path = require('path');
const router = require('express').Router();
const { authenticate } = require('../middleware/auth');
const { requirePermission } = require('../middleware/authorize');
const apuController = require('../controllers/apuController');

// Almacenamiento en memoria (no se persiste el archivo, solo se parsea y se descarta).
const importUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!['.xlsx', '.xls'].includes(ext)) return cb(new Error('El archivo debe ser .xlsx o .xls'));
    cb(null, true);
  },
});

router.use(authenticate);

router.post('/import', requirePermission('cotizaciones', 'create'), importUpload.single('file'), apuController.importCatalog);
router.get('/imports', requirePermission('cotizaciones', 'view'), apuController.listImports);

router.get('/', requirePermission('cotizaciones', 'view'), apuController.list);
router.post('/', requirePermission('cotizaciones', 'create'), apuController.create);
router.get('/:id', requirePermission('cotizaciones', 'view'), apuController.get);
router.get('/:id/price-history', requirePermission('cotizaciones', 'view'), apuController.priceHistory);
router.post('/:id/export-pdf', requirePermission('cotizaciones', 'view'), apuController.exportPdf);
router.post('/:id/export-excel', requirePermission('cotizaciones', 'view'), apuController.exportExcel);
router.put('/:id', requirePermission('cotizaciones', 'edit'), apuController.update);
router.delete('/:id', requirePermission('cotizaciones', 'delete'), apuController.remove);
router.post('/:id/components', requirePermission('cotizaciones', 'edit'), apuController.addComponent);
router.delete('/:id/components/:componentId', requirePermission('cotizaciones', 'edit'), apuController.removeComponent);

module.exports = router;
