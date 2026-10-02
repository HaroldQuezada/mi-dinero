import { Component, computed, inject, input, output } from '@angular/core';
import { NotificacionService } from '../../../../core/notificacion.service';
import { AccionesFilaComponent } from '../../../../shared/components/acciones-fila/acciones-fila.component';
import { BadgePagoComponent } from '../../../../shared/components/badge-pago/badge-pago.component';
import { MonedaPipe } from '../../../../shared/pipes/moneda.pipe';
import { GastoFijo } from '../../dinero.models';
import { DineroService } from '../../dinero.service';

// Fila de gasto fijo con casilla para marcarlo como pagado este mes
@Component({
  selector: 'app-gasto-fijo-fila',
  imports: [AccionesFilaComponent, BadgePagoComponent, MonedaPipe],
  templateUrl: './gasto-fijo-fila.component.html',
})
export class GastoFijoFilaComponent {
  private readonly service = inject(DineroService);
  private readonly notificacion = inject(NotificacionService);

  readonly gasto = input.required<GastoFijo>();
  // Muestra la categoría y los botones Editar/Eliminar
  readonly conDetalle = input<boolean>(false);

  readonly editar = output<void>();

  protected readonly color = computed<string>(() => this.service.clasificarGasto(this.gasto()).color);

  // "Servicios › Arriendo · Cuenta Débito"
  protected readonly detalle = computed<string>(() => {
    const g = this.gasto();
    const categoria = this.service.etiquetaCategoria(g.categoria_id, g.subcategoria_id) ?? 'Sin categoría';
    return `${categoria} · ${this.service.nombreCuenta(g.cuenta_id ?? this.service.cuentaPrincipalId())}`;
  });

  protected readonly pagado = computed<boolean>(() => this.service.estaPagadoEsteMes(this.gasto().id));

  protected async alternarPago(marcado: boolean): Promise<void> {
    const error = await this.service.togglePagoGastoFijo(this.gasto(), marcado);
    if (error) this.notificacion.error(error);
  }

  protected async eliminar(): Promise<void> {
    if (!this.notificacion.confirmar('¿Eliminar este gasto fijo? (no borra los pagos ya registrados)')) {
      return;
    }
    const error = await this.service.eliminarGastoFijo(this.gasto().id);
    if (error) this.notificacion.error(error);
  }
}
