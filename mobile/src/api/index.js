import client from './client';

export const authApi = {
  login: (email, password) => client.post('/auth/login', { email, password }).then((r) => r.data),
  me: () => client.get('/auth/me').then((r) => r.data),
};

// Ya filtrado por el backend según los proyectos asignados al usuario (o todos, si es admin) —
// ver backend/src/controllers/projectController.js#list. La app no repite ese filtro.
export const projectsApi = {
  list: () => client.get('/projects').then((r) => r.data),
};

// Mismo endpoint que usa "Avance por Ítem" en la web (ProgressPage.jsx): trae los ítems del
// presupuesto vigente ya con cantidad ejecutada/% acumulado calculados en el backend.
export const budgetApi = {
  get: (projectId) => client.get(`/projects/${projectId}/budget`).then((r) => r.data),
};

// Mismos endpoints que progressApi en frontend/src/api/index.js. Sin fijar Content-Type a mano:
// axios (y React Native debajo) le agrega el boundary correcto solo si detecta un FormData sin
// ese header ya puesto — ponerlo manual rompe el parseo multipart en el backend (multer).
export const progressApi = {
  createEntry: (projectId, itemId, formData) => client.post(
    `/projects/${projectId}/progress/items/${itemId}/entries`,
    formData
  ).then((r) => r.data),
};

export const cashBoxesApi = {
  list: () => client.get('/cash-boxes').then((r) => r.data),
};

// Mismo endpoint que usa el formulario de Gastos en la web (categorías, campos y validaciones
// idénticas — ver backend/src/controllers/expenseController.js#create).
export const expensesApi = {
  create: (projectId, formData) => client.post(`/projects/${projectId}/expenses`, formData).then((r) => r.data),
};

export const EXPENSE_CATEGORIES = ['mano_obra', 'materiales', 'equipos', 'viaticos', 'imprevistos'];
