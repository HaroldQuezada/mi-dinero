import { Component, input, output } from '@angular/core';
import { FaIconComponent } from '@fortawesome/angular-fontawesome';
import { ICONOS } from '../../iconos';

// Botones de icono Editar / Eliminar que se repiten en todas las listas
@Component({
  selector: 'app-acciones-fila',
  imports: [FaIconComponent],
  templateUrl: './acciones-fila.component.html',
})
export class AccionesFilaComponent {
  // Nombre del elemento, para que los lectores de pantalla digan "Editar Arriendo"
  readonly nombre = input<string>('');

  readonly editar = output<void>();
  readonly eliminar = output<void>();

  protected readonly iconos = ICONOS;
}
