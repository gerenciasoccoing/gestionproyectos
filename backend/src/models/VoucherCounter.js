const { DataTypes } = require('sequelize');

// Consecutivo atómico, por empresa, de los comprobantes de egreso (Gastos) e ingreso (Cajas) — ver
// numberingService.js#nextVoucherNumber. Tabla dedicada en vez del patrón MAX(columna)+1 que
// todavía usa el resto de la app (órdenes de compra, el expenseNumber "interno" de Gastos): un
// UPSERT con ON CONFLICT DO UPDATE es atómico en una sola ida a la base de datos — dos peticiones
// simultáneas que intentan incrementar el mismo (companyId, kind) se serializan sobre esa fila en
// vez de poder leer el mismo valor antes de que cualquiera de las dos confirme, que es exactamente
// el hueco que tiene MAX+1 bajo concurrencia real.
module.exports = (sequelize) => {
  const VoucherCounter = sequelize.define('VoucherCounter', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    // Aislamiento multi-tenant (ver applyTenantScoping.js): asignado automáticamente por los
    // hooks de Sequelize a partir del usuario autenticado, nunca a mano en un controlador.
    companyId: { type: DataTypes.UUID, allowNull: true },
    kind: { type: DataTypes.ENUM('egreso', 'ingreso'), allowNull: false },
    value: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  }, {
    indexes: [{ unique: true, fields: ['companyId', 'kind'] }],
  });

  return VoucherCounter;
};
