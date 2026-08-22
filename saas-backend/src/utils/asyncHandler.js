// Envuelve controladores async para propagar errores a next() sin try/catch repetido.
module.exports = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
