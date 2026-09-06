const path = require('path');
const { sequelize, APU, APUComponent, BudgetItem } = require('../models');
const ApiError = require('../utils/ApiError');
const { extractStructuredData, extractStructuredDataFromText } = require('./aiVisionService');
const { getExtractor } = require('../config/aiDocumentExtractors');
const { workbookToText } = require('./budgetItemsScanService');
const { recomputeAndPersistApuCost, resolveBudgetItemFields } = require('./budgetService');

const EXCEL_EXTENSIONS = ['.xlsx', '.xls'];

function sanitizeResourceList(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((r) => r && String(r.name || '').trim())
    .map((r) => ({
      name: String(r.name).trim(),
      unit: r.unit ? String(r.unit).trim() : null,
      quantity: r.quantity != null ? Number(r.quantity) : null,
      unitValue: r.unitValue != null ? Number(r.unitValue) : null,
    }))
    .filter((r) => r.quantity != null && !Number.isNaN(r.quantity) && r.unitValue != null && !Number.isNaN(r.unitValue));
}

// Lee, con IA, el análisis de precio unitario de UN ítem ya identificado (ver
// aiDocumentExtractors.budgetItemApu) — nunca crea nada, solo devuelve una vista previa editable
// para que el usuario la revise antes de confirmar (ver createBudgetItemsWithProjectApu).
async function scanItemApu({ buffer, mimetype, originalname, itemDescription }) {
  if (!itemDescription || !itemDescription.trim()) throw new ApiError(400, 'itemDescription es obligatorio');
  const extractor = getExtractor('budgetItemApu');
  const instructions = extractor.instructionsTemplate.replace('{{itemDescription}}', itemDescription.trim());
  const ext = path.extname(originalname || '').toLowerCase();

  let result;
  if (EXCEL_EXTENSIONS.includes(ext)) {
    let text;
    try {
      text = workbookToText(buffer);
    } catch (err) {
      throw new ApiError(422, `No se pudo leer el archivo Excel: ${err.message}`);
    }
    if (!text.trim()) throw new ApiError(422, 'El archivo Excel no tiene contenido legible en ninguna hoja.');
    result = await extractStructuredDataFromText({ text, instructions, schemaDescription: extractor.schemaDescription, maxTokens: extractor.maxTokens });
  } else {
    result = await extractStructuredData({ buffer, mimetype, instructions, schemaDescription: extractor.schemaDescription, maxTokens: extractor.maxTokens });
  }

  const materials = sanitizeResourceList(result?.materials);
  const labor = sanitizeResourceList(result?.labor);
  const equipment = sanitizeResourceList(result?.equipment);
  const transport = sanitizeResourceList(result?.transport);
  if (!materials.length && !labor.length && !equipment.length && !transport.length) {
    throw new ApiError(422, `No se pudo identificar un análisis unitario reconocible para "${itemDescription}" en el archivo. Verifica que el archivo lo contenga o inténtalo con otro archivo.`);
  }
  return { materials, labor, equipment, transport };
}

// Defaults elegidos para que CADA fórmula de budgetService.computeSectionCosts colapse a
// "cantidad × valor unitario" (yield=1, wastePercent=0, prestacionalPercent=0, transporte en modo
// distancia_peso con distancia=1) — así el costo de cada recurso coincide exactamente con lo que
// ya muestra un análisis unitario simple ya calculado, sin pedirle a la IA conceptos internos
// (rendimiento, factor prestacional) que casi nunca están explícitos en el documento fuente. Sin
// priceItemId nunca: el nombre/unidad/valor quedan en description/unit/unitValue (manual) — ver
// APUComponent.
function buildComponentRows(apuId, resources, category) {
  return resources.map((r) => {
    const base = {
      apuId,
      category,
      priceItemId: null,
      description: r.name,
      unit: r.unit,
      quantity: r.quantity,
      unitValue: r.unitValue,
      yield: 1,
    };
    if (category === 'material') base.wastePercent = 0;
    if (category === 'personal') base.prestacionalPercent = 0;
    if (category === 'transporte') {
      base.transportMode = 'distancia_peso';
      base.transportDistance = 1;
    }
    return base;
  });
}

// Crea, en una sola transacción, un APU privado del proyecto (ver APU.projectId) por cada
// entrada con sus componentes — nunca toca PriceItem/PriceHistory — y el BudgetItem que lo
// referencia. `entries`: [{ item: { unit, quantity, notes }, apu: { name, unit, materials, labor,
// equipment, transport } }]. `budget` debe ser el Budget vigente del proyecto (ya creado/
// asegurado por el llamador, igual que el resto de altas de ítems).
async function createBudgetItemsWithProjectApu({ projectId, budget, entries }) {
  if (!Array.isArray(entries) || !entries.length) throw new ApiError(400, 'Debe enviar al menos un ítem con su APU');

  return sequelize.transaction(async (t) => {
    const createdItems = [];
    for (const entry of entries) {
      const item = entry.item || {};
      const apuData = entry.apu || {};
      if (!item.unit || item.quantity === undefined) throw new ApiError(400, 'Cada ítem requiere unit y quantity');
      if (!apuData.name || !apuData.name.trim()) throw new ApiError(400, 'Cada ítem requiere el nombre de su APU');

      // eslint-disable-next-line no-await-in-loop
      const apu = await APU.create({
        projectId, name: apuData.name.trim(), unit: apuData.unit || item.unit, otherCosts: 0,
      }, { transaction: t });

      const componentRows = [
        ...buildComponentRows(apu.id, sanitizeResourceList(apuData.materials), 'material'),
        ...buildComponentRows(apu.id, sanitizeResourceList(apuData.labor), 'personal'),
        ...buildComponentRows(apu.id, sanitizeResourceList(apuData.equipment), 'herramienta'),
        ...buildComponentRows(apu.id, sanitizeResourceList(apuData.transport), 'transporte'),
      ];
      // eslint-disable-next-line no-await-in-loop
      if (componentRows.length) await APUComponent.bulkCreate(componentRows, { transaction: t });

      // eslint-disable-next-line no-await-in-loop
      await recomputeAndPersistApuCost(apu.id, { transaction: t });

      // eslint-disable-next-line no-await-in-loop
      const fields = await resolveBudgetItemFields({
        budget, apuId: apu.id, unit: item.unit, quantity: item.quantity, notes: item.notes, transaction: t,
      });
      // eslint-disable-next-line no-await-in-loop
      createdItems.push(await BudgetItem.create(fields, { transaction: t }));
    }
    return createdItems;
  });
}

module.exports = { scanItemApu, createBudgetItemsWithProjectApu };
