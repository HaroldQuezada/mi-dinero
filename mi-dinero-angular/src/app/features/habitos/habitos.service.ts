import { computed, effect, inject, Injectable, signal, untracked } from '@angular/core';
import { AuthService } from '../../core/auth.service';
import { SUPABASE_CLIENT } from '../../core/supabase';
import { MensajeError } from '../../core/tipos';
import { diaSemanaIso, fechaDesdeIso, fechaHoyIso, fechaIsoLocal } from '../../core/utils';
import {
  DIAS_SEMANA,
  DIAS_SEMANA_LABEL,
  FRECUENCIA_DIARIA,
  LIMITE_DIAS_RACHA,
  TABLAS_HABITOS,
} from './habitos.constantes';
import {
  DiaSemana,
  EstadoHoy,
  EstadoRegistro,
  Habito,
  HabitoPayload,
  RegistroHabito,
} from './habitos.models';

function claveRegistro(habitoId: string, fechaIso: string): string {
  return `${habitoId}|${fechaIso}`;
}

function esDiaSemana(valor: string): valor is DiaSemana {
  return (DIAS_SEMANA as readonly string[]).includes(valor);
}

@Injectable({ providedIn: 'root' })
export class HabitosService {
  private readonly db = inject(SUPABASE_CLIENT);
  private readonly auth = inject(AuthService);

  private readonly estado = {
    habitos: signal<Habito[]>([]),
    registros: signal<RegistroHabito[]>([]),
  };

  readonly habitos = this.estado.habitos.asReadonly();

  // Búsqueda O(1) de registros por hábito + fecha
  private readonly registrosPorClave = computed<Map<string, RegistroHabito>>(
    () => new Map(this.estado.registros().map((r) => [claveRegistro(r.habito_id, r.fecha), r])),
  );

  // Se recalcula solo cuando cambian hábitos o registros (antes se calculaba en cada render)
  private readonly rachasActuales = computed<Map<string, number>>(
    () => new Map(this.habitos().map((h) => [h.id, this.calcularRachaActual(h)])),
  );

  constructor() {
    // Carga los datos al iniciar sesión y los limpia al cerrarla
    effect(() => {
      const usuarioId = this.auth.usuarioId();
      untracked(() => (usuarioId ? void this.cargarTodo() : this.limpiar()));
    });
  }

  // ============================================
  // CARGA
  // ============================================
  async cargarTodo(): Promise<void> {
    await Promise.all([this.cargarHabitos(), this.cargarRegistros()]);
  }

  private limpiar(): void {
    this.estado.habitos.set([]);
    this.estado.registros.set([]);
  }

  async cargarHabitos(): Promise<void> {
    const { data, error } = await this.db
      .from(TABLAS_HABITOS.habitos)
      .select('*')
      .eq('activo', true)
      .order('created_at', { ascending: true })
      .overrideTypes<Habito[], { merge: false }>();
    if (error) {
      console.error(error);
      return;
    }
    this.estado.habitos.set(data);
  }

  async cargarRegistros(): Promise<void> {
    const { data, error } = await this.db
      .from(TABLAS_HABITOS.registros)
      .select('*')
      .overrideTypes<RegistroHabito[], { merge: false }>();
    if (error) {
      console.error(error);
      return;
    }
    this.estado.registros.set(data);
  }

  // ============================================
  // CONSULTAS
  // ============================================
  registroDe(habitoId: string, fechaIso: string): RegistroHabito | undefined {
    return this.registrosPorClave().get(claveRegistro(habitoId, fechaIso));
  }

  estadoEn(habitoId: string, fechaIso: string): EstadoHoy {
    return this.registroDe(habitoId, fechaIso)?.estado ?? 'pendiente';
  }

  diasDeFrecuencia(frecuencia: string): DiaSemana[] {
    if (frecuencia === FRECUENCIA_DIARIA) return [];
    return frecuencia
      .split(',')
      .map((d) => d.trim())
      .filter(esDiaSemana);
  }

  habitoAplicaEnFecha(habito: Habito, fechaIso: string): boolean {
    if (habito.frecuencia === FRECUENCIA_DIARIA) return true;
    return this.diasDeFrecuencia(habito.frecuencia).includes(DIAS_SEMANA[diaSemanaIso(fechaIso)]);
  }

  descripcionFrecuencia(frecuencia: string): string {
    if (frecuencia === FRECUENCIA_DIARIA) return 'Todos los días';
    return this.diasDeFrecuencia(frecuencia)
      .map((d) => DIAS_SEMANA_LABEL[d])
      .join(', ');
  }

  rachaActual(habitoId: string): number {
    return this.rachasActuales().get(habitoId) ?? 0;
  }

  calcularRachaMasLarga(habito: Habito): number {
    const fechasCompletadas = this.estado
      .registros()
      .filter((r) => r.habito_id === habito.id && r.estado === 'completado')
      .map((r) => r.fecha)
      .sort();

    if (fechasCompletadas.length === 0) return 0;

    let maxRacha = 1;
    let rachaActual = 1;
    for (let i = 1; i < fechasCompletadas.length; i++) {
      const esConsecutiva =
        this.diasEsperadosEntre(habito, fechasCompletadas[i - 1], fechasCompletadas[i]) === 1;
      rachaActual = esConsecutiva ? rachaActual + 1 : 1;
      maxRacha = Math.max(maxRacha, rachaActual);
    }
    return maxRacha;
  }

  // Racha actual: cuenta hacia atrás desde hoy, días "completado" consecutivos.
  // Un día "saltado" o sin marcar ROMPE la racha. Hoy sin marcar no la rompe todavía.
  private calcularRachaActual(habito: Habito): number {
    const hoy = fechaHoyIso();
    const fecha = new Date();
    let racha = 0;

    for (let i = 0; i < LIMITE_DIAS_RACHA; i++) {
      const fechaIso = fechaIsoLocal(fecha);
      if (this.habitoAplicaEnFecha(habito, fechaIso)) {
        const registro = this.registroDe(habito.id, fechaIso);
        const esHoySinMarcar = fechaIso === hoy && !registro;
        if (registro?.estado === 'completado') {
          racha++;
        } else if (!esHoySinMarcar) {
          break;
        }
      }
      fecha.setDate(fecha.getDate() - 1);
    }
    return racha;
  }

  // Cuenta cuántas "ocurrencias esperadas" del hábito hay entre dos fechas (excluye la inicial)
  private diasEsperadosEntre(habito: Habito, fechaIsoA: string, fechaIsoB: string): number {
    const cursor = fechaDesdeIso(fechaIsoA);
    const fin = fechaDesdeIso(fechaIsoB);
    let conteo = 0;
    cursor.setDate(cursor.getDate() + 1);
    while (cursor <= fin) {
      if (this.habitoAplicaEnFecha(habito, fechaIsoLocal(cursor))) conteo++;
      cursor.setDate(cursor.getDate() + 1);
    }
    return conteo;
  }

  // ============================================
  // ESCRITURA
  // ============================================
  // Marcar dos veces el mismo estado lo desmarca
  async marcarHabito(habitoId: string, nuevoEstado: EstadoRegistro): Promise<MensajeError> {
    const hoy = fechaHoyIso();
    const existente = this.registroDe(habitoId, hoy);
    const tabla = this.db.from(TABLAS_HABITOS.registros);

    const { error } = !existente
      ? await tabla.insert({ habito_id: habitoId, fecha: hoy, estado: nuevoEstado })
      : existente.estado === nuevoEstado
        ? await tabla.delete().eq('id', existente.id)
        : await tabla.update({ estado: nuevoEstado }).eq('id', existente.id);

    await this.cargarRegistros();
    return error?.message ?? null;
  }

  async guardarHabito(payload: HabitoPayload, id?: string): Promise<MensajeError> {
    const tabla = this.db.from(TABLAS_HABITOS.habitos);
    const { error } = id ? await tabla.update(payload).eq('id', id) : await tabla.insert(payload);
    if (error) return error.message;
    await this.cargarHabitos();
    return null;
  }

  // Borrado lógico: conserva el historial de cumplimiento
  async eliminarHabito(id: string): Promise<MensajeError> {
    const { error } = await this.db
      .from(TABLAS_HABITOS.habitos)
      .update({ activo: false })
      .eq('id', id);
    if (error) return error.message;
    await this.cargarHabitos();
    return null;
  }
}
