-- Dungeon & Stone — esquema inicial (Fase 1)
-- Aplicar en el SQL Editor del proyecto Supabase, o vía `supabase db push`
-- si usas la CLI de Supabase con este repo.

create extension if not exists citext;

-- ============================================================
-- PROFILES — espejo público de auth.users + rol de juego
-- ============================================================
create table public.profiles (
  id                     uuid primary key references auth.users(id) on delete cascade,
  username               citext not null unique,
  username_set           boolean not null default false, -- false = nombre autogenerado, aún no elegido por el jugador
  role                   text not null default 'player' check (role in ('player','admin')),
  is_banned              boolean not null default false,
  hidden_from_leaderboard boolean not null default false, -- para cuentas de prueba/admin que no deben salir en el ranking público
  created_at             timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- SECURITY DEFINER: se ejecuta como el dueño de la función (que sí puede leer
-- profiles sin pasar por RLS), evitando que las políticas de abajo se llamen a
-- sí mismas al comprobar el rol (una subconsulta directa a `profiles` dentro de
-- su propia policy causa "infinite recursion detected in policy").
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;
grant execute on function public.is_admin() to anon, authenticated;

create policy "profiles: self select"
  on public.profiles for select
  using (auth.uid() = id);

create policy "profiles: admins select all"
  on public.profiles for select
  using (public.is_admin());

create policy "profiles: self update"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

create policy "profiles: admins update all"
  on public.profiles for update
  using (public.is_admin());

-- Un usuario normal puede hacer UPDATE de su propia fila (la policy de arriba lo permite),
-- pero este trigger le impide tocar sus propios campos de privilegio; solo un admin puede.
create or replace function public.protect_profile_privileges()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  acting_role text;
begin
  -- auth.uid() es NULL cuando la escritura viene del SQL Editor, la CLI o el
  -- service role (conexiones ya de por sí fuera de RLS) — en ese caso confiamos
  -- en la conexión y no revertimos nada. Solo protegemos el camino normal de la
  -- app, donde auth.uid() sí identifica a un usuario autenticado concreto.
  if auth.uid() is not null then
    select role into acting_role from public.profiles where id = auth.uid();
    if acting_role is distinct from 'admin' then
      new.role := old.role;
      new.is_banned := old.is_banned;
      new.hidden_from_leaderboard := old.hidden_from_leaderboard;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_protect_profile_privileges on public.profiles;
create trigger trg_protect_profile_privileges
  before update on public.profiles
  for each row execute procedure public.protect_profile_privileges();

-- Crea automáticamente la fila de perfil cuando alguien se registra (email+contraseña o Google).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, username, username_set)
  values (new.id, 'jugador_' || substr(new.id::text, 1, 8), false);
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Comprobación de disponibilidad de username (para feedback instantáneo en el formulario).
create or replace function public.username_available(p_username text)
returns boolean
language sql
security definer
set search_path = public
as $$
  select not exists (select 1 from public.profiles where username = p_username::citext);
$$;
grant execute on function public.username_available(text) to anon, authenticated;

-- Único punto de escritura del username: valida formato y unicidad server-side.
create or replace function public.set_username(p_username text)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.profiles;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  if p_username is null or length(trim(p_username)) < 3 or length(trim(p_username)) > 20 then
    raise exception 'El nombre de usuario debe tener entre 3 y 20 caracteres.';
  end if;
  if p_username !~ '^[A-Za-z0-9_]+$' then
    raise exception 'El nombre de usuario solo puede tener letras, números y guion bajo.';
  end if;
  update public.profiles
  set username = p_username, username_set = true
  where id = auth.uid()
  returning * into v_row;
  return v_row;
end;
$$;
grant execute on function public.set_username(text) to authenticated;

-- ============================================================
-- CHARACTERS — 1 personaje por cuenta
-- ============================================================
create table public.characters (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null unique references public.profiles(id) on delete cascade,
  race                text not null check (race in ('barbaro','enano','hada','humano','draconido','bestia')),
  style               text not null check (style in ('pesada','doblefilo','tirador','canalizador')),
  level               int  not null default 1  check (level between 1 and 60),
  xp                  int  not null default 0  check (xp >= 0),
  gold                int  not null default 20 check (gold >= 0),
  cur_hp              int,
  cur_sta             int,
  cur_spi             int,
  equip               jsonb not null default '{"arma":null,"arma2":null,"armadura":null,"amuleto":null,"casco":null,"botas":null,"guantes":null}'::jsonb,
  inventory           jsonb not null default '[]'::jsonb,
  item_counter        int  not null default 0,
  max_level_unlocked  int  not null default 1  check (max_level_unlocked between 1 and 10),
  record_level        int  not null default 1  check (record_level between 1 and 10),
  record_floor_idx    int  not null default 0  check (record_floor_idx >= 0),
  stash               jsonb not null default '{"gold":0,"items":[]}'::jsonb,
  soul_slots          jsonb not null default '[]'::jsonb,
  dungeon             jsonb,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

alter table public.characters enable row level security;

create policy "characters: own select"
  on public.characters for select
  using (auth.uid() = user_id);

create policy "characters: own update"
  on public.characters for update
  using (
    auth.uid() = user_id
    and not exists (select 1 from public.profiles pr where pr.id = auth.uid() and pr.is_banned)
  )
  with check (auth.uid() = user_id);

create policy "characters: own delete"
  on public.characters for delete
  using (auth.uid() = user_id);

create policy "characters: admins manage all"
  on public.characters for all
  using (public.is_admin())
  with check (public.is_admin());

-- Nota: no hay policy de INSERT para 'authenticated'. La única forma de crear un
-- personaje es la función create_character() de abajo (SECURITY DEFINER), que
-- fuerza valores iniciales seguros sin importar qué mande el cliente.
create or replace function public.create_character(p_race text, p_style text)
returns public.characters
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.characters;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  if p_race not in ('barbaro','enano','hada','humano','draconido','bestia') then
    raise exception 'raza inválida';
  end if;
  if p_style not in ('pesada','doblefilo','tirador','canalizador') then
    raise exception 'senda inválida';
  end if;
  if exists (select 1 from public.characters where user_id = auth.uid()) then
    raise exception 'ya tienes un personaje';
  end if;

  insert into public.characters (user_id, race, style, level, xp, gold)
  values (auth.uid(), p_race, p_style, 1, 0, 20)
  returning * into v_row;

  return v_row;
end;
$$;
grant execute on function public.create_character(text, text) to authenticated;

-- Defensa en profundidad: RLS controla QUIÉN escribe, este trigger controla QUÉ
-- valores son aceptables en cada guardado, para que nadie pueda mandarse oro o
-- nivel arbitrarios desde la consola del navegador. Los topes son deliberadamente
-- generosos (muy por encima de lo que un guardado legítimo produce) y ajustables.
create or replace function public.validate_character_update()
returns trigger
language plpgsql
as $$
begin
  if new.user_id <> old.user_id then
    raise exception 'user_id es inmutable';
  end if;
  if new.race <> old.race or new.style <> old.style then
    raise exception 'raza y senda son inmutables tras la creación';
  end if;
  if new.level < old.level then
    raise exception 'el nivel no puede bajar';
  end if;
  if new.level - old.level > 5 then
    raise exception 'salto de nivel implausible en un solo guardado';
  end if;
  if new.gold - old.gold > 3000 then
    raise exception 'incremento de oro implausible en un solo guardado';
  end if;
  if new.max_level_unlocked < old.max_level_unlocked then
    raise exception 'max_level_unlocked no puede bajar';
  end if;
  if new.record_level > new.max_level_unlocked then
    raise exception 'record_level no puede superar max_level_unlocked';
  end if;
  if new.record_level < old.record_level
     or (new.record_level = old.record_level and new.record_floor_idx < old.record_floor_idx) then
    raise exception 'el récord no puede retroceder';
  end if;
  if jsonb_typeof(new.inventory) <> 'array' or jsonb_array_length(new.inventory) > 250 then
    raise exception 'inventory inválido o demasiado grande';
  end if;
  if jsonb_typeof(new.soul_slots) <> 'array' or jsonb_array_length(new.soul_slots) > 6 then
    raise exception 'soul_slots inválido o demasiado grande';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_validate_character_update on public.characters;
create trigger trg_validate_character_update
  before update on public.characters
  for each row execute procedure public.validate_character_update();

-- ============================================================
-- RANKING GLOBAL — vista pública de solo lectura (top 10)
-- Se actualiza sola: es una vista, no una tabla desnormalizada.
-- Propiedad del rol que ejecuta esta migración (normalmente postgres), que
-- ignora RLS, así puede exponer username+récord sin dar acceso a profiles/characters
-- completos.
-- ============================================================
create view public.leaderboard_top10 as
select p.username, c.record_level, c.record_floor_idx, c.updated_at
from public.characters c
join public.profiles p on p.id = c.user_id
where not p.is_banned and not p.hidden_from_leaderboard
order by c.record_level desc, c.record_floor_idx desc, c.updated_at asc
limit 10;

grant select on public.leaderboard_top10 to anon, authenticated;
