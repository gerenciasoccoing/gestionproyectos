import client, { postAndDownload, platformAdminClient } from './client';

export const authApi = {
  login: (email, password) => client.post('/auth/login', { email, password }).then((r) => r.data),
  forgotPassword: (email) => client.post('/auth/forgot-password', { email }).then((r) => r.data),
  resetPassword: (token, password) => client.post('/auth/reset-password', { token, password }).then((r) => r.data),
  me: () => client.get('/auth/me').then((r) => r.data),
};

// Registro público de empresa (sin sesión, desde el login) — queda "pendiente" hasta que un
// operador de plataforma la apruebe o rechace (ver platformAdminApi.listRegistrationRequests).
export const companyRegistrationApi = {
  create: (data) => client.post('/register-company', data).then((r) => r.data),
};

// Panel de super-admin (multi-tenant) — sesión propia de operador, ver client.js/platformAdminClient
// y backend/middleware/platformAdminAuth.js. Nada de esto pasa por el token de usuario normal.
export const platformAdminApi = {
  login: (email, password) => platformAdminClient.post('/platform-admin/login', { email, password }).then((r) => r.data),
  listCompanies: () => platformAdminClient.get('/platform-admin/companies').then((r) => r.data),
  createCompany: (data) => platformAdminClient.post('/platform-admin/companies', data).then((r) => r.data),
  setCompanyStatus: (id, active) => platformAdminClient.patch(`/platform-admin/companies/${id}/status`, { active }).then((r) => r.data),
  updateCompanyPlan: (id, data) => platformAdminClient.patch(`/platform-admin/companies/${id}/plan`, data).then((r) => r.data),
  updateCompanyFeatures: (id, enabledFeatures) => platformAdminClient.patch(`/platform-admin/companies/${id}/features`, { enabledFeatures }).then((r) => r.data),
  impersonateCompany: (id, reason) => platformAdminClient.post(`/platform-admin/companies/${id}/impersonate`, { reason }).then((r) => r.data),
  listSupportAccessLog: () => platformAdminClient.get('/platform-admin/support-access-log').then((r) => r.data),
  listRegistrationRequests: (status) => platformAdminClient.get('/platform-admin/registration-requests', { params: status ? { status } : {} }).then((r) => r.data),
  approveRegistrationRequest: (id) => platformAdminClient.post(`/platform-admin/registration-requests/${id}/approve`).then((r) => r.data),
  rejectRegistrationRequest: (id, reason) => platformAdminClient.post(`/platform-admin/registration-requests/${id}/reject`, { reason }).then((r) => r.data),
};

export const usersApi = {
  list: () => client.get('/users').then((r) => r.data),
  create: (data) => client.post('/users', data).then((r) => r.data),
  update: (id, data) => client.put(`/users/${id}`, data).then((r) => r.data),
  remove: (id) => client.delete(`/users/${id}`),
  assignProjects: (id, projectIds) => client.put(`/users/${id}/projects`, { projectIds }).then((r) => r.data),
};

export const rolesApi = {
  list: () => client.get('/roles').then((r) => r.data),
  catalog: () => client.get('/roles/permissions-catalog').then((r) => r.data),
  create: (data) => client.post('/roles', data).then((r) => r.data),
  update: (id, data) => client.put(`/roles/${id}`, data).then((r) => r.data),
  remove: (id) => client.delete(`/roles/${id}`),
};

export const laborParamsApi = {
  list: () => client.get('/labor-parameters').then((r) => r.data),
  create: (data) => client.post('/labor-parameters', data).then((r) => r.data),
  // Parámetros vigentes hoy (SMLV, auxilio de transporte, etc.) — usados para prellenar el
  // salario base y mostrar el auxilio de transporte al crear/editar un trabajador.
  current: () => client.get('/labor-parameters/current').then((r) => r.data),
};

// Catálogo de EPS/fondos de pensión/ARL (ver socialSecurityProviderController.js): precargado con
// las entidades colombianas más comunes, con opción de crear una nueva si no está en la lista.
export const socialSecurityProvidersApi = {
  list: (type) => client.get('/social-security-providers', { params: { type } }).then((r) => r.data),
  create: (type, name) => client.post('/social-security-providers', { type, name }).then((r) => r.data),
};

// Consorcios / Uniones Temporales: entidades contratantes alternas a la empresa principal,
// asignables a un proyecto (ver Project.consortiumId) para que sus documentos usen este membrete.
export const consortiumsApi = {
  list: () => client.get('/consortiums').then((r) => r.data),
  get: (id) => client.get(`/consortiums/${id}`).then((r) => r.data),
  create: (formData) => client.post('/consortiums', formData).then((r) => r.data),
  update: (id, formData) => client.put(`/consortiums/${id}`, formData).then((r) => r.data),
  remove: (id) => client.delete(`/consortiums/${id}`),
};

export const companyApi = {
  get: () => client.get('/company-settings').then((r) => r.data),
  update: (formData) => client.put('/company-settings', formData).then((r) => r.data),
};

export const projectsApi = {
  list: () => client.get('/projects').then((r) => r.data),
  get: (id) => client.get(`/projects/${id}`).then((r) => r.data),
  create: (data) => client.post('/projects', data).then((r) => r.data),
  update: (id, data) => client.put(`/projects/${id}`, data).then((r) => r.data),
  remove: (id) => client.delete(`/projects/${id}`),
  assignUsers: (id, userIds) => client.put(`/projects/${id}/users`, { userIds }).then((r) => r.data),
};

export const contractsApi = {
  list: (pid) => client.get(`/projects/${pid}/contracts`).then((r) => r.data),
  create: (pid, formData) => client.post(`/projects/${pid}/contracts`, formData).then((r) => r.data),
  update: (pid, id, formData) => client.put(`/projects/${pid}/contracts/${id}`, formData).then((r) => r.data),
  remove: (pid, id) => client.delete(`/projects/${pid}/contracts/${id}`),
  scan: (pid, formData) => client.post(`/projects/${pid}/contracts/scan`, formData).then((r) => r.data),
};

export const policiesApi = {
  list: (pid) => client.get(`/projects/${pid}/policies`).then((r) => r.data),
  create: (pid, formData) => client.post(`/projects/${pid}/policies`, formData).then((r) => r.data),
  update: (pid, id, formData) => client.put(`/projects/${pid}/policies/${id}`, formData).then((r) => r.data),
  remove: (pid, id) => client.delete(`/projects/${pid}/policies/${id}`),
  scan: (pid, formData) => client.post(`/projects/${pid}/policies/scan`, formData).then((r) => r.data),
};

export const minutesApi = {
  list: (pid) => client.get(`/projects/${pid}/minutes`).then((r) => r.data),
  create: (pid, formData) => client.post(`/projects/${pid}/minutes`, formData).then((r) => r.data),
  remove: (pid, id) => client.delete(`/projects/${pid}/minutes/${id}`),
};

export const milestonesApi = {
  list: (pid) => client.get(`/projects/${pid}/milestones`).then((r) => r.data),
  create: (pid, data) => client.post(`/projects/${pid}/milestones`, data).then((r) => r.data),
  update: (pid, id, data) => client.put(`/projects/${pid}/milestones/${id}`, data).then((r) => r.data),
  remove: (pid, id) => client.delete(`/projects/${pid}/milestones/${id}`),
};

export const budgetApi = {
  get: (pid) => client.get(`/projects/${pid}/budget`).then((r) => r.data),
  createVersion: (pid, type, aiu = {}) => client.post(`/projects/${pid}/budget`, { type, ...aiu }).then((r) => r.data),
  updateAiu: (pid, budgetId, aiu) => client.put(`/projects/${pid}/budget/${budgetId}`, aiu).then((r) => r.data),
  importFile: (pid, formData) => client.post(`/projects/${pid}/budget/import`, formData).then((r) => r.data),
  addItem: (pid, budgetId, data) => client.post(`/projects/${pid}/budget/${budgetId}/items`, data).then((r) => r.data),
  scanItems: (pid, formData) => client.post(`/projects/${pid}/budget/scan-items`, formData).then((r) => r.data),
  addItemsBulk: (pid, budgetId, items) => client.post(`/projects/${pid}/budget/${budgetId}/items/bulk`, { items }).then((r) => r.data),
  updateItem: (pid, budgetId, itemId, data) => client.put(`/projects/${pid}/budget/${budgetId}/items/${itemId}`, data).then((r) => r.data),
  removeItem: (pid, budgetId, itemId) => client.delete(`/projects/${pid}/budget/${budgetId}/items/${itemId}`),
  exportPdf: (pid, data) => postAndDownload(`/projects/${pid}/budget/export-pdf`, data, 'presupuesto.pdf'),
  exportExcel: (pid, data) => postAndDownload(`/projects/${pid}/budget/export-excel`, data, 'presupuesto.xlsx'),
};

export const progressApi = {
  listEntries: (pid, itemId) => client.get(`/projects/${pid}/progress/items/${itemId}/entries`).then((r) => r.data),
  createEntry: (pid, itemId, formData) => client.post(`/projects/${pid}/progress/items/${itemId}/entries`, formData).then((r) => r.data),
  removeEntry: (pid, itemId, entryId) => client.delete(`/projects/${pid}/progress/items/${itemId}/entries/${entryId}`),
};

export const purchaseOrdersApi = {
  list: (pid) => client.get(`/projects/${pid}/purchase-orders`).then((r) => r.data),
  get: (pid, id) => client.get(`/projects/${pid}/purchase-orders/${id}`).then((r) => r.data),
  create: (pid, data) => client.post(`/projects/${pid}/purchase-orders`, data).then((r) => r.data),
  update: (pid, id, data) => client.put(`/projects/${pid}/purchase-orders/${id}`, data).then((r) => r.data),
  remove: (pid, id) => client.delete(`/projects/${pid}/purchase-orders/${id}`),
  updateItem: (pid, id, itemId, data) => client.put(`/projects/${pid}/purchase-orders/${id}/items/${itemId}`, data).then((r) => r.data),
  convertToExpense: (pid, id, data) => client.post(`/projects/${pid}/purchase-orders/${id}/convert-to-expense`, data).then((r) => r.data),
  addReceipt: (pid, id, itemId, data) => client.post(`/projects/${pid}/purchase-orders/${id}/items/${itemId}/receipts`, data).then((r) => r.data),
  close: (pid, id, closureReason) => client.post(`/projects/${pid}/purchase-orders/${id}/close`, { closureReason }).then((r) => r.data),
  report: (pid, params) => client.get(`/projects/${pid}/purchase-orders/report`, { params }).then((r) => r.data),
  approve: (pid, id) => client.post(`/projects/${pid}/purchase-orders/${id}/approve`).then((r) => r.data),
  reject: (pid, id) => client.post(`/projects/${pid}/purchase-orders/${id}/reject`).then((r) => r.data),
};

export const executionApi = {
  dashboard: (pid) => client.get(`/projects/${pid}/execution/dashboard`).then((r) => r.data),
};

export const employeesApi = {
  list: (pid, status) => client.get(`/projects/${pid}/employees`, { params: status ? { status } : {} }).then((r) => r.data),
  get: (pid, id) => client.get(`/projects/${pid}/employees/${id}`).then((r) => r.data),
  create: (pid, formData) => client.post(`/projects/${pid}/employees`, formData).then((r) => r.data),
  update: (pid, id, formData) => client.put(`/projects/${pid}/employees/${id}`, formData).then((r) => r.data),
  remove: (pid, id) => client.delete(`/projects/${pid}/employees/${id}`),
  addSocialSecurity: (pid, id, formData) => client.post(`/projects/${pid}/employees/${id}/social-security`, formData).then((r) => r.data),
  addPayment: (pid, id, formData) => client.post(`/projects/${pid}/employees/${id}/payments`, formData).then((r) => r.data),
  severancePreview: (pid, id, data) => client.post(`/projects/${pid}/employees/${id}/severance/preview`, data).then((r) => r.data),
  severanceConfirm: (pid, id, data) => client.post(`/projects/${pid}/employees/${id}/severance`, data).then((r) => r.data),
  uploadPazYSalvo: (pid, id, formData) => client.post(`/projects/${pid}/employees/${id}/severance/paz-y-salvo`, formData).then((r) => r.data),
  uploadCedula: (pid, id, formData) => client.post(`/projects/${pid}/employees/${id}/cedula`, formData).then((r) => r.data),
  // Cálculo en vivo (sin persistir) del valor del contrato para un rango de fechas — ver
  // employeeController.js#previewContractValue.
  previewContractValue: (pid, data) => client.post(`/projects/${pid}/employees/preview-contract-value`, data).then((r) => r.data),
};

// Cálculo y registro de pago de nómina por período — ver payrollController.js. preview() no
// persiste nada; confirm() persiste el PaymentReceipt calculado y genera su PDF de soporte.
export const payrollApi = {
  preview: (pid, id, data) => client.post(`/projects/${pid}/employees/${id}/payroll/preview`, data).then((r) => r.data),
  confirm: (pid, id, data) => client.post(`/projects/${pid}/employees/${id}/payroll/confirm`, data).then((r) => r.data),
};

export const employeeContractsApi = {
  contractTypes: () => client.get('/employee-contract-types').then((r) => r.data),
  list: (pid, employeeId) => client.get(`/projects/${pid}/employees/${employeeId}/contracts`).then((r) => r.data),
  generate: (pid, employeeId) => client.post(`/projects/${pid}/employees/${employeeId}/contracts`).then((r) => r.data),
  generateOtrosi: (pid, employeeId, contractId, data) => client.post(`/projects/${pid}/employees/${employeeId}/contracts/${contractId}/otrosi`, data).then((r) => r.data),
  remove: (pid, employeeId, contractId) => client.delete(`/projects/${pid}/employees/${employeeId}/contracts/${contractId}`).then((r) => r.data),
};

export const expensesApi = {
  list: (pid, params) => client.get(`/projects/${pid}/expenses`, { params }).then((r) => r.data),
  create: (pid, formData) => client.post(`/projects/${pid}/expenses`, formData).then((r) => r.data),
  update: (pid, id, formData) => client.put(`/projects/${pid}/expenses/${id}`, formData).then((r) => r.data),
  remove: (pid, id) => client.delete(`/projects/${pid}/expenses/${id}`),
  setBudget: (pid, data) => client.post(`/projects/${pid}/expenses/budget`, data).then((r) => r.data),
  summary: (pid) => client.get(`/projects/${pid}/expenses/summary`).then((r) => r.data),
  scan: (pid, formData) => client.post(`/projects/${pid}/expenses/scan`, formData).then((r) => r.data),
};

// Vista general de Gastos (sin proyecto fijo, ver backend/globalExpenseRoutes.js) — mismo modelo y
// misma lógica que expensesApi; solo cambia el punto de entrada (proyecto va como filtro/campo
// opcional en vez de venir fijo en la URL).
export const generalExpensesApi = {
  list: (params) => client.get('/expenses', { params }).then((r) => r.data),
  create: (formData) => client.post('/expenses', formData).then((r) => r.data),
  update: (id, formData) => client.put(`/expenses/${id}`, formData).then((r) => r.data),
  remove: (id) => client.delete(`/expenses/${id}`),
  scan: (formData) => client.post('/expenses/scan', formData).then((r) => r.data),
};

export const cashBoxesApi = {
  list: () => client.get('/cash-boxes').then((r) => r.data),
  get: (id) => client.get(`/cash-boxes/${id}`).then((r) => r.data),
  create: (data) => client.post('/cash-boxes', data).then((r) => r.data),
  update: (id, data) => client.put(`/cash-boxes/${id}`, data).then((r) => r.data),
  setStatus: (id, status) => client.post(`/cash-boxes/${id}/status`, { status }).then((r) => r.data),
  addMovement: (id, data) => client.post(`/cash-boxes/${id}/movements`, data).then((r) => r.data),
};

export const thirdPartiesApi = {
  list: (params) => client.get('/third-parties', { params }).then((r) => r.data),
  get: (id) => client.get(`/third-parties/${id}`).then((r) => r.data),
  create: (formData) => client.post('/third-parties', formData).then((r) => r.data),
  update: (id, formData) => client.put(`/third-parties/${id}`, formData).then((r) => r.data),
  remove: (id) => client.delete(`/third-parties/${id}`),
  scanRut: (formData) => client.post('/third-parties/scan-rut', formData).then((r) => r.data),
  // Proyectos vinculados a un cliente (Project.clientId), con el valor de su presupuesto vigente
  // y el total acumulado — ver thirdPartyController.getClientProjects en el backend.
  getProjects: (id) => client.get(`/third-parties/${id}/projects`).then((r) => r.data),
};

// Órdenes de compra creadas desde la ficha de un proveedor (proyecto opcional), mismo modelo y
// misma lógica de negocio que purchaseOrdersApi (ver backend/purchaseOrderController.js) — solo
// cambia el punto de entrada: /purchase-orders en vez de /projects/:id/purchase-orders. Una orden
// creada aquí con projectId aparece automáticamente en el listado de ese proyecto en Ejecución.
export const supplierPurchaseOrdersApi = {
  list: (params) => client.get('/purchase-orders', { params }).then((r) => r.data),
  get: (id) => client.get(`/purchase-orders/${id}`).then((r) => r.data),
  create: (data) => client.post('/purchase-orders', data).then((r) => r.data),
  update: (id, data) => client.put(`/purchase-orders/${id}`, data).then((r) => r.data),
  remove: (id) => client.delete(`/purchase-orders/${id}`),
  updateItem: (id, itemId, data) => client.put(`/purchase-orders/${id}/items/${itemId}`, data).then((r) => r.data),
  convertToExpense: (id, data) => client.post(`/purchase-orders/${id}/convert-to-expense`, data).then((r) => r.data),
  addReceipt: (id, itemId, data) => client.post(`/purchase-orders/${id}/items/${itemId}/receipts`, data).then((r) => r.data),
  close: (id, closureReason) => client.post(`/purchase-orders/${id}/close`, { closureReason }).then((r) => r.data),
  approve: (id) => client.post(`/purchase-orders/${id}/approve`).then((r) => r.data),
  reject: (id) => client.post(`/purchase-orders/${id}/reject`).then((r) => r.data),
};

// Estudio de Mercado de Cotizaciones: módulo "plus" (ver Company.enabledFeatures / HasFeature),
// disponible global (sin pid) y por proyecto (con pid) — mismo backend en ambos casos, ver
// backend/routes/marketStudyRoutes.js y globalMarketStudyRoutes.js.
function marketStudyBase(pid) { return pid ? `/projects/${pid}/market-studies` : '/market-studies'; }
export const marketStudiesApi = {
  list: (pid, params) => client.get(marketStudyBase(pid), { params }).then((r) => r.data),
  get: (pid, id) => client.get(`${marketStudyBase(pid)}/${id}`).then((r) => r.data),
  create: (pid, data) => client.post(marketStudyBase(pid), data).then((r) => r.data),
  update: (pid, id, data) => client.put(`${marketStudyBase(pid)}/${id}`, data).then((r) => r.data),
  remove: (pid, id) => client.delete(`${marketStudyBase(pid)}/${id}`),
  scanQuotation: (pid, id, formData) => client.post(`${marketStudyBase(pid)}/${id}/scan`, formData).then((r) => r.data),
  addQuotation: (pid, id, formData) => client.post(`${marketStudyBase(pid)}/${id}/quotations`, formData).then((r) => r.data),
  updateQuotation: (pid, id, quotationId, data) => client.put(`${marketStudyBase(pid)}/${id}/quotations/${quotationId}`, data).then((r) => r.data),
  removeQuotation: (pid, id, quotationId) => client.delete(`${marketStudyBase(pid)}/${id}/quotations/${quotationId}`),
  comparison: (pid, id) => client.get(`${marketStudyBase(pid)}/${id}/comparison`).then((r) => r.data),
  generateDraft: (pid, id, data) => client.post(`${marketStudyBase(pid)}/${id}/generate-draft`, data).then((r) => r.data),
};

export const inventoryItemsApi = {
  list: (params) => client.get('/inventory-items', { params }).then((r) => r.data),
  get: (id) => client.get(`/inventory-items/${id}`).then((r) => r.data),
  history: (id) => client.get(`/inventory-items/${id}/history`).then((r) => r.data),
  create: (formData) => client.post('/inventory-items', formData).then((r) => r.data),
  update: (id, formData) => client.put(`/inventory-items/${id}`, formData).then((r) => r.data),
  remove: (id) => client.delete(`/inventory-items/${id}`),
};

export const inventoryCheckoutsApi = {
  list: (params) => client.get('/inventory-checkouts', { params }).then((r) => r.data),
  get: (id) => client.get(`/inventory-checkouts/${id}`).then((r) => r.data),
  create: (data) => client.post('/inventory-checkouts', data).then((r) => r.data),
  checkin: (id, data) => client.post(`/inventory-checkouts/${id}/checkin`, data).then((r) => r.data),
  justify: (id, itemId, data) => client.post(`/inventory-checkouts/${id}/items/${itemId}/justify`, data).then((r) => r.data),
  notifySalida: (id, numero) => client.post(`/inventory-checkouts/${id}/notify-salida`, { numero }).then((r) => r.data),
  notifyEntrada: (id, numero, confirmationId) => client.post(`/inventory-checkouts/${id}/notify-entrada`, { numero, confirmationId }).then((r) => r.data),
};

// Endpoints públicos (sin autenticación) para el enlace de confirmación de recepción/devolución
// enviado por WhatsApp. Se usa el mismo cliente axios: si hay un token viejo en localStorage se
// envía igual, pero el backend no lo exige en estas rutas.
export const inventoryConfirmationsApi = {
  get: (token) => client.get(`/inventory-confirmations/${token}`).then((r) => r.data),
  confirm: (token) => client.post(`/inventory-confirmations/${token}/confirm`).then((r) => r.data),
};

export const risksApi = {
  list: (pid) => client.get(`/projects/${pid}/risks`).then((r) => r.data),
  create: (pid, data) => client.post(`/projects/${pid}/risks`, data).then((r) => r.data),
  update: (pid, id, data) => client.put(`/projects/${pid}/risks/${id}`, data).then((r) => r.data),
  remove: (pid, id) => client.delete(`/projects/${pid}/risks/${id}`),
};

export const reportsApi = {
  evm: (pid, asOfDate) => client.get(`/projects/${pid}/reports/evm`, { params: asOfDate ? { asOfDate } : {} }).then((r) => r.data),
  sCurve: (pid) => client.get(`/projects/${pid}/reports/s-curve`).then((r) => r.data),
  milestonesMinutes: (pid) => client.get(`/projects/${pid}/reports/milestones-minutes`).then((r) => r.data),
  progressByItem: (pid) => client.get(`/projects/${pid}/reports/progress-by-item`).then((r) => r.data),
  exportPdfUrl: (pid) => {
    const base = (import.meta.env.VITE_API_URL || 'http://localhost:4000/api');
    const token = localStorage.getItem('token');
    return `${base}/projects/${pid}/reports/export-pdf?token=${encodeURIComponent(token)}`;
  },
};

export const priceItemsApi = {
  list: () => client.get('/price-items').then((r) => r.data),
  get: (id) => client.get(`/price-items/${id}`).then((r) => r.data),
  create: (data) => client.post('/price-items', data).then((r) => r.data),
  update: (id, data) => client.put(`/price-items/${id}`, data).then((r) => r.data),
  updateValue: (id, data) => client.put(`/price-items/${id}/value`, data).then((r) => r.data),
  remove: (id) => client.delete(`/price-items/${id}`),
  importExcel: (formData) => client.post('/price-items/import', formData).then((r) => r.data),
  templateUrl: () => {
    const base = (import.meta.env.VITE_API_URL || 'http://localhost:4000/api');
    const token = localStorage.getItem('token');
    return `${base}/price-items/import/template?token=${encodeURIComponent(token)}`;
  },
};

export const apuApi = {
  list: () => client.get('/apus').then((r) => r.data),
  get: (id) => client.get(`/apus/${id}`).then((r) => r.data),
  create: (data) => client.post('/apus', data).then((r) => r.data),
  update: (id, data) => client.put(`/apus/${id}`, data).then((r) => r.data),
  remove: (id) => client.delete(`/apus/${id}`),
  addComponent: (id, data) => client.post(`/apus/${id}/components`, data).then((r) => r.data),
  removeComponent: (id, componentId) => client.delete(`/apus/${id}/components/${componentId}`),
  importCatalog: (formData) => client.post('/apus/import', formData).then((r) => r.data),
  listImports: () => client.get('/apus/imports').then((r) => r.data),
  priceHistory: (id) => client.get(`/apus/${id}/price-history`).then((r) => r.data),
  exportPdf: (id, data, code) => postAndDownload(`/apus/${id}/export-pdf`, data, `apu-${code || id}.pdf`),
  exportExcel: (id, data, code) => postAndDownload(`/apus/${id}/export-excel`, data, `apu-${code || id}.xlsx`),
};

export const quotationsApi = {
  list: () => client.get('/quotations').then((r) => r.data),
  get: (id) => client.get(`/quotations/${id}`).then((r) => r.data),
  create: (data) => client.post('/quotations', data).then((r) => r.data),
  update: (id, data) => client.put(`/quotations/${id}`, data).then((r) => r.data),
  updateAiu: (id, aiu) => client.put(`/quotations/${id}/budget-aiu`, aiu).then((r) => r.data),
  remove: (id) => client.delete(`/quotations/${id}`),
  addItem: (id, data) => client.post(`/quotations/${id}/items`, data).then((r) => r.data),
  updateItem: (id, itemId, data) => client.put(`/quotations/${id}/items/${itemId}`, data).then((r) => r.data),
  removeItem: (id, itemId) => client.delete(`/quotations/${id}/items/${itemId}`),
  convert: (id) => client.post(`/quotations/${id}/convert`).then((r) => r.data),
  exportBudgetPdf: (id, data) => postAndDownload(`/quotations/${id}/export-pdf`, data, 'presupuesto.pdf'),
  exportBudgetExcel: (id, data) => postAndDownload(`/quotations/${id}/export-excel`, data, 'presupuesto.xlsx'),
  pdfUrl: (id) => {
    const base = (import.meta.env.VITE_API_URL || 'http://localhost:4000/api');
    const token = localStorage.getItem('token');
    return `${base}/quotations/${id}/pdf?token=${encodeURIComponent(token)}`;
  },
};
