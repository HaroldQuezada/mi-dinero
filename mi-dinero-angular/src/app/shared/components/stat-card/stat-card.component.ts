import { Component, computed, input } from '@angular/core';
import { FaIconComponent } from '@fortawesome/angular-fontawesome';
import { IconDefinition } from '@fortawesome/fontawesome-svg-core';
import { ICONOS } from '../../iconos';
import { MonedaPipe } from '../../pipes/moneda.pipe';
import { PorcentajePipe } from '../../pipes/porcentaje.pipe';

export type TonoValor = 'neutro' | 'positivo' | 'negativo';

interface InfoVariacion {
  icono: IconDefinition;
  valorAbsoluto: number;
  favorable: boolean;
  texto: string;
}

// Tarjeta de cifra destacada (KPI). Opcionalmente muestra un icono y la variación
// frente al mes anterior. Acepta contenido extra proyectado (ej. un botón).
@Component({
  selector: 'app-stat-card',
  imports: [FaIconComponent, MonedaPipe, PorcentajePipe],
  templateUrl: './stat-card.component.html',
  styleUrl: './stat-card.component.css',
})
export class StatCardComponent {
  readonly etiqueta = input.required<string>();
  readonly valor = input.required<number>();
  readonly subetiqueta = input<string>('');
  readonly destacada = input<boolean>(false);
  // Cifra principal de la vista: más grande y ocupando dos columnas
  readonly hero = input<boolean>(false);
  readonly icono = input<IconDefinition | null>(null);
  readonly tono = input<TonoValor>('neutro');
  // Variación porcentual vs el periodo anterior (null = sin dato comparable)
  readonly variacion = input<number | null>(null);
  // false para métricas donde subir es malo (gastos, deudas)
  readonly subirEsBueno = input<boolean>(true);

  protected readonly infoVariacion = computed<InfoVariacion | null>(() => {
    const variacion = this.variacion();
    if (variacion === null || !isFinite(variacion)) return null;
    const sube = variacion >= 0;
    return {
      icono: sube ? ICONOS.subida : ICONOS.bajada,
      valorAbsoluto: Math.abs(variacion),
      favorable: sube === this.subirEsBueno(),
      texto: sube ? 'más' : 'menos',
    };
  });
}
