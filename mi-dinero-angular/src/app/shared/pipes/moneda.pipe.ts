import { Pipe, PipeTransform } from '@angular/core';
import { formatoMoneda } from '../../core/utils';

@Pipe({ name: 'moneda' })
export class MonedaPipe implements PipeTransform {
  transform(valor: number | null | undefined): string {
    return formatoMoneda(valor);
  }
}
