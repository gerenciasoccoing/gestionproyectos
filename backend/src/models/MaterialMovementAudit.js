const { DataTypes } = require('sequelize');

// Auditoría de ediciones/eliminaciones de movimientos del Inventario de Materiales YA FIRMADOS —
// ver la especificación: "Editar o eliminar movimientos ya firmados es solo para Administrador, con
// observación obligatoria y registro de auditoría". En este módulo no se permite "editar" las
// cantidades de un movimiento ya firmado (reabrir y recalcular un PEPS que ya pudo haberse
// consumido más adelante por otro movimiento es inseguro de automatizar sin riesgo real de dejar un
// lote negativo) — la única acción disponible es anularlo (mismo camino que rejectTransfer/
// rejectIssue/rejectReturn, ahora también permitido desde 'firmado' cuando quien pide la acción es
// Administrador), que reversa su efecto en stock con los mismos bloqueos de seguridad de siempre
// (decrementLotQuantity/restoreLotQuantity ya rechazan la operación si ese crédito/débito ya fue
// tocado por otro movimiento desde entonces, en vez de corromper el lote).
module.exports = (sequelize) => {
  const MaterialMovementAudit = sequelize.define('MaterialMovementAudit', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    companyId: { type: DataTypes.UUID, allowNull: true },
    movementType: { type: DataTypes.ENUM('traslado', 'salida', 'devolucion'), allowNull: false },
    movementId: { type: DataTypes.UUID, allowNull: false },
    action: { type: DataTypes.ENUM('voided_after_signature'), allowNull: false, defaultValue: 'voided_after_signature' },
    observation: { type: DataTypes.TEXT, allowNull: false },
    userId: { type: DataTypes.UUID, allowNull: true },
  });

  return MaterialMovementAudit;
};
