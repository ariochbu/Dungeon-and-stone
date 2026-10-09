-- Elecciones de historia del personaje. Hoy solo el piso 90: perdonar al
-- Carcelero ('perdon') o rematarlo ('muerte'). Forma: {"90": "perdon"}.
-- Sin esta columna el juego guarda la elección solo en el navegador.
-- Ejecutar en el SQL Editor de un proyecto que ya corrió 0001-0041.

alter table public.characters
  add column if not exists story_choices jsonb not null default '{}'::jsonb;
