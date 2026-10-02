// Geometría común de las gráficas SVG (todas usan un viewBox y escalan al ancho disponible)

export interface MargenesGrafica {
  readonly arriba: number;
  readonly derecha: number;
  readonly abajo: number;
  readonly izquierda: number;
}

export interface MarcaEje {
  readonly y: number;
  readonly texto: string;
}

// Radio de la punta redondeada de barras y columnas
export const RADIO_PUNTA = 4;

// Columna que crece desde `base` hacia arriba hasta `y`, con la punta redondeada
// y la base recta (anclada al eje)
export function pathColumna(x: number, y: number, ancho: number, base: number): string {
  const alto = base - y;
  if (alto <= 0) return '';
  const r = Math.min(RADIO_PUNTA, alto, ancho / 2);
  return [
    `M ${x} ${base}`,
    `V ${y + r}`,
    `Q ${x} ${y} ${x + r} ${y}`,
    `H ${x + ancho - r}`,
    `Q ${x + ancho} ${y} ${x + ancho} ${y + r}`,
    `V ${base}`,
    'Z',
  ].join(' ');
}

// Marcas horizontales equiespaciadas entre `minimo` y `maximo`
export function marcasEje(
  minimo: number,
  maximo: number,
  cantidad: number,
  aY: (valor: number) => number,
  formato: (valor: number) => string,
): MarcaEje[] {
  return Array.from({ length: cantidad + 1 }, (_, i) => {
    const valor = minimo + ((maximo - minimo) * i) / cantidad;
    return { y: aY(valor), texto: formato(valor) };
  });
}
