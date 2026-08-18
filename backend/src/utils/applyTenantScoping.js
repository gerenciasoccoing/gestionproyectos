const { getCurrentCompanyId } = require('./tenantContext');

// Agrega companyId a un `where` de Sequelize sin importar su forma (objeto plano, con
// operadores Op.and/Op.or a nivel raíz, o vacío/undefined) — un merge superficial es suficiente
// porque Sequelize combina con AND todas las claves de nivel raíz de un `where`, incluidas las
// claves-símbolo de Op.
function mergeCompanyWhere(where, companyId) {
  return { ...(where || {}), companyId };
}

// Aplica aislamiento multi-tenant automático a un modelo "de empresa": intercepta toda lectura
// (find/count/update masivo/destroy masivo) para exigir companyId = empresa de la petición
// actual, e intercepta toda creación para asignar ese companyId si no vino ya puesto. No requiere
// que cada controlador se acuerde de filtrar — el filtro vive acá, una sola vez.
//
// Debe llamarse en models/index.js para cada modelo de negocio (todos menos Permission, que es un
// catálogo global fijo, y Company, que ES la tabla de empresas).
//
// Fuera de este alcance quedan las consultas SQL crudas (sequelize.query(...)) — esas se auditan
// y se les agrega companyId a mano en cada caso; están documentadas en MULTI_TENANT_AUDIT.md.
function applyTenantScoping(model) {
  const requireCompanyId = () => {
    const companyId = getCurrentCompanyId();
    if (!companyId) {
      // Nunca debe pasar en una petición autenticada normal: si pasa, es preferible que la
      // consulta falle de forma ruidosa a que corra sin filtro de empresa por accidente.
      throw new Error(`Consulta a ${model.name} sin companyId en contexto (tenantContext no inicializado)`);
    }
    return companyId;
  };

  const scopeWhereOptions = (options) => {
    options.where = mergeCompanyWhere(options.where, requireCompanyId());
  };

  model.addHook('beforeFind', scopeWhereOptions);
  model.addHook('beforeCount', scopeWhereOptions);
  model.addHook('beforeBulkUpdate', scopeWhereOptions);
  model.addHook('beforeBulkDestroy', scopeWhereOptions);

  model.addHook('beforeCreate', (instance) => {
    if (!instance.companyId) instance.companyId = requireCompanyId();
  });
  model.addHook('beforeBulkCreate', (instances) => {
    const companyId = requireCompanyId();
    instances.forEach((instance) => {
      if (!instance.companyId) instance.companyId = companyId;
    });
  });
  model.addHook('beforeUpsert', (values) => {
    if (!values.companyId) values.companyId = requireCompanyId();
  });
}

module.exports = { applyTenantScoping, mergeCompanyWhere };
