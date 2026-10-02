-- Una sola sesión activa por cuenta (pedido explícito 2026-10-02).
--
-- Problema: se podía abrir la misma cuenta en varios navegadores/pestañas a
-- la vez, incluso con el mismo personaje. La sesión que quedaba atrás
-- intentaba guardar progreso viejo, el trigger anti-trampa lo rechazaba
-- ("checkpoint_level no puede bajar") y todo lo hecho ahí (ej. una ofrenda)
-- se perdía al recargar.
--
-- Solución: cada pestaña del juego genera un id de sesión al abrir y lo
-- "reclama" con claim_session(). El último en reclamar es la sesión activa;
-- cualquier guardado de personaje que llegue con OTRO id de sesión se
-- rechaza con 'SESION_REEMPLAZADA' (el cliente lo detecta y cierra esa
-- pestaña). El cliente además consulta active_sessions periódicamente para
-- cerrar la pestaña vieja antes de que intente guardar.
--
-- Es seguro correr esto ANTES o DESPUÉS de subir el juego: el cliente solo
-- manda last_session si claim_session() existe.

create table if not exists public.active_sessions (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  session_id uuid not null,
  updated_at timestamptz not null default now()
);
alter table public.active_sessions enable row level security;

drop policy if exists "active_sessions: self select" on public.active_sessions;
create policy "active_sessions: self select"
  on public.active_sessions for select
  using (user_id = auth.uid());
-- Sin políticas de insert/update: solo se escribe vía claim_session().

alter table public.characters
  add column if not exists last_session uuid;

create or replace function public.claim_session(p_session uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'No autorizado.'; end if;
  insert into public.active_sessions(user_id, session_id, updated_at)
    values (auth.uid(), p_session, now())
    on conflict (user_id) do update set session_id = excluded.session_id, updated_at = now();
  -- Los personajes de la cuenta pasan a "pertenecer" a esta sesión: así las
  -- funciones del servidor que actualizan characters (misiones, aliados...)
  -- siguen pasando la validación, y solo un guardado de la sesión vieja
  -- (que manda su propio last_session) queda rechazado.
  update public.characters set last_session = p_session where user_id = auth.uid();
end;
$$;
grant execute on function public.claim_session(uuid) to authenticated;

-- Misma función de 0026_stash_item_cap.sql + el chequeo de sesión al final.
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
  if auth.uid() is not null then
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
