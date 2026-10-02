import { Component, computed, inject, input, linkedSignal, output, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NotificacionService } from '../../../../core/notificacion.service';
import { ModalComponent } from '../../../../shared/components/modal/modal.component';
import { Deuda } from '../../dinero.models';
import { DineroService } from '../../dinero.service';

// Préstamos y deudas a cuotas. Las tarjetas de crédito se manejan como cuentas.
@Component({
  selector: 'app-modal-deuda',
  imports: [FormsModule, ModalComponent],
  templateUrl: './modal-deuda.component.html',
})
export class ModalDeudaComponent {
  private readonly service = inject(DineroService);
  private readonly notificacion = inject(NotificacionService);

  // null = crear una deuda nueva
  readonly deuda = input<Deuda | null>(null);
  readonly cerrar = output<void>();

  // Se cierra a través del modal para que se vea la animación de salida
  private readonly modal = viewChild.required(ModalComponent);

  protected readonly nombre = linkedSignal<string>(() => this.deuda()?.nombre ?? '');
  protected readonly montoTotal = linkedSignal<number | null>(() => this.deuda()?.monto_total ?? null);
  protected readonly pagado = linkedSignal<number | null>(() => this.deuda()?.pagado_acumulado ?? 0);
  protected readonly pagoMensual = linkedSignal<number | null>(
    () => this.deuda()?.pago_mensual_planeado ?? null,
  );

  protected readonly titulo = computed<string>(() => `${this.deuda() ? 'Editar' : 'Agregar'} deuda`);

  protected async guardar(): Promise<void> {
    const nombre = this.nombre().trim();
    const montoTotal = this.montoTotal();
    const pagoMensual = this.pagoMensual();
    if (!nombre || !montoTotal || !pagoMensual) {
      this.notificacion.informar('Completa nombre, monto total y pago mensual');
      return;
    }

    const error = await this.service.guardarDeuda(
      {
        nombre,
        monto_total: montoTotal,
        pagado_acumulado: this.pagado() || 0,
        pago_mensual_planeado: pagoMensual,
      },
      this.deuda()?.id,
    );
    if (error) {
      this.notificacion.error(error);
      return;
    }
    this.modal().cerrarAnimado();
  }
}
