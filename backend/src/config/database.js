const { Sequelize } = require('sequelize');
require('dotenv').config();

const sequelize = new Sequelize(
  process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/gestionproyectos',
  {
    dialect: 'postgres',
    logging: false,
  }
);

module.exports = sequelize;
