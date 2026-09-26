-- Pedido explícito 2026-09-27: despedir a un aliado ya no lo veta para
-- siempre en todos los casos. Si tenía MÁS del 50% de satisfacción al
-- momento de despedirlo, se separaron en buenos términos y puede volver a
-- ser reclutado más adelante (con los nuevos aliados en el roster, los
-- jugadores quieren poder probar otras combinaciones sin perder para
-- siempre a los que ya tenían). Con 50% o menos, sigue vetado como
-- siempre. La deserción automática por baja satisfacción (ver
-- ALLY_DESERTION_THRESHOLD=15 en game.js) sigue llamando a este mismo RPC,
-- así que nunca supera el 50% ahí — su comportamiento no cambia (siempre
-- queda vetada).

create or replace function public.dismiss_ally(p_ally_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_template_id text;
  v_character_id uuid;
  v_satisfaction int;
begin
  select a.template_id, a.character_id, a.satisfaction into v_template_id, v_character_id, v_satisfaction
  from public.character_allies a
  join public.characters c on c.id = a.character_id
  where a.id = p_ally_id and c.user_id = auth.uid();

  if v_template_id is null then return; end if;

  delete from public.character_allies where id = p_ally_id;

  if coalesce(v_satisfaction, 0) <= 50 then
    update public.characters
    set banned_ally_templates = case
      when banned_ally_templates ? v_template_id then banned_ally_templates
      else banned_ally_templates || to_jsonb(v_template_id)
    end
    where id = v_character_id;
  end if;
end;
$$;
grant execute on function public.dismiss_ally(uuid) to authenticated;
