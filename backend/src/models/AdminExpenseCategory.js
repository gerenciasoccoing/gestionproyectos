const { DataTypes } = require('sequelize');

// Catálogo de categorías de Gasto Administrativo General por empresa (Administración > Parámetros >
// Categorías de gastos administrativos), usado al registrar un gasto con expenseType='administrativo'
// (ver Expense.adminCategoryId, expenseController.js). Mismo patrón que WithholdingType.js: nunca se
// elimina una categoría ya usada en un gasto — solo se desactiva (active=false, sigue existiendo para
// no romper el historial de gastos que ya la referencian, simplemente deja de ofrecerse al registrar
// un gasto nuevo).
module.exports = (sequelize) => {
  const AdminExpenseCategory = sequelize.define('AdminExpenseCategory', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    // Aislamiento multi-tenant (ver applyTenantScoping.js): asignado automáticamente por los
    // hooks de Sequelize a partir del usuario autenticado, nunca a mano en un controlador.
    companyId: { type: DataTypes.UUID, allowNull: true },
    name: { type: DataTypes.STRING, allowNull: false },
    active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    createdBy: { type: DataTypes.UUID, allowNull: true },
  });

  AdminExpenseCategory.associate = (models) => {
    AdminExpenseCategory.hasMany(models.Expense, { foreignKey: 'adminCategoryId', as: 'expenses' });
  };

  return AdminExpenseCategory;
};
