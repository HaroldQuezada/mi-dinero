import { Component } from '@angular/core';
import { NOMBRE_APP } from '../../../core/constantes';

@Component({
  selector: 'app-page-footer',
  templateUrl: './page-footer.component.html',
  styleUrl: './page-footer.component.css',
})
export class PageFooterComponent {
  protected readonly nombreApp = NOMBRE_APP;
  protected readonly anio = new Date().getFullYear();
}
