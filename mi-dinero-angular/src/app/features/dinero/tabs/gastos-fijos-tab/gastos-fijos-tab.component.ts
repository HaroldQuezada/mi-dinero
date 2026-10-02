import { Component, inject } from '@angular/core';
import { FaIconComponent } from '@fortawesome/angular-fontawesome';
import { ICONOS } from '../../../../shared/iconos';
import { ControlModal } from '../../../../shared/utils/control-modal';
import { GastoFijoFilaComponent } from '../../components/gasto-fijo-fila/gasto-fijo-fila.component';
import { ModalGastoFijoComponent } from '../../components/modal-gasto-fijo/modal-gasto-fijo.component';
import { GastoFijo } from '../../dinero.models';
import { DineroService } from '../../dinero.service';

@Component({
  selector: 'app-gastos-fijos-tab',
  imports: [FaIconComponent, GastoFijoFilaComponent, ModalGastoFijoComponent],
  templateUrl: './gastos-fijos-tab.component.html',
})
export class GastosFijosTabComponent {
  protected readonly service = inject(DineroService);
  protected readonly iconos = ICONOS;

  protected readonly modal = new ControlModal<GastoFijo>();
}
