-- Progresión automática de equipo para el aliado Sacerdote (pedido
-- explícito del 2026-09-15, en respuesta a que se sacó a Sacerdote del pool
-- de botín aleatorio del laberinto - ver 0019 y game.js WEAPON_STYLE_IDS).
-- En vez de depender del azar o de que el jugador se lo compre todo con
-- oro, el Sacerdote desbloquea equipo completo solo en 3 hitos:
--   - Nivel de aliado 10 -> todo su equipo Raro (C), salvo el arma 1.
--   - Nivel de aliado 20 -> todo su equipo Único (B), salvo el arma 1.
--   - Jefe de la década 30 derrotado -> todo su equipo Épico (A), salvo el
--     arma 1 (esto no depende del nivel del aliado, solo del jefe caído).
-- El arma 2 (Grimorio de plegarias / Tomo sagrado) la elige el jugador la
-- PRIMERA vez que se desbloquea algo - la elección se recuerda y se vuelve
-- a aplicar sola (mismo nombre, rango más alto) en cada hito siguiente.
-- Ejecutar en el SQL Editor de un proyecto que ya corrió 0001-0019.

alter table public.character_allies
  add column if not exists auto_gear_tier text not null default 'none'
    check (auto_gear_tier in ('none','raro','rango_b','rango_a')),
  add column if not exists auto_gear_pending boolean not null default false,
  add column if not exists auto_gear_arma2_name text;

-- validate_ally_update() ya vigilaba level/xp/equip; ahora también evita que
-- auto_gear_tier retroceda (mismo criterio que ya usa para level).
create or replace function public.validate_ally_update()
returns trigger
language plpgsql
as $$
declare
  tier_rank_old int;
  tier_rank_new int;
begin
  if new.character_id <> old.character_id then raise exception 'character_id es inmutable'; end if;
  if new.template_id <> old.template_id then raise exception 'template_id es inmutable'; end if;
  if new.role <> old.role then raise exception 'el rol del aliado es inmutable'; end if;
  if new.level < old.level then raise exception 'el nivel del aliado no puede bajar'; end if;
  if new.level - old.level > 5 then raise exception 'salto de nivel de aliado implausible'; end if;
  if jsonb_typeof(new.equip) <> 'object' then raise exception 'equip inválido'; end if;

  tier_rank_old := array_position(array['none','raro','rango_b','rango_a'], old.auto_gear_tier);
  tier_rank_new := array_position(array['none','raro','rango_b','rango_a'], new.auto_gear_tier);
  if tier_rank_new < tier_rank_old then raise exception 'auto_gear_tier no puede bajar'; end if;

  return new;
end;
$$;
