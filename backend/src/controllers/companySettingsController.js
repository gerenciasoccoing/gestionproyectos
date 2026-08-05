const asyncHandler = require('../utils/asyncHandler');
const { CompanySettings } = require('../models');
const { relativePath, UPLOAD_ROOT } = require('../middleware/upload');
const path = require('path');

async function getOrCreateSettings() {
  const [settings] = await CompanySettings.findOrCreate({ where: {}, defaults: {} });
  return settings;
}

const get = asyncHandler(async (req, res) => {
  const settings = await getOrCreateSettings();
  res.json(settings);
});

const update = asyncHandler(async (req, res) => {
  const settings = await getOrCreateSettings();
  const { companyName, nit, address, phone, defaultPrestacionalPercent } = req.body;
  if (companyName !== undefined) settings.companyName = companyName;
  if (nit !== undefined) settings.nit = nit;
  if (address !== undefined) settings.address = address;
  if (phone !== undefined) settings.phone = phone;
  if (defaultPrestacionalPercent !== undefined) settings.defaultPrestacionalPercent = defaultPrestacionalPercent;
  if (req.file) settings.logoPath = relativePath(req.file);
  await settings.save();
  res.json(settings);
});

// Ruta absoluta del logo en disco, para incrustarlo en el PDF de cotización.
async function getSettingsForPdf() {
  const settings = await getOrCreateSettings();
  return {
    companyName: settings.companyName,
    nit: settings.nit,
    address: settings.address,
    phone: settings.phone,
    logoPath: settings.logoPath ? path.join(UPLOAD_ROOT, settings.logoPath) : null,
  };
}

module.exports = { get, update, getSettingsForPdf };
