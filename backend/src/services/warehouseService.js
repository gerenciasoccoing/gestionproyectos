const ApiError = require('../utils/ApiError');
const { Warehouse, MaterialLot, Material, PurchaseOrder, ThirdParty } = require('../models');

async function getDefaultWarehouse(transaction) {
  const warehouse = await Warehouse.findOne({ where: { isDefault: true }, transaction });
  if (!warehouse) throw new ApiError(500, 'La empresa no tiene Bodega Principal configurada');
  return warehouse;
}

// Existencias de una bodega: una fila por material con cantidad disponible > 0, cada una con el
// detalle de los lotes que la componen (OC de origen, fecha, cantidad y costo unitario exacto) —
// ver la especificación de la tarea ("vista de existencias... con detalle desplegable por lote").
// Nunca se cachea ni se guarda una columna de "stock": siempre es la suma en vivo de
// MaterialLot.quantityAvailable, mismo criterio que cashBoxService.getBalance.
async function getWarehouseStock(warehouseId) {
  const lots = await MaterialLot.findAll({
    where: { warehouseId },
    include: [
      { model: Material, attributes: ['id', 'name', 'unit'] },
      { model: PurchaseOrder, attributes: ['id', 'orderNumber'] },
      { model: ThirdParty, as: 'supplier', attributes: ['id', 'name'] },
    ],
    order: [['receivedDate', 'ASC'], ['createdAt', 'ASC']],
  });

  const byMaterial = new Map();
  for (const lot of lots) {
    const available = Number(lot.quantityAvailable);
    if (available <= 0) continue;
    const key = lot.materialId;
    if (!byMaterial.has(key)) {
      byMaterial.set(key, {
        materialId: lot.materialId,
        materialName: lot.Material?.name || '-',
        unit: lot.Material?.unit || lot.unit,
        totalAvailable: 0,
        lots: [],
      });
    }
    const entry = byMaterial.get(key);
    entry.totalAvailable += available;
    entry.lots.push({
      id: lot.id,
      purchaseOrderId: lot.purchaseOrderId,
      purchaseOrderNumber: lot.PurchaseOrder?.orderNumber || null,
      supplierName: lot.supplier?.name || null,
      sourceType: lot.sourceType,
      receivedDate: lot.receivedDate,
      quantityAvailable: available,
      unitCost: Number(lot.unitCost),
    });
  }
  return [...byMaterial.values()].sort((a, b) => a.materialName.localeCompare(b.materialName));
}

module.exports = { getDefaultWarehouse, getWarehouseStock };
