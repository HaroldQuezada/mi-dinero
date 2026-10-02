import { Component, computed, inject, input, output } from '@angular/core';
import { FaIconComponent } from '@fortawesome/angular-fontawesome';
import { IconDefinition } from '@fortawesome/fontawesome-svg-core';
import { NotificacionService } from '../../../../core/notificacion.service';
import { formatoMesAnio } from '../../../../core/utils';
import { AccionesFilaComponent } from '../../../../shared/components/acciones-fila/acciones-fila.component';
import { ICONOS } from '../../../../shared/iconos';
import { MonedaPipe } from '../../../../shared/pipes/moneda.pipe';
import { deudaDeCredito } from '../../dinero.calculos';
import { colorDeSlot, ETIQUETAS_TIPO_CUENTA, ICONOS_TIPO_CUENTA } from '../../dinero.constantes';
import { CuentaConSaldo, InfoTarjeta } from '../../dinero.models';
import { DineroService } from '../../dinero.service';

// Tarjeta de una cuenta: saldo actual y, en tarjetas de crédito, deuda y corte del mes
@Component({
  selector: 'app-cuenta-card',
  imports: [FaIconComponent, AccionesFilaComponent, MonedaPipe],
  templateUrl: './cuenta-card.component.html',
  styleUrl: './cuenta-card.component.css',
})
export class CuentaCardComponent {
  private readonly service = inject(DineroService);
  private readonly notificacion = inject(NotificacionService);

  readonly cuenta = input.required<CuentaConSaldo>();

  readonly editar = output<void>();
  readonly ajustar = output<void>();
  readonly trasladar = output<void>();
  readonly registrarCorte = output<void>();
  readonly pagar = output<void>();

  protected readonly iconos = ICONOS;
  protected readonly mesActualTexto = formatoMesAnio(new Date());

  protected readonly color = computed<string>(() => colorDeSlot(this.cuenta().color));
  protected readonly icono = computed<IconDefinition>(() => ICONOS[ICONOS_TIPO_CUENTA[this.cuenta().tipo]]);
  protected readonly etiquetaTipo = computed<string>(() => ETIQUETAS_TIPO_CUENTA[this.cuenta().tipo]);
  protected readonly esCredito = computed<boolean>(() => this.cuenta().tipo === 'credito');

  // En crédito se muestra lo que se debe (positivo); en el resto, el saldo
  protected readonly cifraPrincipal = computed<number>(() =>
    this.esCredito() ? deudaDeCredito(this.cuenta()) : this.cuenta().saldoActual,
  );

  protected readonly infoTarjeta = computed<InfoTarjeta | null>(() =>
    this.esCredito() ? this.service.infoTarjeta(this.cuenta()) : null,
  );

  protected async eliminar(): Promise<void> {
    if (!this.notificacion.confirmar(`¿Eliminar la cuenta "${this.cuenta().nombre}"?`)) return;
    const error = await this.service.eliminarCuenta(this.cuenta().id);
    if (error) this.notificacion.error(error);
  }
}
