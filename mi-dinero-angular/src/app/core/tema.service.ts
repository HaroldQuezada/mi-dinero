import { computed, DOCUMENT, effect, inject, Injectable, signal } from '@angular/core';
import { AlmacenamientoLocalService } from './almacenamiento-local.service';
import { ATRIBUTO_TEMA, CLAVES_ALMACENAMIENTO, DURACION_TRANSICION_TEMA } from './constantes';

export type Tema = 'claro' | 'oscuro';

const CLASE_TRANSICION = 'transicion-tema';

function esTema(valor: unknown): valor is Tema {
  return valor === 'claro' || valor === 'oscuro';
}

// Tema visual de la app. Se aplica como `data-tema` en <html> y se recuerda en localStorage.
@Injectable({ providedIn: 'root' })
export class TemaService {
  private readonly almacenamiento = inject(AlmacenamientoLocalService);
  private readonly documento = inject(DOCUMENT);

  private readonly temaActual = signal<Tema>(this.temaInicial());

  readonly tema = this.temaActual.asReadonly();
  readonly esOscuro = computed<boolean>(() => this.tema() === 'oscuro');

  constructor() {
    effect(() => {
      const tema = this.tema();
      this.documento.documentElement.dataset[ATRIBUTO_TEMA] = tema;
      this.almacenamiento.guardar(CLAVES_ALMACENAMIENTO.tema, tema);
    });
  }

  alternar(): void {
    // La transición de colores solo se activa durante el cambio, no al cargar ni al navegar
    const html = this.documento.documentElement;
    html.classList.add(CLASE_TRANSICION);
    this.temaActual.update((tema) => (tema === 'oscuro' ? 'claro' : 'oscuro'));
    setTimeout(() => html.classList.remove(CLASE_TRANSICION), DURACION_TRANSICION_TEMA);
  }

  private temaInicial(): Tema {
    const guardado = this.almacenamiento.leer(CLAVES_ALMACENAMIENTO.tema, esTema);
    if (guardado) return guardado;
    const prefiereClaro = this.documento.defaultView?.matchMedia('(prefers-color-scheme: light)').matches;
    return prefiereClaro ? 'claro' : 'oscuro';
  }
}
