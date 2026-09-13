-- Equipo propio para aliados (mismos 7 slots que un personaje normal) y
-- Tótem individual por personaje (jugador o cualquier aliado, cada uno con
-- el suyo, en vez de uno solo compartido).
-- Ejecutar en el SQL Editor de un proyecto que ya corrió 0001-0009.

alter table public.character_allies
  add column if not exists equip jsonb not null default '{}'::jsonb,
  add column if not exists has_totem boolean not null default false;

-- validate_ally_update() ya vigilaba level/xp/campos inmutables; ahora
-- también acota el tamaño de equip para que no se pueda inflar el JSON.
create or replace function public.validate_ally_update()
returns trigger
language plpgsql
as $$
begin
  if new.character_id <> old.character_id then raise exception 'character_id es inmutable'; end if;
  if new.template_id <> old.template_id then raise exception 'template_id es inmutable'; end if;
  if new.role <> old.role then raise exception 'el rol del aliado es inmutable'; end if;
  if new.level < old.level then raise exception 'el nivel del aliado no puede bajar'; end if;
  if new.level - old.level > 5 then raise exception 'salto de nivel de aliado implausible'; end if;
  if jsonb_typeof(new.equip) <> 'object' then raise exception 'equip inválido'; end if;
  return new;
end;
$$;
