const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

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
function makeUploader(subfolder, kind = 'any') {
  const storage = multer.diskStorage({
    destination: (req, file, cb) => {
      const dir = path.join(UPLOAD_ROOT, subfolder);
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
