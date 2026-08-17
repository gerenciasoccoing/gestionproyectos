// Banco de frases motivacionales del dashboard. Cada arreglo es la SECUENCIA de rotación diaria
// para un grupo de roles; el texto real de cada frase vive en i18n (namespace "motivational",
// mismas claves) para tener versión ES/EN. Editar la rotación o agregar frases nuevas: agrega la
// clave aquí y su traducción en frontend/src/i18n/locales/es.json y en.json bajo
// motivational.admin_lideres.<clave> / motivational.empleados.<clave>.
export const ADMIN_LIDERES_KEYS = [
  'liderazgo1', 'liderazgo2', 'liderazgo3', 'liderazgo4', 'liderazgo5', 'liderazgo6', 'liderazgo7',
];

export const EMPLEADOS_KEYS = [
  'equipo1', 'equipo2', 'equipo3', 'equipo4', 'equipo5', 'equipo6', 'equipo7',
];

// Roles que cuentan como "administrador/líderes" para efectos del mensaje motivacional (el resto
// de roles cae en el grupo "empleados"). Ajustar esta lista si se crean más roles de liderazgo.
const LEADERSHIP_ROLES = ['admin', 'gerente_proyecto'];

export function getMotivationalGroup(user) {
  const roles = user?.roles || [];
  return roles.some((r) => LEADERSHIP_ROLES.includes(r)) ? 'admin_lideres' : 'empleados';
}

// Día calendario estable (independiente de zona horaria/horario de verano) para rotar la frase:
// cambia una vez por día calendario local y avanza de a uno, así nunca se repite en días seguidos
// (solo vuelve a aparecer la misma frase tras completar la vuelta al arreglo).
function localDayIndex() {
  const now = new Date();
  return Math.floor(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) / 86400000);
}

export function getDailyMessageKey(group) {
  const keys = group === 'admin_lideres' ? ADMIN_LIDERES_KEYS : EMPLEADOS_KEYS;
  return keys[localDayIndex() % keys.length];
}
