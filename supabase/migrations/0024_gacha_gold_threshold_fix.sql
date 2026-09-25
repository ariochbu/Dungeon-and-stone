-- Bug urgente (2026-09-26): las invocaciones de Caídos del Laberinto se
-- perdían por completo (a veces "devolviendo" el costo, a veces perdiendo
-- todo) al cambiar de personaje o al volver de segundo plano en el
-- navegador. La causa real no era el guardado en sí (game.js ya reintenta
-- bien), sino que el trigger anti-trampa de esta misma función rechazaba
-- SILENCIOSAMENTE el guardado completo del personaje cuando el oro subía
-- más de 3000 en un solo guardado — un límite que tenía sentido antes de
-- que los Caídos del Laberinto dieran +1000 de oro por duplicado
-- (PET_DUP_GOLD en game.js), pero que hoy es demasiado bajo:
--   - Una ofrenda x10 (11 tiradas) pagada con Sellos no descuenta oro, así
--     que 4+ duplicados ya superan los 3000 de aumento.
--   - Reclamar ofrendas gratis acumuladas del check-in diario puede
--     resolver hasta 30 tiradas de una vez (día 30 del mes) — con varios
--     duplicados eso fácilmente pasa de 3000, incluso de 10000.
--   - Retirar todo el oro guardado en el Hogar de una vez también puede
--     superar el límite si el jugador acumuló bastante.
-- Cuando el trigger rechazaba el UPDATE, el juego seguía mostrando la
-- mascota/el oro en memoria (por eso "sí estaba" en el inventario un
-- momento), pero nunca llegó a escribirse en la base — al recargar o
-- cambiar de personaje, se perdía. Este fix solo sube el límite a un valor
-- que cubre esos casos legítimos con margen, sin quitarle el propósito de
-- detectar una edición de oro manual/absurda por fuera del juego.

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
  if new.gold - old.gold > 50000 then
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
