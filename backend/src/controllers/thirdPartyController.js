const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const { ThirdParty, Project } = require('../models');
const { relativePath } = require('../middleware/upload');
const { scanRut } = require('../services/rutScanService');
const { getProjectBudgetTotal } = require('../services/budgetService');
const aiVisionService = require('../services/aiVisionService');
const { getExtractor } = require('../config/aiDocumentExtractors');
const { mapSeries } = require('../utils/mapSeries');

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

// Compara NIT sin importar puntos/guiones/espacios ni mayúsculas (ej. "900.303.701-0" === "9003037010").
function normalizeNit(nit) {
  return String(nit || '').replace(/[^0-9a-zA-Z]/g, '').toLowerCase();
}

// El NIT es el identificador único de un tercero dentro de su tipo (un proveedor y un cliente
// pueden compartir NIT, ya que son roles distintos frente a la empresa, pero no puede haber dos
// proveedores ni dos clientes con el mismo NIT). Si no se digitó NIT, no se valida por este medio.
async function assertNoDuplicateNit({ type, nit, excludeId }) {
  const normalized = normalizeNit(nit);
  if (!normalized) return;
  const candidates = await ThirdParty.findAll({ where: { type } });
  const dup = candidates.find((c) => c.id !== excludeId && normalizeNit(c.nit) === normalized);
  if (dup) {
    const label = type === 'proveedor' ? 'proveedor' : 'cliente';
    throw new ApiError(409, `Ya existe un ${label} registrado con el NIT ${nit}: "${dup.name}". Verifica que no sea un duplicado.`);
  }
}

const create = asyncHandler(async (req, res) => {
  const { type, name, nit, email, phone, address, contactName, notes } = req.body;
  if (!TYPES.includes(type)) throw new ApiError(400, `type debe ser uno de: ${TYPES.join(', ')}`);
  if (!name || !name.trim()) throw new ApiError(400, 'name es obligatorio');

  await assertNoDuplicateNit({ type, nit });

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
  if (type !== undefined && !TYPES.includes(type)) throw new ApiError(400, `type debe ser uno de: ${TYPES.join(', ')}`);

  await assertNoDuplicateNit({
    type: type !== undefined ? type : item.type,
    nit: nit !== undefined ? nit : item.nit,
    excludeId: item.id,
  });

  if (type !== undefined) item.type = type;
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

// Proyectos vinculados a este tercero como cliente (Project.clientId), con el valor de su
// presupuesto vigente cada uno (nunca un campo manual) y el total acumulado. Devuelve listas/total
// en cero si el cliente aún no tiene proyectos, en vez de fallar.
const getClientProjects = asyncHandler(async (req, res) => {
  const client = await ThirdParty.findByPk(req.params.id);
  if (!client) throw new ApiError(404, 'Tercero no encontrado');

  const projects = await Project.findAll({ where: { clientId: client.id }, order: [['createdAt', 'DESC']] });
  const rows = await mapSeries(projects, async (p) => ({
    id: p.id,
    name: p.name,
    status: p.status,
    origin: p.origin,
    budgetValue: await getProjectBudgetTotal(p.id),
  }));

  res.json({
    projects: rows,
    count: rows.length,
    totalValue: rows.reduce((sum, r) => sum + r.budgetValue, 0),
  });
});

// Lee un RUT (PDF o imagen) subido y devuelve los datos que se lograron reconocer (razón
// social, NIT, correo, teléfono, dirección), para prellenar el formulario. No crea/edita el
// tercero: el usuario revisa y corrige antes de guardar. Usa la API de Claude (visión) cuando
// hay ANTHROPIC_API_KEY configurada; si no, cae al motor local (OCR + heurísticas) que ya
// existía, para no perder la funcionalidad en instalaciones sin la clave.
const scanRutFile = asyncHandler(async (req, res) => {
  if (!req.file) throw new ApiError(400, 'Debe adjuntar un archivo PDF o imagen (jpg, png, webp)');
  if (aiVisionService.isConfigured()) {
    const extractor = getExtractor('rut');
    const result = await aiVisionService.extractStructuredData({
      buffer: req.file.buffer,
      mimetype: req.file.mimetype,
      instructions: extractor.instructions,
      schemaDescription: extractor.schemaDescription,
      maxTokens: extractor.maxTokens,
    });
    return res.json(result);
  }
  const result = await scanRut(req.file.buffer, req.file.mimetype);
  res.json(result);
});

module.exports = { list, get, create, update, remove, scanRutFile, getClientProjects };
