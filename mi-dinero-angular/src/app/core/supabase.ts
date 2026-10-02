// Configuración de conexión a Supabase
// Estas credenciales son públicas por diseño (clave "anon/publishable"),
// la seguridad real la da Row Level Security (RLS) configurado en la base de datos.

import { InjectionToken } from '@angular/core';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://hwajkmsugpksmrbpggsb.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_lvaaj5Ov9MQVXOUTntdiOQ_0rVp5dy2';

// Cliente único inyectable: los servicios lo obtienen con inject(SUPABASE_CLIENT)
export const SUPABASE_CLIENT = new InjectionToken<SupabaseClient>('SUPABASE_CLIENT', {
  providedIn: 'root',
  factory: (): SupabaseClient => createClient(SUPABASE_URL, SUPABASE_ANON_KEY),
});
