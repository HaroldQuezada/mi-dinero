// Modelos del módulo Mi Dinero: entidades de BD, payloads y modelos de vista.
// Las entidades usan los nombres de columna de Supabase (snake_case).

import { IconDefinition } from '@fortawesome/fontawesome-svg-core';
import { NombreIcono } from '../../shared/iconos';
import { EstadoBarra, OpcionSelect } from '../../shared/models/ui.models';
import type { TablaDinero } from './dinero.constantes';

// ============================================
// TIPOS BASE
// ============================================
export type TabDinero =
  | 'dashboard'
  | 'movimientos'
  | 'cuentas'
  | 'deudas'
  | 'gastos-fijos'
  | 'presupuesto';

export type TipoMovimiento = 'GASTO' | 'INGRESO' | 'TRASLADO';

// Los traslados no tienen categoría: solo gastos e ingresos
export type TipoCategoria = Exclude<TipoMovimiento, 'TRASLADO'>;

export type TipoCuenta = 'debito' | 'credito' | 'inversion' | 'ahorro';

// Posición en la paleta categórica de la app; se pinta como var(--serie-N)
export type SlotColor = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

// ============================================
// ENTIDADES (filas de Supabase)
// ============================================
export interface Configuracion {
  id?: string;
  ingreso_mensual: number;
}

// El saldo actual no se guarda: se calcula a partir de saldo_inicial y de las
// transacciones (ver CuentaConSaldo). En crédito el saldo es negativo si se debe.
export interface Cuenta {
  id: string;
  nombre: string;
  tipo: TipoCuenta;
  saldo_inicial: number;
  color: SlotColor;
  // Solo tarjetas de crédito
  dia_corte: number | null;
  dia_limite_pago: number | null;
  orden: number;
  created_at: string;
}

export interface CategoriaGrande {
  id: string;
  nombre: string;
  tipo: TipoCategoria;
  // Porcentaje del ingreso mensual asignado (solo categorías de gasto)
  porcentaje: number;
  orden: number;
}

export interface Subcategoria {
  id: string;
  nombre: string;
  categoria_grande_id: string;
}

export interface MetaAhorro {
  id: string;
  nombre: string;
  valor_objetivo: number;
  valor_ahorrado: number;
  fecha_objetivo: string | null;
  activa: boolean;
  created_at: string;
}

export interface CorteTarjeta {
  id: string;
  cuenta_id: string;
  mes: string;
  monto_corte: number;
  fecha_limite: string | null;
  pagado: boolean;
  movimiento_id?: string | null;
}

// Fila de la tabla `movimientos`.
//  - GASTO:    sale de cuenta_origen_id, con categoría
//  - INGRESO:  entra a cuenta_destino_id, con categoría
//  - TRASLADO: sale de cuenta_origen_id y entra a cuenta_destino_id, sin categoría
export interface Transaccion {
  id: string;
  tipo: TipoMovimiento;
  monto: number;
  fecha: string;
  cuenta_origen_id: string | null;
  cuenta_destino_id: string | null;
  categoria_id: string | null;
  subcategoria_id: string | null;
  descripcion: string | null;
  // Etiqueta para las que no tienen categoría (ajustes de saldo, pagos de deudas)
  categoria: string | null;
  created_at: string;
}

// Préstamos y deudas a cuotas. Las tarjetas de crédito ahora son cuentas.
export interface Deuda {
  id: string;
  nombre: string;
  monto_total: number;
  pagado_acumulado: number;
  pago_mensual_planeado: number;
  activa: boolean;
  created_at: string;
}

export interface DeudaPago {
  id: string;
  deuda_id: string;
  mes: string;
  movimiento_id?: string;
}

export interface GastoFijo {
  id: string;
  nombre: string;
  monto: number;
  cuenta_id: string | null;
  categoria_id: string | null;
  subcategoria_id: string | null;
  activo: boolean;
  created_at: string;
}

export interface GastoFijoPago {
  id: string;
  gasto_fijo_id: string;
  mes: string;
  movimiento_id?: string;
}

// ============================================
// PAYLOADS (lo que se envía al crear/editar)
// ============================================
export type TransaccionPayload = Omit<Transaccion, 'id' | 'created_at'>;

// Lo que llena el formulario antes de validarlo y convertirlo en payload
export interface BorradorTransaccion {
  tipo: TipoMovimiento;
  monto: number | null;
  fecha: string;
  cuentaOrigenId: string | null;
  cuentaDestinoId: string | null;
  categoria: SeleccionCategoria;
  descripcion: string;
}

export type ResultadoValidacion<T> = { ok: true; valor: T } | { ok: false; error: string };

export type CuentaPayload = Pick<
  Cuenta,
  'nombre' | 'tipo' | 'saldo_inicial' | 'color' | 'dia_corte' | 'dia_limite_pago'
> &
  Partial<Pick<Cuenta, 'orden'>>;

export type DeudaPayload = Pick<
  Deuda,
  'nombre' | 'monto_total' | 'pagado_acumulado' | 'pago_mensual_planeado'
>;

export type CortePayload = Pick<CorteTarjeta, 'cuenta_id' | 'mes' | 'monto_corte' | 'fecha_limite'>;

export type GastoFijoPayload = Pick<
  GastoFijo,
  'nombre' | 'monto' | 'cuenta_id' | 'categoria_id' | 'subcategoria_id'
>;

export type CategoriaGrandePayload = Pick<CategoriaGrande, 'nombre' | 'porcentaje'> &
  Partial<Pick<CategoriaGrande, 'orden' | 'tipo'>>;

export type MetaAhorroPayload = Pick<
  MetaAhorro,
  'nombre' | 'valor_objetivo' | 'valor_ahorrado' | 'fecha_objetivo'
>;

// Porcentaje asignado a cada categoría grande, indexado por su id
export type PorcentajesPorCategoria = Record<string, number>;

// ============================================
// MODELOS DE VISTA
// ============================================
export interface CuentaConSaldo extends Cuenta {
  saldoActual: number;
}

export interface ResumenPatrimonio {
  // Débito + inversión + ahorro
  activos: number;
  // Lo que se debe en las cuentas de crédito (positivo)
  deudaCredito: number;
  // activos - deudaCredito
  patrimonioNeto: number;
  // Saldo de las cuentas de débito
  saldoDisponible: number;
}

export interface SeleccionCategoria {
  categoriaId: string | null;
  subcategoriaId: string | null;
}

export interface GrupoCategoria {
  categoria: CategoriaGrande;
  opciones: OpcionSelect[];
}

export interface InfoDeudaNormal {
  saldoRestante: number;
  porcentaje: number;
  fechaEstimada: string;
}

export interface InfoTarjeta {
  fechaLimiteTexto: string;
  alertaVencimiento: string;
  montoCorte: number;
  tieneCorte: boolean;
  pagado: boolean;
}

export interface EstadoPresupuesto {
  estado: EstadoBarra;
  alerta: string;
}

export interface ResumenCategoria extends EstadoPresupuesto {
  categoria: CategoriaGrande;
  color: string;
  icono: IconDefinition;
  subcategorias: Subcategoria[];
  presupuesto: number;
  gastado: number;
  disponible: number;
  porcentajeUsado: number;
}

export interface InfoMeta {
  porcentaje: number;
  falta: number;
  fechaObjetivoTexto: string;
}

export interface GastoCategoria {
  categoria: string;
  monto: number;
  porcentaje: number;
  color: string;
}

export interface DetalleCategoria {
  categoria: string;
  gastos: Transaccion[];
  total: number;
  cantidadTexto: string;
}

export interface EtiquetaSegmento {
  x: string;
  y: string;
  texto: string;
}

export interface SegmentoPastel {
  categoria: string;
  path: string;
  color: string;
  etiqueta: EtiquetaSegmento | null;
}

export interface AvisoSuma {
  texto: string;
  correcta: boolean;
}

// ============================================
// VALORES PREDETERMINADOS Y PREFERENCIAS
// ============================================
export interface CategoriaPredeterminada {
  nombre: string;
  porcentaje: number;
  slot: SlotColor;
  icono: NombreIcono;
}

export interface CuentaPredeterminada {
  nombre: string;
  tipo: TipoCuenta;
  color: SlotColor;
}

export type ColoresCategoria = Record<string, SlotColor>;

// Preferencias de interfaz del módulo, guardadas en localStorage
export interface PreferenciasDinero {
  tabActiva: TabDinero;
  coloresCategoria: ColoresCategoria;
}

// ============================================
// DASHBOARD
// ============================================
export interface ResumenMes {
  clave: string;
  etiqueta: string;
  etiquetaLarga: string;
  ingresos: number;
  gastos: number;
  neto: number;
  // Patrimonio neto al cierre del mes (los traslados no lo cambian)
  balanceCierre: number;
}

// ============================================
// PERSISTENCIA LOCAL Y RESPALDO
// ============================================
// Copia del estado del servicio en localStorage para mostrar los datos al recargar
export interface CacheDinero {
  version: number;
  // Mes (YYYY-MM) al que pertenecen los registros mensuales (cortes y pagos)
  mes: string;
  configuracion: Configuracion;
  cuentas: Cuenta[];
  categoriasGrandes: CategoriaGrande[];
  subcategorias: Subcategoria[];
  metasAhorro: MetaAhorro[];
  cortesDelMes: CorteTarjeta[];
  movimientos: Transaccion[];
  deudas: Deuda[];
  deudasPagosDelMes: DeudaPago[];
  gastosFijos: GastoFijo[];
  pagosDelMes: GastoFijoPago[];
}

// Fila tal como la devuelve la BD. Se trata de forma genérica para que el
// respaldo conserve columnas que la app no modela (created_at, activo...).
export type FilaRespaldo = { id: string } & Record<string, unknown>;

export type DatosRespaldo = Record<TablaDinero, FilaRespaldo[]>;

export interface RespaldoDinero {
  formato: string;
  version: number;
  exportadoEn: string;
  datos: DatosRespaldo;
  preferencias: Pick<PreferenciasDinero, 'coloresCategoria'>;
}

export type ConteoRespaldo = Record<TablaDinero, number>;
