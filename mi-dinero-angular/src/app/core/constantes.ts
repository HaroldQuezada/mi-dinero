// Constantes globales de la aplicación

export const NOMBRE_APP = 'Mi Vida';

export const LOCALE = 'es-CO';

export const RUTAS = {
  inicio: '/',
  auth: '/auth',
  dinero: '/dinero',
  habitos: '/habitos',
} as const;

// Debe coincidir con el script inline de src/index.html que aplica el tema antes de arrancar
export const PREFIJO_ALMACENAMIENTO = 'mi-vida:';

export const CLAVES_ALMACENAMIENTO = {
  tema: 'tema',
  preferenciasDinero: 'dinero:preferencias',
  cacheDinero: (usuarioId: string): string => `dinero:cache:${usuarioId}`,
} as const;

export const ATRIBUTO_TEMA = 'tema';

// Duración de la transición de colores al cambiar de tema (ms)
export const DURACION_TRANSICION_TEMA = 350;
