import { Component, computed, input, model } from '@angular/core';
import { MAT_DATE_FORMATS } from '@angular/material/core';
import { MatDatepicker, MatDatepickerModule } from '@angular/material/datepicker';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { FaIconComponent } from '@fortawesome/angular-fontawesome';
import { FORMATOS_MES } from '../../../core/adaptador-fecha';
import { claveMes, fechaDesdeIso } from '../../../core/utils';
import { ICONOS } from '../../iconos';

// Selector de mes (Datepicker de Material abierto en vista de año) que trabaja con
// cadenas YYYY-MM. Uso: <app-campo-mes etiqueta="Mes" [(valor)]="filtroMes" />
@Component({
  selector: 'app-campo-mes',
  imports: [MatFormFieldModule, MatInputModule, MatDatepickerModule, FaIconComponent],
  templateUrl: './campo-mes.component.html',
  styleUrl: '../campo-fecha/campo-fecha.component.css',
  // El campo muestra "octubre de 2026" en lugar de una fecha completa
  providers: [{ provide: MAT_DATE_FORMATS, useValue: FORMATOS_MES }],
})
export class CampoMesComponent {
  readonly etiqueta = input.required<string>();
  readonly valor = model.required<string>();

  protected readonly iconos = ICONOS;

  protected readonly fecha = computed<Date | null>(() => {
    const valor = this.valor();
    return valor ? fechaDesdeIso(`${valor}-01`) : null;
  });

  protected elegirMes(fecha: Date, selector: MatDatepicker<Date>): void {
    this.valor.set(claveMes(fecha));
    selector.close();
  }
}
