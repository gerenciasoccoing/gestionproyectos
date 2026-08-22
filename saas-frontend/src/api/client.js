import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4100/api';
const DEV_TENANT_SUBDOMAIN = import.meta.env.VITE_DEV_TENANT_SUBDOMAIN || '';

function baseHeaders() {
  const headers = {};
  // Solo tiene efecto en local: el backend ignora este header cuando NODE_ENV=production y ya
  // pudo resolver el tenant por el dominio/subdominio real de la request.
  if (DEV_TENANT_SUBDOMAIN) headers['X-Tenant-Subdomain'] = DEV_TENANT_SUBDOMAIN;
  return headers;
}

// Cliente para la tienda pública (catálogo, checkout) y cuentas de cliente final.
export const storeClient = axios.create({ baseURL: API_URL, headers: baseHeaders() });
storeClient.interceptors.request.use((config) => {
  const token = localStorage.getItem('customer_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Cliente para el panel de administración de un tenant (tenant_admin / tenant_operator).
export const staffClient = axios.create({ baseURL: API_URL, headers: baseHeaders() });
staffClient.interceptors.request.use((config) => {
  const token = localStorage.getItem('staff_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});
staffClient.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401 && !window.location.pathname.includes('/login')) {
      localStorage.removeItem('staff_token');
      localStorage.removeItem('staff_user');
      window.location.href = window.location.pathname.startsWith('/super-admin') ? '/super-admin/login' : '/admin/login';
    }
    return Promise.reject(err);
  },
);

export function fileUrl(relativePath) {
  if (!relativePath) return null;
  const base = API_URL.replace(/\/api$/, '');
  return `${base}/api/files/${relativePath}`;
}
