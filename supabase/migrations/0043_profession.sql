-- Profesión del personaje (se elige al nivel 80; dos por senda, p. ej. 'ballestero'
-- o 'francotirador' para el Arquero). Sin esta columna el juego guarda la elección
-- solo en el navegador.
-- Ejecutar en el SQL Editor de un proyecto que ya corrió 0001-0042.

alter table public.characters
  add column if not exists profession text;
