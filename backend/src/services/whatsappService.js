// Integración con LoroAPI (WhatsApp) para el envío de reportes de Salida/Entrada de Inventario.
// Credenciales por variables de entorno (LOROAPI_BASE_URL, LOROAPI_API_KEY) — nunca se guardan en
// la base de datos. Si no están configuradas, sendWhatsAppMessage devuelve un fallo explicado en
// vez de lanzar, para que el controlador siempre pueda responder { ok, error } al frontend.
const LOROAPI_BASE_URL = (process.env.LOROAPI_BASE_URL || 'https://loroapi.com/api/v1').replace(/\/$/, '');
const LOROAPI_API_KEY = process.env.LOROAPI_API_KEY || '';

async function sendWhatsAppMessage(numero, texto) {
  if (!numero || !String(numero).trim()) {
    return { ok: false, error: 'Debe indicar un número de WhatsApp destino (con código de país).' };
  }
  if (!LOROAPI_API_KEY) {
    return { ok: false, error: 'La integración de WhatsApp (LoroAPI) no está configurada en el servidor (falta LOROAPI_API_KEY).' };
  }
  try {
    const resp = await fetch(`${LOROAPI_BASE_URL}/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': LOROAPI_API_KEY },
      body: JSON.stringify({ number: numero, type: 'text', text: texto }),
    });
    if (!resp.ok) {
      const body = await resp.text().catch(() => '');
      return { ok: false, error: `LoroAPI respondió con error ${resp.status}${body ? `: ${body.slice(0, 300)}` : ''}` };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: `No se pudo conectar con LoroAPI: ${err.message}` };
  }
}

function formatDateTime(date) {
  if (!date) return '-';
  return new Date(date).toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' });
}

const CONDITION_LABEL = { bueno: 'Bueno', dañado: 'Dañado', incompleto: 'Incompleto' };
const STATUS_LABEL = { disponible: 'Disponible', mantenimiento: 'En mantenimiento', baja: 'Dado de baja' };

// items: [{ name, code, quantity }]
function buildSalidaReportText({ items, destino, responsable, autorizadoPor, fecha, notes, confirmUrl }) {
  const lines = items.map((it) => `• ${it.name} (${it.code}) x${Number(it.quantity)}`);
  return [
    '*Reporte de Salida de Inventario*',
    `Destino: ${destino}`,
    `Responsable: ${responsable}`,
    `Autorizó/entregó: ${autorizadoPor}`,
    `Fecha: ${formatDateTime(fecha)}`,
    '',
    'Equipos:',
    ...lines,
    notes ? `\nNotas: ${notes}` : '',
    confirmUrl ? `\nPor favor confirma la recepción del equipo aquí:\n${confirmUrl}` : '',
  ].filter((l) => l !== '').join('\n');
}

// items: [{ name, code, quantity, condition, resultingStatus }]
function buildEntradaReportText({ items, destino, responsable, recibidoPor, fecha, confirmUrl }) {
  const lines = items.map(
    (it) => `• ${it.name} (${it.code}) x${Number(it.quantity)} — estado: ${CONDITION_LABEL[it.condition] || it.condition}, queda: ${STATUS_LABEL[it.resultingStatus] || it.resultingStatus}`
  );
  return [
    '*Reporte de Entrada (Devolución) de Inventario*',
    `Salida original: ${destino} — ${responsable}`,
    `Recibió: ${recibidoPor}`,
    `Fecha: ${formatDateTime(fecha)}`,
    '',
    'Equipos devueltos:',
    ...lines,
    confirmUrl ? `\nPor favor confirma la devolución del equipo aquí:\n${confirmUrl}` : '',
  ].filter((l) => l !== '').join('\n');
}

module.exports = { sendWhatsAppMessage, buildSalidaReportText, buildEntradaReportText };
