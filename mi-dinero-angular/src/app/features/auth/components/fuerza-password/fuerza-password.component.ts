import { Component, computed, input } from '@angular/core';
import { EvaluacionPassword } from '../../../../core/validacion';

// Barra de seguridad de la contraseña con las recomendaciones pendientes
@Component({
  selector: 'app-fuerza-password',
  templateUrl: './fuerza-password.component.html',
  styleUrl: './fuerza-password.component.css',
})
export class FuerzaPasswordComponent {
  readonly evaluacion = input.required<EvaluacionPassword>();

  protected readonly claseRelleno = computed<string>(() => `relleno-${this.evaluacion().nivel}`);
  protected readonly claseTexto = computed<string>(() => `texto-${this.evaluacion().nivel}`);
}
