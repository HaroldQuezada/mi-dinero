import { Component, computed, inject, input, linkedSignal, output, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { FaIconComponent } from '@fortawesome/angular-fontawesome';
import { IconDefinition } from '@fortawesome/fontawesome-svg-core';
import { NotificacionService } from '../../../../core/notificacion.service';
import { ModalComponent } from '../../../../shared/components/modal/modal.component';
import { categoriaPredeterminadaDe } from '../../dinero.calculos';
import { colorDeSlot, SLOTS_COLOR } from '../../dinero.constantes';
import { CategoriaGrande, CategoriaGrandePayload, SlotColor, TipoCategoria } from '../../dinero.models';
import { DineroService } from '../../dinero.service';

interface OpcionColor {
  slot: SlotColor;
  color: string;
}

@Component({
  selector: 'app-modal-categoria',
  imports: [FormsModule, FaIconComponent, ModalComponent],
  templateUrl: './modal-categoria.component.html',
  styleUrl: './modal-categoria.component.css',
})
export class ModalCategoriaComponent {
  private readonly service = inject(DineroService);
  private readonly notificacion = inject(NotificacionService);

  // null = crear una categoría nueva
  readonly categoria = input<CategoriaGrande | null>(null);
  // Tipo de una categoría nueva; al editar manda el de la categoría
  readonly tipoNueva = input<TipoCategoria>('GASTO');
  readonly cerrar = output<void>();

  // Se cierra a través del modal para que se vea la animación de salida
  private readonly modal = viewChild.required(ModalComponent);

  protected readonly opcionesColor: readonly OpcionColor[] = SLOTS_COLOR.map((slot) => ({
    slot,
    color: colorDeSlot(slot),
  }));

  protected readonly nombre = linkedSignal<string>(() => this.categoria()?.nombre ?? '');
  protected readonly porcentaje = linkedSignal<number | null>(() => this.categoria()?.porcentaje ?? 0);

  // null = el usuario no eligió color: se usa el sugerido
  private readonly slotElegido = signal<SlotColor | null>(null);

  // Una categoría nueva toma el color de la sugerida con su nombre o el siguiente libre de la paleta
  protected readonly slot = computed<SlotColor>(() => {
    const elegido = this.slotElegido();
    if (elegido) return elegido;
    const existente = this.categoria();
    if (existente) return this.service.slotDeCategoria(existente.id);
    return (
      categoriaPredeterminadaDe(this.nombre())?.slot ??
      SLOTS_COLOR[this.service.categoriasGrandes().length % SLOTS_COLOR.length]
    );
  });

  protected readonly icono = computed<IconDefinition>(() => this.service.iconoDeCategoria(this.nombre()));
  protected readonly colorActual = computed<string>(() => colorDeSlot(this.slot()));

  protected readonly tipo = computed<TipoCategoria>(() => this.categoria()?.tipo ?? this.tipoNueva());
  // Las categorías de ingreso no reparten presupuesto
  protected readonly conPorcentaje = computed<boolean>(() => this.tipo() === 'GASTO');

  protected readonly titulo = computed<string>(() => {
    const accion = this.categoria() ? 'Editar' : 'Nueva';
    return `${accion} categoría de ${this.tipo() === 'GASTO' ? 'gasto' : 'ingreso'}`;
  });

  protected elegirColor(slot: SlotColor): void {
    this.slotElegido.set(slot);
  }

  protected async guardar(): Promise<void> {
    const nombre = this.nombre().trim();
    if (!nombre) {
      this.notificacion.informar('Escribe un nombre');
      return;
    }

    const existente = this.categoria();
    const porcentaje = this.conPorcentaje() ? this.porcentaje() || 0 : 0;
    const payload: CategoriaGrandePayload = existente
      ? { nombre, porcentaje }
      : { nombre, porcentaje, tipo: this.tipo(), orden: this.service.categoriasGrandes().length + 1 };

    const error = await this.service.guardarCategoriaGrande(
      payload,
      existente?.id,
      this.slotElegido() ?? undefined,
    );
    if (error) {
      this.notificacion.error(error);
      return;
    }
    this.modal().cerrarAnimado();
  }
}
