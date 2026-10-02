import { Component, computed, inject, input, output } from '@angular/core';
import { NotificacionService } from '../../../../core/notificacion.service';
import { AccionesFilaComponent } from '../../../../shared/components/acciones-fila/acciones-fila.component';
import { ProgressBarComponent } from '../../../../shared/components/progress-bar/progress-bar.component';
import { MonedaPipe } from '../../../../shared/pipes/moneda.pipe';
import { PorcentajePipe } from '../../../../shared/pipes/porcentaje.pipe';
import { calcularInfoMeta } from '../../dinero.calculos';
import { InfoMeta, MetaAhorro } from '../../dinero.models';
import { DineroService } from '../../dinero.service';

@Component({
  selector: 'app-meta-ahorro-card',
  imports: [AccionesFilaComponent, ProgressBarComponent, MonedaPipe, PorcentajePipe],
  templateUrl: './meta-ahorro-card.component.html',
})
export class MetaAhorroCardComponent {
  private readonly service = inject(DineroService);
  private readonly notificacion = inject(NotificacionService);

  readonly meta = input.required<MetaAhorro>();
  readonly editar = output<void>();

  protected readonly info = computed<InfoMeta>(() => calcularInfoMeta(this.meta()));

  protected async eliminar(): Promise<void> {
    if (!this.notificacion.confirmar('¿Eliminar esta meta de ahorro?')) return;
    const error = await this.service.eliminarMeta(this.meta().id);
    if (error) this.notificacion.error(error);
  }
}
