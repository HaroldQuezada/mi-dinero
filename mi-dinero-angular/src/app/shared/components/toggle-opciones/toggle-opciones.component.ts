import { Component, input, model } from '@angular/core';
import { OpcionToggle } from '../../models/ui.models';

// Grupo de botones excluyentes (ej. Ingreso / Gasto). Uso: [(valor)]="tipo"
@Component({
  selector: 'app-toggle-opciones',
  templateUrl: './toggle-opciones.component.html',
  styleUrl: './toggle-opciones.component.css',
})
export class ToggleOpcionesComponent<T extends string> {
  readonly opciones = input.required<readonly OpcionToggle<T>[]>();
  readonly valor = model.required<T>();
  readonly etiqueta = input.required<string>();
}
