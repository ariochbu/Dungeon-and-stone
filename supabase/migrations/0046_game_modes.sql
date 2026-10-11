-- Modos de juego (ariochbu, 2026-10-11): HardMode e Inmortal.
-- game_mode se fija una sola vez, al crear el personaje, y solo si la cuenta ya tiene un personaje que
-- venció al jefe del piso 100. El cliente no puede cambiar la columna por su cuenta.
-- En Inmortal, al caer, el personaje se borra (lo hace el cliente con el borrado de siempre).
alter table public.characters add column if not exists game_mode text not null default 'normal';
alter table public.characters drop constraint if exists characters_game_mode_check;
update public.characters set game_mode = 'normal' where game_mode not in ('normal','hardmode','inmortal');
alter table public.characters add constraint characters_game_mode_check check (game_mode in ('normal','hardmode','inmortal'));

create or replace function public.guard_character_mode()
returns trigger
language plpgsql
as $$
begin
  if new.game_mode is distinct from old.game_mode
     and coalesce(current_setting('ds.mode_rpc', true), '') <> '1' then
    new.game_mode := old.game_mode;
  end if;
  return new;
end;
$$;
drop trigger if exists guard_character_mode on public.characters;
create trigger guard_character_mode before update on public.characters
  for each row execute function public.guard_character_mode();

create or replace function public.set_character_mode(p_character_id uuid, p_mode text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_char record;
begin
  if p_mode not in ('hardmode','inmortal') then raise exception 'Modo inválido.'; end if;
  select * into v_char from public.characters where id = p_character_id and user_id = auth.uid();
  if v_char is null then raise exception 'No autorizado.'; end if;
  if v_char.level > 1 or v_char.game_mode <> 'normal' then raise exception 'El modo solo se elige al crear el personaje.'; end if;
  if not exists (select 1 from public.characters where user_id = auth.uid() and bosses_beaten >= 10) then
    raise exception 'Vence al Primer Retornado para desbloquear este modo.';
  end if;
  perform set_config('ds.mode_rpc', '1', true);
  update public.characters set game_mode = p_mode where id = p_character_id;
end;
$$;
grant execute on function public.set_character_mode(uuid, text) to authenticated;

drop function if exists public.fall_character(uuid, int);
