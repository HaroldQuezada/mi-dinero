import { Component, computed, input } from '@angular/core';
import { EstadoBarra } from '../../models/ui.models';

@Component({
  selector: 'app-progress-bar',
  templateUrl: './progress-bar.component.html',
  styleUrl: './progress-bar.component.css',
})
export class ProgressBarComponent {
  readonly porcentaje = input.required<number>();
  readonly estado = input<EstadoBarra>('normal');
  readonly delgada = input<boolean>(false);
  readonly etiqueta = input<string>('Progreso');

  protected readonly ancho = computed<number>(() =>
    Math.round(Math.min(Math.max(this.porcentaje() || 0, 0), 100)),
  );

  protected readonly claseEstado = computed<string>(() => `barra-${this.estado()}`);
}
