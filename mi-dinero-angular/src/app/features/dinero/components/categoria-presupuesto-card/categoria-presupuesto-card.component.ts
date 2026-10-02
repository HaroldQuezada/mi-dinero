import { Component, computed, inject, input, output } from '@angular/core';
import { FaIconComponent } from '@fortawesome/angular-fontawesome';
import { NotificacionService } from '../../../../core/notificacion.service';
import { AccionesFilaComponent } from '../../../../shared/components/acciones-fila/acciones-fila.component';
import { ProgressBarComponent } from '../../../../shared/components/progress-bar/progress-bar.component';
import { ICONOS } from '../../../../shared/iconos';
import { MonedaPipe } from '../../../../shared/pipes/moneda.pipe';
import { PorcentajePipe } from '../../../../shared/pipes/porcentaje.pipe';
import { ResumenCategoria, Subcategoria } from '../../dinero.models';
import { DineroService } from '../../dinero.service';

// Categoría grande del presupuesto: indicador de color e icono, cifras, barra de uso,
// subcategorías y acciones
@Component({
  selector: 'app-categoria-presupuesto-card',
  imports: [FaIconComponent, AccionesFilaComponent, ProgressBarComponent, MonedaPipe, PorcentajePipe],
  templateUrl: './categoria-presupuesto-card.component.html',
  styleUrl: './categoria-presupuesto-card.component.css',
})
export class CategoriaPresupuestoCardComponent {
  private readonly service = inject(DineroService);
  private readonly notificacion = inject(NotificacionService);

  readonly resumen = input.required<ResumenCategoria>();

  readonly editar = output<void>();
  readonly agregarSubcategoria = output<void>();

  protected readonly iconos = ICONOS;

  protected readonly textoSubcategorias = computed<string>(() => {
    const cantidad = this.resumen().subcategorias.length;
    return `${cantidad} ${cantidad === 1 ? 'subcategoría' : 'subcategorías'}`;
  });

  protected async eliminar(): Promise<void> {
    const mensaje =
      '¿Eliminar esta categoría y todas sus subcategorías? Los movimientos registrados no se borran.';
    if (!this.notificacion.confirmar(mensaje)) return;
    const error = await this.service.eliminarCategoriaGrande(this.resumen().categoria.id);
    if (error) this.notificacion.error(error);
  }

  protected async eliminarSubcategoria(subcategoria: Subcategoria): Promise<void> {
    if (!this.notificacion.confirmar('¿Eliminar esta subcategoría?')) return;
    const error = await this.service.eliminarSubcategoria(subcategoria.id);
    if (error) this.notificacion.error(error);
  }
}
