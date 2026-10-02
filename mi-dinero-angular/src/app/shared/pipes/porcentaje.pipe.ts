import { Pipe, PipeTransform } from '@angular/core';

// 45.6 -> "46%"
@Pipe({ name: 'porcentaje' })
export class PorcentajePipe implements PipeTransform {
  transform(valor: number): string {
    return `${valor.toFixed(0)}%`;
  }
}
