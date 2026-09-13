-- Taberna: reclutar aliados que pelean contigo en el laberinto.
-- Alcance de esta primera versión (a propósito, para no arriesgar el motor
-- de combate entero de una sola vez):
--   - Solo aliados del Gremio/Taberna (pagados, fiables). Los reclutas del
--     laberinto y el riesgo de traición quedan para una siguiente entrega.
--   - Se cobra el costo de contratar una sola vez; el mantenimiento diario/
--     semanal recurrente y el sistema de lealtad/satisfacción también quedan
--     para la siguiente entrega — no se cobra upkeep todavía.
--   - Nivel de personaje 10 como mínimo para entrar a la Taberna.
--   - Hasta 4 aliados a la vez (5 contándote a ti).
-- Ejecutar en el SQL Editor de un proyecto que ya corrió 0001-0008.

create table public.character_allies (
  id            uuid primary key default gen_random_uuid(),
  character_id  uuid not null references public.characters(id) on delete cascade,
  template_id   text not null,
  role          text not null check (role in ('guerrero','arquero','asesino','mago','sacerdote')),
  name          text not null,
  level         int  not null default 1 check (level between 1 and 60),
  xp            int  not null default 0 check (xp >= 0),
  created_at    timestamptz not null default now()
);
alter table public.character_allies enable row level security;

create policy "allies: owner select"
  on public.character_allies for select
  using (exists (select 1 from public.characters c where c.id = character_id and c.user_id = auth.uid()));
create policy "allies: admins select all"
  on public.character_allies for select
  using (public.is_admin());

create or replace function public.hire_ally(p_character_id uuid, p_template_id text, p_role text, p_name text, p_cost int)
returns public.character_allies
language plpgsql
security definer
set search_path = public
as $$
declare
  v_char record;
  v_count int;
  v_row public.character_allies;
begin
  select * into v_char from public.characters where id = p_character_id and user_id = auth.uid();
  if v_char is null then raise exception 'No autorizado.'; end if;
  if v_char.level < 10 then raise exception 'Necesitas nivel 10 para acceder a la Taberna.'; end if;
  if p_role not in ('guerrero','arquero','asesino','mago','sacerdote') then raise exception 'Rol inválido.'; end if;

  select count(*) into v_count from public.character_allies where character_id = p_character_id;
  if v_count >= 4 then raise exception 'Ya tienes el máximo de 4 aliados.'; end if;
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

create or replace function public.dismiss_ally(p_ally_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.character_allies a
  using public.characters c
  where a.id = p_ally_id and a.character_id = c.id and c.user_id = auth.uid();
end;
$$;
grant execute on function public.dismiss_ally(uuid) to authenticated;

-- El nivel del aliado sube con xp propia, ganada en combate; se guarda con
-- el mismo trato "cliente calcula, servidor valida límites" que el resto del
-- juego.
create or replace function public.validate_ally_update()
returns trigger
language plpgsql
as $$
begin
  if new.character_id <> old.character_id then raise exception 'character_id es inmutable'; end if;
  if new.template_id <> old.template_id then raise exception 'template_id es inmutable'; end if;
  if new.role <> old.role then raise exception 'el rol del aliado es inmutable'; end if;
  if new.level < old.level then raise exception 'el nivel del aliado no puede bajar'; end if;
  if new.level - old.level > 5 then raise exception 'salto de nivel de aliado implausible'; end if;
  return new;
end;
$$;
drop trigger if exists trg_validate_ally_update on public.character_allies;
create trigger trg_validate_ally_update before update on public.character_allies
  for each row execute function public.validate_ally_update();

create policy "allies: owner update xp/level"
  on public.character_allies for update
  using (exists (select 1 from public.characters c where c.id = character_id and c.user_id = auth.uid()))
  with check (exists (select 1 from public.characters c where c.id = character_id and c.user_id = auth.uid()));
