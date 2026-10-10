-- Oro ganado en un solo guardado: el tope sube de 50.000 a 250.000 (2026-10-10, pedido de
-- ariochbu). Es la misma función de 0033; solo cambia ese límite. Con el anterior, una venta
-- grande o una tanda de recompensas podía rechazar el guardado entero.
-- Ejecutar en el SQL Editor de un proyecto que ya corrió 0001-0043.

create or replace function public.validate_character_update()
returns trigger
language plpgsql
as $$
declare
  v_active uuid;
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
  -- Sesión única: solo aplica a jugadores (auth.uid() presente). El SQL
  -- manual del administrador (auth.uid() nulo) no se ve afectado.
  -- Solo sobre personajes PROPIOS: el admin editando el personaje de otra
  -- cuenta (dar ofrendas, devolver a la ciudad...) no debe compararse con
  -- su propia sesión (0029, bug: esas acciones fallaban con SESION_REEMPLAZADA).
  if auth.uid() is not null and new.user_id = auth.uid() then
    select session_id into v_active from public.active_sessions where user_id = auth.uid();
    if v_active is not null and new.last_session is distinct from v_active then
      raise exception 'SESION_REEMPLAZADA';
    end if;
  end if;
  if new.level < old.level then
    raise exception 'el nivel no puede bajar';
  end if;
  if new.level - old.level > 5 then
    raise exception 'salto de nivel implausible en un solo guardado';
  end if;
  if new.gold - old.gold > 250000 then
    raise exception 'incremento de oro implausible en un solo guardado';
  end if;
  if new.mission_currency - old.mission_currency > 200 then
    raise exception 'incremento de mission_currency implausible en un solo guardado';
  end if;
  if new.max_level_unlocked < old.max_level_unlocked then
    raise exception 'max_level_unlocked no puede bajar';
  end if;
  if new.checkpoint_level < old.checkpoint_level then
    raise exception 'checkpoint_level no puede bajar';
  end if;
  if new.record_level > new.max_level_unlocked then
    raise exception 'record_level no puede superar max_level_unlocked';
  end if;
  if new.record_level < old.record_level
     or (new.record_level = old.record_level and new.record_floor_idx < old.record_floor_idx) then
    raise exception 'el récord no puede retroceder';
  end if;
  if jsonb_typeof(new.inventory) <> 'array' or jsonb_array_length(new.inventory) > 500 then
    raise exception 'inventory inválido o demasiado grande';
  end if;
  if jsonb_typeof(new.soul_slots) <> 'array' or jsonb_array_length(new.soul_slots) > 6 then
    raise exception 'soul_slots inválido o demasiado grande';
  end if;
  if jsonb_typeof(new.stash->'items') <> 'array' or jsonb_array_length(new.stash->'items') > 100 then
    raise exception 'stash inválido o demasiado grande';
  end if;
  if new.pity_gear - old.pity_gear > 50 or new.pity_stone - old.pity_stone > 50 then
    raise exception 'incremento de contador de pity implausible en un solo guardado';
  end if;
  new.updated_at := now();
  return new;
end;
$$;
