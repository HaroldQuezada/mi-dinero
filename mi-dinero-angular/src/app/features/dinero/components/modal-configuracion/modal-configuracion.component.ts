import { Component, computed, inject, output, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NotificacionService } from '../../../../core/notificacion.service';
import { ModalComponent } from '../../../../shared/components/modal/modal.component';
import { MonedaPipe } from '../../../../shared/pipes/moneda.pipe';
import { avisoSumaPorcentajes, sumaPorcentajesCorrecta } from '../../dinero.calculos';
import { PORCENTAJE_TOTAL } from '../../dinero.constantes';
import { AvisoSuma, CategoriaGrande, PorcentajesPorCategoria } from '../../dinero.models';
import { DineroService } from '../../dinero.service';

interface FilaPorcentaje {
  categoria: CategoriaGrande;
  porcentaje: number;
  monto: number;
}

// Ingreso mensual base y reparto porcentual entre categorías grandes
@Component({
  selector: 'app-modal-configuracion',
  imports: [FormsModule, ModalComponent, MonedaPipe],
  templateUrl: './modal-configuracion.component.html',
})
export class ModalConfiguracionComponent {
  private readonly service = inject(DineroService);
  private readonly notificacion = inject(NotificacionService);

  readonly cerrar = output<void>();

  // Se cierra a través del modal para que se vea la animación de salida
  private readonly modal = viewChild.required(ModalComponent);

  // El formulario parte de los valores guardados al momento de abrir el modal
  protected readonly ingreso = signal<number | null>(this.service.configuracion().ingreso_mensual || 0);
  private readonly porcentajes = signal<PorcentajesPorCategoria>(
    Object.fromEntries(this.service.categoriasGasto().map((cg) => [cg.id, cg.porcentaje])),
  );

  protected readonly filas = computed<FilaPorcentaje[]>(() => {
    const ingreso = this.ingreso() || 0;
    return this.service.categoriasGasto().map((categoria) => {
      const porcentaje = this.porcentajes()[categoria.id] ?? 0;
      return { categoria, porcentaje, monto: (ingreso * porcentaje) / PORCENTAJE_TOTAL };
    });
  });

  private readonly suma = computed<number>(() =>
    Object.values(this.porcentajes()).reduce((acc, p) => acc + p, 0),
  );

  protected readonly aviso = computed<AvisoSuma>(() => avisoSumaPorcentajes(this.suma()));

  protected actualizarPorcentaje(categoriaId: string, valor: number | null): void {
    this.porcentajes.update((actuales) => ({ ...actuales, [categoriaId]: Number(valor) || 0 }));
  }

  protected async guardar(): Promise<void> {
    const porcentajes = this.porcentajes();
    const hayCategorias = Object.keys(porcentajes).length > 0;
    if (hayCategorias && !sumaPorcentajesCorrecta(this.suma())) {
      const continuar = this.notificacion.confirmar(
        `Los porcentajes suman ${this.suma()}%. ¿Guardar de todas formas?`,
      );
      if (!continuar) return;
    }

    const error = await this.service.guardarConfiguracion(this.ingreso() || 0, porcentajes);
    if (error) {
      this.notificacion.error(error);
      return;
    }
    this.modal().cerrarAnimado();
  }
}
