import { Component, input, model, output, signal } from '@angular/core';

export type AutocompletePassword = 'current-password' | 'new-password';

// Campo de contraseña con botón para mostrar/ocultar. Uso: [(valor)]="password"
@Component({
  selector: 'app-password-input',
  templateUrl: './password-input.component.html',
  styleUrl: './password-input.component.css',
})
export class PasswordInputComponent {
  readonly valor = model.required<string>();
  readonly placeholder = input<string>('');
  readonly autocomplete = input<AutocompletePassword>('current-password');

  // Se emite al perder el foco, para validar el campo solo cuando el usuario ya lo usó
  readonly tocado = output<void>();

  protected readonly visible = signal(false);

  protected alternarVisibilidad(): void {
    this.visible.update((visible) => !visible);
  }
}
