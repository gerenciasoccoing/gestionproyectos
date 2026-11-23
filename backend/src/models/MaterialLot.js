const { DataTypes } = require('sequelize');

// El lote es la unidad de costeo PEPS: cada recepción de una Orden de Compra crea un lote con el
// costo unitario EXACTO de esa OC (ver purchaseOrderController.js#addReceipt), y cada salida de
// material consume lotes del más antiguo al más nuevo (o el que elija manualmente el usuario),
// descontando quantityAvailable — nunca se promedia el costo entre lotes (ver materialLotService.js).
//
// sourceType distingue los orígenes posibles de un lote:
// - 'recepcion_oc': nace directamente de una PurchaseReceipt (purchaseOrderId/Item/ReceiptId
//   apuntan a esa recepción real).
// - 'traslado': nace de un MaterialTransfer confirmado (ver materialTransferService.js) — el
//   material llega a OTRA bodega conservando su OC/costo de origen (originLotId apunta al lote de
//   la bodega de salida).
// - 'devolucion': nace de una devolución de material que vuelve a una bodega (puede ser la misma
//   bodega de origen, que simplemente le suma cantidad a SU lote original — no crea uno nuevo — o
//   otra bodega distinta, que sí crea un lote nuevo). originLotId apunta al lote del que salió el
//   material devuelto.
// En 'traslado' y 'devolucion', purchaseOrderId/Item/ReceiptId/supplierId/unitCost se COPIAN del
// lote de origen (nunca de la devolución/traslado en sí) para que el costo real de la OC nunca se
// pierda ni se recalcule, sin importar cuántas veces el material se mueva de bodega en bodega.
module.exports = (sequelize) => {
  const MaterialLot = sequelize.define('MaterialLot', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    // Aislamiento multi-tenant (ver applyTenantScoping.js): asignado automáticamente por los
    // hooks de Sequelize a partir del usuario autenticado, nunca a mano en un controlador.
    companyId: { type: DataTypes.UUID, allowNull: true },
    warehouseId: { type: DataTypes.UUID, allowNull: false },
    materialId: { type: DataTypes.UUID, allowNull: false },
    sourceType: { type: DataTypes.ENUM('recepcion_oc', 'traslado', 'devolucion'), allowNull: false, defaultValue: 'recepcion_oc' },
    originLotId: { type: DataTypes.UUID, allowNull: true },
    purchaseOrderId: { type: DataTypes.UUID, allowNull: true },
    purchaseOrderItemId: { type: DataTypes.UUID, allowNull: true },
    purchaseReceiptId: { type: DataTypes.UUID, allowNull: true },
    supplierId: { type: DataTypes.UUID, allowNull: true },
    unit: { type: DataTypes.STRING, allowNull: true },
    // Cantidad original con la que nació el lote (histórico, nunca cambia salvo corrección admin de
    // la recepción de origen, ver purchaseOrderController.js#updateReceipt) vs. disponible (se
    // descuenta con cada salida/traslado, se repone con cada devolución o traslado rechazado — nunca
    // puede quedar negativa, se protege con bloqueo transaccional en materialLotService.js).
    quantityReceived: { type: DataTypes.DECIMAL(18, 4), allowNull: false, validate: { min: 0 } },
    quantityAvailable: { type: DataTypes.DECIMAL(18, 4), allowNull: false, validate: { min: 0 } },
    unitCost: { type: DataTypes.DECIMAL(18, 2), allowNull: false, validate: { min: 0 } },
    receivedDate: { type: DataTypes.DATEONLY, allowNull: false },
    createdBy: { type: DataTypes.UUID, allowNull: true },
  });

  MaterialLot.associate = (models) => {
    MaterialLot.belongsTo(models.Warehouse, { foreignKey: 'warehouseId' });
    MaterialLot.belongsTo(models.Material, { foreignKey: 'materialId' });
    MaterialLot.belongsTo(models.PurchaseOrder, { foreignKey: 'purchaseOrderId' });
    MaterialLot.belongsTo(models.PurchaseOrderItem, { foreignKey: 'purchaseOrderItemId' });
    MaterialLot.belongsTo(models.PurchaseReceipt, { foreignKey: 'purchaseReceiptId' });
    MaterialLot.belongsTo(models.ThirdParty, { foreignKey: 'supplierId', as: 'supplier' });
    MaterialLot.belongsTo(models.MaterialLot, { foreignKey: 'originLotId', as: 'originLot' });
    MaterialLot.belongsTo(models.User, { foreignKey: 'createdBy', as: 'creator' });
  };

  return MaterialLot;
};
