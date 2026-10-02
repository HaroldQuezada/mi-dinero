import { Component, inject } from '@angular/core';
import { DateAdapter, MAT_DATE_FORMATS, MAT_DATE_LOCALE } from '@angular/material/core';
import { AdaptadorFechaLocal, FORMATOS_FECHA } from '../../core/adaptador-fecha';
import { LOCALE } from '../../core/constantes';
import { PageFooterComponent } from '../../shared/components/page-footer/page-footer.component';
import { PageHeaderComponent } from '../../shared/components/page-header/page-header.component';
import { TabsComponent } from '../../shared/components/tabs/tabs.component';
import { MenuRespaldoComponent } from './components/menu-respaldo/menu-respaldo.component';
import { DineroPreferenciasService } from './dinero-preferencias.service';
import { DineroService } from './dinero.service';
import { TABS_DINERO } from './dinero.constantes';
import { CuentasTabComponent } from './tabs/cuentas-tab/cuentas-tab.component';
import { DashboardTabComponent } from './tabs/dashboard-tab/dashboard-tab.component';
import { DeudasTabComponent } from './tabs/deudas-tab/deudas-tab.component';
import { GastosFijosTabComponent } from './tabs/gastos-fijos-tab/gastos-fijos-tab.component';
import { MovimientosTabComponent } from './tabs/movimientos-tab/movimientos-tab.component';
import { PresupuestoTabComponent } from './tabs/presupuesto-tab/presupuesto-tab.component';

@Component({
  selector: 'app-dinero',
  imports: [
    PageHeaderComponent,
    PageFooterComponent,
    TabsComponent,
    MenuRespaldoComponent,
    DashboardTabComponent,
    MovimientosTabComponent,
    CuentasTabComponent,
    DeudasTabComponent,
    GastosFijosTabComponent,
    PresupuestoTabComponent,
  ],
  templateUrl: './dinero.component.html',
  host: { class: 'pagina' },
  // Configuración de los selectores de fecha de Material. Vive aquí (y no en app.config)
  // para que Material solo se descargue al entrar a Mi Dinero.
  providers: [
    { provide: MAT_DATE_LOCALE, useValue: LOCALE },
    { provide: DateAdapter, useClass: AdaptadorFechaLocal },
    { provide: MAT_DATE_FORMATS, useValue: FORMATOS_FECHA },
  ],
})
export class DineroComponent {
  protected readonly tabs = TABS_DINERO;
  // La pestaña activa se recuerda entre recargas
  protected readonly tabActiva = inject(DineroPreferenciasService).tabActiva;
  protected readonly requiereMigracion = inject(DineroService).requiereMigracion;
}
