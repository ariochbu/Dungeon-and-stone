-- El equipo automático del Sacerdote tiene un quinto escalón, 'legendario'
-- (Tier S, al vencer a Storm Gush en el piso 60), pero la restricción y el
-- trigger de la 0020 solo conocían hasta 'rango_a': el guardado se rechazaba
-- y el jugador perdía el set al recargar (caso SoshiroHoshina, 2026-10-05).
alter table public.character_allies
  drop constraint if exists character_allies_auto_gear_tier_check;
alter table public.character_allies
  add constraint character_allies_auto_gear_tier_check
    check (auto_gear_tier in ('none','raro','rango_b','rango_a','legendario'));

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

  tier_rank_old := array_position(array['none','raro','rango_b','rango_a','legendario'], old.auto_gear_tier);
  tier_rank_new := array_position(array['none','raro','rango_b','rango_a','legendario'], new.auto_gear_tier);
  if tier_rank_new < tier_rank_old then raise exception 'auto_gear_tier no puede bajar'; end if;

  return new;
end;
$$;
