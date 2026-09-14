-- Lealtad de aliados con consecuencia real: si la satisfacción cae a 15% o
-- menos (pagos incumplidos repetidos - ver game.js: payAlliesOnExit()), el
-- aliado deserta y se pierde para siempre. Lo mismo si el jugador lo
-- despide a propósito ("Despedir"): en ambos casos, nunca vuelve a estar
-- disponible para ese personaje. Se guarda como una lista de template_id
-- vetados en characters.banned_ally_templates - un array que solo puede
-- crecer, y que characterToRow() en el cliente ni siquiera intenta escribir
-- (solo estas dos funciones RPC, con security definer, lo tocan).
-- Ejecutar en el SQL Editor de un proyecto que ya corrió 0001-0015.

alter table public.characters
  add column if not exists banned_ally_templates jsonb not null default '[]'::jsonb;

alter table public.character_allies
  add column if not exists missed_payments int not null default 0 check (missed_payments between 0 and 50);

-- hire_ally: mismo comportamiento que antes, más el veto - un template_id
-- que ya está en banned_ally_templates no se puede volver a reclutar con
-- este personaje, sin importar cuánto oro tenga.
create or replace function public.hire_ally(p_character_id uuid, p_template_id text, p_role text, p_name text, p_cost int)
returns public.character_allies
language plpgsql
security definer
set search_path = public
as $$
declare
  v_char record;
  v_count int;
  v_row public.character_allies;
begin
  select * into v_char from public.characters where id = p_character_id and user_id = auth.uid();
  if v_char is null then raise exception 'No autorizado.'; end if;
  if v_char.level < 10 then raise exception 'Necesitas nivel 10 para acceder a la Taberna.'; end if;
  if p_role not in ('guerrero','arquero','asesino','mago','sacerdote') then raise exception 'Rol inválido.'; end if;
  if v_char.banned_ally_templates ? p_template_id then
    raise exception 'Ese aliado ya no confía en ti y no volverá a unirse a tu grupo.';
  end if;

  select count(*) into v_count from public.character_allies where character_id = p_character_id;
  if v_count >= 4 then raise exception 'Ya tienes el máximo de 4 aliados.'; end if;
  if exists (select 1 from public.character_allies where character_id = p_character_id and template_id = p_template_id) then
    raise exception 'Ya reclutaste a ese aliado.';
  end if;
  if p_cost < 0 or p_cost > 5000 then raise exception 'Costo inválido.'; end if;
  if v_char.gold < p_cost then raise exception 'No tienes suficiente oro.'; end if;

  update public.characters set gold = gold - p_cost where id = p_character_id;

  insert into public.character_allies (character_id, template_id, role, name, level)
  values (p_character_id, p_template_id, p_role, p_name, 1)
  returning * into v_row;

  return v_row;
end;
$$;
grant execute on function public.hire_ally(uuid, text, text, text, int) to authenticated;

-- dismiss_ally: ahora también es el punto de salida para la deserción por
-- baja satisfacción (game.js llama a este mismo RPC en ambos casos) - borra
-- al aliado y, en el mismo movimiento, lo agrega a la lista de vetados de
-- ese personaje para que hire_ally lo rechace si se intenta reclutar de nuevo.
create or replace function public.dismiss_ally(p_ally_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_template_id text;
  v_character_id uuid;
begin
  select a.template_id, a.character_id into v_template_id, v_character_id
  from public.character_allies a
  join public.characters c on c.id = a.character_id
  where a.id = p_ally_id and c.user_id = auth.uid();

  if v_template_id is null then return; end if;

  delete from public.character_allies where id = p_ally_id;

  update public.characters
  set banned_ally_templates = case
    when banned_ally_templates ? v_template_id then banned_ally_templates
    else banned_ally_templates || to_jsonb(v_template_id)
  end
  where id = v_character_id;
end;
$$;
grant execute on function public.dismiss_ally(uuid) to authenticated;

-- validate_ally_update() ya vigilaba level/xp/equip/satisfacción/campos
-- inmutables. missed_payments NO lleva cota de salto por escritura (a
-- diferencia de nivel/satisfacción): un pago exitoso lo resetea a 0 de
-- golpe sin importar cuántos incumplimientos seguidos traía, y eso es
-- legítimo, no un salto sospechoso - el check de rango en la columna
-- (0-50) ya es suficiente, no es un valor con el que se pueda hacer trampa
-- de forma dañina (solo decide qué tan dura es la PRÓXIMA penalización).
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
