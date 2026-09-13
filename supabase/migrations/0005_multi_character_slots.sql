-- Migración: hasta 6 personajes por cuenta, cada uno con su propio nombre,
-- y el rol de admin pasa de la cuenta al personaje (solo el personaje oculto
-- del ranking conserva el rol admin; los demás quedan como jugadores normales).
-- Ejecutar en el SQL Editor de un proyecto que ya corrió 0001-0004.

-- 1) Columnas nuevas en characters (nullable primero, para poder rellenarlas).
alter table public.characters add column if not exists slot_number int;
alter table public.characters add column if not exists nickname citext;
alter table public.characters add column if not exists role text not null default 'player';
alter table public.characters add column if not exists hidden_from_leaderboard boolean not null default false;

-- 2) Rellena desde los datos actuales: hoy hay como máximo 1 personaje por
-- cuenta, así que cada uno pasa a ser su propio "slot 1" con el nombre que
-- ya tenía la cuenta, y hereda el rol/visibilidad que ya tenía la cuenta.
update public.characters c set slot_number = 1 where c.slot_number is null;

update public.characters c
set nickname = p.username
from public.profiles p
where p.id = c.user_id and c.nickname is null;

update public.characters c
set hidden_from_leaderboard = p.hidden_from_leaderboard
from public.profiles p
where p.id = c.user_id;

update public.characters c
set role = p.role
from public.profiles p
where p.id = c.user_id;

-- 3) Ahora sí, restricciones estrictas.
alter table public.characters alter column slot_number set not null;
alter table public.characters alter column nickname set not null;
alter table public.characters add constraint characters_slot_range check (slot_number between 1 and 6);
alter table public.characters add constraint characters_role_check check (role in ('player','admin'));
alter table public.characters add constraint characters_nickname_key unique (nickname);
alter table public.characters add constraint characters_user_slot_key unique (user_id, slot_number);
alter table public.characters drop constraint if exists characters_user_id_key;

-- 4) is_admin() ahora mira el personaje, no la cuenta.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.characters where user_id = auth.uid() and role = 'admin');
$$;

-- 5) protect_profile_privileges() ya no protege role/hidden_from_leaderboard
-- (se mudaron de tabla); solo sigue protegiendo is_banned.
create or replace function public.protect_profile_privileges()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null and not public.is_admin() then
    new.is_banned := old.is_banned;
  end if;
  return new;
end;
$$;

-- 6) validate_character_update(): agrega inmutabilidad de nickname/slot_number
-- y protección de role/hidden_from_leaderboard (antes vivía en el trigger de profiles).
create or replace function public.validate_character_update()
returns trigger
language plpgsql
as $$
begin
  if new.user_id <> old.user_id then
    raise exception 'user_id es inmutable';
  end if;
  if new.slot_number <> old.slot_number then
    raise exception 'slot_number es inmutable';
  end if;
  if new.nickname <> old.nickname then
    raise exception 'el nombre del personaje es inmutable';
  end if;
  if new.race <> old.race or new.style <> old.style then
    raise exception 'raza y senda son inmutables tras la creación';
  end if;
  if auth.uid() is not null and not public.is_admin() then
    new.role := old.role;
    new.hidden_from_leaderboard := old.hidden_from_leaderboard;
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

-- 7) Ranking: ahora muestra el nombre del personaje, no el de la cuenta.
drop view if exists public.leaderboard_top10;
create view public.leaderboard_top10 as
select c.nickname, c.record_level, c.record_floor_idx, c.updated_at
from public.characters c
join public.profiles p on p.id = c.user_id
where not p.is_banned and not c.hidden_from_leaderboard
order by c.record_level desc, c.record_floor_idx desc, c.updated_at asc
limit 10;
grant select on public.leaderboard_top10 to anon, authenticated;

-- 8) create_character ahora pide un nombre de personaje y asigna el slot solo.
drop function if exists public.create_character(text, text);
create or replace function public.create_character(p_race text, p_style text, p_nickname text)
returns public.characters
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.characters;
  v_slot int;
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
  if p_nickname is null or length(trim(p_nickname)) < 3 or length(trim(p_nickname)) > 20 then
    raise exception 'El nombre del personaje debe tener entre 3 y 20 caracteres.';
  end if;
  if p_nickname !~ '^[A-Za-z0-9_]+$' then
    raise exception 'El nombre del personaje solo puede tener letras, números y guion bajo.';
  end if;

  select min(s) into v_slot
  from generate_series(1,6) s
  where s not in (select slot_number from public.characters where user_id = auth.uid());

  if v_slot is null then
    raise exception 'Ya tienes el máximo de 6 personajes.';
  end if;

  insert into public.characters (user_id, slot_number, nickname, race, style, level, xp, gold)
  values (auth.uid(), v_slot, p_nickname, p_race, p_style, 1, 0, 20)
  returning * into v_row;

  return v_row;
end;
$$;
grant execute on function public.create_character(text, text, text) to authenticated;

create or replace function public.character_nickname_available(p_nickname text)
returns boolean
language sql
security definer
set search_path = public
as $$
  select not exists (select 1 from public.characters where nickname = p_nickname::citext);
$$;
grant execute on function public.character_nickname_available(text) to authenticated;

-- 9) Ya no hace falta en profiles: el rol y la visibilidad en el ranking
-- ahora viven en characters.
alter table public.profiles drop column if exists role;
alter table public.profiles drop column if exists hidden_from_leaderboard;
