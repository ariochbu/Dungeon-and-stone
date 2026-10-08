-- Pisos 61-80 (2026-10-08): el laberinto y el nivel de personaje pasan de 60 a
-- 80. Se deja el tope de la base en 100 (el máximo previsto) para no tener que
-- tocarla en cada década nueva. CORRER ANTES de desplegar la versión del juego
-- que abre el piso 61: si no, el guardado de quien suba a nivel 61 se rechaza.
alter table public.characters drop constraint if exists characters_level_check;
alter table public.characters add constraint characters_level_check check (level between 1 and 100);

alter table public.characters drop constraint if exists characters_max_level_unlocked_check;
alter table public.characters add constraint characters_max_level_unlocked_check check (max_level_unlocked between 1 and 100);

alter table public.characters drop constraint if exists characters_record_level_check;
alter table public.characters add constraint characters_record_level_check check (record_level between 1 and 100);

alter table public.character_allies drop constraint if exists character_allies_level_check;
alter table public.character_allies add constraint character_allies_level_check check (level between 1 and 100);
