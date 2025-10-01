// Variables de entorno para la API de facturación
const VITE_INVOICING_API_BASE_URL = import.meta.env.VITE_INVOICING_API_BASE_URL;
const VITE_INVOICING_API_AUTH_TOKEN = import.meta.env.VITE_INVOICING_API_AUTH_TOKEN;

// Validar que las variables de entorno críticas estén definidas
if (!VITE_INVOICING_API_BASE_URL) {
  throw new Error("La variable de entorno VITE_INVOICING_API_BASE_URL no está definida. Por favor, añádala a su archivo .env");
}
if (!VITE_INVOICING_API_AUTH_TOKEN) {
  throw new Error("La variable de entorno VITE_INVOICING_API_AUTH_TOKEN no está definida. Por favor, añádala a su archivo .env");
}

export const INVOICING_API_BASE_URL = VITE_INVOICING_API_BASE_URL;
export const INVOICING_API_AUTH_TOKEN = VITE_INVOICING_API_AUTH_TOKEN;

// Constantes de la empresa (según el body de ejemplo)
export const COMPANY_ID = 1;
export const BRANCH_ID = 1;
export const DEFAULT_SERIE_BOLETA = "B001";
export const DEFAULT_MONEDA = "PEN";
export const DEFAULT_TIPO_OPERACION = "0101"; // Venta Interna
export const DEFAULT_METODO_ENVIO = "resumen_diario";
export const DEFAULT_FORMA_PAGO = "Contado";

// Default Service Item Constants (Requerimiento del usuario)
export const DEFAULT_ITEM_CODE = "SERV";
export const DEFAULT_ITEM_DESCRIPTION = "Elaboracion de Expediente Tecnico";
export const DEFAULT_ITEM_UNIT = "ZZ"; // ZZ para servicios
// CRÍTICO: Este valor (250.00) se considera el PRECIO TOTAL (incluyendo IGV)
export const DEFAULT_ITEM_UNIT_VALUE = 250.00; 
export const DEFAULT_SUNAT_PRODUCT_CODE = '00001'; // Código de producto SUNAT fijo

// Tipos de Documento SUNAT (simplificado)
export const DOCUMENT_TYPES = [
  { value: '1', label: 'DNI (1)' },
  { value: '6', label: 'RUC (6)' },
  { value: '0', label: 'Otros (0)' },
];

// Tipos de Afectación IGV (simplificado)
export const IGV_AFFECTION_TYPES = [
  { value: '10', label: 'Gravado - Operación Onerosa (10)' },
  { value: '20', label: 'Exonerado - Operación Onerosa (20)' },
  { value: '30', label: 'Inafecto - Operación Onerosa (30)' },
];
