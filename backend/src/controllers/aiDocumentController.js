const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const { extractStructuredData } = require('../services/aiVisionService');
const { getExtractor } = require('../config/aiDocumentExtractors');

// Handler genérico reusable: cada ruta de "escanear documento" solo indica qué extractor usar.
// Nunca guarda nada — solo lee el archivo temporal en memoria y devuelve los datos sugeridos
// para que el usuario los revise/corrija en el formulario antes de guardar.
function scanDocument(extractorKey) {
  return asyncHandler(async (req, res) => {
    if (!req.file) throw new ApiError(400, 'Debe adjuntar un archivo PDF o imagen (jpg, png, webp)');
    const extractor = getExtractor(extractorKey);
    const result = await extractStructuredData({
      buffer: req.file.buffer,
      mimetype: req.file.mimetype,
      instructions: extractor.instructions,
      schemaDescription: extractor.schemaDescription,
      maxTokens: extractor.maxTokens,
    });
    res.json(result);
  });
}

module.exports = { scanDocument };
