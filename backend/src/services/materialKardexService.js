// Kardex: histórico unificado de movimientos del Inventario de Materiales (entradas, traslados,
// salidas, devoluciones) — puramente de lectura, no agrega ninguna tabla nueva: arma su vista a
// partir de los datos que cada fase ya persiste (MaterialLot/MaterialTransferLine/
// MaterialIssueLine/MaterialReturnLine), igual criterio que purchaseOrderService.getPurchaseReport
// (un reporte es una consulta, no un dato aparte que pueda desincronizarse). "Desde cualquier
// salida debe poder verse de qué OC(s) y a qué costo salió cada unidad" ya está resuelto: cada
// línea de salida apunta a su lote de origen (sourceLotId), que a su vez apunta a su OC real
// (purchaseOrderId/purchaseReceiptId), sin importar cuántos traslados/devoluciones haya tenido ese
// lote entre medio (originLotId encadena hacia atrás).
const { Op } = require('sequelize');
const {
  MaterialLot, MaterialTransfer, MaterialTransferLine, MaterialIssue, MaterialIssueLine,
  MaterialReturn, MaterialReturnLine, Material, Warehouse, Project, PurchaseOrder, User, Employee,
} = require('../models');

function dateWhere(from, to) {
  const where = {};
  if (from) where[Op.gte] = from;
  if (to) where[Op.lte] = to;
  return Object.keys(where).length ? where : undefined;
}

// Construye el `where` compartido por las 4 consultas a partir de los filtros de la pantalla
// (bodega, material, contrato, OC, tipo de movimiento, rango de fechas) — "persona" se filtra
// aparte en JS después de traer los datos (compara contra varios campos de nombre distintos según
// el tipo de movimiento, no tiene una sola columna en común).
function buildDateAndIds({ from, to }) {
  const date = dateWhere(from, to);
  return date ? { date } : {};
}

async function getEntries({ warehouseId, materialId, projectId, purchaseOrderId, person, from, to, movementType } = {}) {
  const entries = [];
  const dateFilter = buildDateAndIds({ from, to });

  if (!movementType || movementType === 'entrada') {
    const where = { sourceType: 'recepcion_oc', ...(dateFilter.date ? { receivedDate: dateFilter.date } : {}) };
    if (warehouseId) where.warehouseId = warehouseId;
    if (materialId) where.materialId = materialId;
    if (purchaseOrderId) where.purchaseOrderId = purchaseOrderId;
    const lots = await MaterialLot.findAll({
      where,
      include: [
        { model: Material, attributes: ['id', 'name', 'unit'] },
        { model: Warehouse, attributes: ['id', 'name'] },
        { model: PurchaseOrder, attributes: ['id', 'orderNumber', 'projectId'] },
        { model: User, as: 'creator', attributes: ['id', 'name'] },
      ],
    });
    for (const lot of lots) {
      if (projectId && lot.PurchaseOrder?.projectId !== projectId) continue;
      entries.push({
        type: 'entrada', date: lot.receivedDate, warehouseId: lot.warehouseId, warehouseName: lot.Warehouse?.name,
        materialId: lot.materialId, materialName: lot.Material?.name, unit: lot.Material?.unit,
        quantity: Number(lot.quantityReceived), direction: 'in', unitCost: Number(lot.unitCost),
        purchaseOrderId: lot.purchaseOrderId, purchaseOrderNumber: lot.PurchaseOrder?.orderNumber,
        person: null, userName: lot.creator?.name || null, movementId: lot.purchaseOrderId, pdfType: null, pdfId: null, status: null,
      });
    }
  }

  if (!movementType || movementType === 'traslado') {
    const where = {};
    if (dateFilter.date) where.date = dateFilter.date;
    const transfers = await MaterialTransfer.findAll({
      where,
      include: [
        { model: Warehouse, as: 'fromWarehouse', attributes: ['id', 'name'] },
        { model: Warehouse, as: 'toWarehouse', attributes: ['id', 'name'] },
        { model: User, as: 'creator', attributes: ['id', 'name'] },
        {
          model: MaterialTransferLine, as: 'lines',
          include: [{ model: Material, attributes: ['id', 'name', 'unit'] }, { model: MaterialLot, as: 'sourceLot', attributes: ['id', 'purchaseOrderId'] }],
        },
      ],
    });
    for (const tr of transfers) {
      for (const line of tr.lines) {
        if (materialId && line.materialId !== materialId) continue;
        if (purchaseOrderId && line.sourceLot?.purchaseOrderId !== purchaseOrderId) continue;
        if (!warehouseId || warehouseId === tr.fromWarehouseId) {
          entries.push({
            type: 'traslado_salida', date: tr.date, warehouseId: tr.fromWarehouseId, warehouseName: tr.fromWarehouse?.name,
            materialId: line.materialId, materialName: line.Material?.name, unit: line.Material?.unit,
            quantity: Number(line.quantitySent), direction: 'out', unitCost: Number(line.unitCost),
            purchaseOrderId: line.sourceLot?.purchaseOrderId || null, purchaseOrderNumber: null,
            person: null, userName: tr.creator?.name || null, movementId: tr.id, pdfType: 'traslado', pdfId: tr.id, status: tr.status,
          });
        }
        if (line.quantityReceived != null && (!warehouseId || warehouseId === tr.toWarehouseId)) {
          entries.push({
            type: 'traslado_entrada', date: tr.date, warehouseId: tr.toWarehouseId, warehouseName: tr.toWarehouse?.name,
            materialId: line.materialId, materialName: line.Material?.name, unit: line.Material?.unit,
            quantity: Number(line.quantityReceived), direction: 'in', unitCost: Number(line.unitCost),
            purchaseOrderId: line.sourceLot?.purchaseOrderId || null, purchaseOrderNumber: null,
            person: null, userName: tr.creator?.name || null, movementId: tr.id, pdfType: 'traslado', pdfId: tr.id, status: tr.status,
          });
        }
      }
    }
  }

  if (!movementType || movementType === 'salida') {
    const where = {};
    if (dateFilter.date) where.date = dateFilter.date;
    if (warehouseId) where.fromWarehouseId = warehouseId;
    if (projectId) where.projectId = projectId;
    const issues = await MaterialIssue.findAll({
      where,
      include: [
        { model: Warehouse, as: 'fromWarehouse', attributes: ['id', 'name'] },
        { model: Employee, as: 'receiverEmployee', attributes: ['id', 'name'] },
        { model: User, as: 'creator', attributes: ['id', 'name'] },
        {
          model: MaterialIssueLine, as: 'lines',
          include: [{ model: Material, attributes: ['id', 'name', 'unit'] }, { model: MaterialLot, as: 'sourceLot', attributes: ['id', 'purchaseOrderId'] }],
        },
      ],
    });
    for (const is of issues) {
      const personLabel = is.receiverType === 'empleado' ? is.receiverEmployee?.name : is.receiverExternalName;
      for (const line of is.lines) {
        if (materialId && line.materialId !== materialId) continue;
        if (purchaseOrderId && line.sourceLot?.purchaseOrderId !== purchaseOrderId) continue;
        entries.push({
          type: 'salida', date: is.date, warehouseId: is.fromWarehouseId, warehouseName: is.fromWarehouse?.name,
          materialId: line.materialId, materialName: line.Material?.name, unit: line.Material?.unit,
          quantity: Number(line.quantity), direction: 'out', unitCost: Number(line.unitCost),
          purchaseOrderId: line.sourceLot?.purchaseOrderId || null, purchaseOrderNumber: null,
          person: personLabel, userName: is.creator?.name || null, movementId: is.id, pdfType: 'salida', pdfId: is.id, status: is.status,
        });
      }
    }
  }

  if (!movementType || movementType === 'devolucion') {
    const where = {};
    if (dateFilter.date) where.date = dateFilter.date;
    if (warehouseId) where.toWarehouseId = warehouseId;
    if (projectId) where.projectId = projectId;
    const returns = await MaterialReturn.findAll({
      where,
      include: [
        { model: Warehouse, as: 'toWarehouse', attributes: ['id', 'name'] },
        { model: User, as: 'creator', attributes: ['id', 'name'] },
        {
          model: MaterialReturnLine, as: 'lines',
          include: [{ model: Material, attributes: ['id', 'name', 'unit'] }, { model: MaterialIssueLine, as: 'originIssueLine', attributes: ['id', 'sourceLotId'] }],
        },
      ],
    });
    for (const ret of returns) {
      for (const line of ret.lines) {
        if (materialId && line.materialId !== materialId) continue;
        entries.push({
          type: 'devolucion', date: ret.date, warehouseId: ret.toWarehouseId, warehouseName: ret.toWarehouse?.name,
          materialId: line.materialId, materialName: line.Material?.name, unit: line.Material?.unit,
          quantity: Number(line.quantity), direction: 'in', unitCost: Number(line.unitCost),
          purchaseOrderId: null, purchaseOrderNumber: null,
          person: null, userName: ret.creator?.name || null, movementId: ret.id, pdfType: 'devolucion', pdfId: ret.id, status: ret.status,
        });
      }
    }
  }

  const filtered = person
    ? entries.filter((e) => `${e.person || ''} ${e.userName || ''}`.toLowerCase().includes(String(person).toLowerCase()))
    : entries;

  return filtered.sort((a, b) => new Date(b.date) - new Date(a.date));
}

module.exports = { getEntries };
