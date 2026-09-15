-- Corrige los Guantes que 0021 ya generó con datos equivocados (pedido
-- explícito del 2026-09-16, tras revisar qué stat/penetración usa cada
-- senda de verdad para hacer daño):
--   - Mago/Sacerdote escalan su daño con ESPÍRITU, no Habilidad — sus
--     guantes daban Habilidad (solo útil para crítico/evasión/MP, no para
--     pegar más fuerte). Ahora dan Espíritu.
--   - Asesino sigue dando Habilidad en sus guantes (su fórmula real
--     promedia Físico+Habilidad, no se puede repartir un bono entre dos
--     stats) pero su daño es 100% físico (dmgType 'fisico' en sus 3
--     habilidades) — su penetración de rango A debía ser de armadura
--     física, no de resistencia mágica (que nunca hacía nada para él).
-- Guerrero y Arquero no cambian.
--
-- Solo toca el slot 'guantes' — el resto del equipo (casco/armadura/
-- botas/amuleto) ya quedó bien con 0021, no hace falta recalibrarlo de
-- nuevo. Ejecutar en el SQL Editor de un proyecto que ya corrió 0001-0021.

begin;

create or replace function pg_temp.ds_fix_guantes(item jsonb, style_id text)
returns jsonb
language plpgsql
as $$
declare
  catalog jsonb := '{
    "pesada": {
      "comun":     {"name":"Manoplas de piedra",  "bonus":{"stat":"fis","value":5}},
      "poco_comun":{"name":"Manoplas de bronce",  "bonus":{"stat":"fis","value":8},  "specials":[{"type":"aumento_dano","value":0.05,"text":"de aumento de daño"}]},
      "raro":      {"name":"Manoplas de plata",   "bonus":{"stat":"fis","value":12}, "specials":[{"type":"aumento_dano","value":0.08,"text":"de aumento de daño"}]},
      "rango_b":   {"name":"Manoplas de oro",     "bonus":{"stat":"fis","value":16}, "specials":[{"type":"aumento_dano","value":0.12,"text":"de aumento de daño"}]},
      "rango_a":   {"name":"Manoplas de platino", "bonus":{"stat":"fis","value":20}, "specials":[{"type":"aumento_dano","value":0.12,"text":"de aumento de daño"},{"type":"penetracion_armadura","value":0.05,"text":"de penetración de armadura física"}]}
    },
    "doblefilo": {
      "comun":     {"name":"Zarpas de piedra",  "bonus":{"stat":"hab","value":5}},
      "poco_comun":{"name":"Zarpas de bronce",  "bonus":{"stat":"hab","value":8},  "specials":[{"type":"aumento_dano","value":0.05,"text":"de aumento de daño"}]},
      "raro":      {"name":"Zarpas de plata",   "bonus":{"stat":"hab","value":12}, "specials":[{"type":"aumento_dano","value":0.08,"text":"de aumento de daño"}]},
      "rango_b":   {"name":"Zarpas de oro",     "bonus":{"stat":"hab","value":16}, "specials":[{"type":"aumento_dano","value":0.12,"text":"de aumento de daño"}]},
      "rango_a":   {"name":"Zarpas de platino", "bonus":{"stat":"hab","value":20}, "specials":[{"type":"aumento_dano","value":0.12,"text":"de aumento de daño"},{"type":"penetracion_armadura","value":0.05,"text":"de penetración de armadura física"}]}
    },
    "tirador": {
      "comun":     {"name":"Guantes de piedra",  "bonus":{"stat":"fis","value":5}},
      "poco_comun":{"name":"Guantes de bronce",  "bonus":{"stat":"fis","value":8},  "specials":[{"type":"aumento_dano","value":0.05,"text":"de aumento de daño"}]},
      "raro":      {"name":"Guantes de plata",   "bonus":{"stat":"fis","value":12}, "specials":[{"type":"aumento_dano","value":0.08,"text":"de aumento de daño"}]},
      "rango_b":   {"name":"Guantes de oro",     "bonus":{"stat":"fis","value":16}, "specials":[{"type":"aumento_dano","value":0.12,"text":"de aumento de daño"}]},
      "rango_a":   {"name":"Guantes de platino", "bonus":{"stat":"fis","value":20}, "specials":[{"type":"aumento_dano","value":0.12,"text":"de aumento de daño"},{"type":"penetracion_armadura","value":0.05,"text":"de penetración de armadura física"}]}
    },
    "mago": {
      "comun":     {"name":"Mitones de piedra",  "bonus":{"stat":"esp","value":5}},
      "poco_comun":{"name":"Mitones de bronce",  "bonus":{"stat":"esp","value":8},  "specials":[{"type":"aumento_dano","value":0.05,"text":"de aumento de daño"}]},
      "raro":      {"name":"Mitones de plata",   "bonus":{"stat":"esp","value":12}, "specials":[{"type":"aumento_dano","value":0.08,"text":"de aumento de daño"}]},
      "rango_b":   {"name":"Mitones de oro",     "bonus":{"stat":"esp","value":16}, "specials":[{"type":"aumento_dano","value":0.12,"text":"de aumento de daño"}]},
      "rango_a":   {"name":"Mitones de platino", "bonus":{"stat":"esp","value":20}, "specials":[{"type":"aumento_dano","value":0.12,"text":"de aumento de daño"},{"type":"penetracion_magica","value":0.05,"text":"de penetración de resistencia mágica"}]}
    },
    "sacerdote": {
      "comun":     {"name":"Vendas de piedra",  "bonus":{"stat":"esp","value":5}},
      "poco_comun":{"name":"Vendas de bronce",  "bonus":{"stat":"esp","value":8},  "specials":[{"type":"aumento_dano","value":0.05,"text":"de aumento de daño"}]},
      "raro":      {"name":"Vendas de plata",   "bonus":{"stat":"esp","value":12}, "specials":[{"type":"aumento_dano","value":0.08,"text":"de aumento de daño"}]},
      "rango_b":   {"name":"Vendas de oro",     "bonus":{"stat":"esp","value":16}, "specials":[{"type":"aumento_dano","value":0.12,"text":"de aumento de daño"}]},
      "rango_a":   {"name":"Vendas de platino", "bonus":{"stat":"esp","value":20}, "specials":[{"type":"aumento_dano","value":0.12,"text":"de aumento de daño"},{"type":"penetracion_magica","value":0.05,"text":"de penetración de resistencia mágica"}]}
    }
  }'::jsonb;
  entry jsonb;
  result jsonb;
begin
  if item is null or jsonb_typeof(item) <> 'object' then return item; end if;
  if item->>'kind' <> 'equip' or item->>'slot' <> 'guantes' then return item; end if;
  if style_id = 'canalizador' then style_id := 'mago'; end if;
  if style_id is null then return item; end if;

  entry := catalog #> array[style_id, coalesce(item->>'rarity','comun')];
  if entry is null then return item; end if;

  result := jsonb_build_object(
    'kind', 'equip', 'slot', 'guantes', 'name', entry->>'name',
    'rarity', coalesce(item->>'rarity','comun'), 'styleId', style_id
  );
  if entry ? 'bonus' then result := result || jsonb_build_object('bonus', entry->'bonus'); end if;
  if entry ? 'specials' then result := result || jsonb_build_object('specials', entry->'specials'); end if;
  if item ? 'uid' then result := result || jsonb_build_object('uid', item->'uid'); end if;
  return result;
end;
$$;

update public.characters c
set inventory = coalesce((
  select jsonb_agg(pg_temp.ds_fix_guantes(elem, c.style))
  from jsonb_array_elements(c.inventory) elem
), '[]'::jsonb)
where jsonb_typeof(c.inventory) = 'array';

update public.characters c
set stash = jsonb_set(
  stash, '{items}',
  coalesce((
    select jsonb_agg(pg_temp.ds_fix_guantes(elem, c.style))
    from jsonb_array_elements(c.stash->'items') elem
  ), '[]'::jsonb)
)
where jsonb_typeof(c.stash->'items') = 'array';

update public.characters c
set equip = jsonb_set(c.equip, '{guantes}', coalesce(pg_temp.ds_fix_guantes(c.equip->'guantes', c.style), 'null'::jsonb))
where jsonb_typeof(c.equip) = 'object';

update public.character_allies a
set equip = jsonb_set(
  coalesce(a.equip, '{}'::jsonb), '{guantes}',
  coalesce(pg_temp.ds_fix_guantes(a.equip->'guantes', case a.role when 'guerrero' then 'pesada' when 'arquero' then 'tirador' when 'asesino' then 'doblefilo' when 'mago' then 'mago' when 'sacerdote' then 'sacerdote' end), 'null'::jsonb)
);

commit;
