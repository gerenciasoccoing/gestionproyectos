const crypto = require('crypto');

// Bloquea una segunda solicitud IDÉNTICA (mismo usuario, mismo método+ruta, mismo cuerpo) llegada
// pocos segundos después de la primera — el caso típico de doble clic en "Guardar", incluso si el
// frontend no llegó a deshabilitar el botón a tiempo (ver useSubmitGuard.js en el frontend, que
// cubre el mismo caso del lado del cliente). Deliberadamente NO bloquea dos solicitudes con datos
// distintos (dos gastos diferentes creados en sucesión): la clave incluye un hash del body, así
// que solo choca el repetido exacto.
//
// En memoria, sin Redis: el despliegue actual es un solo contenedor backend (ver
// docker-compose.yml), no hay estado que compartir entre instancias. Si el despliegue pasa a
// multi-instancia en el futuro, esto necesitaría moverse a un store compartido.
const WINDOW_MS = 4000;
const recent = new Map(); // key -> expiresAt

function cleanup() {
  const now = Date.now();
  for (const [key, expiresAt] of recent) {
    if (expiresAt <= now) recent.delete(key);
  }
}

// req.file/req.files (multer) no son serializables de forma estable para el hash; se identifican
// aparte por nombre+tamaño en vez de por contenido, para no leer el buffer completo en cada
// petición solo para calcular una huella.
function fingerprintRequest(req) {
  const bodyPart = req.body && Object.keys(req.body).length ? JSON.stringify(req.body) : '';
  const filePart = req.file ? `${req.file.originalname}:${req.file.size}` : '';
  const filesPart = Array.isArray(req.files) ? req.files.map((f) => `${f.originalname}:${f.size}`).join(',') : '';
  const hash = crypto.createHash('sha1').update(bodyPart + filePart + filesPart).digest('hex');
  return `${req.user?.id || 'anon'}:${req.method}:${req.originalUrl}:${hash}`;
}

function preventDuplicateSubmit(req, res, next) {
  const key = fingerprintRequest(req);
  const now = Date.now();
  const expiresAt = recent.get(key);
  if (expiresAt && expiresAt > now) {
    return res.status(409).json({ message: 'Ya se procesó esta misma solicitud hace un momento. Si querías crear otro registro, espera unos segundos e inténtalo de nuevo.' });
  }
  recent.set(key, now + WINDOW_MS);
  if (recent.size > 5000) cleanup();
  next();
}

module.exports = { preventDuplicateSubmit };
