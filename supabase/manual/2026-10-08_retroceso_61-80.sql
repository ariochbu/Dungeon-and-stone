-- ============================================================================
-- Retroceso del avance en los pisos 61-80 (pedido de ariochbu, 2026-10-08).
-- Los pisos 61-80 se publicaron el 2026-10-08 a las 09:19 y se jugaron mientras
-- se estaban rehaciendo. No existe copia de ese momento, así que esto RECORTA
-- el avance; no restaura objetos ni oro.
--
-- SE CORRE A MANO en el editor SQL de Supabase, bloque por bloque y en orden.
-- Correrlo DESPUÉS de publicar la versión del juego que cierra los pisos
-- (game.js v293): una pestaña vieja abierta volvería a guardar el avance.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- BLOQUE 0 — CONSULTA (no cambia nada). A quién afectaría cada bloque.
-- ----------------------------------------------------------------------------
select c.nickname, p.username, c.race, c.style, c.level,
       c.checkpoint_level, c.max_level_unlocked, c.record_level, c.record_floor_idx,
       c.bosses_beaten, (c.dungeon->>'level')::int as piso_en_curso, c.updated_at
from public.characters c
join public.profiles p on p.id = c.user_id
where c.checkpoint_level > 61 or c.max_level_unlocked > 61 or c.record_level > 60
   or c.bosses_beaten > 6 or c.level > 60 or (c.dungeon->>'level')::int > 60
order by c.record_level desc, c.level desc;

select a.name, a.level, c.nickname
from public.character_allies a
join public.characters c on c.id = a.character_id
where a.level > 60
order by a.level desc;


-- ----------------------------------------------------------------------------
-- BLOQUE 1 — RECORTE DEL AVANCE EN EL LABERINTO.
-- Deja a cada personaje como quien acaba de vencer a Storm Gush:
--   punto de control y nivel desbloqueado: como mucho 61
--   récord: como mucho nivel 60, piso 8 (el guardián del 60)
--   jefes de década vencidos: como mucho 6
--   partida en curso dentro de un piso 61+: se descarta (vuelve a la ciudad)
-- Los turnos del ranking que eran de un guardián 61+ se borran (no hay forma
-- de recuperar los que tenía antes).
-- No toca nivel de personaje, equipo, oro, Caídos ni títulos.
-- ----------------------------------------------------------------------------
begin;

-- Las reglas que impiden bajar el progreso se apagan solo dentro de esta transacción.
alter table public.characters disable trigger trg_validate_character_update;
alter table public.characters disable trigger characters_guard_bosses_beaten;

update public.characters
set checkpoint_level   = least(checkpoint_level, 61),
    max_level_unlocked = least(max_level_unlocked, 61),
    record_floor_idx   = case when record_level > 60 then 8 else record_floor_idx end,
    record_level       = least(record_level, 60),
    record_turns       = case when record_turns_level > 60 then null else record_turns end,
    record_turns_level = case when record_turns_level > 60 then null else record_turns_level end,
    bosses_beaten      = least(bosses_beaten, 6),
    dungeon            = case when (dungeon->>'level')::int > 60 then null else dungeon end
where checkpoint_level > 61 or max_level_unlocked > 61 or record_level > 60
   or bosses_beaten > 6 or record_turns_level > 60 or (dungeon->>'level')::int > 60;

alter table public.characters enable trigger trg_validate_character_update;
alter table public.characters enable trigger characters_guard_bosses_beaten;

commit;


-- ----------------------------------------------------------------------------
-- BLOQUE 2 — RECORTE DEL NIVEL DE PERSONAJE Y DE ALIADOS A 60.
-- Quien pasó de nivel 60 vuelve a nivel 60 con la experiencia en 0. Lo mismo
-- sus aliados. No quita objetos, oro ni piedras de alma ganados.
-- ----------------------------------------------------------------------------
begin;

alter table public.characters disable trigger trg_validate_character_update;
alter table public.character_allies disable trigger trg_validate_ally_update;

update public.characters
set level = 60, xp = 0
where level > 60;

update public.character_allies
set level = 60, xp = 0
where level > 60;

alter table public.characters enable trigger trg_validate_character_update;
alter table public.character_allies enable trigger trg_validate_ally_update;

commit;


-- ----------------------------------------------------------------------------
-- COMPROBACIÓN — debe devolver 0 filas en las dos consultas del BLOQUE 0.
-- ----------------------------------------------------------------------------
