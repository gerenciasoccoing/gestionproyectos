// Catálogo de módulos y acciones disponibles para el RBAC.
// Se usa tanto para sembrar la tabla Permission como para validar en el middleware de autorización.

const MODULES = [
  'admin',
  'proyectos',
  'contractual',
  'ejecucion',
  'ordenes_compra',
  'estudio_mercado',
  'personal',
  'gastos',
  'informes',
  'cotizaciones',
  'terceros',
  'inventario',
  // Inventario de Materiales (bodegas/lotes/traslados/salidas/devoluciones) — módulo aparte de
  // 'inventario' (que sigue siendo solo Equipos y Herramientas, sin cambios). 'bodegas' administra
  // el catálogo de bodegas; 'traslados_material' cubre registrar Y confirmar/rechazar un traslado
  // (create=registrar, edit=confirmar/rechazar — mismo criterio que 'ordenes_compra', una sola
  // acción 'edit' para "modificar el estado"); 'salidas_material'/'devoluciones_material' solo
  // necesitan view/create en la práctica pero se dan los 4 verbos estándar por consistencia con el
  // resto de MODULES (ver ACTIONS más abajo).
  'inventario_materiales',
  'bodegas',
  'traslados_material',
  'salidas_material',
  'devoluciones_material',
  'cajas',
  'entrega_final',
  // Gasto Administrativo General (crear/editar gastos sin proyecto y ver su reporte) — módulo
  // aparte de 'gastos' porque el cliente pidió que sea configurable con roles propios, distintos de
  // quién puede registrar gastos de proyecto. Al estar en MODULES, admin y gerente_proyecto lo
  // reciben automáticamente (ver DEFAULT_ROLE_PERMISSIONS.admin/gerente_proyecto abajo) — el resto
  // de roles NO lo tiene por defecto (ninguno lo lista a mano más abajo), cumpliendo exactamente
  // "por defecto: Administrador y Gerente" sin impedir que se le dé a otro rol después desde
  // Administración > Roles.
  'gastos_admin',
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
    'terceros:view',
    'inventario:view',
    'inventario:create',
    'inventario:edit',
    'inventario_materiales:view',
    'bodegas:view',
    'traslados_material:view',
    'traslados_material:create',
    'traslados_material:edit',
    'salidas_material:view',
    'salidas_material:create',
    'devoluciones_material:view',
    'devoluciones_material:create',
    'cajas:view',
    'entrega_final:view',
    'entrega_final:create',
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
    'terceros:view',
    'cajas:view',
    'cajas:create',
    'cajas:edit',
    'inventario_materiales:view',
    'bodegas:view',
    'entrega_final:view',
    'entrega_final:create',
    'entrega_final:edit',
  ],
  comercial: [
    'proyectos:view',
    'cotizaciones:view',
    'cotizaciones:create',
    'cotizaciones:edit',
    'informes:view',
    'terceros:view',
    'terceros:create',
    'terceros:edit',
  ],
};

module.exports = { MODULES, ACTIONS, DEFAULT_ROLE_PERMISSIONS };
