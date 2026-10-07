-- Ranking del laberinto (2026-10-07): entre dos personajes en el mismo nivel
-- va primero el que venció a su último guardián en menos turnos.
-- record_turns: turnos del mejor intento; record_turns_level: nivel de ese guardián.
alter table public.characters
  add column if not exists record_turns int check (record_turns is null or record_turns between 1 and 999),
  add column if not exists record_turns_level smallint check (record_turns_level is null or record_turns_level between 1 and 100);

-- Los turnos solo cuentan si son del guardián que dio el récord actual (el del
-- nivel anterior, o el del propio nivel si ya no hay más laberinto). Quien no
-- tenga turnos registrados queda detrás de los que sí, dentro de su nivel.
create or replace view public.leaderboard_top10 as
select c.nickname, c.record_level, c.record_floor_idx, c.updated_at, c.race, c.style, c.level, c.title_choice,
       c.bosses_beaten, c.first_retornado,
       case when c.record_turns_level >= c.record_level - 1 then c.record_turns end as record_turns
from public.characters c
join public.profiles p on p.id = c.user_id
where not p.is_banned and not c.hidden_from_leaderboard
order by c.record_level desc,
         (case when c.record_turns_level >= c.record_level - 1 then c.record_turns end) asc nulls last,
         c.record_floor_idx desc, c.updated_at asc
limit 10;
grant select on public.leaderboard_top10 to anon, authenticated;

notify pgrst, 'reload schema';
