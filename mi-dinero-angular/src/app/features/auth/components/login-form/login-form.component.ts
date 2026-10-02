import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../../../core/auth.service';
import { emailValido, LONGITUD_MINIMA_LOGIN } from '../../../../core/validacion';
import { PasswordInputComponent } from '../password-input/password-input.component';

@Component({
  selector: 'app-login-form',
  imports: [FormsModule, PasswordInputComponent],
  templateUrl: './login-form.component.html',
})
export class LoginFormComponent {
  private readonly auth = inject(AuthService);

  protected readonly email = signal('');
  protected readonly password = signal('');
  protected readonly error = signal('');
  protected readonly enviando = signal(false);

  protected async enviar(): Promise<void> {
    const email = this.email().trim();
    const password = this.password();
    const errorValidacion = this.validar(email, password);
    this.error.set(errorValidacion);
    if (errorValidacion) return;

    this.enviando.set(true);
    const error = await this.auth.iniciarSesion(email, password);
    this.enviando.set(false);
    if (error) this.error.set(error);
  }

  private validar(email: string, password: string): string {
    if (!email || !password) return 'Completa correo y contraseña.';
    if (!emailValido(email)) return 'El correo no tiene un formato válido.';
    if (password.length < LONGITUD_MINIMA_LOGIN) return 'La contraseña es demasiado corta.';
    return '';
  }
}
