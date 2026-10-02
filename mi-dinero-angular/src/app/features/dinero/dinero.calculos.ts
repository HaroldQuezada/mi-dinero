// Cálculos puros del módulo Mi Dinero (sin estado ni acceso a BD)

import {
  claveMes,
  diasHasta,
  fechaConDia,
  fechaIsoLocal,
  formatoDiaMes,
  formatoFecha,
  formatoMesAnio,
  formatoMesCorto,
  formatoMesCortoAnio,
  mesRelativo,
  normalizarTexto,
} from '../../core/utils';
import {
  CATEGORIAS_PREDETERMINADAS,
  CUENTAS_POR_TIPO,
  DIAS_AVISO_VENCIMIENTO,
  PORCENTAJE_TOTAL,
  TOLERANCIA_PORCENTAJE,
  UMBRAL_ADVERTENCIA_PRESUPUESTO,
} from './dinero.constantes';
import {
  AvisoSuma,
  BorradorTransaccion,
  CategoriaPredeterminada,
  CorteTarjeta,
  Cuenta,
  CuentaConSaldo,
  Deuda,
  EstadoPresupuesto,
  GastoCategoria,
  InfoDeudaNormal,
  InfoMeta,
  InfoTarjeta,
  MetaAhorro,
  ResultadoValidacion,
  ResumenMes,
  ResumenPatrimonio,
  TipoCategoria,
  TipoMovimiento,
  Transaccion,
  TransaccionPayload,
} from './dinero.models';

// Grupo y color al que pertenece un gasto en las gráficas
export interface ClasificacionGasto {
  categoria: string;
  color: string;
}

// ---------- TRANSACCIONES ----------
export function sumarMontos(transacciones: readonly Transaccion[], tipo: TipoMovimiento): number {
  return transacciones.filter((t) => t.tipo === tipo).reduce((acc, t) => acc + t.monto, 0);
}

// Solo los gastos: los traslados mueven dinero entre cuentas pero no son consumo
export function soloGastos(transacciones: readonly Transaccion[]): Transaccion[] {
  return transacciones.filter((t) => t.tipo === 'GASTO');
}

// Efecto de la transacción sobre el patrimonio total: los traslados suman cero
export function efectoNeto(transaccion: Transaccion): number {
  if (transaccion.tipo === 'INGRESO') return transaccion.monto;
  if (transaccion.tipo === 'GASTO') return -transaccion.monto;
  return 0;
}

// Saldo actual de cada cuenta = saldo inicial + efecto de todas sus transacciones.
// Funciona igual para los tres tipos: lo que sale del origen resta y lo que
// entra al destino suma (un traslado hace ambas cosas).
export function calcularSaldos(
  cuentas: readonly Cuenta[],
  transacciones: readonly Transaccion[],
): CuentaConSaldo[] {
  const saldos = new Map(cuentas.map((c) => [c.id, c.saldo_inicial]));
  const sumar = (cuentaId: string | null, delta: number): void => {
    if (cuentaId !== null && saldos.has(cuentaId)) saldos.set(cuentaId, (saldos.get(cuentaId) ?? 0) + delta);
  };
  for (const t of transacciones) {
    sumar(t.cuenta_destino_id, t.monto);
    sumar(t.cuenta_origen_id, -t.monto);
  }
  return cuentas.map((c) => ({ ...c, saldoActual: saldos.get(c.id) ?? c.saldo_inicial }));
}

// Patrimonio neto = (débito + inversión + ahorro) - lo que se debe en crédito
export function calcularPatrimonio(cuentas: readonly CuentaConSaldo[]): ResumenPatrimonio {
  let activos = 0;
  let deudaCredito = 0;
  let saldoDisponible = 0;
  for (const cuenta of cuentas) {
    if (cuenta.tipo === 'credito') {
      deudaCredito += deudaDeCredito(cuenta);
      continue;
    }
    activos += cuenta.saldoActual;
    if (cuenta.tipo === 'debito') saldoDisponible += cuenta.saldoActual;
  }
  return { activos, deudaCredito, patrimonioNeto: activos - deudaCredito, saldoDisponible };
}

// En crédito el saldo es negativo cuando se debe; la deuda se muestra en positivo
export function deudaDeCredito(cuenta: CuentaConSaldo): number {
  return -cuenta.saldoActual;
}

// Valida el formulario según el tipo y arma el payload, dejando en null los
// campos que ese tipo no usa (p. ej. la categoría en un traslado)
export function construirTransaccion(
  borrador: BorradorTransaccion,
): ResultadoValidacion<TransaccionPayload> {
  const { tipo, monto } = borrador;
  const requiere = CUENTAS_POR_TIPO[tipo];
  const origen = requiere.origen ? borrador.cuentaOrigenId : null;
  const destino = requiere.destino ? borrador.cuentaDestinoId : null;
  const usaCategoria = tipo !== 'TRASLADO';

  if (!monto || monto <= 0) return { ok: false, error: 'Ingresa un monto mayor a cero' };
  if (!borrador.fecha) return { ok: false, error: 'Elige la fecha' };
  if (requiere.origen && !origen) return { ok: false, error: 'Elige la cuenta de origen' };
  if (requiere.destino && !destino) return { ok: false, error: 'Elige la cuenta de destino' };
  if (origen && origen === destino) {
    return { ok: false, error: 'La cuenta de origen y la de destino deben ser distintas' };
  }
  if (usaCategoria && !borrador.categoria.categoriaId) return { ok: false, error: 'Elige una categoría' };

  return {
    ok: true,
    valor: {
      tipo,
      monto,
      fecha: borrador.fecha,
      cuenta_origen_id: origen,
      cuenta_destino_id: destino,
      categoria_id: usaCategoria ? borrador.categoria.categoriaId : null,
      subcategoria_id: usaCategoria ? borrador.categoria.subcategoriaId : null,
      descripcion: borrador.descripcion.trim() || null,
      categoria: null,
    },
  };
}

export function agruparGastos(
  transacciones: readonly Transaccion[],
  clave: (t: Transaccion) => string | null,
): Map<string, number> {
  const totales = new Map<string, number>();
  for (const t of soloGastos(transacciones)) {
    const grupo = clave(t);
    if (grupo !== null) totales.set(grupo, (totales.get(grupo) ?? 0) + t.monto);
  }
  return totales;
}

// Gastos agrupados según `clasificar` (p. ej. por categoría grande), de mayor a menor.
// El color lo decide la clasificación, así cada categoría conserva su color en todo el módulo.
export function calcularGastosGrafica(
  transacciones: readonly Transaccion[],
  clasificar: (t: Transaccion) => ClasificacionGasto,
): GastoCategoria[] {
  const grupos = new Map<string, GastoCategoria>();
  for (const t of soloGastos(transacciones)) {
    const { categoria, color } = clasificar(t);
    const actual = grupos.get(categoria);
    grupos.set(categoria, { categoria, color, porcentaje: 0, monto: (actual?.monto ?? 0) + t.monto });
  }
  const ordenados = [...grupos.values()].sort((a, b) => b.monto - a.monto);
  const total = ordenados.reduce((acc, g) => acc + g.monto, 0);
  return ordenados.map((g) => ({
    ...g,
    porcentaje: total > 0 ? (g.monto / total) * PORCENTAJE_TOTAL : 0,
  }));
}

// Ingresos, gastos y patrimonio al cierre de los últimos `cantidad` meses (el
// último es `referencia`). `saldoBase` es la suma de saldos iniciales de las cuentas.
export function resumenUltimosMeses(
  transacciones: readonly Transaccion[],
  cantidad: number,
  saldoBase: number,
  referencia: Date = new Date(),
): ResumenMes[] {
  const meses = Array.from({ length: cantidad }, (_, i) => mesRelativo(referencia, i - cantidad + 1));
  const primeraClave = claveMes(meses[0]);

  // Lo anterior al primer mes se resume en el saldo de partida
  let balance = saldoBase;
  const porMes = new Map<string, { ingresos: number; gastos: number }>();
  for (const t of transacciones) {
    if (t.tipo === 'TRASLADO') continue;
    const clave = t.fecha.slice(0, 7);
    if (clave < primeraClave) {
      balance += efectoNeto(t);
      continue;
    }
    const totales = porMes.get(clave) ?? { ingresos: 0, gastos: 0 };
    if (t.tipo === 'INGRESO') totales.ingresos += t.monto;
    else totales.gastos += t.monto;
    porMes.set(clave, totales);
  }

  return meses.map((mes) => {
    const clave = claveMes(mes);
    const { ingresos, gastos } = porMes.get(clave) ?? { ingresos: 0, gastos: 0 };
    balance += ingresos - gastos;
    return {
      clave,
      etiqueta: formatoMesCorto(mes),
      etiquetaLarga: formatoMesAnio(mes),
      ingresos,
      gastos,
      neto: ingresos - gastos,
      balanceCierre: balance,
    };
  });
}

// Límite superior "redondo" del eje (1, 2, 2.5 o 5 × 10^n) para que las marcas sean legibles
export function maximoEjeRedondo(valor: number): number {
  if (valor <= 0) return 1;
  const magnitud = 10 ** Math.floor(Math.log10(valor));
  const escalon = [1, 2, 2.5, 5, 10].find((e) => e * magnitud >= valor) ?? 10;
  return escalon * magnitud;
}

// ---------- DEUDAS ----------
export function saldoDeudaNormal(deuda: Deuda): number {
  return Math.max(deuda.monto_total - deuda.pagado_acumulado, 0);
}

export function calcularInfoDeudaNormal(deuda: Deuda): InfoDeudaNormal {
  const saldoRestante = saldoDeudaNormal(deuda);
  const porcentaje =
    deuda.monto_total > 0
      ? Math.min((deuda.pagado_acumulado / deuda.monto_total) * PORCENTAJE_TOTAL, PORCENTAJE_TOTAL)
      : 0;
  const mesesFaltantes =
    deuda.pago_mensual_planeado > 0 ? Math.ceil(saldoRestante / deuda.pago_mensual_planeado) : 0;
  const fechaEstimada =
    saldoRestante <= 0 ? 'Pagada' : formatoMesCortoAnio(mesRelativo(new Date(), mesesFaltantes));
  return { saldoRestante, porcentaje, fechaEstimada };
}

// ---------- TARJETAS DE CRÉDITO ----------
export function calcularInfoTarjeta(cuenta: Cuenta, corte: CorteTarjeta | undefined): InfoTarjeta {
  const pagado = corte?.pagado ?? false;
  let fechaLimiteTexto = 'Sin configurar';
  let alertaVencimiento = '';

  if (cuenta.dia_limite_pago) {
    const hoy = new Date();
    let fechaLimite = fechaConDia(hoy.getFullYear(), hoy.getMonth(), cuenta.dia_limite_pago);
    if (fechaLimite < hoy && !pagado) {
      fechaLimite = fechaConDia(hoy.getFullYear(), hoy.getMonth() + 1, cuenta.dia_limite_pago);
    }
    fechaLimiteTexto = formatoDiaMes(fechaLimite);

    const diasRestantes = diasHasta(hoy, fechaLimite);
    if (!pagado && corte && corte.monto_corte > 0) {
      if (diasRestantes <= 0) {
        alertaVencimiento = '⚠ Fecha límite vencida';
      } else if (diasRestantes <= DIAS_AVISO_VENCIMIENTO) {
        alertaVencimiento = `⚠ Vence en ${diasRestantes} día${diasRestantes === 1 ? '' : 's'}`;
      }
    }
  }

  return {
    fechaLimiteTexto,
    alertaVencimiento,
    montoCorte: corte?.monto_corte ?? 0,
    tieneCorte: corte !== undefined,
    pagado,
  };
}

// Próxima fecha límite a partir del día configurado en la tarjeta (YYYY-MM-DD)
export function fechaLimiteSugerida(diaLimite: number | null): string {
  if (!diaLimite) return '';
  const hoy = new Date();
  let fecha = fechaConDia(hoy.getFullYear(), hoy.getMonth(), diaLimite);
  if (fecha < hoy) fecha = fechaConDia(hoy.getFullYear(), hoy.getMonth() + 1, diaLimite);
  return fechaIsoLocal(fecha);
}

// ---------- PRESUPUESTO ----------
export function estadoPresupuesto(gastado: number, presupuesto: number): EstadoPresupuesto {
  if (presupuesto <= 0) return { estado: 'ok', alerta: '' };
  if (gastado > presupuesto) return { estado: 'excedido', alerta: '⚠ Excedido' };
  if (gastado / presupuesto >= UMBRAL_ADVERTENCIA_PRESUPUESTO) {
    return { estado: 'advertencia', alerta: '⚠ Cerca del límite' };
  }
  return { estado: 'ok', alerta: '' };
}

export function sumaPorcentajesCorrecta(suma: number): boolean {
  return Math.abs(suma - PORCENTAJE_TOTAL) <= TOLERANCIA_PORCENTAJE;
}

export function avisoSumaPorcentajes(suma: number): AvisoSuma {
  return sumaPorcentajesCorrecta(suma)
    ? { texto: '✓ Los porcentajes suman 100%', correcta: true }
    : { texto: `⚠ Los porcentajes suman ${suma}% (deben sumar 100%)`, correcta: false };
}

// ---------- CATEGORÍAS ----------
export function categoriaPredeterminadaDe(nombre: string): CategoriaPredeterminada | undefined {
  const buscado = normalizarTexto(nombre);
  const tipos: readonly TipoCategoria[] = ['GASTO', 'INGRESO'];
  return tipos
    .flatMap((tipo) => CATEGORIAS_PREDETERMINADAS[tipo])
    .find((c) => normalizarTexto(c.nombre) === buscado);
}

// ---------- METAS ----------
export function calcularInfoMeta(meta: MetaAhorro): InfoMeta {
  const porcentaje =
    meta.valor_objetivo > 0
      ? Math.min((meta.valor_ahorrado / meta.valor_objetivo) * PORCENTAJE_TOTAL, PORCENTAJE_TOTAL)
      : 0;
  const falta = Math.max(meta.valor_objetivo - meta.valor_ahorrado, 0);
  const fechaObjetivoTexto = meta.fecha_objetivo ? ` · Meta: ${formatoFecha(meta.fecha_objetivo)}` : '';
  return { porcentaje, falta, fechaObjetivoTexto };
}
