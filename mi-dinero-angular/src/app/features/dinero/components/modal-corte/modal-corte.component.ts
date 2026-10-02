import { Component, computed, inject, input, linkedSignal, output, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NotificacionService } from '../../../../core/notificacion.service';
import { formatoMesAnio, mesActual } from '../../../../core/utils';
import { CampoFechaComponent } from '../../../../shared/components/campo-fecha/campo-fecha.component';
import { ModalComponent } from '../../../../shared/components/modal/modal.component';
import { fechaLimiteSugerida } from '../../dinero.calculos';
import { CorteTarjeta, Cuenta } from '../../dinero.models';
import { DineroService } from '../../dinero.service';

// Registra o edita el monto del corte de este mes de una tarjeta de crédito
@Component({
  selector: 'app-modal-corte',
  imports: [FormsModule, CampoFechaComponent, ModalComponent],
  templateUrl: './modal-corte.component.html',
})
export class ModalCorteComponent {
  private readonly service = inject(DineroService);
  private readonly notificacion = inject(NotificacionService);

  readonly tarjeta = input.required<Cuenta>();
  readonly cerrar = output<void>();

  // Se cierra a través del modal para que se vea la animación de salida
  private readonly modal = viewChild.required(ModalComponent);

  protected readonly mesActualTexto = formatoMesAnio(new Date());

  private readonly corte = computed<CorteTarjeta | undefined>(() =>
    this.service.corteDelMes(this.tarjeta().id),
  );

  protected readonly monto = linkedSignal<number | null>(() => this.corte()?.monto_corte ?? null);
  protected readonly fechaLimite = linkedSignal<string>(
    () => this.corte()?.fecha_limite ?? fechaLimiteSugerida(this.tarjeta().dia_limite_pago),
  );

  protected readonly titulo = computed<string>(() => `Corte de ${this.tarjeta().nombre}`);

  protected async guardar(): Promise<void> {
    const monto = this.monto();
    if (!monto || monto <= 0) {
      this.notificacion.informar('Ingresa el monto del corte');
      return;
    }
    const error = await this.service.guardarCorte({
      cuenta_id: this.tarjeta().id,
      mes: mesActual(),
      monto_corte: monto,
      fecha_limite: this.fechaLimite() || null,
    });
    if (error) {
      this.notificacion.error(error);
      return;
    }
    this.modal().cerrarAnimado();
  }
}
