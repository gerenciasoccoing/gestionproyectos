const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
// Endpoint público (sin sesión): CompanyRegistrationRequest está excluido del aislamiento
// multi-tenant (no pertenece a ninguna empresa todavía) y User se busca por correo en toda la
// plataforma — mismo motivo que login/forgot-password, se usa la conexión de administración.
const { CompanyRegistrationRequest, User: AdminUser } = require('../models/adminModels');
const { sendCompanyRequestNotification } = require('../services/emailService');

function frontendUrl(path) {
  const base = (process.env.FRONTEND_PUBLIC_URL || 'http://localhost:5173').replace(/\/$/, '');
  return `${base}${path}`;
}

// Alta de una solicitud de registro de empresa: queda "pending" hasta que un operador de
// plataforma la apruebe o rechace (ver platformAdminController). No crea Company ni User todavía
// — por eso ese correo no sirve para iniciar sesión mientras la solicitud esté pendiente, sin
// necesidad de ningún chequeo adicional en el login.
const create = asyncHandler(async (req, res) => {
  const { companyName, nit, contactName, contactEmail, phone } = req.body;
  if (!companyName || !contactName || !contactEmail) {
    throw new ApiError(400, 'companyName, contactName y contactEmail son obligatorios');
  }

  const existingUser = await AdminUser.findOne({ where: { email: contactEmail }, hooks: false });
  if (existingUser) {
    throw new ApiError(409, 'Ya existe una cuenta con ese correo en la plataforma. Si es tuya, inicia sesión o recupera tu contraseña.');
  }
  const existingPending = await CompanyRegistrationRequest.findOne({ where: { contactEmail, status: 'pending' } });
  if (existingPending) {
    throw new ApiError(409, 'Ya hay una solicitud pendiente con ese correo. Te avisaremos apenas la revisemos.');
  }

  const request = await CompanyRegistrationRequest.create({ companyName, nit, contactName, contactEmail, phone });

  const notifyTo = process.env.PLATFORM_ADMIN_NOTIFICATION_EMAIL;
  if (notifyTo) {
    await sendCompanyRequestNotification({
      to: notifyTo,
      companyName, nit, contactName, contactEmail, phone,
      reviewUrl: frontendUrl('/platform-admin'),
    });
  }

  res.status(201).json({ message: 'Solicitud enviada. Te avisaremos por correo en cuanto sea revisada.' });
});

module.exports = { create };
