const router = require('express').Router();
const { authenticate } = require('../middleware/auth');
const { requirePermission } = require('../middleware/authorize');
const adminExpenseReportController = require('../controllers/adminExpenseReportController');

// Ver el reporte de Gastos Administrativos Generales es una acción del módulo 'gastos_admin' (por
// defecto solo Admin y Gerente, configurable desde Administración > Roles) — mismo módulo que
// gobierna crear/editar gastos administrativos.
router.use(authenticate, requirePermission('gastos_admin', 'view'));

router.get('/', adminExpenseReportController.getReport);
router.get('/export-pdf', adminExpenseReportController.exportPdf);
router.get('/export-excel', adminExpenseReportController.exportExcel);

module.exports = router;
