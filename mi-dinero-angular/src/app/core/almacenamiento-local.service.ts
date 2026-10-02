import { Injectable } from '@angular/core';
import { PREFIJO_ALMACENAMIENTO } from './constantes';

/** Comprueba en tiempo de ejecución que un valor leído tenga la forma esperada. */
export type ValidadorAlmacenamiento<T> = (valor: unknown) => valor is T;

// Envoltorio tipado de localStorage. Todo acceso va en try/catch porque el
// almacenamiento puede estar bloqueado (modo privado) o lleno.
@Injectable({ providedIn: 'root' })
export class AlmacenamientoLocalService {
  leer<T>(clave: string, esValido: ValidadorAlmacenamiento<T>): T | null {
    try {
      const crudo = localStorage.getItem(PREFIJO_ALMACENAMIENTO + clave);
      if (crudo === null) return null;
      const valor: unknown = JSON.parse(crudo);
      return esValido(valor) ? valor : null;
    } catch {
      return null;
    }
  }

  guardar<T>(clave: string, valor: T): boolean {
    try {
      localStorage.setItem(PREFIJO_ALMACENAMIENTO + clave, JSON.stringify(valor));
      return true;
    } catch (error) {
      console.warn('No se pudo guardar en localStorage', error);
      return false;
    }
  }

  eliminar(clave: string): void {
    try {
      localStorage.removeItem(PREFIJO_ALMACENAMIENTO + clave);
    } catch {
      // Sin acceso al almacenamiento: no hay nada que borrar
    }
  }
}

export function esObjeto(valor: unknown): valor is Record<string, unknown> {
  return typeof valor === 'object' && valor !== null && !Array.isArray(valor);
}
