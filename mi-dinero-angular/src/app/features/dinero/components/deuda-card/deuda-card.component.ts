import { Component, computed, inject, input, output } from '@angular/core';
import { FaIconComponent } from '@fortawesome/angular-fontawesome';
import { NotificacionService } from '../../../../core/notificacion.service';
import { AccionesFilaComponent } from '../../../../shared/components/acciones-fila/acciones-fila.component';
import { BadgePagoComponent } from '../../../../shared/components/badge-pago/badge-pago.component';
import { ProgressBarComponent } from '../../../../shared/components/progress-bar/progress-bar.component';
import { ICONOS } from '../../../../shared/iconos';
import { MonedaPipe } from '../../../../shared/pipes/moneda.pipe';
import { calcularInfoDeudaNormal } from '../../dinero.calculos';
import { Deuda, InfoDeudaNormal } from '../../dinero.models';
import { DineroService } from '../../dinero.service';

// Tarjeta de un préstamo: avance, saldo, fecha estimada de fin y pago del mes
@Component({
  selector: 'app-deuda-card',
  imports: [FaIconComponent, AccionesFilaComponent, BadgePagoComponent, ProgressBarComponent, MonedaPipe],
  templateUrl: './deuda-card.component.html',
})
export class DeudaCardComponent {
  private readonly service = inject(DineroService);
  private readonly notificacion = inject(NotificacionService);

  readonly deuda = input.required<Deuda>();

  readonly editar = output<void>();
  readonly pagar = output<void>();

  protected readonly iconos = ICONOS;

  protected readonly info = computed<InfoDeudaNormal>(() => calcularInfoDeudaNormal(this.deuda()));

  protected readonly pagadaEsteMes = computed<boolean>(() =>
    this.service.estaDeudaPagadaEsteMes(this.deuda().id),
  );

  protected async eliminar(): Promise<void> {
    if (!this.notificacion.confirmar('¿Eliminar esta deuda?')) return;
    const error = await this.service.eliminarDeuda(this.deuda().id);
    if (error) this.notificacion.error(error);
  }
}
