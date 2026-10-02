// Modelos del módulo Mis Hábitos

export type TabHabitos = 'hoy' | 'habitos' | 'calendario';

export type DiaSemana = 'dom' | 'lun' | 'mar' | 'mie' | 'jue' | 'vie' | 'sab';

export type PrioridadHabito = 'alta' | 'media' | 'baja';

export type EstadoRegistro = 'completado' | 'saltado';

export type EstadoHoy = EstadoRegistro | 'pendiente';

export type TipoFrecuencia = 'diario' | 'dias';

export interface Habito {
  id: string;
  nombre: string;
  categoria: string;
  // 'diario' o lista de días separados por coma, ej. "lun,mie,vie"
  frecuencia: string;
  hora_objetivo: string | null;
  prioridad: PrioridadHabito;
  activo: boolean;
  created_at: string;
}

export interface RegistroHabito {
  id: string;
  habito_id: string;
  fecha: string;
  estado: EstadoRegistro;
}

export type HabitoPayload = Pick<
  Habito,
  'nombre' | 'categoria' | 'frecuencia' | 'hora_objetivo' | 'prioridad'
>;

export interface ResumenHabitoHoy {
  habito: Habito;
  estado: EstadoHoy;
  racha: number;
  // Hora objetivo (🕒 07:00) o la categoría si no tiene hora
  detalle: string;
}

export interface CeldaCalendario {
  clave: string;
  dia: number | null; // null = celda de relleno antes del día 1
  estado: EstadoRegistro | null;
}
