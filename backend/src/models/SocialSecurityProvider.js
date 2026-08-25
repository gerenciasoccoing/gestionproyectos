const { DataTypes } = require('sequelize');

// Catálogo de entidades de seguridad social (EPS/fondo de pensión/ARL) por empresa, para el combo
// buscable de la ficha del trabajador (ver socialSecurityProviderController.js). Employee sigue
// guardando el nombre como texto en epsName/pensionFundName/arlName (sin cambios ahí, para no
// romper trabajadores ya creados) — este catálogo solo alimenta las opciones del selector y
// permite agregar una entidad nueva sin salir del formulario.
module.exports = (sequelize) => {
  const SocialSecurityProvider = sequelize.define('SocialSecurityProvider', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    // Aislamiento multi-tenant (ver applyTenantScoping.js): asignado automáticamente por los
    // hooks de Sequelize a partir del usuario autenticado, nunca a mano en un controlador.
    companyId: { type: DataTypes.UUID, allowNull: true },
    type: { type: DataTypes.ENUM('eps', 'pension', 'arl'), allowNull: false },
    name: { type: DataTypes.STRING, allowNull: false },
  }, {
    indexes: [{ unique: true, fields: ['companyId', 'type', 'name'] }],
  });

  return SocialSecurityProvider;
};
