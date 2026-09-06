const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const APU = sequelize.define('APU', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    // Aislamiento multi-tenant (ver applyTenantScoping.js): asignado automáticamente por los
    // hooks de Sequelize a partir del usuario autenticado, nunca a mano en un controlador.
    companyId: { type: DataTypes.UUID, allowNull: true },
    name: { type: DataTypes.STRING, allowNull: false },
    unit: { type: DataTypes.STRING, allowNull: false },
    // Código de referencia externo (ej. listado oficial de precios unitarios), para poder
    // reimportar/actualizar sin duplicar. Opcional.
    code: { type: DataTypes.STRING, allowNull: true },
    // Costos directos que no corresponden a un insumo con precio propio y reutilizable
    // (ej. "herramienta menor" calculada como % variable de la mano de obra en cada análisis).
    // Se suman al costo directo del APU (que ya no incluye AIU: el AIU se define al crear
    // el presupuesto y se aplica sobre este costo directo, ver Budget.adminPercent/etc).
    otherCosts: { type: DataTypes.DECIMAL(18, 2), allowNull: false, defaultValue: 0, validate: { min: 0 } },
    // Costo directo cacheado (suma de las 4 secciones + otherCosts, ver budgetService.computeSectionCosts).
    // Recalculado y persistido cada vez que cambian los componentes de ESTE APU o el precio de
    // algún insumo que use (ver budgetService.recomputeAndPersistApuCost/recomputeApuCostsForPriceItems),
    // para que el listado de APU (miles de filas) no tenga que reconstruirlo leyendo todos los
    // componentes en cada consulta — antes era el cuello de botella principal de /api/apus.
    directCost: { type: DataTypes.DECIMAL(18, 2), allowNull: false, defaultValue: 0, validate: { min: 0 } },
    // Último lote de listado de precios que creó o actualizó este APU (null si es 100% manual).
    lastPriceListImportId: { type: DataTypes.UUID, allowNull: true },
    // null = catálogo global de APU (el de siempre: Cotizaciones, Estudio de Mercado, /apu, y el
    // presupuesto de un proyecto cuando se referencia un APU del catálogo). Con valor = APU
    // privado de ESE proyecto (ver "Presupuesto del Proyecto" > modo con APU,
    // projectApuService.js): nunca aparece en el catálogo global (apuController.list lo excluye)
    // ni se cruza con otro proyecto, aunque comparta nombre/código con uno global o de otro
    // proyecto — no hay índice único sobre name/code que lo impida. Un APU de proyecto tampoco
    // referencia jamás un PriceItem de la Base de Precios (ver APUComponent.priceItemId): sus
    // componentes siempre usan unitValue/description/unit manuales, aunque el modelo lo permitiría.
    projectId: { type: DataTypes.UUID, allowNull: true },
  });

  APU.associate = (models) => {
    APU.hasMany(models.APUComponent, { foreignKey: 'apuId', as: 'components', onDelete: 'CASCADE' });
    APU.hasMany(models.BudgetItem, { foreignKey: 'apuId' });
    APU.hasMany(models.APUPriceHistory, { foreignKey: 'apuId', as: 'priceHistory', onDelete: 'CASCADE' });
    APU.belongsTo(models.PriceListImport, { foreignKey: 'lastPriceListImportId', as: 'lastImport' });
    APU.belongsTo(models.Project, { foreignKey: 'projectId' });
  };

  return APU;
};
