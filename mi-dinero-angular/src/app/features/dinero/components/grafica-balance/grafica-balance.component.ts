import { Component, computed, inject, signal } from '@angular/core';
import { formatoMonedaCompacta } from '../../../../core/utils';
import { MonedaPipe } from '../../../../shared/pipes/moneda.pipe';
import { MarcaEje, marcasEje, MargenesGrafica } from '../../../../shared/utils/graficas';
import { maximoEjeRedondo } from '../../dinero.calculos';
import { colorDeSlot } from '../../dinero.constantes';
import { ResumenMes } from '../../dinero.models';
import { DineroService } from '../../dinero.service';

const ANCHO = 600;
const ALTO = 240;
// A la derecha queda espacio para la etiqueta del último valor
const MARGENES: MargenesGrafica = { arriba: 16, derecha: 64, abajo: 28, izquierda: 56 };
const CANTIDAD_MARCAS = 4;

const BASE = ALTO - MARGENES.abajo;
const ALTO_UTIL = BASE - MARGENES.arriba;
const ANCHO_UTIL = ANCHO - MARGENES.izquierda - MARGENES.derecha;

interface PuntoBalance {
  mes: ResumenMes;
  x: number;
  y: number;
  banda: { x: number; ancho: number };
}

// Línea con área: patrimonio neto al cierre de cada mes (los traslados no lo cambian)
@Component({
  selector: 'app-grafica-balance',
  imports: [MonedaPipe],
  templateUrl: './grafica-balance.component.html',
})
export class GraficaBalanceComponent {
  private readonly service = inject(DineroService);

  protected readonly viewBox = `0 0 ${ANCHO} ${ALTO}`;
  protected readonly base = BASE;
  protected readonly inicioX = MARGENES.izquierda;
  protected readonly finX = ANCHO - MARGENES.derecha;
  protected readonly arriba = MARGENES.arriba;
  protected readonly color = colorDeSlot(1);

  protected readonly meses = this.service.historicoMensual;
  protected readonly indiceActivo = signal<number | null>(null);

  protected readonly hayDatos = computed<boolean>(() => this.service.movimientos().length > 0);

  // Rango del eje: siempre incluye el 0 para que se vea si el balance pasa a negativo
  private readonly rango = computed<{ minimo: number; maximo: number }>(() => {
    const valores = this.meses().map((m) => m.balanceCierre);
    const maximo = Math.max(0, ...valores);
    const minimo = Math.min(0, ...valores);
    return {
      maximo: maximo > 0 ? maximoEjeRedondo(maximo) : 0,
      minimo: minimo < 0 ? -maximoEjeRedondo(-minimo) : 0,
    };
  });

  protected readonly marcas = computed<MarcaEje[]>(() => {
    const { minimo, maximo } = this.rango();
    return marcasEje(minimo, maximo, CANTIDAD_MARCAS, (v) => this.aY(v), formatoMonedaCompacta);
  });

  protected readonly yCero = computed<number>(() => this.aY(0));

  protected readonly puntos = computed<PuntoBalance[]>(() => {
    const meses = this.meses();
    const anchoBanda = ANCHO_UTIL / meses.length;
    return meses.map((mes, i) => ({
      mes,
      x: MARGENES.izquierda + anchoBanda * (i + 0.5),
      y: this.aY(mes.balanceCierre),
      banda: { x: MARGENES.izquierda + anchoBanda * i, ancho: anchoBanda },
    }));
  });

  protected readonly linea = computed<string>(() =>
    this.puntos()
      .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`)
      .join(' '),
  );

  protected readonly area = computed<string>(() => {
    const puntos = this.puntos();
    if (puntos.length === 0) return '';
    const cero = this.yCero();
    return `${this.linea()} L ${puntos[puntos.length - 1].x} ${cero} L ${puntos[0].x} ${cero} Z`;
  });

  protected readonly ultimo = computed<PuntoBalance | null>(() => this.puntos().at(-1) ?? null);

  protected readonly puntoActivo = computed<PuntoBalance | null>(() => {
    const indice = this.indiceActivo();
    return indice === null ? null : (this.puntos()[indice] ?? null);
  });

  protected readonly mesLeido = computed<ResumenMes | null>(
    () => (this.puntoActivo() ?? this.ultimo())?.mes ?? null,
  );

  protected readonly textoUltimo = computed<string>(() =>
    formatoMonedaCompacta(this.ultimo()?.mes.balanceCierre ?? 0),
  );

  private aY(valor: number): number {
    const { minimo, maximo } = this.rango();
    const amplitud = maximo - minimo || 1;
    return BASE - ((valor - minimo) / amplitud) * ALTO_UTIL;
  }
}
