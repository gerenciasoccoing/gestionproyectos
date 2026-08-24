const { DataTypes } = require('sequelize');

// Cada fila es una empresa cliente (tenant) de la plataforma. Hasta la migración a multi-tenant
// esta tabla era CompanySettings, una fila única global usada para el branding de PDFs — ahora es
// la tabla raíz de la que cuelga companyId en el resto de tablas de negocio (ver
// applyTenantScoping.js). La primera fila, creada por la migración, es SOCCOING S.A.S. con sus
// datos reales ya cargados, no una empresa de ejemplo.
module.exports = (sequelize) => {
  const Company = sequelize.define('Company', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    companyName: { type: DataTypes.STRING, allowNull: false, defaultValue: 'Mi Empresa' },
    logoPath: { type: DataTypes.STRING, allowNull: true },
    nit: { type: DataTypes.STRING },
    address: { type: DataTypes.STRING },
    phone: { type: DataTypes.STRING },
    contactEmail: { type: DataTypes.STRING, allowNull: true },
    // Nombre del gerente que autoriza las órdenes de compra (ver PDF, campo "Autorizó"). Un único
    // valor por empresa/tenant, editado desde Administración > Datos de la Empresa — no se toma de
    // los usuarios del sistema porque el gerente que firma no necesariamente tiene una cuenta ahí.
    managerName: { type: DataTypes.STRING, allowNull: true },
    // Factor prestacional (%) sugerido por defecto al agregar mano de obra a un APU.
    // Editable por ítem al momento de seleccionar el insumo de personal.
    defaultPrestacionalPercent: { type: DataTypes.DECIMAL(6, 2), allowNull: false, defaultValue: 85 },
    // Moneda en que se muestran los valores en toda la app (no convierte montos, solo cambia el
    // símbolo/formato de presentación); independiente del idioma de la interfaz.
    currency: { type: DataTypes.ENUM('COP', 'USD', 'EUR'), allowNull: false, defaultValue: 'COP' },
    // Controlado desde el panel de super-administrador: una empresa inactiva no puede iniciar
    // sesión (ver middleware/auth.js), pero sus datos no se tocan ni se borran.
    active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    // Esqueleto de planes (ver diseño multi-tenant): sin cobro ni bloqueo duro todavía. null en
    // maxUsers/maxActiveProjects significa "sin límite".
    planTier: { type: DataTypes.STRING, allowNull: false, defaultValue: 'estandar' },
    maxUsers: { type: DataTypes.INTEGER, allowNull: true },
    maxActiveProjects: { type: DataTypes.INTEGER, allowNull: true },
  });

  return Company;
};
