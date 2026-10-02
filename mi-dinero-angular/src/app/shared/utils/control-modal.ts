import { signal } from '@angular/core';

// Estado de un modal de creación/edición: si está abierto y qué entidad edita
// (null = crear una nueva).
export class ControlModal<T> {
  private readonly estaAbierto = signal(false);
  private readonly entidadActual = signal<T | null>(null);

  readonly abierto = this.estaAbierto.asReadonly();
  readonly entidad = this.entidadActual.asReadonly();

  abrir(entidad: T | null = null): void {
    this.entidadActual.set(entidad);
    this.estaAbierto.set(true);
  }

  cerrar(): void {
    this.estaAbierto.set(false);
  }
}
