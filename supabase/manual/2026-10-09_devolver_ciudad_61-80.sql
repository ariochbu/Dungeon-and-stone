-- Devuelve a la ciudad a todos los personajes con una partida en curso dentro
-- de los pisos 61-80 (pedido de ariochbu, 2026-10-09), antes de reabrirlos con
-- los guardianes y el balance nuevos. Solo descarta la partida en curso: no
-- toca nivel, equipo, oro, puntos de control ni récord.
-- SE CORRE A MANO en el editor SQL de Supabase.

-- 1) Consulta (no cambia nada): a quién afecta.
select c.nickname, p.username, c.level, (c.dungeon->>'level')::int as piso_en_curso, c.updated_at
from public.characters c
join public.profiles p on p.id = c.user_id
where (c.dungeon->>'level')::int between 61 and 80
order by piso_en_curso desc;

-- 2) Devolverlos a la ciudad.
update public.characters
set dungeon = null
where (dungeon->>'level')::int between 61 and 80;
