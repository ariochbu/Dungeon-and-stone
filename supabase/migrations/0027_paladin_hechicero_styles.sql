-- Habilita las sendas nuevas Paladín y Hechicero ("Paso 1" del rediseño de
-- clases, pedido explícito 2026-10-01: "Vamos con el paladin y hechicero").
-- La columna characters.style tiene un check constraint que hoy solo admite
-- los 4 ids viejos (ver 0019_weapon_recalibration.sql) y create_character()
-- valida la senda contra esa misma lista — sin esto, cualquier personaje
-- nuevo con style='paladin'/'hechicero' es rechazado por el servidor aunque
-- el cliente ya los ofrezca.
--
-- No hace falta tocar equip/inventory/stash de personajes existentes (a
-- diferencia de 0019): son clases nuevas, nadie tiene todavía ítems con
-- styleId 'paladin'/'hechicero'.

begin;

alter table public.characters drop constraint if exists characters_style_check;
alter table public.characters add constraint characters_style_check
  check (style in ('pesada','doblefilo','tirador','mago','paladin','hechicero'));

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
  if p_style not in ('pesada','doblefilo','tirador','mago','paladin','hechicero') then
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

commit;
