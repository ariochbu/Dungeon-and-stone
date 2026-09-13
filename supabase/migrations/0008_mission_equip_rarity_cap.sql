-- Con el sistema de rangos activo (rango_b/rango_a) el equipo de recompensa
-- de una misión también debe respetar el tope de rango A — antes solo se
-- validaba el .tier de las piedras de alma, dejando sin comprobar el
-- .rarity del equipo (sin riesgo real hoy porque rango_a es el techo que
-- existe, pero hay que taparlo antes de que exista algo por encima).
-- Ejecutar en el SQL Editor de un proyecto que ya corrió 0001-0007.

create or replace function public.mission_equip_rarity_index(p_rarity text)
returns int
language sql
immutable
as $$
  select array_position(array['comun','poco_comun','rango_b','rango_a','rango_s','rango_ss'], p_rarity);
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
  v_allowed_ranks text[];
  m jsonb;
  v_item_tier text;
  v_item_rarity text;
begin
  if not exists (select 1 from public.characters where id = p_character_id and user_id = auth.uid()) then
    raise exception 'No autorizado.';
  end if;

  select max_level_unlocked into v_floor from public.characters where id = p_character_id;
  v_cycle := to_char(date_trunc('day', now()), 'YYYYMMDD') || case when extract(hour from now()) < 12 then 'A' else 'B' end;

  if exists (select 1 from public.character_missions where character_id = p_character_id and cycle_id = v_cycle) then
    return query select * from public.character_missions where character_id = p_character_id and cycle_id = v_cycle;
    return;
  end if;

  v_allowed_ranks := public.mission_allowed_ranks(v_floor);

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
    v_item_rarity := m->'reward_item'->>'rarity';
    if v_item_rarity is not null and public.mission_equip_rarity_index(v_item_rarity) > public.mission_equip_rarity_index('rango_a') then
      raise exception 'Las misiones no pueden entregar equipo de rango S o SS.';
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

create or replace function public.reroll_mission(p_mission_id uuid, p_new_mission jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old record;
  v_cycle text;
  v_remaining int;
  v_new public.character_missions;
begin
  select cm.id as mission_id, cm.character_id, cm.status, cm.cycle_id,
         c.user_id, c.id as char_id, c.max_level_unlocked,
         c.mission_reroll_cycle, c.mission_reroll_count
    into v_old
    from public.character_missions cm
    join public.characters c on c.id = cm.character_id
    where cm.id = p_mission_id;

  if v_old is null then raise exception 'Misión no encontrada.'; end if;
  if v_old.user_id <> auth.uid() then raise exception 'No autorizado.'; end if;
  if v_old.status <> 'active' then raise exception 'Solo puedes refrescar misiones activas.'; end if;

  v_cycle := to_char(date_trunc('day', now()), 'YYYYMMDD') || case when extract(hour from now()) < 12 then 'A' else 'B' end;

  if v_old.mission_reroll_cycle is distinct from v_cycle then
    update public.characters set mission_reroll_cycle = v_cycle, mission_reroll_count = 0 where id = v_old.char_id;
    v_remaining := 3;
  else
    v_remaining := 3 - v_old.mission_reroll_count;
  end if;

  if v_remaining <= 0 then
    raise exception 'Ya usaste tus 3 refrescos de este tablón. Vuelve en el próximo refresco de 12 horas.';
  end if;

  if not (p_new_mission->>'rank' = any(public.mission_allowed_ranks(v_old.max_level_unlocked))) then
    raise exception 'Rango de misión % no permitido para tu progreso actual.', p_new_mission->>'rank';
  end if;
  if (p_new_mission->'reward_item'->>'tier') is not null
     and public.mission_rank_index(p_new_mission->'reward_item'->>'tier') > public.mission_rank_index('A') then
    raise exception 'Las misiones no pueden entregar equipo ni piedras de rango S o SS.';
  end if;
  if (p_new_mission->'reward_item'->>'rarity') is not null
     and public.mission_equip_rarity_index(p_new_mission->'reward_item'->>'rarity') > public.mission_equip_rarity_index('rango_a') then
    raise exception 'Las misiones no pueden entregar equipo de rango S o SS.';
  end if;

  delete from public.character_missions where id = p_mission_id;

  insert into public.character_missions
    (character_id, cycle_id, rank, objective_type, objective_target, reward_gold, reward_xp, reward_currency, reward_item)
  values (
    v_old.character_id, v_old.cycle_id, p_new_mission->>'rank', p_new_mission->>'objective_type', (p_new_mission->>'objective_target')::int,
    least((p_new_mission->>'reward_gold')::int, 5000), least((p_new_mission->>'reward_xp')::int, 5000), least((p_new_mission->>'reward_currency')::int, 100),
    p_new_mission->'reward_item'
  )
  returning * into v_new;

  update public.characters set mission_reroll_count = mission_reroll_count + 1 where id = v_old.char_id;

  return jsonb_build_object('mission', to_jsonb(v_new), 'remaining', v_remaining - 1);
end;
$$;
grant execute on function public.reroll_mission(uuid, jsonb) to authenticated;
