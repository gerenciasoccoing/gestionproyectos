import axios from 'axios';

const client = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:4000/api',
});

client.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

client.interceptors.response.use(
  (res) => res,
  (err) => {
    // Solo trata el 401 como "sesión vencida" si la petición llevaba un token de sesión: un 401
    // en una petición pública (ej. clave de operador equivocada en /register-company, o un enlace
    // de confirmación por WhatsApp vencido) no es una sesión que expiró, es un error normal que la
    // propia página debe mostrar — redirigir a /login en ese caso le ocultaba el mensaje al usuario.
    const hadSessionToken = Boolean(err.config?.headers?.Authorization);
    if (err.response?.status === 401 && hadSessionToken) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      if (!window.location.pathname.includes('/login')) {
        window.location.href = '/login';
      }
    }
    return Promise.reject(err);
  }
);

export default client;

// URL para incrustar directamente en <img>/<a> (incluye el token por query string, ver backend/src/middleware/auth.js).
export function fileUrl(relativePath) {
  if (!relativePath) return null;
  const base = (import.meta.env.VITE_API_URL || 'http://localhost:4000/api').replace(/\/api$/, '');
  const token = localStorage.getItem('token');
  return `${base}/api/files/${relativePath}${token ? `?token=${encodeURIComponent(token)}` : ''}`;
}

// URL del PDF de una orden de compra (endpoint global /purchase-orders/:id/pdf, funciona tenga o
// no proyecto asignado la orden — ver backend/purchaseOrderController.js#exportPdf). lang sigue el
// idioma activo de la interfaz para que el PDF salga en el mismo idioma.
export function purchaseOrderPdfUrl(id, lang) {
  if (!id) return null;
  const base = import.meta.env.VITE_API_URL || 'http://localhost:4000/api';
  const token = localStorage.getItem('token');
  const params = new URLSearchParams();
  if (token) params.set('token', token);
  if (lang) params.set('lang', lang);
  return `${base}/purchase-orders/${id}/pdf?${params.toString()}`;
}

// Descarga un archivo protegido (requiere token) e inicia la descarga en el navegador.
export async function downloadProtectedFile(relativePath, filename) {
  const res = await client.get(`/files/${relativePath}`, { responseType: 'blob' });
  const url = window.URL.createObjectURL(res.data);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename || relativePath.split('/').pop();
  a.click();
  window.URL.revokeObjectURL(url);
}

// Para exportaciones que necesitan enviar datos en el body (AIU, nombres de firma): hace el POST
// con responseType blob e inicia la descarga con el nombre de archivo indicado por el backend.
export async function postAndDownload(path, data, fallbackFilename) {
  const res = await client.post(path, data, { responseType: 'blob' });
  const disposition = res.headers['content-disposition'] || '';
  const match = disposition.match(/filename="([^"]+)"/);
  const filename = match ? match[1] : fallbackFilename;
  const url = window.URL.createObjectURL(res.data);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(url);
}
