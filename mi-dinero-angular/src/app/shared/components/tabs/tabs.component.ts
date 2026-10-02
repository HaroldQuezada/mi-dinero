import { Component, input, model } from '@angular/core';
import { TabItem } from '../../models/ui.models';

// Barra de pestañas genérica. Uso: <app-tabs [tabs]="TABS" [(activa)]="tabActiva" />
@Component({
  selector: 'app-tabs',
  templateUrl: './tabs.component.html',
  styleUrl: './tabs.component.css',
})
export class TabsComponent<T extends string> {
  readonly tabs = input.required<readonly TabItem<T>[]>();
  readonly activa = model.required<T>();
  readonly etiqueta = input<string>('Secciones');
}
