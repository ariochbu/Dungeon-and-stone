-- Mantenimiento recurrente de aliados: nivel de satisfacción, que solo sube
-- o baja por el pago al salir del laberinto (game.js: payAlliesOnExit()).
-- El tema de la muerte/abandono de un aliado por baja satisfacción queda
-- pendiente hasta definir mejor el combate - por ahora solo se registra el
-- número, sin ninguna consecuencia todavía.
-- Ejecutar en el SQL Editor de un proyecto que ya corrió 0001-0014.

alter table public.character_allies
  add column if not exists satisfaction int not null default 50 check (satisfaction between 0 and 100);

-- validate_ally_update() ya vigilaba level/xp/equip/campos inmutables; ahora
-- también acota el salto de satisfacción por actualización, igual que ya
-- hacía con el nivel, para que un cliente comprometido no pueda escribir
-- saltos implausibles.
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
  if abs(new.satisfaction - old.satisfaction) > 30 then raise exception 'salto de satisfacción implausible'; end if;
  return new;
end;
$$;
