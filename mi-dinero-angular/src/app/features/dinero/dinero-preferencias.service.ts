import { effect, inject, Injectable, signal } from '@angular/core';
import { AlmacenamientoLocalService, esObjeto } from '../../core/almacenamiento-local.service';
import { CLAVES_ALMACENAMIENTO } from '../../core/constantes';
import { SLOTS_COLOR, TAB_POR_DEFECTO, TABS_DINERO } from './dinero.constantes';
import { ColoresCategoria, PreferenciasDinero, SlotColor, TabDinero } from './dinero.models';

export function esSlotColor(valor: unknown): valor is SlotColor {
  return SLOTS_COLOR.some((slot) => slot === valor);
}

export function esColoresCategoria(valor: unknown): valor is ColoresCategoria {
  return esObjeto(valor) && Object.values(valor).every(esSlotColor);
}

function esTabDinero(valor: unknown): valor is TabDinero {
  return TABS_DINERO.some((tab) => tab.id === valor);
}

function esPreferenciasDinero(valor: unknown): valor is PreferenciasDinero {
  return (
    esObjeto(valor) &&
    esTabDinero(valor['tabActiva']) &&
    esColoresCategoria(valor['coloresCategoria'])
  );
}

const PREFERENCIAS_INICIALES: PreferenciasDinero = {
  tabActiva: TAB_POR_DEFECTO,
  coloresCategoria: {},
};

// Preferencias de interfaz de Mi Dinero (pestaña activa, color de cada categoría).
// Se guardan automáticamente en localStorage en cada cambio.
@Injectable({ providedIn: 'root' })
export class DineroPreferenciasService {
  private readonly almacenamiento = inject(AlmacenamientoLocalService);

  private readonly guardadas: PreferenciasDinero =
    this.almacenamiento.leer(CLAVES_ALMACENAMIENTO.preferenciasDinero, esPreferenciasDinero) ??
    PREFERENCIAS_INICIALES;

  readonly tabActiva = signal<TabDinero>(this.guardadas.tabActiva);
  readonly coloresCategoria = signal<ColoresCategoria>(this.guardadas.coloresCategoria);

  constructor() {
    effect(() => {
      this.almacenamiento.guardar<PreferenciasDinero>(CLAVES_ALMACENAMIENTO.preferenciasDinero, {
        tabActiva: this.tabActiva(),
        coloresCategoria: this.coloresCategoria(),
      });
    });
  }

  asignarColor(categoriaId: string, slot: SlotColor): void {
    this.coloresCategoria.update((colores) => ({ ...colores, [categoriaId]: slot }));
  }

  quitarColor(categoriaId: string): void {
    this.coloresCategoria.update(({ [categoriaId]: _eliminado, ...resto }) => resto);
  }
}
