-- ===========================================================================
--  MI DINERO · Multicuenta (cuentas + transacciones con origen/destino)
--  Ejecuta este bloque completo en el SQL Editor de Supabase
--  (https://supabase.com/dashboard -> tu proyecto -> SQL -> New query).
--
--  Qué hace:
--   1. Crea la tabla `cuentas` (débito, crédito, inversión, ahorro) con RLS.
--   2. Agrega a `movimientos` cuenta_origen_id / cuenta_destino_id /
--      categoria_id / subcategoria_id, renombra `nota` -> `descripcion` y
--      cambia `tipo` a 'GASTO' | 'INGRESO' | 'TRASLADO'.
--   3. Agrega `tipo` (GASTO / INGRESO) a `categorias_grandes`.
--   4. Liga gastos fijos y cortes de tarjeta a cuentas.
--   5. MIGRA LOS DATOS EXISTENTES de cada usuario:
--      - Crea las cuentas base (Cuenta Débito, Trii, Bolsillo de Ahorro) y una
--        cuenta de crédito por cada tarjeta registrada en Deudas (o "Tarjeta de
--        Crédito" si no tenía ninguna).
--      - Gastos pagados con tarjeta -> salen de la cuenta de esa tarjeta.
--      - Pagos de corte de tarjeta -> TRASLADO Cuenta Débito -> tarjeta.
--      - El resto de gastos salen de, y los ingresos entran a, Cuenta Débito.
--      - Asigna categoria_id / subcategoria_id según el nombre de la categoría.
--      - Ajusta el saldo inicial de cada tarjeta para que su deuda actual
--        coincida con la que tenía en Deudas, y archiva esas deudas.
--
--  Todo corre en una transacción: si algo falla, no se aplica nada.
--  Ejecútalo UNA vez, antes de usar la nueva versión de la app: volver a
--  correrlo después recalcularía la deuda de las tarjetas con los datos viejos.
--  Recomendado: exporta un respaldo desde la app (menú Respaldo) antes.
-- ===========================================================================

begin;

-- ---------------------------------------------------------------------------
-- 0. Verificación: las tablas deben tener la columna user_id que usa RLS
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array['movimientos', 'deudas', 'categorias_grandes', 'subcategorias',
                           'gastos_fijos', 'tarjeta_cortes'] loop
    if not exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = t and column_name = 'user_id'
    ) then
      raise exception 'La tabla public.% no tiene la columna user_id; revisa el script antes de continuar.', t;
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 1. Tabla de cuentas
--    El saldo actual NO se guarda: la app lo calcula como
--    saldo_inicial + ingresos/traslados que entran - gastos/traslados que salen.
--    Así editar o borrar una transacción nunca deja saldos desincronizados.
--    En cuentas de crédito el saldo es negativo cuando se debe dinero.
-- ---------------------------------------------------------------------------
create table if not exists public.cuentas (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null default auth.uid() references auth.users (id) on delete cascade,
  nombre           text not null check (length(trim(nombre)) > 0),
  tipo             text not null check (tipo in ('debito', 'credito', 'inversion', 'ahorro')),
  saldo_inicial    numeric not null default 0,
  color            smallint not null default 1 check (color between 1 and 8),
  dia_corte        smallint check (dia_corte between 1 and 31),
  dia_limite_pago  smallint check (dia_limite_pago between 1 and 31),
  orden            integer not null default 0,
  created_at       timestamptz not null default now(),
  unique (user_id, nombre)
);

comment on table public.cuentas is 'Cuentas de dinero del usuario (origen y destino de las transacciones).';

alter table public.cuentas enable row level security;

drop policy if exists "cuentas_select_propias" on public.cuentas;
create policy "cuentas_select_propias" on public.cuentas
  for select using (auth.uid() = user_id);

drop policy if exists "cuentas_insert_propias" on public.cuentas;
create policy "cuentas_insert_propias" on public.cuentas
  for insert with check (auth.uid() = user_id);

drop policy if exists "cuentas_update_propias" on public.cuentas;
create policy "cuentas_update_propias" on public.cuentas
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "cuentas_delete_propias" on public.cuentas;
create policy "cuentas_delete_propias" on public.cuentas
  for delete using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- 2. Categorías: ahora también hay categorías de ingreso
-- ---------------------------------------------------------------------------
alter table public.categorias_grandes add column if not exists tipo text not null default 'GASTO';
alter table public.categorias_grandes drop constraint if exists categorias_grandes_tipo_check;
alter table public.categorias_grandes
  add constraint categorias_grandes_tipo_check check (tipo in ('GASTO', 'INGRESO'));

-- ---------------------------------------------------------------------------
-- 3. Movimientos -> transacciones con cuenta de origen / destino
-- ---------------------------------------------------------------------------
alter table public.movimientos
  add column if not exists cuenta_origen_id  uuid references public.cuentas (id) on delete restrict,
  add column if not exists cuenta_destino_id uuid references public.cuentas (id) on delete restrict,
  add column if not exists categoria_id      uuid references public.categorias_grandes (id) on delete set null,
  add column if not exists subcategoria_id   uuid references public.subcategorias (id) on delete set null;

do $$
begin
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'movimientos' and column_name = 'nota')
     and not exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'movimientos' and column_name = 'descripcion') then
    alter table public.movimientos rename column nota to descripcion;
  end if;
end $$;

-- `categoria` (texto) queda como etiqueta para movimientos sin categoría
-- (ajustes de saldo, pagos de deudas) y `metodo_pago` deja de usarse.
alter table public.movimientos alter column categoria drop not null;
do $$
begin
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'movimientos' and column_name = 'metodo_pago') then
    alter table public.movimientos alter column metodo_pago drop not null;
  end if;
end $$;

-- Reemplaza cualquier restricción previa sobre `tipo` ('ingreso' / 'gasto')
do $$
declare
  r record;
begin
  for r in
    select conname from pg_constraint
    where conrelid = 'public.movimientos'::regclass and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%tipo%'
  loop
    execute format('alter table public.movimientos drop constraint %I', r.conname);
  end loop;
end $$;

update public.movimientos set tipo = upper(tipo) where tipo in ('ingreso', 'gasto');

alter table public.movimientos
  add constraint movimientos_tipo_check check (tipo in ('GASTO', 'INGRESO', 'TRASLADO'));

create index if not exists movimientos_cuenta_origen_idx  on public.movimientos (cuenta_origen_id);
create index if not exists movimientos_cuenta_destino_idx on public.movimientos (cuenta_destino_id);

-- ---------------------------------------------------------------------------
-- 4. Gastos fijos y cortes de tarjeta ligados a cuentas
-- ---------------------------------------------------------------------------
alter table public.gastos_fijos
  add column if not exists cuenta_id       uuid references public.cuentas (id) on delete set null,
  add column if not exists categoria_id    uuid references public.categorias_grandes (id) on delete set null,
  add column if not exists subcategoria_id uuid references public.subcategorias (id) on delete set null;
alter table public.gastos_fijos alter column categoria drop not null;

alter table public.tarjeta_cortes
  add column if not exists cuenta_id uuid references public.cuentas (id) on delete cascade;
alter table public.tarjeta_cortes alter column deuda_id drop not null;
create unique index if not exists tarjeta_cortes_cuenta_mes_idx on public.tarjeta_cortes (cuenta_id, mes);

-- ===========================================================================
-- 5. MIGRACIÓN DE DATOS
-- ===========================================================================
create temp table usuarios_dinero on commit drop as
  select distinct user_id from (
    select user_id from public.movimientos
    union select user_id from public.deudas
    union select user_id from public.categorias_grandes
    union select user_id from public.gastos_fijos
  ) u
  where user_id is not null;

-- 5a. Cuentas base (la de crédito se crea en 5b)
insert into public.cuentas (user_id, nombre, tipo, color, orden)
select u.user_id, b.nombre, b.tipo, b.color, b.orden
from usuarios_dinero u
cross join (values
  ('Cuenta Débito',      'debito',    1, 1),
  ('Trii',               'inversion', 7, 3),
  ('Bolsillo de Ahorro', 'ahorro',    3, 4)
) as b (nombre, tipo, color, orden)
on conflict (user_id, nombre) do nothing;

-- 5b. Una cuenta de crédito por cada tarjeta de Deudas (activa o con movimientos)
create temp table tarjetas_a_migrar on commit drop as
  select d.*
  from public.deudas d
  where d.tipo = 'tarjeta_credito'
    and (d.activa or exists (
      select 1 from public.movimientos m
      where m.user_id = d.user_id and m.metodo_pago = 'credito:' || d.id::text
    ));

insert into public.cuentas (user_id, nombre, tipo, color, orden, dia_corte, dia_limite_pago)
select t.user_id, t.nombre, 'credito', 8, 2, t.dia_corte, t.dia_limite_pago
from tarjetas_a_migrar t
on conflict (user_id, nombre) do nothing;

create temp table mapa_tarjetas on commit drop as
  select t.id as deuda_id, c.id as cuenta_id
  from tarjetas_a_migrar t
  join public.cuentas c on c.user_id = t.user_id and c.nombre = t.nombre and c.tipo = 'credito';

-- Quien no tenía tarjetas recibe la cuenta base "Tarjeta de Crédito"
insert into public.cuentas (user_id, nombre, tipo, color, orden)
select u.user_id, 'Tarjeta de Crédito', 'credito', 8, 2
from usuarios_dinero u
where not exists (select 1 from public.cuentas c where c.user_id = u.user_id and c.tipo = 'credito')
on conflict (user_id, nombre) do nothing;

-- 5c. Pagos de corte de tarjeta -> TRASLADO Cuenta Débito -> tarjeta
update public.movimientos m
set tipo = 'TRASLADO',
    cuenta_origen_id = deb.id,
    cuenta_destino_id = mt.cuenta_id,
    categoria = 'Pago de tarjeta'
from public.tarjeta_cortes tc
join mapa_tarjetas mt on mt.deuda_id = tc.deuda_id
join public.cuentas deb on deb.user_id = tc.user_id and deb.nombre = 'Cuenta Débito'
where tc.movimiento_id = m.id
  and m.cuenta_origen_id is null and m.cuenta_destino_id is null;

-- 5d. Gastos pagados con tarjeta -> salen de la cuenta de esa tarjeta
update public.movimientos m
set cuenta_origen_id = mt.cuenta_id
from mapa_tarjetas mt
where m.tipo = 'GASTO'
  and m.cuenta_origen_id is null
  and m.metodo_pago = 'credito:' || mt.deuda_id::text;

-- 5e. El resto: gastos salen de, e ingresos entran a, Cuenta Débito
update public.movimientos m
set cuenta_origen_id = deb.id
from public.cuentas deb
where m.tipo = 'GASTO' and m.cuenta_origen_id is null
  and deb.user_id = m.user_id and deb.nombre = 'Cuenta Débito';

update public.movimientos m
set cuenta_destino_id = deb.id
from public.cuentas deb
where m.tipo = 'INGRESO' and m.cuenta_destino_id is null
  and deb.user_id = m.user_id and deb.nombre = 'Cuenta Débito';

-- 5f. Categorías de ingreso: las predeterminadas + las que ya se usaban como texto
insert into public.categorias_grandes (user_id, nombre, porcentaje, orden, tipo)
select x.user_id, x.nombre, 0, 1000 + row_number() over (partition by x.user_id order by x.nombre), 'INGRESO'
from (
  select u.user_id, d.nombre
  from usuarios_dinero u
  cross join (values ('Salario'), ('Venta'), ('Regalo'), ('Otro ingreso')) as d (nombre)
  union
  select m.user_id, m.categoria
  from public.movimientos m
  where m.tipo = 'INGRESO' and m.categoria is not null and m.categoria <> 'Ajuste de saldo'
) x
where not exists (
  select 1 from public.categorias_grandes c
  where c.user_id = x.user_id and lower(c.nombre) = lower(x.nombre) and c.tipo = 'INGRESO'
);

-- 5g. categoria_id / subcategoria_id a partir del nombre guardado como texto
update public.movimientos m
set subcategoria_id = s.id, categoria_id = s.categoria_grande_id
from public.subcategorias s
where m.tipo = 'GASTO' and m.categoria_id is null
  and s.user_id = m.user_id and lower(s.nombre) = lower(m.categoria);

update public.movimientos m
set categoria_id = c.id
from public.categorias_grandes c
where m.categoria_id is null and m.tipo in ('GASTO', 'INGRESO')
  and c.user_id = m.user_id and c.tipo = m.tipo and lower(c.nombre) = lower(m.categoria);

-- Si ya tiene categoría, el texto sobra (solo se conserva como etiqueta cuando no la hay)
update public.movimientos set categoria = null where categoria_id is not null;

update public.gastos_fijos g
set subcategoria_id = s.id, categoria_id = s.categoria_grande_id
from public.subcategorias s
where g.categoria_id is null and s.user_id = g.user_id and lower(s.nombre) = lower(g.categoria);

update public.gastos_fijos g
set categoria_id = c.id
from public.categorias_grandes c
where g.categoria_id is null and c.user_id = g.user_id and c.tipo = 'GASTO'
  and lower(c.nombre) = lower(g.categoria);

update public.gastos_fijos g
set cuenta_id = deb.id
from public.cuentas deb
where g.cuenta_id is null and deb.user_id = g.user_id and deb.nombre = 'Cuenta Débito';

-- 5h. Saldo inicial de cada tarjeta: que su deuda calculada sea igual a la que
--     tenía registrada en Deudas (saldo negativo = dinero que se debe)
update public.cuentas c
set saldo_inicial = - x.saldo_tarjeta - coalesce((
  select sum(case when m.cuenta_destino_id = c.id then m.monto else 0 end)
       - sum(case when m.cuenta_origen_id  = c.id then m.monto else 0 end)
  from public.movimientos m
  where m.cuenta_origen_id = c.id or m.cuenta_destino_id = c.id
), 0)
from (
  select mt.cuenta_id, sum(d.saldo_tarjeta) as saldo_tarjeta
  from mapa_tarjetas mt
  join public.deudas d on d.id = mt.deuda_id
  group by mt.cuenta_id
) x
where x.cuenta_id = c.id;

-- 5i. Cortes de tarjeta -> su cuenta; las tarjetas salen de Deudas (se archivan)
update public.tarjeta_cortes tc
set cuenta_id = mt.cuenta_id
from mapa_tarjetas mt
where tc.deuda_id = mt.deuda_id and tc.cuenta_id is null;

update public.deudas d
set activa = false
from mapa_tarjetas mt
where d.id = mt.deuda_id;

-- ---------------------------------------------------------------------------
-- 6. Coherencia de cuentas según el tipo (se valida después de migrar)
-- ---------------------------------------------------------------------------
alter table public.movimientos drop constraint if exists movimientos_cuentas_check;
alter table public.movimientos add constraint movimientos_cuentas_check check (
     (tipo = 'GASTO'    and cuenta_origen_id is not null and cuenta_destino_id is null)
  or (tipo = 'INGRESO'  and cuenta_destino_id is not null and cuenta_origen_id is null)
  or (tipo = 'TRASLADO' and cuenta_origen_id is not null and cuenta_destino_id is not null
                        and cuenta_origen_id <> cuenta_destino_id)
);

commit;
