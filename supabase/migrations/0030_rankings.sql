-- Rankings (2026-10-04): el del laberinto suma raza, senda y nivel (para el
-- retrato del podio) y se agrega un segundo tablón por colección de Caídos
-- del Laberinto (cuántos distintos de los 100 tiene cada personaje).
-- Las columnas nuevas van AL FINAL para no romper a clientes viejos.
create or replace view public.leaderboard_top10 as
select c.nickname, c.record_level, c.record_floor_idx, c.updated_at, c.race, c.style, c.level
from public.characters c
join public.profiles p on p.id = c.user_id
where not p.is_banned and not c.hidden_from_leaderboard
order by c.record_level desc, c.record_floor_idx desc, c.updated_at asc
limit 10;
grant select on public.leaderboard_top10 to anon, authenticated;

create or replace view public.leaderboard_caidos_top10 as
select t.nickname, t.caidos, t.race, t.style, t.level, t.record_level
from (
  select c.nickname, c.race, c.style, c.level, c.record_level, c.updated_at,
    (select count(*) from jsonb_each(case when jsonb_typeof(c.pets->'owned') = 'object' then c.pets->'owned' else '{}'::jsonb end) e
      where jsonb_typeof(e.value) = 'number' and (e.value)::text::numeric > 0)::int as caidos
  from public.characters c
  join public.profiles p on p.id = c.user_id
  where not p.is_banned and not c.hidden_from_leaderboard
) t
where t.caidos > 0
order by t.caidos desc, t.updated_at asc
limit 10;
grant select on public.leaderboard_caidos_top10 to anon, authenticated;

notify pgrst, 'reload schema';
