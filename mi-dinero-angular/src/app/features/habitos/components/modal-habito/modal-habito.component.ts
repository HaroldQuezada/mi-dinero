import { Component, computed, inject, input, linkedSignal, output, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NotificacionService } from '../../../../core/notificacion.service';
import { ModalComponent } from '../../../../shared/components/modal/modal.component';
import { ToggleOpcionesComponent } from '../../../../shared/components/toggle-opciones/toggle-opciones.component';
import {
  CATEGORIA_HABITO_POR_DEFECTO,
  CATEGORIAS_HABITO,
  DIAS_SEMANA,
  DIAS_SEMANA_LABEL,
  FRECUENCIA_DIARIA,
  LONGITUD_HORA_CORTA,
  PRIORIDAD_POR_DEFECTO,
  PRIORIDADES_HABITO,
  TIPOS_FRECUENCIA,
} from '../../habitos.constantes';
import { DiaSemana, Habito, PrioridadHabito, TipoFrecuencia } from '../../habitos.models';
import { HabitosService } from '../../habitos.service';

@Component({
  selector: 'app-modal-habito',
  imports: [FormsModule, ModalComponent, ToggleOpcionesComponent],
  templateUrl: './modal-habito.component.html',
  styleUrl: './modal-habito.component.css',
})
export class ModalHabitoComponent {
  private readonly service = inject(HabitosService);
  private readonly notificacion = inject(NotificacionService);

  // null = crear un hábito nuevo
  readonly habito = input<Habito | null>(null);
  readonly cerrar = output<void>();

  // Se cierra a través del modal para que se vea la animación de salida
  private readonly modal = viewChild.required(ModalComponent);

  protected readonly categorias = CATEGORIAS_HABITO;
  protected readonly prioridades = PRIORIDADES_HABITO;
  protected readonly tiposFrecuencia = TIPOS_FRECUENCIA;
  protected readonly diasSemana = DIAS_SEMANA;
  protected readonly diasSemanaLabel = DIAS_SEMANA_LABEL;

  protected readonly nombre = linkedSignal<string>(() => this.habito()?.nombre ?? '');
  protected readonly categoria = linkedSignal<string>(
    () => this.habito()?.categoria ?? CATEGORIA_HABITO_POR_DEFECTO,
  );
  protected readonly tipoFrecuencia = linkedSignal<TipoFrecuencia>(() => {
    const habito = this.habito();
    return habito && habito.frecuencia !== FRECUENCIA_DIARIA ? 'dias' : 'diario';
  });
  protected readonly diasActivos = linkedSignal<DiaSemana[]>(() =>
    this.service.diasDeFrecuencia(this.habito()?.frecuencia ?? FRECUENCIA_DIARIA),
  );
  protected readonly hora = linkedSignal<string>(
    () => this.habito()?.hora_objetivo?.slice(0, LONGITUD_HORA_CORTA) ?? '',
  );
  protected readonly prioridad = linkedSignal<PrioridadHabito>(
    () => this.habito()?.prioridad ?? PRIORIDAD_POR_DEFECTO,
  );

  protected readonly titulo = computed<string>(() => `${this.habito() ? 'Editar' : 'Agregar'} hábito`);

  protected alternarDia(dia: DiaSemana): void {
    this.diasActivos.update((dias) =>
      dias.includes(dia) ? dias.filter((d) => d !== dia) : [...dias, dia],
    );
  }

  protected async guardar(): Promise<void> {
    const nombre = this.nombre().trim();
    if (!nombre) {
      this.notificacion.informar('Ingresa un nombre para el hábito');
      return;
    }

    let frecuencia = FRECUENCIA_DIARIA;
    if (this.tipoFrecuencia() === 'dias') {
      const dias = this.diasActivos();
      if (dias.length === 0) {
        this.notificacion.informar('Elige al menos un día');
        return;
      }
      frecuencia = dias.join(',');
    }

    const error = await this.service.guardarHabito(
      {
        nombre,
        categoria: this.categoria(),
        frecuencia,
        hora_objetivo: this.hora() || null,
        prioridad: this.prioridad(),
      },
      this.habito()?.id,
    );
    if (error) {
      this.notificacion.error(error);
      return;
    }
    this.modal().cerrarAnimado();
  }
}
