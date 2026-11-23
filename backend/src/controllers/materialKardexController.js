const asyncHandler = require('../utils/asyncHandler');
const materialKardexService = require('../services/materialKardexService');

const list = asyncHandler(async (req, res) => {
  const { warehouseId, materialId, projectId, purchaseOrderId, person, from, to, movementType } = req.query;
  const entries = await materialKardexService.getEntries({
    warehouseId: warehouseId || undefined,
    materialId: materialId || undefined,
    projectId: projectId || undefined,
    purchaseOrderId: purchaseOrderId || undefined,
    person: person || undefined,
    from: from || undefined,
    to: to || undefined,
    movementType: movementType || undefined,
  });
  res.json(entries);
});

module.exports = { list };
