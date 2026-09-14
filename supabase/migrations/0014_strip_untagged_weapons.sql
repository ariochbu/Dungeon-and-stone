-- Limpieza de datos: elimina/desequipa toda arma (slot 'arma' o 'arma2')
-- que quedó sin la marca de rol (styleId) - equipo de combate/cofre
-- generado antes de que ese sistema existiera (generateEquipOfRarity en
-- game.js ya siempre la asigna desde este cambio; las de la tienda ya la
-- llevaban desde el cambio anterior). Es una limpieza de una sola vez, no
-- algo que haya que repetir: ningún arma nueva puede caer sin esta marca.
-- Ejecutar en el SQL Editor de un proyecto que ya corrió 0001-0013.

-- 1) Mochila de cada personaje: saca cualquier arma/arma2 sin styleId.
update public.characters
set inventory = coalesce((
  select jsonb_agg(elem)
  from jsonb_array_elements(inventory) elem
  where not (
    elem->>'kind' = 'equip'
    and elem->>'slot' in ('arma','arma2')
    and not (elem ? 'styleId')
  )
), '[]'::jsonb)
where jsonb_typeof(inventory) = 'array';

-- 2) Hogar de cada personaje (stash->items): mismo criterio.
update public.characters
set stash = jsonb_set(
  stash,
  '{items}',
  coalesce((
    select jsonb_agg(elem)
    from jsonb_array_elements(stash->'items') elem
    where not (
      elem->>'kind' = 'equip'
      and elem->>'slot' in ('arma','arma2')
      and not (elem ? 'styleId')
    )
  ), '[]'::jsonb)
)
where jsonb_typeof(stash->'items') = 'array';

-- 3) Equipado del personaje: desequipa (vuelve a "vacío") cualquier
-- arma/arma2 sin styleId - ya no llevan marca, así que no vale la pena
-- devolverlas a la mochila, se descartan directamente.
update public.characters
set equip = jsonb_set(
  jsonb_set(
    equip,
    '{arma}',
    case
      when jsonb_typeof(equip->'arma') = 'object' and not (equip->'arma' ? 'styleId') then 'null'::jsonb
      else coalesce(equip->'arma', 'null'::jsonb)
    end
  ),
  '{arma2}',
  case
    when jsonb_typeof(equip->'arma2') = 'object' and not (equip->'arma2' ? 'styleId') then 'null'::jsonb
    else coalesce(equip->'arma2', 'null'::jsonb)
  end
)
where jsonb_typeof(equip) = 'object';

-- 4) Equipado de cada aliado: mismo criterio que el punto 3.
update public.character_allies
set equip = jsonb_set(
  jsonb_set(
    coalesce(equip, '{}'::jsonb),
    '{arma}',
    case
      when jsonb_typeof(equip->'arma') = 'object' and not (equip->'arma' ? 'styleId') then 'null'::jsonb
      else coalesce(equip->'arma', 'null'::jsonb)
    end
  ),
  '{arma2}',
  case
    when jsonb_typeof(equip->'arma2') = 'object' and not (equip->'arma2' ? 'styleId') then 'null'::jsonb
    else coalesce(equip->'arma2', 'null'::jsonb)
  end
);
