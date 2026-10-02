import { Component, computed, inject, input, linkedSignal, output, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NotificacionService } from '../../../../core/notificacion.service';
import { formatoMoneda } from '../../../../core/utils';
import { ModalComponent } from '../../../../shared/components/modal/modal.component';
import { MonedaPipe } from '../../../../shared/pipes/moneda.pipe';
import { deudaDeCredito } from '../../dinero.calculos';
import { DIFERENCIA_MINIMA_AJUSTE } from '../../dinero.constantes';
import { CuentaConSaldo } from '../../dinero.models';
import { DineroService } from '../../dinero.service';
import { SelectorCuentaComponent } from '../selector-cuenta/selector-cuenta.component';

// Iguala el saldo calculado de una cuenta con el saldo real creando un ingreso o gasto de ajuste
@Component({
  selector: 'app-modal-ajuste-saldo',
  imports: [FormsModule, ModalComponent, MonedaPipe, SelectorCuentaComponent],
  templateUrl: './modal-ajuste-saldo.component.html',
})
export class ModalAjusteSaldoComponent {
  protected readonly service = inject(DineroService);
  private readonly notificacion = inject(NotificacionService);

  // Cuenta con la que se abre; si no se indica, la cuenta principal
  readonly cuentaInicialId = input<string | null>(null);
  readonly cerrar = output<void>();

  // Se cierra a través del modal para que se vea la animación de salida
  private readonly modal = viewChild.required(ModalComponent);

  protected readonly cuentaId = linkedSignal<string | null>(
    () => this.cuentaInicialId() ?? this.service.cuentaPrincipalId(),
  );
  // En crédito se escribe la deuda real (positiva); en el resto, el saldo real.
  // Se vacía al cambiar de cuenta para no aplicar la cifra de otra.
  protected readonly cifraReal = linkedSignal<string | null, number | null>({
    source: this.cuentaId,
    computation: () => null,
  });

  protected readonly cuenta = computed<CuentaConSaldo | undefined>(() => this.service.cuenta(this.cuentaId()));
  protected readonly esCredito = computed<boolean>(() => this.cuenta()?.tipo === 'credito');

  protected readonly cifraActual = computed<number>(() => {
    const cuenta = this.cuenta();
    if (!cuenta) return 0;
    return this.esCredito() ? deudaDeCredito(cuenta) : cuenta.saldoActual;
  });

  private readonly saldoReal = computed<number | null>(() => {
    const cifra = this.cifraReal();
    if (cifra === null || isNaN(cifra)) return null;
    return this.esCredito() ? -cifra : cifra;
  });

  private readonly diferencia = computed<number | null>(() => {
    const saldo = this.saldoReal();
    const cuenta = this.cuenta();
    return saldo === null || !cuenta ? null : saldo - cuenta.saldoActual;
  });

  protected readonly vistaPrevia = computed<string>(() => {
    const diferencia = this.diferencia();
    if (diferencia === null) return '';
    if (Math.abs(diferencia) < DIFERENCIA_MINIMA_AJUSTE) {
      return '✓ El saldo ya está correcto, no se necesita ajuste.';
    }
    return diferencia > 0
      ? `Se creará un ingreso de ajuste por ${formatoMoneda(diferencia)}.`
      : `Se creará un gasto de ajuste por ${formatoMoneda(Math.abs(diferencia))}.`;
  });

  protected async confirmar(): Promise<void> {
    const cuentaId = this.cuentaId();
    const saldoReal = this.saldoReal();
    const diferencia = this.diferencia();
    if (!cuentaId || saldoReal === null || diferencia === null) {
      this.notificacion.informar('Elige la cuenta e ingresa un monto válido');
      return;
    }
    if (Math.abs(diferencia) < DIFERENCIA_MINIMA_AJUSTE) {
      this.modal().cerrarAnimado();
      return;
    }

    const error = await this.service.registrarAjusteSaldo(cuentaId, saldoReal);
    if (error) {
      this.notificacion.error(error);
      return;
    }
    this.modal().cerrarAnimado();
  }
}
