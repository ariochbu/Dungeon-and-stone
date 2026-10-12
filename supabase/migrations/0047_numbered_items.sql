-- Piezas numeradas de Rango SS (ariochbu, 2026-10-11).
-- Cien piezas con nombre propio. Cada una tiene UN solo dueño por modo de juego (normal, hardmode, inmortal).
-- El dueño es un personaje: si el personaje se borra (a mano o al morir en Inmortal), la fila se borra con él
-- y la pieza vuelve a estar libre. El cliente no puede insertar ni cambiar filas: solo reclamar con la función.
create table if not exists public.numbered_items (
  mode text not null check (mode in ('normal','hardmode','inmortal')),
  num int not null check (num between 1 and 100),
  character_id uuid not null references public.characters(id) on delete cascade,
  user_id uuid not null,
  nickname text not null,
  source text not null default 'rift',
  claimed_at timestamptz not null default now(),
  primary key (mode, num)
);
create index if not exists numbered_items_character_idx on public.numbered_items (character_id);
create index if not exists numbered_items_claimed_idx on public.numbered_items (claimed_at);

alter table public.numbered_items enable row level security;
drop policy if exists "numbered_items: todos leen" on public.numbered_items;
create policy "numbered_items: todos leen" on public.numbered_items
  for select to authenticated using (true);

-- Reclama una pieza libre de entre las candidatas, para el modo del personaje. Devuelve su número,
-- o null si todas las candidatas ya tienen dueño en ese modo.
create or replace function public.claim_numbered_item(p_character_id uuid, p_candidates int[], p_source text default 'rift')
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_char record;
  v_num int;
begin
  select id, user_id, nickname, game_mode into v_char
    from public.characters where id = p_character_id and user_id = auth.uid();
  if v_char is null then raise exception 'No autorizado.'; end if;
  if p_candidates is null or array_length(p_candidates, 1) is null then return null; end if;
  for v_num in
    select c from unnest(p_candidates) as c
     where c between 1 and 100
       and not exists (select 1 from public.numbered_items n where n.mode = v_char.game_mode and n.num = c)
     order by random()
  loop
    begin
      insert into public.numbered_items (mode, num, character_id, user_id, nickname, source)
        values (v_char.game_mode, v_num, v_char.id, v_char.user_id, v_char.nickname, coalesce(p_source, 'rift'));
      return v_num;
    exception when unique_violation then
      -- otro jugador la reclamó en el mismo instante: se prueba con la siguiente
      continue;
    end;
  end loop;
  return null;
end;
$$;
revoke all on function public.claim_numbered_item(uuid, int[], text) from public;
grant execute on function public.claim_numbered_item(uuid, int[], text) to authenticated;
