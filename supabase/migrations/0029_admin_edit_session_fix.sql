-- Corrige 0028 (2026-10-02): el chequeo de sesión única comparaba la sesión
-- activa de QUIEN guarda con el last_session del personaje editado. Cuando
-- el admin editaba el personaje de otra cuenta desde el panel (dar ofrendas
-- gratis, devolver a la ciudad, etc.) se rechazaba con SESION_REEMPLAZADA.
-- Ahora el chequeo solo aplica cuando el personaje es de quien guarda.

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
-- Ofrendas regaladas por el admin: van a una columna aparte que el juego del
-- jugador NUNCA escribe en sus guardados (antes se sumaban a pets, y si el
-- jugador estaba conectado su siguiente guardado las pisaba). El jugador las
-- cobra con claim_gift_pulls(), que las devuelve y deja la columna en 0.
alter table public.characters
  add column if not exists gift_pulls integer not null default 0;

create or replace function public.admin_grant_pulls(p_char uuid, p_n integer)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare v_total integer;
begin
  if not public.is_admin() then raise exception 'No autorizado.'; end if;
  if p_n is null or p_n <= 0 or p_n > 1000 then raise exception 'Cantidad inválida.'; end if;
  update public.characters set gift_pulls = gift_pulls + p_n where id = p_char
    returning gift_pulls into v_total;
  if v_total is null then raise exception 'Personaje no encontrado.'; end if;
  return v_total;
end;
$$;
grant execute on function public.admin_grant_pulls(uuid, integer) to authenticated;

create or replace function public.claim_gift_pulls(p_char uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare v_n integer;
begin
  select gift_pulls into v_n from public.characters
    where id = p_char and user_id = auth.uid() for update;
  if v_n is null or v_n <= 0 then return 0; end if;
  update public.characters set gift_pulls = 0 where id = p_char;
  return v_n;
end;
$$;
grant execute on function public.claim_gift_pulls(uuid) to authenticated;

-- Panel admin: poder descartar (borrar) alertas de "jefe en 4 turnos".
drop policy if exists "flagged_kills: admin delete" on public.flagged_boss_kills;
create policy "flagged_kills: admin delete"
  on public.flagged_boss_kills for delete
  using (public.is_admin());
-- El tope real de niveles es 100 (antes 60): las alertas de niveles 61+ se
-- rechazaban por el check.
alter table public.flagged_boss_kills drop constraint if exists flagged_boss_kills_dungeon_level_check;
alter table public.flagged_boss_kills add constraint flagged_boss_kills_dungeon_level_check check (dungeon_level between 1 and 100);
