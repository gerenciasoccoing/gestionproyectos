const asyncHandler = require('../utils/asyncHandler');
const { provisionCompany } = require('../services/companyProvisioningService');

// Alta de una empresa cliente nueva. Protegido por requirePlatformSecret (ver
// middleware/platformAdminAuth.js), no por el login normal — todavía no existe un panel de
// super-admin con sesión propia (Entrega 3), así que este es un gate interino con una clave de
// operador compartida por variable de entorno.
const createCompany = asyncHandler(async (req, res) => {
  const { companyName, nit, address, phone, contactEmail, adminName, adminEmail, adminPassword } = req.body;
  const { company, admin } = await provisionCompany({
    companyName, nit, address, phone, contactEmail, adminName, adminEmail, adminPassword,
  });
  res.status(201).json({
    company: { id: company.id, companyName: company.companyName },
    admin: { id: admin.id, email: admin.email },
  });
});

module.exports = { createCompany };
