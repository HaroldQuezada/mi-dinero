import { Component, computed, inject, input, output, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NotificacionService } from '../../../../core/notificacion.service';
import { ModalComponent } from '../../../../shared/components/modal/modal.component';
import { CategoriaGrande } from '../../dinero.models';
import { DineroService } from '../../dinero.service';

@Component({
  selector: 'app-modal-subcategoria',
  imports: [FormsModule, ModalComponent],
  templateUrl: './modal-subcategoria.component.html',
})
export class ModalSubcategoriaComponent {
  private readonly service = inject(DineroService);
  private readonly notificacion = inject(NotificacionService);

  // Categoría grande a la que pertenecerá la subcategoría
  readonly categoria = input.required<CategoriaGrande>();
  readonly cerrar = output<void>();

  // Se cierra a través del modal para que se vea la animación de salida
  private readonly modal = viewChild.required(ModalComponent);

  protected readonly nombre = signal('');

  protected readonly titulo = computed<string>(
    () => `Nueva subcategoría en ${this.categoria().nombre}`,
  );

  protected async guardar(): Promise<void> {
    const nombre = this.nombre().trim();
    if (!nombre) {
      this.notificacion.informar('Escribe un nombre');
      return;
    }
    const error = await this.service.guardarSubcategoria(nombre, this.categoria().id);
    if (error) {
      this.notificacion.error(error);
      return;
    }
    this.modal().cerrarAnimado();
  }
}
