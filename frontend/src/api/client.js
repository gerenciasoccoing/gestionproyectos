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
    if (err.response?.status === 401) {
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
