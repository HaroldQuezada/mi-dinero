import { Component, computed, inject, input, model } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { OpcionSelect } from '../../../../shared/models/ui.models';
import { MonedaPipe } from '../../../../shared/pipes/moneda.pipe';
import { DineroService } from '../../dinero.service';

let siguienteId = 0;

// Select de cuentas. Uso: <app-selector-cuenta etiqueta="Desde" [(valor)]="origenId" />
@Component({
  selector: 'app-selector-cuenta',
  imports: [FormsModule, MonedaPipe],
  templateUrl: './selector-cuenta.component.html',
})
export class SelectorCuentaComponent {
  private readonly service = inject(DineroService);

  readonly valor = model.required<string | null>();
  readonly etiqueta = input<string>('Cuenta');
  // Cuenta que no se puede elegir (p. ej. el origen al elegir el destino de un traslado)
  readonly excluir = input<string | null>(null);

  protected readonly idCampo = `selector-cuenta-${siguienteId++}`;

  protected readonly opciones = computed<OpcionSelect[]>(() =>
    this.service.opcionesCuenta().filter((o) => o.valor !== this.excluir()),
  );

  // Muestra el saldo de la cuenta elegida como ayuda
  protected readonly saldoElegida = computed<number | null>(
    () => this.service.cuenta(this.valor())?.saldoActual ?? null,
  );
}
