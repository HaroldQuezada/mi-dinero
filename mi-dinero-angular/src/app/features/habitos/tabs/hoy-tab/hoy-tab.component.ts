import { Component, computed, inject } from '@angular/core';
import { NotificacionService } from '../../../../core/notificacion.service';
import { fechaHoyIso } from '../../../../core/utils';
import { FechaLargaPipe } from '../../../../shared/pipes/fecha-larga.pipe';
import { LONGITUD_HORA_CORTA } from '../../habitos.constantes';
import { EstadoRegistro, ResumenHabitoHoy } from '../../habitos.models';
import { HabitosService } from '../../habitos.service';

@Component({
  selector: 'app-hoy-tab',
  imports: [FechaLargaPipe],
  templateUrl: './hoy-tab.component.html',
  styleUrl: './hoy-tab.component.css',
})
export class HoyTabComponent {
  private readonly service = inject(HabitosService);
  private readonly notificacion = inject(NotificacionService);

  protected readonly hoyIso = fechaHoyIso();

  protected readonly habitosDeHoy = computed<ResumenHabitoHoy[]>(() =>
    this.service
      .habitos()
      .filter((habito) => this.service.habitoAplicaEnFecha(habito, this.hoyIso))
      .map((habito) => ({
        habito,
        estado: this.service.estadoEn(habito.id, this.hoyIso),
        racha: this.service.rachaActual(habito.id),
        detalle: habito.hora_objetivo
          ? `🕒 ${habito.hora_objetivo.slice(0, LONGITUD_HORA_CORTA)}`
          : habito.categoria,
      })),
  );

  protected readonly completadosHoy = computed<number>(
    () => this.habitosDeHoy().filter((h) => h.estado === 'completado').length,
  );

  protected async marcar(habitoId: string, estado: EstadoRegistro): Promise<void> {
    const error = await this.service.marcarHabito(habitoId, estado);
    if (error) this.notificacion.error(error);
  }
}
