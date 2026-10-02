import { Component, computed, inject, linkedSignal, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { claveMes, formatoMesAnio, mesRelativo } from '../../../../core/utils';
import { DIAS_SEMANA, DIAS_SEMANA_LABEL } from '../../habitos.constantes';
import { CeldaCalendario, Habito } from '../../habitos.models';
import { HabitosService } from '../../habitos.service';

@Component({
  selector: 'app-calendario-tab',
  imports: [FormsModule],
  templateUrl: './calendario-tab.component.html',
  styleUrl: './calendario-tab.component.css',
})
export class CalendarioTabComponent {
  private readonly service = inject(HabitosService);

  protected readonly habitos = this.service.habitos;
  protected readonly cabeceraDias: readonly string[] = DIAS_SEMANA.map((d) => DIAS_SEMANA_LABEL[d]);

  protected readonly mes = signal<Date>(mesRelativo(new Date(), 0));

  // Conserva la selección mientras el hábito exista; si no, toma el primero
  protected readonly habitoSeleccionadoId = linkedSignal<Habito[], string>({
    source: this.habitos,
    computation: (habitos, previo) =>
      previo && habitos.some((h) => h.id === previo.value) ? previo.value : (habitos[0]?.id ?? ''),
  });

  protected readonly titulo = computed<string>(() => formatoMesAnio(this.mes()));

  protected readonly habitoSeleccionado = computed<Habito | undefined>(() =>
    this.habitos().find((h) => h.id === this.habitoSeleccionadoId()),
  );

  protected readonly rachaActual = computed<number>(() => {
    const habito = this.habitoSeleccionado();
    return habito ? this.service.rachaActual(habito.id) : 0;
  });

  protected readonly rachaMasLarga = computed<number>(() => {
    const habito = this.habitoSeleccionado();
    return habito ? this.service.calcularRachaMasLarga(habito) : 0;
  });

  protected readonly celdas = computed<CeldaCalendario[]>(() => {
    const habito = this.habitoSeleccionado();
    if (!habito) return [];

    const mes = this.mes();
    const prefijo = claveMes(mes);
    const primerDiaSemana = mes.getDay();
    const diasEnMes = new Date(mes.getFullYear(), mes.getMonth() + 1, 0).getDate();

    const relleno: CeldaCalendario[] = Array.from({ length: primerDiaSemana }, (_, i) => ({
      clave: `vacia-${i}`,
      dia: null,
      estado: null,
    }));
    const dias: CeldaCalendario[] = Array.from({ length: diasEnMes }, (_, i) => {
      const dia = i + 1;
      const fechaIso = `${prefijo}-${String(dia).padStart(2, '0')}`;
      return { clave: fechaIso, dia, estado: this.service.registroDe(habito.id, fechaIso)?.estado ?? null };
    });
    return [...relleno, ...dias];
  });

  protected cambiarMes(delta: number): void {
    this.mes.update((mes) => mesRelativo(mes, delta));
  }
}
