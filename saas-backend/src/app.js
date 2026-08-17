const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const routes = require('./routes');
const errorHandler = require('./middleware/errorHandler');
const { UPLOAD_ROOT } = require('./middleware/upload');

const app = express();

const corsOrigins = !process.env.CORS_ORIGIN || process.env.CORS_ORIGIN === '*'
  ? '*'
  : process.env.CORS_ORIGIN.split(',').map((o) => o.trim());
app.use(cors({ origin: corsOrigins, exposedHeaders: ['Content-Disposition'] }));

// El webhook de Wompi necesita el body crudo tal cual llega para validar la firma; el resto
// de rutas usa JSON parseado normalmente.
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));

app.get('/api/files/*', (req, res) => {
  const relPath = req.params[0];
  const resolved = path.resolve(UPLOAD_ROOT, relPath);
  if (!resolved.startsWith(UPLOAD_ROOT)) {
    return res.status(400).json({ message: 'Ruta de archivo inválida' });
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
