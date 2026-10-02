import { Component, inject } from '@angular/core';
import { NotificacionService } from '../../../../core/notificacion.service';
import { AccionesFilaComponent } from '../../../../shared/components/acciones-fila/acciones-fila.component';
import { ControlModal } from '../../../../shared/utils/control-modal';
import { ModalHabitoComponent } from '../../components/modal-habito/modal-habito.component';
import { Habito } from '../../habitos.models';
import { HabitosService } from '../../habitos.service';

@Component({
  selector: 'app-gestion-tab',
  imports: [AccionesFilaComponent, ModalHabitoComponent],
  templateUrl: './gestion-tab.component.html',
})
export class GestionTabComponent {
  protected readonly service = inject(HabitosService);
  private readonly notificacion = inject(NotificacionService);

  protected readonly modal = new ControlModal<Habito>();

  protected async eliminar(habito: Habito): Promise<void> {
    if (!this.notificacion.confirmar('¿Eliminar este hábito? Se mantiene tu historial de cumplimiento.')) {
      return;
    }
    const error = await this.service.eliminarHabito(habito.id);
    if (error) this.notificacion.error(error);
  }
}
