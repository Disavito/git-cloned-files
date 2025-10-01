import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PlusCircle, Trash2, Loader2, Send, Search, CalendarIcon, FileText, RotateCcw } from 'lucide-react';
import { BoletaFormValues, BoletaPayloadSchema, Client } from '@/lib/types/invoicing';
import { issueBoleta, fetchClientByDocument, generateBoletaPdf, downloadBoletaPdf } from '@/lib/api/invoicingApi';
import { useToast } from '@/components/ui/use-toast';
import { 
  COMPANY_ID, 
  BRANCH_ID, 
  DEFAULT_SERIE_BOLETA, 
  DEFAULT_MONEDA, 
  DEFAULT_TIPO_OPERACION, 
  DEFAULT_METODO_ENVIO, 
  DEFAULT_FORMA_PAGO, 
  DOCUMENT_TYPES, 
  IGV_AFFECTION_TYPES,
  DEFAULT_ITEM_CODE,
  DEFAULT_ITEM_DESCRIPTION,
  DEFAULT_ITEM_UNIT,
  DEFAULT_ITEM_UNIT_VALUE,
  DEFAULT_SUNAT_PRODUCT_CODE
} from '@/lib/constants';
import { useState, useCallback } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { cn } from '@/lib/utils';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';

const getTodayDate = () => new Date().toISOString().split('T')[0];

const calculateBaseValue = (totalPrice: number, igvPercentage: number): number => {
  if (igvPercentage === 0) return totalPrice;
  const igvRate = igvPercentage / 100;
  const baseValue = totalPrice / (1 + igvRate);
  return parseFloat(baseValue.toFixed(2));
};

const DEFAULT_IGV_PERCENTAGE = 18;

interface LastIssuedBoleta {
  id: number;
  numero_completo: string;
}

const defaultClient: Client = {
  tipo_documento: '1',
  numero_documento: '',
  razon_social: '',
  nombre_comercial: '',
  direccion: '',
  ubigeo: '',
  distrito: '',
  provincia: '',
  departamento: '',
  telefono: '',
  email: '',
};

const defaultValues: BoletaFormValues = {
  serie: DEFAULT_SERIE_BOLETA,
  fecha_emision: getTodayDate(),
  moneda: DEFAULT_MONEDA,
  tipo_operacion: DEFAULT_TIPO_OPERACION,
  metodo_envio: DEFAULT_METODO_ENVIO,
  forma_pago_tipo: DEFAULT_FORMA_PAGO,
  usuario_creacion: 'admin_user',
  client: defaultClient,
  detalles: [
    {
      codigo: DEFAULT_ITEM_CODE,
      descripcion: DEFAULT_ITEM_DESCRIPTION,
      unidad: DEFAULT_ITEM_UNIT,
      cantidad: 1,
      mto_valor_unitario: DEFAULT_ITEM_UNIT_VALUE, 
      porcentaje_igv: DEFAULT_IGV_PERCENTAGE,
      tip_afe_igv: '10',
      codigo_producto_sunat: DEFAULT_SUNAT_PRODUCT_CODE,
    },
  ],
};

const BoletaForm = () => {
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isClientSearching, setIsClientSearching] = useState(false);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [lastIssuedBoleta, setLastIssuedBoleta] = useState<LastIssuedBoleta | null>(null);
  const [currentSocioId, setCurrentSocioId] = useState<number | null>(null);


  const form = useForm<BoletaFormValues>({
    resolver: zodResolver(BoletaPayloadSchema.omit({ company_id: true, branch_id: true })),
    defaultValues,
    mode: 'onChange',
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: 'detalles',
  });

  const handleGeneratePdf = useCallback(async (boletaId: number) => {
    setIsGeneratingPdf(true);
    try {
      await generateBoletaPdf(boletaId, 'A4');
      toast({
        title: "Generación de PDF Solicitada",
        description: "El PDF se está generando. Podrá descargarlo en breve.",
        variant: "success",
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Error al solicitar la generación del PDF.";
      toast({
        title: "Error de PDF",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setIsGeneratingPdf(false);
    }
  }, [toast]);

  const handleDownloadPdf = async () => {
    if (!lastIssuedBoleta) {
      toast({ title: "Error", description: "No hay una boleta emitida para descargar.", variant: "destructive" });
      return;
    }
    if (!currentSocioId) {
      toast({ title: "Error", description: "No se ha identificado un socio para asociar el comprobante.", variant: "destructive" });
      return;
    }
    
    try {
      await downloadBoletaPdf(lastIssuedBoleta.id, lastIssuedBoleta.numero_completo, currentSocioId, 'A4');
      
      toast({
        title: "Descarga Iniciada y Guardada",
        description: `Descargando ${lastIssuedBoleta.numero_completo}.pdf y guardado en el repositorio del socio.`,
        variant: "success",
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Error al descargar o guardar el PDF.";
      toast({
        title: "Error de Descarga/Guardado",
        description: errorMessage,
        variant: "destructive",
      });
    }
  };

  const onSubmit = async (data: BoletaFormValues) => {
    setIsSubmitting(true);
    setLastIssuedBoleta(null);
    
    const processedDetails = data.detalles.map(d => {
      const total_price = Number(d.mto_valor_unitario);
      const igv_percent = Number(d.porcentaje_igv);
      const base_value = calculateBaseValue(total_price, igv_percent);

      return {
        ...d,
        cantidad: Number(d.cantidad),
        mto_valor_unitario: base_value, 
        porcentaje_igv: igv_percent,
      };
    });

    const payload = {
      ...data,
      company_id: COMPANY_ID,
      branch_id: BRANCH_ID,
      detalles: processedDetails,
    };

    try {
      const result = await issueBoleta(payload);
      const boletaId = result.data.id;
      const numeroCompleto = result.data.numero_completo;
      
      setLastIssuedBoleta({ id: boletaId, numero_completo: numeroCompleto });
      await handleGeneratePdf(boletaId);
      
      toast({
        title: "Boleta Emitida con Éxito",
        description: `Documento ${numeroCompleto} procesado y enviado a SUNAT.`,
        variant: "success",
      });
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Ocurrió un error inesperado.";
      toast({
        title: "Error de Emisión",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClientSearch = useCallback(async (e: React.FocusEvent<HTMLInputElement>) => {
    const docNumber = e.target.value.trim();
    const docType = form.getValues('client.tipo_documento');
    setCurrentSocioId(null); // Limpiar ID anterior en cada búsqueda

    if (docType !== '1' || docNumber.length < 8) {
      return;
    }

    setIsClientSearching(true);
    try {
      const clientData = await fetchClientByDocument(docNumber);

      if (clientData) {
        setCurrentSocioId(clientData.id || null); // Guardar el ID del socio
        form.setValue('client.razon_social', clientData.razon_social || '', { shouldValidate: true });
        form.setValue('client.nombre_comercial', clientData.nombre_comercial || '', { shouldValidate: true });
        form.setValue('client.direccion', clientData.direccion || '', { shouldValidate: true });
        form.setValue('client.distrito', clientData.distrito || '', { shouldValidate: true });
        form.setValue('client.provincia', clientData.provincia || '', { shouldValidate: true });
        form.setValue('client.departamento', clientData.departamento || '', { shouldValidate: true });
        form.setValue('client.ubigeo', clientData.ubigeo || '');
        form.setValue('client.telefono', clientData.telefono || '');

        toast({
          title: "Cliente Encontrado",
          description: `Datos de ${clientData.razon_social} cargados.`,
          variant: "success",
        });
      } else {
        form.setValue('client.razon_social', '');
        form.setValue('client.nombre_comercial', '');
        form.setValue('client.direccion', '');
        form.setValue('client.distrito', '');
        form.setValue('client.provincia', '');
        form.setValue('client.departamento', '');
        form.setValue('client.ubigeo', '');
        form.setValue('client.telefono', '');

        toast({
          title: "Cliente No Encontrado",
          description: "No se encontraron datos para el documento ingresado. Por favor, complete manualmente.",
          variant: "warning",
        });
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Error al buscar cliente.";
      toast({
        title: "Error de Búsqueda",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setIsClientSearching(false);
    }
  }, [form, toast]);


  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
        
        {/* SECCIÓN 1: METADATOS DE LA BOLETA */}
        <Card className="bg-surface border-primary/30 shadow-xl">
          <CardHeader>
            <CardTitle className="text-xl text-primary">Información General</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <FormField
              control={form.control}
              name="serie"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Serie</FormLabel>
                  <FormControl>
                    <Input {...field} disabled />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="fecha_emision"
              render={({ field }) => (
                <FormItem className="flex flex-col">
                  <FormLabel>Fecha de Emisión</FormLabel>
                  <Popover>
                    <PopoverTrigger asChild>
                      <FormControl>
                        <Button
                          variant={"outline"}
                          className={cn(
                            "w-full justify-start text-left font-normal rounded-lg border-border bg-background text-foreground focus:ring-primary focus:border-primary transition-all duration-300",
                            !field.value && "text-muted-foreground"
                          )}
                        >
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {field.value ? format(parseISO(field.value), "PPP", { locale: es }) : <span>Selecciona una fecha</span>}
                        </Button>
                      </FormControl>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0 bg-card border-border rounded-xl shadow-lg" align="start">
                      <Calendar
                        mode="single"
                        selected={field.value ? parseISO(field.value) : undefined}
                        onSelect={(date) => {
                          field.onChange(date ? format(date, 'yyyy-MM-dd') : '');
                        }}
                        initialFocus
                        locale={es}
                        toDate={new Date()}
                      />
                    </PopoverContent>
                  </Popover>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="moneda"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Moneda</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Seleccione Moneda" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent className="bg-card border-border">
                      <SelectItem value="PEN">PEN - Soles</SelectItem>
                      <SelectItem value="USD">USD - Dólares</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
          </CardContent>
        </Card>

        {/* SECCIÓN 2: DATOS DEL CLIENTE */}
        <Card className="bg-surface border-accent/30 shadow-xl">
          <CardHeader>
            <CardTitle className="text-xl text-accent">Datos del Cliente</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <FormField
                control={form.control}
                name="client.tipo_documento"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Tipo Doc.</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Tipo Documento" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent className="bg-card border-border">
                        {DOCUMENT_TYPES.map(doc => (
                          <SelectItem key={doc.value} value={doc.value}>{doc.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="client.numero_documento"
                render={({ field }) => (
                  <FormItem className="md:col-span-2 relative">
                    <FormLabel>Número de Documento</FormLabel>
                    <FormControl>
                      <Input 
                        placeholder="Ej: 23456789" 
                        {...field} 
                        onBlur={(e) => {
                          field.onBlur();
                          handleClientSearch(e);
                        }}
                        disabled={isClientSearching}
                      />
                    </FormControl>
                    {isClientSearching && (
                      <Loader2 className="absolute right-3 top-9 h-5 w-5 text-primary animate-spin" />
                    )}
                    {!isClientSearching && form.getValues('client.tipo_documento') === '1' && (
                       <Search className="absolute right-3 top-9 h-5 w-5 text-textSecondary" />
                    )}
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            
            <FormField
              control={form.control}
              name="client.razon_social"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Razón Social / Nombre Completo</FormLabel>
                  <FormControl>
                    <Input placeholder="Ej: María Sánchez" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="client.nombre_comercial"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nombre Comercial (Opcional)</FormLabel>
                  <FormControl>
                    <Input placeholder="Ej: María E. Sánchez P." {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
              <FormField
                control={form.control}
                name="client.departamento"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Departamento/Región</FormLabel>
                    <FormControl><Input placeholder="Lima" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="client.provincia"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Provincia</FormLabel>
                    <FormControl><Input placeholder="Lima" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="client.distrito"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Distrito</FormLabel>
                    <FormControl><Input placeholder="Miraflores" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="client.ubigeo"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Ubigeo (Opcional)</FormLabel>
                    <FormControl><Input placeholder="150101" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="client.direccion"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Dirección Completa</FormLabel>
                  <FormControl>
                    <Input placeholder="Ej: Av. Los Negocios 456" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <FormField
                control={form.control}
                name="client.telefono"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Teléfono/Celular (Opcional)</FormLabel>
                    <FormControl><Input placeholder="987654321" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="client.email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email (Opcional)</FormLabel>
                    <FormControl><Input placeholder="contacto@ejemplo.com" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          </CardContent>
        </Card>

        {/* SECCIÓN 3: DETALLES DE LA VENTA */}
        <Card className="bg-surface border-secondary/30 shadow-xl">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-xl text-secondary">Detalles de Productos/Servicios</CardTitle>
            <Button 
              type="button" 
              variant="outline" 
              onClick={() => append({ 
                codigo: DEFAULT_ITEM_CODE, 
                descripcion: DEFAULT_ITEM_DESCRIPTION, 
                unidad: DEFAULT_ITEM_UNIT, 
                cantidad: 1, 
                mto_valor_unitario: DEFAULT_ITEM_UNIT_VALUE, 
                porcentaje_igv: DEFAULT_IGV_PERCENTAGE, 
                tip_afe_igv: '10', 
                codigo_producto_sunat: DEFAULT_SUNAT_PRODUCT_CODE
              })}
              className="text-secondary hover:bg-secondary/20 border-secondary"
            >
              <PlusCircle className="h-4 w-4 mr-2" />
              Agregar Detalle
            </Button>
          </CardHeader>
          <CardContent className="space-y-6">
            {fields.map((item, index) => (
              <div key={item.id} className="p-4 border border-border rounded-lg bg-card/50 relative space-y-4 transition-all duration-300 hover:shadow-md">
                <h4 className="text-lg font-semibold text-foreground/80">Item #{index + 1}</h4>
                
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <FormField
                    control={form.control}
                    name={`detalles.${index}.codigo`}
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Código</FormLabel>
                        <FormControl><Input {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name={`detalles.${index}.unidad`}
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Unidad</FormLabel>
                        <FormControl><Input {...field} placeholder="NIU, ZZ" /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name={`detalles.${index}.cantidad`}
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Cantidad</FormLabel>
                        <FormControl>
                          <Input 
                            type="number" 
                            {...field} 
                            onChange={e => field.onChange(parseFloat(e.target.value) || 0)}
                            min="1"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name={`detalles.${index}.mto_valor_unitario`}
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Precio Unitario (con IGV)</FormLabel>
                        <FormControl>
                          <Input 
                            type="number" 
                            step="0.01" 
                            {...field} 
                            onChange={e => field.onChange(parseFloat(e.target.value) || 0)}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name={`detalles.${index}.descripcion`}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Descripción</FormLabel>
                      <FormControl><Textarea {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <FormField
                    control={form.control}
                    name={`detalles.${index}.tip_afe_igv`}
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Afectación IGV</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Tipo Afectación" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent className="bg-card border-border">
                            {IGV_AFFECTION_TYPES.map(type => (
                              <SelectItem key={type.value} value={type.value}>{type.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name={`detalles.${index}.porcentaje_igv`}
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>% IGV</FormLabel>
                        <FormControl>
                          <Input 
                            type="number" 
                            {...field} 
                            onChange={e => field.onChange(parseFloat(e.target.value) || 0)}
                            min="0" max="18"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name={`detalles.${index}.codigo_producto_sunat`}
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Cód. Producto SUNAT</FormLabel>
                        <FormControl><Input {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                {fields.length > 1 && (
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    onClick={() => remove(index)}
                    className="absolute top-2 right-2 h-8 w-8 p-0"
                  >
                    <Trash2 className="h-4 w-4" />
                    <span className="sr-only">Eliminar detalle</span>
                  </Button>
                )}
              </div>
            ))}
            {form.formState.errors.detalles && (
              <p className="text-sm font-medium text-destructive mt-2">
                {form.formState.errors.detalles.message}
              </p>
            )}
          </CardContent>
        </Card>

        {/* SECCIÓN 4: ACCIONES POST-EMISIÓN (PDF) */}
        {lastIssuedBoleta && (
          <Card className="bg-surface border-success/30 shadow-xl">
            <CardHeader>
              <CardTitle className="text-xl text-success">Documento Emitido: {lastIssuedBoleta.numero_completo}</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col md:flex-row gap-4">
              <Button 
                type="button" 
                onClick={handleDownloadPdf}
                disabled={isGeneratingPdf || !currentSocioId}
                className="flex-1 py-3 bg-success hover:bg-success/90 text-white transition-all duration-300"
              >
                <FileText className="mr-2 h-5 w-5" />
                {isGeneratingPdf ? 'Generando PDF...' : 'Descargar PDF y Guardar'}
              </Button>
              <Button 
                type="button" 
                onClick={() => { 
                  form.reset(defaultValues); 
                  setLastIssuedBoleta(null); 
                  setCurrentSocioId(null);
                }}
                variant="outline"
                className="flex-1 py-3 border-border text-foreground hover:bg-card transition-all duration-300"
              >
                <RotateCcw className="mr-2 h-5 w-5" />
                Nueva Boleta
              </Button>
            </CardContent>
          </Card>
        )}

        <Button 
          type="submit" 
          className="w-full py-6 text-lg font-semibold transition-all duration-300 hover:shadow-primary/50 shadow-lg"
          disabled={isSubmitting || isClientSearching || !form.formState.isValid || !!lastIssuedBoleta}
        >
          {isSubmitting ? (
            <>
              <Loader2 className="mr-2 h-5 w-5 animate-spin" />
              Emitiendo Boleta...
            </>
          ) : (
            <>
              <Send className="mr-2 h-5 w-5" />
              Emitir Boleta Electrónica
            </>
          )}
        </Button>
      </form>
    </Form>
  );
};

export default BoletaForm;
