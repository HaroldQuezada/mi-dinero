// Constantes del módulo Mis Hábitos

import { OpcionSelect, OpcionToggle, TabItem } from '../../shared/models/ui.models';
import { DiaSemana, PrioridadHabito, TabHabitos, TipoFrecuencia } from './habitos.models';

export const TABLAS_HABITOS = {
  habitos: 'habitos',
  registros: 'habitos_registros',
} as const;

export const TABS_HABITOS: readonly TabItem<TabHabitos>[] = [
  { id: 'hoy', etiqueta: 'Hoy' },
  { id: 'habitos', etiqueta: 'Hábitos' },
  { id: 'calendario', etiqueta: 'Calendario' },
];

// Índice = Date.getDay() (0 = domingo)
export const DIAS_SEMANA: readonly DiaSemana[] = ['dom', 'lun', 'mar', 'mie', 'jue', 'vie', 'sab'];

export const DIAS_SEMANA_LABEL: Readonly<Record<DiaSemana, string>> = {
  dom: 'Dom',
  lun: 'Lun',
  mar: 'Mar',
  mie: 'Mié',
  jue: 'Jue',
  vie: 'Vie',
  sab: 'Sáb',
};

export const FRECUENCIA_DIARIA = 'diario';

export const TIPOS_FRECUENCIA: readonly OpcionToggle<TipoFrecuencia>[] = [
  { valor: 'diario', etiqueta: 'Diario' },
  { valor: 'dias', etiqueta: 'Días específicos' },
];

export const CATEGORIAS_HABITO: readonly string[] = [
  'Salud',
  'Estudio',
  'Trabajo',
  'Personal',
  'Hogar',
  'Otro',
];

export const CATEGORIA_HABITO_POR_DEFECTO = 'Salud';

export const PRIORIDADES_HABITO: readonly OpcionSelect<PrioridadHabito>[] = [
  { valor: 'alta', etiqueta: 'Alta' },
  { valor: 'media', etiqueta: 'Media' },
  { valor: 'baja', etiqueta: 'Baja' },
];

export const PRIORIDAD_POR_DEFECTO: PrioridadHabito = 'media';

// Tope de días hacia atrás al calcular la racha actual (~10 años)
export const LIMITE_DIAS_RACHA = 3650;

// "07:00:00" -> "07:00"
export const LONGITUD_HORA_CORTA = 5;
