-- Sistema de misiones: tablón de 10 encargos por personaje, refrescado cada
-- 12 horas reales. El rango de las misiones depende de max_level_unlocked
-- (el piso más profundo del laberinto que el personaje ha alcanzado), no del
-- nivel del personaje. Igual que el resto del juego, el cliente arma las 10
-- misiones (mismo patrón que loot/oro/xp) y el servidor valida que el rango,
-- la meta y la recompensa de cada una sean razonables para su progreso real
-- antes de guardarlas — nunca confía en lo que el cliente diga sin más.
-- Ejecutar en el SQL Editor de un proyecto que ya corrió 0001-0005.

alter table public.characters
  add column if not exists mission_currency int not null default 0 check (mission_currency >= 0);

create table public.character_missions (
  id                uuid primary key default gen_random_uuid(),
  character_id      uuid not null references public.characters(id) on delete cascade,
  cycle_id          text not null,
  rank              text not null check (rank in ('E','F','D','C','B','A','S','SS')),
  objective_type    text not null check (objective_type in ('kill_elites','clear_floors','defeat_guardian')),
  objective_target  int  not null check (objective_target > 0 and objective_target <= 20),
  progress          int  not null default 0 check (progress >= 0),
  reward_gold       int  not null check (reward_gold >= 0 and reward_gold <= 5000),
  reward_xp         int  not null check (reward_xp >= 0 and reward_xp <= 5000),
  reward_currency   int  not null check (reward_currency >= 0 and reward_currency <= 100),
  reward_item       jsonb,
  status            text not null default 'active' check (status in ('active','completed','claimed')),
  created_at        timestamptz not null default now()
);

alter table public.character_missions enable row level security;

create policy "missions: owner select"
  on public.character_missions for select
  using (exists (select 1 from public.characters c where c.id = character_id and c.user_id = auth.uid()));

create policy "missions: admins select all"
  on public.character_missions for select
  using (public.is_admin());

-- Sin insert/update directo desde el cliente: todo pasa por estas funciones
-- SECURITY DEFINER, para que nadie se marque una misión como completada o se
-- acredite una recompensa a mano.

-- Orden de rango usado para comparar "no más alto que A" en la recompensa de
-- objeto/piedra de una misión — S y SS quedan reservados a la probabilidad de
-- drop de élites ya existente, nunca como recompensa garantizada de misión.
create or replace function public.mission_rank_index(p_rank text)
returns int
language sql
immutable
as $$
  select array_position(array['E','F','D','C','B','A','S','SS'], p_rank);
$$;

create or replace function public.refresh_and_insert_missions(p_character_id uuid, p_missions jsonb)
returns setof public.character_missions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_floor int;
  v_cycle text;
  v_band int;
  v_allowed_ranks text[];
  m jsonb;
  v_item_tier text;
begin
  if not exists (select 1 from public.characters where id = p_character_id and user_id = auth.uid()) then
    raise exception 'No autorizado.';
  end if;

  select max_level_unlocked into v_floor from public.characters where id = p_character_id;

  -- ciclo de 12h: dos tablones por día de calendario UTC (00:00 y 12:00).
  v_cycle := to_char(date_trunc('day', now()), 'YYYYMMDD') || case when extract(hour from now()) < 12 then 'A' else 'B' end;

  if exists (select 1 from public.character_missions where character_id = p_character_id and cycle_id = v_cycle) then
    return query select * from public.character_missions where character_id = p_character_id and cycle_id = v_cycle;
    return;
  end if;

  v_band := case
    when v_floor <= 20 then 0 when v_floor <= 40 then 1 when v_floor <= 60 then 2
    when v_floor <= 80 then 3 else 4
  end;
  -- rangos permitidos: la banda "frontera" (la más alta ya desbloqueada) y
  -- hasta dos bandas por debajo — nunca por encima de tu progreso real.
  v_allowed_ranks := case v_band
    when 0 then array['E','F']
    when 1 then array['E','F','D','C']
    when 2 then array['D','C','B','A']
    when 3 then array['B','A','S']
    else array['S','SS']
  end;

  if jsonb_array_length(p_missions) <> 10 then
    raise exception 'Se esperaban 10 misiones.';
  end if;

  delete from public.character_missions where character_id = p_character_id and status <> 'claimed';

  for m in select * from jsonb_array_elements(p_missions) loop
    if not (m->>'rank' = any(v_allowed_ranks)) then
      raise exception 'Rango de misión % no permitido para tu progreso actual.', m->>'rank';
    end if;

    v_item_tier := m->'reward_item'->>'tier';
    if v_item_tier is not null and public.mission_rank_index(v_item_tier) > public.mission_rank_index('A') then
      raise exception 'Las misiones no pueden entregar equipo ni piedras de rango S o SS.';
    end if;

    insert into public.character_missions
      (character_id, cycle_id, rank, objective_type, objective_target, reward_gold, reward_xp, reward_currency, reward_item)
    values (
      p_character_id, v_cycle, m->>'rank', m->>'objective_type', (m->>'objective_target')::int,
      least((m->>'reward_gold')::int, 5000), least((m->>'reward_xp')::int, 5000), least((m->>'reward_currency')::int, 100),
      m->'reward_item'
    );
  end loop;

  return query select * from public.character_missions where character_id = p_character_id and cycle_id = v_cycle;
end;
$$;
grant execute on function public.refresh_and_insert_missions(uuid, jsonb) to authenticated;

-- El cliente reporta avance a medida que ocurre en combate/exploración
-- (mata un élite, avanza un piso, derrota un guardián). Solo puede subir,
-- nunca bajar, y nunca más allá de la meta; al llegar a la meta la misión
-- pasa sola a 'completed'.
create or replace function public.advance_mission(p_mission_id uuid, p_amount int)
returns public.character_missions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_mission public.character_missions;
begin
  select cm.* into v_mission
  from public.character_missions cm
  join public.characters c on c.id = cm.character_id
  where cm.id = p_mission_id and c.user_id = auth.uid();

  if v_mission is null then raise exception 'Misión no encontrada.'; end if;
  if p_amount is null or p_amount <= 0 or p_amount > 20 then raise exception 'Avance inválido.'; end if;
  if v_mission.status <> 'active' then return v_mission; end if;

  update public.character_missions
    set progress = least(objective_target, progress + p_amount),
        status = case when progress + p_amount >= objective_target then 'completed' else 'active' end
    where id = p_mission_id
    returning * into v_mission;

  return v_mission;
end;
$$;
grant execute on function public.advance_mission(uuid, int) to authenticated;

create or replace function public.claim_mission(p_mission_id uuid)
returns public.characters
language plpgsql
security definer
set search_path = public
as $$
declare
  m public.character_missions;
  c public.characters;
begin
  select cm.* into m from public.character_missions cm where cm.id = p_mission_id;
  if m is null then raise exception 'Misión no encontrada.'; end if;

  select * into c from public.characters where id = m.character_id;
  if c.user_id <> auth.uid() then raise exception 'No autorizado.'; end if;
  if m.status <> 'completed' then raise exception 'La misión no está lista para reclamar.'; end if;

  update public.characters
    set gold = gold + m.reward_gold,
        xp = xp + m.reward_xp,
        mission_currency = mission_currency + m.reward_currency
    where id = c.id
    returning * into c;

  update public.character_missions set status = 'claimed' where id = p_mission_id;

  return c;
end;
$$;
grant execute on function public.claim_mission(uuid) to authenticated;

-- validate_character_update() ya limita cuánto puede subir el oro por
-- guardado; ahora también limita mission_currency por la misma razón
-- (nunca confiar en un salto grande de un valor que el cliente controla).
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
  new.updated_at := now();
  return new;
end;
$$;
