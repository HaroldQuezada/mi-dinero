// Constantes del módulo Mi Dinero

import { NombreIcono } from '../../shared/iconos';
import { OpcionToggle, TabItem } from '../../shared/models/ui.models';
import {
  CategoriaPredeterminada,
  CuentaPredeterminada,
  SlotColor,
  TabDinero,
  TipoCategoria,
  TipoCuenta,
  TipoMovimiento,
} from './dinero.models';

export const TABLAS_DINERO = {
  configuracion: 'configuracion',
  cuentas: 'cuentas',
  categoriasGrandes: 'categorias_grandes',
  subcategorias: 'subcategorias',
  metasAhorro: 'metas_ahorro',
  tarjetaCortes: 'tarjeta_cortes',
  movimientos: 'movimientos',
  deudas: 'deudas',
  deudasPagos: 'deudas_pagos',
  gastosFijos: 'gastos_fijos',
  gastosFijosPagos: 'gastos_fijos_pagos',
} as const;

export type TablaDinero = (typeof TABLAS_DINERO)[keyof typeof TABLAS_DINERO];

// Orden padre -> hijo: así se insertan al restaurar un respaldo (y al revés se borran)
export const ORDEN_TABLAS_RESPALDO: readonly TablaDinero[] = [
  TABLAS_DINERO.configuracion,
  TABLAS_DINERO.cuentas,
  TABLAS_DINERO.categoriasGrandes,
  TABLAS_DINERO.subcategorias,
  TABLAS_DINERO.metasAhorro,
  TABLAS_DINERO.deudas,
  TABLAS_DINERO.gastosFijos,
  TABLAS_DINERO.movimientos,
  TABLAS_DINERO.tarjetaCortes,
  TABLAS_DINERO.deudasPagos,
  TABLAS_DINERO.gastosFijosPagos,
];

export const TAB_POR_DEFECTO: TabDinero = 'dashboard';

export const TABS_DINERO: readonly TabItem<TabDinero>[] = [
  { id: 'dashboard', etiqueta: 'Dashboard' },
  { id: 'movimientos', etiqueta: 'Movimientos' },
  { id: 'cuentas', etiqueta: 'Cuentas' },
  { id: 'deudas', etiqueta: 'Deudas' },
  { id: 'gastos-fijos', etiqueta: 'Gastos fijos' },
  { id: 'presupuesto', etiqueta: 'Presupuesto' },
];

// ---------- TRANSACCIONES ----------
export const TIPOS_MOVIMIENTO: readonly OpcionToggle<TipoMovimiento>[] = [
  { valor: 'GASTO', etiqueta: 'Gasto', variante: 'negativo' },
  { valor: 'INGRESO', etiqueta: 'Ingreso', variante: 'positivo' },
  { valor: 'TRASLADO', etiqueta: 'Traslado', variante: 'neutro' },
];

export const TIPO_MOVIMIENTO_POR_DEFECTO: TipoMovimiento = 'GASTO';

export const ETIQUETAS_TIPO_MOVIMIENTO: Record<TipoMovimiento, string> = {
  GASTO: 'Gasto',
  INGRESO: 'Ingreso',
  TRASLADO: 'Traslado',
};

// Qué cuentas pide cada tipo de transacción
export const CUENTAS_POR_TIPO: Record<TipoMovimiento, { origen: boolean; destino: boolean }> = {
  GASTO: { origen: true, destino: false },
  INGRESO: { origen: false, destino: true },
  TRASLADO: { origen: true, destino: true },
};

export const CANTIDAD_ULTIMOS_MOVIMIENTOS = 5;

// Etiquetas de las transacciones que genera la app sin categoría
export const ETIQUETA_AJUSTE_SALDO = 'Ajuste de saldo';
export const ETIQUETA_PAGO_DEUDA = 'Pago de deuda';
export const ETIQUETA_PAGO_TARJETA = 'Pago de tarjeta';
export const ETIQUETA_SIN_CATEGORIA = 'Sin categoría';
// Agrupa en las gráficas los gastos que no pertenecen a ninguna categoría del presupuesto
export const CATEGORIA_OTROS = 'Otros';

// La categoría de gasto cuyo nombre contenga alguno de estos textos define el
// "disponible para gastar"
export const NOMBRES_CATEGORIA_OCIO: readonly string[] = ['ocio', 'entretenimiento'];

// ---------- CUENTAS ----------
export const TIPOS_CUENTA: readonly OpcionToggle<TipoCuenta>[] = [
  { valor: 'debito', etiqueta: 'Débito' },
  { valor: 'credito', etiqueta: 'Crédito' },
  { valor: 'inversion', etiqueta: 'Inversión' },
  { valor: 'ahorro', etiqueta: 'Ahorro' },
];

export const ETIQUETAS_TIPO_CUENTA: Record<TipoCuenta, string> = {
  debito: 'Débito',
  credito: 'Crédito',
  inversion: 'Inversión',
  ahorro: 'Ahorro',
};

export const ICONOS_TIPO_CUENTA: Record<TipoCuenta, NombreIcono> = {
  debito: 'cuentaDebito',
  credito: 'tarjeta',
  inversion: 'inversion',
  ahorro: 'ahorro',
};

// Se crean automáticamente si el usuario no tiene ninguna cuenta
export const CUENTAS_PREDETERMINADAS: readonly CuentaPredeterminada[] = [
  { nombre: 'Cuenta Débito', tipo: 'debito', color: 1 },
  { nombre: 'Tarjeta de Crédito', tipo: 'credito', color: 8 },
  { nombre: 'Trii', tipo: 'inversion', color: 7 },
  { nombre: 'Bolsillo de Ahorro', tipo: 'ahorro', color: 3 },
];

// ---------- CATEGORÍAS ----------
// Paleta categórica (definida en styles.css para cada tema). El orden es fijo: está
// validado para que colores vecinos se distingan también con daltonismo.
export const SLOTS_COLOR: readonly SlotColor[] = [1, 2, 3, 4, 5, 6, 7, 8];

export function colorDeSlot(slot: SlotColor): string {
  return `var(--serie-${slot})`;
}

// Color para lo que no pertenece a ninguna categoría (ajustes, pagos de deuda...)
export const COLOR_SIN_CATEGORIA = 'var(--color-texto-suave)';
export const COLOR_INGRESO = 'var(--color-positivo)';
export const COLOR_TRASLADO = 'var(--color-primario)';

// Se cargan para usuarios nuevos. Los porcentajes de gasto suman 100 %.
export const CATEGORIAS_PREDETERMINADAS: Record<TipoCategoria, readonly CategoriaPredeterminada[]> = {
  GASTO: [
    { nombre: 'Alimentación', porcentaje: 30, slot: 2, icono: 'alimentacion' },
    { nombre: 'Servicios', porcentaje: 25, slot: 7, icono: 'servicios' },
    { nombre: 'Transporte', porcentaje: 15, slot: 1, icono: 'transporte' },
    { nombre: 'Entretenimiento', porcentaje: 20, slot: 5, icono: 'ocio' },
    { nombre: 'Salud', porcentaje: 10, slot: 8, icono: 'salud' },
  ],
  INGRESO: [
    { nombre: 'Salario', porcentaje: 0, slot: 3, icono: 'salario' },
    { nombre: 'Venta', porcentaje: 0, slot: 1, icono: 'categoria' },
    { nombre: 'Regalo', porcentaje: 0, slot: 5, icono: 'categoria' },
    { nombre: 'Otro ingreso', porcentaje: 0, slot: 4, icono: 'categoria' },
  ],
};

// Meses que muestran las gráficas comparativas del dashboard
export const MESES_HISTORICO = 6;

export const PORCENTAJE_TOTAL = 100;
export const TOLERANCIA_PORCENTAJE = 0.5;
export const UMBRAL_ADVERTENCIA_PRESUPUESTO = 0.8;
export const DIAS_AVISO_VENCIMIENTO = 5;
// Diferencias de saldo menores a esto no generan ajuste
export const DIFERENCIA_MINIMA_AJUSTE = 1;

// ---------- PERSISTENCIA LOCAL Y RESPALDO ----------
// Subir si cambia la forma de CacheDinero: los cachés viejos se descartan
export const VERSION_CACHE = 2;

export const FORMATO_RESPALDO = 'mi-vida/dinero';
// v2: multicuenta. Los respaldos v1 no traen cuentas y no se pueden importar.
export const VERSION_RESPALDO = 2;
export const PREFIJO_ARCHIVO_RESPALDO = 'mi-dinero-respaldo';
export const PREFIJO_ARCHIVO_SEGURIDAD = 'mi-dinero-antes-de-importar';

// Supabase devuelve como máximo 1000 filas por consulta
export const TAMANO_PAGINA_LECTURA = 1000;
export const TAMANO_LOTE_ESCRITURA = 500;
