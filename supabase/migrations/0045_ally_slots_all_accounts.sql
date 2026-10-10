-- Cupos de aliados por fama para TODAS las cuentas (pedido de ariochbu, 2026-10-10).
-- Antes solo aplicaba a las cuentas creadas desde el 2026-10-05 (migración 0034). Ahora cualquier
-- personaje recluta un aliado por cada jefe de década vencido (Ogro 1, Matriarca 2, Riakis 3,
-- Usurpador 4). No borra aliados: quien ya tenía más que su cupo los conserva, solo no puede
-- reclutar otro hasta que su cupo lo permita.
create or replace function public.hire_ally(p_character_id uuid, p_template_id text, p_role text, p_name text, p_cost int)
returns public.character_allies
language plpgsql
security definer
set search_path = public
as $$
declare
  v_char record;
  v_count int;
  v_cap int := 4;
  v_row public.character_allies;
begin
  select * into v_char from public.characters where id = p_character_id and user_id = auth.uid();
  if v_char is null then raise exception 'No autorizado.'; end if;
  if v_char.level < 10 then raise exception 'Necesitas nivel 10 para acceder a la Taberna.'; end if;
  if p_role not in ('guerrero','arquero','asesino','mago','sacerdote') then raise exception 'Rol inválido.'; end if;
  if v_char.banned_ally_templates ? p_template_id then
    raise exception 'Ese aliado ya no confía en ti y no volverá a unirse a tu grupo.';
  end if;

  v_cap := least(4, greatest(v_char.bosses_beaten, (v_char.checkpoint_level - 1) / 10, (v_char.record_level - 1) / 10));
  if v_cap < 1 then raise exception 'Derrota al Ogro (nivel 10) para acceder a la Taberna.'; end if;

  select count(*) into v_count from public.character_allies where character_id = p_character_id;
  if v_count >= v_cap then
    if v_cap >= 4 then raise exception 'Ya tienes el máximo de 4 aliados.'; end if;
    raise exception 'Tu fama solo te permite % aliado(s). Derrota al siguiente jefe de década.', v_cap;
  end if;
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
