# Foto de referencia (paso 0 de la reestructuración)

Se genera en localhost con `await __snapshot({save:'base'})` y se compara con `await __snapshot({compare:'base'})`.
Antes y después de cada paso del refactor los tres hashes tienen que coincidir.

| Fecha | Commit | enemigos (7200) | jugador (3024) | partidas (60) | Nota |
|---|---|---|---|---|---|
| 2026-10-16 | ba7cfe6 | 35f67646 | 3012d3b9 | 979c2da1 | Foto inicial |
| 2026-10-16 | limpieza de código muerto | 35f67646 | 3012d3b9 | 979c2da1 | Sin cambios: CLASS_CURVE, CLASS_CURVE_BETA, CLASS_DMG_REDESIGN, CLASS_REDESIGN y FRONTLINE_DAMAGE_REDUCTION borrados |
