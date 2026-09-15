-- Checkpoints del laberinto: hasta ahora toda entrada al laberinto empezaba
-- siempre en el nivel 1. A pedido del 2026-09-14, derrotar a un jefe de
-- década (piso 10, 20, 30...) habilita un punto de entrada nuevo, un piso
-- más adelante (11, 21, 31...) - si mueres en el 15, tu próxima entrada
-- igual arranca en el 11, no en el 15. checkpoint_level guarda ese piso.

alter table public.characters
  add column if not exists checkpoint_level int not null default 1;

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
  if jsonb_typeof(new.inventory) <> 'array' or jsonb_array_length(new.inventory) > 250 then
    raise exception 'inventory inválido o demasiado grande';
  end if;
  if jsonb_typeof(new.soul_slots) <> 'array' or jsonb_array_length(new.soul_slots) > 6 then
    raise exception 'soul_slots inválido o demasiado grande';
  end if;
  if new.pity_gear - old.pity_gear > 50 or new.pity_stone - old.pity_stone > 50 then
    raise exception 'incremento de contador de pity implausible en un solo guardado';
  end if;
  new.updated_at := now();
  return new;
end;
$$;
