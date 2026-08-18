const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { getCurrentCompanyId } = require('../utils/tenantContext');

const UPLOAD_ROOT = path.resolve(process.env.UPLOAD_DIR || 'uploads');

const ALLOWED_BY_KIND = {
  document: ['.pdf', '.doc', '.docx'],
  image: ['.jpg', '.jpeg', '.png', '.webp'],
  any: ['.pdf', '.doc', '.docx', '.jpg', '.jpeg', '.png', '.webp'],
};

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

// kind: 'document' | 'image' | 'any' -> valida extensión permitida
// Aislamiento multi-tenant: cada archivo se guarda bajo uploads/{companyId}/{subfolder}/..., con
// el companyId tomado del contexto de la petición (ver tenantContext.js) — nunca del cliente. El
// endpoint /api/files/* (app.js) exige que ese primer segmento coincida con la empresa del usuario
// que pide el archivo, así que un archivo de otra empresa no es servible aunque se adivine el
// nombre. relativePath() ya queda con ese prefijo sin cambios, porque solo calcula la ruta relativa
// a UPLOAD_ROOT.
function makeUploader(subfolder, kind = 'any') {
  const storage = multer.diskStorage({
    destination: (req, file, cb) => {
      const companyId = getCurrentCompanyId();
      if (!companyId) return cb(new Error('No hay empresa en el contexto de la petición'));
      const dir = path.join(UPLOAD_ROOT, companyId, subfolder);
      ensureDir(dir);
      cb(null, dir);
    },
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      const unique = crypto.randomBytes(8).toString('hex');
      cb(null, `${Date.now()}-${unique}${ext}`);
    },
  });

  const fileFilter = (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!ALLOWED_BY_KIND[kind].includes(ext)) {
      return cb(new Error(`Formato de archivo no permitido: ${ext}`));
    }
    cb(null, true);
  };

  return multer({ storage, fileFilter, limits: { fileSize: 20 * 1024 * 1024 } });
}

function relativePath(file) {
  if (!file) return null;
  return path.relative(UPLOAD_ROOT, file.path).split(path.sep).join('/');
}

module.exports = { makeUploader, relativePath, UPLOAD_ROOT };
