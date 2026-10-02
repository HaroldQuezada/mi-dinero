import { Pipe, PipeTransform } from '@angular/core';
import { formatoFecha } from '../../core/utils';

// YYYY-MM-DD -> DD/MM/YYYY
@Pipe({ name: 'fechaCorta' })
export class FechaCortaPipe implements PipeTransform {
  transform(fechaIso: string): string {
    return formatoFecha(fechaIso);
  }
}
