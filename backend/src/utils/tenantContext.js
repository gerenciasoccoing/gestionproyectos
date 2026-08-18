const { AsyncLocalStorage } = require('async_hooks');

// Lleva el companyId del usuario autenticado durante toda la duración de una petición HTTP, sin
// tener que pasarlo a mano por cada función/controlador. runWithCompany() se llama una sola vez,
// en el middleware de autenticación, envolviendo el resto del procesamiento de esa petición; todo
// lo que corra "dentro" (controladores, servicios, hooks de Sequelize) puede leer
// getCurrentCompanyId() en cualquier punto de esa misma cadena de ejecución asíncrona.
const storage = new AsyncLocalStorage();

function runWithCompany(companyId, fn) {
  return storage.run({ companyId }, fn);
}

function getCurrentCompanyId() {
  return storage.getStore()?.companyId || null;
}

module.exports = { runWithCompany, getCurrentCompanyId };
