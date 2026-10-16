-- Registro de muertes en el laberinto (2026-10-15): dónde, contra qué y con qué cae la gente, para calibrar
-- con datos reales en vez de suposiciones. El juego inserta una fila en cada caída (reportDeath en game.js);
-- si esta tabla no existe, el juego sigue funcionando y solo avisa en la consola.
-- Ejecutar en el SQL Editor de un proyecto que ya corrió 0001-0047.

create table if not exists public.death_log (
  id             bigserial primary key,
  created_at     timestamptz not null default now(),
  user_id        uuid not null default auth.uid() references auth.users on delete cascade,
  character_id   uuid references public.characters on delete set null,
  mode           text,
  style          text,
  race           text,
  char_level     int,
  dungeon_level  int,
  floor          int,
  node_type      text,
  enemies        jsonb not null default '[]'::jsonb,
  allies         int,
  turns          int,
  gear           jsonb not null default '[]'::jsonb
);

create index if not exists death_log_level_idx on public.death_log (mode, dungeon_level);

alter table public.death_log enable row level security;

-- Cada jugador solo puede anotar sus propias muertes, con un personaje suyo. Nadie las lee desde el juego:
-- se consultan desde el panel de Supabase.
drop policy if exists death_log_insert_own on public.death_log;
create policy death_log_insert_own on public.death_log
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and (character_id is null or exists (select 1 from public.characters c where c.id = character_id and c.user_id = auth.uid()))
  );
