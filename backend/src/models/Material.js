const { DataTypes } = require('sequelize');
const { normalizeMaterialText } = require('../utils/textNormalize');

// Catálogo de materiales (Inventario de Materiales + Órdenes de Compra), por empresa. Se auto-crea
// por nombre al crear/editar un ítem inventariable de una Orden de Compra (ver
// materialLotService.js#findOrCreateMaterialByName, usado desde
// purchaseOrderController.js#resolveNewItemMaterial) o al importarlo masivamente desde Excel (ver
// materialImportService.js), y también es editable a mano desde su propia pantalla — sin este
// catálogo, el kardex y el análisis "por material" quedarían fragmentados por cómo cada OC escribió
// el nombre en PurchaseOrderItem.name (texto libre, nunca vinculado a ningún catálogo).
//
// normalizedName/normalizedUnit (ver utils/textNormalize.js) son la clave real de deduplicación
// ("Cemento gris 50kg" y "cemento  gris 50 kg." deben ser el MISMO material si la unidad coincide,
// pero un nombre igual con otra unidad es un material DISTINTO) — se recalculan solos en cada save
// (hook beforeValidate), nunca se asignan a mano. `name`/`unit` siguen siendo el texto tal como lo
// escribió el usuario (se muestran así en toda la UI); normalizedName/normalizedUnit son invisibles,
// solo existen para el índice único y la búsqueda.
module.exports = (sequelize) => {
  const Material = sequelize.define('Material', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    // Aislamiento multi-tenant (ver applyTenantScoping.js): asignado automáticamente por los
    // hooks de Sequelize a partir del usuario autenticado, nunca a mano en un controlador.
    companyId: { type: DataTypes.UUID, allowNull: true },
    // Consecutivo por empresa (ej. MAT-0001, ver numberingService.js#nextMaterialCode) — editable
    // a mano después de asignado (la especificación lo pide así), por lo que SOLO tiene un índice
    // único (companyId, code): dos materiales nunca pueden terminar con el mismo código, pero no
    // hay ninguna validación de formato sobre lo que el usuario decida escribir ahí.
    code: { type: DataTypes.STRING, allowNull: true },
    name: { type: DataTypes.STRING, allowNull: false },
    // Nullable a propósito (no NOT NULL): agregar esta columna a una tabla con materiales ya
    // existentes (sync({alter:true}) no puede poner un NOT NULL sin default sobre filas existentes)
    // — el hook beforeValidate de abajo la rellena en TODO create/update, y
    // postSyncFixups.js#backfillMaterialCatalogDefaults la completa para los que ya existían.
    normalizedName: { type: DataTypes.STRING, allowNull: true },
    unit: { type: DataTypes.STRING, allowNull: true },
    normalizedUnit: { type: DataTypes.STRING, allowNull: true },
    description: { type: DataTypes.TEXT, allowNull: true },
    // Costo de referencia (ver la plantilla de importación Excel): solo tiene sentido para un
    // material que todavía no tiene ninguna Orden de Compra (importado o creado a mano) — una vez
    // exista al menos un ítem de OC, el catálogo/selector muestra el ÚLTIMO COSTO DE COMPRA real en
    // su lugar (ver materialCatalogService.js#getLastPurchaseCosts), nunca los dos mezclados.
    referenceCost: { type: DataTypes.DECIMAL(18, 2), allowNull: true },
    categoryId: { type: DataTypes.UUID, allowNull: true },
    // De dónde nació este registro — puramente informativo (se muestra en el catálogo, ver la
    // especificación: "origen (OC de origen o importación Excel)"); nunca cambia la lógica de
    // negocio. 'orden_compra' cubre tanto el emparejamiento automático como cuando el usuario
    // escribió el nombre a mano en el formulario de la OC (ver resolveNewItemMaterial): las dos
    // rutas terminan en el mismo findOrCreateMaterialByName.
    origin: { type: DataTypes.ENUM('orden_compra', 'manual', 'importacion_excel'), allowNull: false, defaultValue: 'manual' },
    originPurchaseOrderId: { type: DataTypes.UUID, allowNull: true },
    // Fusión de duplicados (ver materialCatalogService.js#mergeMaterials): el material "perdedor"
    // se desactiva y queda apuntando acá al que lo absorbió, en vez de borrarse — conserva la
    // trazabilidad de qué pasó con cada código/nombre viejo sin necesidad de una tabla de auditoría
    // aparte.
    mergedIntoMaterialId: { type: DataTypes.UUID, allowNull: true },
    active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
  }, {
    indexes: [
      { unique: true, fields: ['companyId', 'normalizedName', 'normalizedUnit'] },
      { unique: true, fields: ['companyId', 'code'] },
      { fields: ['companyId', 'categoryId'] },
    ],
    hooks: {
      beforeValidate(material) {
        if (material.changed('name') || !material.normalizedName) material.normalizedName = normalizeMaterialText(material.name);
        if (material.changed('unit') || material.normalizedUnit === undefined || material.normalizedUnit === null) {
          material.normalizedUnit = normalizeMaterialText(material.unit || '');
        }
      },
    },
  });

  Material.associate = (models) => {
    // onDelete explícito (RESTRICT): tampoco se expone "eliminar material" en la API si tiene
    // lotes/movimientos (solo activar/desactivar, ver materialController.js#remove) — mismo
    // criterio que Warehouse.js.
    Material.hasMany(models.MaterialLot, { foreignKey: 'materialId', as: 'lots', onDelete: 'RESTRICT' });
    Material.belongsTo(models.MaterialCategory, { foreignKey: 'categoryId', as: 'category' });
    Material.belongsTo(models.PurchaseOrder, { foreignKey: 'originPurchaseOrderId', as: 'originPurchaseOrder' });
    Material.belongsTo(models.Material, { foreignKey: 'mergedIntoMaterialId', as: 'mergedInto' });
  };

  return Material;
};
