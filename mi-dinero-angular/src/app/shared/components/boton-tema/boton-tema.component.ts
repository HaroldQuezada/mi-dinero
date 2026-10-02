import { Component, computed, inject, input } from '@angular/core';
import { FaIconComponent } from '@fortawesome/angular-fontawesome';
import { TemaService } from '../../../core/tema.service';
import { ICONOS } from '../../iconos';

// Interruptor de modo claro / oscuro. `flotante` lo fija en la esquina (páginas sin encabezado).
@Component({
  selector: 'app-boton-tema',
  imports: [FaIconComponent],
  templateUrl: './boton-tema.component.html',
  styleUrl: './boton-tema.component.css',
})
export class BotonTemaComponent {
  private readonly temaService = inject(TemaService);

  readonly flotante = input<boolean>(false);

  protected readonly esOscuro = this.temaService.esOscuro;
  protected readonly iconos = ICONOS;

  protected readonly etiqueta = computed<string>(() =>
    this.esOscuro() ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro',
  );

  protected alternar(): void {
    this.temaService.alternar();
  }
}
