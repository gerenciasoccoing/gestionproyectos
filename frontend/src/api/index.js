import client, { postAndDownload } from './client';

export const authApi = {
  login: (email, password) => client.post('/auth/login', { email, password }).then((r) => r.data),
  me: () => client.get('/auth/me').then((r) => r.data),
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
  updateItem: (pid, id, itemId, data) => client.put(`/projects/${pid}/purchase-orders/${id}/items/${itemId}`, data).then((r) => r.data),
  convertToExpense: (pid, id, data) => client.post(`/projects/${pid}/purchase-orders/${id}/convert-to-expense`, data).then((r) => r.data),
  addReceipt: (pid, id, itemId, data) => client.post(`/projects/${pid}/purchase-orders/${id}/items/${itemId}/receipts`, data).then((r) => r.data),
  close: (pid, id, closureReason) => client.post(`/projects/${pid}/purchase-orders/${id}/close`, { closureReason }).then((r) => r.data),
  report: (pid, params) => client.get(`/projects/${pid}/purchase-orders/report`, { params }).then((r) => r.data),
};

export const executionApi = {
  dashboard: (pid) => client.get(`/projects/${pid}/execution/dashboard`).then((r) => r.data),
};

export const employeesApi = {
  list: (pid, status) => client.get(`/projects/${pid}/employees`, { params: status ? { status } : {} }).then((r) => r.data),
  get: (pid, id) => client.get(`/projects/${pid}/employees/${id}`).then((r) => r.data),
  create: (pid, formData) => client.post(`/projects/${pid}/employees`, formData).then((r) => r.data),
  update: (pid, id, formData) => client.put(`/projects/${pid}/employees/${id}`, formData).then((r) => r.data),
  addSocialSecurity: (pid, id, formData) => client.post(`/projects/${pid}/employees/${id}/social-security`, formData).then((r) => r.data),
  addPayment: (pid, id, formData) => client.post(`/projects/${pid}/employees/${id}/payments`, formData).then((r) => r.data),
  severancePreview: (pid, id, data) => client.post(`/projects/${pid}/employees/${id}/severance/preview`, data).then((r) => r.data),
  severanceConfirm: (pid, id, data) => client.post(`/projects/${pid}/employees/${id}/severance`, data).then((r) => r.data),
  uploadPazYSalvo: (pid, id, formData) => client.post(`/projects/${pid}/employees/${id}/severance/paz-y-salvo`, formData).then((r) => r.data),
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
  list: (supplierId) => client.get('/purchase-orders', { params: { supplierId } }).then((r) => r.data),
  get: (id) => client.get(`/purchase-orders/${id}`).then((r) => r.data),
  create: (data) => client.post('/purchase-orders', data).then((r) => r.data),
  updateItem: (id, itemId, data) => client.put(`/purchase-orders/${id}/items/${itemId}`, data).then((r) => r.data),
  convertToExpense: (id, data) => client.post(`/purchase-orders/${id}/convert-to-expense`, data).then((r) => r.data),
  addReceipt: (id, itemId, data) => client.post(`/purchase-orders/${id}/items/${itemId}/receipts`, data).then((r) => r.data),
  close: (id, closureReason) => client.post(`/purchase-orders/${id}/close`, { closureReason }).then((r) => r.data),
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
