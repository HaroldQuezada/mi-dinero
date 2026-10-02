import { Component, computed, signal } from '@angular/core';
import { ModoAuth } from '../../core/auth.models';
import { PageFooterComponent } from '../../shared/components/page-footer/page-footer.component';
import { LoginFormComponent } from './components/login-form/login-form.component';
import { RegistroFormComponent } from './components/registro-form/registro-form.component';

interface TextosModo {
  titulo: string;
  subtitulo: string;
  alternar: string;
}

const TEXTOS_POR_MODO: Readonly<Record<ModoAuth, TextosModo>> = {
  login: {
    titulo: 'Mi Dinero',
    subtitulo: 'Control personal de finanzas',
    alternar: '¿No tienes cuenta? Crear una',
  },
  registro: {
    titulo: 'Crear cuenta',
    subtitulo: 'Completa tus datos para empezar',
    alternar: '¿Ya tienes cuenta? Inicia sesión',
  },
};

@Component({
  selector: 'app-auth',
  imports: [LoginFormComponent, RegistroFormComponent, PageFooterComponent],
  templateUrl: './auth.component.html',
  styleUrl: './auth.component.css',
  host: { class: 'pagina' },
})
export class AuthComponent {
  protected readonly modo = signal<ModoAuth>('login');
  protected readonly mensajeExito = signal('');

  protected readonly textos = computed<TextosModo>(() => TEXTOS_POR_MODO[this.modo()]);

  protected alternarModo(): void {
    this.modo.update((m) => (m === 'login' ? 'registro' : 'login'));
    this.mensajeExito.set('');
  }

  protected alRegistrar(mensaje: string): void {
    this.modo.set('login');
    this.mensajeExito.set(mensaje);
  }
}
