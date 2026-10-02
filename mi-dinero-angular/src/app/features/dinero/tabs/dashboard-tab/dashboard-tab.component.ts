import { Component, computed, inject, signal } from '@angular/core';
import { FaIconComponent } from '@fortawesome/angular-fontawesome';
import { variacionPorcentual } from '../../../../core/utils';
import { StatCardComponent } from '../../../../shared/components/stat-card/stat-card.component';
import { ICONOS } from '../../../../shared/iconos';
import { FechaCortaPipe } from '../../../../shared/pipes/fecha-corta.pipe';
import { MonedaPipe } from '../../../../shared/pipes/moneda.pipe';
import { ControlModal } from '../../../../shared/utils/control-modal';
import { GastoFijoFilaComponent } from '../../components/gasto-fijo-fila/gasto-fijo-fila.component';
import { GraficaBalanceComponent } from '../../components/grafica-balance/grafica-balance.component';
import { GraficaCategoriasComponent } from '../../components/grafica-categorias/grafica-categorias.component';
import { GraficaFlujoComponent } from '../../components/grafica-flujo/grafica-flujo.component';
import { GraficaPresupuestoComponent } from '../../components/grafica-presupuesto/grafica-presupuesto.component';
import { MetaAhorroCardComponent } from '../../components/meta-ahorro-card/meta-ahorro-card.component';
import { ModalAjusteSaldoComponent } from '../../components/modal-ajuste-saldo/modal-ajuste-saldo.component';
import { ModalConfiguracionComponent } from '../../components/modal-configuracion/modal-configuracion.component';
import { ModalMetaComponent } from '../../components/modal-meta/modal-meta.component';
import { MontoMovimientoComponent } from '../../components/monto-movimiento/monto-movimiento.component';
import { CANTIDAD_ULTIMOS_MOVIMIENTOS, colorDeSlot, ETIQUETAS_TIPO_CUENTA } from '../../dinero.constantes';
import { Cuenta, MetaAhorro, ResumenMes, Transaccion } from '../../dinero.models';
import { DineroService } from '../../dinero.service';

interface VariacionesMes {
  ingresos: number | null;
  gastos: number | null;
}

@Component({
  selector: 'app-dashboard-tab',
  imports: [
    FaIconComponent,
    StatCardComponent,
    GraficaFlujoComponent,
    GraficaBalanceComponent,
    GraficaCategoriasComponent,
    GraficaPresupuestoComponent,
    MetaAhorroCardComponent,
    GastoFijoFilaComponent,
    MontoMovimientoComponent,
    ModalAjusteSaldoComponent,
    ModalConfiguracionComponent,
    ModalMetaComponent,
    FechaCortaPipe,
    MonedaPipe,
  ],
  templateUrl: './dashboard-tab.component.html',
  styleUrl: './dashboard-tab.component.css',
})
export class DashboardTabComponent {
  protected readonly service = inject(DineroService);

  protected readonly iconos = ICONOS;
  protected readonly etiquetaTipoCuenta = ETIQUETAS_TIPO_CUENTA;
  protected readonly modalAjusteAbierto = signal(false);
  protected readonly modalConfiguracionAbierto = signal(false);
  protected readonly modalMeta = new ControlModal<MetaAhorro>();

  protected readonly ultimosMovimientos = computed<Transaccion[]>(() =>
    this.service.movimientos().slice(0, CANTIDAD_ULTIMOS_MOVIMIENTOS),
  );

  protected readonly netoMes = computed<number>(() => this.service.ingresosMes() - this.service.gastosMes());

  protected colorCuenta(cuenta: Cuenta): string {
    return colorDeSlot(cuenta.color);
  }

  // Comparación del mes actual con el anterior (los dos últimos del histórico)
  protected readonly variaciones = computed<VariacionesMes>(() => {
    const historico = this.service.historicoMensual();
    const actual: ResumenMes | undefined = historico.at(-1);
    const anterior: ResumenMes | undefined = historico.at(-2);
    if (!actual || !anterior) return { ingresos: null, gastos: null };
    return {
      ingresos: variacionPorcentual(actual.ingresos, anterior.ingresos),
      gastos: variacionPorcentual(actual.gastos, anterior.gastos),
    };
  });
}
