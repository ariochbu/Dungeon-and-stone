-- Caído Mítico (2026-10-07): aviso global cuando alguien lo invoca y
-- distintivo "Elegido del Emperador" visible en los rankings.

-- 1) Avisos. Una fila por personaje y Caído. El cliente inserta la suya tras
--    guardar la invocación; la política exige que el personaje sea suyo y que
--    de verdad tenga ese Caído, y que el Caído sea el Mítico (id 100).
create table if not exists public.mythic_summons (
  character_id uuid not null references public.characters(id) on delete cascade,
  pet_id       int  not null check (pet_id = 100),
  user_id      uuid not null references auth.users(id) on delete cascade,
  nickname     text not null,
  created_at   timestamptz not null default now(),
  primary key (character_id, pet_id)
);
alter table public.mythic_summons enable row level security;

drop policy if exists "mythic_summons: owner insert" on public.mythic_summons;
create policy "mythic_summons: owner insert"
  on public.mythic_summons for insert
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.characters c
      where c.id = mythic_summons.character_id and c.user_id = auth.uid()
        and c.nickname = mythic_summons.nickname
        and jsonb_typeof(c.pets->'owned'->(mythic_summons.pet_id::text)) = 'number'
        and (c.pets->'owned'->>(mythic_summons.pet_id::text))::numeric > 0
    )
  );

drop policy if exists "mythic_summons: everyone reads" on public.mythic_summons;
create policy "mythic_summons: everyone reads"
  on public.mythic_summons for select to authenticated
  using (true);

grant select, insert on public.mythic_summons to authenticated;

-- 2) Rankings: columna has_mythic (al final, para no romper clientes viejos).
create or replace view public.leaderboard_top10 as
select c.nickname, c.record_level, c.record_floor_idx, c.updated_at, c.race, c.style, c.level, c.title_choice,
       c.bosses_beaten, c.first_retornado,
       case when c.record_turns_level >= c.record_level - 1 then c.record_turns end as record_turns,
       (jsonb_typeof(c.pets->'owned'->'100') = 'number' and (c.pets->'owned'->>'100')::numeric > 0) as has_mythic
from public.characters c
join public.profiles p on p.id = c.user_id
where not p.is_banned and not c.hidden_from_leaderboard
order by c.record_level desc,
         (case when c.record_turns_level >= c.record_level - 1 then c.record_turns end) asc nulls last,
         c.record_floor_idx desc, c.updated_at asc
limit 10;
grant select on public.leaderboard_top10 to anon, authenticated;

create or replace view public.leaderboard_caidos_top10 as
select t.nickname, t.caidos, t.race, t.style, t.level, t.record_level, t.title_choice, t.bosses_beaten, t.first_retornado, t.has_mythic
from (
  select c.nickname, c.race, c.style, c.level, c.record_level, c.updated_at, c.title_choice, c.bosses_beaten, c.first_retornado,
    (jsonb_typeof(c.pets->'owned'->'100') = 'number' and (c.pets->'owned'->>'100')::numeric > 0) as has_mythic,
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
