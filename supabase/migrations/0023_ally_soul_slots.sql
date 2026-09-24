-- Piedras de alma para aliados (pedido explícito 2026-09-24): cada aliado
-- puede engarzar hasta 2 piedras propias (ALLY_SOUL_SLOTS_MAX en game.js),
-- sin restricción de familia por rol. Se guardan aparte del `equip` general
-- porque son un array de objetos-piedra (mismo formato que un ítem de
-- soulstone en el inventario), no un diccionario por slot.
-- Ejecutar en el SQL Editor de un proyecto que ya corrió 0001-0022.

alter table public.character_allies
  add column if not exists soul_slots jsonb not null default '[]'::jsonb;
