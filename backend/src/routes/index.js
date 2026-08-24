const router = require('express').Router();

router.use('/auth', require('./authRoutes'));
router.use('/users', require('./userRoutes'));
router.use('/roles', require('./roleRoutes'));
router.use('/labor-parameters', require('./laborParametersRoutes'));
router.use('/price-items', require('./priceItemRoutes'));
router.use('/apus', require('./apuRoutes'));
router.use('/quotations', require('./quotationRoutes'));
router.use('/company-settings', require('./companySettingsRoutes'));
router.use('/third-parties', require('./thirdPartyRoutes'));
router.use('/inventory-items', require('./inventoryItemRoutes'));
router.use('/inventory-checkouts', require('./inventoryCheckoutRoutes'));
router.use('/inventory-confirmations', require('./inventoryConfirmationRoutes'));
router.use('/purchase-orders', require('./globalPurchaseOrderRoutes'));
router.use('/cash-boxes', require('./cashBoxRoutes'));
router.use('/expenses', require('./globalExpenseRoutes'));
router.use('/platform-admin', require('./platformAdminRoutes'));
router.use('/employee-contract-types', require('./employeeContractTypeRoutes'));
router.use('/register-company', require('./companyRegistrationRoutes'));

router.use('/projects', require('./projectRoutes'));
router.use('/projects/:projectId/contracts', require('./contractRoutes'));
router.use('/projects/:projectId/policies', require('./policyRoutes'));
router.use('/projects/:projectId/minutes', require('./minuteRoutes'));
router.use('/projects/:projectId/milestones', require('./milestoneRoutes'));
router.use('/projects/:projectId/budget', require('./budgetRoutes'));
router.use('/projects/:projectId/progress', require('./progressRoutes'));
router.use('/projects/:projectId/purchase-orders', require('./purchaseOrderRoutes'));
router.use('/projects/:projectId/employees', require('./employeeRoutes'));
router.use('/projects/:projectId/expenses', require('./expenseRoutes'));
router.use('/projects/:projectId/risks', require('./riskRoutes'));
router.use('/projects/:projectId/reports', require('./reportRoutes'));
router.use('/projects/:projectId/execution', require('./executionRoutes'));

module.exports = router;
