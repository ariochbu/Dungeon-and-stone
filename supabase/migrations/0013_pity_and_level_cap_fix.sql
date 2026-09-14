-- Bug crítico encontrado al revisar el esquema para el sistema de pity:
-- max_level_unlocked y record_level se crearon en 0001_init.sql con
-- check (... between 1 and 10) - un límite que nunca se actualizó cuando el
-- laberinto pasó a tener 60 niveles (LEVEL_CAP en game.js). Cualquier
-- personaje que derrote al jefe de nivel 10 y trate de avanzar al nivel 11
-- falla el guardado con una violación de check constraint - el juego queda
-- atascado en el primer límite de década sin ningún aviso claro. Nadie lo
-- había reportado todavía porque, hasta ahora, ningún personaje probado en
-- vivo había llegado tan lejos.
-- Ejecutar en el SQL Editor de un proyecto que ya corrió 0001-0012.

do $$
declare con record;
begin
  for con in
    select conname from pg_constraint
    where conrelid = 'public.characters'::regclass and contype = 'c'
      and (pg_get_constraintdef(oid) like '%max_level_unlocked%' or pg_get_constraintdef(oid) like '%record_level%')
  loop
    execute format('alter table public.characters drop constraint %I', con.conname);
  end loop;
end $$;

alter table public.characters
  add constraint characters_max_level_unlocked_check check (max_level_unlocked between 1 and 60),
  add constraint characters_record_level_check check (record_level between 1 and 60);

-- Contador de pity: combates sin un drop de rango A (equipo) o A/S/SS
-- (piedras de alma). Sube 1 por combate sin ese drop, se resetea a 0 en
-- cuanto cae algo de ese rango o mejor.
alter table public.characters
  add column if not exists pity_gear int not null default 0 check (pity_gear >= 0 and pity_gear <= 1000),
  add column if not exists pity_stone int not null default 0 check (pity_stone >= 0 and pity_stone <= 1000);

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
