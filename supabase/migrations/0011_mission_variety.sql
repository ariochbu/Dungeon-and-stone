-- Amplía los tipos de objetivo de misión de 3 a 8. Con solo
-- kill_elites/clear_floors/defeat_guardian, un tablón de 10 misiones caía
-- casi siempre en las mismas 2-3 variantes repetidas sin variedad real.
-- Se agregan: win_battles (cualquier combate ganado en el laberinto),
-- open_chests, rest_bonfires, find_equipment y find_soul_stones. Todos son
-- objetivos de conteo (se avanzan de 1 en 1, igual que los 3 originales),
-- así que caben sin tocar los checks de objective_target (<=20) ni de
-- advance_mission (p_amount<=20).
-- Ejecutar en el SQL Editor de un proyecto que ya corrió 0001-0010.

do $$
declare
  con record;
begin
  for con in
    select conname from pg_constraint
    where conrelid = 'public.character_missions'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) like '%objective_type%'
  loop
    execute format('alter table public.character_missions drop constraint %I', con.conname);
  end loop;
end $$;

alter table public.character_missions add constraint character_missions_objective_type_check
  check (objective_type in (
    'kill_elites','clear_floors','defeat_guardian',
    'win_battles','open_chests','rest_bonfires','find_equipment','find_soul_stones'
  ));
