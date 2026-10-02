import { Component, inject } from '@angular/core';
import { FaIconComponent } from '@fortawesome/angular-fontawesome';
import { StatCardComponent } from '../../../../shared/components/stat-card/stat-card.component';
import { ICONOS } from '../../../../shared/iconos';
import { ControlModal } from '../../../../shared/utils/control-modal';
import { CuentaCardComponent } from '../../components/cuenta-card/cuenta-card.component';
import { ModalAjusteSaldoComponent } from '../../components/modal-ajuste-saldo/modal-ajuste-saldo.component';
import { ModalCorteComponent } from '../../components/modal-corte/modal-corte.component';
import { ModalCuentaComponent } from '../../components/modal-cuenta/modal-cuenta.component';
import { ModalMovimientoComponent } from '../../components/modal-movimiento/modal-movimiento.component';
import { ModalPagoTarjetaComponent } from '../../components/modal-pago-tarjeta/modal-pago-tarjeta.component';
import { CuentaConSaldo } from '../../dinero.models';
import { DineroService } from '../../dinero.service';

// Cuentas del usuario con su saldo, el resumen del patrimonio y las acciones
// propias de cada tipo (pagar tarjeta, trasladar, ajustar saldo)
@Component({
  selector: 'app-cuentas-tab',
  imports: [
    FaIconComponent,
    StatCardComponent,
    CuentaCardComponent,
    ModalCuentaComponent,
    ModalAjusteSaldoComponent,
    ModalCorteComponent,
    ModalPagoTarjetaComponent,
    ModalMovimientoComponent,
  ],
  templateUrl: './cuentas-tab.component.html',
  styleUrl: './cuentas-tab.component.css',
})
export class CuentasTabComponent {
  protected readonly service = inject(DineroService);
  protected readonly iconos = ICONOS;

  protected readonly modalCuenta = new ControlModal<CuentaConSaldo>();
  protected readonly modalAjuste = new ControlModal<CuentaConSaldo>();
  protected readonly modalCorte = new ControlModal<CuentaConSaldo>();
  protected readonly modalPago = new ControlModal<CuentaConSaldo>();
  protected readonly modalTraslado = new ControlModal<CuentaConSaldo>();
}
