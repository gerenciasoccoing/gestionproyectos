const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const { ThirdParty } = require('../models');
const { relativePath } = require('../middleware/upload');
const { scanRut } = require('../services/rutScanService');

const TYPES = ['proveedor', 'cliente'];

const list = asyncHandler(async (req, res) => {
  const { type, search } = req.query;
  const where = {};
  if (type) {
    if (!TYPES.includes(type)) throw new ApiError(400, `type debe ser uno de: ${TYPES.join(', ')}`);
    where.type = type;
  }
  const items = await ThirdParty.findAll({ where, order: [['name', 'ASC']] });
  const filtered = search
    ? items.filter((it) => {
      const q = search.toLowerCase();
      return it.name.toLowerCase().includes(q) || (it.nit || '').toLowerCase().includes(q);
    })
    : items;
  res.json(filtered);
});

const get = asyncHandler(async (req, res) => {
  const item = await ThirdParty.findByPk(req.params.id);
  if (!item) throw new ApiError(404, 'Tercero no encontrado');
  res.json(item);
});

function filesFromRequest(req) {
  return {
    rutFile: req.files?.rutFile?.[0] || null,
    bankCertificationFile: req.files?.bankCertificationFile?.[0] || null,
  };
}

const create = asyncHandler(async (req, res) => {
  const { type, name, nit, email, phone, address, contactName, notes } = req.body;
  if (!TYPES.includes(type)) throw new ApiError(400, `type debe ser uno de: ${TYPES.join(', ')}`);
  if (!name || !name.trim()) throw new ApiError(400, 'name es obligatorio');

  const { rutFile, bankCertificationFile } = filesFromRequest(req);
  const item = await ThirdParty.create({
    type,
    name: name.trim(),
    nit: nit || null,
    email: email || null,
    phone: phone || null,
    address: address || null,
    contactName: contactName || null,
    notes: notes || null,
    rutFilePath: relativePath(rutFile),
    bankCertificationFilePath: relativePath(bankCertificationFile),
    createdBy: req.user.id,
  });
  res.status(201).json(item);
});

const update = asyncHandler(async (req, res) => {
  const item = await ThirdParty.findByPk(req.params.id);
  if (!item) throw new ApiError(404, 'Tercero no encontrado');

  const { type, name, nit, email, phone, address, contactName, notes } = req.body;
  if (type !== undefined) {
    if (!TYPES.includes(type)) throw new ApiError(400, `type debe ser uno de: ${TYPES.join(', ')}`);
    item.type = type;
  }
  if (name !== undefined) {
    if (!name.trim()) throw new ApiError(400, 'name no puede quedar vacío');
    item.name = name.trim();
  }
  if (nit !== undefined) item.nit = nit || null;
  if (email !== undefined) item.email = email || null;
  if (phone !== undefined) item.phone = phone || null;
  if (address !== undefined) item.address = address || null;
  if (contactName !== undefined) item.contactName = contactName || null;
  if (notes !== undefined) item.notes = notes || null;

  const { rutFile, bankCertificationFile } = filesFromRequest(req);
  if (rutFile) item.rutFilePath = relativePath(rutFile);
  if (bankCertificationFile) item.bankCertificationFilePath = relativePath(bankCertificationFile);

  await item.save();
  res.json(item);
});

const remove = asyncHandler(async (req, res) => {
  const item = await ThirdParty.findByPk(req.params.id);
  if (!item) throw new ApiError(404, 'Tercero no encontrado');
  await item.destroy();
  res.status(204).send();
});

// Lee un RUT (PDF o imagen) subido y devuelve los datos que se lograron reconocer (razón
// social, NIT, correo, teléfono), para prellenar el formulario. No crea/edita el tercero: el
// usuario revisa y corrige antes de guardar. Lectura 100% local (mismo motor que la lectura de
// facturas), sin proveedor de IA externo.
const scanRutFile = asyncHandler(async (req, res) => {
  if (!req.file) throw new ApiError(400, 'Debe adjuntar un archivo PDF o imagen (jpg, png, webp)');
  const result = await scanRut(req.file.buffer, req.file.mimetype);
  res.json(result);
});

module.exports = { list, get, create, update, remove, scanRutFile };
