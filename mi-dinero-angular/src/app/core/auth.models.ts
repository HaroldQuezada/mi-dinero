// Modelos del dominio de autenticación

export const MONEDAS = ['COP', 'USD', 'EUR', 'MXN', 'ARS', 'CLP', 'PEN'] as const;

export type Moneda = (typeof MONEDAS)[number];

export const MONEDA_POR_DEFECTO: Moneda = 'COP';

export type ModoAuth = 'login' | 'registro';

// Datos extra del usuario que se guardan en el metadata de Supabase
export interface PerfilRegistro {
  nombres: string;
  apellidos: string;
  telefono: string;
  fecha_nacimiento: string | null;
  ciudad: string | null;
  moneda_preferida: Moneda;
  objetivo_principal: string | null;
}
