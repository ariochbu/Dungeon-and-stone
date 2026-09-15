-- Recalibración completa de equipo general (pedido explícito del
-- 2026-09-16): armadura, casco, botas, guantes y amuleto ("Accesorio" en
-- pantalla — el slot interno sigue llamándose 'amuleto', mismo criterio que
-- el renombre Arma pesada -> Guerrero: solo cambia la etiqueta) pasan a
-- tener nombre y bono propios por senda y por rango (E-A), igual que las
-- armas en 0019. Ver GEAR_CATALOG en game.js para el detalle completo.
--
-- A diferencia de las armas, el equipo general de hoy NUNCA tuvo styleId
-- (era universal — cualquier senda podía usar cualquier casco). Esta
-- migración no puede "adivinar" para qué senda se pensó cada objeto
-- existente, así que la política es: cada objeto se recalibra a la senda
-- ACTUAL de su dueño (characters.style para equip/inventory/stash; el rol
-- del aliado, mapeado a su senda de arma, para character_allies.equip). No
-- se elimina nada — a diferencia de las armas, cada rareza/slot existente
-- siempre tiene un equivalente nuevo.
--
-- Ejecutar en el SQL Editor de un proyecto que ya corrió 0001-0020.
-- Recomendado: mismo respaldo manual que se usó para 0019/0020 antes de
-- correr esto en producción (toca characters.equip/inventory/stash y
-- character_allies.equip de TODOS los personajes existentes).

begin;

create or replace function pg_temp.ds_recalibrate_gear(item jsonb, style_id text)
returns jsonb
language plpgsql
as $$
declare
  catalog jsonb := '{
    "pesada": {
      "casco": {
        "comun":     {"name":"Casco de piedra",   "mods":{"maxhp_flat":15}},
        "poco_comun":{"name":"Casco de bronce",   "mods":{"maxhp_flat":20,"precision":5}},
        "raro":      {"name":"Casco de plata",    "mods":{"maxhp_flat":25,"precision":10}},
        "rango_b":   {"name":"Casco de oro",      "mods":{"maxhp_flat":30,"precision":15}},
        "rango_a":   {"name":"Casco de platino",  "mods":{"maxhp_flat":35,"precision":20}, "specials":[{"type":"aumento_dano","value":0.05,"text":"de aumento de daño"}]}
      },
      "armadura": {
        "comun":     {"name":"Placa de piedra",   "bonus":{"res":"fisico","value":10}},
        "poco_comun":{"name":"Placa de bronce",   "bonus":{"res":"fisico","value":15}, "specials":[{"type":"reduccion_dano","value":0.05,"text":"de reducción de daño recibido"}]},
        "raro":      {"name":"Placa de plata",    "bonus":{"res":"fisico","value":20}, "specials":[{"type":"reduccion_dano","value":0.08,"text":"de reducción de daño recibido"}]},
        "rango_b":   {"name":"Placa de oro",      "bonus":{"res":"fisico","value":25}, "specials":[{"type":"reduccion_dano","value":0.12,"text":"de reducción de daño recibido"}]},
        "rango_a":   {"name":"Placa de platino",  "bonus":{"res":"fisico","value":30}, "specials":[{"type":"reduccion_dano","value":0.12,"text":"de reducción de daño recibido"},{"type":"bloqueo","chance":0.05,"text":"de bloquear ataque"}]}
      },
      "botas": {
        "comun":     {"name":"Grevas de piedra",  "mods":{"res_magica":10}},
        "poco_comun":{"name":"Grevas de bronce",  "mods":{"res_magica":15,"resistencia_estado":5}},
        "raro":      {"name":"Grevas de plata",   "mods":{"res_magica":20,"resistencia_estado":8}},
        "rango_b":   {"name":"Grevas de oro",     "mods":{"res_magica":25,"resistencia_estado":12}},
        "rango_a":   {"name":"Grevas de platino", "mods":{"res_magica":30,"resistencia_estado":12}, "specials":[{"type":"evasion_flat","value":0.05,"text":"de evasión"}]}
      },
      "guantes": {
        "comun":     {"name":"Manoplas de piedra",  "bonus":{"stat":"fis","value":5}},
        "poco_comun":{"name":"Manoplas de bronce",  "bonus":{"stat":"fis","value":8},  "specials":[{"type":"aumento_dano","value":0.05,"text":"de aumento de daño"}]},
        "raro":      {"name":"Manoplas de plata",   "bonus":{"stat":"fis","value":12}, "specials":[{"type":"aumento_dano","value":0.08,"text":"de aumento de daño"}]},
        "rango_b":   {"name":"Manoplas de oro",     "bonus":{"stat":"fis","value":16}, "specials":[{"type":"aumento_dano","value":0.12,"text":"de aumento de daño"}]},
        "rango_a":   {"name":"Manoplas de platino", "bonus":{"stat":"fis","value":20}, "specials":[{"type":"aumento_dano","value":0.12,"text":"de aumento de daño"},{"type":"penetracion_armadura","value":0.05,"text":"de penetración de armadura física"}]}
      },
      "amuleto": {
        "comun":     {"name":"Talismán roto",               "mods":{"fortaleza_mental":5}},
        "poco_comun":{"name":"Talismán",                    "mods":{"fortaleza_mental":8,"mp_flat":5}},
        "raro":      {"name":"Talismán imbuido con magia",  "mods":{"fortaleza_mental":12,"mp_flat":10}},
        "rango_b":   {"name":"Talismán de sangre",          "mods":{"fortaleza_mental":15,"mp_flat":15}},
        "rango_a":   {"name":"Talismán despertado",         "mods":{"fortaleza_mental":18,"mp_flat":15,"espiritu_flat":5}}
      }
    },
    "doblefilo": {
      "casco": {
        "comun":     {"name":"Máscara de piedra",   "mods":{"maxhp_flat":15}},
        "poco_comun":{"name":"Máscara de bronce",   "mods":{"maxhp_flat":20,"precision":5}},
        "raro":      {"name":"Máscara de plata",    "mods":{"maxhp_flat":25,"precision":10}},
        "rango_b":   {"name":"Máscara de oro",      "mods":{"maxhp_flat":30,"precision":15}},
        "rango_a":   {"name":"Máscara de platino",  "mods":{"maxhp_flat":35,"precision":20}, "specials":[{"type":"aumento_dano","value":0.05,"text":"de aumento de daño"}]}
      },
      "armadura": {
        "comun":     {"name":"Manto de piedra",   "bonus":{"res":"fisico","value":10}},
        "poco_comun":{"name":"Manto de bronce",   "bonus":{"res":"fisico","value":15}, "specials":[{"type":"reduccion_dano","value":0.05,"text":"de reducción de daño recibido"}]},
        "raro":      {"name":"Manto de plata",    "bonus":{"res":"fisico","value":20}, "specials":[{"type":"reduccion_dano","value":0.08,"text":"de reducción de daño recibido"}]},
        "rango_b":   {"name":"Manto de oro",      "bonus":{"res":"fisico","value":25}, "specials":[{"type":"reduccion_dano","value":0.12,"text":"de reducción de daño recibido"}]},
        "rango_a":   {"name":"Manto de platino",  "bonus":{"res":"fisico","value":30}, "specials":[{"type":"reduccion_dano","value":0.12,"text":"de reducción de daño recibido"},{"type":"bloqueo","chance":0.05,"text":"de bloquear ataque"}]}
      },
      "botas": {
        "comun":     {"name":"Zapatillas de piedra",  "mods":{"res_magica":10}},
        "poco_comun":{"name":"Zapatillas de bronce",  "mods":{"res_magica":15,"resistencia_estado":5}},
        "raro":      {"name":"Zapatillas de plata",   "mods":{"res_magica":20,"resistencia_estado":8}},
        "rango_b":   {"name":"Zapatillas de oro",     "mods":{"res_magica":25,"resistencia_estado":12}},
        "rango_a":   {"name":"Zapatillas de platino", "mods":{"res_magica":30,"resistencia_estado":12}, "specials":[{"type":"evasion_flat","value":0.05,"text":"de evasión"}]}
      },
      "guantes": {
        "comun":     {"name":"Zarpas de piedra",  "bonus":{"stat":"hab","value":5}},
        "poco_comun":{"name":"Zarpas de bronce",  "bonus":{"stat":"hab","value":8},  "specials":[{"type":"aumento_dano","value":0.05,"text":"de aumento de daño"}]},
        "raro":      {"name":"Zarpas de plata",   "bonus":{"stat":"hab","value":12}, "specials":[{"type":"aumento_dano","value":0.08,"text":"de aumento de daño"}]},
        "rango_b":   {"name":"Zarpas de oro",     "bonus":{"stat":"hab","value":16}, "specials":[{"type":"aumento_dano","value":0.12,"text":"de aumento de daño"}]},
        "rango_a":   {"name":"Zarpas de platino", "bonus":{"stat":"hab","value":20}, "specials":[{"type":"aumento_dano","value":0.12,"text":"de aumento de daño"},{"type":"penetracion_magica","value":0.05,"text":"de penetración de resistencia mágica"}]}
      },
      "amuleto": {
        "comun":     {"name":"Anillo roto",               "mods":{"fortaleza_mental":5}},
        "poco_comun":{"name":"Anillo",                    "mods":{"fortaleza_mental":8,"mp_flat":5}},
        "raro":      {"name":"Anillo imbuido con magia",  "mods":{"fortaleza_mental":12,"mp_flat":10}},
        "rango_b":   {"name":"Anillo de sangre",          "mods":{"fortaleza_mental":15,"mp_flat":15}},
        "rango_a":   {"name":"Anillo despertado",         "mods":{"fortaleza_mental":18,"mp_flat":15,"espiritu_flat":5}}
      }
    },
    "tirador": {
      "casco": {
        "comun":     {"name":"Capucha de piedra",   "mods":{"maxhp_flat":15}},
        "poco_comun":{"name":"Capucha de bronce",   "mods":{"maxhp_flat":20,"precision":5}},
        "raro":      {"name":"Capucha de plata",    "mods":{"maxhp_flat":25,"precision":10}},
        "rango_b":   {"name":"Capucha de oro",      "mods":{"maxhp_flat":30,"precision":15}},
        "rango_a":   {"name":"Capucha de platino",  "mods":{"maxhp_flat":35,"precision":20}, "specials":[{"type":"aumento_dano","value":0.05,"text":"de aumento de daño"}]}
      },
      "armadura": {
        "comun":     {"name":"Cota de piedra",   "bonus":{"res":"fisico","value":10}},
        "poco_comun":{"name":"Cota de bronce",   "bonus":{"res":"fisico","value":15}, "specials":[{"type":"reduccion_dano","value":0.05,"text":"de reducción de daño recibido"}]},
        "raro":      {"name":"Cota de plata",    "bonus":{"res":"fisico","value":20}, "specials":[{"type":"reduccion_dano","value":0.08,"text":"de reducción de daño recibido"}]},
        "rango_b":   {"name":"Cota de oro",      "bonus":{"res":"fisico","value":25}, "specials":[{"type":"reduccion_dano","value":0.12,"text":"de reducción de daño recibido"}]},
        "rango_a":   {"name":"Cota de platino",  "bonus":{"res":"fisico","value":30}, "specials":[{"type":"reduccion_dano","value":0.12,"text":"de reducción de daño recibido"},{"type":"bloqueo","chance":0.05,"text":"de bloquear ataque"}]}
      },
      "botas": {
        "comun":     {"name":"Botas de piedra",  "mods":{"res_magica":10}},
        "poco_comun":{"name":"Botas de bronce",  "mods":{"res_magica":15,"resistencia_estado":5}},
        "raro":      {"name":"Botas de plata",   "mods":{"res_magica":20,"resistencia_estado":8}},
        "rango_b":   {"name":"Botas de oro",     "mods":{"res_magica":25,"resistencia_estado":12}},
        "rango_a":   {"name":"Botas de platino", "mods":{"res_magica":30,"resistencia_estado":12}, "specials":[{"type":"evasion_flat","value":0.05,"text":"de evasión"}]}
      },
      "guantes": {
        "comun":     {"name":"Guantes de piedra",  "bonus":{"stat":"fis","value":5}},
        "poco_comun":{"name":"Guantes de bronce",  "bonus":{"stat":"fis","value":8},  "specials":[{"type":"aumento_dano","value":0.05,"text":"de aumento de daño"}]},
        "raro":      {"name":"Guantes de plata",   "bonus":{"stat":"fis","value":12}, "specials":[{"type":"aumento_dano","value":0.08,"text":"de aumento de daño"}]},
        "rango_b":   {"name":"Guantes de oro",     "bonus":{"stat":"fis","value":16}, "specials":[{"type":"aumento_dano","value":0.12,"text":"de aumento de daño"}]},
        "rango_a":   {"name":"Guantes de platino", "bonus":{"stat":"fis","value":20}, "specials":[{"type":"aumento_dano","value":0.12,"text":"de aumento de daño"},{"type":"penetracion_armadura","value":0.05,"text":"de penetración de armadura física"}]}
      },
      "amuleto": {
        "comun":     {"name":"Amuleto roto",               "mods":{"fortaleza_mental":5}},
        "poco_comun":{"name":"Amuleto",                    "mods":{"fortaleza_mental":8,"mp_flat":5}},
        "raro":      {"name":"Amuleto imbuido con magia",  "mods":{"fortaleza_mental":12,"mp_flat":10}},
        "rango_b":   {"name":"Amuleto de sangre",          "mods":{"fortaleza_mental":15,"mp_flat":15}},
        "rango_a":   {"name":"Amuleto despertado",         "mods":{"fortaleza_mental":18,"mp_flat":15,"espiritu_flat":5}}
      }
    },
    "mago": {
      "casco": {
        "comun":     {"name":"Diadema de piedra",   "mods":{"maxhp_flat":15}},
        "poco_comun":{"name":"Diadema de bronce",   "mods":{"maxhp_flat":20,"precision":5}},
        "raro":      {"name":"Diadema de plata",    "mods":{"maxhp_flat":25,"precision":10}},
        "rango_b":   {"name":"Diadema de oro",      "mods":{"maxhp_flat":30,"precision":15}},
        "rango_a":   {"name":"Diadema de platino",  "mods":{"maxhp_flat":35,"precision":20}, "specials":[{"type":"aumento_dano","value":0.05,"text":"de aumento de daño"}]}
      },
      "armadura": {
        "comun":     {"name":"Túnica de piedra",   "bonus":{"res":"fisico","value":10}},
        "poco_comun":{"name":"Túnica de bronce",   "bonus":{"res":"fisico","value":15}, "specials":[{"type":"reduccion_dano","value":0.05,"text":"de reducción de daño recibido"}]},
        "raro":      {"name":"Túnica de plata",    "bonus":{"res":"fisico","value":20}, "specials":[{"type":"reduccion_dano","value":0.08,"text":"de reducción de daño recibido"}]},
        "rango_b":   {"name":"Túnica de oro",      "bonus":{"res":"fisico","value":25}, "specials":[{"type":"reduccion_dano","value":0.12,"text":"de reducción de daño recibido"}]},
        "rango_a":   {"name":"Túnica de platino",  "bonus":{"res":"fisico","value":30}, "specials":[{"type":"reduccion_dano","value":0.12,"text":"de reducción de daño recibido"},{"type":"bloqueo","chance":0.05,"text":"de bloquear ataque"}]}
      },
      "botas": {
        "comun":     {"name":"Sandalias de piedra",  "mods":{"res_magica":10}},
        "poco_comun":{"name":"Sandalias de bronce",  "mods":{"res_magica":15,"resistencia_estado":5}},
        "raro":      {"name":"Sandalias de plata",   "mods":{"res_magica":20,"resistencia_estado":8}},
        "rango_b":   {"name":"Sandalias de oro",     "mods":{"res_magica":25,"resistencia_estado":12}},
        "rango_a":   {"name":"Sandalias de platino", "mods":{"res_magica":30,"resistencia_estado":12}, "specials":[{"type":"evasion_flat","value":0.05,"text":"de evasión"}]}
      },
      "guantes": {
        "comun":     {"name":"Mitones de piedra",  "bonus":{"stat":"hab","value":5}},
        "poco_comun":{"name":"Mitones de bronce",  "bonus":{"stat":"hab","value":8},  "specials":[{"type":"aumento_dano","value":0.05,"text":"de aumento de daño"}]},
        "raro":      {"name":"Mitones de plata",   "bonus":{"stat":"hab","value":12}, "specials":[{"type":"aumento_dano","value":0.08,"text":"de aumento de daño"}]},
        "rango_b":   {"name":"Mitones de oro",     "bonus":{"stat":"hab","value":16}, "specials":[{"type":"aumento_dano","value":0.12,"text":"de aumento de daño"}]},
        "rango_a":   {"name":"Mitones de platino", "bonus":{"stat":"hab","value":20}, "specials":[{"type":"aumento_dano","value":0.12,"text":"de aumento de daño"},{"type":"penetracion_magica","value":0.05,"text":"de penetración de resistencia mágica"}]}
      },
      "amuleto": {
        "comun":     {"name":"Libro roto",               "mods":{"fortaleza_mental":5}},
        "poco_comun":{"name":"Libro",                    "mods":{"fortaleza_mental":8,"mp_flat":5}},
        "raro":      {"name":"Libro imbuido con magia",  "mods":{"fortaleza_mental":12,"mp_flat":10}},
        "rango_b":   {"name":"Libro de sangre",          "mods":{"fortaleza_mental":15,"mp_flat":15}},
        "rango_a":   {"name":"Libro despertado",         "mods":{"fortaleza_mental":18,"mp_flat":15,"espiritu_flat":5}}
      }
    },
    "sacerdote": {
      "casco": {
        "comun":     {"name":"Corona de piedra",   "mods":{"maxhp_flat":15}},
        "poco_comun":{"name":"Corona de bronce",   "mods":{"maxhp_flat":20,"precision":5}},
        "raro":      {"name":"Corona de plata",    "mods":{"maxhp_flat":25,"precision":10}},
        "rango_b":   {"name":"Corona de oro",      "mods":{"maxhp_flat":30,"precision":15}},
        "rango_a":   {"name":"Corona de platino",  "mods":{"maxhp_flat":35,"precision":20}, "specials":[{"type":"aumento_dano","value":0.05,"text":"de aumento de daño"}]}
      },
      "armadura": {
        "comun":     {"name":"Sotana de piedra",   "bonus":{"res":"fisico","value":10}},
        "poco_comun":{"name":"Sotana de bronce",   "bonus":{"res":"fisico","value":15}, "specials":[{"type":"reduccion_dano","value":0.05,"text":"de reducción de daño recibido"}]},
        "raro":      {"name":"Sotana de plata",    "bonus":{"res":"fisico","value":20}, "specials":[{"type":"reduccion_dano","value":0.08,"text":"de reducción de daño recibido"}]},
        "rango_b":   {"name":"Sotana de oro",      "bonus":{"res":"fisico","value":25}, "specials":[{"type":"reduccion_dano","value":0.12,"text":"de reducción de daño recibido"}]},
        "rango_a":   {"name":"Sotana de platino",  "bonus":{"res":"fisico","value":30}, "specials":[{"type":"reduccion_dano","value":0.12,"text":"de reducción de daño recibido"},{"type":"bloqueo","chance":0.05,"text":"de bloquear ataque"}]}
      },
      "botas": {
        "comun":     {"name":"Alpargatas de piedra",  "mods":{"res_magica":10}},
        "poco_comun":{"name":"Alpargatas de bronce",  "mods":{"res_magica":15,"resistencia_estado":5}},
        "raro":      {"name":"Alpargatas de plata",   "mods":{"res_magica":20,"resistencia_estado":8}},
        "rango_b":   {"name":"Alpargatas de oro",     "mods":{"res_magica":25,"resistencia_estado":12}},
        "rango_a":   {"name":"Alpargatas de platino", "mods":{"res_magica":30,"resistencia_estado":12}, "specials":[{"type":"evasion_flat","value":0.05,"text":"de evasión"}]}
      },
      "guantes": {
        "comun":     {"name":"Vendas de piedra",  "bonus":{"stat":"hab","value":5}},
        "poco_comun":{"name":"Vendas de bronce",  "bonus":{"stat":"hab","value":8},  "specials":[{"type":"aumento_dano","value":0.05,"text":"de aumento de daño"}]},
        "raro":      {"name":"Vendas de plata",   "bonus":{"stat":"hab","value":12}, "specials":[{"type":"aumento_dano","value":0.08,"text":"de aumento de daño"}]},
        "rango_b":   {"name":"Vendas de oro",     "bonus":{"stat":"hab","value":16}, "specials":[{"type":"aumento_dano","value":0.12,"text":"de aumento de daño"}]},
        "rango_a":   {"name":"Vendas de platino", "bonus":{"stat":"hab","value":20}, "specials":[{"type":"aumento_dano","value":0.12,"text":"de aumento de daño"},{"type":"penetracion_magica","value":0.05,"text":"de penetración de resistencia mágica"}]}
      },
      "amuleto": {
        "comun":     {"name":"Reliquia rota",              "mods":{"fortaleza_mental":5}},
        "poco_comun":{"name":"Reliquia",                   "mods":{"fortaleza_mental":8,"mp_flat":5}},
        "raro":      {"name":"Reliquia imbuida con fe",    "mods":{"fortaleza_mental":12,"mp_flat":10}},
        "rango_b":   {"name":"Reliquia de sangre",         "mods":{"fortaleza_mental":15,"mp_flat":15}},
        "rango_a":   {"name":"Reliquia despertada",        "mods":{"fortaleza_mental":18,"mp_flat":15,"espiritu_flat":5}}
      }
    }
  }'::jsonb;
  entry jsonb;
  result jsonb;
begin
  if item is null or jsonb_typeof(item) <> 'object' then return item; end if;
  if item->>'kind' <> 'equip' or (item->>'slot') not in ('armadura','casco','botas','guantes','amuleto') then return item; end if;
  if style_id = 'canalizador' then style_id := 'mago'; end if;
  if style_id is null then return item; end if;

  entry := catalog #> array[style_id, item->>'slot', coalesce(item->>'rarity','comun')];
  if entry is null then return item; end if; -- rango desconocido: se deja tal cual, no se inventa nada

  result := jsonb_build_object(
    'kind', 'equip',
    'slot', item->>'slot',
    'name', entry->>'name',
    'rarity', coalesce(item->>'rarity','comun'),
    'styleId', style_id
  );
  if entry ? 'bonus' then result := result || jsonb_build_object('bonus', entry->'bonus'); end if;
  if entry ? 'mods' then result := result || jsonb_build_object('mods', entry->'mods'); end if;
  if entry ? 'specials' then result := result || jsonb_build_object('specials', entry->'specials'); end if;
  if item ? 'uid' then result := result || jsonb_build_object('uid', item->'uid'); end if;
  return result;
end;
$$;

-- 1) Mochila de cada personaje: cada objeto de armadura/casco/botas/
-- guantes/amuleto se recalibra a LA SENDA ACTUAL de ese personaje (ver nota
-- de política arriba). Los demás objetos (armas, pociones, piedras) pasan
-- intactos — ds_recalibrate_gear() los devuelve sin tocar.
update public.characters c
set inventory = coalesce((
  select jsonb_agg(pg_temp.ds_recalibrate_gear(elem, c.style))
  from jsonb_array_elements(c.inventory) elem
), '[]'::jsonb)
where jsonb_typeof(c.inventory) = 'array';

-- 2) Hogar de cada personaje (stash->items).
update public.characters c
set stash = jsonb_set(
  stash,
  '{items}',
  coalesce((
    select jsonb_agg(pg_temp.ds_recalibrate_gear(elem, c.style))
    from jsonb_array_elements(c.stash->'items') elem
  ), '[]'::jsonb)
)
where jsonb_typeof(c.stash->'items') = 'array';

-- 3) Equipado del propio personaje (armadura/casco/botas/guantes/amuleto).
update public.characters c
set equip = jsonb_set(
  jsonb_set(
    jsonb_set(
      jsonb_set(
        jsonb_set(
          c.equip,
          '{armadura}', coalesce(pg_temp.ds_recalibrate_gear(c.equip->'armadura', c.style), 'null'::jsonb)
        ),
        '{casco}', coalesce(pg_temp.ds_recalibrate_gear(c.equip->'casco', c.style), 'null'::jsonb)
      ),
      '{botas}', coalesce(pg_temp.ds_recalibrate_gear(c.equip->'botas', c.style), 'null'::jsonb)
    ),
    '{guantes}', coalesce(pg_temp.ds_recalibrate_gear(c.equip->'guantes', c.style), 'null'::jsonb)
  ),
  '{amuleto}', coalesce(pg_temp.ds_recalibrate_gear(c.equip->'amuleto', c.style), 'null'::jsonb)
)
where jsonb_typeof(c.equip) = 'object';

-- 4) Equipado de cada aliado — la senda es el rol del aliado, no la del
-- jugador (mismo mapeo que ALLY_ROLE_TO_WEAPON_STYLE en game.js).
update public.character_allies a
set equip = jsonb_set(
  jsonb_set(
    jsonb_set(
      jsonb_set(
        jsonb_set(
          coalesce(a.equip, '{}'::jsonb),
          '{armadura}', coalesce(pg_temp.ds_recalibrate_gear(a.equip->'armadura', case a.role when 'guerrero' then 'pesada' when 'arquero' then 'tirador' when 'asesino' then 'doblefilo' when 'mago' then 'mago' when 'sacerdote' then 'sacerdote' end), 'null'::jsonb)
        ),
        '{casco}', coalesce(pg_temp.ds_recalibrate_gear(a.equip->'casco', case a.role when 'guerrero' then 'pesada' when 'arquero' then 'tirador' when 'asesino' then 'doblefilo' when 'mago' then 'mago' when 'sacerdote' then 'sacerdote' end), 'null'::jsonb)
      ),
      '{botas}', coalesce(pg_temp.ds_recalibrate_gear(a.equip->'botas', case a.role when 'guerrero' then 'pesada' when 'arquero' then 'tirador' when 'asesino' then 'doblefilo' when 'mago' then 'mago' when 'sacerdote' then 'sacerdote' end), 'null'::jsonb)
    ),
    '{guantes}', coalesce(pg_temp.ds_recalibrate_gear(a.equip->'guantes', case a.role when 'guerrero' then 'pesada' when 'arquero' then 'tirador' when 'asesino' then 'doblefilo' when 'mago' then 'mago' when 'sacerdote' then 'sacerdote' end), 'null'::jsonb)
  ),
  '{amuleto}', coalesce(pg_temp.ds_recalibrate_gear(a.equip->'amuleto', case a.role when 'guerrero' then 'pesada' when 'arquero' then 'tirador' when 'asesino' then 'doblefilo' when 'mago' then 'mago' when 'sacerdote' then 'sacerdote' end), 'null'::jsonb)
);

-- 5) Progresión automática del Sacerdote (0020): auto_gear_arma2_name ya
-- elegido no cambia, pero si algún aliado Sacerdote ya tenía equipo
-- auto-otorgado de un rango, el paso 4 de arriba ya lo recalibró a la
-- senda 'sacerdote' correctamente (su rol siempre mapea a 'sacerdote').

commit;
