import { Injectable } from '@angular/core';

// Punto único para avisos y confirmaciones al usuario.
// Hoy usa los diálogos nativos; cambiar a un toast/modal propio solo toca este archivo.
@Injectable({ providedIn: 'root' })
export class NotificacionService {
  informar(mensaje: string): void {
    alert(mensaje);
  }

  error(detalle: string): void {
    alert(`Error: ${detalle}`);
  }

  confirmar(mensaje: string): boolean {
    return confirm(mensaje);
  }
}
