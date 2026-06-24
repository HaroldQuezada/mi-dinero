-- ============================================
-- ESQUEMA: Módulo de Hábitos
-- Pega esto en Supabase → SQL Editor → New Query → Run
-- (Usa el MISMO proyecto de Supabase que ya tienes para Dinero)
-- ============================================

-- 1. HÁBITOS (definición de cada hábito)
create table habitos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null default auth.uid(),
  nombre text not null,
  categoria text not null,
  frecuencia text not null default 'diario', -- 'diario' o lista de días: 'lun,mie,vie'
  hora_objetivo time,
  prioridad text not null default 'media' check (prioridad in ('alta', 'media', 'baja')),
  activo boolean not null default true,
  created_at timestamptz default now()
);

-- 2. REGISTROS (un registro por hábito por día)
create table habitos_registros (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null default auth.uid(),
  habito_id uuid references habitos(id) on delete cascade not null,
  fecha date not null default current_date,
  estado text not null check (estado in ('completado', 'saltado')),
  created_at timestamptz default now(),
  unique (habito_id, fecha)
);

-- ============================================
-- SEGURIDAD: Row Level Security (RLS)
-- ============================================

alter table habitos enable row level security;
alter table habitos_registros enable row level security;

create policy "usuarios ven sus propios habitos"
  on habitos for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "usuarios ven sus propios registros de habitos"
  on habitos_registros for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
