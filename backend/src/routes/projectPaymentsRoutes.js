const router = require('express').Router({ mergeParams: true });
const { authenticate } = require('../middleware/auth');
const { requireProjectAccess } = require('../middleware/authorize');
const projectPaymentsController = require('../controllers/projectPaymentsController');

// Visible para cualquiera con acceso al proyecto (igual que las demás pestañas del detalle de
// proyecto) — sin requirePermission de módulo adicional: no es una sección de creación/edición de
// un recurso nuevo, es una vista consolidada de datos que ya viven en Cajas (ver
// projectPaymentsService.js, única fuente de verdad). La visibilidad del valor del contrato en el
// resumen se filtra aparte por rol (ver projectPaymentsController.getSummary).
router.use(authenticate, requireProjectAccess((r) => r.params.projectId));

router.get('/summary', projectPaymentsController.getSummary);
router.get('/', projectPaymentsController.listPayments);
router.get('/export-pdf', projectPaymentsController.exportPdf);
router.get('/export-excel', projectPaymentsController.exportExcel);

module.exports = router;
