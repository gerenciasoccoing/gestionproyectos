// Un extractor por tipo de documento: solo instrucciones de negocio + forma del JSON esperado.
// Los nombres de campo de "rut" e "invoice" coinciden a propósito con los que ya devuelven los
// motores de OCR local (rutScanService/invoiceScanService), para que el frontend no necesite
// ningún cambio al pasar de OCR local a lectura por IA. Agregar un documento nuevo (ej. una
// próxima "orden de pago") es agregar una entrada acá, nada más.
const EXTRACTORS = {
  rut: {
    instructions: 'Este documento es un RUT (Registro Único Tributario) colombiano de un proveedor o cliente. Extrae los datos de identificación básica.',
    schemaDescription: '{ "name": string|null, "nit": string|null, "email": string|null, "phone": string|null, "address": string|null }',
  },
  invoice: {
    instructions: 'Este documento es una factura de compra/gasto. Extrae los datos del proveedor y los totales.',
    schemaDescription: '{ "vendorName": string|null, "vendorNit": string|null, "vendorPhone": string|null, "vendorEmail": string|null, "date": "YYYY-MM-DD"|null, "subtotal": number|null, "taxAmount": number|null, "total": number|null, "items": [{ "description": string, "quantity": number, "unitPrice": number, "totalPrice": number }], "taxes": [{ "name": string, "rate": number|null, "amount": number }] }',
    // Igual que budgetItems: una factura con muchos ítems puede necesitar más espacio de
    // respuesta del que alcanza el default.
    maxTokens: 6000,
  },
  contract: {
    instructions: 'Este documento es un contrato de obra o de servicios. Extrae el objeto del contrato (descripción de su alcance) y sus datos clave.',
    schemaDescription: '{ "object": string|null, "value": number|null, "signedDate": "YYYY-MM-DD"|null, "endDate": "YYYY-MM-DD"|null }',
  },
  policy: {
    instructions: 'Este documento es una póliza de seguro asociada a un proyecto de construcción (ej. cumplimiento, responsabilidad civil, todo riesgo). Extrae su tipo y su vigencia.',
    schemaDescription: '{ "type": string|null, "value": number|null, "coverageStart": "YYYY-MM-DD"|null, "coverageEnd": "YYYY-MM-DD"|null }',
  },
  // Presupuesto de obra (lista de ítems), usado por "Avance por Ítem" para crear ítems SIN
  // vincularlos al catálogo APU. Puede recibir una imagen/PDF (vía visión) o texto ya extraído
  // de un Excel (ver budgetItemsScanService.js, que convierte la hoja a texto antes de llamar
  // acá porque Claude no lee .xlsx como documento nativo).
  budgetItems: {
    instructions: 'Este documento es un presupuesto de obra de construcción. Contiene una tabla con varios ítems (materiales, actividades, capítulos, etc). Extrae CADA fila de ítem como un elemento independiente del array, ignorando encabezados de columna, subtotales de capítulo y la fila de total general. Si el archivo no contiene una tabla de ítems de presupuesto reconocible, devuelve items como un array vacío.',
    schemaDescription: '{ "items": [ { "description": string, "unit": string|null, "quantity": number|null, "unitPrice": number|null, "totalPrice": number|null } ] }',
    // Una lista de ítems puede ser mucho más larga que los demás extractores (que devuelven un
    // solo objeto): un presupuesto real con decenas/cientos de renglones necesita mucho más
    // espacio de respuesta o se corta a mitad del JSON (ver el chequeo de stop_reason en
    // aiVisionService.callClaude).
    maxTokens: 8000,
  },
};

function getExtractor(key) {
  const extractor = EXTRACTORS[key];
  if (!extractor) throw new Error(`No existe un extractor de IA para "${key}"`);
  return extractor;
}

module.exports = { EXTRACTORS, getExtractor };
