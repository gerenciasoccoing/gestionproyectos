// Catálogo de módulos y acciones disponibles para el RBAC.
// Se usa tanto para sembrar la tabla Permission como para validar en el middleware de autorización.

const MODULES = [
  'admin',
  'proyectos',
  'contractual',
  'ejecucion',
  'ordenes_compra',
  'personal',
  'gastos',
  'informes',
  'cotizaciones',
];

const ACTIONS = ['view', 'create', 'edit', 'delete'];

// Matriz de permisos por defecto para los roles iniciales del sistema.
// admin: acceso total. Los demás roles se pueden ajustar luego desde el módulo de administración.
const DEFAULT_ROLE_PERMISSIONS = {
  admin: MODULES.flatMap((m) => ACTIONS.map((a) => `${m}:${a}`)),
  gerente_proyecto: MODULES.flatMap((m) => ACTIONS.map((a) => `${m}:${a}`)).filter(
    (p) => !p.startsWith('admin:')
  ),
  residente_obra: [
    'proyectos:view',
    'contractual:view',
    'ejecucion:view',
    'ejecucion:create',
    'ejecucion:edit',
    'ordenes_compra:view',
    'ordenes_compra:create',
    'ordenes_compra:edit',
    'personal:view',
    'gastos:view',
    'gastos:create',
    'informes:view',
  ],
  financiero: [
    'proyectos:view',
    'contractual:view',
    'ejecucion:view',
    'ordenes_compra:view',
    'personal:view',
    'personal:create',
    'personal:edit',
    'gastos:view',
    'gastos:create',
    'gastos:edit',
    'informes:view',
    'cotizaciones:view',
  ],
  comercial: [
    'proyectos:view',
    'cotizaciones:view',
    'cotizaciones:create',
    'cotizaciones:edit',
    'informes:view',
  ],
};

module.exports = { MODULES, ACTIONS, DEFAULT_ROLE_PERMISSIONS };
