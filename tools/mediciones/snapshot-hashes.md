# Foto de referencia (paso 0 de la reestructuración)

Se genera en localhost con `await __snapshot({save:'base'})` y se compara con `await __snapshot({compare:'base'})`.
Antes y después de cada paso del refactor los tres hashes tienen que coincidir.

| Fecha | Commit | enemigos (7200) | jugador (3024) | partidas (60) | Nota |
|---|---|---|---|---|---|
| 2026-10-16 | ba7cfe6 | 35f67646 | 3012d3b9 | 979c2da1 | Foto inicial |
| 2026-10-16 | limpieza de código muerto | 35f67646 | 3012d3b9 | 979c2da1 | Sin cambios: CLASS_CURVE, CLASS_CURVE_BETA, CLASS_DMG_REDESIGN, CLASS_REDESIGN y FRONTLINE_DAMAGE_REDUCTION borrados |
| 2026-10-16 | rama medicion-referencia | 35f67646 | 3012d3b9 | 70087149 | Enemigos y jugador iguales. Cambian las partidas porque cambia la IA del simulador (opciones por defecto nuevas de `simDefaultArm`, con el movimiento gratis); el juego no cambia |
| 2026-10-17 | rama calibrar-sin-invisibles | e368f479 | 3012d3b9 | 49c3e40e | Sin invisibles y aliados ×1,5 en 1-80, 21-80 recalibrado. Cambian solo las claves de enemigos de 21-80 y las partidas de 1-80 (las de 1-20 por las reglas: con las reglas de antes forzadas salen iguales). 81-100 idéntico. Ver calibracion-21-80-2026-10-17.md |
