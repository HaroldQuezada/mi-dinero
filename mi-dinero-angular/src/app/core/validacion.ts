// Utilidades de validación para login y registro.
// Centralizadas para reutilizarse en el feature de autenticación.

export type NivelPassword = 'muy-debil' | 'debil' | 'media' | 'fuerte' | 'muy-fuerte';

export interface EvaluacionPassword {
  puntuacion: number; // 0 - 100
  nivel: NivelPassword;
  etiqueta: string;
  recomendaciones: string[]; // lo que FALTA por cumplir
  cumpleRequisitos: boolean; // longitud + mayúscula + minúscula + número + símbolo
}

interface ReglaPassword {
  readonly cumple: (password: string) => boolean;
  readonly recomendacion: string;
  readonly puntos: number;
}

interface UmbralNivel {
  readonly minimo: number;
  readonly nivel: NivelPassword;
  readonly etiqueta: string;
}

export const LONGITUD_MINIMA_LOGIN = 6;
const LONGITUD_MINIMA_PASSWORD = 8;
const LONGITUD_RECOMENDADA_PASSWORD = 12;
const PUNTOS_LONGITUD_RECOMENDADA = 10;
const PENALIZACION_REPETICION = 10;
const PUNTUACION_MAXIMA = 100;

const REGLAS_PASSWORD: readonly ReglaPassword[] = [
  {
    cumple: (pw) => pw.length >= LONGITUD_MINIMA_PASSWORD,
    recomendacion: `Usa al menos ${LONGITUD_MINIMA_PASSWORD} caracteres`,
    puntos: 20,
  },
  { cumple: (pw) => /[a-z]/.test(pw), recomendacion: 'Incluye al menos una minúscula (a-z)', puntos: 15 },
  { cumple: (pw) => /[A-Z]/.test(pw), recomendacion: 'Incluye al menos una mayúscula (A-Z)', puntos: 15 },
  { cumple: (pw) => /[0-9]/.test(pw), recomendacion: 'Incluye al menos un número (0-9)', puntos: 20 },
  {
    cumple: (pw) => /[^A-Za-z0-9]/.test(pw),
    recomendacion: 'Incluye al menos un símbolo (!@#$%^&*)',
    puntos: 20,
  },
];

// Ordenados de mayor a menor: se toma el primero cuyo mínimo se alcance
const NIVELES_PASSWORD: readonly UmbralNivel[] = [
  { minimo: 80, nivel: 'muy-fuerte', etiqueta: 'Muy fuerte' },
  { minimo: 60, nivel: 'fuerte', etiqueta: 'Fuerte' },
  { minimo: 40, nivel: 'media', etiqueta: 'Media' },
  { minimo: 20, nivel: 'debil', etiqueta: 'Débil' },
  { minimo: 0, nivel: 'muy-debil', etiqueta: 'Muy débil' },
];

export function evaluarPassword(password: string): EvaluacionPassword {
  const cumplidas = REGLAS_PASSWORD.filter((regla) => regla.cumple(password));
  const incumplidas = REGLAS_PASSWORD.filter((regla) => !regla.cumple(password));

  let puntos = cumplidas.reduce((acc, regla) => acc + regla.puntos, 0);
  if (password.length >= LONGITUD_RECOMENDADA_PASSWORD) puntos += PUNTOS_LONGITUD_RECOMENDADA;
  if (/(.)\1\1/.test(password)) puntos -= PENALIZACION_REPETICION; // penaliza repetición excesiva
  puntos = Math.max(0, Math.min(PUNTUACION_MAXIMA, puntos));

  const umbral =
    NIVELES_PASSWORD.find((n) => puntos >= n.minimo) ?? NIVELES_PASSWORD[NIVELES_PASSWORD.length - 1];

  return {
    puntuacion: puntos,
    nivel: umbral.nivel,
    etiqueta: umbral.etiqueta,
    recomendaciones: incumplidas.map((regla) => regla.recomendacion),
    cumpleRequisitos: incumplidas.length === 0,
  };
}

const REGEX_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function emailValido(email: string): boolean {
  return REGEX_EMAIL.test(email.trim());
}

// Teléfono: 7 a 15 dígitos, admite + y espacios/guiones.
export function telefonoValido(telefono: string): boolean {
  const limpio = telefono.replace(/[\s-]/g, '');
  return /^\+?\d{7,15}$/.test(limpio);
}
