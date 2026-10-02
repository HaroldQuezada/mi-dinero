import { Component, computed, inject, input, model } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { GrupoCategoria, SeleccionCategoria, TipoCategoria } from '../../dinero.models';
import { DineroService } from '../../dinero.service';

let siguienteId = 0;

const SEPARADOR = '|';

// Las opciones del select codifican "categoriaId|subcategoriaId" (subcategoría vacía = general)
function codificar(seleccion: SeleccionCategoria): string {
  return seleccion.categoriaId ? `${seleccion.categoriaId}${SEPARADOR}${seleccion.subcategoriaId ?? ''}` : '';
}

function decodificar(valor: string): SeleccionCategoria {
  const [categoriaId, subcategoriaId] = valor.split(SEPARADOR);
  return { categoriaId: categoriaId || null, subcategoriaId: subcategoriaId || null };
}

// Select de categorías (de gasto o de ingreso) agrupadas con sus subcategorías.
// Uso: <app-selector-categoria tipo="GASTO" [(valor)]="seleccion" />
@Component({
  selector: 'app-selector-categoria',
  imports: [FormsModule],
  templateUrl: './selector-categoria.component.html',
})
export class SelectorCategoriaComponent {
  private readonly service = inject(DineroService);

  readonly valor = model.required<SeleccionCategoria>();
  readonly tipo = input<TipoCategoria>('GASTO');
  readonly etiqueta = input<string>('Categoría');

  protected readonly idCampo = `selector-categoria-${siguienteId++}`;

  protected readonly grupos = computed<GrupoCategoria[]>(
    () => this.service.gruposCategoria()[this.tipo()],
  );

  protected readonly valorCodificado = computed<string>(() => codificar(this.valor()));

  protected cambiar(valor: string): void {
    this.valor.set(decodificar(valor));
  }
}
