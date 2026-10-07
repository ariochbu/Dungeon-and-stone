-- Bestiario (2026-10-07): ids de las criaturas que el personaje ya derrotó.
-- Se muestra en Crónicas → Bestiario. Mientras esta columna no exista, el
-- juego guarda el bestiario solo en el navegador del jugador.
alter table public.characters
  add column if not exists bestiary jsonb not null default '[]'::jsonb;

alter table public.characters drop constraint if exists characters_bestiary_check;
alter table public.characters add constraint characters_bestiary_check
  check (jsonb_typeof(bestiary) = 'array' and jsonb_array_length(bestiary) <= 400);
