-- Títulos altos (2026-10-04): pisos 60, 80 y 100.
--   5 = El que sobrevivió a la tormenta (jefe del 60)
--   6 = Inmune al caos                  (jefe del 80)
--   7 = Retornado del laberinto         (jefe del 100)
--   8 = El primer retornado             (solo el PRIMER personaje que vence al del 100)
--
-- bosses_beaten: jefes de década vencidos (0-10). Hasta ahora se deducía de
-- checkpoint_level/record_level, pero ambos topan en el último nivel
-- implementado, así que vencer al último jefe no dejaba rastro.
-- first_retornado: lo concede SOLO el trigger de abajo, nunca el cliente.

alter table public.characters
  add column if not exists bosses_beaten smallint not null default 0
    check (bosses_beaten between 0 and 10),
  add column if not exists first_retornado boolean not null default false;

-- A lo sumo un "primer retornado" en todo el juego.
create unique index if not exists characters_first_retornado_one
  on public.characters (first_retornado) where first_retornado;

alter table public.characters drop constraint if exists characters_title_choice_check;
alter table public.characters add constraint characters_title_choice_check
  check (title_choice is null or title_choice between 0 and 8);

-- Lo ya ganado según checkpoint y récord. (Quien ya venció al jefe del 60
-- antes de esta migración no queda registrado: debe vencerlo de nuevo, o se
-- le ajusta bosses_beaten a mano.)
update public.characters
set bosses_beaten = least(10, greatest(bosses_beaten, (checkpoint_level - 1) / 10, (record_level - 1) / 10))
where bosses_beaten < least(10, greatest((checkpoint_level - 1) / 10, (record_level - 1) / 10));

create or replace function public.guard_bosses_beaten()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Nunca baja, y no puede superar lo que permite el nivel desbloqueado
  -- (vencer al jefe del 60 exige haber llegado al 60). Se recorta en vez de
  -- rechazar, para no romper el guardado de una sesión vieja.
  new.bosses_beaten := greatest(old.bosses_beaten, least(new.bosses_beaten, new.max_level_unlocked / 10));

  -- El cliente no puede darse ni quitarse el título único.
  if auth.uid() is not null and not public.is_admin() then
    new.first_retornado := old.first_retornado;
  end if;

  -- Primer personaje (no admin) que vence al jefe del 100.
  if new.bosses_beaten >= 10 and old.bosses_beaten < 10 and old.role <> 'admin' then
    perform pg_advisory_xact_lock(hashtext('first_retornado'));
    if not exists (select 1 from public.characters where first_retornado) then
      new.first_retornado := true;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists characters_guard_bosses_beaten on public.characters;
create trigger characters_guard_bosses_beaten
  before update on public.characters
  for each row execute function public.guard_bosses_beaten();

-- Rankings: suman las dos columnas (al final, para no romper clientes viejos).
create or replace view public.leaderboard_top10 as
select c.nickname, c.record_level, c.record_floor_idx, c.updated_at, c.race, c.style, c.level, c.title_choice,
       c.bosses_beaten, c.first_retornado
from public.characters c
join public.profiles p on p.id = c.user_id
where not p.is_banned and not c.hidden_from_leaderboard
order by c.record_level desc, c.record_floor_idx desc, c.updated_at asc
limit 10;
grant select on public.leaderboard_top10 to anon, authenticated;

create or replace view public.leaderboard_caidos_top10 as
select t.nickname, t.caidos, t.race, t.style, t.level, t.record_level, t.title_choice, t.bosses_beaten, t.first_retornado
from (
  select c.nickname, c.race, c.style, c.level, c.record_level, c.updated_at, c.title_choice, c.bosses_beaten, c.first_retornado,
    (select count(*) from jsonb_each(case when jsonb_typeof(c.pets->'owned') = 'object' then c.pets->'owned' else '{}'::jsonb end) e
      where jsonb_typeof(e.value) = 'number' and (e.value)::text::numeric > 0)::int as caidos
  from public.characters c
  join public.profiles p on p.id = c.user_id
  where not p.is_banned and not c.hidden_from_leaderboard
) t
where t.caidos > 0
order by t.caidos desc, t.updated_at asc
limit 10;
grant select on public.leaderboard_caidos_top10 to anon, authenticated;

notify pgrst, 'reload schema';
