-- Alerta (no ban automático) de posibles trampas: el cliente reporta acá
-- cuando derrota a un jefe de década, o a un guardián de piso de nivel 11
-- en adelante, en 4 turnos propios o menos - a ese ritmo es imposible
-- ganar legítimamente. Los guardianes de los niveles 1-9 no se reportan
-- (esos sí se pueden ganar así de rápido por lo fáciles que son).
-- Deliberadamente NO banea sola: el turno que se compara se cuenta del
-- lado del cliente (combat.turnCount), así que es una señal, no una prueba
-- - un admin revisa el panel y decide si banea de verdad con el botón que
-- ya existe. Ejecutar en el SQL Editor de un proyecto que ya corrió 0001-0016.

create table public.flagged_boss_kills (
  id            uuid primary key default gen_random_uuid(),
  character_id  uuid not null references public.characters(id) on delete cascade,
  user_id       uuid not null references auth.users(id) on delete cascade,
  nickname      text not null,
  kind          text not null check (kind in ('jefe_decada','guardian_piso')),
  dungeon_level int  not null check (dungeon_level between 1 and 60),
  turns         int  not null check (turns between 0 and 20),
  created_at    timestamptz not null default now()
);
alter table public.flagged_boss_kills enable row level security;

-- Cualquier jugador puede insertar una alerta, pero solo sobre su propio
-- personaje y su propia cuenta - no puede reportar (ni por error ni a
-- propósito) a nombre de otro.
create policy "flagged_kills: owner insert"
  on public.flagged_boss_kills for insert
  with check (
    user_id = auth.uid()
    and exists (select 1 from public.characters c where c.id = character_id and c.user_id = auth.uid())
  );

-- Solo un admin puede leer la lista (panel admin).
create policy "flagged_kills: admin select"
  on public.flagged_boss_kills for select
  using (public.is_admin());
