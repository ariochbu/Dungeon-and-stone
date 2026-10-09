-- El set Tier S del Sacerdote se entrega UNA sola vez por personaje: la
-- primera vez que vence a Storm Gush (piso 60). Antes se volvía a entregar a
-- cualquier Sacerdote que no lo tuviera, así que bastaba quitarle el set,
-- despedirlo y reclutarlo otra vez para duplicarlo sin límite.
-- sacerdote_s_granted recuerda que ese personaje ya recibió (o ya perdió) su
-- única entrega. Una vez en true no puede volver a false.
-- Ejecutar en el SQL Editor de un proyecto que ya corrió 0001-0040.

alter table public.characters
  add column if not exists sacerdote_s_granted boolean not null default false;

create or replace function public.characters_guard_sacerdote_s()
returns trigger
language plpgsql
as $$
begin
  if old.sacerdote_s_granted and not new.sacerdote_s_granted then
    new.sacerdote_s_granted := true;
  end if;
  return new;
end;
$$;

drop trigger if exists characters_guard_sacerdote_s on public.characters;
create trigger characters_guard_sacerdote_s
  before update on public.characters
  for each row execute function public.characters_guard_sacerdote_s();

-- Personajes que ya vencieron a Storm Gush antes de este cambio: su entrega
-- ya ocurrió. Se apaga un momento el validador de guardados para que una fila
-- con datos viejos fuera de regla no haga fallar toda la actualización.
begin;
alter table public.characters disable trigger trg_validate_character_update;
update public.characters
set sacerdote_s_granted = true
where checkpoint_level > 60 or bosses_beaten >= 6;
alter table public.characters enable trigger trg_validate_character_update;
commit;
