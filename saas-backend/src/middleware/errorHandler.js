const { ValidationError } = require('sequelize');
const ApiError = require('../utils/ApiError');

module.exports = function errorHandler(err, req, res, next) { // eslint-disable-line no-unused-vars
  if (err instanceof ValidationError) {
    return res.status(400).json({
      message: 'Error de validación',
      details: err.errors.map((e) => ({ field: e.path, message: e.message })),
    });
  }

  const statusCode = err instanceof ApiError ? err.statusCode : err.statusCode || 500;
  const message = err.message || 'Error interno del servidor';

  if (statusCode >= 500) {
    console.error(err);
  }

  res.status(statusCode).json({ message, details: err.details });
};
