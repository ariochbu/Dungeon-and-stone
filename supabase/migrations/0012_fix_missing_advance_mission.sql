-- Bug preexistente encontrado al probar en vivo: public.advance_mission
-- (definida en 0006_missions.sql) nunca quedó realmente creada en la base de
-- datos -- PostgREST responde "Could not find the function
-- public.advance_mission(p_amount, p_mission_id) in the schema cache" al
-- llamarla, mientras que refresh_and_insert_missions/reroll_mission/
-- claim_mission (definidas en el mismo/otros archivos) sí funcionan. Esto
-- significa que NINGUNA misión ha podido avanzar su progreso nunca, con
-- cualquiera de los tipos de objetivo (ni los 3 originales ni los 5 nuevos
-- de 0011). Simple re-creación, idéntica a la de 0006.
-- Ejecutar en el SQL Editor de un proyecto que ya corrió 0001-0011.

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
