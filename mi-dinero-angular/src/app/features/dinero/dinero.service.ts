import {
  computed,
  effect,
  inject,
  Injectable,
  signal,
  untracked,
  WritableSignal,
} from '@angular/core';
import { IconDefinition } from '@fortawesome/fontawesome-svg-core';
import { PostgrestError, PostgrestSingleResponse } from '@supabase/supabase-js';
import { AlmacenamientoLocalService, esObjeto } from '../../core/almacenamiento-local.service';
import { AuthService } from '../../core/auth.service';
import { CLAVES_ALMACENAMIENTO } from '../../core/constantes';
import { SUPABASE_CLIENT } from '../../core/supabase';
import { MensajeError } from '../../core/tipos';
import { fechaHoyIso, formatoMoneda, mesActual, normalizarTexto } from '../../core/utils';
import { ICONOS } from '../../shared/iconos';
import { OpcionSelect } from '../../shared/models/ui.models';
import { DineroPreferenciasService } from './dinero-preferencias.service';
import {
  calcularInfoTarjeta,
  calcularPatrimonio,
  calcularSaldos,
  categoriaPredeterminadaDe,
  ClasificacionGasto,
  estadoPresupuesto,
  resumenUltimosMeses,
  saldoDeudaNormal,
  soloGastos,
  sumarMontos,
} from './dinero.calculos';
import {
  CATEGORIA_OTROS,
  CATEGORIAS_PREDETERMINADAS,
  COLOR_INGRESO,
  COLOR_SIN_CATEGORIA,
  COLOR_TRASLADO,
  colorDeSlot,
  CUENTAS_PREDETERMINADAS,
  DIFERENCIA_MINIMA_AJUSTE,
  ETIQUETA_AJUSTE_SALDO,
  ETIQUETA_PAGO_DEUDA,
  ETIQUETA_PAGO_TARJETA,
  ETIQUETA_SIN_CATEGORIA,
  ETIQUETAS_TIPO_CUENTA,
  MESES_HISTORICO,
  NOMBRES_CATEGORIA_OCIO,
  PORCENTAJE_TOTAL,
  SLOTS_COLOR,
  TABLAS_DINERO,
  TablaDinero,
  VERSION_CACHE,
} from './dinero.constantes';
import {
  CacheDinero,
  CategoriaGrande,
  CategoriaGrandePayload,
  CategoriaPredeterminada,
  Configuracion,
  CortePayload,
  CorteTarjeta,
  Cuenta,
  CuentaConSaldo,
  CuentaPayload,
  Deuda,
  DeudaPago,
  DeudaPayload,
  GastoFijo,
  GastoFijoPago,
  GastoFijoPayload,
  GrupoCategoria,
  InfoTarjeta,
  MetaAhorro,
  MetaAhorroPayload,
  PorcentajesPorCategoria,
  ResumenCategoria,
  ResumenMes,
  ResumenPatrimonio,
  SlotColor,
  Subcategoria,
  TipoCategoria,
  Transaccion,
  TransaccionPayload,
} from './dinero.models';

interface RespuestaLista<T> {
  data: T[] | null;
  error: PostgrestError | null;
}

type FilaConId = Pick<Transaccion, 'id'>;

const CONFIGURACION_VACIA: Configuracion = { ingreso_mensual: 0 };

// Códigos con los que Supabase/PostgreSQL indican que una tabla no existe
const CODIGOS_TABLA_INEXISTENTE: readonly string[] = ['PGRST205', '42P01'];

// La tabla `deudas` conserva la columna `tipo`; la app ya solo maneja préstamos normales
const TIPO_DEUDA_NORMAL = 'normal';

const LISTAS_CACHE = [
  'cuentas',
  'categoriasGrandes',
  'subcategorias',
  'metasAhorro',
  'cortesDelMes',
  'movimientos',
  'deudas',
  'deudasPagosDelMes',
  'gastosFijos',
  'pagosDelMes',
] as const satisfies readonly (keyof CacheDinero)[];

function esCacheDinero(valor: unknown): valor is CacheDinero {
  return (
    esObjeto(valor) &&
    valor['version'] === VERSION_CACHE &&
    typeof valor['mes'] === 'string' &&
    esObjeto(valor['configuracion']) &&
    LISTAS_CACHE.every((lista) => Array.isArray(valor[lista]))
  );
}

@Injectable({ providedIn: 'root' })
export class DineroService {
  private readonly db = inject(SUPABASE_CLIENT);
  private readonly auth = inject(AuthService);
  private readonly almacenamiento = inject(AlmacenamientoLocalService);
  private readonly preferencias = inject(DineroPreferenciasService);

  // ============================================
  // ESTADO (solo escribible desde el servicio)
  // ============================================
  private readonly estado = {
    configuracion: signal<Configuracion>(CONFIGURACION_VACIA),
    cuentas: signal<Cuenta[]>([]),
    categoriasGrandes: signal<CategoriaGrande[]>([]),
    subcategorias: signal<Subcategoria[]>([]),
    metasAhorro: signal<MetaAhorro[]>([]),
    cortesDelMes: signal<CorteTarjeta[]>([]),
    movimientos: signal<Transaccion[]>([]),
    deudas: signal<Deuda[]>([]),
    deudasPagosDelMes: signal<DeudaPago[]>([]),
    gastosFijos: signal<GastoFijo[]>([]),
    pagosDelMes: signal<GastoFijoPago[]>([]),
  };

  // true cuando el estado ya refleja datos reales (de la copia local o de la BD),
  // para no sobrescribir la copia local con el estado vacío inicial
  private readonly datosListos = signal(false);

  // true si la BD aún no tiene la tabla `cuentas` (falta ejecutar supabase/cuentas.sql)
  private readonly faltaMigracion = signal(false);
  readonly requiereMigracion = this.faltaMigracion.asReadonly();

  readonly configuracion = this.estado.configuracion.asReadonly();
  readonly categoriasGrandes = this.estado.categoriasGrandes.asReadonly();
  readonly subcategorias = this.estado.subcategorias.asReadonly();
  readonly metasAhorro = this.estado.metasAhorro.asReadonly();
  readonly cortesDelMes = this.estado.cortesDelMes.asReadonly();
  readonly movimientos = this.estado.movimientos.asReadonly();
  readonly deudas = this.estado.deudas.asReadonly();
  readonly gastosFijos = this.estado.gastosFijos.asReadonly();

  constructor() {
    // Al iniciar sesión muestra al instante la copia local y luego la actualiza desde la BD.
    // Al cerrarla limpia el estado y borra la copia local para no dejar datos en el equipo.
    let usuarioAnterior: string | null = null;
    effect(() => {
      const usuarioId = this.auth.usuarioId();
      untracked(() => {
        if (usuarioId) {
          this.restaurarCache(usuarioId);
          void this.cargarTodo().then(() => this.asegurarValoresPorDefecto());
        } else {
          if (usuarioAnterior) {
            this.almacenamiento.eliminar(CLAVES_ALMACENAMIENTO.cacheDinero(usuarioAnterior));
          }
          this.limpiar();
        }
        usuarioAnterior = usuarioId;
      });
    });

    // Persiste automáticamente en localStorage cada cambio de los datos
    effect(() => {
      const usuarioId = this.auth.usuarioId();
      const cache = this.instantanea();
      if (!usuarioId || !this.datosListos()) return;
      untracked(() =>
        this.almacenamiento.guardar(CLAVES_ALMACENAMIENTO.cacheDinero(usuarioId), cache),
      );
    });
  }

  // ============================================
  // DERIVADOS
  // ============================================
  private readonly instantanea = computed<CacheDinero>(() => ({
    version: VERSION_CACHE,
    mes: mesActual(),
    configuracion: this.estado.configuracion(),
    cuentas: this.estado.cuentas(),
    categoriasGrandes: this.estado.categoriasGrandes(),
    subcategorias: this.estado.subcategorias(),
    metasAhorro: this.estado.metasAhorro(),
    cortesDelMes: this.estado.cortesDelMes(),
    movimientos: this.estado.movimientos(),
    deudas: this.estado.deudas(),
    deudasPagosDelMes: this.estado.deudasPagosDelMes(),
    gastosFijos: this.estado.gastosFijos(),
    pagosDelMes: this.estado.pagosDelMes(),
  }));

  // ---------- CUENTAS Y PATRIMONIO ----------
  // El saldo de cada cuenta se recalcula con cada transacción: crear, editar o
  // borrar una transacción nunca deja saldos desincronizados
  readonly cuentas = computed<CuentaConSaldo[]>(() =>
    calcularSaldos(this.estado.cuentas(), this.movimientos()),
  );

  private readonly cuentasPorId = computed<Map<string, CuentaConSaldo>>(
    () => new Map(this.cuentas().map((c) => [c.id, c])),
  );

  readonly tarjetasCredito = computed<CuentaConSaldo[]>(() =>
    this.cuentas().filter((c) => c.tipo === 'credito'),
  );

  readonly patrimonio = computed<ResumenPatrimonio>(() => calcularPatrimonio(this.cuentas()));

  // Cuenta que se propone por defecto en los formularios: la primera de débito
  readonly cuentaPrincipalId = computed<string | null>(
    () => (this.cuentas().find((c) => c.tipo === 'debito') ?? this.cuentas()[0])?.id ?? null,
  );

  readonly opcionesCuenta = computed<OpcionSelect[]>(() =>
    this.cuentas().map((c) => ({
      valor: c.id,
      etiqueta: `${c.nombre} · ${ETIQUETAS_TIPO_CUENTA[c.tipo]}`,
    })),
  );

  // ---------- CATEGORÍAS ----------
  readonly categoriasGasto = computed<CategoriaGrande[]>(() =>
    this.categoriasGrandes().filter((c) => c.tipo === 'GASTO'),
  );

  readonly categoriasIngreso = computed<CategoriaGrande[]>(() =>
    this.categoriasGrandes().filter((c) => c.tipo === 'INGRESO'),
  );

  private readonly subcategoriasPorCategoria = computed<Map<string, Subcategoria[]>>(() => {
    const mapa = new Map<string, Subcategoria[]>();
    for (const sub of this.subcategorias()) {
      mapa.set(sub.categoria_grande_id, [...(mapa.get(sub.categoria_grande_id) ?? []), sub]);
    }
    return mapa;
  });

  private readonly categoriasPorId = computed<Map<string, CategoriaGrande>>(
    () => new Map(this.categoriasGrandes().map((c) => [c.id, c])),
  );

  private readonly subcategoriasPorId = computed<Map<string, Subcategoria>>(
    () => new Map(this.subcategorias().map((s) => [s.id, s])),
  );

  // Color de cada categoría: el elegido por el usuario, el de la categoría
  // sugerida con ese nombre o, si no, el siguiente de la paleta según su orden
  private readonly slotPorCategoria = computed<Map<string, SlotColor>>(() => {
    const elegidos = this.preferencias.coloresCategoria();
    return new Map(
      this.categoriasGrandes().map((categoria, i): [string, SlotColor] => [
        categoria.id,
        elegidos[categoria.id] ??
          categoriaPredeterminadaDe(categoria.nombre)?.slot ??
          SLOTS_COLOR[i % SLOTS_COLOR.length],
      ]),
    );
  });

  readonly categoriasSugeridasFaltantes = computed<Record<TipoCategoria, CategoriaPredeterminada[]>>(
    () => ({
      GASTO: this.faltantes('GASTO', this.categoriasGasto()),
      INGRESO: this.faltantes('INGRESO', this.categoriasIngreso()),
    }),
  );

  // ---------- RESUMEN DEL MES ----------
  readonly movimientosDelMes = computed<Transaccion[]>(() => this.movimientosDeMes(mesActual()));

  readonly ingresosMes = computed<number>(() => sumarMontos(this.movimientosDelMes(), 'INGRESO'));

  // Solo transacciones tipo GASTO: los traslados (p. ej. pagar la tarjeta) no son consumo
  readonly gastosMes = computed<number>(() => sumarMontos(this.movimientosDelMes(), 'GASTO'));

  // Patrimonio al cierre de los últimos meses + ingresos y gastos de cada uno
  readonly historicoMensual = computed<ResumenMes[]>(() =>
    resumenUltimosMeses(
      this.movimientos(),
      MESES_HISTORICO,
      this.estado.cuentas().reduce((acc, c) => acc + c.saldo_inicial, 0),
    ),
  );

  readonly comprometidoEsteMes = computed<number>(() => {
    const gastosFijosPendientes = this.gastosFijos()
      .filter((g) => !this.estaPagadoEsteMes(g.id))
      .reduce((acc, g) => acc + g.monto, 0);

    const cuotasPendientes = this.deudas()
      .filter((d) => !this.estaDeudaPagadaEsteMes(d.id))
      .reduce((acc, d) => acc + d.pago_mensual_planeado, 0);

    const cortesPendientes = this.cortesDelMes()
      .filter((c) => !c.pagado)
      .reduce((acc, c) => acc + c.monto_corte, 0);

    return gastosFijosPendientes + cuotasPendientes + cortesPendientes;
  });

  // Préstamos pendientes + lo que se debe en tarjetas de crédito
  readonly deudaTotalPendiente = computed<number>(
    () =>
      this.deudas().reduce((acc, d) => acc + saldoDeudaNormal(d), 0) +
      this.patrimonio().deudaCredito,
  );

  readonly resumenCategorias = computed<ResumenCategoria[]>(() => {
    const ingreso = this.configuracion().ingreso_mensual || 0;
    const gastado = new Map<string, number>();
    for (const t of soloGastos(this.movimientosDelMes())) {
      if (t.categoria_id) gastado.set(t.categoria_id, (gastado.get(t.categoria_id) ?? 0) + t.monto);
    }

    return this.categoriasGasto().map((categoria) => {
      const gastadoCategoria = gastado.get(categoria.id) ?? 0;
      const presupuesto = ingreso * (categoria.porcentaje / PORCENTAJE_TOTAL);
      const porcentajeUsado =
        presupuesto > 0
          ? Math.min((gastadoCategoria / presupuesto) * PORCENTAJE_TOTAL, PORCENTAJE_TOTAL)
          : 0;

      return {
        categoria,
        color: this.colorDeCategoria(categoria.id),
        icono: this.iconoDeCategoria(categoria.nombre),
        subcategorias: this.subcategoriasDe(categoria.id),
        presupuesto,
        gastado: gastadoCategoria,
        disponible: presupuesto - gastadoCategoria,
        porcentajeUsado,
        ...estadoPresupuesto(gastadoCategoria, presupuesto),
      };
    });
  });

  // Disponible para gastar = presupuesto de Ocio/Entretenimiento - lo gastado en ella este mes
  readonly disponibleParaGastar = computed<number>(() => {
    const ocio = this.resumenCategorias().find((r) => {
      const nombre = normalizarTexto(r.categoria.nombre);
      return NOMBRES_CATEGORIA_OCIO.some((clave) => nombre.includes(clave));
    });
    if (ocio && this.configuracion().ingreso_mensual > 0) return ocio.disponible;
    // Sin esa categoría: lo que hay en débito menos lo comprometido del mes
    return this.patrimonio().saldoDisponible - this.comprometidoEsteMes();
  });

  readonly totalPorcentajes = computed<number>(() =>
    this.categoriasGasto().reduce((acc, cg) => acc + cg.porcentaje, 0),
  );

  readonly gruposCategoria = computed<Record<TipoCategoria, GrupoCategoria[]>>(() => ({
    GASTO: this.categoriasGasto().map((c) => this.grupoDe(c)),
    INGRESO: this.categoriasIngreso().map((c) => this.grupoDe(c)),
  }));

  // ============================================
  // CONSULTAS
  // ============================================
  cuenta(id: string | null): CuentaConSaldo | undefined {
    return id ? this.cuentasPorId().get(id) : undefined;
  }

  nombreCuenta(id: string | null): string {
    return this.cuenta(id)?.nombre ?? 'Cuenta eliminada';
  }

  // Cuántas transacciones o gastos fijos usan la cuenta (para impedir borrarla)
  usosDeCuenta(cuentaId: string): number {
    return (
      this.movimientos().filter(
        (t) => t.cuenta_origen_id === cuentaId || t.cuenta_destino_id === cuentaId,
      ).length + this.gastosFijos().filter((g) => g.cuenta_id === cuentaId).length
    );
  }

  subcategoriasDe(categoriaGrandeId: string): Subcategoria[] {
    return this.subcategoriasPorCategoria().get(categoriaGrandeId) ?? [];
  }

  movimientosDeMes(claveMes: string): Transaccion[] {
    return this.movimientos().filter((m) => m.fecha.startsWith(claveMes));
  }

  corteDelMes(cuentaId: string): CorteTarjeta | undefined {
    return this.cortesDelMes().find((c) => c.cuenta_id === cuentaId);
  }

  estaDeudaPagadaEsteMes(deudaId: string): boolean {
    return this.estado.deudasPagosDelMes().some((p) => p.deuda_id === deudaId);
  }

  estaPagadoEsteMes(gastoFijoId: string): boolean {
    return this.estado.pagosDelMes().some((p) => p.gasto_fijo_id === gastoFijoId);
  }

  infoTarjeta(cuenta: Cuenta): InfoTarjeta {
    return calcularInfoTarjeta(cuenta, this.corteDelMes(cuenta.id));
  }

  slotDeCategoria(categoriaId: string): SlotColor {
    return this.slotPorCategoria().get(categoriaId) ?? SLOTS_COLOR[0];
  }

  colorDeCategoria(categoriaId: string): string {
    return colorDeSlot(this.slotDeCategoria(categoriaId));
  }

  iconoDeCategoria(nombre: string): IconDefinition {
    return ICONOS[categoriaPredeterminadaDe(nombre)?.icono ?? 'categoria'];
  }

  // "Alimentación › Mercado"
  etiquetaCategoria(categoriaId: string | null, subcategoriaId: string | null): string | null {
    const categoria = categoriaId ? this.categoriasPorId().get(categoriaId) : undefined;
    if (!categoria) return null;
    const sub = subcategoriaId ? this.subcategoriasPorId().get(subcategoriaId) : undefined;
    return sub ? `${categoria.nombre} › ${sub.nombre}` : categoria.nombre;
  }

  // Título de una transacción en las listas
  tituloTransaccion(t: Transaccion): string {
    if (t.tipo === 'TRASLADO') return t.categoria ?? 'Traslado';
    return this.etiquetaCategoria(t.categoria_id, t.subcategoria_id) ?? t.categoria ?? ETIQUETA_SIN_CATEGORIA;
  }

  // Cuentas involucradas: "Cuenta Débito", "Cuenta Débito → Trii"
  cuentasDeTransaccion(t: Transaccion): string {
    if (t.tipo === 'TRASLADO') {
      return `${this.nombreCuenta(t.cuenta_origen_id)} → ${this.nombreCuenta(t.cuenta_destino_id)}`;
    }
    return this.nombreCuenta(t.tipo === 'GASTO' ? t.cuenta_origen_id : t.cuenta_destino_id);
  }

  // "Cuenta Débito · Mercado del mes"
  detalleTransaccion(t: Transaccion): string {
    const cuentas = this.cuentasDeTransaccion(t);
    return t.descripcion ? `${cuentas} · ${t.descripcion}` : cuentas;
  }

  // Agrupa un gasto en su categoría grande (o en "Otros") con el color de esa categoría
  clasificarGasto(t: Pick<Transaccion, 'categoria_id'>): ClasificacionGasto {
    const categoria = t.categoria_id ? this.categoriasPorId().get(t.categoria_id) : undefined;
    return categoria
      ? { categoria: categoria.nombre, color: this.colorDeCategoria(categoria.id) }
      : { categoria: CATEGORIA_OTROS, color: COLOR_SIN_CATEGORIA };
  }

  // Indicador de color de una fila de transacción
  colorDeTransaccion(t: Transaccion): string {
    if (t.tipo === 'INGRESO') return COLOR_INGRESO;
    if (t.tipo === 'TRASLADO') return COLOR_TRASLADO;
    return this.clasificarGasto(t).color;
  }

  // ============================================
  // CARGA
  // ============================================
  async cargarTodo(): Promise<void> {
    const usuarioId = this.auth.usuarioId();
    await Promise.all([
      this.cargarConfiguracion(),
      this.cargarCuentas(),
      this.cargarCategoriasGrandes(),
      this.cargarMovimientos(),
      this.cargarDeudas(),
      this.cargarGastosFijos(),
      this.cargarMetasAhorro(),
      this.cargarCortesDelMes(),
    ]);
    await this.cargarSubcategorias();
    // Si la sesión cambió mientras cargaba, estos datos ya no son del usuario actual
    if (usuarioId && usuarioId === this.auth.usuarioId()) this.datosListos.set(true);
  }

  // Crea las cuentas base si el usuario no tiene ninguna, y las categorías por
  // defecto si es un usuario nuevo (sin categorías ni transacciones). Así no
  // reaparecen categorías que alguien con historial borró a propósito.
  private async asegurarValoresPorDefecto(): Promise<void> {
    if (!this.datosListos() || this.faltaMigracion()) return;
    const tareas: Promise<MensajeError>[] = [];
    if (this.estado.cuentas().length === 0) tareas.push(this.crearCuentasPredeterminadas());
    if (this.categoriasGrandes().length === 0 && this.movimientos().length === 0) {
      tareas.push(this.crearCategoriasPredeterminadas('GASTO'));
      tareas.push(this.crearCategoriasPredeterminadas('INGRESO'));
    }
    const errores = await Promise.all(tareas);
    errores.filter((e) => e !== null).forEach((e) => console.error(e));
  }

  private restaurarCache(usuarioId: string): void {
    const cache = this.almacenamiento.leer(
      CLAVES_ALMACENAMIENTO.cacheDinero(usuarioId),
      esCacheDinero,
    );
    if (!cache) return;
    // Los cortes y pagos son del mes en que se guardó la copia; si cambió el mes no aplican
    const esDelMes = cache.mes === mesActual();
    this.estado.configuracion.set(cache.configuracion);
    this.estado.cuentas.set(cache.cuentas);
    this.estado.categoriasGrandes.set(cache.categoriasGrandes);
    this.estado.subcategorias.set(cache.subcategorias);
    this.estado.metasAhorro.set(cache.metasAhorro);
    this.estado.movimientos.set(cache.movimientos);
    this.estado.deudas.set(cache.deudas);
    this.estado.gastosFijos.set(cache.gastosFijos);
    this.estado.cortesDelMes.set(esDelMes ? cache.cortesDelMes : []);
    this.estado.deudasPagosDelMes.set(esDelMes ? cache.deudasPagosDelMes : []);
    this.estado.pagosDelMes.set(esDelMes ? cache.pagosDelMes : []);
    this.datosListos.set(true);
  }

  private limpiar(): void {
    this.datosListos.set(false);
    this.estado.configuracion.set(CONFIGURACION_VACIA);
    this.estado.cuentas.set([]);
    this.estado.categoriasGrandes.set([]);
    this.estado.subcategorias.set([]);
    this.estado.metasAhorro.set([]);
    this.estado.cortesDelMes.set([]);
    this.estado.movimientos.set([]);
    this.estado.deudas.set([]);
    this.estado.deudasPagosDelMes.set([]);
    this.estado.gastosFijos.set([]);
    this.estado.pagosDelMes.set([]);
  }

  async cargarConfiguracion(): Promise<void> {
    const { data, error } = await this.db
      .from(TABLAS_DINERO.configuracion)
      .select('*')
      .maybeSingle<Configuracion>();
    if (error) {
      console.error(error);
      return;
    }
    this.estado.configuracion.set(data ?? CONFIGURACION_VACIA);
  }

  async cargarCuentas(): Promise<void> {
    const resultado = await this.db
      .from(TABLAS_DINERO.cuentas)
      .select('*')
      .order('orden', { ascending: true })
      .order('created_at', { ascending: true })
      .overrideTypes<Cuenta[], { merge: false }>();
    this.faltaMigracion.set(CODIGOS_TABLA_INEXISTENTE.includes(resultado.error?.code ?? ''));
    this.aplicarLista(resultado, this.estado.cuentas);
  }

  async cargarCategoriasGrandes(): Promise<void> {
    const resultado = await this.db
      .from(TABLAS_DINERO.categoriasGrandes)
      .select('*')
      .order('orden', { ascending: true })
      .overrideTypes<CategoriaGrande[], { merge: false }>();
    this.aplicarLista(resultado, this.estado.categoriasGrandes);
  }

  async cargarSubcategorias(): Promise<void> {
    if (this.categoriasGrandes().length === 0) {
      this.estado.subcategorias.set([]);
      return;
    }
    const resultado = await this.db
      .from(TABLAS_DINERO.subcategorias)
      .select('*')
      .order('nombre', { ascending: true })
      .overrideTypes<Subcategoria[], { merge: false }>();
    this.aplicarLista(resultado, this.estado.subcategorias);
  }

  async cargarMetasAhorro(): Promise<void> {
    const resultado = await this.db
      .from(TABLAS_DINERO.metasAhorro)
      .select('*')
      .eq('activa', true)
      .order('created_at', { ascending: true })
      .overrideTypes<MetaAhorro[], { merge: false }>();
    this.aplicarLista(resultado, this.estado.metasAhorro);
  }

  async cargarCortesDelMes(): Promise<void> {
    const resultado = await this.db
      .from(TABLAS_DINERO.tarjetaCortes)
      .select('*')
      .eq('mes', mesActual())
      .not('cuenta_id', 'is', null)
      .overrideTypes<CorteTarjeta[], { merge: false }>();
    this.aplicarLista(resultado, this.estado.cortesDelMes);
  }

  async cargarMovimientos(): Promise<void> {
    const resultado = await this.db
      .from(TABLAS_DINERO.movimientos)
      .select('*')
      .order('fecha', { ascending: false })
      .order('created_at', { ascending: false })
      .overrideTypes<Transaccion[], { merge: false }>();
    this.aplicarLista(resultado, this.estado.movimientos);
  }

  async cargarDeudas(): Promise<void> {
    const deudas = await this.db
      .from(TABLAS_DINERO.deudas)
      .select('*')
      .eq('activa', true)
      .eq('tipo', TIPO_DEUDA_NORMAL)
      .order('created_at', { ascending: true })
      .overrideTypes<Deuda[], { merge: false }>();
    if (!this.aplicarLista(deudas, this.estado.deudas)) return;

    const pagos = await this.db
      .from(TABLAS_DINERO.deudasPagos)
      .select('*')
      .eq('mes', mesActual())
      .overrideTypes<DeudaPago[], { merge: false }>();
    this.aplicarLista(pagos, this.estado.deudasPagosDelMes);
  }

  async cargarGastosFijos(): Promise<void> {
    const fijos = await this.db
      .from(TABLAS_DINERO.gastosFijos)
      .select('*')
      .eq('activo', true)
      .order('created_at', { ascending: true })
      .overrideTypes<GastoFijo[], { merge: false }>();
    if (!this.aplicarLista(fijos, this.estado.gastosFijos)) return;

    const pagos = await this.db
      .from(TABLAS_DINERO.gastosFijosPagos)
      .select('*')
      .eq('mes', mesActual())
      .overrideTypes<GastoFijoPago[], { merge: false }>();
    this.aplicarLista(pagos, this.estado.pagosDelMes);
  }

  // ============================================
  // TRANSACCIONES
  // ============================================
  // Los saldos de las cuentas se derivan de las transacciones, así que guardar
  // o borrar una transacción basta para que todos los saldos queden al día.
  guardarTransaccion(payload: TransaccionPayload, id?: string): Promise<MensajeError> {
    return this.conRecarga(this.guardarEnTabla(TABLAS_DINERO.movimientos, payload, id), () =>
      this.cargarMovimientos(),
    );
  }

  eliminarTransaccion(id: string): Promise<MensajeError> {
    return this.conRecarga(this.eliminarDeTabla(TABLAS_DINERO.movimientos, id), () =>
      this.cargarMovimientos(),
    );
  }

  // Crea un ingreso o gasto que lleva el saldo calculado de la cuenta al saldo real
  // indicado. En crédito, `saldoReal` es negativo cuando se debe.
  async registrarAjusteSaldo(cuentaId: string, saldoReal: number): Promise<MensajeError> {
    const cuenta = this.cuenta(cuentaId);
    if (!cuenta) return 'La cuenta no existe';
    const diferencia = saldoReal - cuenta.saldoActual;
    if (Math.abs(diferencia) < DIFERENCIA_MINIMA_AJUSTE) return null;

    const esIngreso = diferencia > 0;
    return this.guardarTransaccion({
      tipo: esIngreso ? 'INGRESO' : 'GASTO',
      monto: Math.abs(diferencia),
      fecha: fechaHoyIso(),
      cuenta_origen_id: esIngreso ? null : cuentaId,
      cuenta_destino_id: esIngreso ? cuentaId : null,
      categoria_id: null,
      subcategoria_id: null,
      categoria: ETIQUETA_AJUSTE_SALDO,
      descripcion: `Ajuste manual: saldo real ${formatoMoneda(saldoReal)}`,
    });
  }

  // ============================================
  // CUENTAS
  // ============================================
  async guardarCuenta(payload: CuentaPayload, id?: string): Promise<MensajeError> {
    const datos: CuentaPayload = id ? payload : { ...payload, orden: this.estado.cuentas().length + 1 };
    return this.conRecarga(this.guardarEnTabla(TABLAS_DINERO.cuentas, datos, id), () =>
      this.cargarCuentas(),
    );
  }

  // Saldo inicial necesario para que el saldo actual de la cuenta sea `saldoActual`
  saldoInicialPara(cuentaId: string | null, saldoActual: number): number {
    const cuenta = this.cuenta(cuentaId);
    return cuenta ? saldoActual - (cuenta.saldoActual - cuenta.saldo_inicial) : saldoActual;
  }

  async eliminarCuenta(cuentaId: string): Promise<MensajeError> {
    const usos = this.usosDeCuenta(cuentaId);
    if (usos > 0) {
      return `La cuenta tiene ${usos} transacciones o gastos fijos asociados. Muévelos a otra cuenta antes de eliminarla.`;
    }
    return this.conRecarga(this.eliminarDeTabla(TABLAS_DINERO.cuentas, cuentaId), () =>
      this.cargarCuentas(),
    );
  }

  private async crearCuentasPredeterminadas(): Promise<MensajeError> {
    const filas: CuentaPayload[] = CUENTAS_PREDETERMINADAS.map((c, i) => ({
      nombre: c.nombre,
      tipo: c.tipo,
      color: c.color,
      saldo_inicial: 0,
      dia_corte: null,
      dia_limite_pago: null,
      orden: i + 1,
    }));
    // ignoreDuplicates: si otra pestaña ya las creó, no falla por el nombre repetido
    const { error } = await this.db
      .from(TABLAS_DINERO.cuentas)
      .upsert(filas, { onConflict: 'user_id,nombre', ignoreDuplicates: true });
    if (error) return error.message;
    await this.cargarCuentas();
    return null;
  }

  // ============================================
  // TARJETAS DE CRÉDITO
  // ============================================
  async guardarCorte(payload: CortePayload): Promise<MensajeError> {
    const { error } = await this.db
      .from(TABLAS_DINERO.tarjetaCortes)
      .upsert(payload, { onConflict: 'cuenta_id,mes' });
    if (error) return error.message;
    await this.cargarCortesDelMes();
    return null;
  }

  // Pagar la tarjeta es un TRASLADO: sale de la cuenta elegida y reduce la deuda
  // de la tarjeta, sin cambiar el patrimonio neto
  async pagarTarjeta(
    tarjeta: Cuenta,
    monto: number,
    cuentaOrigenId: string,
  ): Promise<MensajeError> {
    const { data: transaccion, error } = await this.insertarTransaccion({
      tipo: 'TRASLADO',
      monto,
      fecha: fechaHoyIso(),
      cuenta_origen_id: cuentaOrigenId,
      cuenta_destino_id: tarjeta.id,
      categoria_id: null,
      subcategoria_id: null,
      categoria: ETIQUETA_PAGO_TARJETA,
      descripcion: `Pago ${tarjeta.nombre}`,
    });
    if (error) return error.message;

    const corte = this.corteDelMes(tarjeta.id);
    const errorCorte =
      corte && !corte.pagado
        ? await this.actualizarEnTabla(TABLAS_DINERO.tarjetaCortes, corte.id, {
            pagado: true,
            movimiento_id: transaccion.id,
          })
        : null;

    await Promise.all([this.cargarMovimientos(), this.cargarCortesDelMes()]);
    return errorCorte;
  }

  // ============================================
  // DEUDAS (préstamos)
  // ============================================
  guardarDeuda(payload: DeudaPayload, id?: string): Promise<MensajeError> {
    const datos = id ? payload : { ...payload, tipo: TIPO_DEUDA_NORMAL };
    return this.conRecarga(this.guardarEnTabla(TABLAS_DINERO.deudas, datos, id), () =>
      this.cargarDeudas(),
    );
  }

  eliminarDeuda(id: string): Promise<MensajeError> {
    return this.conRecarga(this.eliminarDeTabla(TABLAS_DINERO.deudas, id), () =>
      this.cargarDeudas(),
    );
  }

  // La cuota es un GASTO de la cuenta elegida (el dinero sale del patrimonio)
  async registrarPagoDeuda(
    deuda: Deuda,
    monto: number,
    cuentaOrigenId: string,
  ): Promise<MensajeError> {
    const errorDeuda = await this.actualizarEnTabla(TABLAS_DINERO.deudas, deuda.id, {
      pagado_acumulado: deuda.pagado_acumulado + monto,
    });
    if (errorDeuda) return errorDeuda;

    const { data: transaccion, error } = await this.insertarTransaccion({
      tipo: 'GASTO',
      monto,
      fecha: fechaHoyIso(),
      cuenta_origen_id: cuentaOrigenId,
      cuenta_destino_id: null,
      categoria_id: null,
      subcategoria_id: null,
      categoria: ETIQUETA_PAGO_DEUDA,
      descripcion: `Pago: ${deuda.nombre}`,
    });
    if (error) return error.message;

    const { error: errorRegistro } = await this.db
      .from(TABLAS_DINERO.deudasPagos)
      .upsert(
        { deuda_id: deuda.id, mes: mesActual(), movimiento_id: transaccion.id },
        { onConflict: 'deuda_id,mes' },
      );

    await Promise.all([this.cargarDeudas(), this.cargarMovimientos()]);
    return errorRegistro?.message ?? null;
  }

  // ============================================
  // GASTOS FIJOS
  // ============================================
  async togglePagoGastoFijo(gasto: GastoFijo, marcarComoPagado: boolean): Promise<MensajeError> {
    const error = marcarComoPagado
      ? await this.registrarPagoGastoFijo(gasto)
      : await this.anularPagoGastoFijo(gasto.id);
    await Promise.all([this.cargarGastosFijos(), this.cargarMovimientos()]);
    return error;
  }

  private async registrarPagoGastoFijo(gasto: GastoFijo): Promise<MensajeError> {
    // Si su cuenta se borró, se paga desde la cuenta principal
    const cuentaId = this.cuenta(gasto.cuenta_id)?.id ?? this.cuentaPrincipalId();
    if (!cuentaId) return 'Crea una cuenta antes de registrar pagos';

    const { data: transaccion, error } = await this.insertarTransaccion({
      tipo: 'GASTO',
      monto: gasto.monto,
      fecha: fechaHoyIso(),
      cuenta_origen_id: cuentaId,
      cuenta_destino_id: null,
      categoria_id: gasto.categoria_id,
      subcategoria_id: gasto.subcategoria_id,
      categoria: gasto.categoria_id ? null : gasto.nombre,
      descripcion: `Pago automático: ${gasto.nombre}`,
    });
    if (error) return error.message;

    const { error: errorPago } = await this.db.from(TABLAS_DINERO.gastosFijosPagos).insert({
      gasto_fijo_id: gasto.id,
      mes: mesActual(),
      movimiento_id: transaccion.id,
    });
    return errorPago?.message ?? null;
  }

  private async anularPagoGastoFijo(gastoFijoId: string): Promise<MensajeError> {
    const pago = this.estado.pagosDelMes().find((p) => p.gasto_fijo_id === gastoFijoId);
    if (!pago) return null;
    if (pago.movimiento_id) {
      const error = await this.eliminarDeTabla(TABLAS_DINERO.movimientos, pago.movimiento_id);
      if (error) return error;
    }
    return this.eliminarDeTabla(TABLAS_DINERO.gastosFijosPagos, pago.id);
  }

  guardarGastoFijo(payload: GastoFijoPayload, id?: string): Promise<MensajeError> {
    return this.conRecarga(this.guardarEnTabla(TABLAS_DINERO.gastosFijos, payload, id), () =>
      this.cargarGastosFijos(),
    );
  }

  // Borrado lógico: conserva el historial de pagos
  eliminarGastoFijo(id: string): Promise<MensajeError> {
    return this.conRecarga(
      this.actualizarEnTabla(TABLAS_DINERO.gastosFijos, id, { activo: false }),
      () => this.cargarGastosFijos(),
    );
  }

  // ============================================
  // PRESUPUESTO Y CATEGORÍAS
  // ============================================
  async guardarConfiguracion(
    ingresoMensual: number,
    porcentajes: PorcentajesPorCategoria,
  ): Promise<MensajeError> {
    const errores = await Promise.all([
      this.guardarIngresoMensual(ingresoMensual),
      ...Object.entries(porcentajes).map(([id, porcentaje]) =>
        this.actualizarEnTabla(TABLAS_DINERO.categoriasGrandes, id, { porcentaje }),
      ),
    ]);
    await Promise.all([this.cargarConfiguracion(), this.cargarCategoriasGrandes()]);
    return errores.find((e) => e !== null) ?? null;
  }

  private async guardarIngresoMensual(ingresoMensual: number): Promise<MensajeError> {
    const { data: existente, error } = await this.db
      .from(TABLAS_DINERO.configuracion)
      .select('id')
      .maybeSingle<FilaConId>();
    if (error) return error.message;
    return this.guardarEnTabla(
      TABLAS_DINERO.configuracion,
      { ingreso_mensual: ingresoMensual },
      existente?.id,
    );
  }

  // `slot` = color elegido para la categoría (se guarda en las preferencias locales)
  async guardarCategoriaGrande(
    payload: CategoriaGrandePayload,
    id?: string,
    slot?: SlotColor,
  ): Promise<MensajeError> {
    const idsPrevios = new Set(this.categoriasGrandes().map((c) => c.id));
    const error = await this.conRecarga(
      this.guardarEnTabla(TABLAS_DINERO.categoriasGrandes, payload, id),
      () => this.recargarCategorias(),
    );
    if (!error && slot) {
      // Una categoría nueva se reconoce como la única que no estaba antes de guardar
      const destino = id ?? this.categoriasGrandes().find((c) => !idsPrevios.has(c.id))?.id;
      if (destino) this.preferencias.asignarColor(destino, slot);
    }
    return error;
  }

  async eliminarCategoriaGrande(id: string): Promise<MensajeError> {
    const error = await this.conRecarga(
      this.eliminarDeTabla(TABLAS_DINERO.categoriasGrandes, id),
      () => this.recargarCategorias(),
    );
    if (!error) this.preferencias.quitarColor(id);
    return error;
  }

  // Crea las categorías sugeridas de ese tipo que aún no existen. Las de gasto usan
  // sus porcentajes sugeridos (suman 100 %) si el presupuesto está vacío; si no,
  // entran en 0 % para no descuadrar la distribución que ya tiene el usuario.
  async crearCategoriasPredeterminadas(tipo: TipoCategoria): Promise<MensajeError> {
    const faltantes = this.categoriasSugeridasFaltantes()[tipo];
    if (faltantes.length === 0) return null;
    const existentes = this.categoriasGrandes().length;
    const presupuestoVacio = this.categoriasGasto().length === 0;
    const filas: CategoriaGrandePayload[] = faltantes.map((sugerida, i) => ({
      nombre: sugerida.nombre,
      tipo,
      porcentaje: tipo === 'GASTO' && presupuestoVacio ? sugerida.porcentaje : 0,
      orden: existentes + i + 1,
    }));
    const { error } = await this.db.from(TABLAS_DINERO.categoriasGrandes).insert(filas);
    if (error) return error.message;
    await this.recargarCategorias();
    return null;
  }

  guardarSubcategoria(nombre: string, categoriaGrandeId: string): Promise<MensajeError> {
    return this.conRecarga(
      this.guardarEnTabla(TABLAS_DINERO.subcategorias, {
        nombre,
        categoria_grande_id: categoriaGrandeId,
      }),
      () => this.cargarSubcategorias(),
    );
  }

  eliminarSubcategoria(id: string): Promise<MensajeError> {
    return this.conRecarga(this.eliminarDeTabla(TABLAS_DINERO.subcategorias, id), () =>
      this.cargarSubcategorias(),
    );
  }

  guardarMeta(payload: MetaAhorroPayload, id?: string): Promise<MensajeError> {
    return this.conRecarga(this.guardarEnTabla(TABLAS_DINERO.metasAhorro, payload, id), () =>
      this.cargarMetasAhorro(),
    );
  }

  eliminarMeta(id: string): Promise<MensajeError> {
    return this.conRecarga(
      this.actualizarEnTabla(TABLAS_DINERO.metasAhorro, id, { activa: false }),
      () => this.cargarMetasAhorro(),
    );
  }

  private async recargarCategorias(): Promise<void> {
    await this.cargarCategoriasGrandes();
    await this.cargarSubcategorias();
  }

  private faltantes(
    tipo: TipoCategoria,
    existentes: readonly CategoriaGrande[],
  ): CategoriaPredeterminada[] {
    const nombres = new Set(existentes.map((c) => normalizarTexto(c.nombre)));
    return CATEGORIAS_PREDETERMINADAS[tipo].filter((c) => !nombres.has(normalizarTexto(c.nombre)));
  }

  // Opciones del selector: la categoría "general" y cada una de sus subcategorías.
  // El valor codifica "categoriaId|subcategoriaId" (ver SelectorCategoriaComponent).
  private grupoDe(categoria: CategoriaGrande): GrupoCategoria {
    const opciones: OpcionSelect[] = [
      { valor: `${categoria.id}|`, etiqueta: `${categoria.nombre} (general)` },
      ...this.subcategoriasDe(categoria.id).map((s) => ({
        valor: `${categoria.id}|${s.id}`,
        etiqueta: s.nombre,
      })),
    ];
    return { categoria, opciones };
  }

  // ============================================
  // HELPERS DE ACCESO A DATOS
  // ============================================
  private aplicarLista<T>(resultado: RespuestaLista<T>, destino: WritableSignal<T[]>): boolean {
    if (resultado.error) {
      console.error(resultado.error);
      return false;
    }
    destino.set(resultado.data ?? []);
    return true;
  }

  // Ejecuta la operación y, si salió bien, recarga los datos afectados
  private async conRecarga(
    operacion: Promise<MensajeError>,
    ...recargas: ReadonlyArray<() => Promise<void>>
  ): Promise<MensajeError> {
    const error = await operacion;
    if (!error) await Promise.all(recargas.map((recargar) => recargar()));
    return error;
  }

  private async insertarTransaccion(
    payload: TransaccionPayload,
  ): Promise<PostgrestSingleResponse<FilaConId>> {
    return this.db.from(TABLAS_DINERO.movimientos).insert(payload).select('id').single<FilaConId>();
  }

  // Inserta si no hay id; actualiza si lo hay
  private async guardarEnTabla<T extends object>(
    tabla: TablaDinero,
    payload: T,
    id?: string,
  ): Promise<MensajeError> {
    const { error } = id
      ? await this.db.from(tabla).update(payload).eq('id', id)
      : await this.db.from(tabla).insert(payload);
    return error?.message ?? null;
  }

  private async actualizarEnTabla<T extends object>(
    tabla: TablaDinero,
    id: string,
    cambios: T,
  ): Promise<MensajeError> {
    const { error } = await this.db.from(tabla).update(cambios).eq('id', id);
    return error?.message ?? null;
  }

  private async eliminarDeTabla(tabla: TablaDinero, id: string): Promise<MensajeError> {
    const { error } = await this.db.from(tabla).delete().eq('id', id);
    return error?.message ?? null;
  }
}
