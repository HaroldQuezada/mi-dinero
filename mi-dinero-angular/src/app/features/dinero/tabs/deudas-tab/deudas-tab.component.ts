import { Component, inject } from '@angular/core';
import { FaIconComponent } from '@fortawesome/angular-fontawesome';
import { ICONOS } from '../../../../shared/iconos';
import { ControlModal } from '../../../../shared/utils/control-modal';
import { DeudaCardComponent } from '../../components/deuda-card/deuda-card.component';
import { ModalDeudaComponent } from '../../components/modal-deuda/modal-deuda.component';
import { ModalPagoComponent } from '../../components/modal-pago/modal-pago.component';
import { Deuda } from '../../dinero.models';
import { DineroService } from '../../dinero.service';

@Component({
  selector: 'app-deudas-tab',
  imports: [FaIconComponent, DeudaCardComponent, ModalDeudaComponent, ModalPagoComponent],
  templateUrl: './deudas-tab.component.html',
})
export class DeudasTabComponent {
  protected readonly service = inject(DineroService);
  protected readonly iconos = ICONOS;

  protected readonly modalDeuda = new ControlModal<Deuda>();
  protected readonly modalPago = new ControlModal<Deuda>();
}
