const jwt = require('jsonwebtoken');
const ApiError = require('../utils/ApiError');
const { User, Customer } = require('../models');

function signStaffToken(user) {
  return jwt.sign({ sub: user.id, type: 'staff', role: user.role, tenantId: user.tenantId }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '8h',
  });
}

function signCustomerToken(customer) {
  return jwt.sign({ sub: customer.id, type: 'customer', tenantId: customer.tenantId }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '8h',
  });
}

// Autentica usuarios de panel (super_admin / tenant_admin / tenant_operator).
async function authenticateStaff(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) throw new ApiError(401, 'Token no proporcionado');

    const payload = jwt.verify(token, process.env.JWT_SECRET);
    if (payload.type !== 'staff') throw new ApiError(401, 'Token inválido');

    const user = await User.findByPk(payload.sub);
    if (!user || !user.active) throw new ApiError(401, 'Usuario inválido o inactivo');

    req.staff = { id: user.id, name: user.name, email: user.email, role: user.role, tenantId: user.tenantId };
    next();
  } catch (err) {
    if (err instanceof ApiError) return next(err);
    next(new ApiError(401, 'Token inválido o expirado'));
  }
}

// Restringe una ruta de panel a ciertos roles (ej. solo tenant_admin puede tocar credenciales de pago).
function requireStaffRole(...roles) {
  return (req, res, next) => {
    if (!req.staff || !roles.includes(req.staff.role)) {
      return next(new ApiError(403, 'No tiene permisos para esta acción'));
    }
    next();
  };
}

// Las rutas de tenant_admin/tenant_operator siempre operan sobre el tenant del propio usuario;
// el super_admin no tiene tenantId y no puede usar estas rutas de gestión de tienda.
function requireTenantStaff(req, res, next) {
  if (!req.staff || !req.staff.tenantId) {
    return next(new ApiError(403, 'Esta acción requiere una cuenta de administración de tienda'));
  }
  next();
}

// Autentica un cliente final de la tienda (cuenta registrada). Requiere que el tenant ya
// haya sido resuelto por resolveTenant.
async function authenticateCustomer(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) throw new ApiError(401, 'Token no proporcionado');

    const payload = jwt.verify(token, process.env.JWT_SECRET);
    if (payload.type !== 'customer') throw new ApiError(401, 'Token inválido');

    const customer = await Customer.findByPk(payload.sub);
    if (!customer || !customer.active) throw new ApiError(401, 'Cuenta inválida o inactiva');
    if (!req.tenant || customer.tenantId !== req.tenant.id) throw new ApiError(401, 'Cuenta inválida para esta tienda');

    req.customer = { id: customer.id, name: customer.name, email: customer.email };
    next();
  } catch (err) {
    if (err instanceof ApiError) return next(err);
    next(new ApiError(401, 'Token inválido o expirado'));
  }
}

// Igual que authenticateCustomer pero permite continuar como invitado si no hay token
// (el checkout de invitado es válido según el flujo de e-commerce).
async function authenticateCustomerOptional(req, res, next) {
  const header = req.headers.authorization || '';
  if (!header.startsWith('Bearer ')) return next();
  return authenticateCustomer(req, res, next);
}

module.exports = {
  signStaffToken,
  signCustomerToken,
  authenticateStaff,
  requireStaffRole,
  requireTenantStaff,
  authenticateCustomer,
  authenticateCustomerOptional,
};
