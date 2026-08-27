const multer = require('multer');
const path = require('path');
const router = require('express').Router();
const { authenticate } = require('../middleware/auth');
const { requirePermission } = require('../middleware/authorize');
const { preventDuplicateSubmit } = require('../middleware/idempotency');
const priceItemController = require('../controllers/priceItemController');

// Almacenamiento en memoria (no se persiste el archivo, solo se parsea y se descarta).
const importUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!['.xlsx', '.xls'].includes(ext)) return cb(new Error('El archivo debe ser .xlsx o .xls'));
    cb(null, true);
  },
});

router.use(authenticate);

router.get('/import/template', requirePermission('cotizaciones', 'view'), priceItemController.downloadTemplate);
router.post('/import', requirePermission('cotizaciones', 'create'), importUpload.single('file'), priceItemController.importExcel);

router.get('/', requirePermission('cotizaciones', 'view'), priceItemController.list);
router.post('/', requirePermission('cotizaciones', 'create'), preventDuplicateSubmit, priceItemController.create);
router.get('/:id', requirePermission('cotizaciones', 'view'), priceItemController.get);
router.put('/:id', requirePermission('cotizaciones', 'edit'), priceItemController.update);
router.put('/:id/value', requirePermission('cotizaciones', 'edit'), priceItemController.updateValue);
router.delete('/:id', requirePermission('cotizaciones', 'delete'), priceItemController.remove);

module.exports = router;
