# Sin modificadores invisibles, aliados reforzados y mochila completa (2026-10-16)

Rama `sin-invisibles`, sobre `main` en `d3d6875`.
- **Entorno:** medido en local, con servidor propio en el puerto 5192 y tres pestañas propias, una por variante. Sin
  sesión, todo en `simMode`. No se tocó `main`, la base ni Supabase.
- **Sin recalibrar:** no se cambió ningún número de calibración. Todo lo nuevo está detrás de interruptores que por defecto
  dejan el juego igual: la foto `__snapshot` sale idéntica (35f67646 / 3012d3b9 / 70087149).
- **Marcas:** **[código]** leído de `src/game.js`, **[medido]** simulador, **[estimación]** número mío.

## 1. Qué se quitó (interruptor `NO_HIDDEN`, en localhost `__sinInvisibles(true)`)

| # | Modificador | Qué hacía | Dónde |
|---|---|---|---|
| 1 | `ENEMY_VS_CLASS` | Daño recibido por el jugador en salas, por senda y década (×0,53 a ×1,80) | `enemyVsClassMult` |
| 2 | `GUARDIAN_VS_CLASS` | Lo mismo en la sala del guardián, multiplicado al anterior | `enemyVsClassMult` |
| 3 | `BOSS_VS_CLASS` | Lo mismo contra cada jefe de década (incluye 90 y 100) | `enemyVsClassMult` |
| 4 | `ENEMY_VS_CLASS_81` (`mult`, `guardian`, `boss90`) | Las tablas de 81-90, por senda y profesión | `enemyVsClassMult` |
| 5 | `HIDDEN_FRONT_GUARD` | −10% de daño recibido para los aliados de frente, sin aviso | `hiddenFrontGuard` |
| 6 | `GUARDIAN_VS_FRONT` / `_81` | Guardianes de 61-79 (+50%) y 81-89 (+30%) contra quien esté al frente, más Armadura Rota | `guardianVsFront` |
| 7 | `COMMON_VS_TANK` / `_81` | Normales y élites de 61-79 pegan +25% a Guerrero o Paladín al frente | `guardianVsFront` |
| 8 | `VS_FRONT_BOSS`, `VS_FRONT_CARCELERO` | Usurpador y Sin Forma (+10%) y Carcelero (+13%) contra el frente, más Armadura Rota | `tpl.vsFront` |
| 9 | `ARQUERO_PENETRACION` | El Arquero ignora 10 puntos de resistencia física (no lo dice en ninguna parte) | `playerUseSkill` |
| 10 | `CLASS_STATUS_EDGE` | Asesino y Hechicero: +15 puntos y media resistencia al aplicar Sangrado, Veneno, Miedo y Confusión | `applyStatus` |
| 11 | `TANK_TUNE.blockPierce` | Cada nivel, +0,75% de que un golpe ignore el bloqueo (hasta el 80%). Se puso para frenar a los tanques | `blockPierceChance` |

Aviso para cuando se aplique: el texto del estado *Armadura Rota* dice que la causan el Usurpador y el Sin Forma. Sin
el punto 8 eso ya no pasa, así que habría que cambiar el texto o convertirlo en una regla visible de esos jefes.

**Lo que se queda**, y por qué:

| Qué | Por qué |
|---|---|
| Reglas de década, decretos, Ley del Caos, Corrupción, Savia podrida | Son visibles (la Savia podrida está en el texto de la habilidad) |
| Básico del Arquero +60% | Lo dice su descripción |
| Protección de retaguardia contra el área de normales y élites | Regla de posición. Hay que comprobar que el tutorial la explique |
| Temple del Paladín (`PALADIN_ESP_RES`, Espíritu → resistencia, tope 10) | Se ve en la ficha como resistencia, pero no se explica de dónde sale. **Dudoso**; recomiendo explicarlo en la ficha |
| `rearMult` de algunas áreas de jefe (Storm Gush 0,75, Carcelero 0,5…) | Factor de posición del propio jefe. **Dudoso**: o se explica en el texto de la habilidad, o se sustituye por la regla general de la sección 2 |
| Bloqueo de curación enemiga en 61-90 (`ENEMY_HEAL_LOCK`) | No es por senda ni por posición, pero tampoco se ve. Recomiendo enseñarlo como regla |
| Brecha de nivel (`levelDiffDamageMult`) | En la referencia no actúa (nivel del personaje = nivel del piso) |
| Tablas de escala por década y tipo (`DECADE_ENEMY_TUNING`, jefes…) | Son los números del enemigo, no un trato distinto por senda o posición |

## 2. Aliados reforzados (solo simulador: `__aliados({...})`)

Las dos variantes llevan las recomendaciones 1 y 2 del informe de aliados:
- **Paridad de defensas** (`parity`): el aliado aplica la resistencia mágica de su equipo contra los golpes elementales, y
  la reducción de daño por Vigor del jugador (0,2% por punto, tope 25%). Cuenta 1 punto de Vigor por nivel más el de su
  equipo [estimación].
  - Hoy casi ningún golpe de enemigo usa elemento: tanto el jugador como el aliado se defienden de las habilidades
    enemigas con la resistencia física. Por eso lo que pesa es la reducción por Vigor: con 1 punto por nivel más el de
    su equipo, alrededor de −12-14% a nivel 60 y −20-22% a nivel 100.
- **Área al 50% en la retaguardia aliada** (`rearAoe: 0,5`), mientras quede alguien vivo al frente.
- **Vida:** ×1,5 en una variante y ×2 en la otra (`hpMult`).

## 3. Mochila y consumibles

- **Mochila:** el simulador lleva 10.000 unidades de cada poción que existe en el juego (`POTION_TEMPLATES`):

  | Poción | Efecto |
  |---|---|
  | Vida menor | 35% de la vida |
  | Vida mayor | 70% |
  | Tónico de MP | 50% |
  | Elixir de espíritu | 50% |
  | Antídoto | Quita **todos** los estados negativos, también los buenos, porque vacía la lista |

  No hay otras pociones de limpieza.
- **Aliados:** beben de la misma mochila cuando van muy heridos, como en el juego, así que con 10.000 pociones también
  ellos se curan mucho más.
- **Beber gasta el turno**, como en el juego (`usePotionInCombat` termina el turno).
- **La IA decide con la tabla de aprendizaje** (`simPotionChoice`). Situaciones:

  | Situación | Cuándo se plantea | Opciones |
  |---|---|---|
  | `vida` | Por debajo del 60% de vida | Vida mayor por debajo del 45%, vida menor si no |
  | `antidoto:<estado>` | Según el peor estado que lleve (por orden): Parálisis, Miedo, Confusión, Silencio, Corrupción, Veneno, Quemadura, Sangrado, Enredado, Debilitado, Ceguera, Armadura Rota, Corrosión, Marcado, Ralentizado | Beber o seguir. Con 3 o más cargas se aprende aparte (`x3`) |
  | `mp` y `espiritu` | Cuando no le alcanza para su habilidad más barata | Beber o seguir |

  Opciones de partida, antes de aprender: beber vida por debajo del 35%; antídoto solo contra Parálisis, Miedo, Confusión,
  Silencio o 3 o más cargas; beber MP o Espíritu siempre que le falte.
- **Aprendizaje:** encendido en las tres columnas (ε = 0,10). Cada variante tiene su propia tabla (`SIM_AI.tag`) y un
  calentamiento previo que no cuenta: 3 rondas de 9 niveles y 9 jefes por senda.

## 4. Resultados [medido]

**Muestra:** la misma que en la referencia del 2026-10-16:
- 204 recorridos por nivel en los x3, x5 y x7 de cada década;
- 300 combates por jefe de década;
- 81-100 también con profesión.

Error estándar de la media por década ≤ 2,5 puntos. Se usó la muestra completa en las tres columnas principales; solo las dos variantes de la sección 4.4 y la prueba de sensibilidad de 6.2 usan una muestra menor, y se dice en cada sitio.

**Columnas:**
- **Ref. 16-oct:** la referencia oficial (con invisibles, 3 pociones, IA sin aprender), copiada de
  `referencia-2026-10-16.md`.
- **Hoy:** con invisibles, mochila completa e IA que aprende.
- **Sin invisibles ×1,5** y **Sin invisibles ×2:** sin invisibles, aliados con paridad, área ×0,5 a la retaguardia y vida
  ×1,5 o ×2, con mochila completa e IA que aprende.

### 4.1 Por década (media de los niveles x3, x5 y x7; ±error estándar)

**Llegar vivo al guardián (%)**

| Década | Ref. 16-oct | Hoy | Sin invisibles ×1,5 | Sin invisibles ×2 |
|---|---|---|---|---|
| 1-10 | 100 | 100 ±0,2 | 100 ±0,2 | 100 ±0,2 |
| 11-20 | 96 | 99 ±0,5 | 100 ±0,3 | 100 ±0,2 |
| 21-30 | 83 | 96 ±0,7 | 100 ±0,2 | 100 ±0 |
| 31-40 | 86 | 97 ±0,6 | 99 ±0,4 | 100 ±0 |
| 41-50 | 74 | 98 ±0,5 | 100 ±0 | 100 ±0 |
| 51-60 | 78 | 92 ±1 | 98 ±0,6 | 99 ±0,4 |
| 61-70 | 73 | 89 ±1,2 | 95 ±0,8 | 98 ±0,6 |
| 71-80 | 81 | 86 ±1,4 | 95 ±0,9 | 97 ±0,7 |
| 81-90 | 65 | 82 ±1,5 | 80 ±1,5 | 92 ±1,1 |
| 91-100 | 57 | 68 ±1,8 | 70 ±1,6 | 82 ±1,5 |

**Guardián ganado cuando se llega (%)**

| Década | Ref. 16-oct | Hoy | Sin invisibles ×1,5 | Sin invisibles ×2 |
|---|---|---|---|---|
| 1-10 | 100 | 100 ±0 | 100 ±0 | 100 ±0 |
| 11-20 | 98 | 100 ±0 | 100 ±0 | 100 ±0 |
| 21-30 | 82 | 99 ±0,3 | 100 ±0,2 | 100 ±0 |
| 31-40 | 80 | 96 ±0,8 | 100 ±0,2 | 100 ±0 |
| 41-50 | 74 | 96 ±0,7 | 100 ±0 | 100 ±0 |
| 51-60 | 48 | 78 ±1,4 | 95 ±0,8 | 100 ±0,3 |
| 61-70 | 56 | 80 ±1,4 | 92 ±1,1 | 99 ±0,3 |
| 71-80 | 42 | 72 ±1,7 | 95 ±0,8 | 100 ±0,2 |
| 81-90 | 19 | 14 ±1,5 | 56 ±2 | 77 ±1,6 |
| 91-100 | 14 | 22 ±1,7 | 20 ±1,2 | 21 ±1,3 |

**Niveles completados (%)**

| Década | Ref. 16-oct | Hoy | Sin invisibles ×1,5 | Sin invisibles ×2 |
|---|---|---|---|---|
| 1-10 | 99 | 100 ±0,2 | 100 ±0,2 | 100 ±0,2 |
| 11-20 | 94 | 99 ±0,5 | 100 ±0,3 | 100 ±0,2 |
| 21-30 | 68 | 96 ±0,8 | 100 ±0,3 | 100 ±0 |
| 31-40 | 69 | 94 ±1 | 99 ±0,5 | 100 ±0 |
| 41-50 | 56 | 95 ±0,8 | 100 ±0 | 100 ±0 |
| 51-60 | 38 | 73 ±1,5 | 93 ±1 | 99 ±0,5 |
| 61-70 | 40 | 71 ±1,7 | 87 ±1,3 | 98 ±0,6 |
| 71-80 | 34 | 62 ±1,8 | 91 ±1,1 | 97 ±0,7 |
| 81-90 | 14 | 11 ±1,2 | 48 ±1,7 | 71 ±1,7 |
| 91-100 | 9 | 16 ±1,3 | 19 ±1,1 | 20 ±1,2 |

### 4.2 Jefes de década (% de victorias, 300 combates por jefe)

| Jefe | Objetivo A | Ref. 16-oct | Hoy | Sin invisibles ×1,5 | Sin invisibles ×2 |
|---|---|---|---|---|---|
| 10 | 90 | 97 | 99 ±0,7 | 98 ±0,7 | 99 ±0,6 |
| 20 | 85 | 95 | 98 ±0,8 | 100 ±0,3 | 100 ±0 |
| 30 | 80 | 81 | 91 ±1,6 | 99 ±0,5 | 100 ±0 |
| 40 | 75 | 74 | 71 ±2,5 | 100 ±0 | 100 ±0 |
| 50 | 70 | 40 | 62 ±2,7 | 92 ±1,5 | 94 ±1,3 |
| 60 | 50 | 41 | 90 ±1,6 | 100 ±0 | 100 ±0 |
| 70 | 40 | 33 | 38 ±2,4 | 99 ±0,7 | 100 ±0,3 |
| 80 | 30 | 30 | 43 ±2,4 | 78 ±2,2 | 93 ±1,4 |
| 90 | 20 | 13 | 12 ±1,8 | 60 ±2,4 | 83 ±2 |
| 100 | 10 | 5 | 11 ±1,7 | 14 ±1,5 | 22 ±2,1 |
| 90 con profesión | 20 | 19 | 14 ±1,9 | 65 ±2,2 | 87 ±1,7 |
| 100 con profesión | 10 | 11 | 15 ±2 | 19 ±1,7 | 23 ±2 |

**81-100 con profesión, niveles completados (%)**

| Nivel | Hoy | Sin invisibles ×1,5 | Sin invisibles ×2 |
|---|---|---|---|
| 83 | 19 ±2,5 | 48 ±2,7 | 85 ±2,3 |
| 85 | 15 ±2,3 | 51 ±2,5 | 77 ±2,6 |
| 87 | 9 ±1,7 | 40 ±2,8 | 66 ±2,8 |
| 93 | 15 ±2,2 | 29 ±1,3 | 30 ±1,7 |
| 95 | 25 ±2,7 | 16 ±2,3 | 25 ±2,7 |
| 97 | 7 ±1,7 | 20 ±1,9 | 20 ±2 |

### 4.3 Por senda

**Niveles completados por senda y década** (%; entre paréntesis, guardián ganado cuando se llega)

| Década | Columna | Guerrero | Paladín | Asesino | Arquero | Mago | Hechicero |
|---|---|---|---|---|---|---|---|
| 41-50 | Hoy | 95 (99) | 84 (87) | 100 (100) | 95 (97) | 98 (99) | 97 (97) |
| | ×1,5 | 100 (100) | 100 (100) | 100 (100) | 100 (100) | 100 (100) | 100 (100) |
| | ×2 | 100 (100) | 100 (100) | 100 (100) | 100 (100) | 100 (100) | 100 (100) |
| 51-60 | Hoy | 72 (80) | 69 (79) | 92 (95) | 49 (53) | 88 (94) | 70 (71) |
| | ×1,5 | 97 (100) | 94 (98) | 95 (96) | 88 (90) | 91 (93) | 94 (95) |
| | ×2 | 98 (100) | 96 (100) | 99 (99) | 100 (100) | 100 (100) | 98 (98) |
| 61-70 | Hoy | 83 (91) | 72 (84) | 62 (67) | 44 (51) | 88 (100) | 77 (86) |
| | ×1,5 | 100 (100) | 96 (99) | 87 (95) | 72 (75) | 84 (91) | 85 (90) |
| | ×2 | 99 (99) | 96 (100) | 100 (100) | 96 (99) | 98 (100) | 96 (99) |
| 71-80 | Hoy | 82 (94) | 80 (88) | 58 (65) | 43 (56) | 73 (88) | 37 (42) |
| | ×1,5 | 97 (100) | 92 (99) | 94 (99) | 79 (83) | 87 (94) | 93 (98) |
| | ×2 | 97 (100) | 98 (100) | 97 (100) | 97 (100) | 93 (100) | 97 (99) |
| 81-90 | Hoy | 4 (5) | 14 (17) | 13 (14) | 12 (14) | 21 (30) | 2 (2) |
| | ×1,5 | 93 (95) | 75 (81) | 41 (53) | 29 (34) | 23 (39) | 25 (34) |
| | ×2 | 97 (99) | 88 (93) | 65 (72) | 49 (54) | 62 (74) | 65 (70) |
| 91-100 | Hoy | 21 (26) | 11 (15) | 9 (14) | 20 (31) | 9 (12) | 25 (31) |
| | ×1,5 | 63 (63) | 50 (52) | 1 (1) | 0 (0) | 1 (3) | 0 (0) |
| | ×2 | 60 (62) | 44 (45) | 1 (1) | 4 (4) | 7 (9) | 4 (5) |

De 1 a 40, las tres columnas están entre el 89% y el 100% para todas las sendas.

**Jefes de década por senda (% de victorias, 50 por senda)**

| Jefe | Columna | Guerrero | Paladín | Asesino | Arquero | Mago | Hechicero |
|---|---|---|---|---|---|---|---|
| 40 | Hoy | 86 | 88 | 50 | 76 | 58 | 66 |
| | ×1,5 | 100 | 100 | 100 | 100 | 100 | 100 |
| 50 | Hoy | 56 | 38 | 60 | 66 | 70 | 84 |
| | ×1,5 | 78 | 84 | 98 | 94 | 100 | 100 |
| 70 | Hoy | 62 | 82 | 20 | 12 | 32 | 20 |
| | ×1,5 | 100 | 100 | 100 | 98 | 98 | 96 |
| 80 | Hoy | 84 | 78 | 20 | 24 | 32 | 20 |
| | ×1,5 | 92 | 84 | 62 | 48 | 92 | 88 |
| | ×2 | 98 | 80 | 98 | 84 | 100 | 98 |
| 90 | Hoy | 30 | 10 | 22 | 2 | 4 | 6 |
| | ×1,5 | 94 | 84 | 38 | 26 | 76 | 40 |
| | ×2 | 90 | 78 | 70 | 66 | 100 | 96 |
| 100 | Hoy | 0 | 22 | 26 | 6 | 4 | 8 |
| | ×1,5 | 58 | 24 | 0 | 0 | 0 | 0 |
| | ×2 | 54 | 44 | 10 | 0 | 18 | 8 |

(Con ×1,5 y ×2, los jefes 10, 20, 30 y 60 están al 96-100% para todas las sendas.)

### 4.4 Qué pesa cada cambio por separado (muestra menor)

Dos variantes más para separar los efectos, con **muestra menor**: 120 recorridos por nivel (20 por senda), solo en los
niveles x5, y 150 combates por jefe (25 por senda). Error ≈ ±4-5 puntos en la media y ±10-11 por senda.

- **Sin invisibles, aliados de hoy:** sin invisibles, aliados sin tocar, mochila completa.
- **Sin invisibles ×1,5, 3 pociones:** sin invisibles, aliados ×1,5 con paridad y área, mochila de siempre (3 de vida mayor).

Las otras columnas son las de 4.1-4.2, solo en los mismos niveles x5.

| Celda | Hoy | Sin invisibles, aliados de hoy | Sin invisibles ×1,5, 3 pociones | Sin invisibles ×1,5 | Sin invisibles ×2 |
|---|---|---|---|---|---|
| Nivel 15 completado (guardián) | 98 (100) | 100 (100) | 96 (98) | 100 (100) | 100 (100) |
| Nivel 25 | 98 (99) | 97 (99) | 84 (89) | 99 (100) | 100 (100) |
| Nivel 35 | 94 (98) | 93 (95) | 98 (98) | 99 (100) | 100 (100) |
| Nivel 45 | 98 (98) | 96 (97) | 87 (88) | 100 (100) | 100 (100) |
| Nivel 55 | 82 (87) | 71 (76) | 82 (85) | 97 (98) | 99 (100) |
| Nivel 65 | 74 (79) | 54 (58) | 69 (74) | 86 (89) | 97 (98) |
| Nivel 75 | 75 (86) | 81 (93) | 81 (92) | 96 (99) | 99 (100) |
| Nivel 85 | 14 (17) | 43 (48) | 44 (51) | 53 (61) | 72 (78) |
| Nivel 95 | 22 (29) | 8 (8) | 12 (14) | 13 (14) | 18 (20) |
| Jefe 30 | 91 | 86 | 96 | 99 | 100 |
| Jefe 40 | 71 | 89 | 99 | 100 | 100 |
| Jefe 50 | 62 | 61 | 81 | 92 | 94 |
| Jefe 60 | 90 | 75 | 83 | 100 | 100 |
| Jefe 70 | 38 | 63 | 94 | 99 | 100 |
| Jefe 80 | 43 | 35 | 64 | 78 | 93 |
| Jefe 90 | 12 | 37 | 53 | 60 | 83 |
| Jefe 100 | 11 | 11 | 9 | 14 | 22 |
| Jefe 90 con profesión | 14 | 33 | 61 | 65 | 87 |
| Jefe 100 con profesión | 15 | 12 | 13 | 19 | 23 |

**Quitar los invisibles con los aliados de hoy**, por senda (Guerrero / Paladín / Asesino / Arquero / Mago / Hechicero):

| Celda | Hoy | Sin invisibles |
|---|---|---|
| Nivel 55 | 82 / 79 / 100 / 53 / 91 / 88 | 90 / 95 / 75 / 70 / 35 / 60 |
| Nivel 65 | 91 / 74 / 65 / 41 / 97 / 74 | 100 / 100 / 50 / 5 / 20 / 50 |
| Nivel 75 | 82 / 94 / 71 / 71 / 82 / 53 | 100 / 100 / 85 / 70 / 75 / 55 |
| Nivel 85 | 9 / 18 / 24 / 26 / 9 / 0 | 100 / 85 / 40 / 25 / 5 / 0 |
| Nivel 95 | 15 / 0 / 15 / 47 / 15 / 38 | 30 / 5 / 10 / 0 / 0 / 0 |
| Jefe 70 | 62 / 82 / 20 / 12 / 32 / 20 | 96 / 96 / 68 / 60 / 32 / 24 |
| Jefe 80 | 84 / 78 / 20 / 24 / 32 / 20 | 88 / 76 / 16 / 0 / 12 / 20 |
| Jefe 90 | 30 / 10 / 22 / 2 / 4 / 6 | 96 / 56 / 12 / 24 / 24 / 12 |

**Lectura:**

1. **La mochila completa, por sí sola, cambia mucho** ("Ref. 16-oct" frente a "Hoy"; las dos con invisibles):
   - el jefe 60 pasa del 41 al 90%;
   - los niveles de 51-80 suben unos 30 puntos.

   Y con aliados ×1,5 (columna "3 pociones" frente a "×1,5"), las pociones infinitas suman otros 5-20 puntos.
2. **Quitar los invisibles casi no cambia la media, pero da la vuelta al reparto entre sendas.** Guerrero y Paladín pasan
   al 85-100% y las sendas de retaguardia caen (Mago en el 65: del 97 al 20%; Arquero: del 41 al 5%). Es justo lo que
   compensaban las tablas. Sin ellas, el reparto tiene que salir del kit (`plan-reestructuracion.md`, sección 4).
3. **Lo que más mueve es reforzar a los aliados** (paridad, área y vida): de "aliados de hoy" a "×1,5", los jefes 70-90
   suben de 25 a 40 puntos y casi todas las salas de 1-80 se quedan por encima del 90%.
4. **El 91-100 no responde a nada:** ni los aliados ni las pociones mueven el jefe 100 ni los niveles 9x más allá del 10-25%.
   Allí el problema es la escala de La Celda: los guardianes despertados y el Retornado.



## 5. Utilidad de los aliados [medido]

`__simAliadosUtil()` de cada medición, por aliado, década y tipo de combate ("jefe" = guardianes y jefes de década
juntos). Daño, curación y escudo son puntos por combate; control y apoyo, estados aplicados por combate.

**Cómo leer las columnas:**
- "Curación" incluye lo que el aliado se cura a sí mismo bebiendo de la mochila compartida durante su turno. Por eso
  Aldric y Brann "curan" miles de puntos: son pociones.
- "Ronda en que cae" es la media de los combates en que muere. Cuando muere en menos del 5% de los combates, el número
  no es fiable.

**Resumen: tramo 61-80 y 81-100, combates de jefe (guardianes y jefes de década)**

| Aliado (papel) | Tramo | Muere % (Hoy / ×1,5 / ×2) | Ronda en que cae | Daño por combate | Curación por combate | Control (estados por combate) |
|---|---|---|---|---|---|---|
| Aldric (tanque) | 61-80 | 100 / 59 / 27 | 3,8 / 12,4 / 18,2 | 344 / 1.450 / 2.041 | 1.636 / 9.610 / 14.573 | 0,2 / 0,9 / 1,2 |
| Aldric | 81-100 | 100 / 93 / 81 | 1,9 / 5,1 / 7,8 | 297 / 586 / 1.060 | 167 / 4.380 / 11.264 | 0,2 / 0,3 / 0,6 |
| Brann (tanque de las sendas de retaguardia) | 61-80 | 99 / 27 / 4 | 6,4 / 13,5 / 17,5 | 158 / 615 / 755 | 1.032 / 3.193 / 2.533 | apoyo 2,1 / 6,1 / 6,9 |
| Brann | 81-100 | 99 / 88 / 65 | 3,1 / 8,6 / 11,8 | 78 / 338 / 621 | 264 / 2.891 / 6.626 | apoyo 1,2 / 3,3 / 5,4 |
| Hermana Delyth (sacerdotisa) | 61-80 | 84 / 17 / 2 | 13,5 / 15,1 / 18,6 | 409 / 770 / 703 | 1.382 / 2.934 / 3.300 | 4,6 / 6,0 / 5,5 |
| Hermana Delyth | 81-100 | 80 / 70 / 50 | 7,9 / 15,0 / 18,2 | 535 / 1.872 / 2.054 | 459 / 3.906 / 5.414 | 3,1 / 9,1 / 9,6 |
| Fennwick (mago) | 61-80 | 84 / 16 / 2 | 13,2 / 14,7 / 18,9 | 2.918 / 4.656 / 4.622 | 1.002 / 983 / 570 | 0 |
| Fennwick | 81-100 | 79 / 69 / 50 | 7,8 / 14,5 / 18,3 | 2.467 / 7.128 / 7.813 | 221 / 2.325 / 1.828 | 0 |
| Neira (arquera, solo con Guerrero y Paladín) | 61-80 | 48 / 0 / 0 | 30,8 / – / – | 5.995 / 6.965 / 6.124 | 3.401 / 1.854 / 1.341 | 0 |
| Neira | 81-100 | 46 / 39 / 23 | 20,5 / 18,9 / 40,0 | 5.265 / 14.740 / 15.461 | 491 / 5.399 / 4.282 | 0 |

**Lo que se ve:**

1. **Hoy, el tanque aliado no tanquea**: muere el 100% de las veces en la ronda 2-4 contra jefes desde el 61. Con ×1,5 y
   paridad llega a la ronda 12 en 61-80, y su daño y su utilidad se multiplican por 3-4.
2. **Los aliados de retaguardia (Delyth, Fennwick) ya aguantaban hasta la ronda 8-13**, porque no los apuntan los golpes de
   un objetivo. Morían por el área. Con el área al 50% bajan del 84% al 16-17% de muertes en 61-80.
3. **Neira es el aliado que más daño hace** (5.000-15.000 por combate de jefe), por encima de Fennwick. Solo la lleva la
   referencia de Guerrero y Paladín (`SIM_ALLIES`), y eso ayuda a explicar por qué los tanques van mejor sin las tablas:
   llevan al aliado que más pega.
4. **En 81-100 el refuerzo no basta**: aun con ×2, Aldric muere el 81% de las veces y Delyth y Fennwick el 50%. Coincide con
   que el 91-100 no se mueve (sección 4.4).

Detalle completo por aliado, tramo y tipo de combate:

**Hoy** (por combate; tramos 1-40, 41-60, 61-80 y 81-100; "salas" = normales y élites)

| Aliado | Tramo | Tipo | Combates | Daño | Curación | Control | Apoyo | Recibe | Muere % | Ronda en que cae |
|---|---|---|---|---|---|---|---|---|---|---|
| aldric | 1-40 | jefe | 2588 | 952 | 1334 | 1,2 | 0,0 | 1861 | 32 | 16,2 |
| aldric | 1-40 | salas | 3715 | 833 | 775 | 0,7 | 0,0 | 1087 | 5 | 6,2 |
| aldric | 41-60 | jefe | 1566 | 1487 | 2975 | 1,1 | 0,0 | 4042 | 61 | 11,5 |
| aldric | 41-60 | salas | 7047 | 1434 | 1077 | 0,9 | 0,0 | 1374 | 5 | 7,2 |
| aldric | 61-80 | jefe | 1128 | 344 | 1636 | 0,2 | 0,0 | 3870 | 100 | 3,8 |
| aldric | 61-80 | salas | 1592 | 491 | 2073 | 0,3 | 0,0 | 4116 | 85 | 2,9 |
| aldric | 81-100 | jefe | 2090 | 297 | 167 | 0,2 | 0,0 | 2891 | 100 | 1,9 |
| aldric | 81-100 | salas | 2905 | 302 | 1120 | 0,2 | 0,0 | 3767 | 97 | 2,0 |
| brann | 1-40 | jefe | 544 | 237 | 1332 | 0,1 | 4,3 | 2447 | 64 | 10,2 |
| brann | 41-60 | jefe | 1085 | 312 | 3197 | 0,1 | 4,6 | 4527 | 56 | 9,9 |
| brann | 41-60 | salas | 4785 | 298 | 1306 | 0,1 | 3,9 | 1745 | 4 | 5,4 |
| brann | 61-80 | jefe | 780 | 158 | 1032 | 0,1 | 2,1 | 3431 | 99 | 6,4 |
| brann | 61-80 | salas | 1196 | 305 | 1285 | 0,1 | 3,0 | 3336 | 67 | 5,1 |
| brann | 81-100 | jefe | 1425 | 78 | 264 | 0,0 | 1,2 | 3016 | 99 | 3,1 |
| brann | 81-100 | salas | 1948 | 116 | 492 | 0,0 | 1,3 | 3252 | 97 | 3,3 |
| delyth | 1-40 | jefe | 1734 | 620 | 302 | 6,2 | 0,0 | 121 | 20 | 16,2 |
| delyth | 41-60 | jefe | 1664 | 825 | 1700 | 6,1 | 0,0 | 1431 | 47 | 16,2 |
| delyth | 41-60 | salas | 7260 | 572 | 423 | 2,6 | 0,0 | 31 | 2 | 14,3 |
| delyth | 61-80 | jefe | 1347 | 409 | 1382 | 4,6 | 0,0 | 1737 | 84 | 13,5 |
| delyth | 61-80 | salas | 2065 | 683 | 666 | 5,4 | 0,0 | 406 | 38 | 6,6 |
| delyth | 81-100 | jefe | 2325 | 535 | 459 | 3,1 | 0,0 | 1056 | 80 | 7,9 |
| delyth | 81-100 | salas | 3448 | 1017 | 327 | 4,3 | 0,0 | 699 | 61 | 5,9 |
| fennwick | 41-60 | jefe | 1668 | 3298 | 1011 | 0,0 | 0,0 | 1363 | 46 | 17,9 |
| fennwick | 61-80 | jefe | 1350 | 2918 | 1002 | 0,0 | 0,0 | 1725 | 84 | 13,2 |
| fennwick | 61-80 | salas | 2060 | 3716 | 79 | 0,0 | 0,0 | 397 | 38 | 6,6 |
| fennwick | 81-100 | jefe | 2326 | 2467 | 221 | 0,0 | 0,0 | 1065 | 79 | 7,8 |
| fennwick | 81-100 | salas | 3453 | 4266 | 83 | 0,0 | 0,0 | 700 | 60 | 5,8 |
| neira | 41-60 | jefe | 538 | 6385 | 3236 | 0,0 | 0,0 | 3418 | 30 | 31,9 |
| neira | 61-80 | jefe | 563 | 5995 | 3401 | 0,0 | 0,0 | 3834 | 48 | 30,8 |
| neira | 81-100 | jefe | 899 | 5265 | 491 | 0,0 | 0,0 | 1030 | 46 | 20,5 |
| neira | 81-100 | salas | 1491 | 8824 | 35 | 0,0 | 0,0 | 175 | 14 | 15,7 |

**Sin invisibles ×1,5**

| Aliado | Tramo | Tipo | Combates | Daño | Curación | Control | Apoyo | Recibe | Muere % | Ronda en que cae |
|---|---|---|---|---|---|---|---|---|---|---|
| aldric | 1-40 | jefe | 2705 | 1256 | 1717 | 1,5 | 0,0 | 2199 | 4 | 26,4 |
| aldric | 41-60 | jefe | 1787 | 2984 | 6794 | 2,2 | 0,0 | 7957 | 16 | 26,7 |
| aldric | 41-60 | salas | 7367 | 1621 | 952 | 1,1 | 0,0 | 1392 | 1 | – |
| aldric | 61-80 | jefe | 1599 | 1450 | 9610 | 0,9 | 0,0 | 12750 | 59 | 12,4 |
| aldric | 61-80 | salas | 2457 | 1981 | 7918 | 1,3 | 0,0 | 10557 | 12 | 6,2 |
| aldric | 81-100 | jefe | 2207 | 586 | 4380 | 0,3 | 0,0 | 8492 | 93 | 5,1 |
| aldric | 81-100 | salas | 3453 | 1183 | 7547 | 0,5 | 0,0 | 11390 | 67 | 4,0 |
| brann | 41-60 | jefe | 1205 | 663 | 5130 | 0,3 | 7,9 | 6894 | 11 | 13,9 |
| brann | 61-80 | jefe | 1151 | 615 | 3193 | 0,2 | 6,1 | 5050 | 27 | 13,5 |
| brann | 61-80 | salas | 1724 | 862 | 1034 | 0,3 | 7,3 | 1456 | 4 | – |
| brann | 81-100 | jefe | 1542 | 338 | 2891 | 0,1 | 3,3 | 7538 | 88 | 8,6 |
| brann | 81-100 | salas | 2574 | 624 | 3661 | 0,2 | 4,7 | 7193 | 48 | 6,6 |
| delyth | 41-60 | jefe | 1803 | 1022 | 2774 | 5,8 | 0,0 | 1044 | 8 | 24,7 |
| delyth | 61-80 | jefe | 1748 | 770 | 2934 | 6,0 | 0,0 | 1651 | 17 | 15,1 |
| delyth | 61-80 | salas | 2583 | 811 | 1816 | 6,2 | 0,0 | 62 | 3 | – |
| delyth | 81-100 | jefe | 2587 | 1872 | 3906 | 9,1 | 0,0 | 3517 | 70 | 15,0 |
| delyth | 81-100 | salas | 4171 | 1055 | 2056 | 5,6 | 0,0 | 748 | 36 | 9,0 |
| fennwick | 41-60 | jefe | 1805 | 4397 | 620 | 0,0 | 0,0 | 1034 | 8 | 22,3 |
| fennwick | 61-80 | jefe | 1747 | 4656 | 983 | 0,0 | 0,0 | 1639 | 16 | 14,7 |
| fennwick | 81-100 | jefe | 2591 | 7128 | 2325 | 0,0 | 0,0 | 3620 | 69 | 14,5 |
| fennwick | 81-100 | salas | 4171 | 5299 | 166 | 0,0 | 0,0 | 739 | 37 | 9,1 |
| neira | 41-60 | jefe | 595 | 5943 | 1350 | 0,0 | 0,0 | 1803 | 14 | 29,1 |
| neira | 61-80 | jefe | 595 | 6965 | 1854 | 0,0 | 0,0 | 2704 | 0 | – |
| neira | 81-100 | jefe | 1050 | 14740 | 5399 | 0,0 | 0,0 | 6644 | 39 | 18,9 |
| neira | 81-100 | salas | 1589 | 8992 | 135 | 0,0 | 0,0 | 390 | 16 | 11,0 |

La tabla de ×2 y todas las filas que faltan (1-40 en salas, la Sombra Cazadora de las piedras y el Espíritu del
Usurpador del piso 100) salen con `compararAliados(...)` o con `__simAliadosUtil()` en la pestaña de cada medición.


## 6. Recomendación

### 6.1 Qué variante

**Recomiendo "sin invisibles + aliados ×1,5"**, con paridad de defensas y área al 50% a la retaguardia mientras haya
frente. Las razones:

- **Resuelve el problema de los aliados** sin volverlos invulnerables. En 61-80, el tanque aliado pasa de caer en la ronda
  2-4 a la ronda 12, y la retaguardia aliada deja de morir por el área.
- **×2 deja casi todo 1-90 entre el 93% y el 100%:** las tasas quedan pegadas al techo y se pierde capacidad de medir. ×1,5
  conserva más diferencias, y la recalibración tiene menos que deshacer.
- **Las dos piden recalibrar al alza**, porque con mochila completa casi todo 1-80 queda por encima del objetivo. Con ×1,5
  el cambio de escala necesario es menor.

**Antes de calibrar hay que decidir tres cosas:**

1. **Pociones.** Con 10.000 pociones, la dificultad depende del stock: la mochila completa sube el jefe 60 del 41 al 90%.
   Si se calibra con mochila infinita, un jugador con pocas pociones lo tendrá mucho más difícil, y si se calibra con 3, el
   que lleva miles irá sobrado. Propongo una regla visible [estimación]: como mucho 3 pociones por combate (o un
   enfriamiento de 2 turnos entre una y otra) y calibrar con esa regla. Sería una "Regla de la mochila" en el tutorial.
2. **El reparto por senda sin invisibles.** Sin las tablas, en 81-100 Guerrero y Paladín completan el 50-93% de los niveles
   y las sendas de retaguardia el 0-41%. Antes de calibrar la escala hay que hacer los cambios de kit del plan
   (sección 4) o la escala saldrá buena para la media y mala para la mitad de las sendas.
3. **El 91-100 se calibra aparte:** nada de lo probado mueve el jefe 100 ni los niveles 9x. Su media ya está cerca del objetivo, pero solo gracias a los tanques.

### 6.2 Cómo quedaría la calibración (propuesta, sin aplicar) [estimación con base medida]

Para tener una base, medí con la variante ×1,5 (mochila completa, aprendizaje) qué pasa si se sube la vida y el ataque de
los enemigos un 30% y un 60% (vida y ataque a la vez, sobre las tablas actuales). Muestra pequeña: 120 combates por jefe y
90 recorridos por nivel.

| Celda | ×1 (actual) | ×1,3 | ×1,6 | Objetivo A | Factor que llega al objetivo [estimación] |
|---|---|---|---|---|---|
| Jefe 50 | 92 | 73 | 31 | 70 | ×1,33 |
| Jefe 70 | 99 | 53 | 18 | 40 | ×1,38 |
| Jefe 80 | 78 | 24 | 9 | 30 | ×1,25 |
| Jefe 90 | 60 | 7 | 2 | 20 | ×1,15 |
| Nivel 55, completado (guardián) | 97 (98) | 58 (64) | 34 (39) | guardián 55 | ×1,35-1,40 |
| Nivel 75, completado (guardián) | 96 (99) | 74 (84) | 38 (67) | llegar 75, guardián 35 | salas ×1,3, guardián >×1,6 |
| Nivel 45, completado (guardián) | 100 (100) | 99 (99) | 91 (91) | llegar 80, guardián 75 | >×1,6 (su guardián es el grupo de `PARAISO_GUARDIAN_GROUP`, que esta prueba no escaló) |

**La curva es muy empinada**: un 30% de más en los enemigos mueve 20-50 puntos. Así que los factores de la tabla son de
partida y el ajuste fino hay que hacerlo con el simulador, década a década.

Propuesta de presupuesto por década con la variante ×1,5, como factor sobre la escala de hoy (vida y ataque a la vez).
Luego se escribe en la tabla de presupuestos del plan (`R` y `G`):

| Década | Salas (normales y élites) | Guardián | Jefe de década | Comentario |
|---|---|---|---|---|
| 1-20 | ×1,00 | ×1,00 | ×1,00 | La referencia aquí es Rango B; con la de jugador nuevo ya está calibrado. No tocar sin medir con esa |
| 21-30 | ×1,15 | ×1,20 | ×1,25 | Hoy 99-100% con ×1,5 (objetivo 85 / 85 / 80) |
| 31-40 | ×1,15 | ×1,25 | ×1,35 | Jefe 40 al 100% (objetivo 75) |
| 41-50 | ×1,40 (salas de élite de la Isla) | grupo de la Isla ×1,6 o más | ×1,33 | Medir el grupo de `PARAISO_GUARDIAN_GROUP` aparte |
| 51-60 | ×1,30 | ×1,40 | ×1,40 | Jefe 60 al 100% con ×1,5: más alto que el 50 |
| 61-70 | ×1,30 | ×1,45 | ×1,38 | |
| 71-80 | ×1,30 | ×1,70 | ×1,25 | El guardián de 71-79 es el que más aguanta la subida |
| 81-90 | ×1,05 | ×1,20 | ×1,15 | Media por encima del objetivo (llegar 80, guardián 56, jefe 60-65), pero el reparto es lo urgente: tanques al 75-93% y retaguardia al 23-41% |
| 91-100 | ×1,00 | ×1,00 | ×1,00 | La media ya está en el objetivo (llegar 70, guardián 20, jefe 14-19). El problema es el reparto: Guerrero y Paladín al 50-63%, el resto al 0-1%. Se arregla con el kit, no con la escala |

Estos factores sustituirían a las tablas por senda, que se quitan. Nada de esto se aplicó: es la propuesta para la
siguiente vuelta, cuando ariochbu haya revisado los números.

### 6.3 Orden propuesto

1. Decidir la regla de pociones y la variante de aliados (este documento).
2. Cambios de kit para las sendas de retaguardia en 61-100 (plan, sección 4) y medir sin invisibles.
3. Recalibrar década a década con los factores de 6.2 como punto de partida, ya sin tablas por senda y con 200 o más
   recorridos por celda.
4. Pasar `NO_HIDDEN` a `true` y borrar las tablas. Corregir el texto de *Armadura Rota*.


## 7. Cómo repetirlo

```js
await import('/tools/medir_referencia.js');
medirReferencia({key:'si.hoy', variante:{noHidden:false, ally:{}, potionsAll:10000, learn:true, eps:0.10, tag:'hoy', warm:3}});
// en otra pestaña:
medirReferencia({key:'si.x15', variante:{noHidden:true, ally:{hpMult:1.5, parity:true, rearAoe:0.5}, potionsAll:10000, learn:true, eps:0.10, tag:'x15', warm:3}});
// en otra:
medirReferencia({key:'si.x2', variante:{noHidden:true, ally:{hpMult:2, parity:true, rearAoe:0.5}, potionsAll:10000, learn:true, eps:0.10, tag:'x2', warm:3}});
// al terminar, en cualquiera:
await import('/tools/comparar_variantes.js');
compararVariantes([['Hoy', 'si.hoy'], ['Sin invisibles ×1,5', 'si.x15'], ['Sin invisibles ×2', 'si.x2']]);
compararAliados([['Hoy', 'si.hoy'], ['Sin invisibles ×1,5', 'si.x15'], ['Sin invisibles ×2', 'si.x2']]);
```
