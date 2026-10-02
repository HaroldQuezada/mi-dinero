import { Component, computed, inject, input, linkedSignal, output, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NotificacionService } from '../../../../core/notificacion.service';
import { ModalComponent } from '../../../../shared/components/modal/modal.component';
import { GastoFijo, SeleccionCategoria } from '../../dinero.models';
import { DineroService } from '../../dinero.service';
import { SelectorCategoriaComponent } from '../selector-categoria/selector-categoria.component';
import { SelectorCuentaComponent } from '../selector-cuenta/selector-cuenta.component';

// Gasto fijo mensual: al marcarlo como pagado se crea un GASTO en su cuenta y categoría
@Component({
  selector: 'app-modal-gasto-fijo',
  imports: [FormsModule, ModalComponent, SelectorCategoriaComponent, SelectorCuentaComponent],
  templateUrl: './modal-gasto-fijo.component.html',
})
export class ModalGastoFijoComponent {
  private readonly service = inject(DineroService);
  private readonly notificacion = inject(NotificacionService);

  // null = crear un gasto fijo nuevo
  readonly gasto = input<GastoFijo | null>(null);
  readonly cerrar = output<void>();

  // Se cierra a través del modal para que se vea la animación de salida
  private readonly modal = viewChild.required(ModalComponent);

  protected readonly nombre = linkedSignal<string>(() => this.gasto()?.nombre ?? '');
  protected readonly monto = linkedSignal<number | null>(() => this.gasto()?.monto ?? null);
  protected readonly categoria = linkedSignal<SeleccionCategoria>(() => ({
    categoriaId: this.gasto()?.categoria_id ?? null,
    subcategoriaId: this.gasto()?.subcategoria_id ?? null,
  }));
  protected readonly cuentaId = linkedSignal<string | null>(
    () => this.gasto()?.cuenta_id ?? this.service.cuentaPrincipalId(),
  );

  protected readonly titulo = computed<string>(() => `${this.gasto() ? 'Editar' : 'Agregar'} gasto fijo`);

  protected async guardar(): Promise<void> {
    const nombre = this.nombre().trim();
    const monto = this.monto();
    const { categoriaId, subcategoriaId } = this.categoria();
    if (!nombre || !monto) {
      this.notificacion.informar('Completa nombre y monto');
      return;
    }
    if (!categoriaId) {
      this.notificacion.informar('Elige una categoría');
      return;
    }
    const error = await this.service.guardarGastoFijo(
      {
        nombre,
        monto,
        cuenta_id: this.cuentaId(),
        categoria_id: categoriaId,
        subcategoria_id: subcategoriaId,
      },
      this.gasto()?.id,
    );
    if (error) {
      this.notificacion.error(error);
      return;
    }
    this.modal().cerrarAnimado();
  }
}
