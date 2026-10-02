import { Component, computed, inject, signal } from '@angular/core';
import { FaIconComponent } from '@fortawesome/angular-fontawesome';
import { claveMes, formatoMesAnio, mesRelativo } from '../../../../core/utils';
import { ICONOS } from '../../../../shared/iconos';
import { FechaCortaPipe } from '../../../../shared/pipes/fecha-corta.pipe';
import { MonedaPipe } from '../../../../shared/pipes/moneda.pipe';
import { PorcentajePipe } from '../../../../shared/pipes/porcentaje.pipe';
import { calcularGastosGrafica, soloGastos } from '../../dinero.calculos';
import { PORCENTAJE_TOTAL } from '../../dinero.constantes';
import { DetalleCategoria, GastoCategoria, SegmentoPastel, Transaccion } from '../../dinero.models';
import { DineroService } from '../../dinero.service';
import { MontoMovimientoComponent } from '../monto-movimiento/monto-movimiento.component';

// Geometría del SVG (viewBox 0 0 150 150)
const RADIO = 70;
const CENTRO = 75;
const FACTOR_RADIO_ETIQUETA = 0.65;
// Segmentos menores a esta fracción no muestran su porcentaje
const FRACCION_MINIMA_ETIQUETA = 0.08;
// A partir de esta fracción se dibuja el círculo completo
const FRACCION_CIRCULO_COMPLETO = 0.999;

function puntoEnCirculo(radio: number, anguloGrados: number): { x: number; y: number } {
  const radianes = (Math.PI / 180) * anguloGrados;
  return { x: CENTRO + radio * Math.cos(radianes), y: CENTRO + radio * Math.sin(radianes) };
}

@Component({
  selector: 'app-grafica-categorias',
  imports: [FaIconComponent, MonedaPipe, FechaCortaPipe, PorcentajePipe, MontoMovimientoComponent],
  templateUrl: './grafica-categorias.component.html',
  styleUrl: './grafica-categorias.component.css',
})
export class GraficaCategoriasComponent {
  protected readonly service = inject(DineroService);
  protected readonly iconos = ICONOS;

  protected readonly mes = signal<Date>(mesRelativo(new Date(), 0));
  protected readonly categoriaSeleccionada = signal<string | null>(null);

  protected readonly titulo = computed<string>(() => formatoMesAnio(this.mes()));

  // Solo transacciones tipo GASTO: ingresos y traslados no forman parte del desglose
  private readonly gastosDelMes = computed<Transaccion[]>(() =>
    soloGastos(this.service.movimientosDeMes(claveMes(this.mes()))),
  );

  protected readonly categorias = computed<GastoCategoria[]>(() =>
    calcularGastosGrafica(this.gastosDelMes(), (t) => this.service.clasificarGasto(t)),
  );

  protected readonly segmentos = computed<SegmentoPastel[]>(() =>
    this.generarSegmentos(this.categorias()),
  );

  protected readonly detalle = computed<DetalleCategoria | null>(() => {
    const categoria = this.categoriaSeleccionada();
    if (!categoria) return null;
    const gastos = this.gastosDelMes()
      .filter((m) => this.service.clasificarGasto(m).categoria === categoria)
      .sort((a, b) => b.fecha.localeCompare(a.fecha));
    if (gastos.length === 0) return null;
    return {
      categoria,
      gastos,
      total: gastos.reduce((acc, m) => acc + m.monto, 0),
      cantidadTexto: `${gastos.length} ${gastos.length === 1 ? 'gasto' : 'gastos'}`,
    };
  });

  protected cambiarMes(delta: number): void {
    this.mes.update((mes) => mesRelativo(mes, delta));
    // Si la categoría seleccionada no existe en el nuevo mes, se cierra el detalle
    const seleccionada = this.categoriaSeleccionada();
    if (seleccionada && !this.categorias().some((c) => c.categoria === seleccionada)) {
      this.categoriaSeleccionada.set(null);
    }
  }

  protected alternarCategoria(categoria: string): void {
    this.categoriaSeleccionada.update((actual) => (actual === categoria ? null : categoria));
  }

  private generarSegmentos(categorias: readonly GastoCategoria[]): SegmentoPastel[] {
    let anguloInicio = -90;

    return categorias.map(({ categoria, porcentaje, color }) => {
      const fraccion = porcentaje / PORCENTAJE_TOTAL;
      const anguloBarrido = fraccion * 360;
      const anguloFin = anguloInicio + anguloBarrido;

      const inicio = puntoEnCirculo(RADIO, anguloInicio);
      const fin = puntoEnCirculo(RADIO, anguloFin);
      const granArco = anguloBarrido > 180 ? 1 : 0;

      const path =
        fraccion >= FRACCION_CIRCULO_COMPLETO
          ? `M ${CENTRO - RADIO} ${CENTRO} A ${RADIO} ${RADIO} 0 1 1 ${CENTRO + RADIO} ${CENTRO} A ${RADIO} ${RADIO} 0 1 1 ${CENTRO - RADIO} ${CENTRO}`
          : `M ${CENTRO} ${CENTRO} L ${inicio.x} ${inicio.y} A ${RADIO} ${RADIO} 0 ${granArco} 1 ${fin.x} ${fin.y} Z`;

      let etiqueta: SegmentoPastel['etiqueta'] = null;
      if (fraccion >= FRACCION_MINIMA_ETIQUETA) {
        const punto = puntoEnCirculo(RADIO * FACTOR_RADIO_ETIQUETA, anguloInicio + anguloBarrido / 2);
        etiqueta = { x: punto.x.toFixed(1), y: punto.y.toFixed(1), texto: `${porcentaje.toFixed(0)}%` };
      }

      anguloInicio = anguloFin;
      return { categoria, path, color, etiqueta };
    });
  }
}
