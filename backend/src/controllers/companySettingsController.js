const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const { Company } = require('../models');
const { getCurrentCompanyId } = require('../utils/tenantContext');
const { relativePath, UPLOAD_ROOT } = require('../middleware/upload');
const path = require('path');

// La empresa (tenant) de la petición actual ya existe siempre — se crea al dar de alta la
// empresa, no aquí — así que esto es un simple findByPk, no un findOrCreate con un "where" vacío
// como en la época de fila única global.
async function getCompany() {
  const company = await Company.findByPk(getCurrentCompanyId());
  if (!company) throw new ApiError(404, 'Empresa no encontrada');
  return company;
}

const get = asyncHandler(async (req, res) => {
  const settings = await getCompany();
  res.json(settings);
});

const CURRENCIES = ['COP', 'USD', 'EUR'];

const update = asyncHandler(async (req, res) => {
  const settings = await getCompany();
  const { companyName, nit, address, phone, defaultPrestacionalPercent, currency } = req.body;
  if (companyName !== undefined) settings.companyName = companyName;
  if (nit !== undefined) settings.nit = nit;
  if (address !== undefined) settings.address = address;
  if (phone !== undefined) settings.phone = phone;
  if (defaultPrestacionalPercent !== undefined) settings.defaultPrestacionalPercent = defaultPrestacionalPercent;
  if (currency !== undefined) {
    if (!CURRENCIES.includes(currency)) throw new ApiError(400, `currency debe ser una de: ${CURRENCIES.join(', ')}`);
    settings.currency = currency;
  }
  if (req.file) settings.logoPath = relativePath(req.file);
  await settings.save();
  res.json(settings);
});

// Ruta absoluta del logo en disco, para incrustarlo en el PDF de cotización.
async function getSettingsForPdf() {
  const settings = await getCompany();
  return {
    companyName: settings.companyName,
    nit: settings.nit,
    address: settings.address,
    phone: settings.phone,
    logoPath: settings.logoPath ? path.join(UPLOAD_ROOT, settings.logoPath) : null,
  };
}

module.exports = { get, update, getSettingsForPdf };
