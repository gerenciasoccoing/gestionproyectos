// Importación masiva de materiales desde Excel/CSV (ver la especificación completa). Dos pasos
// separados, como cualquier "leer y sugerir" de esta app (ver scanQuotation en
// purchaseOrderController.js): `parseAndPreview` NUNCA escribe nada, solo analiza el archivo y
// arma una fila de vista previa por cada renglón con su estado; `commitImport` es quien de verdad
// crea/actualiza materiales, en UNA sola transacción, a partir de las filas que el usuario ya
// revisó (y pudo corregir) en el frontend.
const { Worker } = require('worker_threads');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { QueryTypes } = require('sequelize');
const ExcelJS = require('exceljs');
const ApiError = require('../utils/ApiError');
const { sequelize, Material, MaterialCategory } = require('../models');
const { normalizeMaterialText } = require('../utils/textNormalize');
const { extractStructuredDataFromText, isConfigured: isAiConfigured } = require('./aiVisionService');
const { getExtractor } = require('../config/aiDocumentExtractors');
const { getCurrentCompanyId } = require('../utils/tenantContext');

const BATCH_SIZE = 500;
const PREVIEW_ROW_LIMIT = 20000; // protección razonable: más de esto, pedir dividir el archivo.

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

// Columnas de la plantilla oficial (ver materialImportController.js#downloadTemplate) — se
// reconocen por texto normalizado, así que "Código"/"codigo"/"Code" son equivalentes.
const FIELD_ALIASES = {
  code: ['codigo', 'code', 'referencia', 'ref'],
  name: ['nombre', 'material', 'item', 'name', 'producto', 'descripcionmaterial'],
  unit: ['unidad', 'und', 'unit', 'um', 'u.m.', 'u.m'],
  category: ['categoria', 'category', 'grupo'],
  description: ['descripcion', 'observaciones', 'notas', 'description'],
  referenceCost: ['costodereferencia', 'costoreferencia', 'costo', 'precioreferencia', 'preciodereferencia', 'precio', 'valor', 'referencecost'],
};

function parseWorkbookBuffer(buffer, timeoutMs = 60000) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(path.join(__dirname, '../workers/materialImportWorker.js'), { workerData: { buffer } });
    const timer = setTimeout(() => {
      worker.terminate();
      reject(new ApiError(400, 'El archivo tardó demasiado en procesarse (puede estar corrupto o no ser un Excel/CSV válido).'));
    }, timeoutMs);
    worker.once('message', (msg) => {
      clearTimeout(timer);
      worker.terminate();
      if (msg.ok) resolve({ headers: msg.headers, rows: msg.rows });
      else reject(new ApiError(400, msg.error));
    });
    worker.once('error', (err) => {
      clearTimeout(timer);
      reject(new ApiError(400, `Error procesando el archivo: ${err.message}`));
    });
  });
}

// Intenta reconocer las columnas por el texto de su encabezado (sin IA) — cubre la plantilla
// oficial y variaciones razonables de mayúsculas/tildes/espacios. `confident` es true solo si TODAS
// las columnas del archivo quedaron reconocidas (si sobra una columna rara, se prefiere pedirle
// ayuda a la IA en vez de ignorarla silenciosamente).
function detectColumnMapping(headers) {
  const normHeaders = headers.map((h) => normalizeMaterialText(h));
  const mapping = {};
  const used = new Set();
  for (const field of Object.keys(FIELD_ALIASES)) {
    const idx = normHeaders.findIndex((h, i) => !used.has(i) && FIELD_ALIASES[field].includes(h));
    if (idx !== -1) { mapping[field] = headers[idx]; used.add(idx); }
    else mapping[field] = null;
  }
  const allRecognized = normHeaders.every((_, i) => used.has(i));
  const hasRequired = Boolean(mapping.name) && Boolean(mapping.unit);
  return { mapping, confident: allRecognized && hasRequired };
}

// Respaldo con IA cuando el archivo no sigue la plantilla (ver la especificación: "usa la IA para
// sugerir qué columna del archivo corresponde a cada campo. Yo confirmo o corrijo esa asignación
// antes de continuar" — por eso el resultado siempre se marca aiSuggested:true, nunca se aplica
// solo). Si la IA no está configurada o falla, se devuelve el mapeo vacío (el usuario lo arma a
// mano en el frontend) en vez de romper la importación.
async function aiSuggestColumnMapping(headers, sampleRows) {
  if (!isAiConfigured()) return { code: null, name: null, unit: null, category: null, description: null, referenceCost: null };
  const extractor = getExtractor('materialImportColumnMapping');
  const sampleText = [headers.join('\t'), ...sampleRows.slice(0, 5).map((r) => r.join('\t'))].join('\n');
  try {
    const result = await extractStructuredDataFromText({
      text: sampleText, instructions: extractor.instructions, schemaDescription: extractor.schemaDescription, maxTokens: extractor.maxTokens,
    });
    // La IA responde con el TEXTO del encabezado; se valida contra los encabezados reales del
    // archivo (nunca se confía un nombre de columna que no exista, por si alucina uno).
    const resolved = {};
    for (const field of Object.keys(FIELD_ALIASES)) {
      resolved[field] = result[field] && headers.includes(result[field]) ? result[field] : null;
    }
    return resolved;
  } catch (err) {
    return { code: null, name: null, unit: null, category: null, description: null, referenceCost: null };
  }
}

function parseCost(raw) {
  if (raw === undefined || raw === null || raw === '') return null;
  const cleaned = String(raw).replace(/[^0-9.,-]/g, '').replace(/\.(?=.*\.)/g, '').replace(',', '.');
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? n : null;
}

// Arma la vista previa fila por fila con su estado (ver la especificación): nuevo / ya existe /
// duplicado en archivo / error. `mapping` es { field: headerText|null }, ya confirmado por el
// usuario en el frontend (ver materialImportController.js#parse, que lo propone pero nunca lo
// aplica solo).
async function buildPreview({ headers, rows, mapping }) {
  if (rows.length > PREVIEW_ROW_LIMIT) {
    throw new ApiError(400, `El archivo tiene ${rows.length} filas; el máximo soportado por carga es ${PREVIEW_ROW_LIMIT}. Divídalo en partes más pequeñas.`);
  }
  const colIndex = {};
  for (const field of Object.keys(FIELD_ALIASES)) colIndex[field] = mapping[field] ? headers.indexOf(mapping[field]) : -1;

  const existingMaterials = await Material.findAll({ attributes: ['id', 'code', 'name', 'unit', 'normalizedName', 'normalizedUnit'] });
  const existingByKey = new Map(existingMaterials.map((m) => [`${m.normalizedName}|${m.normalizedUnit}`, m]));
  const existingCodes = new Set(existingMaterials.filter((m) => m.code).map((m) => m.code));
  const existingCategories = await MaterialCategory.findAll({ attributes: ['id', 'name'] });
  const categoryByNormalized = new Map(existingCategories.map((c) => [normalizeMaterialText(c.name), c.name]));

  const seenInFile = new Map(); // normalizedKey -> rowNumber de la primera ocurrencia
  const seenCodesInFile = new Map();
  const preview = [];

  rows.forEach((row, i) => {
    const rowNumber = i + 2; // +1 por el encabezado, +1 porque Excel/los usuarios cuentan desde 1
    const code = colIndex.code >= 0 ? (row[colIndex.code] || '').trim() : '';
    const name = colIndex.name >= 0 ? (row[colIndex.name] || '').trim() : '';
    const unit = colIndex.unit >= 0 ? (row[colIndex.unit] || '').trim() : '';
    const categoryRaw = colIndex.category >= 0 ? (row[colIndex.category] || '').trim() : '';
    const description = colIndex.description >= 0 ? (row[colIndex.description] || '').trim() : '';
    const referenceCost = colIndex.referenceCost >= 0 ? parseCost(row[colIndex.referenceCost]) : null;

    const entry = {
      rowNumber, code: code || null, name, unit, description: description || null, categoryName: categoryRaw || null,
      referenceCost, status: 'nuevo', reason: null, matchedMaterialId: null, matchedMaterialCode: null,
      categoryIsNew: false, decision: 'importar',
    };

    if (!name || !unit) {
      entry.status = 'error';
      entry.reason = !name && !unit ? 'Falta el nombre y la unidad' : (!name ? 'Falta el nombre' : 'Falta la unidad');
      entry.decision = 'omitir';
      preview.push(entry);
      return;
    }
    if (code && existingCodes.has(code)) {
      entry.status = 'error';
      entry.reason = `El código "${code}" ya está en uso por otro material del catálogo`;
      entry.decision = 'omitir';
      preview.push(entry);
      return;
    }
    if (code && seenCodesInFile.has(code)) {
      entry.status = 'error';
      entry.reason = `El código "${code}" está repetido en el archivo (fila ${seenCodesInFile.get(code)})`;
      entry.decision = 'omitir';
      preview.push(entry);
      return;
    }
    if (code) seenCodesInFile.set(code, rowNumber);

    const normalizedName = normalizeMaterialText(name);
    const normalizedUnit = normalizeMaterialText(unit);
    const key = `${normalizedName}|${normalizedUnit}`;

    if (seenInFile.has(key)) {
      entry.status = 'duplicado_archivo';
      entry.reason = `Mismo nombre y unidad que la fila ${seenInFile.get(key)}`;
      entry.decision = 'omitir';
      preview.push(entry);
      return;
    }
    seenInFile.set(key, rowNumber);

    const existing = existingByKey.get(key);
    if (existing) {
      entry.status = 'existe';
      entry.matchedMaterialId = existing.id;
      entry.matchedMaterialCode = existing.code;
      entry.decision = 'omitir';
    } else {
      entry.status = 'nuevo';
      entry.decision = 'importar';
    }

    if (categoryRaw && !categoryByNormalized.has(normalizeMaterialText(categoryRaw))) {
      entry.categoryIsNew = true;
    }

    preview.push(entry);
  });

  return preview;
}

// `mappingOverride` (opcional): el usuario ya confirmó o corrigió el mapeo propuesto en una llamada
// anterior (ver la especificación: "Yo confirmo o corrijo esa asignación antes de continuar") — se
// vuelve a subir el MISMO archivo (nunca quedó guardado en el servidor, ver parseAndPreview) junto
// con el mapeo ya definitivo, y acá se usa tal cual, sin volver a adivinar.
async function parseAndPreview(buffer, mappingOverride) {
  const { headers, rows } = await parseWorkbookBuffer(buffer);
  if (!rows.length) throw new ApiError(400, 'El archivo no tiene filas de datos.');

  let finalMapping;
  let aiSuggested = false;
  if (mappingOverride) {
    finalMapping = mappingOverride;
  } else {
    const { mapping, confident } = detectColumnMapping(headers);
    finalMapping = mapping;
    if (!confident) {
      const aiMapping = await aiSuggestColumnMapping(headers, rows);
      // Se combinan: lo que el heurístico SÍ reconoció con certeza se respeta, la IA solo rellena lo
      // que quedó sin identificar — así una plantilla "casi" oficial no pierde sus columnas buenas.
      finalMapping = {};
      for (const field of Object.keys(FIELD_ALIASES)) finalMapping[field] = mapping[field] || aiMapping[field] || null;
      aiSuggested = true;
    }
  }

  const rowsPreview = await buildPreview({ headers, rows, mapping: finalMapping });
  const summary = rowsPreview.reduce((acc, r) => {
    acc[r.status] = (acc[r.status] || 0) + 1;
    return acc;
  }, {});

  return { headers, mapping: finalMapping, aiSuggested, rows: rowsPreview, summary, totalRows: rowsPreview.length };
}

// Reserva en una sola operación atómica `count` códigos consecutivos (ver numberingService.js#
// nextMaterialCode) — evita `count` idas y vueltas individuales a la base de datos cuando el
// archivo trae miles de filas nuevas sin código propio.
async function reserveMaterialCodes(count, transaction) {
  if (count <= 0) return [];
  const companyId = getCurrentCompanyId();
  const [row] = await sequelize.query(
    `INSERT INTO "VoucherCounters" ("id", "companyId", "kind", "value", "createdAt", "updatedAt")
     VALUES (:id, :companyId, 'material_code', :count, now(), now())
     ON CONFLICT ("companyId", "kind") DO UPDATE SET "value" = "VoucherCounters"."value" + :count, "updatedAt" = now()
     RETURNING "value"`,
    { replacements: { id: uuidv4(), companyId, count }, transaction, type: QueryTypes.SELECT }
  );
  const lastValue = row.value;
  const codes = [];
  for (let v = lastValue - count + 1; v <= lastValue; v++) codes.push(`MAT-${String(v).padStart(4, '0')}`);
  return codes;
}

// Guarda de verdad lo que el usuario confirmó en la vista previa (ver parseAndPreview) — UNA sola
// transacción: o se aplica todo, o no se mueve nada (ver la especificación). `rows` son las mismas
// filas que devolvió parseAndPreview, posiblemente con su `decision`/`categoryName`/`description`/
// `referenceCost` editados a mano en el frontend antes de confirmar.
async function commitImport(rows) {
  if (!Array.isArray(rows) || !rows.length) throw new ApiError(400, 'No hay filas para importar.');

  return sequelize.transaction(async (t) => {
    const toCreate = rows.filter((r) => r.status === 'nuevo' && r.decision !== 'omitir');
    const toUpdate = rows.filter((r) => r.status === 'existe' && r.decision === 'actualizar');
    const errorRows = rows.filter((r) => r.status === 'error');
    const skippedRows = rows.filter((r) => !toCreate.includes(r) && !toUpdate.includes(r) && r.status !== 'error');

    const categories = await MaterialCategory.findAll({ transaction: t });
    const categoryByNormalized = new Map(categories.map((c) => [normalizeMaterialText(c.name), c]));
    const defaultCategory = categories.find((c) => c.isDefault);
    if (!defaultCategory) throw new ApiError(500, 'La empresa no tiene categoría "Materiales" configurada');

    async function resolveCategoryId(categoryName) {
      if (!categoryName) return defaultCategory.id;
      const norm = normalizeMaterialText(categoryName);
      const existing = categoryByNormalized.get(norm);
      if (existing) return existing.id;
      const created = await MaterialCategory.create({ name: categoryName.trim() }, { transaction: t });
      categoryByNormalized.set(norm, created);
      return created.id;
    }

    const needingCode = toCreate.filter((r) => !r.code);
    const reservedCodes = await reserveMaterialCodes(needingCode.length, t);
    let reservedIdx = 0;

    const createRows = [];
    for (const r of toCreate) {
      // eslint-disable-next-line no-await-in-loop
      const categoryId = await resolveCategoryId(r.categoryName);
      const code = r.code || reservedCodes[reservedIdx++];
      createRows.push({
        name: r.name, unit: r.unit, description: r.description || null, categoryId, code,
        referenceCost: r.referenceCost ?? null, origin: 'importacion_excel',
        // bulkCreate NO dispara el hook beforeValidate del modelo (ese es un hook POR INSTANCIA;
        // Sequelize solo corre hooks de nivel bulk salvo que se pida individualHooks:true, que
        // aquí saldría caro con miles de filas) — por eso normalizedName/normalizedUnit se
        // calculan a mano acá, igual que hace Material.js#beforeValidate para un create() normal.
        normalizedName: normalizeMaterialText(r.name), normalizedUnit: normalizeMaterialText(r.unit || ''),
      });
    }
    for (const batch of chunk(createRows, BATCH_SIZE)) await Material.bulkCreate(batch, { transaction: t });

    let updatedCount = 0;
    for (const r of toUpdate) {
      // eslint-disable-next-line no-await-in-loop
      const material = await Material.findByPk(r.matchedMaterialId, { transaction: t });
      if (!material) continue;
      if (r.categoryName) material.categoryId = await resolveCategoryId(r.categoryName);
      if (r.description) material.description = r.description;
      if (r.referenceCost != null) material.referenceCost = r.referenceCost;
      // eslint-disable-next-line no-await-in-loop
      await material.save({ transaction: t });
      updatedCount += 1;
    }

    return {
      created: createRows.length, updated: updatedCount, skipped: skippedRows.length, errors: errorRows.length,
      errorRows: [...errorRows, ...rows.filter((r) => r.status === 'duplicado_archivo')],
    };
  });
}

// Genera el workbook de la plantilla descargable (ver la especificación) — una fila de ejemplo
// para que quede claro el formato esperado de cada columna.
function buildTemplateWorkbook() {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Materiales');
  sheet.columns = [
    { header: 'Código', key: 'code', width: 14 },
    { header: 'Nombre', key: 'name', width: 36 },
    { header: 'Unidad', key: 'unit', width: 12 },
    { header: 'Categoría', key: 'category', width: 20 },
    { header: 'Descripción', key: 'description', width: 36 },
    { header: 'Costo de referencia', key: 'referenceCost', width: 18 },
  ];
  sheet.getRow(1).font = { bold: true };
  sheet.addRow({ code: '', name: 'Cemento gris 50kg', unit: 'bulto', category: 'Materiales', description: 'Cemento Portland tipo I', referenceCost: 28000 });
  return workbook;
}

// Workbook con las filas que tuvieron error (o quedaron como duplicado dentro del archivo), para
// que el usuario las corrija y las vuelva a subir (ver la especificación).
function buildErrorWorkbook(errorRows) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Errores');
  sheet.columns = [
    { header: 'Fila', key: 'rowNumber', width: 8 },
    { header: 'Código', key: 'code', width: 14 },
    { header: 'Nombre', key: 'name', width: 36 },
    { header: 'Unidad', key: 'unit', width: 12 },
    { header: 'Categoría', key: 'categoryName', width: 20 },
    { header: 'Descripción', key: 'description', width: 36 },
    { header: 'Costo de referencia', key: 'referenceCost', width: 18 },
    { header: 'Motivo', key: 'reason', width: 40 },
  ];
  sheet.getRow(1).font = { bold: true };
  errorRows.forEach((r) => sheet.addRow(r));
  return workbook;
}

module.exports = { parseAndPreview, commitImport, buildTemplateWorkbook, buildErrorWorkbook };
