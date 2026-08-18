const ApiError = require('../utils/ApiError');

// Lectura de documentos/imágenes con la API de Claude (Anthropic), con capacidad de visión.
// Genérico a propósito: cada tipo de documento (RUT, factura, contrato, póliza, ...) solo aporta
// instrucciones + forma del JSON esperado (ver aiDocumentExtractors.js); agregar un tipo nuevo no
// requiere tocar este archivo. Llamada directa por fetch (sin SDK), igual que la integración de
// LoroAPI ya existente en el proyecto.
const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_MODEL = process.env.ANTHROPIC_VISION_MODEL || 'claude-sonnet-4-5-20250929';

function isConfigured() {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

function buildPrompt(instructions, schemaDescription) {
  return `${instructions}\n\nDevuelve ÚNICAMENTE un objeto JSON válido con esta forma (sin texto adicional, sin bloque de markdown):\n${schemaDescription}\nSi un dato no aparece en el documento o no estás seguro, usa null. No inventes información.`;
}

const DEFAULT_MAX_TOKENS = 4000;

// Llamada compartida a la API de Mensajes de Claude: arma el request con el bloque de contenido
// que le pasen (imagen, documento PDF o texto plano) + el prompt, y parsea la respuesta como
// JSON. Usada tanto por extractStructuredData (imagen/PDF, vía visión) como por
// extractStructuredDataFromText (texto ya extraído de un archivo que Claude no lee nativamente
// como documento, ej. Excel) para no duplicar el manejo de errores ni el parseo de la respuesta.
// maxTokens es configurable por extractor (ver aiDocumentExtractors.js): un documento de un solo
// objeto (RUT, contrato) nunca se acerca al default, pero una lista de ítems de presupuesto
// larga sí puede necesitar mucho más espacio, o si no la respuesta se corta a mitad del JSON.
async function callClaude(contentBlock, instructions, schemaDescription, maxTokens = DEFAULT_MAX_TOKENS) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new ApiError(503, 'La lectura automática con IA no está configurada en el servidor (falta ANTHROPIC_API_KEY).');
  }

  const prompt = buildPrompt(instructions, schemaDescription);

  let res;
  try {
    res = await fetch(ANTHROPIC_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: ANTHROPIC_MODEL,
        max_tokens: maxTokens,
        messages: [{ role: 'user', content: [contentBlock, { type: 'text', text: prompt }] }],
      }),
    });
  } catch (err) {
    throw new ApiError(502, `No se pudo contactar al servicio de IA: ${err.message}`);
  }

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new ApiError(502, `El servicio de IA respondió con error ${res.status}${body ? `: ${body.slice(0, 300)}` : ''}`);
  }

  const data = await res.json();
  const text = data.content?.[0]?.text || '';

  // La causa más común de un JSON incompleto/inválido es que la respuesta se cortó porque el
  // documento tenía demasiado contenido (ej. un presupuesto con muchísimos ítems) para el
  // maxTokens configurado — Claude lo señala con stop_reason "max_tokens". Se detecta antes de
  // intentar parsear para dar un mensaje claro y accionable en vez del genérico "JSON inválido".
  if (data.stop_reason === 'max_tokens') {
    console.error(`[aiVisionService] Respuesta cortada por max_tokens (${maxTokens}). Texto recibido (primeros 500 caracteres): ${text.slice(0, 500)}`);
    throw new ApiError(502, 'El documento tiene demasiado contenido y la respuesta de la IA se cortó antes de terminar. Intenta con un archivo más corto, o divídelo en partes más pequeñas.');
  }

  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new ApiError(502, 'La IA no devolvió un resultado interpretable.');
  try {
    return JSON.parse(jsonMatch[0]);
  } catch {
    console.error(`[aiVisionService] No se pudo parsear como JSON. Texto recibido: ${text.slice(0, 2000)}`);
    throw new ApiError(502, 'La IA no devolvió un JSON válido.');
  }
}

async function extractStructuredData({ buffer, mimetype, instructions, schemaDescription, maxTokens }) {
  const contentBlock = mimetype === 'application/pdf'
    ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: buffer.toString('base64') } }
    : { type: 'image', source: { type: 'base64', media_type: mimetype, data: buffer.toString('base64') } };
  return callClaude(contentBlock, instructions, schemaDescription, maxTokens);
}

// Variante para contenido que Claude no puede leer como imagen/documento nativo (ej. una hoja de
// Excel ya convertida a texto plano/CSV por quien llama). Mismo prompt y mismo parseo de
// respuesta que extractStructuredData, solo cambia el tipo de bloque de contenido enviado.
async function extractStructuredDataFromText({ text, instructions, schemaDescription, maxTokens }) {
  return callClaude({ type: 'text', text }, instructions, schemaDescription, maxTokens);
}

module.exports = { extractStructuredData, extractStructuredDataFromText, isConfigured };
