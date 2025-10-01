import axios from 'axios';
import { INVOICING_API_BASE_URL, INVOICING_API_AUTH_TOKEN } from '../constants';
import { BoletaPayload, Client, InvoicingCalendarItem, IssueResponse, IssueResponseSchema } from '../types/invoicing';
import { supabase } from '../supabaseClient';

const invoicingApi = axios.create({
  baseURL: INVOICING_API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${INVOICING_API_AUTH_TOKEN}`,
  },
});

/**
 * Emite una Boleta de Venta Electrónica.
 */
export const issueBoleta = async (boletaData: BoletaPayload): Promise<IssueResponse> => {
  try {
    const response = await invoicingApi.post('/boletas', boletaData);
    const validatedResponse = IssueResponseSchema.parse(response.data);
    return validatedResponse;
  } catch (error) {
    if (axios.isAxiosError(error) && error.response) {
      console.error("Error al emitir boleta:", error.response.data);
      const apiMessage = error.response.data.message || JSON.stringify(error.response.data);
      throw new Error(`Error de la API de facturación: ${apiMessage}`);
    }
    if (error instanceof Error) {
        throw new Error(`Error al procesar la respuesta o de red: ${error.message}`);
    }
    throw new Error('Error desconocido al emitir la boleta.');
  }
};

/**
 * Genera el PDF de una Boleta de Venta Electrónica.
 */
export const generateBoletaPdf = async (boletaId: number, format: 'A4' | 'TICKET' = 'A4'): Promise<void> => {
  try {
    await invoicingApi.post(`/boletas/${boletaId}/generate-pdf`, { format });
  } catch (error) {
    if (axios.isAxiosError(error) && error.response) {
      console.error("Error al generar PDF de boleta:", error.response.data);
      const apiMessage = error.response.data.message || JSON.stringify(error.response.data);
      throw new Error(`Error de la API al generar PDF: ${apiMessage}`);
    }
    throw new Error('Error desconocido al solicitar la generación del PDF.');
  }
};

/**
 * Descarga el PDF de una Boleta y lo sube a Supabase Storage.
 * @param boletaId El ID interno de la boleta.
 * @param serieCorrelativo La serie y correlativo para nombrar el archivo (e.g., B001-1234).
 * @param socioId El ID del socio titular para la ruta de almacenamiento.
 * @param format Formato del PDF (e.g., 'A4').
 */
export const downloadBoletaPdf = async (boletaId: number, serieCorrelativo: string, socioId: number, format: 'A4' | 'TICKET' = 'A4'): Promise<void> => {
  try {
    // 1. Obtener el PDF como blob desde la API de facturación
    const response = await invoicingApi.get(`/boletas/${boletaId}/download-pdf`, {
      params: { format },
      responseType: 'blob',
    });

    const pdfBlob = response.data;
    const fileName = `${serieCorrelativo}.pdf`;

    // 2. Subir el archivo a Supabase Storage
    const filePath = `${socioId}/${fileName}`;
    const pdfFile = new File([pdfBlob], fileName, { type: 'application/pdf' });

    const { error: uploadError } = await supabase.storage
      .from('comprobante-de-pago')
      .upload(filePath, pdfFile, {
        cacheControl: '3600',
        upsert: true, // Sobrescribir si ya existe
      });

    if (uploadError) {
      console.error("Error al subir el comprobante a Supabase Storage:", uploadError);
      throw new Error(`Error al guardar en Storage: ${uploadError.message}`);
    }

    // 3. Disparar la descarga en el navegador del cliente (comportamiento original)
    const url = window.URL.createObjectURL(pdfBlob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', fileName);
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);

  } catch (error) {
    if (axios.isAxiosError(error) && error.response) {
      console.error("Error al descargar PDF de boleta:", error.response.data);
      throw new Error(`Error de la API al descargar PDF. Código: ${error.response.status}`);
    }
    // Re-lanzar el error (puede ser el de Supabase o uno desconocido)
    throw error;
  }
};

/**
 * Busca datos de un cliente por su DNI en la tabla `socio_titulares`.
 * @param docNumber Número de documento del cliente (DNI).
 * @returns Datos del cliente (incluyendo id) o null si no se encuentra.
 */
export const fetchClientByDocument = async (docNumber: string): Promise<Client | null> => {
  if (!docNumber || docNumber.length < 8) {
    return null;
  }
  
  try {
    const { data: socioData, error } = await supabase
      .from('socio_titulares')
      .select('id, dni, nombres, apellidoPaterno, apellidoMaterno, direccionDNI, direccionVivienda, distritoDNI, distritoVivienda, provinciaDNI, provinciaVivienda, regionDNI, regionVivienda, celular')
      .eq('dni', docNumber)
      .single();

    if (error && error.code !== 'PGRST116') { // PGRST116 = No rows found
      console.error("Error al buscar socio en Supabase:", error);
      throw new Error(`Error de base de datos: ${error.message}`);
    }

    if (!socioData) {
      return null;
    }

    const clientData: Client = {
      id: socioData.id, // <-- ID del socio añadido
      tipo_documento: '1',
      numero_documento: socioData.dni,
      razon_social: `${socioData.nombres} ${socioData.apellidoPaterno} ${socioData.apellidoMaterno}`.trim(),
      nombre_comercial: `${socioData.nombres} ${socioData.apellidoPaterno}`.trim(),
      direccion: socioData.direccionDNI || socioData.direccionVivienda || '',
      ubigeo: '', // Se establece en blanco porque no existe en la BD
      distrito: socioData.distritoDNI || socioData.distritoVivienda || '',
      provincia: socioData.provinciaDNI || socioData.provinciaVivienda || '',
      departamento: socioData.regionDNI || socioData.regionVivienda || '',
      telefono: socioData.celular || '',
      email: '',
    };

    return clientData;

  } catch (error) {
    console.error("Error general al buscar cliente en Supabase:", error);
    if (error instanceof Error) {
        throw new Error(`Error de base de datos: ${error.message}`);
    }
    throw new Error('Error al buscar cliente en la base de datos interna.');
  }
};

/**
 * Simula la obtención de las últimas facturas/boletas para el calendario.
 */
export const fetchRecentInvoices = async (): Promise<InvoicingCalendarItem[]> => {
  await new Promise(resolve => setTimeout(resolve, 500));
  return [
    { id: 101, type: 'Boleta', serie: 'B001-1234', clientName: 'Juan Pérez', amount: 150.00, date: '2025-07-28', status: 'Aceptado' },
    { id: 102, type: 'Factura', serie: 'F001-5678', clientName: 'Tech Solutions SAC', amount: 4500.50, date: '2025-07-27', status: 'Aceptado' },
    { id: 103, type: 'Nota Crédito', serie: 'NC01-0012', clientName: 'María Sánchez', amount: -50.00, date: '2025-07-27', status: 'Aceptado' },
    { id: 104, type: 'Boleta', serie: 'B001-1235', clientName: 'Cliente Anónimo', amount: 85.90, date: '2025-07-26', status: 'Pendiente' },
    { id: 105, type: 'Factura', serie: 'F001-5679', clientName: 'Global Corp S.A.', amount: 12000.00, date: '2025-07-25', status: 'Rechazado' },
    { id: 106, type: 'Boleta', serie: 'B001-1236', clientName: 'Pedro Gómez', amount: 25.00, date: '2025-07-25', status: 'Aceptado' },
  ];
};
