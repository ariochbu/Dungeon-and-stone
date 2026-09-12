-- Parche: nuevo campo para ocultar cuentas de prueba/admin del ranking
-- público, sin afectar su capacidad de jugar. Ejecutar en el SQL Editor de
-- un proyecto que ya corrió 0001_init.sql.

alter table public.profiles
  add column if not exists hidden_from_leaderboard boolean not null default false;

-- El trigger ya existente también debe proteger este nuevo campo (solo un
-- admin puede ocultar/mostrar a alguien del ranking).
create or replace function public.protect_profile_privileges()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  acting_role text;
begin
  if auth.uid() is not null then
    select role into acting_role from public.profiles where id = auth.uid();
    if acting_role is distinct from 'admin' then
      new.role := old.role;
      new.is_banned := old.is_banned;
      new.hidden_from_leaderboard := old.hidden_from_leaderboard;
    end if;
  end if;
  return new;
end;
$$;

-- La vista debe recrearse para excluir a quienes tengan el flag activo.
drop view if exists public.leaderboard_top10;
create view public.leaderboard_top10 as
select p.username, c.record_level, c.record_floor_idx, c.updated_at
from public.characters c
join public.profiles p on p.id = c.user_id
where not p.is_banned and not p.hidden_from_leaderboard
order by c.record_level desc, c.record_floor_idx desc, c.updated_at asc
limit 10;

grant select on public.leaderboard_top10 to anon, authenticated;

-- Oculta la cuenta de pruebas del admin del ranking, tal como se pidió:
update public.profiles set hidden_from_leaderboard = true where username = 'produccion_test';
