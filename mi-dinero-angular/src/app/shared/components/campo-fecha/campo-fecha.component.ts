import { Component, computed, input, model } from '@angular/core';
import { MatIconButton } from '@angular/material/button';
import { MatDatepickerInputEvent, MatDatepickerModule } from '@angular/material/datepicker';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { FaIconComponent } from '@fortawesome/angular-fontawesome';
import { fechaDesdeIso, fechaIsoLocal } from '../../../core/utils';
import { ICONOS } from '../../iconos';

// Selector de fecha (Angular Material Datepicker) que trabaja con cadenas YYYY-MM-DD,
// el mismo formato que guarda la base de datos. '' = sin fecha.
// Uso: <app-campo-fecha etiqueta="Fecha" [(valor)]="fecha" />
@Component({
  selector: 'app-campo-fecha',
  imports: [MatFormFieldModule, MatInputModule, MatDatepickerModule, MatIconButton, FaIconComponent],
  templateUrl: './campo-fecha.component.html',
  styleUrl: './campo-fecha.component.css',
})
export class CampoFechaComponent {
  readonly etiqueta = input.required<string>();
  readonly valor = model<string>('');
  // Muestra un botón para dejar la fecha vacía
  readonly opcional = input<boolean>(false);
  readonly minima = input<string>('');

  protected readonly iconos = ICONOS;

  protected readonly fecha = computed<Date | null>(() => {
    const valor = this.valor();
    return valor ? fechaDesdeIso(valor) : null;
  });

  protected readonly fechaMinima = computed<Date | null>(() => {
    const minima = this.minima();
    return minima ? fechaDesdeIso(minima) : null;
  });

  protected cambiar(evento: MatDatepickerInputEvent<Date>): void {
    const fecha = evento.value;
    this.valor.set(fecha && !isNaN(fecha.getTime()) ? fechaIsoLocal(fecha) : '');
  }

  protected limpiar(): void {
    this.valor.set('');
  }
}
