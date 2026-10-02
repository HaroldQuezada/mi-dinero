-- ===========================================================================
--  MI DINERO · Tabla de perfiles + trigger + RLS
--  Ejecuta este bloque en el SQL Editor del dashboard de Supabase
--  (https://supabase.com/dashboard -> tu proyecto -> SQL -> New query).
-- ===========================================================================

create table if not exists public.perfiles (
  id                   uuid primary key references auth.users (id) on delete cascade,
  nombres              text,
  apellidos            text,
  telefono             text,
  fecha_nacimiento     date,
  ciudad               text,
  moneda_preferida     text default 'COP',
  objetivo_principal   text,
  created_at           timestamptz default now()
);

comment on table public.perfiles is 'Datos del perfil de usuario (registro ampliado).';

-- Row Level Security: cada usuario solo ve/edita su propio perfil.
alter table public.perfiles enable row level security;

drop policy if exists "perfil_select_propio" on public.perfiles;
create policy "perfil_select_propio"
  on public.perfiles for select
  using (auth.uid() = id);

drop policy if exists "perfil_insert_propio" on public.perfiles;
create policy "perfil_insert_propio"
  on public.perfiles for insert
  with check (auth.uid() = id);

drop policy if exists "perfil_update_propio" on public.perfiles;
create policy "perfil_update_propio"
  on public.perfiles for update
  using (auth.uid() = id);

-- ---------------------------------------------------------------------------
--  Trigger: al registrarse (auth.users), copia los metadatos del registro
--  hacia la tabla perfiles. El AuthService envía estos datos en signUp(options.data).
-- ---------------------------------------------------------------------------
create or replace function public.crear_perfil_tras_signup()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.perfiles (
    id,
    nombres,
    apellidos,
    telefono,
    fecha_nacimiento,
    ciudad,
    moneda_preferida,
    objetivo_principal
  ) values (
    new.id,
    nullif(new.raw_user_meta_data ->> 'nombres', ''),
    nullif(new.raw_user_meta_data ->> 'apellidos', ''),
    nullif(new.raw_user_meta_data ->> 'telefono', ''),
    nullif(new.raw_user_meta_data ->> 'fecha_nacimiento', '')::date,
    nullif(new.raw_user_meta_data ->> 'ciudad', ''),
    coalesce(nullif(new.raw_user_meta_data ->> 'moneda_preferida', ''), 'COP'),
    nullif(new.raw_user_meta_data ->> 'objetivo_principal', '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists trg_crear_perfil on auth.users;
create trigger trg_crear_perfil
  after insert on auth.users
  for each row execute function public.crear_perfil_tras_signup();


-- ===========================================================================
--  BORRAR TODOS LOS USUARIOS (solo para validar el registro desde cero)
--  ⚠️  ELIMINA TODOS los auth.users y, por ON DELETE CASCADE, sus perfiles.
--      Ejecuta SOLO cuando quieras limpiar la base para probar la creación.
-- ===========================================================================
-- delete from auth.users;
