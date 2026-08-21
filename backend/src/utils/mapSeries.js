// Reemplazo de `Promise.all(items.map(async (x) => ...))` cuando el cuerpo hace consultas
// Sequelize: dentro de una petición HTTP autenticada, TODAS las consultas comparten la misma
// transacción/conexión (ver middleware/auth.js, necesario para que el GUC de RLS quede seteado en
// la conexión correcta). PostgreSQL/pg procesan una sola consulta a la vez por conexión, así que
// lanzar varias en paralelo sobre esa misma conexión no las acelera — dispara el warning
// "Calling client.query() when the client is already executing a query is deprecated" y, bajo
// carga real, puede devolver resultados incompletos o tumbar la petición. mapSeries corre el mismo
// trabajo, pero una consulta a la vez, en el mismo orden que Promise.all hubiera devuelto.
async function mapSeries(items, fn) {
  const results = [];
  for (let i = 0; i < items.length; i++) {
    // eslint-disable-next-line no-await-in-loop
    results.push(await fn(items[i], i));
  }
  return results;
}

module.exports = { mapSeries };
