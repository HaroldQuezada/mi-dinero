import { Component, DestroyRef, inject, input, output, signal } from '@angular/core';
import { FaIconComponent } from '@fortawesome/angular-fontawesome';
import { ICONOS } from '../../iconos';

let siguienteId = 0;

// Debe ser algo mayor que la animación de salida más larga de modal.component.css
const ESPERA_MAXIMA_SALIDA_MS = 400;

// Contenedor genérico de diálogo: título, contenido proyectado y acciones
// Cancelar/Confirmar. Enter en cualquier campo confirma; Escape o clic fuera cierra.
//
// Animado: entra con fade + escala (o deslizándose desde abajo en móvil) y antes de
// emitir `cerrar` reproduce la animación de salida. Los modales que lo usan deben
// cerrarse con `cerrarAnimado()` para que la salida también se vea tras guardar.
@Component({
  selector: 'app-modal',
  imports: [FaIconComponent],
  templateUrl: './modal.component.html',
  styleUrl: './modal.component.css',
  host: { '(document:keydown.escape)': 'alPresionarEscape($event)' },
})
export class ModalComponent {
  readonly titulo = input.required<string>();
  readonly textoConfirmar = input<string>('Guardar');
  readonly textoCancelar = input<string>('Cancelar');

  readonly cerrar = output<void>();
  readonly confirmar = output<void>();

  protected readonly idTitulo = `modal-titulo-${siguienteId++}`;
  protected readonly iconos = ICONOS;
  protected readonly saliendo = signal(false);

  private temporizadorSalida: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    inject(DestroyRef).onDestroy(() => this.limpiarTemporizador());
  }

  cerrarAnimado(): void {
    if (this.saliendo()) return;
    this.saliendo.set(true);
    // Respaldo por si el navegador no dispara animationend (animaciones desactivadas)
    this.temporizadorSalida = setTimeout(() => this.finalizarSalida(), ESPERA_MAXIMA_SALIDA_MS);
  }

  protected alTerminarAnimacion(evento: AnimationEvent): void {
    if (this.saliendo() && evento.target === evento.currentTarget) this.finalizarSalida();
  }

  protected alPresionarEscape(evento: Event): void {
    // Si un popup interno (p. ej. el calendario) ya atendió el Escape, no cierra el modal
    if (!evento.defaultPrevented) this.cerrarAnimado();
  }

  protected enviar(evento: Event): void {
    evento.preventDefault();
    if (!this.saliendo()) this.confirmar.emit();
  }

  private finalizarSalida(): void {
    if (this.temporizadorSalida === null) return;
    this.limpiarTemporizador();
    this.cerrar.emit();
  }

  private limpiarTemporizador(): void {
    if (this.temporizadorSalida !== null) clearTimeout(this.temporizadorSalida);
    this.temporizadorSalida = null;
  }
}
