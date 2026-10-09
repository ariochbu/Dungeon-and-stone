-- La 0008 compara el rango del equipo de una misión contra 'rango_a' usando
-- una lista con los nombres 'rango_s'/'rango_ss', pero el juego llama a esos
-- rangos 'legendario' y 'ss' (y a Raro, 'raro', que tampoco estaba). Un rango
-- que no está en la lista da NULL y la comparación no rechaza nada: una
-- misión con equipo 'legendario' pasaba el control del servidor.
-- Desde el 2026-10-09 el Tier S cae al azar a partir del piso 71, así que el
-- tope de las misiones (Rango A) tiene que cumplirse de verdad.
-- Se conservan 'rango_s'/'rango_ss' por si quedó alguna fila vieja con ese nombre.
-- Ejecutar en el SQL Editor de un proyecto que ya corrió 0001-0039.

create or replace function public.mission_equip_rarity_index(p_rarity text)
returns int
language sql
immutable
as $$
  select case p_rarity
    when 'comun' then 1
    when 'poco_comun' then 2
    when 'raro' then 3
    when 'rango_b' then 4
    when 'rango_a' then 5
    when 'legendario' then 6
    when 'rango_s' then 6
    when 'ss' then 7
    when 'rango_ss' then 7
    else 99  -- rango desconocido: se trata como por encima del tope y se rechaza
  end;
$$;
