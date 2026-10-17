# Nerf de Guerrero y Paladín y escala de 21-80 (2026-10-17)

Rama `nerf-tanques`, creada desde `origin/kits-retaguardia` (`5d48234`).

- **No se hizo:** no se desplegó nada, no se tocó Supabase y no se fusionó a `main`.
- **SQL:** no hace falta ninguno. Todo el cambio está en `src/game.js` (código del cliente) e `index.html` (`game.js?v=387`).
- **Marcas:** **[código]** leído de `src/game.js`; **[medido]** simulador; **[estimación]** número o decisión mía.
- **Datos crudos:** `tools/mediciones/nerf-tanques-2026-10-17.json` (resumen por celda y senda de cada lote, con sus factores).
- **Tabla de aprendizaje:** la de los kits (`aprendizaje-kits-retaguardia-2026-10-17.json`), sin tocar.

## 0. Resumen

1. **Los tres cambios están aplicados y todos se ven en el juego** (sección 1):
   - **Furia** de guardianes y jefes de década de 51-80: desde la ronda 25, +5% de daño por ronda, **con tope de +30%**
     (ronda 30). Estado «Furia xN» en el enemigo, aviso 2 rondas antes y al entrar, y frase en las reglas de la década.
     El tope es un ajuste mío: sin él, Guerrero y Paladín caían al 0-5% en 51-80 (sección 3).
   - **Golpe perforante** de los guardianes de piso de 61-79: cada 3 turnos, un golpe que ignora el bloqueo y la mitad
     de la resistencia física. Estado visible en el guardián, aviso al empezar el combate y frase en las reglas.
   - **Recortes del plan:** bloqueo con tope del 25% (antes 60%), Escudo del Juramento 2 veces por combate y Juicio
     Divino cura por 3 enemigos como mucho. Sin las compensaciones contra jefes.
2. **51-80: Guerrero y Paladín quedan a 15 puntos o menos de la media** en niveles completados, guardián y jefes, salvo
   tres casillas (sección 4):
   - Guerrero, completado en 61-69: +18 (antes +47). Le sobra al llegar al guardián, en las salas, donde no actúa nada
     de lo decidido.
   - Paladín, jefe 60: -24 (antes -38). Ya estaba por debajo.
   - Jefe 50 (Guerrero -25, Paladín -41): ya era así antes y queda fuera del alcance de la Furia (51-80).
3. **21-49 casi no cambia para los tanques.** Ahí solo actúan los recortes, y no muerden: el Guerrero de referencia
   lleva un 21% de bloqueo, por debajo del tope. Ni con un tope del 15% se mueve (sección 5). El Guerrero sigue en +21 y
   +23 en niveles completados de 21-29 y 31-39.
4. **Escala recalibrada:** las 24 medias (llegar, guardián y jefe en las seis décadas) quedan a 3 puntos o menos del
   objetivo (sección 6).
5. **Efectos en las demás sendas** (sección 4.3):
   - El Hechicero y el Mago pasan a estar por encima en los guardianes de 61-79 y en el jefe 70 (+14 a +28);
   - el **Asesino baja más**: guardián de 61-69 al 9% (-37) y de 71-79 al 1% (-33). Va con dos tanques aliados al
     frente, y el Golpe perforante se los come.
6. **1-20 y 81-90** (sección 7):
   - 1-20 con la referencia del simulador no cambia;
   - con la de jugador nuevo, todo queda dentro del ruido;
   - en 81-90 las medias no cambian; el Paladín baja algo (jefe 90: del 15 al 8%).

## 1. Cambios en el código (antes → después, texto visible)

Todo está en `NERF_TANQUES`, junto a `TANK_TUNE`. `window.__nerfTanques({...})` (solo localhost) prueba otros valores sin
tocar el archivo (una clave a `null` quita ese cambio; `__nerfTanques(null)` vuelve a los del código).

| Qué | Antes | Después (lo que ve el jugador) | Origen |
|---|---|---|---|
| **Furia** (guardianes y jefes de década, pisos 51-80; no escoltas, ni invocaciones, ni jefes de rift) | — | Al acabar la ronda 22: *«X se impacienta: dentro de 2 rondas entrará en Furia.»*<br>Desde la ronda 25: *«⚠ X entra en Furia: desde esta ronda pega un 5% más por cada ronda que pase, hasta un +30%.»*<br>Estado «Furia xN (∞)» en el enemigo, cuyo texto es *«Lleva demasiado tiempo peleando: desde la ronda 25 pega un 5% más por cada ronda, hasta un +30%. Hoy: +N% de daño.»* | ariochbu; el tope de +30% es mío (sección 3) |
| **Golpe perforante** (guardianes de piso de 61-79; no los jefes 70 y 80) | `GUARDIAN_VS_FRONT` y `TANK_TUNE.blockPierce`, ocultos y apagados en 1-80 desde la calibración del 17 | Al empezar el combate: *«⚠ X cada 3 turnos usa Golpe perforante: ignora el bloqueo y la mitad de la resistencia física de su objetivo.»* Estado «Golpe perforante (∞)» en el guardián con ese texto. En el registro: *«X usa Golpe perforante: N de daño.»*<br>Golpea a quien le toque (el frente: un tanque aliado o tú), con el daño de su ataque normal (×1,0) | ariochbu; enfriamiento 3 y daño ×1,0 míos |
| **Reglas de la década** (botón del mapa) | — | Marea (51-60), Ley del Caos (61-70) y Corrupción (71-80) suman *«Furia: desde la ronda 25, el guardián y el jefe de la década pegan un 5% más por cada ronda que pase, hasta un +30% (lo ves como el estado «Furia» y te avisa 2 rondas antes).»* Ley del Caos y Corrupción suman *«Golpe perforante: los guardianes de piso (no el jefe de la década) cada 3 turnos usan Golpe perforante: …»* | mío |
| **Tope de bloqueo** (todas las fuentes, también aliados y defendiéndote) | 60% | 25%. En la ficha: «Bloqueo (tope 25%)» cuando lo alcanzas | plan |
| **Escudo del Juramento** | *«Te otorga un escudo equivalente al 25% de tu vida máxima.»* Sin límite | *«… Como mucho 2 veces por combate.»* En el botón: «20 Espíritu · 0/2», y después «Agotado (2/2)» | plan |
| **Juicio Divino** | *«… te cura el 25% de todo lo infligido.»* | *«Golpea a todos los enemigos y te cura el 25% de lo infligido a 3 enemigos como mucho (los primeros que golpea).»* | plan |
| Compensaciones del plan (Rompeguardia, Golpe Consagrado +15%, Muro de Fe +1 turno) | — | **No aplicadas**, como se pidió | — |

**Simulador:** no sabe usar un tercer Escudo del Juramento (lo descarta como si no pudiera pagarlo). No hay ningún
otro cambio de política.

**Herramientas** (`tools/medicion_headless/`):
- `worker.js` y `cal.py` aceptan `"nerf":{...}` por lote (lo pasan a `__nerfTanques`);
- `juntar.py` suma lotes del mismo código (para tener doble muestra);
- `distancia.py` saca la tabla de distancia a la media antes → después.

## 2. Referencia comprobada (sin cambiar)

| Qué | Comprobado en el código |
|---|---|
| Refuerzo de aliados | `ALLY_BOOST = {to:80, hpMult:1.5, parity:true, rearAoe:0.5}`; `ALLY_TEST` con `hpMult`, `parity` y `rearAoe` a `null` (sigue la regla). En 1-80: vida ×1,5, paridad de defensas, área de guardianes y jefes al 50% en la retaguardia aliada mientras haya frente |
| Aliados de las sendas de retaguardia | `SIM_REAR_STYLES = ['tirador','mago','hechicero','doblefilo']` usan `SIM_ALLIES_REAR` = Aldric, Delyth, Brann, Fennwick |
| Aliados de Guerrero y Paladín | `SIM_ALLIES` = Aldric, Delyth, Neira, Fennwick |
| Cuántos aliados | `refFor`: 2 en 21-30, 3 en 31-40 y 4 desde el 41. El orden importa: con 2 aliados todas las sendas llevan Aldric y Delyth. El doble tanque de la retaguardia empieza en el 31 |
| Mochila, IA y muestra | `potionsAll: 10000`, IA que aprende (`eps 0,10`) con la tabla de los kits; 408 recorridos por nivel (x3, x5, x7) y 600 combates por jefe |
| Muestra final | **Doble**: el antes y el después se midieron dos veces cada uno y se sumaron (816 recorridos por nivel y 1.200 combates por jefe; unos 400 por década y senda y 200 combates por jefe y senda) |

## 3. Cómo se eligieron los números [medido]

**Duración de los combates contra el guardián sin Furia** (16 combates por senda y piso):
- **Arquero, Mago y Hechicero** ganan en 23-75 rondas (el Arquero, algunas veces hasta 110-150) o pierden antes.
- **Guerrero:** 50-120 rondas en 55, 65-75 y 67; hasta 200-350 contra el 57 y los jefes 60 y 80.
- **Paladín:** 60-390 rondas.

Cualquier Furia sin tope convierte esas victorias largas en derrotas.

**Variantes, todas con Golpe perforante y sin recalibrar la escala** (por eso las medias salen bajas; lo que importa es la
distancia prevista de los tanques una vez la escala devuelva la media a su objetivo, calculada desplazando todas las
sendas por igual en escala logit):

| Furia | Guardián 51-59 (Gue / Pal / media) | Guardián 61-69 | Guardián 71-79 | Distancia prevista Gue / Pal (guardián 61-69) |
|---|---|---|---|---|
| Sin Furia (`v_perf`) | 74 / 75 / 53 | 50 / 27 / 23 | 30 / 28 / 18 | +31 / +8 |
| Desde la 25, +5%, sin tope (lo pedido, `n1`) | 8 / 1 / 24 | 0 / 0 / 9 | 0 / 0 / 2 | por debajo del todo |
| Desde la 35, +2% (`v_f35_2`) | 32 / 13 / 35 | 5 / 0 / 9 | 0 / 0 / 5 | -8 / -31 |
| Desde la 40, +3% (`v_f40_3`) | 28 / 8 / 32 | 6 / 0 / 10 | 0 / 0 / 6 | -6 / -32 |
| Desde la 50, +5% (`v_f50_5`) | 21 / 4 / 32 | 3 / 4 / 14 | 0 / 0 / 5 | -26 / -19 |
| Desde la 25, +5%, tope +50% (calibrado, `c1c`) | 58 / 36 / 56 | 37 / 26 / 42 | 19 / 26 / 38 | -4 / -16; en 71-79, -19 / -12 |
| **Desde la 25, +5%, tope +30%** (elegido, `c2a`) | 68 / 65 / 65 | 55 / 41 / 48 | 39 / 53 / 44 | +7 / -6 |

- **Sin tope**, la Furia castiga sobre todo al Paladín, que gana los combates más largos, y lo deja por debajo del resto.
- **El tope de +30%** es el que deja a los dos tanques más cerca de la media. Lo que no se cambió: la ronda 25 y el +5%
  por ronda, que son los de ariochbu.
- **Golpe perforante:** enfriamiento 3 y daño ×1,0 (el de su ataque normal). No probé otros valores.

**Qué aporta cada cambio**, con la escala final (408 recorridos y 600 combates; distancia a la media en el guardián):

| Lote | Gue 51-59 | Gue 61-69 | Gue 71-79 | Pal 51-59 | Pal 61-69 | Pal 71-79 | Media del guardián 51 / 61 / 71 |
|---|---|---|---|---|---|---|---|
| Todo (final) | +7 | +9 | -7 | -4 | -6 | -1 | 56 / 46 / 34 |
| Sin Furia (`w_nofuria`) | +17 | +29 | +19 | +9 | -2 | +27 | 70 / 58 / 56 |
| Sin Golpe perforante (`w_noperf`) | +10 | +22 | +23 | +4 | +15 | +6 | 57 / 69 / 55 |
| Sin los recortes (`w_nocuts`) | +11 | +7 | -5 | -5 | -9 | -11 | 57 / 47 / 38 |

Los recortes no mueven nada que se pueda medir. La Furia y el Golpe perforante, sí.

## 4. Reparto por senda [medido]

En **negrita**, más de 15 puntos de distancia de la media de las seis sendas. Antes: código de `5d48234` (lotes `b_main` +
`b_main2`). Después: código final (`fin3` + `fin4`).

### 4.1 Antes

| Década | Medida | Guerrero | Paladín | Asesino | Arquero | Mago | Hechicero | Media | Objetivo |
|---|---|---|---|---|---|---|---|---|---|
| 21-29 | Completado | **96** | 73 | **54** | 64 | 81 | 80 | 75 |  |
| 21-29 | Llega | 98 | 91 | 79 | 78 | 85 | 82 | 86 | 85 |
| 21-29 | Guardián | 98 | 81 | **69** | 81 | 95 | 98 | 87 | 85 |
| 30 | Jefe | 94 | 81 | **46** | 69 | **100** | **100** | 82 | 80 |
| 31-39 | Completado | **89** | 85 | **47** | **55** | 69 | 82 | 71 |  |
| 31-39 | Llega | 97 | 93 | 83 | 81 | 82 | 84 | 87 | 85 |
| 31-39 | Guardián | 91 | 91 | **57** | 68 | 84 | **97** | 81 | 80 |
| 40 | Jefe | 81 | 60 | **44** | 74 | 86 | **94** | 73 | 75 |
| 41-49 | Completado | 70 | 56 | 48 | 59 | **78** | 66 | 63 |  |
| 41-49 | Llega | 86 | 72 | 73 | 78 | 91 | 81 | 80 | 80 |
| 41-49 | Guardián | 81 | 76 | 62 | 74 | 85 | 80 | 76 | 75 |
| 50 | Jefe | **48** | **28** | 76 | **90** | **95** | **94** | 72 | 70 |
| 51-59 | Completado | **70** | 49 | **15** | 35 | 35 | 58 | 44 |  |
| 51-59 | Llega | 91 | 73 | 70 | 83 | 80 | 80 | 80 | 80 |
| 51-59 | Guardián | **76** | 67 | **22** | 41 | 44 | **71** | 54 | 55 |
| 60 | Jefe | 66 | **14** | **26** | 50 | 64 | **94** | 52 | 50 |
| 61-69 | Completado | **83** | 48 | **14** | 35 | **17** | **21** | 36 |  |
| 61-69 | Llega | **94** | **89** | 65 | 76 | **55** | 58 | 73 | 75 |
| 61-69 | Guardián | **88** | 54 | **22** | 46 | **29** | 37 | 46 | 45 |
| 70 | Jefe | **69** | 44 | **10** | 32 | 34 | 54 | 40 | 40 |
| 71-79 | Completado | **59** | 39 | **6** | 26 | 17 | 16 | 27 |  |
| 71-79 | Llega | **94** | 75 | 60 | 78 | 72 | 65 | 74 | 75 |
| 71-79 | Guardián | **63** | **50** | **10** | 33 | 22 | 23 | 34 | 35 |
| 80 | Jefe | 45 | 25 | **5** | **56** | 33 | 18 | 30 | 30 |

### 4.2 Después

| Década | Medida | Guerrero | Paladín | Asesino | Arquero | Mago | Hechicero | Media | Objetivo |
|---|---|---|---|---|---|---|---|---|---|
| 21-29 | Completado | **92** | 78 | **47** | 62 | 73 | 77 | 72 |  |
| 21-29 | Llega | 96 | 92 | 75 | 79 | 80 | 79 | 84 | 85 |
| 21-29 | Guardián | 96 | 85 | **64** | 79 | 91 | 97 | 85 | 85 |
| 30 | Jefe | 92 | 78 | **45** | **62** | **100** | **99** | 79 | 80 |
| 31-39 | Completado | **93** | 81 | **41** | **54** | 72 | 82 | 70 |  |
| 31-39 | Llega | 98 | 91 | 77 | 77 | 83 | 83 | 85 | 85 |
| 31-39 | Guardián | 95 | 89 | **54** | 70 | 86 | **98** | 82 | 80 |
| 40 | Jefe | 79 | 62 | **50** | 78 | **92** | 90 | 75 | 75 |
| 41-49 | Completado | 67 | 52 | **43** | 54 | **76** | 67 | 60 |  |
| 41-49 | Llega | 85 | 72 | 73 | 76 | 91 | 83 | 80 | 80 |
| 41-49 | Guardián | 79 | 70 | **56** | 69 | 82 | 79 | 72 | 75 |
| 50 | Jefe | **46** | **30** | 74 | **90** | **94** | **90** | 71 | 70 |
| 51-59 | Completado | 57 | 37 | **19** | 37 | 49 | **63** | 44 |  |
| 51-59 | Llega | 92 | 72 | 66 | 82 | 78 | 74 | 77 | 80 |
| 51-59 | Guardián | 63 | 52 | **29** | 45 | 62 | **84** | 56 | 55 |
| 60 | Jefe | 62 | **28** | **20** | 37 | 66 | **96** | 52 | 50 |
| 61-69 | Completado | **51** | 33 | **6** | 44 | 31 | 37 | 34 |  |
| 61-69 | Llega | **94** | 85 | 66 | 78 | **56** | 61 | 73 | 75 |
| 61-69 | Guardián | 55 | 40 | **9** | 57 | 56 | 60 | 46 | 45 |
| 70 | Jefe | 41 | 32 | **10** | 42 | **57** | **66** | 41 | 40 |
| 71-79 | Completado | 25 | 26 | **1** | 30 | 38 | 36 | 26 |  |
| 71-79 | Llega | **95** | 75 | 67 | 77 | 75 | 63 | 75 | 75 |
| 71-79 | Guardián | 27 | 33 | **1** | 38 | **50** | **56** | 34 | 35 |
| 80 | Jefe | 36 | 28 | **2** | **57** | **49** | 22 | 32 | 30 |

### 4.3 Distancia a la media, antes → después (las seis sendas)

| Década | Medida | Guerrero | Paladín | Asesino | Arquero | Mago | Hechicero | Media |
|---|---|---|---|---|---|---|---|---|
| 21-29 | Completado | **+21** → **+21** | -1 → +7 | **-21** → **-24** | -11 → -9 | +6 → +1 | +6 → +5 | 75 → 72 |
| 21-29 | Guardián | +11 → +11 | -6 → -0 | **-18** → **-22** | -6 → -6 | +8 → +6 | +11 → +12 | 87 → 85 |
| 30 | Jefe | +12 → +13 | -1 → -1 | **-36** → **-34** | -13 → **-17** | **+18** → **+21** | **+18** → **+20** | 82 → 79 |
| 31-39 | Completado | **+18** → **+23** | +14 → +10 | **-24** → **-29** | **-16** → **-16** | -2 → +1 | +11 → +11 | 71 → 71 |
| 31-39 | Guardián | +10 → +13 | +10 → +7 | **-25** → **-28** | -13 → -12 | +3 → +4 | **+16** → **+16** | 81 → 82 |
| 40 | Jefe | +8 → +4 | -13 → -13 | **-29** → **-25** | +1 → +3 | +13 → **+17** | **+21** → +15 | 73 → 75 |
| 41-49 | Completado | +7 → +7 | -7 → -8 | -15 → **-17** | -4 → -6 | **+15** → **+16** | +3 → +7 | 63 → 60 |
| 41-49 | Guardián | +4 → +6 | -1 → -2 | -14 → **-16** | -2 → -4 | +9 → +10 | +4 → +6 | 76 → 72 |
| 50 | Jefe | **-24** → **-25** | **-44** → **-41** | +4 → +3 | **+18** → **+19** | **+23** → **+23** | **+22** → **+19** | 72 → 71 |
| 51-59 | Completado | **+26** → +14 | +6 → -7 | **-29** → **-25** | -8 → -7 | -9 → +5 | +14 → **+20** | 44 → 44 |
| 51-59 | Guardián | **+23** → +7 | +13 → -4 | **-32** → **-27** | -13 → -11 | -9 → +6 | **+18** → **+28** | 54 → 56 |
| 60 | Jefe | +14 → +10 | **-38** → **-24** | **-26** → **-32** | -2 → -14 | +12 → +14 | **+42** → **+44** | 52 → 52 |
| 61-69 | Completado | **+47** → **+18** | +12 → -0 | **-22** → **-28** | -2 → +11 | **-20** → -3 | -15 → +3 | 36 → 34 |
| 61-69 | Guardián | **+42** → +9 | +8 → -6 | **-24** → **-37** | -0 → +11 | **-17** → +10 | -9 → +14 | 46 → 46 |
| 70 | Jefe | **+28** → -0 | +4 → -9 | **-30** → **-31** | -8 → +1 | -6 → **+16** | +14 → **+25** | 40 → 41 |
| 71-79 | Completado | **+31** → -1 | +12 → -0 | **-21** → **-25** | -1 → +4 | -10 → +12 | -12 → +10 | 27 → 26 |
| 71-79 | Guardián | **+29** → -7 | **+16** → -1 | **-23** → **-33** | -0 → +4 | -11 → **+16** | -11 → **+22** | 33 → 34 |
| 80 | Jefe | +15 → +4 | -5 → -4 | **-25** → **-30** | **+26** → **+25** | +3 → **+17** | -12 → -10 | 30 → 32 |

Error: unos ±2,5 puntos por casilla de década y senda, ±3,5 por jefe y senda.

**Qué queda fuera de ±15:**

- **Guerrero:**
  - 21-29 y 31-39, completado (+21 y +23). Ver la sección 5.
  - 61-69, completado (+18). Llega al guardián el 94% de las veces, frente a una media del 73%: la ventaja está en
    las salas. En el guardián ya está en +9.
  - Jefe 50 (-25): era así antes.
- **Paladín:**
  - jefe 50 (-41) y jefe 60 (-24), por debajo. El 50 ya era así antes (-44) y el 60 mejora (antes -38). La Furia no
    llega al jefe 50.
- **Asesino:** baja en todas las décadas desde el 51 (guardián de 61-69 de -24 a -37). Lleva el doble tanque aliado al
  frente, como la retaguardia, y el Golpe perforante le mata antes a los dos tanques. Con su vida baja, se queda solo
  antes. Es la senda peor colocada desde hace dos informes.
- **Hechicero:** sube más todavía en 51-59 (guardián +28) y en el jefe 60 (+44, como antes). También en los
  guardianes de 71-79 (+22) y el jefe 70 (+25).
- **Mago:** guardián de 71-79 (+16), jefes 70 (+16) y 80 (+17).
- **Arquero:** jefe 80 (+25, como antes) y jefe 30 (-17).

### 4.4 Jefes por senda (% de victorias, antes → después)

| Jefe | Guerrero | Paladín | Asesino | Arquero | Mago | Hechicero | Media | Objetivo |
|---|---|---|---|---|---|---|---|---|
| 30 Riakis | 94 → 92 | 81 → 78 | 46 → 45 | 69 → 62 | 100 → 100 | 100 → 99 | 82 → 79 | 80 |
| 40 Usurpador | 81 → 79 | 60 → 62 | 44 → 50 | 74 → 78 | 86 → 92 | 94 → 90 | 73 → 75 | 75 |
| 50 Custodio | 48 → 46 | 28 → 30 | 76 → 74 | 90 → 90 | 95 → 94 | 94 → 90 | 72 → 71 | 70 |
| 60 Storm Gush | 66 → 62 | 14 → 28 | 26 → 20 | 50 → 37 | 64 → 66 | 94 → 96 | 52 → 52 | 50 |
| 70 El Sin Forma | 69 → 41 | 44 → 32 | 10 → 10 | 32 → 42 | 34 → 57 | 54 → 66 | 40 → 41 | 40 |
| 80 Corazón Marchito | 45 → 36 | 25 → 28 | 5 → 2 | 56 → 57 | 33 → 49 | 18 → 22 | 30 → 32 | 30 |

## 5. 21-49: por qué los tanques no se mueven [medido, código]

- **La Furia y el Golpe perforante solo valen en 51-80**, como se decidió. En 21-49 solo actúan los recortes.
- **Tope de bloqueo del 25%:**
  - el Guerrero de referencia lleva un 21% (Espadón y Escudo de hierro de rango A, sin piedras ni Caídos;
    `__defensa('pesada', 25)`). Solo pasa del 25% con alguna piedra de bloqueo, y entonces por pocos puntos;
  - el Paladín, un 12%. El tope casi nunca muerde.
- **Escudo del Juramento a 2 y Juicio Divino a 3 enemigos:** el simulador del Paladín solo levanta el escudo por debajo
  del 75% de vida y sin otro escudo puesto, y la definitiva se gasta pocas veces por entrada (`ULTIMATE_MAX_USES`). En las
  pruebas sueltas contra los guardianes del 65 y el 75 (91 y 206 rondas) llegó a los 2 escudos; no medí cuántas veces lo
  usaba sin límite.
- **Medido** con la escala final:
  - sin ninguno de los tres recortes (`w_nocuts`), la tabla sale igual que con ellos (Guerrero completado 21-29: +21
    con y sin);
  - con un tope del 15% (`w_bc15`), tampoco cambia (Guerrero completado 31-39: +22). Lo que le da ventaja en esas
    décadas no es el bloqueo, sino la vida, la resistencia y la curación juntas.
- **Si se quiere acercar al Guerrero en 21-49,** haría falta otra decisión, por ejemplo extender la Furia a todos los
  guardianes desde el 21 o algo que actúe en las salas. No lo he hecho.

## 6. Factores de escala nuevos

Factor sobre el valor que dejaron los kits de retaguardia, en vida y ataque a la vez (constante: antes → después):

| Década | Salas | Guardián | Jefe de década |
|---|---|---|---|
| 21-29 | ×1,024: `BETA_ENEMY_SCALE[2]` 4.31 → 4.41 | ×1,015: 3.20 → 3.25 | 30: ×1,006, `BETA_DECADE_BOSS_TUNING` 2.32/2.20 → 2.33/2.21 |
| 31-39 | ×1,021: 6.31/7.28 → 6.44/7.43 | ×0,985: 5.00/5.62 → 4.93/5.54 | 40: ×0,981, 2.56/2.42 → 2.51/2.37 |
| 41-49 | ×0,992: `DECADE_ENEMY_TUNING[4]` 2.77 → 2.75 (y el guardián sin uso, 2.53 → 2.51) | grupo de la Isla: `PARAISO_GUARDIAN_GROUP` ×1,035, 1.06 → 1.10 | 50: ×0,995, `DECADE_BOSS_TUNING` 1.33/1.37 → 1.32/1.36 |
| 51-59 | ×1,015: normal 4.93/7.16 → 5.00/7.27; élite 4.69/6.61 → 4.76/6.71 | **×0,90**: 5.38/6.29 → 4.84/5.66 | 60: **×0,86**, 4.48/4.97 → 3.85/4.27 |
| 61-69 | ×1,000: 5.20/7.89, sin cambio | **×0,829**: 4.15/5.25 → 3.44/4.35 | 70: ×0,935, 3.35/3.71 → 3.13/3.47 |
| 71-79 | ×1,006: 4.97/7.62 → 5.00/7.67 | **×0,810**: 4.19/5.27 → 3.39/4.27 | 80: ×0,935, 3.06/3.32 → 2.86/3.10 |

- **Cuentas alfa** (`DECADE_ENEMY_TUNING[2-3]` y jefes 30 y 40 de `DECADE_BOSS_TUNING`): mismos factores, sin medir aparte
  (alfa 2: 2.22/2.57, 2.06/2.39, 2.27/2.39; alfa 3: 2.39/3.07, 2.23/2.74, 2.01/2.17; jefes 2.09/1.69 y 2.10/1.84).
- **Sin tocar:** 1-20, 81-100 y `GUARDIAN_ELITE_81`.
- **Los guardianes y jefes de 51-80 bajan un 6-19%** porque la Furia y el Golpe perforante los hacen más duros para
  todos. La pelea se vuelve más corta y más peligrosa al final, en vez de más larga.

**Medias por década** (después: `fin3` + `fin4`, 816 recorridos por nivel y 1.200 combates por jefe; ± error estándar
≈ 0,7-1,3):

| Década | Llegar al guardián (obj.) | Guardián (obj.) | Completado | Jefe (obj.) |
|---|---|---|---|---|
| 21-29 | 85,5 → **83,3** / 85 | 87,0 → **85,6** / 85 | 74,5 → 71,6 | 30: 81,5 → **79,1** / 80 |
| 31-39 | 86,7 → **84,9** / 85 | 81,3 → **82,0** / 80 | 71,1 → 70,5 | 40: 73,2 → **75,3** / 75 |
| 41-49 | 80,4 → **79,9** / 80 | 76,4 → **72,4** / 75 | 62,9 → 59,5 | 50: 71,7 → **70,6** / 70 |
| 51-59 | 79,4 → **77,5** / 80 | 53,5 → **55,6** / 55 | 43,6 → 43,7 | 60: 52,2 → **51,8** / 50 |
| 61-69 | 73,0 → **73,4** / 75 | 46,1 → **46,1** / 45 | 36,5 → 33,8 | 70: 40,6 → **41,5** / 40 |
| 71-79 | 74,0 → **75,2** / 75 | 33,5 → **34,1** / 35 | 27,3 → 26,2 | 80: 30,3 → **32,3** / 30 |

**Ojo con el ruido:** dos vueltas iguales del mismo código se separan más de lo que dice el error estándar. Guardián de
61-69: 41,8 en `fin3` y 50,4 en `fin4`. Cada pestaña sigue aprendiendo por su cuenta. Por eso el antes y el después
llevan doble muestra.

**Cómo se calibró:**
- 3 vueltas con 51-80 solamente para elegir la Furia (`c1a`-`c2a`);
- 3 vueltas completas a media muestra (`k1`-`k3`) y 5 a muestra completa (`k4`-`k8`, `fin1`-`fin2`);
- interpolación en escala logit, con la secante de las dos últimas vueltas;
- los factores de cada vuelta están en el JSON.

## 7. 1-20 y 81-90 (los recortes valen en todos los pisos) [medido]

- **Por código:** la Furia y el Golpe perforante solo existen en 51-80. En 1-20 y en 81-100 solo cambian los tres
  recortes. La escala de 1-20 y de 81-100 no se tocó.
- **"Antes"** es `5d48234`, servido aparte en otro puerto; misma tabla de aprendizaje en las dos columnas.

**1-20, referencia del simulador** (Rango B; 408 recorridos y 600 combates): sin cambios.

| Celda | Antes | Después |
|---|---|---|
| Nivel 5 | 99,8 | 100 |
| Nivel 15 | 100 | 99,5 |
| Jefe 10 | 97,8 | 98,8 |
| Jefe 20 | 99,8 | 99,8 |

**1-20, referencia de jugador nuevo** (la del informe de los kits; 204 recorridos y 300 combates, 34-50 por senda):

| Celda | Antes | Después | Guerrero | Paladín |
|---|---|---|---|---|
| Nivel 5 completado | 81,9 | 83,8 | 76 → 88 | 74 → 88 |
| Nivel 8 | 84,3 | 88,2 | 85 → 100 | 88 → 91 |
| Jefe 10 (Ogro) | 88,7 | 91,7 | 98 → 96 | 84 → 96 |
| Nivel 15 | 92,2 | 94,6 | 94 → 91 | 91 → 91 |
| Nivel 18 | 94,1 | 96,1 | 94 → 97 | 88 → 97 |
| Jefe 20 (Matriarca) | 86,7 | 85,0 | 72 → 66 | 50 → 44 |

Todo está dentro del ruido (±7 por senda). El Paladín en la Matriarca podría bajar de verdad algún punto por el
Juramento, pero con 50 combates no se distingue.

**81-90** (1.020 recorridos por nivel y 1.200 combates de jefe; % completado, entre paréntesis el guardián):

| Celda | Media | Guerrero | Paladín | Asesino | Arquero | Mago | Hechicero |
|---|---|---|---|---|---|---|---|
| Nivel 83 | 34,5 → 33,2 | 34 → 24 (38 → 27) | 16 → 12 (22 → 15) | 28 → 26 | 32 → 34 | 72 → 75 | 26 → 29 |
| Nivel 87 | 24,0 → 25,1 | 16 → 16 (20 → 20) | 5 → 2 (7 → 2) | 19 → 17 | 18 → 24 | 60 → 59 | 25 → 34 |
| Jefe 90 | 31,9 → 31,2 | 26 → 32 | 15 → 8 | 34 → 31 | 47 → 52 | 52 → 43 | 17 → 21 |

- **Las medias no cambian.**
- **El Paladín baja un poco** en las tres casillas. Es lo esperable por el Juramento y el Juicio, aunque cada casilla
  sola está cerca del ruido (±3,5).
- **Guerrero en el 83 (de 34 a 24):** no hay mecanismo. En 81-89 sigue activa la perforación oculta de bloqueo
  (`TANK_TUNE.blockPierce`, que allí anula el 60% de los bloqueos), así que su bloqueo efectivo ronda el 8% y el tope del
  25% no le toca. En el 87 y el jefe 90 no baja. Lo tomo como ruido.
- **No recalibré 81-100,** como se pidió.

## 8. Qué queda dudoso

1. **El tope de +30% de la Furia es mío.** Lo pedido (sin tope) deja a los tanques en el 0-5% en 51-80, y ninguna ronda
   de inicio ni ningún incremento de los que probé (sección 3) lo arreglaba sin tope. Con +30% siguen ganando
   combates largos (un Paladín ganó al guardián del 65 en 206 rondas en una prueba suelta), pero ya no siempre.
2. **Golpe perforante: enfriamiento 3 y daño ×1,0 son míos,** sin probar otros. Es lo que más castiga al Asesino (doble
   tanque aliado) y lo que más sube al Hechicero y al Mago en 61-79. Si se quiere suavizar, se puede probar a ponerlo
   cada 4 turnos.
3. **Los recortes del plan no hacen casi nada** con el equipo de referencia (sección 5). Quedan puestos porque son la
   decisión y se ven, pero no explican ningún número de este informe.
4. **Guerrero en 21-39 (+21/+23) y en las salas de 61-69 (+18):** lo decidido no llega ahí.
5. **Asesino:** baja todavía más (guardián de 61-79 al 1-9%). Sus cambios del plan (sangrado contagioso, robo de vida en
   Danza, evasión con rendimientos decrecientes) siguen pendientes. Es lo siguiente que haría.
6. **Hechicero muy por encima en 51-59 y en el jefe 60** (+28 y +44). Viene del Mermado del 40% de los kits, no de esto.
7. **Ruido entre vueltas:** de 3 a 8 puntos en algunas medias de década, por encima del error estándar (sección 6).
   Las medias finales están a 3 o menos del objetivo con doble muestra, pero una sola vuelta puede salir 3-4 puntos
   por fuera.
8. **Rifts sin medir:** sus oleadas usan la escala de salas y su jefe el ajuste del jefe de década, que ha cambiado
   (jefe 60 ×0,86, 70 y 80 ×0,935). La Furia y el Golpe perforante no les afectan (quedan fuera los jefes de rift).
9. **Cuentas alfa en 21-40:** mismos factores que la beta, sin medir (como en los dos informes anteriores).
10. **No rehíce la foto `__snapshot`.** La escala de 21-80 cambia (las claves de 21-80 cambiarán); la de 1-20 y 81-100,
    no.
11. **El Golpe perforante no tiene aviso previo** (la Furia sí). El jugador lo ve desde el principio en el estado del
    guardián y en las reglas, pero no sabe en qué turno toca. Se podría añadir una línea «X prepara un Golpe
    perforante» un turno antes.

## 9. Cómo repetirlo

Desde `tools/medicion_headless/`, con un puerto libre (yo usé 5321 para la rama y 5322 para el código viejo):

```sh
python server.py "<ruta del repo>" 5321                      # en otra consola
curl -X POST 127.0.0.1:5321/__learnload --data-binary @../mediciones/aprendizaje-kits-retaguardia-2026-10-17.json
curl -X POST 127.0.0.1:5321/__config -d "{\"learnReady\":true}"
python ctl.py 5321 workers 28
python cal.py 5321 run fin3 "{\"cells\":[[\"level\",23],[\"level\",25],[\"level\",27],[\"level\",33],[\"level\",35],[\"level\",37],[\"level\",43],[\"level\",45],[\"level\",47],[\"level\",53],[\"level\",55],[\"level\",57],[\"level\",63],[\"level\",65],[\"level\",67],[\"level\",73],[\"level\",75],[\"level\",77],[\"boss\",30],[\"boss\",40],[\"boss\",50],[\"boss\",60],[\"boss\",70],[\"boss\",80]],\"n\":408,\"nb\":600}"
python cal.py 5321 run fin4 "<lo mismo>"
python juntar.py despues fin3 fin4    # suma las dos vueltas
python dec.py despues                 # medias por década
python tabla.py despues               # tabla por década y senda
python distancia.py antes despues     # distancia a la media, antes → después
python ctl.py 5321 kill
```

- **Antes:** `git archive 5d48234 | tar -x -C <carpeta>`, `python server.py <carpeta> 5322` y los mismos lotes (`b_main`,
  `b_main2`). El `worker.js` nuevo funciona con el código viejo (`__nerfTanques` no existe allí y se salta).
- **Probar otros valores sin tocar el código:** añadir a la especificación, por ejemplo,
  `"nerf":{"furia":{"from":51,"to":80,"startRound":25,"perRound":0.05,"maxStacks":10}}` o `"nerf":{"perforante":null}`.
  Las claves que no se pasan se quedan como en el código.
- **1-20:** celdas `[["level",5],["level",15],["boss",10],["boss",20]]` (referencia del simulador). La de jugador nuevo
  lleva `"refs"` (ver `A_nuevo` en `kits-retaguardia-2026-10-17.json`).
- **81-90:** `[["level",83],["level",87],["boss",90]]` con `"n":1020,"nb":1200`.
- **Duración de los combates y registro completo:** con `dbg.py`, poniendo `W.__simLog` a un arreglo cuyo `shift` no
  haga nada (si no, solo guarda las últimas 400 líneas).
