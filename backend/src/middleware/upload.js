const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { getCurrentStore, runWithStore } = require('../utils/tenantContext');

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
// el companyId tomado de req.user (adjuntado por middleware/auth.js antes de que multer corra) —
// nunca del cliente, y nunca del AsyncLocalStorage: el stream multipart que multer lee de `req`
// puede perder el contexto async abierto por runInTransactionContext (es un problema conocido de
// Node con AsyncLocalStorage + streams de subida), así que acá se lee directo de la propiedad que
// Express ya tiene colgada del objeto `req` que este callback recibe. El endpoint /api/files/*
// (app.js) exige que ese primer segmento coincida con la empresa del usuario que pide el archivo,
// así que un archivo de otra empresa no es servible aunque se adivine el nombre. relativePath() ya
// queda con ese prefijo sin cambios, porque solo calcula la ruta relativa a UPLOAD_ROOT.
function makeUploader(subfolder, kind = 'any') {
  const storage = multer.diskStorage({
    destination: (req, file, cb) => {
      const companyId = req.user?.companyId;
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

  const uploader = multer({ storage, fileFilter, limits: { fileSize: 20 * 1024 * 1024 } });

  // El stream multipart que multer lee de `req` puede terminar de procesarse fuera del contexto
  // async que abrió runInTransactionContext (ver comentario arriba) — no solo para el destino del
  // archivo (ya resuelto leyendo req.user directo), sino para TODO lo que corra después de multer:
  // el controlador y cualquier consulta Sequelize que haga. Por eso se captura el store activo
  // ANTES de invocar multer y se reinstala explícitamente en el callback, sin importar en qué
  // contexto haya terminado multer — así el controlador y sus consultas heredan el mismo
  // companyId y la misma transacción (con el GUC de RLS ya seteado) que el resto de la petición.
  function withTenantContext(multerMiddleware) {
    return (req, res, next) => {
      const store = getCurrentStore();
      multerMiddleware(req, res, (err) => {
        if (err) return next(err);
        runWithStore(store, next);
      });
    };
  }

  return {
    single: (field) => withTenantContext(uploader.single(field)),
    array: (field, maxCount) => withTenantContext(uploader.array(field, maxCount)),
    fields: (fieldsSpec) => withTenantContext(uploader.fields(fieldsSpec)),
  };
}

function relativePath(file) {
  if (!file) return null;
  return path.relative(UPLOAD_ROOT, file.path).split(path.sep).join('/');
}

module.exports = { makeUploader, relativePath, UPLOAD_ROOT };
