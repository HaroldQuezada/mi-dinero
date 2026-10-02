import { Component, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { FaIconComponent } from '@fortawesome/angular-fontawesome';
import { AuthService } from '../../../core/auth.service';
import { RUTAS } from '../../../core/constantes';
import { ICONOS } from '../../iconos';
import { BotonTemaComponent } from '../boton-tema/boton-tema.component';

// Barra superior de los módulos: volver al inicio, título, acciones proyectadas,
// interruptor de tema y cerrar sesión
@Component({
  selector: 'app-page-header',
  imports: [RouterLink, FaIconComponent, BotonTemaComponent],
  templateUrl: './page-header.component.html',
  styleUrl: './page-header.component.css',
})
export class PageHeaderComponent {
  private readonly auth = inject(AuthService);

  readonly titulo = input.required<string>();

  protected readonly rutaInicio = RUTAS.inicio;
  protected readonly iconos = ICONOS;

  protected async salir(): Promise<void> {
    await this.auth.cerrarSesion();
  }
}
