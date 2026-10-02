import { Pipe, PipeTransform } from '@angular/core';
import { formatoFechaLarga } from '../../core/utils';

// YYYY-MM-DD -> "miércoles, 1 de octubre"
@Pipe({ name: 'fechaLarga' })
export class FechaLargaPipe implements PipeTransform {
  transform(fechaIso: string): string {
    return formatoFechaLarga(fechaIso);
  }
}
