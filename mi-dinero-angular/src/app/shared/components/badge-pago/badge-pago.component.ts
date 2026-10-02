import { Component, input } from '@angular/core';

@Component({
  selector: 'app-badge-pago',
  templateUrl: './badge-pago.component.html',
})
export class BadgePagoComponent {
  readonly pagado = input.required<boolean>();
  readonly textoPagado = input<string>('Pagado');
  readonly textoPendiente = input<string>('Pendiente');
}
