import { DollarSign, ArrowUpCircle, ArrowDownCircle, Users, UserCheck, RefreshCcw, XCircle, Loader2 } from 'lucide-react'; // Added Loader2
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card';
import { Chart } from '@/components/ui/chart';
import { Line } from 'recharts';
import { DataTable } from '@/components/ui-custom/DataTable';
import { ColumnDef } from '@tanstack/react-table';
import { useSupabaseData } from '@/hooks/useSupabaseData';
import { Ingreso, Gasto, Colaborador, SocioTitular, Transaction } from '@/lib/types';
import { format, parseISO, getQuarter as dateFnsGetQuarter, getMonth, getYear } from 'date-fns';
import { es } from 'date-fns/locale';
import { useMemo, useState } from 'react';
import { cn } from '@/lib/utils';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useUser } from '@/context/UserContext'; // Import useUser

// --- Helper Functions for Date Filtering ---
const getQuarter = (date: Date): string => {
  const quarter = dateFnsGetQuarter(date);
  const year = getYear(date);
  return `Q${quarter}-${year}`;
};

const getSemester = (date: Date): string => {
  const month = getMonth(date);
  const semester = month < 6 ? 1 : 2; // Months 0-5 are S1, 6-11 are S2
  const year = getYear(date);
  return `S${semester}-${year}`;
};

// --- Column Definitions for Recent Transactions ---
const recentTransactionsColumns: ColumnDef<Transaction>[] = [
  {
    accessorKey: 'date',
    header: 'Fecha',
    cell: ({ row }) => format(parseISO(row.getValue('date')), 'dd MMM yyyy', { locale: es }),
  },
  {
    accessorKey: 'description',
    header: 'Descripción',
    cell: ({ row }) => {
      const transaction = row.original;
      let descriptionText = 'N/A';
      if ('description' in transaction && transaction.description) {
        descriptionText = transaction.description;
      } else if ('full_name' in transaction && transaction.full_name) {
        descriptionText = `Pago de ${transaction.full_name}`;
      }
      return (
        <span className="font-medium text-foreground">
          {descriptionText}
        </span>
      );
    },
  },
  {
    accessorKey: 'category',
    header: 'Categoría/Tipo',
    cell: ({ row }) => {
      const transaction = row.original;
      let categoryText = 'General';
      if ('category' in transaction && transaction.category) {
        categoryText = transaction.category;
      } else if ('transaction_type' in transaction && transaction.transaction_type) {
        categoryText = transaction.transaction_type;
      }
      return (
        <span className="text-muted-foreground">
          {categoryText}
        </span>
      );
    },
  },
  {
    accessorKey: 'amount',
    header: () => <div className="text-right">Monto</div>,
    cell: ({ row }) => {
      const amount = parseFloat(row.getValue('amount'));
      // Check if it's an Ingreso by looking for a property unique to Ingreso, e.g., receipt_number
      // Note: 'transaction_type' is also unique to Ingreso, but 'receipt_number' is less ambiguous for type narrowing
      const isIngreso = 'receipt_number' in row.original && row.original.receipt_number !== undefined;
      const formattedAmount = new Intl.NumberFormat('es-PE', {
        style: 'currency',
        currency: 'PEN',
      }).format(amount);

      return (
        <div className={cn(
          'text-right font-semibold',
          isIngreso && amount > 0 ? 'text-success' : 'text-error'
        )}>
          {isIngreso && amount > 0 ? '+' : ''} {formattedAmount}
        </div>
      );
    },
  },
];

function Overview() {
  const { data: ingresosData, loading: loadingIngresos, error: errorIngresos } = useSupabaseData<Ingreso>({ tableName: 'ingresos' });
  const { data: gastosData, loading: loadingGastos, error: errorGastos } = useSupabaseData<Gasto>({ tableName: 'gastos' });
  const { data: colaboradoresData, loading: loadingColaboradores, error: errorColaboradores } = useSupabaseData<Colaborador>({ tableName: 'colaboradores' });
  const { data: socioTitularesData, loading: loadingSocioTitulares, error: errorSocioTitulares } = useSupabaseData<SocioTitular>({ tableName: 'socio_titulares' });

  const { permissions } = useUser(); // Get user permissions
  const canAccessIncome = permissions?.has('/income') ?? false; // Check if user has access to /income

  const [filterPeriodType, setFilterPeriodType] = useState<'month' | 'quarter' | 'semester' | 'all'>('month');
  const [selectedPeriod, setSelectedPeriod] = useState<string | undefined>(undefined);

  // --- Generate Period Options ---
  const allDates = useMemo(() => {
    const dates = new Set<string>();
    [...ingresosData, ...gastosData].forEach(item => {
      // Ensure 'date' property exists before accessing
      if ('date' in item && item.date) {
        dates.add(item.date);
      } else if ('created_at' in item && item.created_at) { // Fallback for items without 'date' but with 'created_at'
        dates.add(item.created_at.split('T')[0]); // Take only the date part
      }
    });
    return Array.from(dates).map(dateStr => parseISO(dateStr));
  }, [ingresosData, gastosData]);

  const availableMonths = useMemo(() => {
    const months = new Set<string>();
    allDates.forEach(date => months.add(format(date, 'yyyy-MM')));
    return Array.from(months).sort().map(month => ({
      value: month,
      label: format(parseISO(`${month}-01`), 'MMMM yyyy', { locale: es }),
    }));
  }, [allDates]);

  const availableQuarters = useMemo(() => {
    const quarters = new Set<string>();
    allDates.forEach(date => quarters.add(getQuarter(date)));
    return Array.from(quarters).sort().map(q => ({
      value: q,
      label: q.replace('Q', 'Trimestre ') + ' ' + q.split('-')[1],
    }));
  }, [allDates]);

  const availableSemesters = useMemo(() => {
    const semesters = new Set<string>();
    allDates.forEach(date => semesters.add(getSemester(date)));
    return Array.from(semesters).sort().map(s => ({
      value: s,
      label: s.replace('S', 'Semestre ') + ' ' + s.split('-')[1],
    }));
  }, [allDates]);

  // Set initial selected period to the latest available month if not set and not 'all'
  useMemo(() => {
    if (filterPeriodType !== 'all' && !selectedPeriod && availableMonths.length > 0) {
      setSelectedPeriod(availableMonths[availableMonths.length - 1].value);
    }
  }, [selectedPeriod, availableMonths, filterPeriodType]);

  // --- Filtered Data based on selectedPeriod ---
  const filteredIngresos = useMemo(() => {
    if (filterPeriodType === 'all') return ingresosData; // "Total de todo" filter
    if (!selectedPeriod) return ingresosData; // Fallback for initial load or no selection

    return ingresosData.filter(item => {
      const itemDate = parseISO(item.date); // Ingresos ahora usan 'date' para el filtro
      if (filterPeriodType === 'month') {
        return format(itemDate, 'yyyy-MM') === selectedPeriod;
      } else if (filterPeriodType === 'quarter') {
        return getQuarter(itemDate) === selectedPeriod;
      } else if (filterPeriodType === 'semester') {
        return getSemester(itemDate) === selectedPeriod;
      }
      return true;
    });
  }, [ingresosData, filterPeriodType, selectedPeriod]);

  const filteredGastos = useMemo(() => {
    if (filterPeriodType === 'all') return gastosData; // "Total de todo" filter
    if (!selectedPeriod) return gastosData; // Fallback for initial load or no selection

    return gastosData.filter(item => {
      const itemDate = parseISO(item.date); // Gastos usan 'date'
      if (filterPeriodType === 'month') {
        return format(itemDate, 'yyyy-MM') === selectedPeriod;
      } else if (filterPeriodType === 'quarter') {
        return getQuarter(itemDate) === selectedPeriod;
      } else if (filterPeriodType === 'semester') {
        return getSemester(itemDate) === selectedPeriod;
      }
      return true;
    });
  }, [gastosData, filterPeriodType, selectedPeriod]);

  const totalIngresos = useMemo(() => filteredIngresos.reduce((sum, item) => sum + item.amount, 0), [filteredIngresos]);
  const totalGastos = useMemo(() => filteredGastos.reduce((sum, item) => sum + item.amount, 0), [filteredGastos]);
  const netBalance = totalIngresos + totalGastos; // Gastos son almacenados como negativos, así que los sumamos

  const totalColaboradores = colaboradoresData.length;
  const totalSocioTitulares = socioTitularesData.length;

  // --- Lógica para Socios Pagados y Pendientes ---
  // Only calculate if user has access to income data
  const paidDnis = useMemo(() => canAccessIncome ? new Set(ingresosData.map(ingreso => ingreso.dni).filter(Boolean) as string[]) : new Set(), [ingresosData, canAccessIncome]);

  const shouldPaySocioTitulares = useMemo(() =>
    socioTitularesData.filter(socio =>
      socio.situacionEconomica === 'Pobre' || socio.situacionEconomica === 'Extremo Pobre'
    ), [socioTitularesData]);

  const paidSocioTitularesCount = useMemo(() => {
    if (!canAccessIncome || !shouldPaySocioTitulares.length) return 0;
    return shouldPaySocioTitulares.filter(socio => socio.dni && paidDnis.has(socio.dni)).length;
  }, [shouldPaySocioTitulares, paidDnis, canAccessIncome]);

  const unpaidSocioTitularesCount = useMemo(() => {
    if (!canAccessIncome || !shouldPaySocioTitulares.length) return 0;
    return shouldPaySocioTitulares.filter(socio => socio.dni && !paidDnis.has(socio.dni)).length;
  }, [shouldPaySocioTitulares, paidDnis, canAccessIncome]);
  // --- Fin Lógica para Socios Pagados y Pendientes ---

  // --- Lógica para Transacciones Especiales (Devoluciones y Anulaciones) ---
  const specialTransactionsSummary = useMemo(() => {
    let totalDevolucionesAmount = 0;
    let countAnulaciones = 0;

    if (canAccessIncome) { // Only calculate if user has access
      ingresosData.forEach(ingreso => {
        if (ingreso.transaction_type === 'Devolucion') {
          totalDevolucionesAmount += ingreso.amount; // Amount is already negative
        } else if (ingreso.transaction_type === 'Anulacion') {
          countAnulaciones += 1;
        }
      });
    }

    return { totalDevolucionesAmount, countAnulaciones };
  }, [ingresosData, canAccessIncome]);
  // --- Fin Lógica para Transacciones Especiales ---

  const chartData = useMemo(() => {
    const monthlyData: { [key: string]: { ingresos: number; gastos: number } } = {};

    // Use filtered data for chart
    if (canAccessIncome) { // Only include ingresos if user has access
      filteredIngresos.forEach(item => {
        const monthYear = format(parseISO(item.date), 'yyyy-MM'); // Ingresos ahora usan 'date'
        if (!monthlyData[monthYear]) {
          monthlyData[monthYear] = { ingresos: 0, gastos: 0 };
        }
        monthlyData[monthYear].ingresos += item.amount;
      });
    }

    filteredGastos.forEach(item => {
      const monthYear = format(parseISO(item.date), 'yyyy-MM'); // Gastos usan 'date'
      if (!monthlyData[monthYear]) {
        monthlyData[monthYear] = { ingresos: 0, gastos: 0 };
      }
      monthlyData[monthYear].gastos += item.amount;
    });

    return Object.keys(monthlyData)
      .sort()
      .map(monthYear => ({
        date: format(parseISO(`${monthYear}-01`), 'MMM yy', { locale: es }),
        ingresos: monthlyData[monthYear].ingresos,
        gastos: monthlyData[monthYear].gastos,
      }));
  }, [filteredIngresos, filteredGastos, canAccessIncome]);

  const recentTransactions = useMemo(() => {
    const allTransactions: Transaction[] = [];
    if (canAccessIncome) { // Only include ingresos if user has access
      allTransactions.push(...ingresosData);
    }
    allTransactions.push(...gastosData);

    return allTransactions
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()) // Ordenar por 'date'
      .slice(0, 5);
  }, [ingresosData, gastosData, canAccessIncome]);

  if (loadingIngresos || loadingGastos || loadingColaboradores || loadingSocioTitulares) {
    return (
      <div className="flex items-center justify-center h-screen bg-background text-foreground">
        <Loader2 className="h-8 w-8 animate-spin text-primary mr-2" />
        Cargando datos del dashboard...
      </div>
    );
  }

  if (errorIngresos || errorGastos || errorColaboradores || errorSocioTitulares) {
    // Display the error string directly, as useSupabaseData already extracts the message
    return <div className="text-center text-destructive">Error al cargar los datos: {errorIngresos || errorGastos || errorColaboradores || errorSocioTitulares}</div>;
  }

  const chartConfig = {
    ingresos: {
      label: 'Ingresos',
      color: 'hsl(var(--success))',
      icon: ArrowUpCircle,
    },
    gastos: {
      label: 'Gastos',
      color: 'hsl(var(--error))',
      icon: ArrowDownCircle,
    },
  };

  return (
    <div className="space-y-6">
      <Tabs defaultValue="socios" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="socios">Titulares</TabsTrigger>
          {canAccessIncome && ( // Conditionally render Finanzas tab
            <TabsTrigger value="finanzas">Finanzas</TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="socios" className="space-y-6 mt-6 animate-fade-in-up">
          <h2 className="text-3xl font-bold text-foreground mb-4">Resumen de Titulares</h2>
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            <Card className="rounded-xl border-border shadow-lg hover:shadow-xl transition-all duration-300">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-textSecondary">Total Titulares Registrados</CardTitle>
                <UserCheck className="h-5 w-5 text-accent" />
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-foreground">{totalSocioTitulares}</div>
                <p className="text-xs text-muted-foreground mt-1">
                  Total de Titulares en la base de datos
                </p>
              </CardContent>
            </Card>
            {canAccessIncome && ( // Conditionally render "Titulares que han pagado"
              <Card className="rounded-xl border-border shadow-lg hover:shadow-xl transition-all duration-300">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium text-textSecondary">Titulares que han pagado</CardTitle>
                  <UserCheck className="h-5 w-5 text-success" />
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold text-foreground">{paidSocioTitularesCount}</div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Titulares con pagos registrados este mes
                  </p>
                </CardContent>
              </Card>
            )}
            {canAccessIncome && ( // Conditionally render "Titulares pendientes de pago"
              <Card className="rounded-xl border-border shadow-lg hover:shadow-xl transition-all duration-300">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium text-textSecondary">Titulares pendientes de pago</CardTitle>
                  <Users className="h-5 w-5 text-error" />
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold text-foreground">{unpaidSocioTitularesCount}</div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Titulares que aún no han pagado este mes
                  </p>
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>

        {canAccessIncome && ( // Conditionally render Finanzas content
          <TabsContent value="finanzas" className="space-y-6 mt-6 animate-fade-in-up">
            <h2 className="text-3xl font-bold text-foreground mb-4">Finanzas y Actividad General</h2>
            <Tabs defaultValue="balance" className="w-full">
              <TabsList className="grid w-full grid-cols-2 lg:w-1/2 mx-auto">
                <TabsTrigger value="balance">Balance General</TabsTrigger>
                <TabsTrigger value="special-transactions">Transacciones Especiales</TabsTrigger>
              </TabsList>

              <TabsContent value="balance" className="space-y-6 mt-6 animate-fade-in-up">
                <div className="flex flex-col sm:flex-row gap-4 mb-6">
                  <Select value={filterPeriodType} onValueChange={(value: 'month' | 'quarter' | 'semester' | 'all') => {
                    setFilterPeriodType(value);
                    setSelectedPeriod(value === 'all' ? 'all-total' : undefined); // Set a specific value for 'all'
                  }}>
                    <SelectTrigger className="w-[180px]">
                      <SelectValue placeholder="Filtrar por" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="month">Mes</SelectItem>
                      <SelectItem value="quarter">Trimestre</SelectItem>
                      <SelectItem value="semester">Semestre</SelectItem>
                      <SelectItem value="all">Total de todo</SelectItem> {/* New option */}
                    </SelectContent>
                  </Select>

                  {filterPeriodType === 'month' && (
                    <Select value={selectedPeriod} onValueChange={setSelectedPeriod}>
                      <SelectTrigger className="w-[200px]">
                        <SelectValue placeholder="Seleccionar Mes" />
                      </SelectTrigger>
                      <SelectContent>
                        {availableMonths.map(month => (
                          <SelectItem key={month.value} value={month.value}>
                            {month.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}

                  {filterPeriodType === 'quarter' && (
                    <Select value={selectedPeriod} onValueChange={setSelectedPeriod}>
                      <SelectTrigger className="w-[200px]">
                        <SelectValue placeholder="Seleccionar Trimestre" />
                      </SelectTrigger>
                      <SelectContent>
                        {availableQuarters.map(quarter => (
                          <SelectItem key={quarter.value} value={quarter.value}>
                            {quarter.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}

                  {filterPeriodType === 'semester' && (
                    <Select value={selectedPeriod} onValueChange={setSelectedPeriod}>
                      <SelectTrigger className="w-[200px]">
                        <SelectValue placeholder="Seleccionar Semestre" />
                      </SelectTrigger>
                      <SelectContent>
                        {availableSemesters.map(semester => (
                          <SelectItem key={semester.value} value={semester.value}>
                            {semester.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>

                <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
                  <Card className="rounded-xl border-border shadow-lg hover:shadow-xl transition-all duration-300">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                      <CardTitle className="text-sm font-medium text-textSecondary">Ingresos Totales</CardTitle>
                      <ArrowUpCircle className="h-5 w-5 text-success" />
                    </CardHeader>
                    <CardContent>
                      <div className="text-3xl font-bold text-foreground">
                        {new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN' }).format(totalIngresos)}
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        {filterPeriodType === 'all' ? 'Total general' : (filterPeriodType === 'month' ? 'En el mes seleccionado' : `En el ${filterPeriodType} seleccionado`)}
                      </p>
                    </CardContent>
                  </Card>
                  <Card className="rounded-xl border-border shadow-lg hover:shadow-xl transition-all duration-300">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                      <CardTitle className="text-sm font-medium text-textSecondary">Gastos Totales</CardTitle>
                      <ArrowDownCircle className="h-5 w-5 text-error" />
                    </CardHeader>
                    <CardContent>
                      <div className="text-3xl font-bold text-foreground">
                        {new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN' }).format(totalGastos)}
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        {filterPeriodType === 'all' ? 'Total general' : (filterPeriodType === 'month' ? 'En el mes seleccionado' : `En el ${filterPeriodType} seleccionado`)}
                      </p>
                    </CardContent>
                  </Card>
                  <Card className="rounded-xl border-border shadow-lg hover:shadow-xl transition-all duration-300">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                      <CardTitle className="text-sm font-medium text-textSecondary">Balance Neto</CardTitle>
                      <DollarSign className="h-5 w-5 text-primary" />
                    </CardHeader>
                    <CardContent>
                      <div className={cn(
                        "text-3xl font-bold",
                        netBalance >= 0 ? 'text-success' : 'text-error'
                      )}>
                        {new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN' }).format(netBalance)}
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        {filterPeriodType === 'all' ? 'Total general' : (netBalance >= 0 ? 'En positivo' : 'En negativo')}
                      </p>
                    </CardContent>
                  </Card>
                  <Card className="rounded-xl border-border shadow-lg hover:shadow-xl transition-all duration-300">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                      <CardTitle className="text-sm font-medium text-textSecondary">Colaboradores Registrados</CardTitle>
                      <Users className="h-5 w-5 text-secondary" />
                    </CardHeader>
                    <CardContent>
                      <div className="text-3xl font-bold text-foreground">{totalColaboradores}</div>
                      <p className="text-xs text-muted-foreground mt-1">
                        Total de colaboradores activos
                      </p>
                    </CardContent>
                  </Card>
                </div>

                <Card className="rounded-xl border-border shadow-lg animate-fade-in-up">
                  <CardHeader>
                    <CardTitle className="text-foreground">Tendencia de Ingresos y Gastos</CardTitle>
                    <CardDescription className="text-muted-foreground">
                      Visualización mensual de tus finanzas para el periodo seleccionado.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Chart data={chartData} config={chartConfig} className="min-h-[300px] w-full">
                      <Line
                        type="monotone"
                        dataKey="ingresos"
                        stroke="hsl(var(--success))"
                        strokeWidth={2}
                        dot={{
                          fill: 'hsl(var(--success))',
                          strokeWidth: 2,
                          r: 4,
                        }}
                        activeDot={{
                          r: 6,
                          style: { fill: 'hsl(var(--success))', stroke: 'hsl(var(--success))' },
                        }}
                      />
                      <Line
                        type="monotone"
                        dataKey="gastos"
                        stroke="hsl(var(--error))"
                        strokeWidth={2}
                        dot={{
                          fill: 'hsl(var(--error))',
                          strokeWidth: 2,
                          r: 4,
                        }}
                        activeDot={{
                          r: 6,
                          style: { fill: 'hsl(var(--error))', stroke: 'hsl(var(--error))' },
                        }}
                      />
                    </Chart>
                  </CardContent>
                </Card>

                <Card className="rounded-xl border-border shadow-lg animate-fade-in-up">
                  <CardHeader>
                    <CardTitle className="text-foreground">Transacciones Recientes</CardTitle>
                    <CardDescription className="text-muted-foreground">
                      Las últimas 5 transacciones registradas.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {/* Pasamos globalFilter y setGlobalFilter como props vacías para satisfacer la interfaz opcional */}
                    <DataTable columns={recentTransactionsColumns} data={recentTransactions} globalFilter="" setGlobalFilter={() => {}} />
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="special-transactions" className="space-y-6 mt-6 animate-fade-in-up">
                <div className="grid gap-6 md:grid-cols-2">
                  <Card className="rounded-xl border-border shadow-lg hover:shadow-xl transition-all duration-300">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                      <CardTitle className="text-sm font-medium text-textSecondary">Dinero por Devoluciones</CardTitle>
                      <RefreshCcw className="h-5 w-5 text-primary" />
                    </CardHeader>
                    <CardContent>
                      <div className="text-3xl font-bold text-error">
                        {new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN' }).format(specialTransactionsSummary.totalDevolucionesAmount)}
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        Monto total de ingresos por devoluciones.
                      </p>
                    </CardContent>
                  </Card>
                  <Card className="rounded-xl border-border shadow-lg hover:shadow-xl transition-all duration-300">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                      <CardTitle className="text-sm font-medium text-textSecondary">Boletas Anuladas</CardTitle>
                      <XCircle className="h-5 w-5 text-destructive" />
                    </CardHeader>
                    <CardContent>
                      <div className="text-3xl font-bold text-foreground">{specialTransactionsSummary.countAnulaciones}</div>
                      <p className="text-xs text-muted-foreground mt-1">
                        Número total de ingresos anulados.
                      </p>
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>
            </Tabs>
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}

export default Overview;
