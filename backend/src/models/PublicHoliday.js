const { DataTypes } = require('sequelize');

// Calendario de festivos de Colombia por empresa (sembrado automáticamente con
// config/colombianHolidays.js al aprovisionar y en cada arranque para empresas existentes, ver
// postSyncFixups.js) — usado para contar días HÁBILES de vacaciones (excluye domingos y estos
// festivos). Editable: si un año cambia la norma, se ajusta el registro acá, nunca en el código.
module.exports = (sequelize) => {
  const PublicHoliday = sequelize.define('PublicHoliday', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    // Aislamiento multi-tenant (ver applyTenantScoping.js): asignado automáticamente por los
    // hooks de Sequelize a partir del usuario autenticado, nunca a mano en un controlador.
    companyId: { type: DataTypes.UUID, allowNull: true },
    date: { type: DataTypes.DATEONLY, allowNull: false },
    name: { type: DataTypes.STRING, allowNull: false },
  });

  return PublicHoliday;
};
