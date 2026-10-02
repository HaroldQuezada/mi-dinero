import { Component, signal } from '@angular/core';
import { PageFooterComponent } from '../../shared/components/page-footer/page-footer.component';
import { PageHeaderComponent } from '../../shared/components/page-header/page-header.component';
import { TabsComponent } from '../../shared/components/tabs/tabs.component';
import { TABS_HABITOS } from './habitos.constantes';
import { TabHabitos } from './habitos.models';
import { CalendarioTabComponent } from './tabs/calendario-tab/calendario-tab.component';
import { GestionTabComponent } from './tabs/gestion-tab/gestion-tab.component';
import { HoyTabComponent } from './tabs/hoy-tab/hoy-tab.component';

@Component({
  selector: 'app-habitos',
  imports: [
    PageHeaderComponent,
    PageFooterComponent,
    TabsComponent,
    HoyTabComponent,
    GestionTabComponent,
    CalendarioTabComponent,
  ],
  templateUrl: './habitos.component.html',
  host: { class: 'pagina' },
})
export class HabitosComponent {
  protected readonly tabs = TABS_HABITOS;
  protected readonly tabActiva = signal<TabHabitos>('hoy');
}
