import { Component, computed, inject, signal } from '@angular/core';
import { FaIconComponent } from '@fortawesome/angular-fontawesome';
import { NotificacionService } from '../../../../core/notificacion.service';
import { mesActual } from '../../../../core/utils';
import { AccionesFilaComponent } from '../../../../shared/components/acciones-fila/acciones-fila.component';
import { CampoMesComponent } from '../../../../shared/components/campo-mes/campo-mes.component';
import { ICONOS } from '../../../../shared/iconos';
import { FechaCortaPipe } from '../../../../shared/pipes/fecha-corta.pipe';
import { MonedaPipe } from '../../../../shared/pipes/moneda.pipe';
import { ControlModal } from '../../../../shared/utils/control-modal';
import { ModalMovimientoComponent } from '../../components/modal-movimiento/modal-movimiento.component';
import { MontoMovimientoComponent } from '../../components/monto-movimiento/monto-movimiento.component';
import { sumarMontos } from '../../dinero.calculos';
import { TIPOS_MOVIMIENTO } from '../../dinero.constantes';
import { TipoMovimiento, Transaccion } from '../../dinero.models';
import { DineroService } from '../../dinero.service';

interface TotalesMes {
  ingresos: number;
  gastos: number;
  traslados: number;
}

@Component({
  selector: 'app-movimientos-tab',
  imports: [
    FaIconComponent,
    CampoMesComponent,
    AccionesFilaComponent,
    MontoMovimientoComponent,
    ModalMovimientoComponent,
    FechaCortaPipe,
    MonedaPipe,
  ],
  templateUrl: './movimientos-tab.component.html',
})
export class MovimientosTabComponent {
  protected readonly service = inject(DineroService);
  private readonly notificacion = inject(NotificacionService);

  protected readonly iconos = ICONOS;
  protected readonly tipos = TIPOS_MOVIMIENTO;
  protected readonly filtroMes = signal<string>(mesActual());
  // null = todos los tipos
  protected readonly filtroTipo = signal<TipoMovimiento | null>(null);
  protected readonly modal = new ControlModal<Transaccion>();

  private readonly movimientosDelMes = computed<Transaccion[]>(() =>
    this.service.movimientosDeMes(this.filtroMes() || mesActual()),
  );

  protected readonly movimientosFiltrados = computed<Transaccion[]>(() => {
    const tipo = this.filtroTipo();
    const movimientos = this.movimientosDelMes();
    return tipo ? movimientos.filter((m) => m.tipo === tipo) : movimientos;
  });

  protected readonly totales = computed<TotalesMes>(() => ({
    ingresos: sumarMontos(this.movimientosDelMes(), 'INGRESO'),
    gastos: sumarMontos(this.movimientosDelMes(), 'GASTO'),
    traslados: sumarMontos(this.movimientosDelMes(), 'TRASLADO'),
  }));

  protected alternarFiltro(tipo: TipoMovimiento): void {
    this.filtroTipo.update((actual) => (actual === tipo ? null : tipo));
  }

  protected async eliminar(movimiento: Transaccion): Promise<void> {
    if (!this.notificacion.confirmar('¿Eliminar esta transacción? El saldo de sus cuentas se recalcula.')) {
      return;
    }
    const error = await this.service.eliminarTransaccion(movimiento.id);
    if (error) this.notificacion.error(error);
  }
}
