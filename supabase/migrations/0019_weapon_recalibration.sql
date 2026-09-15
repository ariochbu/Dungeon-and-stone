-- Recalibración completa de armas (pedido explícito del 2026-09-15).
-- Cada arma con nombre propio pasa a tener su propio bono y su propio
-- efecto especial por rango (antes era un bono genérico por senda) - ver
-- WEAPON_CATALOG en game.js para el detalle completo y el porqué de cada
-- número. Esta migración reescribe TODAS las armas que ya existen en la
-- base de datos (equipadas, en mochila, en el hogar) con los nuevos
-- valores, para que nadie se quede con stats de la versión vieja.
--
-- Incluye además el renombre de senda 'canalizador' -> 'mago' (punto 3 del
-- pedido: "para evitar errores al momento de equiparse las armas").
--
-- Cualquier arma que ya no tenga un nombre reconocido en el catálogo nuevo
-- (la única existente hoy es "Reliquia bendita", retirada del pool de
-- Sacerdote sin reemplazo) se ELIMINA directamente — punto 4 del pedido
-- ("si no se pueden modificar... eliminalos").
--
-- Ejecutar en el SQL Editor de un proyecto que ya corrió 0001-0018.
-- Recomendado: confirmar que hay un punto de restauración reciente antes de
-- correrla en producción — toca characters.equip/inventory/stash y
-- character_allies.equip de TODOS los personajes existentes. Todo corre
-- dentro de una sola transacción: si algo falla a mitad de camino, Postgres
-- deshace el resto solo.

begin;

-- 0a) La columna style tiene un check constraint que solo admite los 4 ids
-- viejos (0001_init.sql). Se saca ahora (sin ponerlo de vuelta todavía) para
-- poder escribir 'mago' en el paso 0c - si se agregara la versión nueva del
-- constraint ACÁ, fallaría de inmediato: seguiría habiendo filas en
-- 'canalizador' hasta que 0c corra, y Postgres valida un constraint nuevo
-- contra todas las filas existentes en el momento de agregarlo.
alter table public.characters drop constraint if exists characters_style_check;

-- 0b) create_character() valida la senda contra la misma lista vieja - se
-- actualiza para que un personaje nuevo pueda crearse con 'mago'.
create or replace function public.create_character(p_race text, p_style text, p_nickname text)
returns public.characters
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.characters;
  v_slot int;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  if p_race not in ('barbaro','enano','hada','humano','draconido','bestia') then
    raise exception 'raza inválida';
  end if;
  if p_style not in ('pesada','doblefilo','tirador','mago') then
    raise exception 'senda inválida';
  end if;
  if p_nickname is null or length(trim(p_nickname)) < 3 or length(trim(p_nickname)) > 20 then
    raise exception 'El nombre del personaje debe tener entre 3 y 20 caracteres.';
  end if;
  if p_nickname !~ '^[A-Za-z0-9_]+$' then
    raise exception 'El nombre del personaje solo puede tener letras, números y guion bajo.';
  end if;

  select min(s) into v_slot
  from generate_series(1,6) s
  where s not in (select slot_number from public.characters where user_id = auth.uid());

  if v_slot is null then
    raise exception 'Ya tienes el máximo de 6 personajes.';
  end if;

  insert into public.characters (user_id, slot_number, nickname, race, style, level, xp, gold)
  values (auth.uid(), v_slot, p_nickname, p_race, p_style, 1, 0, 20)
  returning * into v_row;

  return v_row;
end;
$$;

-- 0c) Rango 'canalizador' -> 'mago' en los propios personajes. La senda
-- normalmente es inmutable tras crear el personaje (trg_validate_character_
-- update, ver 0001/0018) - acá es un simple arreglo de nombre interno, no un
-- cambio de senda real, así que desactivamos el trigger solo para esta
-- sentencia y lo volvemos a activar de inmediato.
alter table public.characters disable trigger trg_validate_character_update;
update public.characters set style = 'mago' where style = 'canalizador';
alter table public.characters enable trigger trg_validate_character_update;

-- 0d) Recién ahora, con todas las filas ya en 'mago', se puede agregar la
-- versión nueva y más estricta del constraint sin que falle contra datos
-- viejos.
alter table public.characters add constraint characters_style_check
  check (style in ('pesada','doblefilo','tirador','mago'));

-- 1) Función temporal (pg_temp: vive solo durante esta sesión del SQL
-- Editor, desaparece sola al cerrar la pestaña — no queda nada instalado en
-- el esquema). Recalibra un ítem de arma contra el catálogo nuevo, o
-- devuelve NULL si el nombre/rango ya no existe en él (el llamador se
-- encarga de descartarlo cuando eso pasa). Cualquier ítem que no sea un
-- arma/arma2 equipable pasa intacto, sin tocarlo.
create or replace function pg_temp.ds_recalibrate_weapon(item jsonb)
returns jsonb
language plpgsql
as $$
declare
  catalog jsonb := '{
    "pesada": {"stat":"fis","arma":{
      "Martillo de guerra": {
        "comun":     {"value":12, "specials":[]},
        "poco_comun":{"value":20, "specials":[{"type":"aturdir_retardado","chance":0.08,"text":"de aturdir al oponente (su próximo turno)"}]},
        "raro":      {"value":27, "specials":[{"type":"aturdir_retardado","chance":0.14,"text":"de aturdir al oponente (su próximo turno)"}]},
        "rango_b":   {"value":33, "specials":[{"type":"aturdir_retardado","chance":0.20,"text":"de aturdir al oponente (su próximo turno)"}]},
        "rango_a":   {"value":42, "specials":[{"type":"aturdir_retardado","chance":0.20,"text":"de aturdir al oponente (su próximo turno)"},{"type":"aumento_dano","value":0.05,"text":"de aumento de daño contra monstruos"}]}
      },
      "Maza de combate": {
        "comun":     {"value":12, "specials":[]},
        "poco_comun":{"value":19, "specials":[{"type":"retroceso","chance":0.12,"text":"de aplicar retroceso"}]},
        "raro":      {"value":26, "specials":[{"type":"retroceso","chance":0.18,"text":"de aplicar retroceso"}]},
        "rango_b":   {"value":30, "specials":[{"type":"retroceso","chance":0.22,"text":"de aplicar retroceso"}]},
        "rango_a":   {"value":38, "specials":[{"type":"retroceso","chance":0.18,"text":"de aplicar retroceso"},{"type":"reduccion_dano","value":0.05,"text":"de reducción de daño recibido"}]}
      },
      "Espadón pesado": {
        "comun":     {"value":12, "specials":[]},
        "poco_comun":{"value":19, "specials":[{"type":"bloqueo","chance":0.05,"text":"de bloquear ataque"}]},
        "raro":      {"value":26, "specials":[{"type":"bloqueo","chance":0.09,"text":"de bloquear ataque"}]},
        "rango_b":   {"value":30, "specials":[{"type":"bloqueo","chance":0.12,"text":"de bloquear ataque"}]},
        "rango_a":   {"value":37, "specials":[{"type":"bloqueo","chance":0.12,"text":"de bloquear ataque"},{"type":"reduccion_dano","value":0.05,"text":"de reducción de daño recibido"}]}
      }
    },"arma2":{
      "Escudo de hierro": {
        "comun":     {"value":0, "specials":[{"type":"bloqueo","chance":0.10,"text":"de bloquear ataque"}]},
        "poco_comun":{"value":0, "specials":[{"type":"bloqueo","chance":0.12,"text":"de bloquear ataque"}]},
        "raro":      {"value":0, "specials":[{"type":"bloqueo","chance":0.16,"text":"de bloquear ataque"}]},
        "rango_b":   {"value":0, "specials":[{"type":"bloqueo","chance":0.18,"text":"de bloquear ataque"}]},
        "rango_a":   {"value":0, "specials":[{"type":"bloqueo","chance":0.18,"text":"de bloquear ataque"},{"type":"reflect","pct":0.10,"text":"de devolver el daño recibido"}]}
      }
    }},
    "doblefilo": {"stat":"hab","arma":{
      "Daga curva": {
        "comun":     {"value":10, "specials":[]},
        "poco_comun":{"value":14, "specials":[{"type":"sangrado","chance":0.12,"text":"de aplicar sangrado 2 turnos"}]},
        "raro":      {"value":19, "specials":[{"type":"sangrado","chance":0.15,"text":"de aplicar sangrado 2 turnos"}]},
        "rango_b":   {"value":24, "specials":[{"type":"sangrado","chance":0.20,"text":"de aplicar sangrado 2 turnos"}]},
        "rango_a":   {"value":29, "specials":[{"type":"sangrado","chance":0.20,"text":"de aplicar sangrado 2 turnos"},{"type":"succion_hechizo","percent":0.10,"text":"succión de hechizo"}]}
      },
      "Cuchillo largo": {
        "comun":     {"value":10, "specials":[]},
        "poco_comun":{"value":17, "specials":[{"type":"sangrado","chance":0.05,"text":"de aplicar sangrado 2 turnos"}]},
        "raro":      {"value":22, "specials":[{"type":"sangrado","chance":0.08,"text":"de aplicar sangrado 2 turnos"}]},
        "rango_b":   {"value":29, "specials":[{"type":"sangrado","chance":0.12,"text":"de aplicar sangrado 2 turnos"}]},
        "rango_a":   {"value":34, "specials":[{"type":"sangrado","chance":0.12,"text":"de aplicar sangrado 2 turnos"},{"type":"silencio","chance":0.10,"text":"de aplicar silencio al enemigo"}]}
      }
    },"arma2":{
      "Daga gemela": {
        "comun":     {"value":10, "specials":[]},
        "poco_comun":{"value":14, "specials":[{"type":"sangrado","chance":0.12,"text":"de aplicar sangrado 2 turnos"}]},
        "raro":      {"value":19, "specials":[{"type":"sangrado","chance":0.15,"text":"de aplicar sangrado 2 turnos"}]},
        "rango_b":   {"value":24, "specials":[{"type":"sangrado","chance":0.20,"text":"de aplicar sangrado 2 turnos"}]},
        "rango_a":   {"value":29, "specials":[{"type":"sangrado","chance":0.20,"text":"de aplicar sangrado 2 turnos"},{"type":"succion_hechizo","percent":0.10,"text":"succión de hechizo"}]}
      },
      "Cuchillo gemelo": {
        "comun":     {"value":10, "specials":[]},
        "poco_comun":{"value":17, "specials":[{"type":"sangrado","chance":0.05,"text":"de aplicar sangrado 2 turnos"}]},
        "raro":      {"value":22, "specials":[{"type":"sangrado","chance":0.08,"text":"de aplicar sangrado 2 turnos"}]},
        "rango_b":   {"value":29, "specials":[{"type":"sangrado","chance":0.12,"text":"de aplicar sangrado 2 turnos"}]},
        "rango_a":   {"value":34, "specials":[{"type":"sangrado","chance":0.12,"text":"de aplicar sangrado 2 turnos"},{"type":"silencio","chance":0.10,"text":"de aplicar silencio al enemigo"}]}
      }
    }},
    "tirador": {"stat":"fis","arma":{
      "Arco corto": {
        "comun":     {"value":10, "specials":[]},
        "poco_comun":{"value":16, "specials":[{"type":"robovida","percent":0.10,"text":"de robo de vida"}]},
        "raro":      {"value":20, "specials":[{"type":"robovida","percent":0.12,"text":"de robo de vida"}]},
        "rango_b":   {"value":25, "specials":[{"type":"robovida","percent":0.15,"text":"de robo de vida"}]},
        "rango_a":   {"value":30, "specials":[{"type":"robovida","percent":0.15,"text":"de robo de vida"},{"type":"segundo_ataque_basico","chance":0.10,"text":"de realizar un segundo ataque básico"}]}
      },
      "Arco largo": {
        "comun":     {"value":10, "specials":[]},
        "poco_comun":{"value":18, "specials":[{"type":"penetracion_armadura","value":0.10,"text":"de penetración de armadura"}]},
        "raro":      {"value":23, "specials":[{"type":"penetracion_armadura","value":0.12,"text":"de penetración de armadura"}]},
        "rango_b":   {"value":29, "specials":[{"type":"penetracion_armadura","value":0.15,"text":"de penetración de armadura"}]},
        "rango_a":   {"value":35, "specials":[{"type":"penetracion_armadura","value":0.15,"text":"de penetración de armadura"},{"type":"aumento_dano","value":0.05,"text":"de aumento de daño"}]}
      }
    },"arma2":{
      "Carcaj de cuero": {
        "comun":     {"value":10, "specials":[]},
        "poco_comun":{"value":14, "specials":[{"type":"robovida","percent":0.10,"text":"de robo de vida"}]},
        "raro":      {"value":18, "specials":[{"type":"robovida","percent":0.12,"text":"de robo de vida"}]},
        "rango_b":   {"value":22, "specials":[{"type":"robovida","percent":0.15,"text":"de robo de vida"}]},
        "rango_a":   {"value":26, "specials":[{"type":"robovida","percent":0.15,"text":"de robo de vida"},{"type":"segundo_ataque_basico","chance":0.10,"text":"de realizar un segundo ataque básico"}]}
      }
    }},
    "mago": {"stat":"esp","arma":{
      "Vara arcana": {
        "comun":     {"value":13, "specials":[]},
        "poco_comun":{"value":18, "specials":[{"type":"esp_refund","chance":0.05,"amount":0.5,"text":"de recuperar la mitad del espíritu gastado"}]},
        "raro":      {"value":22, "specials":[{"type":"esp_refund","chance":0.08,"amount":0.5,"text":"de recuperar la mitad del espíritu gastado"}]},
        "rango_b":   {"value":26, "specials":[{"type":"esp_refund","chance":0.12,"amount":0.5,"text":"de recuperar la mitad del espíritu gastado"}]},
        "rango_a":   {"value":30, "specials":[{"type":"esp_refund","chance":0.15,"amount":0.5,"text":"de recuperar la mitad del espíritu gastado"}]}
      },
      "Bastón rúnico": {
        "comun":     {"value":13, "specials":[]},
        "poco_comun":{"value":18, "specials":[{"type":"aumento_dano","value":0.05,"text":"de aumento de daño"}]},
        "raro":      {"value":22, "specials":[{"type":"aumento_dano","value":0.08,"text":"de aumento de daño"}]},
        "rango_b":   {"value":26, "specials":[{"type":"aumento_dano","value":0.10,"text":"de aumento de daño"}]},
        "rango_a":   {"value":30, "specials":[{"type":"aumento_dano","value":0.13,"text":"de aumento de daño"}]}
      }
    },"arma2":{
      "Foco arcano": {
        "comun":     {"value":10, "specials":[]},
        "poco_comun":{"value":15, "specials":[{"type":"doble_encantamiento","chance":0.05,"text":"de realizar doble encantamiento"}]},
        "raro":      {"value":20, "specials":[{"type":"doble_encantamiento","chance":0.08,"text":"de realizar doble encantamiento"}]},
        "rango_b":   {"value":24, "specials":[{"type":"doble_encantamiento","chance":0.12,"text":"de realizar doble encantamiento"}]},
        "rango_a":   {"value":28, "specials":[{"type":"doble_encantamiento","chance":0.15,"text":"de realizar doble encantamiento"}]}
      }
    }},
    "sacerdote": {"stat":"esp","arma":{
      "Vara arcana": {
        "comun":     {"value":13, "specials":[]},
        "poco_comun":{"value":18, "specials":[{"type":"esp_refund","chance":0.05,"amount":0.5,"text":"de recuperar la mitad del espíritu gastado"}]},
        "raro":      {"value":22, "specials":[{"type":"esp_refund","chance":0.08,"amount":0.5,"text":"de recuperar la mitad del espíritu gastado"}]},
        "rango_b":   {"value":26, "specials":[{"type":"esp_refund","chance":0.12,"amount":0.5,"text":"de recuperar la mitad del espíritu gastado"}]},
        "rango_a":   {"value":30, "specials":[{"type":"esp_refund","chance":0.15,"amount":0.5,"text":"de recuperar la mitad del espíritu gastado"}]}
      },
      "Bastón rúnico": {
        "comun":     {"value":13, "specials":[]},
        "poco_comun":{"value":18, "specials":[{"type":"aumento_dano","value":0.05,"text":"de aumento de daño"}]},
        "raro":      {"value":22, "specials":[{"type":"aumento_dano","value":0.08,"text":"de aumento de daño"}]},
        "rango_b":   {"value":26, "specials":[{"type":"aumento_dano","value":0.10,"text":"de aumento de daño"}]},
        "rango_a":   {"value":30, "specials":[{"type":"aumento_dano","value":0.13,"text":"de aumento de daño"}]}
      }
    },"arma2":{
      "Grimorio de plegarias": {
        "comun":     {"value":10, "specials":[]},
        "poco_comun":{"value":15, "specials":[{"type":"bendecido_dur","text":"Aumenta la duración de Bendecido a 3 turnos"}]},
        "raro":      {"value":20, "specials":[{"type":"bendecido_dur","text":"Aumenta la duración de Bendecido a 3 turnos"}]},
        "rango_b":   {"value":24, "specials":[{"type":"bendecido_dur","text":"Aumenta la duración de Bendecido a 3 turnos"}]},
        "rango_a":   {"value":28, "specials":[{"type":"bendecido_dur","text":"Aumenta la duración de Bendecido a 3 turnos"},{"type":"dano_recibido_debuff","value":0.10,"text":"de aumento de daño recibido al enemigo bendecido, por 2 turnos"}]}
      },
      "Tomo sagrado": {
        "comun":     {"value":10, "specials":[]},
        "poco_comun":{"value":15, "specials":[{"type":"aumento_curacion","value":0.05,"text":"de aumento de curación"}]},
        "raro":      {"value":20, "specials":[{"type":"aumento_curacion","value":0.08,"text":"de aumento de curación"}]},
        "rango_b":   {"value":24, "specials":[{"type":"aumento_curacion","value":0.12,"text":"de aumento de curación"}]},
        "rango_a":   {"value":28, "specials":[{"type":"aumento_curacion","value":0.12,"text":"de aumento de curación"},{"type":"dano_aliado_curado","value":0.05,"text":"de aumento de daño al aliado curado, por 2 turnos"}]}
      }
    }}
  }'::jsonb;
  style_id text;
  entry jsonb;
  result jsonb;
begin
  if item is null or jsonb_typeof(item) <> 'object' then return item; end if;
  if item->>'kind' <> 'equip' or (item->>'slot') not in ('arma','arma2') then return item; end if;

  style_id := item->>'styleId';
  if style_id = 'canalizador' then style_id := 'mago'; end if;
  if style_id is null then return null; end if; -- ya deberían tener styleId desde la migración 0014

  entry := catalog #> array[style_id, item->>'slot', item->>'name', coalesce(item->>'rarity','comun')];
  if entry is null then return null; end if; -- nombre/rango que ya no existe (ej. "Reliquia bendita") -> se descarta

  result := jsonb_build_object(
    'kind', 'equip',
    'slot', item->>'slot',
    'name', item->>'name',
    'rarity', coalesce(item->>'rarity','comun'),
    'styleId', style_id,
    'bonus', jsonb_build_object('stat', catalog #>> array[style_id,'stat'], 'value', entry->'value'),
    'specials', coalesce(entry->'specials', '[]'::jsonb)
  );
  if item ? 'uid' then
    result := result || jsonb_build_object('uid', item->'uid');
  end if;
  return result;
end;
$$;

-- 2) Mochila de cada personaje.
update public.characters
set inventory = coalesce((
  select jsonb_agg(recalibrated)
  from jsonb_array_elements(inventory) elem,
       lateral (select pg_temp.ds_recalibrate_weapon(elem) as recalibrated) r
  where recalibrated is not null
), '[]'::jsonb)
where jsonb_typeof(inventory) = 'array';

-- 3) Hogar de cada personaje (stash->items).
update public.characters
set stash = jsonb_set(
  stash,
  '{items}',
  coalesce((
    select jsonb_agg(recalibrated)
    from jsonb_array_elements(stash->'items') elem,
         lateral (select pg_temp.ds_recalibrate_weapon(elem) as recalibrated) r
    where recalibrated is not null
  ), '[]'::jsonb)
)
where jsonb_typeof(stash->'items') = 'array';

-- 4) Equipado del propio personaje (arma y arma2).
update public.characters
set equip = jsonb_set(
  jsonb_set(
    equip,
    '{arma}',
    coalesce(pg_temp.ds_recalibrate_weapon(equip->'arma'), 'null'::jsonb)
  ),
  '{arma2}',
  coalesce(pg_temp.ds_recalibrate_weapon(equip->'arma2'), 'null'::jsonb)
)
where jsonb_typeof(equip) = 'object';

-- 5) Equipado de cada aliado (arma y arma2).
update public.character_allies
set equip = jsonb_set(
  jsonb_set(
    coalesce(equip, '{}'::jsonb),
    '{arma}',
    coalesce(pg_temp.ds_recalibrate_weapon(equip->'arma'), 'null'::jsonb)
  ),
  '{arma2}',
  coalesce(pg_temp.ds_recalibrate_weapon(equip->'arma2'), 'null'::jsonb)
);

commit;
