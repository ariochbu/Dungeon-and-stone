# Kits de retaguardia: Arquero, Mago y Hechicero (2026-10-17)

Rama `kits-retaguardia`, creada desde `origin/calibrar-sin-invisibles` (`f802a7c`).

- **No se hizo:** no se desplegó nada, no se tocó Supabase y no se fusionó a `main`.
- **SQL:** no hace falta ninguno. Todo está en `src/game.js` (código del cliente).
- **Marcas:** **[código]** leído de `src/game.js`; **[medido]** simulador; **[estimación]** número o decisión mía.
- **Datos crudos:** `tools/mediciones/kits-retaguardia-2026-10-17.json` (resumen de cada lote, por celda y senda).
- **Tabla de aprendizaje nueva:** `tools/mediciones/aprendizaje-kits-retaguardia-2026-10-17.json` (sección 2).

## 0. Resumen

1. **Lo que trae el plan (sección 4.2) se aplicó, pero no basta.** Escudo del Mago, curación del Arquero y del Drenaje
   apenas mueven los guardianes de 51-79. Ni con valores exagerados (escudo del 50%, robo de vida del 30%) se movían
   [medido, sección 3]. El motivo: el Arquero, el Mago y el Hechicero no pierden por falta de vida propia, sino porque
   sus aliados mueren en 3-6 rondas contra el guardián. Con Guerrero o Paladín, los aliados casi nunca caen.
2. **Por eso añadí dos efectos visibles que el plan daba por hechos** [estimación]:
   - **Un enemigo Ralentizado hace un 30% menos de daño.** El plan ya contaba con esa reducción para Lluvia de flechas
     ("con la reducción de daño que eso conlleva") y para la Lanza de hielo en línea ("el área le sirve también de
     defensa"), pero en el código el Ralentizado no la tenía.
   - **El Drenaje de Esencia deja al objetivo Mermado (-40% de daño)** mientras dura el Quebranto.
3. **21-80 recalibrado a los objetivos**, con los factores de década ajustados (sección 5). Todas las medias quedan a
   3 puntos o menos del objetivo, salvo "llegar" en 71-79 (+3,6).
4. **Reparto por senda** (sección 6). En 21-59 el Arquero, el Mago y el Hechicero quedan, salvo cuatro casillas, a 15
   puntos o menos de la media en niveles completados y guardián. En 61-79 se acercan mucho (de -20/-31 a -3/-18), pero
   **no se puede llegar a ±15 sin bajar a Guerrero y Paladín**: con ellos a +20/+45 sobre la media, a las otras cuatro
   sendas les toca, por aritmética, una media de -15 a -20. Contra los jefes, las tres sendas pasan ahora a menudo por
   encima de la media (jefe 50, jefe 60 del Hechicero, jefe 80 del Arquero).
5. **Guerrero y Paladín siguen muy por encima en 51-80.** La causa medida y las propuestas (sin aplicar) están en la
   sección 7.
6. **1-20 y 81-90** (sección 8):
   - con la referencia del simulador, 1-20 no cambia (98-100%);
   - con la de jugador nuevo, el Ogro sube del 76 al 91% (el Arquero, del 32 al 76%);
   - **81-90 sí cambia para el Arquero y el Mago:** jefe 90, del 6 al 56% y del 11 al 52%; media del jefe 90, del 20
     al 35%. No lo he recalibrado (decisión pendiente).
7. **Efecto secundario:** al subir la escala para devolver la media a su sitio, el **Asesino** (que no se tocó) baja
   bastante: completa el 14% en 51-59 y el 8% en 71-79. Es ahora la senda peor colocada.

## 1. Cambios en el código

### 1.1 Kits (todo en `KIT_RETAGUARDIA`, al principio de las habilidades)

| Senda | Qué | Antes | Ahora (texto que ve el jugador) | Origen |
|---|---|---|---|---|
| Arquero | **Paso atrás** (ataque básico) | — | Ataque básico: "… +60% de daño para el Arquero — su golpe más fuerte. **Paso atrás:** desde la Retaguardia, te cura el 4% del daño que hace." | plan (4%) |
| Arquero | Lluvia de flechas | sin estado | "… Deja Ralentizados (-20% de evasión y -30% de daño) 2 turnos a los enemigos que golpea." | plan; 2 turnos y no 1 [estimación]: los estados del enemigo se descuentan al empezar su fase, y con 1 turno se iría antes de tu siguiente golpe |
| Arquero | Penetración propia (`ARQUERO_PENETRACION`) | ya apagada en 1-80 (calibración del 17) | sin cambios: no la convertí en visible (el plan la quita). En 81-100 sigue como estaba, oculta | plan |
| Arquero | 013 Arco de Gina | "Lluvia de flechas aplica Ralentizado. …" | "Lluvia de flechas deja Ralentizados 3 turnos a los enemigos que golpea (sin la pieza, 2). Tus disparos contra enemigos Ralentizados son siempre críticos." | ajuste para que la pieza siga aportando algo |
| Mago | **Barrera arcana** (pasiva) | — | Empiezas cada combate con un escudo del 12% de tu vida máxima (sale en la pantalla de elegir clase y en el registro del combate) | plan |
| Mago | Explosión arcana | detonación sin escudo | "… Cada detonación renueva tu **Barrera arcana**: +6% de tu vida máxima en escudo, hasta el 12%." | plan ("se renueva al 6%": lo leí como +6% con tope 12%) [estimación] |
| Mago | Lanza de hielo | Ralentizado solo al objetivo | "Daño de hielo. 80% de aplicar Ralentizado (-20% evasión y -30% de daño) durante 2 turnos al objetivo y a toda su línea (frente o retaguardia), cada enemigo con su propia tirada." (3 turnos con la mejora de nivel 30) | plan (`controlLine`) |
| Hechicero | Toque Venenoso | "Apila Veneno (hasta x5) durante 3 turnos." | "Apila Veneno (hasta x5; contra jefes y guardianes, hasta x4) durante 3 turnos. Si muere un enemigo envenenado, todas sus cargas pasan a otro enemigo de su línea." | plan. El contagio ya pasaba todas las cargas [código]; solo se escribe |
| Hechicero | Drenaje de Esencia | "Te cura el 30% de lo infligido y deja al objetivo Quebrantado 3 turnos: …" | "Te cura el 30% de lo infligido (+10% por cada enemigo con Veneno) y deja al objetivo Quebrantado 3 turnos: -15 a todas sus resistencias y la mitad de su resistencia a estados, **y Mermado: hace un 40% menos de daño**." | +10%: plan. Mermado: añadido [estimación] |
| Todos | Estado **Ralentizado** | "-20% evasión y actúa después que el resto." | "… Un enemigo Ralentizado hace además un 30% menos de daño." Solo en enemigos; al jugador no le cambia nada | añadido [estimación] (ver 0.2) |

**Lo que el plan pedía y no apliqué igual:**
- **Drenaje "desde el nivel 1".** Lo dejé desde el nivel 30, como ahora. ariochbu decidió el 2026-10-10 quitar esa
  curación antes del 30 porque era demasiado para una cuenta nueva sin aliados (comentario de `LEVEL30_SKILL_BONUS`).
  El plan es del 16 y no lo menciona. Si se quiere desde el 1, es cambiar `drenaje_de_esencia` en ese bloque, pero
  afecta a 1-29.
- **El Mermado del Drenaje sí vale desde el nivel 1** (no depende de la mejora). Es parte de por qué el Hechicero mejora
  en el Ogro con la referencia de jugador nuevo (sección 8).
- **Otras sendas** (Guerrero, Paladín, Asesino): el plan propone cambios para las tres. No los toqué, según lo pedido.
  Para Guerrero y Paladín, ver la sección 7. Para el Asesino, ver el punto 7 del resumen.

### 1.2 Simulador (la política de juego, no el juego)

Para que el simulador use los kits como lo haría un jugador [estimación]:

- **Arquero:** contra un jefe, guardián o élite sin Ralentizado, abre con Lluvia de flechas sobre su línea.
- **Mago:** contra un enemigo fuerte, mantiene el Ralentizado con Lanza de hielo y detona la Quemadura al tope en vez
  de gastar el hielo (Explosión arcana gasta antes la Quemadura).
- **Hechicero:**
  - contra un jefe o guardián, mantiene el Drenaje (Quebranto y Mermado);
  - y se corrigió un fallo: su rotación usaba x5 como tope de Veneno también contra los jefes. Con el tope x4 nunca
    llegaba al tope y no usaba nunca el Drenaje.

### 1.3 Interruptores y herramientas

- `window.__kits({...})` (solo localhost) prueba valores de `KIT_RETAGUARDIA` sin tocar el archivo; `__kits(null)`
  vuelve a los del código.
- `tools/medicion_headless/`:
  - `worker.js` aplica `kit` por tarea y admite tareas de depuración (`dbg.py`, que ejecuta código en una pestaña);
  - `cal.py` admite `"styles"` (medir solo algunas sendas) y `"kit"`;
  - `tabla.py` saca la tabla por década y senda de uno o varios lotes, con medias y objetivos;
  - `.gitignore` deja fuera `profiles/`, `results/` y las fotos `snap_*.json`.
- `index.html`: `game.js?v=386`.

## 2. Cómo se midió

- **Referencia, muestra y reglas:** las de la calibración del 17. Referencia oficial (`refFor`, beta, Rango A,
  piedras A, Caídos épicos, aliados por década), reglas de década, mochila completa (`potionsAll: 10000`), IA que
  aprende (`eps 0,10`) y variante ×1,5. Muestra: 408 recorridos por nivel (x3, x5 y x7 de cada década) y 600 combates
  por jefe.
- **Antes:** `base0`, el código de `f802a7c` con la tabla oficial (`aprendizaje-calibracion-2026-10-17.json`).
  Reproduce la calibración del 17: todas las medias a 3 puntos o menos.
- **Después:** `final`, el código de esta rama con una tabla nueva (`aprendizaje-kits-retaguardia-2026-10-17.json`).
  - Se hizo partiendo de la oficial (cargada en el servidor) más 3 rondas de calentamiento en 24 pestañas con los kits
    puestos.
  - Hacía falta. La tabla oficial había aprendido que, para el Hechicero de 61-69, beber contra el guardián no sirve
    (porque perdía igual), y el Hechicero bebía 0,1 pociones por combate frente a 9-10 del Arquero y el Mago.
  - **Control:** el código final medido con la tabla oficial (`final_tv`) da medias a 4 puntos o menos de las de
    `final` (sección 5). El resultado no depende de la tabla.
- **Calibración de escala:** 3 vueltas a media muestra y una a muestra completa, con interpolación logit, como el día 17
  (`calk.py` en el directorio temporal; el método está en la sección 10). Después, 2 retoques puntuales (guardián de
  21-29 y jefe 80) con 816-1.200 combates.

## 3. Por qué no bastaba el plan [medido]

**Valores del plan sin nada más** (`plan1`, tabla oficial, escala sin tocar), en porcentaje:

| Senda | Guardián 61-69 | Guardián 71-79 | Jefe 70 | Jefe 80 |
|---|---|---|---|---|
| Arquero, antes → plan | 21 → 16 | 5 → 9 | 27 → 24 | 0 → 0 |
| Mago, antes → plan | 22 → 27 | 10 → 16 | 29 → 35 | 19 → 39 |
| Hechicero, antes → plan | 24 → 17 | 21 → 12 | 24 → 13 | 35 → 17 |

El Hechicero baja por el tope x4 contra jefes y por el fallo de su rotación (sección 1.2).

**Combates sueltos contra el guardián, 100 por senda.** Medidos sin kits (`g_off`) y con valores exagerados (`g_ext`:
escudo del 50% renovable al 25%, Paso atrás del 30% y Drenaje +30% por cada enemigo envenenado):

| Senda | Guardián 57 | Guardián 65 | Guardián 73 | Guardián 77 |
|---|---|---|---|---|
| Arquero, sin kits → exagerado | 18 → 21 | 10 → 9 | 6 → 6 | 0 → 1 |
| Mago, sin kits → exagerado | 12 → 16 | 10 → 12 | 4 → 16 | 10 → 10 |
| Hechicero, sin kits → exagerado | 36 → 26 | 12 → 10 | 10 → 5 | 4 → 9 |

**Causa** (guardián del 65, 30 combates por senda; registro de combate):

| Senda | Gana | Rondas | Aliados muertos | Ronda de la primera baja | Pociones por combate |
|---|---|---|---|---|---|
| Guerrero | 97% | 83 | 0,2 | 42 | 6,9 |
| Paladín | 77% | 131 | 0,4 | 75 | 1,9 |
| Asesino | 43% | 36 | 3,9 | 6 | 6,5 |
| Arquero | 3% | 32 | 3,5 | 2,5 | 7,1 |
| Mago | 13% | 28 | 3,8 | 5,8 | 4,1 |
| Hechicero | 3% | 21 | 3,9 | 4,5 | 0,2 |

- **Con el Guerrero o el Paladín en el Frente,** en cuanto cae el aliado tanque el guardián le pega al jugador, que
  encaja de 290 a 560 por golpe: bloqueo, resistencia, curaciones propias y pociones sin límite. Los aliados de atrás
  sobreviven y la pelea dura 80-130 rondas.
- **Con una senda de retaguardia,** el guardián pega de 1.700 a 3.700 a cada aliado, los mata uno a uno y después
  acaba con el jugador, que está solo.
- **Prueba:** bajar a la mitad el ataque del guardián del 65 sube a todas las sendas al 97-100%; bajar a la mitad su
  vida, solo al 51-96%.

Lo que funciona es restar daño al enemigo, porque protege a todo el grupo. Por eso Ralentizado y Mermado.

## 4. Valores elegidos [estimación, medido]

| Lote (escala de `c4`, 3 sendas) | Completado Arquero / Mago / Hechicero en 61-69 | Ídem en 71-79 | Jefe 80 Arq / Mag / Hec |
|---|---|---|---|
| Ralentizado -25%, Mermado -35% | 28 / 16 / 13 | 25 / 16 / 19 | 54 / 20 / 11 |
| + escudo 25% (+10%), Paso atrás 10%, sin tope de Veneno, Drenaje +15% por enemigo (`s1`) | 28 / 15 / 18 | 21 / 15 / 17 | 44 / 20 / 22 |
| Ralentizado -35%, Mermado -45% (`s2`) | 46 / 20 / 21 | 30 / 23 / 28 | 60 / 37 / 17 |

- **Escudo, curaciones y tope de Veneno** no cambian nada que se pueda medir. Se quedan con los números del plan.
- **Paso atrás al 12%** (`a1`, 816 recorridos de Arquero): dentro del ruido frente al 4%.
- **Penetración visible de 10 para el Arquero** (`a2`): +6 puntos en 21-39 y +5 en 61-69, pero jefe 80 del 52 al 68%.
  No la apliqué (el plan la quita); queda como opción si se quiere subir al Arquero en 21-39.
- **Elegido:** Ralentizado -30% y Mermado -40%, un punto intermedio entre acercar 61-79 y no disparar a las tres sendas
  contra los jefes.

## 5. Factores de escala (tocados)

Factor sobre el valor que dejó la calibración del 17, en vida y ataque a la vez:

| Década | Salas | Guardián | Jefe de década |
|---|---|---|---|
| 21-29 | ×1,024 (4.21 → 4.31) | ×1,088 (2.94 → 3.20) | 30: ×1,031 (2.25/2.13 → 2.32/2.20) |
| 31-39 | ×1,014 (6.22/7.18 → 6.31/7.28) | ×1,145 (4.37/4.91 → 5.00/5.62) | 40: ×1,093 (2.34/2.21 → 2.56/2.42) |
| 41-49 | ×1,011 (2.74 → 2.77) | grupo de la Isla: `PARAISO_GUARDIAN_GROUP` ×0,982 (1.08 → 1.06) | 50: ×1,05 (1.27/1.30 → 1.33/1.37) |
| 51-59 | ×1,025 (normal 4.81/6.98 → 4.93/7.16; élite 4.58/6.45 → 4.69/6.61) | ×1,201 (4.48/5.24 → 5.38/6.29) | 60: ×1,184 (3.78/4.20 → 4.48/4.97) |
| 61-69 | ×1,042 (4.99/7.57 → 5.20/7.89) | ×1,175 (3.53/4.47 → 4.15/5.25) | 70: ×1,155 (2.90/3.21 → 3.35/3.71) |
| 71-79 | ×1,011 (4.92/7.54 → 4.97/7.62) | ×1,182 (3.54/4.46 → 4.19/5.27) | 80: ×1,096 (2.79/3.03 → 3.06/3.32) |

- **Cuentas alfa** (`DECADE_ENEMY_TUNING[2-3]` y jefes 30 y 40 de `DECADE_BOSS_TUNING`): mismos factores, sin medir
  aparte (como el día 17).
- **Sin tocar:** 1-20, 81-100 y `GUARDIAN_ELITE_81`.

**Medias por década, después** (`final`; entre paréntesis, `final_tv` con la tabla oficial; ± error estándar ≈ 1-1,4):

| Década | Llegar al guardián (obj.) | Guardián (obj.) | Completado | Jefe (obj.) |
|---|---|---|---|---|
| 21-29 | 85,9 (85,4) / 85 | 84,3 (88,2) / 85 | 72,5 | 30: 82,1 (82,1) / 80 |
| 31-39 | 87,2 (86,1) / 85 | 83,1 (82,5) / 80 | 73,0 | 40: 75,0 (73,0) / 75 |
| 41-49 | 80,2 (82,3) / 80 | 80,5 (78,1) / 75 + 5 = 80 | 65,8 | 50: 71,1 (67,4) / 70 |
| 51-59 | 79,7 (81,3) / 80 | 52,2 (54,4) / 55 | 43,1 | 60: 46,8 (51,0) / 50 |
| 61-69 | 76,6 (75,2) / 75 | 45,2 (48,5) / 45 | 36,6 | 70: 42,6 (40,4) / 40 |
| 71-79 | 78,6 (76,0) / 75 | 36,0 (34,3) / 35 | 30,5 | 80: 30,6 (25,7) / 30; con 1.200 combates, 32,2 |

- **Guardián:** el objetivo es el del jefe de su década +5, como se pidió (85 / 80 / 75 / 55 / 45 / 35). En 41-49 la
  calibración del 17 usaba 75; lo he dejado en 75-80.
- **Antes** (`base0`): llegar 86 / 87 / 79 / 78 / 78 / 75; guardián 87 / 84 / 72 / 58 / 46 / 36; jefes 83 / 71 / 71 / 48 /
  44 / 27.

## 6. Reparto por senda [medido]

En **negrita**, más de 15 puntos de distancia de la media de las seis sendas.

### 6.1 Antes de los kits (`base0`)

| Década | Medida | Guerrero | Paladín | Asesino | Arquero | Mago | Hechicero | Media | Objetivo |
|---|---|---|---|---|---|---|---|---|---|
| 21-29 | Completado | **98** | 89 | 65 | **58** | 71 | 73 | 76 |  |
| 21-29 | Llega | 99 | 94 | 83 | 75 | 81 | 85 | 86 | 85 |
| 21-29 | Guardián | 99 | 95 | 78 | 76 | 88 | 87 | 87 | 85 |
| 30 | Jefe | 97 | 86 | **62** | 70 | 96 | 87 | 83 | 80 |
| 31-39 | Completado | **98** | **89** | 63 | **56** | 62 | 74 | 74 |  |
| 31-39 | Llega | 99 | 94 | 80 | 76 | 82 | 90 | 87 | 85 |
| 31-39 | Guardián | **99** | 94 | 79 | 73 | 75 | 82 | 84 | 80 |
| 40 | Jefe | **90** | 67 | 69 | **43** | 71 | 86 | 71 | 75 |
| 41-49 | Completado | 72 | 61 | 47 | 47 | 58 | 65 | 58 |  |
| 41-49 | Llega | 88 | 79 | 77 | 70 | 79 | 81 | 79 | 80 |
| 41-49 | Guardián | 81 | 77 | 58 | 64 | 71 | 81 | 72 | 75 |
| 50 | Jefe | **52** | **38** | 81 | 73 | **86** | **94** | 71 | 70 |
| 51-59 | Completado | **79** | **70** | 39 | **30** | **27** | 38 | 47 |  |
| 51-59 | Llega | 88 | 83 | 68 | 77 | 69 | 82 | 78 | 80 |
| 51-59 | Guardián | **90** | **84** | 54 | **38** | **38** | 45 | 58 | 55 |
| 60 | Jefe | **82** | 34 | 53 | 38 | 33 | 46 | 48 | 50 |
| 61-69 | Completado | **86** | **68** | 31 | **16** | **11** | **18** | 38 |  |
| 61-69 | Llega | **94** | 89 | 73 | 81 | **55** | 75 | 78 | 75 |
| 61-69 | Guardián | **92** | **77** | 43 | **21** | **22** | **24** | 46 | 45 |
| 70 | Jefe | **84** | **69** | 29 | **27** | 29 | **24** | 44 | 40 |
| 71-79 | Completado | **84** | **51** | **14** | **3** | **8** | 16 | 29 |  |
| 71-79 | Llega | **92** | 75 | 66 | 73 | 69 | 72 | 74 | 75 |
| 71-79 | Guardián | **92** | **69** | **20** | **5** | **10** | **21** | 36 | 35 |
| 80 | Jefe | **70** | 29 | **11** | **0** | 19 | 35 | 27 | 30 |

### 6.2 Después de los kits y la recalibración (`final`)

| Década | Medida | Guerrero | Paladín | Asesino | Arquero | Mago | Hechicero | Media | Objetivo |
|---|---|---|---|---|---|---|---|---|---|
| 21-29 | Completado | **93** | 74 | **53** | 63 | 74 | 78 | 72 |  |
| 21-29 | Llega | 98 | 93 | 82 | 80 | 83 | 80 | 86 | 85 |
| 21-29 | Guardián | 95 | 80 | **65** | 80 | 89 | 98 | 84 | 85 |
| 30 | Jefe | 97 | 82 | **47** | **66** | **100** | **100** | 82 | 80 |
| 31-39 | Completado | **89** | **89** | **49** | **55** | 75 | 81 | 73 |  |
| 31-39 | Llega | 96 | 94 | 84 | 80 | 86 | 83 | 87 | 85 |
| 31-39 | Guardián | 92 | 94 | **58** | 69 | 87 | 97 | 83 | 80 |
| 40 | Jefe | 87 | **59** | **51** | 78 | 87 | 88 | 75 | 75 |
| 41-49 | Completado | **81** | 57 | **46** | 61 | **81** | 69 | 66 |  |
| 41-49 | Llega | 87 | 70 | 77 | 78 | 90 | 78 | 80 | 80 |
| 41-49 | Guardián | 93 | 81 | **58** | 76 | 89 | 87 | 81 | 75 |
| 50 | Jefe | **46** | **24** | 79 | **87** | **97** | **94** | 71 | 70 |
| 51-59 | Completado | **70** | 52 | **14** | **27** | 39 | 57 | 43 |  |
| 51-59 | Llega | 91 | 76 | 67 | 87 | 79 | 78 | 80 | 80 |
| 51-59 | Guardián | **77** | **68** | **18** | **30** | 47 | **72** | 52 | 55 |
| 60 | Jefe | 59 | **12** | **22** | 40 | 54 | **94** | 47 | 50 |
| 61-69 | Completado | **80** | 47 | **15** | 36 | **18** | 22 | 36 |  |
| 61-69 | Llega | **95** | **93** | 72 | 76 | **61** | 64 | 77 | 75 |
| 61-69 | Guardián | **85** | 50 | **22** | 48 | 30 | 35 | 45 | 45 |
| 70 | Jefe | **66** | 51 | **15** | 37 | 38 | 49 | 43 | 40 |
| 71-79 | Completado | **64** | **48** | **8** | 27 | 16 | 20 | 30 |  |
| 71-79 | Llega | **96** | 82 | 64 | 81 | 83 | 66 | 79 | 75 |
| 71-79 | Guardián | **67** | **58** | **12** | 31 | **19** | 29 | 36 | 35 |
| 80 | Jefe | 38 | 25 | **7** | **51** | 41 | 21 | 30 | 30 |

Cada casilla de nivel: 68 recorridos por senda y nivel (unos 200 por década y senda, ±3 puntos). Cada jefe: 100
combates por senda (±4-5 puntos).

### 6.3 Distancia a la media de las tres sendas (antes → después)

| Década | Arquero: completado / guardián | Mago: completado / guardián | Hechicero: completado / guardián |
|---|---|---|---|
| 21-29 | -18 / -11 → -9 / -4 | -5 / +1 → +2 / +5 | -3 / 0 → +6 / +14 |
| 31-39 | -18 / -11 → **-18** / -14 | -12 / -9 → +2 / +4 | 0 / -2 → +8 / +14 |
| 41-49 | -11 / -8 → -5 / -5 | 0 / -1 → +15 / +8 | +7 / +9 → +3 / +6 |
| 51-59 | -17 / -20 → **-16** / **-22** | -20 / -20 → -4 / -5 | -9 / -13 → +14 / **+20** |
| 61-69 | -22 / -25 → 0 / +3 | -27 / -24 → **-18** / -15 | -20 / -22 → -14 / -10 |
| 71-79 | -26 / -31 → -3 / -5 | -21 / -26 → -14 / **-17** | -13 / -15 → -10 / -7 |

| Jefe | Arquero (antes → después) | Mago | Hechicero | Media después |
|---|---|---|---|---|
| 30 | 70 → 66 (**-16**) | 96 → 100 (**+18**) | 87 → 100 (**+18**) | 82 |
| 40 | 43 → 78 (+3) | 71 → 87 (+12) | 86 → 88 (+13) | 75 |
| 50 | 73 → 87 (**+16**) | 86 → 97 (**+26**) | 94 → 94 (**+23**) | 71 |
| 60 | 38 → 40 (-7) | 33 → 54 (+7) | 46 → 94 (**+47**) | 47 |
| 70 | 27 → 37 (-6) | 29 → 38 (-5) | 24 → 49 (+6) | 43 |
| 80 | 0 → 51 (**+21**) | 19 → 41 (+11) | 35 → 21 (-9) | 30 |

**Quedan fuera de ±15:**

- **Arquero:**
  - 31-39 (-18 en completado). Sigue sin su penetración; la opción de la sección 4 lo deja en -10;
  - 51-59 (-16 y -22): pierde en los guardianes 55 y 57.
- **Mago en 61-69:**
  - -18 en completado y -16 en "llegar";
  - muere en las salas de la Ley del Caos (seguramente las leyes de inmunidad mágica, que le dejan sin daño; no lo he
    medido aparte).
- **Hechicero, por arriba:**
  - guardián de 51-59 (+20);
  - jefe 60 (+47): el Mermado del 40% fijo sobre Storm Gush le viene muy bien.
- **Jefes 30 y 50, por arriba,** para las tres. El jefe 50 ya estaba al revés antes (Guerrero 52, Paladín 38). Ahora
  la media sube, la escala del Custodio sube y los tanques bajan aún más (46 y 24).

## 7. Guerrero y Paladín: siguen muy por encima

**Guerrero, distancia a la media en completado:** +21, +16, +15, +27, +44 y +34. **Paladín:** +2, +16, -9, +9, +11 y
+18. También el guardián de 51-59 (+16) y "llegar" en 61-69 (+16).

**Causa** [medido, sección 3]:

- **El Frente encaja casi sin daño.** Desde el 61, el enemigo pega siempre al primer aliado de Frente y después al
  jugador si está en el Frente (`frontlineTarget`). El Guerrero recibe un tercio o menos del daño que reciben los
  aliados (bloqueo, resistencia y "Último Bastión").
- **Se cura sin parar,** con pociones sin límite (7 por combate contra el guardián), Grito de guerra, Piedra de Vigor
  y Caídos.
- **El resultado** son combates de 80-130 rondas en los que los aliados no mueren. Subir el guardián casi no les afecta
  (Guerrero en el guardián de 61-69: del 92 al 85 tras subir la escala un ×1,175). Las tres sendas de retaguardia sí lo
  notan.
- **Así,** mientras la media mande, cuanto más arriba estén los tanques, más abajo quedan los demás.

**Propuestas visibles (sin aplicar)** [estimación]:

1. **Furia de los guardianes y jefes de 51-80:** a partir de la ronda 25, +5% de daño por ronda, con un aviso en el
   registro y un estado "Furia" con su texto. Corta las victorias por aguante de 80-130 rondas, que solo consiguen los
   tanques. A las demás sendas casi no les afecta: pierden o ganan antes de la ronda 40.
2. **Una habilidad escrita para los guardianes de 61-79,** por ejemplo "Golpe perforante: ignora el bloqueo y la mitad
   de la resistencia física", con su enfriamiento. Sustituye de forma visible lo que hacían `TANK_TUNE.blockPierce` y
   `GUARDIAN_VS_FRONT`, pero le pega a quien golpee (también a los aliados). A quien más le quita es a quien vive del
   bloqueo y la resistencia.
3. **Los recortes del propio plan que bajan el aguante:**
   - Bloqueo con tope total del 25%;
   - Escudo del Juramento: como mucho 2 por combate;
   - la curación de Juicio Divino cuenta como mucho 3 enemigos.

   No recomiendo sus compensaciones contra los jefes (Rompeguardia, Golpe Consagrado +15%, Muro de Fe +1 turno). Los
   tanques ya ganan de sobra en guardianes y jefes, salvo el Paladín en los jefes 50 y 60.
4. **Si se decide limitar la mochila** (por ejemplo, 3 pociones por combate, a la vista en la mochila), les afectaría
   más a ellos, que viven de beber en combates largos. Habría que recalibrar 21-80 entero (calibración del 17,
   sección 7, punto 2).

Con 1 y 2, la media bajaría por arriba y la escala de las décadas podría bajar, lo que subiría a la retaguardia y al
Asesino.

## 8. 1-20 y 81-90 (los kits valen en todos los pisos) [medido]

**Misma tabla oficial en las dos columnas.** "Antes" es `f802a7c`, servido aparte en otro puerto. **Por código:** las
tablas de enemigos de 1-20 y 81-100 no cambian; lo que cambia son los kits.

**81-90** (1.020 recorridos por nivel y 1.200 combates de jefe; todas las sendas):

| Celda | Antes (media; Arq / Mag / Hec) | Después |
|---|---|---|
| Nivel 83 completado | 21,4 (16 / 22 / 29) | 28,7 (35 / 47 / 32) |
| Nivel 85 completado | 24,3 (19 / 14 / 16) | 27,7 (24 / 24 / 26) |
| Nivel 87 completado | 12,3 (9 / 7 / 28) | 17,6 (24 / 29 / 22) |
| Jefe 90 (El Carcelero) | 20,1 (6 / 11 / 6) | **35,1 (56 / 52 / 16)** |

- **Guerrero, Paladín y Asesino** no cambian (dentro del ruido).
- **El jefe 90** se calibró con la regla de ariochbu de "ninguna senda por encima del 20%". El Arquero y el Mago pasan
  ahora del 50% (el Ralentizado le quita al Carcelero el 30% del daño). Hay que decidir si se recalibra 81-90 o si el
  Ralentizado resta menos a partir del 81. Si se elige lo segundo, tendría que estar escrito en su texto. Tampoco he
  medido 91-100.

**1-20, referencia del simulador** (Rango B; 408 recorridos y 600 combates): sin cambios.

| Celda | Antes | Después |
|---|---|---|
| Nivel 5 | 99,3 | 100 |
| Nivel 15 | 99,8 | 99,8 |
| Jefe 10 | 98,3 | 98,2 |
| Jefe 20 | 100 | 99,8 |

**1-20, referencia de jugador nuevo.** Es la estimación del día 17: poco común en el 5, raro en el 8-10 y Rango B en
el 15-20; piedras E y F; Caídos poco comunes y raros; 0 aliados hasta el 10 y 1 después; 3 pociones de vida mayor.
Muestra: 204 recorridos y 300 combates.

| Celda | Antes | Después |
|---|---|---|
| Nivel 5 completado | 75,0 | 76,5 (Arquero 62 → 91; el Asesino 79 → 53, dentro del ruido de 34 recorridos) |
| Nivel 8 | 82,4 | 84,8 |
| Jefe 10 (Ogro) | 76,0 | **90,7** (Arquero 32 → 76, Hechicero 86 → 98) |
| Nivel 15 | 94,6 | 95,6 |
| Nivel 18 | 96,1 | 94,6 |
| Jefe 20 | 86,3 | 87,7 |

El Ogro vuelve a quedar cerca de como estaba antes de quitar los invisibles (88,7%). En el Arquero se nota la Lluvia
con Ralentizado.

## 9. Qué queda dudoso

1. **Ralentizado -30% y Mermado -40% son números míos.** No vienen del plan. Son fuertes contra los jefes, sobre todo
   el Mermado del Hechicero en el jefe 60. Si se prefiere repartir de otra forma, todo está en `KIT_RETAGUARDIA`, y con
   `__kits` se prueba sin tocar el archivo.
2. **El reparto en 61-79 no puede cerrarse sin tocar a los tanques** (sección 7). Por eso el Mago en 61-69 y el
   Arquero en 51-59 siguen fuera de ±15.
3. **El Asesino empeora** con la subida de escala (completa el 14% en 51-59 y el 8% en 71-79). El plan tiene cambios
   para él (sangrado contagioso, robo de vida en Danza, evasión con rendimientos decrecientes). Sería lo siguiente.
4. **81-90 sin recalibrar,** con el jefe 90 al 35% de media y el Arquero y el Mago por encima del 50%. Tampoco he medido
   91-100 ni los rifts, a los que también llegan los kits.
5. **La IA que aprende:**
   - la tabla nueva parte de la oficial y suma 3 rondas con los kits (Ralentizado -25% y Mermado -35%; la versión final
     usa -30% y -40%);
   - las medias con la tabla nueva y con la oficial se separan hasta 4 puntos (sección 5);
   - con la oficial, el Hechicero no bebía contra los guardianes de 61-69, una trampa de aprendizaje; con la nueva, sí.
6. **Cambios de política del simulador** (sección 1.2). Son razonables, pero hacen que el simulador juegue esas sendas
   mejor que antes. Parte de la mejora viene de ahí y no solo del kit. Con la corrección del tope de Veneno, el
   Hechicero de antes también rendiría algo más en jefes.
7. **Drenaje desde el nivel 1:** no aplicado (sección 1.1). Hay que confirmarlo con ariochbu.
8. **Barrera arcana:** su texto sale en la pantalla de elegir clase y en el registro de cada combate, pero no en la Ficha
   (no hay sitio para pasivas de senda). Habría que añadirlo si se quiere verlo después de crear el personaje.
9. **No rehíce la foto `__snapshot`.** Por código, la escala de 1-20 y 81-100 no cambia y los kits no tocan las
   estadísticas del jugador. Las partidas con semilla de 1-20 y 81-100 sí cambiarán para las tres sendas.
10. **Cuentas alfa en 21-40:** mismos factores que la beta, sin medir (como el día 17).

## 10. Cómo repetirlo

Desde `tools/medicion_headless/`, con un puerto libre (yo usé 5311):

```sh
python server.py "<ruta del repo>" 5311                      # en otra consola
curl -X POST 127.0.0.1:5311/__learnload --data-binary @../mediciones/aprendizaje-kits-retaguardia-2026-10-17.json
curl -X POST 127.0.0.1:5311/__config -d "{\"learnReady\":true}"
python ctl.py 5311 workers 28
python cal.py 5311 run final "{\"cells\":[[\"level\",23],[\"level\",25],[\"level\",27],[\"level\",33],[\"level\",35],[\"level\",37],[\"level\",43],[\"level\",45],[\"level\",47],[\"level\",53],[\"level\",55],[\"level\",57],[\"level\",63],[\"level\",65],[\"level\",67],[\"level\",73],[\"level\",75],[\"level\",77],[\"boss\",30],[\"boss\",40],[\"boss\",50],[\"boss\",60],[\"boss\",70],[\"boss\",80]],\"n\":408,\"nb\":600}"
python dec.py final                 # medias por década
python tabla.py final               # tabla por década y senda (python tabla.py base0 plan1: el segundo lote pisa sendas del primero)
python ctl.py 5311 kill
```

- **Probar kits sin tocar el código:** añadir a la especificación `"kit":{"lentoMenosDano":0.2,"drenajeMerma":0.3}` y,
  si se quiere, `"styles":["tirador","mago","hechicero"]`. Una vuelta de 3 sendas tarda 45-90 segundos con 28
  pestañas.
- **Combates sueltos contra el guardián:** celda `["boss",65]` (para un piso que no es de jefe, `__sim` pelea contra
  su guardián).
- **Depurar un combate:** `python dbg.py 5311 archivo.js`, donde `archivo.js` es el cuerpo de una función async que
  recibe `W` (window) y `cfgOf`. Por ejemplo, `W.__simLog = []; await W.__sim(cfgOf('mago', null, 65, {node:'jefe'}));
  return W.__simLog.join('\n');`.
- **Antes y después:** `git archive f802a7c | tar -x -C <carpeta>` y `python server.py <carpeta> 5312`. El `worker.js`
  nuevo funciona con el código viejo.
- **Calibrar la escala:**
  - los factores se pasan como `"tune"` (ver `applyTune` en `worker.js`);
  - en cada vuelta: medir, pasar a logit, mover cada factor por interpolación (salas para "llegar", guardián para el
    guardián y jefe para el jefe), con un tope de ±25% por vuelta y la secante de las dos últimas vueltas;
  - el guardián de 41-49 se mueve con `PARAISO_GUARDIAN_GROUP`.
- **Tabla de aprendizaje nueva con los kits:**
  1. `__learnload` con la tabla oficial;
  2. `__config` con `{"learnReady":false}`;
  3. lanzar las pestañas: cada una entrena 3 rondas y envía su tabla, que se suma;
  4. cuando `/__learnstat` dé 24 envíos, guardar `/__learn.json` y poner `{"learnReady":true}`.
