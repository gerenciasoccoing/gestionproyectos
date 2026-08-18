const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const routes = require('./routes');
const errorHandler = require('./middleware/errorHandler');
const { authenticate } = require('./middleware/auth');
const { UPLOAD_ROOT } = require('./middleware/upload');

const app = express();

const corsOrigins = !process.env.CORS_ORIGIN || process.env.CORS_ORIGIN === '*'
  ? '*'
  : process.env.CORS_ORIGIN.split(',').map((o) => o.trim());
// Content-Disposition debe exponerse explícitamente: por defecto el navegador no deja leer ese
// header en una respuesta cross-origin, así que las descargas armadas por el frontend (blob +
// nombre de archivo tomado de este header) caían al nombre genérico de reserva.
app.use(cors({ origin: corsOrigins, exposedHeaders: ['Content-Disposition'] }));
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));

// Archivos protegidos: requieren sesión válida para poder verlos/descargarlos.
// Aislamiento multi-tenant: todo archivo vive bajo uploads/{companyId}/... (ver
// middleware/upload.js) — el primer segmento de la ruta pedida debe coincidir con la empresa del
// usuario autenticado. 404 en vez de 403 para no revelar que un archivo de otra empresa existe.
app.get('/api/files/*', authenticate, (req, res) => {
  const relPath = req.params[0];
  const resolved = path.resolve(UPLOAD_ROOT, relPath);
  if (!resolved.startsWith(UPLOAD_ROOT)) {
    return res.status(400).json({ message: 'Ruta de archivo inválida' });
  }
  const [ownerCompanyId] = relPath.split('/');
  if (ownerCompanyId !== req.user.companyId) {
    return res.status(404).json({ message: 'Archivo no encontrado' });
  }
  if (!fs.existsSync(resolved)) {
    return res.status(404).json({ message: 'Archivo no encontrado' });
  }
  res.sendFile(resolved);
});

app.use('/api', routes);

app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

app.use((req, res) => res.status(404).json({ message: 'Recurso no encontrado' }));
app.use(errorHandler);

module.exports = app;
