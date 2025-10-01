import { z } from 'zod';

/**
 * Representa la estructura de un cliente para el formulario y la API.
 * Se ha añadido el campo `id` para rastrear el ID del socio desde la base de datos.
 */
export interface Client {
  id?: number; // ID del socio titular desde la base de datos
  tipo_documento: string;
  numero_documento: string;
  razon_social: string;
  nombre_comercial: string;
  direccion: string;
  ubigeo: string;
  distrito: string;
  provincia: string;
  departamento: string;
  telefono: string;
  email: string;
}

// Esquema de validación para los datos del cliente
const ClientSchema = z.object({
  tipo_documento: z.string().min(1, "Tipo de documento es requerido."),
  numero_documento: z.string().min(8, "Número de documento debe tener al menos 8 caracteres."),
  razon_social: z.string().min(3, "Razón social es requerida."),
  nombre_comercial: z.string().optional(),
  direccion: z.string().min(5, "Dirección es requerida."),
  ubigeo: z.string().optional(),
  distrito: z.string().optional(),
  provincia: z.string().optional(),
  departamento: z.string().optional(),
  telefono: z.string().optional(),
  email: z.string().email("Email inválido.").optional().or(z.literal('')),
});

// Esquema de validación para cada item de la boleta
const DetalleSchema = z.object({
  codigo: z.string().optional(),
  descripcion: z.string().min(1, "Descripción es requerida."),
  unidad: z.string().min(1, "Unidad es requerida."),
  cantidad: z.coerce.number().min(0.01, "Cantidad debe ser mayor a 0."),
  mto_valor_unitario: z.coerce.number().min(0, "Precio debe ser 0 o mayor."),
  porcentaje_igv: z.coerce.number().min(0),
  tip_afe_igv: z.string().min(1, "Tipo de afectación IGV es requerido."),
  codigo_producto_sunat: z.string().optional(),
});

// Esquema principal para validar todo el formulario de la boleta
export const BoletaPayloadSchema = z.object({
  serie: z.string(),
  fecha_emision: z.string(),
  moneda: z.string(),
  tipo_operacion: z.string(),
  metodo_envio: z.string(),
  forma_pago_tipo: z.string(),
  usuario_creacion: z.string(),
  client: ClientSchema,
  detalles: z.array(DetalleSchema).min(1, "Debe haber al menos un detalle."),
  company_id: z.number().optional(),
  branch_id: z.number().optional(),
});

// Tipo inferido para los valores del formulario de React Hook Form
export type BoletaFormValues = z.infer<typeof BoletaPayloadSchema>;

// Esquema para validar la respuesta de la API de emisión
export const IssueResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  data: z.object({
    id: z.number(),
    numero_completo: z.string(),
  }),
});
export type IssueResponse = z.infer<typeof IssueResponseSchema>;

// Tipo para el payload final que se envía a la API de facturación
export type BoletaPayload = BoletaFormValues & {
  company_id: number;
  branch_id: number;
  detalles: Array<z.infer<typeof DetalleSchema>>;
};

// Tipo para los items mostrados en el calendario de facturación
export interface InvoicingCalendarItem {
  id: number;
  type: 'Boleta' | 'Factura' | 'Nota Crédito';
  serie: string;
  clientName: string;
  amount: number;
  date: string;
  status: 'Aceptado' | 'Pendiente' | 'Rechazado';
}
