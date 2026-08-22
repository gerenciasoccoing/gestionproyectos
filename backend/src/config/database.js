const { Sequelize } = require('sequelize');
require('dotenv').config();

// Conexión restringida (rol de app, sin ser dueño de las tablas — ver adminDatabase.js): la que
// atiende peticiones HTTP y queda sujeta a las políticas de Row-Level Security (Capa 2 del
// aislamiento multi-tenant, ver postSyncFixups.js#applyRowLevelSecurity).
const sequelize = new Sequelize(
  process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/gestionproyectos',
  {
    dialect: 'postgres',
    logging: false,
    // Sin esto, Sequelize usa su default (max: 5) — de sobra para pruebas locales, pero
    // middleware/auth.js mantiene UNA conexión ocupada durante TODA la duración de cada petición
    // autenticada (no solo mientras corre una query, ver comentario ahí), así que con tráfico real
    // (varios usuarios, o incluso un solo usuario cuya página dispara 3-5 peticiones en paralelo al
    // cargar) el pool se agota enseguida: SequelizeConnectionAcquireTimeoutError, que
    // middleware/auth.js hasta hace poco disfrazaba de "401 sesión expirada" (deslogueaba al
    // usuario sin dejar rastro real del problema). max: 15 da margen para ráfagas reales sin
    // arriesgar la memoria del servidor (cada conexión de Postgres es liviana). acquire baja de
    // 60s (el default) a 20s: si el pool igual se agota bajo carga extrema, mejor que el usuario
    // vea un error en 20s que se quede esperando un minuto entero.
    pool: { max: 15, min: 0, acquire: 20000, idle: 10000 },
  }
);

// Varios controladores/servicios abren su propia transacción local para operaciones atómicas de
// varios pasos (sequelize.transaction(async (t) => {...}), pasando esa `t` a mano en cada consulta
// de adentro) — y Sequelize mismo hace lo mismo puertas adentro en findOrCreate() cuando no se le
// pasa una transacción explícita (para que el find+create sea atómico), algo que se usa por todo
// el proyecto (Role.findOrCreate, User.findOrCreate, CashBox.findOrCreate, etc.). Ninguna de esas
// transacciones pasa por middleware/auth.js, así que su conexión no llevaría el GUC
// app.current_company_id seteado — sin él, la Capa 2 (RLS) las bloquearía en silencio ("new row
// violates row-level security policy"). Se intercepta acá, una sola vez, en vez de tocar cada
// lugar del código (y sin poder tocar el propio Sequelize): toda transacción nacida de esta
// conexión, manejada (con callback, como sequelize.transaction(async t => {...})) o no manejada
// (como sequelize.transaction() o sequelize.transaction(options), que es justo lo que usa
// findOrCreate), arranca fijando el GUC a la empresa de la petición actual.
const originalTransaction = sequelize.transaction.bind(sequelize);
sequelize.transaction = function transactionWithTenantContext(...args) {
  // eslint-disable-next-line global-require
  const { getCurrentCompanyId } = require('../utils/tenantContext');

  const setGuc = async (t) => {
    const companyId = getCurrentCompanyId();
    if (companyId) {
      await sequelize.query(
        "SELECT set_config('app.current_company_id', :companyId, true)",
        { transaction: t, replacements: { companyId } }
      );
    }
    return t;
  };

  const callback = args[args.length - 1];
  if (typeof callback === 'function') {
    // Forma manejada: hace commit/rollback sola cuando el callback termina.
    const options = args.slice(0, -1);
    return originalTransaction(...options, async (t) => {
      await setGuc(t);
      return callback(t);
    });
  }

  // Forma no manejada (con o sin options, ej. findOrCreate): quien llama recibe la transacción y
  // hace commit/rollback a mano — middleware/auth.js es uno de esos casos, pero ahí todavía no hay
  // companyId en el contexto (es justo lo que está por resolver), así que setGuc no hace nada y el
  // propio auth.js lo setea después con el valor correcto — no hay conflicto entre los dos.
  return originalTransaction(...args).then(setGuc);
};

module.exports = sequelize;
