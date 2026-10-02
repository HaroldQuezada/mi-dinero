import { Component, computed, input } from '@angular/core';
import { MonedaPipe } from '../../../../shared/pipes/moneda.pipe';
import { Transaccion } from '../../dinero.models';

// Monto con signo y color: ingreso (+), gasto (-) o traslado (sin signo: no cambia el total)
@Component({
  selector: 'app-monto-movimiento',
  imports: [MonedaPipe],
  templateUrl: './monto-movimiento.component.html',
})
export class MontoMovimientoComponent {
  readonly movimiento = input.required<Transaccion>();

  protected readonly signo = computed<string>(() => {
    const tipo = this.movimiento().tipo;
    if (tipo === 'INGRESO') return '+';
    return tipo === 'GASTO' ? '-' : '';
  });
}
