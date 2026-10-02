import { Component, computed, inject, output } from '@angular/core';
import { FaIconComponent } from '@fortawesome/angular-fontawesome';
import { ICONOS } from '../../../../shared/iconos';
import { MonedaPipe } from '../../../../shared/pipes/moneda.pipe';
import { PorcentajePipe } from '../../../../shared/pipes/porcentaje.pipe';
import { PORCENTAJE_TOTAL } from '../../dinero.constantes';
import { ResumenCategoria } from '../../dinero.models';
import { DineroService } from '../../dinero.service';

interface FilaPresupuesto {
  resumen: ResumenCategoria;
  // Anchos en % de la escala común (el mayor entre presupuestos y gastos)
  anchoPresupuesto: number;
  anchoGastado: number;
  inicioExceso: number;
  anchoExceso: number;
  usoReal: number;
}

// Barras horizontales comparativas: gastado vs presupuesto de cada categoría del mes.
// Todas comparten escala, así también se comparan las categorías entre sí.
@Component({
  selector: 'app-grafica-presupuesto',
  imports: [FaIconComponent, MonedaPipe, PorcentajePipe],
  templateUrl: './grafica-presupuesto.component.html',
  styleUrl: './grafica-presupuesto.component.css',
})
export class GraficaPresupuestoComponent {
  protected readonly service = inject(DineroService);

  readonly configurar = output<void>();

  protected readonly iconos = ICONOS;

  protected readonly filas = computed<FilaPresupuesto[]>(() => {
    const resumenes = this.service.resumenCategorias();
    const escala = Math.max(1, ...resumenes.flatMap((r) => [r.presupuesto, r.gastado]));
    const aPorcentaje = (valor: number): number => (valor / escala) * PORCENTAJE_TOTAL;

    return resumenes.map((resumen) => {
      const exceso = Math.max(resumen.gastado - resumen.presupuesto, 0);
      return {
        resumen,
        anchoPresupuesto: aPorcentaje(resumen.presupuesto),
        anchoGastado: aPorcentaje(Math.min(resumen.gastado, resumen.presupuesto || resumen.gastado)),
        inicioExceso: aPorcentaje(resumen.presupuesto),
        anchoExceso: resumen.presupuesto > 0 ? aPorcentaje(exceso) : 0,
        usoReal: resumen.presupuesto > 0 ? (resumen.gastado / resumen.presupuesto) * PORCENTAJE_TOTAL : 0,
      };
    });
  });
}
