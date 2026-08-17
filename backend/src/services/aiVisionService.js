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

async function extractStructuredData({ buffer, mimetype, instructions, schemaDescription }) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new ApiError(503, 'La lectura automática con IA no está configurada en el servidor (falta ANTHROPIC_API_KEY).');
  }

  const contentBlock = mimetype === 'application/pdf'
    ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: buffer.toString('base64') } }
    : { type: 'image', source: { type: 'base64', media_type: mimetype, data: buffer.toString('base64') } };

  const prompt = `${instructions}\n\nDevuelve ÚNICAMENTE un objeto JSON válido con esta forma (sin texto adicional, sin bloque de markdown):\n${schemaDescription}\nSi un dato no aparece en el documento o no estás seguro, usa null. No inventes información.`;

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
        max_tokens: 1500,
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
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new ApiError(502, 'La IA no devolvió un resultado interpretable.');
  try {
    return JSON.parse(jsonMatch[0]);
  } catch {
    throw new ApiError(502, 'La IA no devolvió un JSON válido.');
  }
}

module.exports = { extractStructuredData, isConfigured };
