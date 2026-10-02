// Utilidades compartidas de formato y fechas

import { LOCALE } from './constantes';

const MILISEGUNDOS_POR_DIA = 1000 * 60 * 60 * 24;

function dosDigitos(numero: number): string {
  return String(numero).padStart(2, '0');
}

export function formatoMoneda(numero: number | null | undefined): string {
  const n = Number(numero) || 0;
  return '$' + n.toLocaleString(LOCALE, { maximumFractionDigits: 0 });
}

const FORMATO_COMPACTO = new Intl.NumberFormat(LOCALE, {
  notation: 'compact',
  maximumFractionDigits: 1,
});

// 1250000 -> "$1,3 M". Para ejes y etiquetas de gráficas donde no cabe la cifra completa.
export function formatoMonedaCompacta(numero: number): string {
  const signo = numero < 0 ? '-' : '';
  return `${signo}$${FORMATO_COMPACTO.format(Math.abs(numero))}`;
}

// Variación porcentual de `actual` frente a `anterior`; null si no hay base de comparación
export function variacionPorcentual(actual: number, anterior: number): number | null {
  if (anterior === 0) return null;
  return ((actual - anterior) / Math.abs(anterior)) * 100;
}

// Texto sin tildes y en minúsculas, para comparar nombres escritos por el usuario
export function normalizarTexto(texto: string): string {
  return texto.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();
}

// YYYY-MM-DD en hora local. toISOString() usa UTC y en Colombia (UTC-5)
// adelanta la fecha un día después de las 7 p. m.
export function fechaIsoLocal(fecha: Date): string {
  return `${fecha.getFullYear()}-${dosDigitos(fecha.getMonth() + 1)}-${dosDigitos(fecha.getDate())}`;
}

// YYYY-MM
export function claveMes(fecha: Date): string {
  return `${fecha.getFullYear()}-${dosDigitos(fecha.getMonth() + 1)}`;
}

export function mesActual(): string {
  return claveMes(new Date());
}

export function fechaHoyIso(): string {
  return fechaIsoLocal(new Date());
}

// Interpreta YYYY-MM-DD como fecha local (evita desfase UTC)
export function fechaDesdeIso(fechaIso: string): Date {
  const [anio, mes, dia] = fechaIso.split('-').map(Number);
  return new Date(anio, mes - 1, dia);
}

// Crea una fecha ajustando el día al último del mes si no existe (ej. 31 de febrero)
export function fechaConDia(anio: number, mes: number, dia: number): Date {
  const ultimoDia = new Date(anio, mes + 1, 0).getDate();
  return new Date(anio, mes, Math.min(dia, ultimoDia));
}

// Primer día del mes desplazado `delta` meses. Usar el día 1 evita que
// sumar un mes al 31 salte al mes siguiente.
export function mesRelativo(fecha: Date, delta: number): Date {
  return new Date(fecha.getFullYear(), fecha.getMonth() + delta, 1);
}

export function diasHasta(desde: Date, hasta: Date): number {
  return Math.ceil((hasta.getTime() - desde.getTime()) / MILISEGUNDOS_POR_DIA);
}

export function formatoFecha(fechaIso: string): string {
  const [anio, mes, dia] = fechaIso.split('-');
  return `${dia}/${mes}/${anio}`;
}

export function diaSemanaIso(fechaIso: string): number {
  // 0=domingo ... 6=sábado
  return fechaDesdeIso(fechaIso).getDay();
}

export function formatoFechaLarga(fechaIso: string): string {
  return fechaDesdeIso(fechaIso).toLocaleDateString(LOCALE, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
}

export function formatoMesAnio(fecha: Date): string {
  return fecha.toLocaleDateString(LOCALE, { month: 'long', year: 'numeric' });
}

// "oct"
export function formatoMesCorto(fecha: Date): string {
  return fecha.toLocaleDateString(LOCALE, { month: 'short' }).replace('.', '');
}

export function formatoMesCortoAnio(fecha: Date): string {
  return fecha.toLocaleDateString(LOCALE, { month: 'short', year: 'numeric' });
}

export function formatoDiaMes(fecha: Date): string {
  return fecha.toLocaleDateString(LOCALE, { day: 'numeric', month: 'long' });
}
