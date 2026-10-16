# Plan de reestructuración del balance

Segunda parte de `investigacion-calibracion.md`, pedida por ariochbu el 2026-10-16. Rama `investigacion-calibracion`,
sobre `main` en `c44dfd1`. No toca `main`, no despliega, no toca la base ni Supabase.

Convenciones (las mismas del primer informe):

- **[código]**: leído de `src/game.js`.
- **[medido]**: lo midió el simulador en esta sesión (servidor local en el puerto 5189, pestaña propia, sin sesión).
- **[estimación]**: número mío. **Todos los números de las propuestas son estimaciones mías**, para afinar con el
  simulador. No hay fuentes nuevas en este documento: las del primer informe siguen valiendo.

Índice:

1. Tabla actual de crecimiento por nivel, con la propuesta al lado
2. Cómo se hace en la práctica, en orden y con tiempos
3. Objetivos de victoria por rango de equipo (B, A, S, SS)
4. Clases equilibradas por su kit
5. De ~400 constantes a ~80
6. El simulador nuevo (código en esta rama) y lo que midió
7. Cómo reordenar el código
8. Jugador y equipo, al final

---

## 1. Cómo crece todo hoy, y cómo crecería

Niveles 1 / 5 / 10 / 20 / 30 / 40 / 50 / 60 / 70 / 80 / 90 / 100. Personaje humano.

### 1.1 Jugador por senda, hoy [medido con `__stats` y `__defensa`]

Equipo de referencia por nivel (el que usa el simulador): Común en el 1, Poco común en el 5, Raro en el 10 y Rango A desde
el 20, siempre del conjunto afín a la senda, sin piedras ni Caídos.

**Vida: sin equipo / con equipo**

| Nivel | Guerrero | Paladín | Asesino | Arquero | Mago | Hechicero |
|---|---|---|---|---|---|---|
| 1 | 72 / 98 | 71 / 76 | 71 / 76 | 69 / 74 | 67 / 67 | 68 / 68 |
| 5 | 158 / 207 | 153 / 167 | 139 / 147 | 131 / 139 | 127 / 127 | 132 / 132 |
| 10 | 267 / 340 | 254 / 278 | 228 / 240 | 213 / 225 | 202 / 202 | 212 / 212 |
| 20 | 485 / 622 | 459 / 532 | 404 / 429 | 374 / 399 | 352 / 352 | 372 / 372 |
| 30 | 703 / 840 | 664 / 737 | 580 / 605 | 535 / 560 | 502 / 502 | 532 / 532 |
| 40 | 921 / 1.058 | 869 / 942 | 756 / 781 | 696 / 721 | 652 / 652 | 692 / 692 |
| 50 | 1.139 / 1.276 | 1.074 / 1.147 | 932 / 957 | 857 / 882 | 802 / 802 | 852 / 852 |
| 60 | 1.357 / 1.494 | 1.279 / 1.352 | 1.108 / 1.133 | 1.018 / 1.043 | 952 / 952 | 1.012 / 1.012 |
| 70 | 1.575 / 1.712 | 1.484 / 1.557 | 1.284 / 1.309 | 1.179 / 1.204 | 1.102 / 1.102 | 1.172 / 1.172 |
| 80 | 1.793 / 1.930 | 1.689 / 1.762 | 1.460 / 1.485 | 1.340 / 1.365 | 1.252 / 1.252 | 1.332 / 1.332 |
| 90 | 2.011 / 2.148 | 1.894 / 1.967 | 1.636 / 1.661 | 1.501 / 1.526 | 1.402 / 1.402 | 1.492 / 1.492 |
| 100 | 2.229 / 2.366 | 2.099 / 2.172 | 1.812 / 1.837 | 1.662 / 1.687 | 1.552 / 1.552 | 1.652 / 1.652 |

**Daño base de habilidad (`skillBaseDamage`): sin equipo / con equipo**

| Nivel | Guerrero | Paladín | Asesino | Arquero | Mago | Hechicero |
|---|---|---|---|---|---|---|
| 1 | 21 / 56 | 21 / 91 | 21 / 73 | 21 / 87 | 23 / 95 | 23 / 95 |
| 5 | 35 / 95 | 35 / 141 | 38 / 117 | 38 / 139 | 40 / 154 | 40 / 154 |
| 10 | 56 / 135 | 56 / 197 | 60 / 175 | 58 / 195 | 63 / 219 | 63 / 219 |
| 20 | 97 / 218 | 97 / 311 | 106 / 287 | 102 / 328 | 108 / 353 | 108 / 353 |
| 30 | 139 / 260 | 139 / 352 | 152 / 341 | 145 / 361 | 154 / 398 | 154 / 398 |
| 40 | 180 / 312 | 180 / 394 | 198 / 387 | 189 / 405 | 200 / 444 | 200 / 444 |
| 50 | 222 / 343 | 222 / 435 | 244 / 424 | 233 / 448 | 246 / 490 | 246 / 490 |
| 60 | 263 / 395 | 263 / 476 | 289 / 479 | 276 / 503 | 292 / 536 | 292 / 536 |
| 70 | 304 / 436 | 304 / 518 | 335 / 524 | 320 / 535 | 337 / 582 | 337 / 582 |
| 80 | 346 / 467 | 346 / 559 | 381 / 579 | 363 / 590 | 383 / 627 | 383 / 627 |
| 90 | 387 / 510 | 387 / 601 | 427 / 616 | 407 / 623 | 429 / 673 | 429 / 673 |
| 100 | 429 / 550 | 429 / 642 | 473 / 662 | 451 / 677 | 475 / 719 | 475 / 719 |

**MP / Espíritu sin equipo** (hoy MP = 20 + 5 × Habilidad, Espíritu = 20 + 4 × Espíritu)

| Nivel | Guerrero | Paladín | Asesino | Arquero | Mago | Hechicero |
|---|---|---|---|---|---|---|
| 1 | 50 / 40 | 50 / 40 | 50 / 40 | 50 / 40 | 50 / 40 | 50 / 40 |
| 10 | 70 / 64 | 75 / 80 | 85 / 56 | 90 / 60 | 110 / 76 | 110 / 80 |
| 20 | 95 / 92 | 105 / 128 | 125 / 76 | 135 / 84 | 180 / 120 | 180 / 128 |
| 40 | 145 / 148 | 165 / 224 | 205 / 116 | 225 / 132 | 320 / 208 | 320 / 224 |
| 60 | 195 / 204 | 225 / 320 | 285 / 156 | 315 / 180 | 460 / 296 | 460 / 320 |
| 80 | 245 / 260 | 285 / 416 | 365 / 196 | 405 / 228 | 600 / 384 | 600 / 416 |
| 100 | 295 / 316 | 345 / 512 | 445 / 236 | 495 / 276 | 740 / 472 | 740 / 512 |

**Resistencia física / mágica con equipo de referencia** (tope −60…80; el Paladín suma su Temple)

| Nivel | Guerrero | Paladín | Asesino | Arquero | Mago | Hechicero |
|---|---|---|---|---|---|---|
| 1 | 15 / 11 | 15 / 18 | 12 / 3 | 12 / 2 | 5 / 9 | 5 / 10 |
| 10 | 29 / 31 | 25 / 42 | 20 / 19 | 19 / 17 | 10 / 27 | 10 / 25 |
| 20 | 46 / 57 | 38 / 71 | 31 / 40 | 28 / 37 | 16 / 51 | 16 / 52 |
| 60 | 46 / 61 | 41 / 74 | 31 / 42 | 28 / 40 | 16 / 57 | 16 / 58 |
| 100 | 46 / 64 | 42 / 75 | 31 / 45 | 28 / 43 | 16 / 62 | 16 / 61 |

**Crítico y evasión sin equipo (%)** (los dos salen de la Agilidad: +0,35% por punto, topes 60% / 60%)

| Nivel | Guerrero | Paladín | Asesino | Arquero | Mago | Hechicero |
|---|---|---|---|---|---|---|
| 1 | 6,8 / 5,8 | 6,8 / 5,8 | 6,8 / 5,8 | 6,8 / 5,8 | 6,8 / 5,8 | 6,8 / 5,8 |
| 10 | 8,5 / 7,5 | 8,2 / 7,2 | 11,7 / 10,7 | 11,3 / 10,3 | 8,5 / 7,5 | 8,5 / 7,5 |
| 20 | 10,6 / 9,6 | 9,9 / 8,9 | 17,3 / 16,3 | 16,6 / 15,6 | 10,6 / 9,6 | 10,6 / 9,6 |
| 40 | 14,8 / 13,8 | 13,4 / 12,4 | 28,5 / 27,5 | 27,1 / 26,1 | 14,8 / 13,8 | 14,8 / 13,8 |
| 60 | 19,0 / 18,0 | 16,9 / 15,9 | 39,7 / 38,7 | 37,6 / 36,6 | 19,0 / 18,0 | 19,0 / 18,0 |
| 80 | 23,2 / 22,2 | 20,4 / 19,4 | 50,9 / 49,9 | 48,1 / 47,1 | 23,2 / 22,2 | 23,2 / 22,2 |
| 100 | 27,4 / 26,4 | 23,9 / 22,9 | 60,0 / 61,1 | 58,6 / 57,6 | 27,4 / 26,4 | 27,4 / 26,4 |

Con equipo, la evasión del Asesino llega al 58% a nivel 80 y al 69% calculado a nivel 100 (el combate la corta al 60%).
**Lo que se ve:** vida y daño lineales (vida +17 a +12 por nivel según la senda, daño +4,1 a +4,5 por nivel); crítico y
evasión **también lineales y sin rendimientos decrecientes**, así que Asesino y Arquero van hacia el tope del 60%. Además,
el equipo multiplica el daño ×2,6-4 a nivel 1-10 y solo ×1,3-1,6 a nivel 100.

### 1.2 Equipo por rango, hoy (nivel 60, conjunto afín, media de 4 tiradas) [medido]

Vida / daño base / resistencia física / resistencia mágica:

| Senda | Sin equipo | Común | Poco común | Raro | Rango B | Rango A | Tier S |
|---|---|---|---|---|---|---|---|
| Guerrero | 1.357 / 263 / 5 / 6 | 1.383 / 298 / 15 / 16 | 1.406 / 322 / 22 / 25 | 1.430 / 343 / 29 / 35 | 1.459 / 362 / 37 / 46 | 1.494 / 385 / 46 / 61 | 1.594 / 419 / 58 / 77 |
| Paladín | 1.279 / 263 / 9 / 13 | 1.284 / 333 / 18 / 29 | 1.293 / 369 / 23 / 40 | 1.303 / 404 / 28 / 52 | 1.314 / 439 / 34 / 63 | 1.352 / 476 / 41 / 74 | 1.394 / 556 / 50 / 80 |
| Asesino | 1.108 / 289 / 5 / 4 | 1.113 / 342 / 12 / 7 | 1.116 / 374 / 16 / 14 | 1.120 / 406 / 20 / 22 | 1.126 / 446 / 25 / 30 | 1.133 / 483 / 31 / 42 | 1.143 / 540 / 39 / 56 |
| Arquero | 1.018 / 276 / 5 / 5 | 1.023 / 342 / 12 / 6 | 1.026 / 382 / 15 / 14 | 1.030 / 415 / 19 / 21 | 1.036 / 455 / 23 / 28 | 1.043 / 495 / 28 / 40 | 1.053 / 580 / 35 / 53 |
| Mago | 952 / 292 / 5 / 8 | 952 / 364 / 5 / 17 | 952 / 406 / 8 / 25 | 952 / 448 / 10 / 33 | 952 / 490 / 13 / 43 | 952 / 536 / 16 / 57 | 952 / 626 / 20 / 73 |
| Hechicero | 1.012 / 292 / 5 / 9 | 1.012 / 364 / 5 / 18 | 1.012 / 406 / 8 / 23 | 1.012 / 448 / 10 / 32 | 1.012 / 490 / 13 / 42 | 1.012 / 536 / 16 / 58 | 1.012 / 626 / 20 / 74 |

Del A al S: +3-13% de vida solo en los tanques (0% en Mago y Hechicero), +9-17% de daño. **Los valores no dependen del
nivel**: un Rango A da lo mismo a nivel 20 que a nivel 100.

### 1.3 Piedras de alma, hoy [código, `SOUL_STONES`]

Un hueco cada 10 niveles (10 a nivel 100). Bono de stat por rango (Vigor / Voluntad / Instinto, etc.; la Vitalidad da vida
×8 y la Sabiduría da MP directo):

| Rango | E | F | D | C | B | A | S | SS |
|---|---|---|---|---|---|---|---|---|
| Stat (Físico, Espíritu, Habilidad…) | +2 | +4 | +8 | +16 | +24 | +32 | +40 | +50 |
| Vitalidad (vida) | +8 | +16 | +32 | +64 | +96 | +128 | +160 | +200 |
| Sabiduría (MP) | +8 | +16 | +32 | +64 | +96 | +128 | +160 | +200 |
| Efecto avanzado | — | proc pequeño | | | | desde A (robo de vida, doble lanzamiento, revivir 25%…) | más fuerte | más fuerte |

Una piedra A de stat de escala suma +32 × 2,2 = **+70 de daño base**. Es un +16% a nivel 40 y un +10% a nivel 100.

### 1.4 Aliados, hoy [código, `allyMaxHP` y `makeCombatAlly`]

- **Vida:** `40 + nivel × vida_por_nivel` (Guerrero 20 + 8 por ser de Frente = 28; el resto, 10) + equipo (vida plana +
  3 × Vigor).
- **Ataque:** `6 + 1,7 × nivel` + los stats de su equipo.
- **MP y Espíritu:** `30 + 5 × nivel`. Cada 3 turnos usan su habilidad.

| Nivel | 1 | 5 | 10 | 20 | 30 | 40 | 50 | 60 | 70 | 80 | 90 | 100 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Vida, aliado de Frente (sin equipo) | 68 | 180 | 320 | 600 | 880 | 1.160 | 1.440 | 1.720 | 2.000 | 2.280 | 2.560 | 2.840 |
| Vida, resto (sin equipo) | 50 | 90 | 140 | 240 | 340 | 440 | 540 | 640 | 740 | 840 | 940 | 1.040 |
| Ataque (sin equipo) | 8 | 15 | 23 | 40 | 57 | 74 | 91 | 108 | 125 | 142 | 159 | 176 |
| Aliados en la referencia (beta) | 0 | 0 | 0 | 1 | 2 | 3 | 4 | 4 | 4 | 4 | 4 | 4 |

Un aliado pega entre un cuarto y un tercio de lo que pega el jugador. **El aliado de Frente aguanta más que el jugador
Guerrero a partir del 70.**

### 1.5 Enemigos, hoy [código + medido]

Valores por fórmula con la plantilla media de la década (piso 3 para salas, sin plantilla especial), contrastados con el
simulador: los jefes coinciden con lo que medí (Ogro 873, Riakis 17.814, Storm Gush 53.103, Retornado 220.054).

| Nivel | Factor de década (normal vida / ataque) | Normal vida / ataque | Élite | Guardián (media) | Jefe de década |
|---|---|---|---|---|---|
| 1 | ×1,85 / ×1,85 | 123 / 20 | 525 / 48 | 200 fijo / 15 | — |
| 5 | ×1,85 / ×1,85 | 222 / 33 | 956 / 80 | 421 / 29 | — |
| 10 | ×1,85 / ×1,85 | 504 / 69 | 2.179 / 167 | 810 / 57 | 873 / 71 |
| 20 | ×2,40 / ×2,58 | 1.406 / 116 | 5.357 / 260 | 3.906 / 146 | 5.310 / 164 |
| 30 | ×2,58 / ×2,58 | 2.705 / 149 | 8.878 / 320 | 10.502 / 379 | 17.814 / 467 |
| 40 | ×3,77 / ×4,35 | 5.200 / 278 | 18.232 / 626 | 24.444 / 1.007 | 20.717 / 635 |
| 50 | ×1,49 / ×1,49 | 2.518 / 115 | 8.360 / 260 | 14.436 / 469 | 16.134 / 538 |
| 60 | ×2,88 / ×4,18 | 5.976 / 347 | 19.366 / 719 | 39.613 / 1.687 | 53.103 / 1.752 |
| 70 | ×3,29 / ×4,99 | 8.531 / 473 | 29.093 / 1.026 | 41.075 / 1.523 | 52.273 / 1.700 |
| 80 | ×3,48 / ×5,33 | 10.324 / 543 | 36.679 / 1.218 | 42.744 / 1.547 | 65.138 / 1.836 |
| 90 | ×5,20 / ×7,98 | 17.164 / 901 | 47.960 / 1.426 | 64.721 / 2.036 | 79.285 / 2.277 |
| 100 | ×6,68 / ×10,26 | 24.205 / 1.271 | 67.710 / 2.013 | 83.232 / 3.120 | 220.054 / 5.953 |

Resto de estadísticas del enemigo, hoy [código, `makeEnemy`]:

| | Normal | Élite | Guardián / jefe |
|---|---|---|---|
| Resistencia física (plantilla media + 0,8 por piso) | −2 a 8 → 0-11 | 5-20 → 7-22 | 11-25 → 17-31 (Riakis 61) |
| Resistencias elementales medias | 0-11 | 0-14 | 0-20 |
| Evasión | 5% + 0,3% por piso | 8% + 0,3% | 10% + 0,3% |
| Precisión | 3% + 0,2% por piso | 6% + 0,2% | 8% + 0,2% |
| Crítico | 2% + 0,1% por piso | 3,5% + 0,1% | 10% → 30% según el nivel (tope en el 80) |
| Encima | tabla por senda (×0,46 a ×1,80), castigo al frente (61-89), Corrupción, Ley, reglas, votos, modo | | |

### 1.6 Propuesta (fase posterior: ver la sección 8) [estimación]

**Jugador** (fórmulas del primer informe, 6.2): vida `(40 + 16·L)` × senda, daño `(10 + 5·L)` × senda, con el producto
vida × daño ≈ 1. Equipo de referencia como porcentaje: Común ×1,00, Poco común ×1,05, Raro ×1,10, Rango A ×1,25. Vida / daño
por acción:

| Nivel | Guerrero (×1,25 / ×0,80) | Paladín (×1,15 / ×0,85) | Asesino (×0,95 / ×1,05) | Arquero (×0,90 / ×1,10) | Mago (×0,80 / ×1,20) | Hechicero (×0,85 / ×1,15) |
|---|---|---|---|---|---|---|
| 1 | 70 / 12 | 64 / 13 | 53 / 16 | 50 / 16 | 45 / 18 | 48 / 17 |
| 5 | 158 / 29 | 145 / 31 | 120 / 39 | 113 / 40 | 101 / 44 | 107 / 42 |
| 10 | 275 / 53 | 253 / 56 | 209 / 69 | 198 / 73 | 176 / 79 | 187 / 76 |
| 20 | 562 / 110 | 517 / 117 | 428 / 144 | 405 / 151 | 360 / 165 | 382 / 158 |
| 30 | 812 / 160 | 748 / 170 | 618 / 210 | 585 / 220 | 520 / 240 | 552 / 230 |
| 40 | 1.062 / 210 | 977 / 223 | 808 / 276 | 765 / 289 | 680 / 315 | 722 / 302 |
| 50 | 1.312 / 260 | 1.207 / 276 | 998 / 341 | 945 / 358 | 840 / 390 | 892 / 374 |
| 60 | 1.562 / 310 | 1.438 / 329 | 1.188 / 407 | 1.125 / 426 | 1.000 / 465 | 1.062 / 446 |
| 70 | 1.812 / 360 | 1.668 / 382 | 1.378 / 472 | 1.305 / 495 | 1.160 / 540 | 1.232 / 517 |
| 80 | 2.062 / 410 | 1.897 / 436 | 1.568 / 538 | 1.485 / 564 | 1.320 / 615 | 1.402 / 589 |
| 90 | 2.312 / 460 | 2.127 / 489 | 1.758 / 604 | 1.665 / 633 | 1.480 / 690 | 1.572 / 661 |
| 100 | 2.562 / 510 | 2.357 / 542 | 1.948 / 669 | 1.845 / 701 | 1.640 / 765 | 1.742 / 733 |

La vida queda en el mismo orden que hoy (Guerrero 2.562 frente a 2.366 hoy a nivel 100). El daño por acción es algo menor
porque la tabla de hoy es el daño *base* sin multiplicador de habilidad. **No sube ningún número de forma llamativa.**

- **MP y Espíritu:** se quedan como hoy (son recursos atados a costes; cambiarlos obliga a recalcular todos los costes).
- **Resistencias:** tope 75 (hoy 80). El equipo da 0 / 4 / 8 / 12 / 16 / 20 / 25 / 28 de Común a SS por pieza de defensa,
  así que el reparto entre sendas lo siguen marcando los conjuntos.
- **Crítico y evasión con rendimientos decrecientes**, para que no se disparen con el nivel:
  `crítico = 5% + 40% × Agi / (Agi + 2·L + 20)` y `evasión = 5% + 35% × Agi / (Agi + 2·L + 20)`. Con eso, a nivel 100 el
  Asesino queda en ~22% de crítico y ~20% de evasión (hoy 60 / 60), y el Guerrero en ~14 / 13%. Para compensar, el Asesino
  gana daño crítico y su identidad pasa al kit (sección 4).

**Enemigos por presupuesto** (primer informe, 6.1): `R` = rondas que tarda el grupo de referencia en ganar, `G` = golpes
que aguanta el jugador. Presupuesto **por década** (crece suave y siempre en el mismo sentido):

| Década | Aliados ref. | Normales en el grupo | R normal / élite / guardián / jefe | G normal / élite / guardián / jefe |
|---|---|---|---|---|
| 1-10 | 0 | 3 | 3,0 / 5,0 / 8,0 / 12 | 8,0 / 5,0 / 4,0 / 3,5 |
| 11-20 | 1 | 4 | 3,2 / 5,3 / 8,5 / 13 | 7,8 / 4,9 / 3,9 / 3,4 |
| 21-30 | 2 | 4 | 3,5 / 5,6 / 9,0 / 14 | 7,5 / 4,8 / 3,8 / 3,3 |
| 31-40 | 3 | 4 | 3,7 / 6,0 / 9,5 / 15 | 7,2 / 4,6 / 3,6 / 3,2 |
| 41-50 | 4 | 5 | 4,0 / 6,3 / 10 / 16 | 7,0 / 4,5 / 3,5 / 3,0 |
| 51-60 | 4 | 5 | 4,2 / 6,6 / 10,5 / 17 | 6,8 / 4,4 / 3,4 / 2,9 |
| 61-70 | 4 | 5 | 4,4 / 7,0 / 11 / 18 | 6,5 / 4,2 / 3,2 / 2,8 |
| 71-80 | 4 | 5 | 4,6 / 7,3 / 11,5 / 18 | 6,2 / 4,0 / 3,0 / 2,7 |
| 81-90 | 4 | 5 | 4,8 / 7,6 / 12 / 19 | 6,0 / 3,9 / 2,9 / 2,6 |
| 91-100 | 4 | 5 | 5,0 / 8,0 / 12,5 / 20 | 5,5 / 3,7 / 2,7 / 2,5 |

Esto sustituye a los factores de década (×1,85 … ×6,68 y su zigzag). Con daño del grupo = daño del jugador × (1 + 0,55 ×
aliados) y una mitigación de referencia del 35% [estimación], las estadísticas resultantes son:

| Nivel | Normal vida / ataque (hoy) | Normal propuesto | Élite (hoy → propuesto) | Guardián (hoy → propuesto) | Jefe de década (hoy → propuesto) |
|---|---|---|---|---|---|
| 1 | 123 / 20 | 15 / 11 | 525 / 48 → 75 / 17 | 200 / 15 → 120 / 22 | — |
| 5 | 222 / 33 | 37 / 24 | 956 / 80 → 184 / 39 | 421 / 29 → 294 / 48 | — |
| 10 | 504 / 69 | 66 / 42 | 2.179 / 167 → 330 / 68 | 810 / 57 → 528 / 85 | 873 / 71 → 792 / 97 |
| 20 | 1.406 / 116 | 170 / 89 | 5.357 / 260 → 1.130 / 141 | 3.906 / 146 → 1.812 / 178 | 5.310 / 164 → 2.771 / 204 |
| 30 | 2.705 / 149 | 368 / 133 | 8.878 / 320 → 2.352 / 208 | 10.502 / 379 → 3.780 / 263 | 17.814 / 467 → 5.880 / 303 |
| 40 | 5.200 / 278 | 643 / 182 | 18.232 / 626 → 4.174 / 284 | 24.444 / 1.007 → 6.608 / 363 | 20.717 / 635 → 10.434 / 409 |
| 50 | 2.518 / 115 | 832 / 231 | 8.360 / 260 → 6.552 / 359 | 14.436 / 469 → 10.400 / 462 | 16.134 / 538 → 16.640 / 538 |
| 60 | 5.976 / 347 | 1.042 / 283 | 19.366 / 719 → 8.184 / 437 | 39.613 / 1.687 → 13.020 / 566 | 53.103 / 1.752 → 21.080 / 663 |
| 70 | 8.531 / 473 | 1.267 / 343 | 29.093 / 1.026 → 10.080 / 531 | 41.075 / 1.523 → 15.840 / 697 | 52.273 / 1.700 → 25.920 / 797 |
| 80 | 10.324 / 543 | 1.509 / 409 | 36.679 / 1.218 → 11.972 / 635 | 42.744 / 1.547 → 18.860 / 846 | 65.138 / 1.836 → 29.520 / 940 |
| 90 | 17.164 / 901 | 1.766 / 474 | 47.960 / 1.426 → 13.984 / 730 | 64.721 / 2.036 → 22.080 / 981 | 79.285 / 2.277 → 34.960 / 1.095 |
| 100 | 24.205 / 1.271 | 2.040 / 573 | 67.710 / 2.013 → 16.320 / 852 | 83.232 / 3.120 → 25.500 / 1.168 | 220.054 / 5.953 → 40.800 / 1.262 |

**Lo importante de esta tabla no son los números exactos, sino su forma:** todo crece en el mismo sentido y con la
misma pendiente que el jugador. Los combates normales vuelven a 3-5 rondas, y el golpe del jefe deja de igualar la vida
del jugador. Los normales de hoy en 1-40 son muy esponjosos para lo que pegan (1.406 de vida y 116 de ataque a nivel 20),
y por eso la propuesta los baja tanto. Si prefieres combates normales más largos, se sube `R`; es una sola columna.

Resto del enemigo, propuesto: resistencia fija por arquetipo de plantilla (débil 0, normal 10, resistente 25, muy
resistente 45), sin el +0,8 por piso; evasión 5 / 8 / 10% y precisión 3 / 6 / 8% fijas; crítico 3% (normal), 5% (élite),
10% (guardián) y 15% (jefe de década), fijo. El peligro de los jefes lo ponen sus golpes avisados y sus fases, no un crítico
que pasa del 10% al 30%.

---

## 2. Cómo hacerlo en la práctica, paso a paso

Tiempos en jornadas de trabajo conmigo, más las horas de máquina del simulador [estimación]. Cada paso deja el juego
desplegable y tiene su interruptor.

| # | Paso | Qué se entrega | Listo cuando | Tiempo |
|---|---|---|---|---|
| 0 | Simulador v2 (**hecho en esta rama**) | Posición, defensa, reglas, aprendizaje, errores que ya no cuelgan la medida | Mide sin errores y con y sin aprendizaje (sección 6) | — |
| 1 | Medida de referencia | Tabla oficial "antes": 200 recorridos por celda, todas las décadas, reglas encendidas, IA v2 entrenada | Error estándar ≤ 3 puntos por década | 1 jornada + 1 noche de máquina |
| 2 | Instantánea y semilla | `tools/snapshot.js`: vuelca las estadísticas de cada plantilla en cada nivel, `derived()` de cada senda, nivel y rango, y una partida simulada con semilla fija | Dos ejecuciones dan el mismo archivo | 1 jornada |
| 3 | Refactor sin cambios (sección 7) | Tablas de balance fuera de `game.js`; una sola `enemyStats()` | La instantánea es idéntica, byte a byte | 2-3 jornadas |
| 4 | Presupuesto que reproduce lo de hoy | Calcular R y G **actuales** por década y tipo (con la IA v2) y escribirlos en la tabla nueva. Los números del juego no cambian, solo dónde viven | Tasas de victoria dentro de ±3 puntos de la medida 1 | 2 jornadas |
| 5 | Alisar el presupuesto | Quitar el zigzag (sobre todo 41-50 y el salto 81-100), década a década, empezando por 51-60 | Cada década en su objetivo con reglas puestas | 1 jornada por década, unas 2 semanas |
| 6 | Clases en el kit (sección 4) | Quitar `ENEMY_VS_CLASS` y compañía con un interruptor por década; cambios de kit | Cada senda a ±10 puntos de la media del tramo | 1-2 semanas |
| 7 | Objetivos por rango (sección 3) | Referencias B, S y SS en el simulador; medir y ajustar | Las cuatro columnas dentro de ±5 puntos | 1 semana |
| 8 | Alfa y beta | Las cuentas alfa usan la misma escala, con un bono de grupo explícito | Una sola tabla | 2 jornadas |
| 9 | Jugador y equipo (sección 8) | Curva nueva, equipo en porcentaje, crítico y evasión con rendimientos decrecientes | Nadie queda peor que hoy en su piso | 1-2 semanas |

Total aproximado: **6 a 9 semanas** a ritmo de una jornada al día [estimación]. Lo más largo es medir, no programar.

---

## 3. Objetivos de victoria por rango de equipo [estimación]

Hoy todo se calibra con Rango A. Propuesta: una columna por rango con **saltos moderados**. Con el equipo en porcentaje
(A +25%, S +35%, SS +42%), el S da un ~8% más de poder que el A y el SS un ~14%. Con presupuestos de 2,5-4 golpes, un 8% de
poder mueve una pelea al 50% unos 10-12 puntos, no 30 [estimación, a confirmar con el simulador]. Regla para pasar de la
columna A a las demás:

- **B** = A − mín(15, A/3)
- **S** = A + mín(12, (100 − A)/3)
- **SS** = A + mín(22, (100 − A)/2)

(En 1-19 no se puede equipar el A: allí la referencia es Raro / B, y las columnas son "Raro, B, A".)

**Salas** (% de recorridos que llegan vivos al guardián):

| Tramo | B | A (hoy) | S | SS |
|---|---|---|---|---|
| 1-19 | 75 | 90 | 93 | 95 |
| 21-39 | 70 | 85 | 90 | 92 |
| 41-59 | 65 | 80 | 87 | 90 |
| 61-79 | 60 | 75 | 83 | 87 |
| 81-89 | 55 | 70 | 80 | 85 |
| 91-99 | 45 | 60 | 72 | 80 |

**Guardianes** (% de victorias cuando se llega; A = jefe de su década + 5):

| Tramo | B | A | S | SS |
|---|---|---|---|---|
| 1-9 | 75 | 95 | 97 | 98 |
| 11-19 | 75 | 90 | 93 | 95 |
| 21-29 | 70 | 85 | 90 | 92 |
| 31-39 | 65 | 80 | 87 | 90 |
| 41-49 | 60 | 75 | 83 | 87 |
| 51-59 | 40 | 55 | 70 | 77 |
| 61-69 | 30 | 45 | 63 | 72 |
| 71-79 | 23 | 35 | 57 | 67 |
| 81-89 | 17 | 25 | 37 | 47 |
| 91-99 | 10 | 15 | 27 | 37 |

**Jefes de década:**

| Jefe | B | A (hoy) | S | SS |
|---|---|---|---|---|
| 10 Ogro | 75 | 90 | 93 | 95 |
| 20 Matriarca | 70 | 85 | 90 | 92 |
| 30 Riakis | 65 | 80 | 87 | 90 |
| 40 Usurpador | 60 | 75 | 83 | 87 |
| 50 Custodio | 55 | 70 | 80 | 85 |
| 60 Storm Gush | 35 | 50 | 62 | 72 |
| 70 Sin Forma | 27 | 40 | 52 | 62 |
| 80 Corazón | 20 | 30 | 42 | 52 |
| 90 Carcelero | 13 | 20 | 32 | 42 |
| 100 Retornado | 7 | 10 | 22 | 32 |

Tu ejemplo para el jefe 100 era 10 / 25 / 40; esta regla da 10 / 22 / 32. Es la versión sin exagerar: el SS es un
objetivo de colección y comercio, y si triplicara la tasa de victoria se volvería obligatorio. Con estos objetivos, **la
calibración pasa a tener cuatro puntos por celda en vez de uno**, y eso es lo que de verdad la estabiliza. Si una
década cumple el objetivo A pero no el S, el problema está en cómo escala el equipo, no en el enemigo.

Para medir S y SS el simulador necesita esas referencias. S ya existe (`gear:'legendario'`, `stoneTier:'S'`, Caídos
legendarios). Para SS hace falta una opción nueva en `simBuildState`: S +15% con una pieza numerada al azar de su senda.

---

## 4. Clases equilibradas por su kit

### 4.1 Qué compensan hoy las tablas invisibles

Media de los multiplicadores de daño recibido por senda en las diez décadas (cálculo mío a partir de `ENEMY_VS_CLASS`,
`GUARDIAN_VS_CLASS` y `BOSS_VS_CLASS` del código):

| Senda | Salas | Guardián (sala × guardián) | Jefe de década | Lectura |
|---|---|---|---|---|
| Guerrero | ×1,44 | ×1,33 | ×1,13 | demasiado fuerte en salas y guardianes |
| Paladín | ×1,41 | ×1,48 | ×1,01 | demasiado fuerte en salas y guardianes |
| Asesino | ×0,87 | ×0,86 | ×0,98 | algo débil en salas |
| Arquero | ×1,18 | ×0,96 | ×1,00 | algo fuerte en salas |
| Mago | ×0,84 | ×0,77 | ×1,04 | débil en salas y guardianes |
| Hechicero | ×0,73 | ×0,87 | ×1,14 | muy débil en salas |

**El desequilibrio está en las peleas contra grupos, no en los jefes** (contra el jefe de década las medias rondan ×1,0;
las diferencias entre jefes son ruido de calibración). En las salas, los tanques aguantan y limpian con área. Las sendas
de retaguardia mueren por desgaste porque no tienen con qué curarse (las notas de calibración ya lo midieron con Storm
Gush: el Mago aguantaba 21 turnos frente a 340 del Paladín).

### 4.2 Cambios de kit propuestos [estimación, uno a uno con interruptor y medidos]

La regla es mover el poder **de las salas a los jefes** en los tanques y **dar aguante en grupo** a la retaguardia. Así
se pueden quitar las tablas sin que las tasas se separen.

**Guerrero (pesada)**
- Furia del Titán (definitiva en área, ×1,15 a todos): ×0,9 contra 3 o más enemigos. A cambio, contra uno solo, ×1,4.
- Grito de guerra (+30% de daño 2 turnos por 10 de Espíritu): el bono no se aplica a los golpes en área. Sigue igual
  contra un objetivo.
- Bloqueo (Caídos, conjunto): tope total del 25%, para que en salas largas no se acumule con la vida y la resistencia.
- Contra guardianes y jefes, **"Rompeguardia"**: Machacar ignora 15 puntos de resistencia física de enemigos `boss`. Así
  se compensa lo que hoy hace `GUARDIAN_VS_CLASS` ×0,55-0,67 en 61-79.

**Paladín**
- Juicio Divino (definitiva, cura el 25% de todo lo infligido): que la curación cuente como mucho tres enemigos. Hoy cura
  más cuanto más grande es el grupo, justo donde ya le sobra.
- Escudo del Juramento (escudo del 20% de la vida por 20 de Espíritu, sin límite): como mucho 2 por combate.
- A cambio: Golpe Consagrado +15% contra `boss` y Muro de Fe dura 1 turno más contra jefes de década.

**Asesino (doblefilo)**
- Sangrado contagioso, como el Veneno del Hechicero: al morir un enemigo sangrando, sus cargas pasan al siguiente del frente.
- Danza de cuchillas con robo de vida del 8% del daño.
- Evasión con rendimientos decrecientes (sección 1.6) y, a cambio, +25% de daño crítico. Hoy su evasión llega al tope del
  60% a nivel 100, y eso lo convierte en un todo o nada.

**Arquero (tirador)**
- "Paso atrás": desde la Retaguardia, su ataque básico cura un 4% del daño (las notas dicen que se probó un 10% y un 3%
  de succión y se quitó; esto es menor y solo atrás).
- Lluvia de flechas aplica Ralentizado 1 turno a la línea que golpea, con la reducción de daño que eso conlleva.
- Se quita su penetración propia (`ARQUERO_PENETRACION`, que no movió nada medible).

**Mago**
- **Barrera arcana**: al empezar cada combate, un escudo del 12% de su vida máxima. Se renueva al 6% cada vez que detona un
  combo elemental.
- Lanza de hielo: Ralentiza a la línea (ya existe la opción `controlLine`), de modo que el área le sirve también de defensa.
- El resto de su daño se queda; es el que más rápido mata.

**Hechicero**
- Veneno: contra `boss`, tope de x4 cargas (hoy x5). Contra el resto, el contagio al morir pasa todas las cargas, no la mitad.
- Drenaje de Esencia: cura el 30% del daño desde el nivel 1 (hoy desde el 30) y un 10% más por cada enemigo con Veneno.
- Grito de Locura: ya va a toda una línea; se queda.

Con estos cambios, el orden de trabajo es el de la sección 2, paso 6: en cada década, apagar la tabla por senda, medir,
aplicar el cambio de kit que corresponda y volver a medir.

---

## 5. De ~400 constantes a ~80

| Qué | Hoy | Qué se hace | Después |
|---|---|---|---|
| `CLASS_CURVE`, `CLASS_CURVE_BETA` | 240 números | **Borrar** (código muerto con `CLASS_REDESIGN = true`) | 0 |
| `CLASS_DMG_REDESIGN` | 60 (todos ×1) | **Borrar** | 0 |
| `FRONTLINE_DAMAGE_REDUCTION` (0), `COMMON_VS_TANK_81` (×1), bono `maxhp` ×8 viejo | 3 | **Borrar** | 0 |
| `ENEMY_VS_CLASS`, `GUARDIAN_VS_CLASS`, `BOSS_VS_CLASS`, `ENEMY_VS_CLASS_81` | ~252 | **Borrar**, después de mover el equilibrio al kit (sección 4) | 0 |
| `regularHPMult`, `eliteHPMult`, `levelMult`, `monsterAtkMult`, `floorDifficultyStep`, `RES/EVASION/PRECISION/CRIT_PER_FLOOR`, bases 55-65 / 125-135 / 300 / 26 / 9 / 16 | ~20 | **Fusionar** en una curva de referencia (`refPower(L)`) | 4 |
| `BETA_ENEMY_SCALE`, `_TUTORIAL`, `BETA_LEVEL_TAPER`, `DECADE_ENEMY_TUNING` | ~94 | **Fusionar** en la tabla de presupuesto (R y G por década y tipo) | 80 |
| `DECADE_BOSS_TUNING`, `BETA_DECADE_BOSS_TUNING` | 28 | **Fusionar**: el jefe usa el presupuesto `jefe`; su forma (más vida o más ataque) queda en su plantilla (`tpl.hp` y `tpl.atk`, ya existen) | 0 |
| `RIFT_TUNING`, `RIFT_BOSS_HP` | 41 | **Fusionar**: rift = presupuesto de la década con G repartido entre 3 etapas | 2 |
| `GUARDIAN_VS_FRONT`, `_81`, `COMMON_VS_TANK`, `VS_FRONT_BOSS` | ~10 | **Mover** a la plantilla de cada guardián como regla visible (`vsFront`) | (dato de plantilla) |
| `GUARDIAN_ELITE_81` / `_91`, `PARAISO_GUARDIAN_GROUP` | ~8 | **Fusionar**: la escolta se lleva una parte fija del presupuesto del guardián | 1 |
| `GAME_MODES.enemy` (HardMode ×1,3) | 1 | **Queda**, expresado como R ×1,3 y G ÷1,3 | 1 |
| Aliados de referencia por década, tamaño de grupo | (implícito) | **Nuevo**, explícito | 20 |
| Objetivos por rango | 20 | **Queda y crece** (sección 3) | 4 columnas |
| Fórmula de daño, crítico 1,5 / 1,3, `DOT_ENEMY`, reglas, votos, decretos, Ley, Corrupción | — | **Queda** (son reglas, no calibración) | — |

Constantes de calibración (las que hay que buscar con el simulador): de ~400 a **~85** (80 de presupuesto, 4 de la curva y
1 de escolta), más los 20 de aliados y grupos, que son decisiones de diseño y no números a buscar. Las plantillas conservan
`tpl.hp` y `tpl.atk` como **forma** del enemigo; la regla nueva es que el producto vida × ataque de la plantilla quede
cerca de 1, para que una plantilla no esconda otro factor de década.

---

## 6. El simulador nuevo

### 6.1 Qué hace (código en `src/game.js`, bloque "IA DEL SIMULADOR v2")

- **`simPlayTurn` / `simPlayCombat`:** un único bucle de turno para `simOneFight`, `simFightLoop`, los niveles y los
  rifts (antes había dos copias).
- **`simTactic`:** tácticas que gastan el turno.

  | Regla | Qué hace el simulador |
  |---|---|
  | Telaraña | Salir del Frente cuando tiemblan los hilos (ronda 3, 6…) y volver después |
  | Marea | Defenderse o ir atrás cuando se oye crecer |
  | Suelo ardiente | Moverse cuando humea |
  | «Prepara…» | Defenderse |
  | Sin pociones | Defenderse muy bajo de vida |

  Respeta Anclado y Enredado: no se mueve.
- **`simRuleFilter` / `simRuleTarget`:** filtros de habilidad y objetivo.

  | Regla | Qué hace el simulador |
  |---|---|
  | Ley del Caos | No pegar físico, o mágico, al inmune |
  | Espejismo | No gastar la definitiva de un objetivo hasta ver el falso |
  | Muralla | No abrir con la definitiva |
  | Doble / Triple coste | Ahorrar MP |
  | Baluarte | Apuntar al frente primero |
  | Definitiva en salas | Usarla o guardarla para el guardián |
  | Condena | Ya excluía la habilidad encadenada |

- **Aprendizaje (`simChoose`, `simLearnEnd`):**
  - **Brazos:** cada situación tiene varios (reaccionar, ignorar, guardar…). Se elige con épsilon-greedy.
  - **Recompensa:** al acabar el combate, cada elección recibe 0 si se perdió y 0,6 + 0,4 × la vida restante si se ganó.
  - **Tabla:** se guarda por `senda | década | tipo de combate | situación`, en memoria y en `localStorage` (`simAprende.v1`).
- **Sin aprendizaje:** se usa `simDefaultArm`, una opción por defecto **sacada de lo que aprendió el propio simulador** (ver 6.3).
- **Interruptores (localhost):**

  | Llamada | Efecto |
  |---|---|
  | `__simIA({rules, learn, eps, persist})` | Configura la IA. Con `rules:false` se porta como el simulador viejo: misma política y mismas tiradas de azar |
  | `__simAprende()` | Muestra la tabla con medias |
  | `__simAprende('borrar')` | Vacía la tabla |
  | `__simErrores` | Últimos errores |
- **Compatible con tus decretos nuevos:** `simDecree(id)` lee tanto `combat.decrees` (tu versión local, varios decretos)
  como `combat.decree` (la de `main`). Los decretos que el simulador trata (Baluarte, Anclado, Sin pociones, Triple coste) se
  activan solos cuando existan.

### 6.2 El "cuelgue" en el nivel 45

No lo pude reproducir:

| Versión | Recorridos en el 45 | Cuelgues | Errores |
|---|---|---|---|
| Esta rama | 500 | 0 | 0 |
| Tu versión local con los 11 decretos (servida en solo lectura en otro puerto, decretos fuertes) | 831 de 1.200 (la tanda no terminó) | 0 | 0 |

En el camino del simulador no hay ninguna espera real: en `simMode` las animaciones no se esperan y no quedan `sleep`
pendientes. Así que una promesa que "nunca se resuelve" casi seguro es **una excepción**: rechaza la promesa de
`__simLevel`, el `await` del bucle de calibración la convierte en un error no capturado, y ese bucle se para sin avisar. Desde
fuera eso parece un cuelgue. Arreglado así:

- `simLevels` y `simRun` capturan el error de cada recorrido o combate, lo descartan y lo anotan en `__simErrores` (mensaje,
  pila y las últimas líneas del registro). Devuelven `errores` y `atascados` (combates que llegan al tope de 400 turnos sin
  terminar).
- `tools/calib_harness.js` y `tools/calib_1_80.js` ignoran los resultados con `n: 0` en vez de contarlos como derrota.

**Si vuelve a pasar, `__simErrores` dirá dónde.** Si `__simErrores` sale vacío y aun así se para, entonces es otra cosa
(por ejemplo, los temporizadores de una pestaña oculta) y hay que mirarlo con la pestaña delante.

### 6.3 Antes y después [medido]

Niveles enteros (`__simLevel`) con la referencia de `tools/calib_harness.js` y las reglas de década **encendidas** en las
tres columnas. Lo único que cambia es la IA del jugador simulado. Ojo: en esta rama la Isla todavía tiene los 3 decretos
de `main`, no tus 11 locales; el 47 hay que repetirlo cuando subas los tuyos.

- **A** = IA vieja (`__simIA({rules:false})`).
- **B** = IA v2 sin aprendizaje.
- **C** = IA v2 aprendiendo (ε = 0,05, sobre la tabla ya entrenada).

**Prueba 1: la IA v2 reaccionando siempre a todo** (la primera versión, antes de `simDefaultArm`). 60 recorridos por celda,
error ≈ ±6. Antes de C se entrenó con 20 recorridos por senda y nivel (ε = 0,2). Niveles completados (guardián ganado
cuando se llega), en %:

| Nivel (regla) | A, IA vieja | B, IA v2 que siempre reacciona | C, IA v2 tras aprender |
|---|---|---|---|
| 15 (Telaraña) | 92 (95) | **63** (66) | 97 (98) |
| 25 (Manada) | 60 (78) | 65 (80) | 70 (79) |
| 35 (Espejismo) | 65 (75) | 88 (91) | 80 (94) |
| 47 (Decreto) | 42 (61) | 63 (83) | 45 (63) |
| 55 (Marea) | 23 (30) | 30 (36) | 30 (35) |
| 65 (Ley del Caos) | 53 (80) | 57 (69) | 43 (57) |
| 85 (Suelo ardiente) | 27 (35) | **0** (0) | 12 (17) |

Reaccionar siempre es malo donde moverse cuesta el turno: en el 15 los tanques bajaron al 0%, porque salían del Frente
cada 3 rondas, y en el 85 ninguna senda completó un nivel, porque se movían cada 2. El aprendizaje **lo corrigió solo**:
en el 15 subió al 97% y en el 85 al 12%.

**Lo que aprendió** (tabla `simAprende.v1`, media de recompensa por opción; resumen):

| Situación | Lo mejor | Lo peor |
|---|---|---|
| Telaraña, tanques | quedarse (0,82-0,96 en guardianes) | salir (0,45-0,62) |
| Suelo ardiente | ignorar (0,68-0,88) | moverse (0,17-0,67) |
| Marea, Guerrero | defenderse (0,90) | ignorar (0,75) |
| Marea, Paladín | ignorar (0,89) | defenderse (0,82) |
| Espejismo | esperar con la definitiva (0,87-0,96); el Asesino al revés (gastar, 0,94) | |
| Doble coste | ahorrar MP (casi siempre) | |
| «Prepara» contra el guardián, tanques | ignorar (0,81-0,94) | defenderse (0,0-0,41) |
| Definitiva en salas (81-90) | guardarla: Guerrero, Hechicero | |
| Definitiva en salas (81-90) | usarla: Asesino, Mago, Arquero | |

Con eso se fijaron las opciones por defecto (`simDefaultArm`).

**Prueba 2: la IA v2 con esas opciones por defecto.** 180 recorridos por celda (30 por senda), las tres columnas
intercaladas nivel a nivel. Error de cada media ≈ ±3,5; de una diferencia entre columnas ≈ ±5. Niveles completados / llega
al guardián / guardián ganado, en %:

| Nivel (regla) | A, IA vieja | B, IA v2 | C, IA v2 aprendiendo |
|---|---|---|---|
| 15 (Telaraña) | 91 / 97 / 94 | 97 / 98 / 98 | 96 / 98 / 98 |
| 25 (Manada) | 66 / 84 / 78 | 57 / 84 / 68 | 66 / 84 / 78 |
| 35 (Espejismo) | 75 / 87 / 86 | 76 / 91 / 83 | 67 / 89 / 75 |
| 47 (Decreto) | 43 / 64 / 67 | 36 / 65 / 56 | 34 / 63 / 54 |
| 55 (Marea) | 24 / 87 / 28 | 27 / 81 / 33 | 23 / 83 / 27 |
| 65 (Ley del Caos) | 47 / 74 / 63 | 42 / 76 / 56 | 49 / 77 / 63 |
| 85 (Suelo ardiente) | 14 / 73 / 20 | 26 / 73 / 36 | 18 / 61 / 30 |

Por senda (niveles completados, Gue / Pal / Ase / Arq / Mag / Hec), columna B:

| Nivel | B |
|---|---|
| 15 | 97 / 100 / 100 / 100 / 93 / 90 |
| 25 | 53 / 50 / 63 / 53 / 50 / 70 |
| 35 | 80 / 73 / 60 / 90 / 73 / 77 |
| 47 | 27 / 27 / 40 / 37 / 60 / 27 |
| 55 | 17 / 10 / 27 / 30 / 40 / 37 |
| 65 | 50 / 53 / 20 / 37 / 43 / 50 |
| 85 | 23 / 33 / 33 / 33 / 23 / 10 |

**Qué se concluye**

1. **Con buenas opciones por defecto, jugar bien las reglas casi no cambia los resultados**: las tres columnas quedan dentro
   de ±10 puntos. Las reglas, tal como están, cuestan poco a un jugador sensato. Eso refuerza lo del primer informe: hoy no
   son la palanca de dificultad que podrían ser.
2. **El ruido es grande incluso con 180 recorridos.** En el 25 y en el 85, A y B toman exactamente las mismas decisiones (no
   hay ninguna situación que las distinga con las opciones por defecto) y aun así salen 66 frente a 57 y 14 frente a 26.
   Hay que contar **±10 puntos** de diferencia como ruido hasta tener 500 o más recorridos por celda.
3. **El aprendizaje sirve sobre todo para descubrir qué es jugar bien una regla nueva**, no para subir la media: corrigió los
   errores de la prueba 1 y dejó una tabla legible. Para calibrar conviene usar B (opciones por defecto fijas, comparable
   entre sesiones) y reservar C para cuando entre una regla o un decreto nuevo: se entrena, se mira la tabla y se actualiza
   `simDefaultArm`.
4. **Llegar al guardián frente a ganarle:** en el 55 se llega el 81-87% de las veces pero solo se le gana al 28-33%. En el 85,
   73% y 20-36%. Lo que hunde los niveles completados de 51-60 y 81-90 es el guardián, no las salas.
5. Los niveles completados en 21-29 (57-66%) y 51-59 (23-27%) siguen por debajo de lo que daba la recalibración del
   2026-10-09 (69% y 38%): la deriva que señalaba el primer informe se confirma con más muestra.

---

## 7. Cómo reordenar el código

`src/game.js` tiene ~19.000 líneas y todo comparte dos variables de módulo, `state` y `combat`. La propuesta es separarlo
**primero en datos y después en funciones**, sin cambiar números en ningún paso.

```
src/
  game.js              arranque, estado (state, combat), enganche de pantallas: lo que quede
  estado.js            (paso C) objeto compartido S = {state, combat} y utilidades (clamp, rnd, chance)
  balance/
    curva.js           curva de referencia del jugador y presupuestos → vida/ataque del enemigo (funciones puras)
    presupuestos.js    tabla R/G por década y tipo, aliados de referencia, tamaño de grupo, objetivos por rango
    clases.js          CLASS_GROWTH, vida por nivel, PALADIN_ESP_RES, TANK_TUNE
  contenido/
    habilidades.js     SKILLS, ULTIMATE_BY_STYLE
    bestiario.js       DECADE_BESTIARY, plantillas de rift, Celda
    equipo.js          SET_CATALOG, WEAPON_CATALOG, SOUL_STONES, piezas numeradas (datos)
    reglas.js          DECADE_RULES, DECREES, CHAOS_LAWS, VOWS, GAME_MODES
  combate/
    dano.js            golpe del jugador, golpe del enemigo, resistencias, críticos (funciones puras con contexto)
    motor.js           turnos: playerUseSkill, endPlayerTurn, resolveAllyTurns, processEnemyTurns
    ia-enemiga.js      elección de habilidades enemigas, objetivo, intenciones
    estados.js         applyStatus, DoT, Corrupción
  sim/
    simulador.js       simBuildState, simRun, simLevels, simRifts
    ia.js              simTactic, simRuleFilter, simPickSkill
    aprende.js         tabla de aprendizaje
  ui/  red/            pantallas y guardado (Supabase)
```

Orden, de menos a más riesgo:

| Paso | Qué se mueve | Riesgo | Cómo se comprueba |
|---|---|---|---|
| A | **Datos puros** (tablas sin referencias a `state`): presupuestos, catálogos de equipo, bestiario, reglas. Se exportan como `const` y `game.js` los importa | Bajo: un `import` de un `const` funciona igual | Instantánea idéntica |
| B | **Funciones puras**: curvas, `baseDamageFromStat`, la parte de cálculo de `makeEnemy`, la fórmula de mitigación. Reciben lo que necesitan como parámetros | Bajo-medio | Instantánea idéntica + partida con semilla |
| C | **Contexto compartido**: `state` y `combat` pasan a `S.state` y `S.combat` en `estado.js` (es un cambio mecánico en todo el archivo) | Medio: muchas líneas, pero de reemplazo | Partida con semilla idéntica, turno a turno |
| D | Simulador a `sim/` | Bajo una vez hecho C | Igual |
| E | Motor de combate y UI | Alto | Igual, y probar a mano en el navegador |

Para que "exactamente los mismos números" sea comprobable hacen falta dos herramientas (paso 2 del plan):

1. **`tools/snapshot.js`** (en el navegador, en localhost): vuelca a un JSON
   - la vida, el ataque, la resistencia, la evasión, la precisión y el crítico de cada plantilla del bestiario en cada nivel
     de su década y en cada piso;
   - `derived()` de cada senda en los 12 niveles con los 7 rangos.

   Antes y después de cada paso, el archivo tiene que salir igual.
2. **Semilla**: un interruptor `__simSemilla(n)` que, en `simMode`, cambia `Math.random` por un generador con semilla
   (por ejemplo mulberry32). Así, una partida simulada da el mismo registro turno a turno y cualquier diferencia de
   comportamiento salta a la vista.

Una advertencia: tu versión local ya cambió los decretos y yo no puedo ver el resto de tus cambios. El refactor de verdad
debería empezar **después** de que subas esos cambios a `main`, sobre el `main` nuevo y en ramas cortas (una por paso de la
tabla).

---

## 8. Jugador y equipo, al final

Como pediste, se tocan **los últimos** (paso 9 del plan): primero se arregla todo lo que está encima (enemigos, clases,
reglas, objetivos por rango) con el jugador y el equipo **tal como están hoy**. La curva nueva del jugador, el equipo en
porcentaje y los rendimientos decrecientes de crítico y evasión (sección 1.6) se aplican después, en un solo cambio y con
la condición de no empeorar a ningún personaje en su piso. Como las estadísticas se derivan al cargar
(`refreshGearFromTemplate`, `derived()`), no hace falta migrar la base. Lo único que habrá que revisar es que las piezas
SS numeradas mantengan su "S +15%" relativo.
