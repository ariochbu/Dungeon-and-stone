# Medición de referencia oficial, "antes" (2026-10-16)

Es el paso 1 del plan de reestructuración. Rama `medicion-referencia`, sobre `main` en `04d4aba`, que ya trae:
- los 11 decretos (uno fuerte por combate y dos contra el jefe 50);
- el movimiento sin gastar turno;
- el simulador v2.

Medido en local: servidor propio en el puerto 5191, tres pestañas propias, sin sesión, todo en `simMode`. Datos crudos en
`referencia-2026-10-16.json` (mismo directorio).

## Cómo se midió

- **Script:** `tools/medir_referencia.js`. Se repite con `await import('/tools/medir_referencia.js'); medirReferencia();`
  y se lee con `refMarkdown()`. Se puede parar y retomar, y repartir entre pestañas (`key`, `refFusionar`).
- **Referencia:** la de `tools/calib_harness.js`.

  | Tramo | Equipo, piedras y Caídos | Aliados |
  |---|---|---|
  | 1-10 | Rango B, piedras B, Caídos únicos | 0 |
  | 11-20 | Rango B, piedras B, Caídos únicos | 1 |
  | 21-30 | Rango A, piedras A, Caídos épicos | 2 |
  | 31-40 | Rango A, piedras A, Caídos épicos | 3 |
  | 41 en adelante | Rango A, piedras A, Caídos épicos | 4 |

  Humano. 3 pociones de vida mayor.
  - **No es la referencia de "jugador nuevo"** con la que se calibró 1-20 el 2026-10-10 (equipo más bajo): por eso 1-20
    sale casi al 100%.
- **Reglas de década, Ley del Caos y Corrupción:** encendidas.
- **IA:** v2 **sin aprendizaje**, con las opciones por defecto de `simDefaultArm`, para que la medida se pueda repetir.

  Esas opciones salieron de entrenar antes con aprendizaje, en esta misma versión (movimiento gratis):
  - 25 recorridos por senda en los niveles 15, 35, 45, 47, 55, 85 y 95;
  - 10 combates por senda contra cada jefe 20-100;
  - ε = 0,25.

  Lo que aprendió:

  | Situación | Opción por defecto |
  |---|---|
  | Telaraña | El Guerrero sale del Frente; el resto se queda |
  | Marea | Guerrero y Paladín se defienden |
  | Suelo ardiente | Solo el Hechicero se mueve |
  | Espejismo | Asesino y Paladín gastan la definitiva; el resto espera |
  | Muralla | Pegar |
  | Doble coste | El Guerrero gasta; el resto ahorra |

  Aun gratis, moverse sigue costando algo: en ese turno el de Frente pierde su kit y el de Retaguardia queda expuesto.
- **Muestra:**

  | Qué | Combates o recorridos | Reparto |
  |---|---|---|
  | Cada nivel (x3, x5 y x7 de cada década) | 204 recorridos enteros | 34 por senda, o 17 por profesión |
  | Cada jefe de década | 300 combates sueltos con el grupo descansado | 50 por senda, o 25 por profesión |
  | Guardianes | Dentro de los recorridos: "guardián ganado cuando se llega" | |

- **Error estándar** de la media de las seis sendas, en puntos. **Por década: 0,3-2,2. El objetivo de ≤3 se cumple.** Por
  senda y nivel es mayor (hasta ±8,6 con 34 recorridos), y por senda y década ±1-5.
- **La máquina dio para todo**, en unas 2 horas: unos 7.300 niveles enteros y 3.600 combates de jefe.

## Resumen frente a tus objetivos (Rango A, 2026-10-09)

**Por década (media de los niveles x3, x5 y x7):**

| Década | Llegar al guardián % (objetivo) | Guardián ganado % (objetivo = jefe + 5) | Niveles completados % | Jefe de década % (objetivo) |
|---|---|---|---|---|
| 1-10 | 100 ±0,3 (90) | 100 ±0,2 (95) | 99 ±0,3 | **97** ±0,9 (90) |
| 11-20 | 96 ±0,8 (90) | 98 ±0,6 (90) | 94 ±1,0 | **95** ±1,2 (85) |
| 21-30 | 83 ±1,5 (85) | 82 ±1,7 (85) | 68 ±1,8 | **81** ±2,2 (80) |
| 31-40 | 86 ±1,4 (85) | 80 ±1,7 (80) | 69 ±1,8 | **74** ±2,5 (75) |
| 41-50 | 74 ±1,7 (80) | 74 ±2,0 (75) | 56 ±1,9 | **40** ±2,8 (70) ⚠ |
| 51-60 | 78 ±1,6 (80) | 48 ±2,0 (55) | 38 ±1,8 | **41** ±2,7 (50) |
| 61-70 | 73 ±1,8 (75) | 56 ±2,2 (45) | 40 ±1,9 | **33** ±2,7 (40) |
| 71-80 | 81 ±1,6 (75) | 42 ±2,1 (35) | 34 ±1,8 | **30** ±2,6 (30) |
| 81-90 | 65 ±1,9 (70) | 19 ±1,9 (25) | 14 ±1,3 | **13** ±1,9 sin profesión, **19** ±2,2 con profesión (20) |
| 91-100 | 57 ±2,0 (60) | 14 ±1,5 (15) | 9 ±1,0 | **5** ±1,3 sin profesión, **11** ±1,8 con profesión (10) |

**Lectura:**

1. **En media, el juego está cerca de tus objetivos en casi todo.** Las salas están a ±6 puntos y los guardianes a ±11; los
   jefes 30, 40, 70, 80, 90 y 100 (estos dos con profesión) quedan dentro de su objetivo ±7. La "deriva" que señalaba el
   primer informe se reduce mucho al medir con la IA v2, con más muestra y con los tres niveles de cada década.
2. **El jefe 50 se fue del 70% al 40%.** Es lo único que se sale claramente, y coincide con el cambio a dos decretos fuertes
   contra el Custodio. Hay que recalibrarlo, o dejarle un decreto, antes de seguir.
3. **1-20 está por encima del objetivo** (95-100%), pero con la referencia de Rango B, no con la de jugador nuevo con la
   que se calibró: no es un desajuste.
4. **51-60:** se llega bien al guardián (78%) pero se le gana poco (48% frente a 55). El jefe 60 está en 41% (objetivo 50).
5. **Niveles sueltos que se salen** (completado %):

   | Nivel | Completado % | Comparación |
   |---|---|---|
   | 47 | 34 | 43: 63, 45: 71 |
   | 55 | 29 | 53: 62 |
   | 57 | 23 | 53: 62 |
   | 87 | 6 | |
   | 97 | 2 | 95: 17 |

   La causa es el guardián: los niveles x7 tienen el guardián más duro de su década.
6. **El reparto por senda sigue siendo amplio** (ver abajo). En 51-60, Guerrero y Paladín completan el 25-27% y el Asesino
   el 51%. En 81-90, el Hechicero sin profesión completa el 2%. Contra los jefes, la dispersión entre sendas es de 10 a 34
   puntos.

## Por senda y década (niveles completados %, ±EE; entre paréntesis, guardián ganado cuando se llega)

| Década | Guerrero | Paladín | Asesino | Arquero | Mago | Hechicero |
|---|---|---|---|---|---|---|
| 1-10 | 100 ±0,0 (100) | 98 ±1,4 (100) | 100 ±0,0 (100) | 100 ±0,0 (100) | 99 ±1,0 (99) | 99 ±1,0 (100) |
| 11-20 | 91 ±2,8 (95) | 94 ±2,3 (100) | 91 ±2,8 (97) | 91 ±2,8 (97) | 98 ±1,4 (99) | 96 ±1,9 (97) |
| 21-30 | 68 ±4,6 (80) | 69 ±4,6 (80) | 65 ±4,7 (86) | 71 ±4,5 (84) | 70 ±4,6 (88) | 65 ±4,7 (73) |
| 31-40 | 53 ±4,9 (64) | 76 ±4,2 (85) | 69 ±4,6 (83) | 82 ±3,8 (94) | 74 ±4,4 (83) | 58 ±4,9 (70) |
| 41-50 | 48 ±4,9 (64) | 53 ±4,9 (63) | 50 ±5,0 (88) | 65 ±4,7 (84) | 70 ±4,6 (89) | 49 ±4,9 (66) |
| 51-60 | 25 ±4,3 (29) | 27 ±4,4 (37) | 51 ±4,9 (66) | 42 ±4,9 (47) | 37 ±4,8 (55) | 44 ±4,9 (59) |
| 61-70 | 40 ±4,9 (57) | 42 ±4,9 (63) | 37 ±4,8 (48) | 34 ±4,7 (53) | 46 ±4,9 (63) | 40 ±4,9 (49) |
| 71-80 | 26 ±4,4 (34) | 33 ±4,7 (37) | 40 ±4,9 (50) | 34 ±4,7 (44) | 39 ±4,8 (47) | 29 ±4,5 (41) |
| 81-90 | 19 ±3,9 (27) | 14 ±3,4 (22) | 15 ±3,5 (22) | 19 ±3,9 (24) | 12 ±3,2 (21) | 2 ±1,4 (3) |
| 91-100 | 6 ±2,3 (11) | 2 ±1,4 (4) | 8 ±2,7 (17) | 19 ±3,9 (30) | 4 ±1,9 (7) | 13 ±3,3 (20) |

## Jefes de década (% de victorias, combate suelto, 50 por senda)

| Jefe | Media | ±EE | Guerrero | Paladín | Asesino | Arquero | Mago | Hechicero |
|---|---|---|---|---|---|---|---|---|
| 10 Ogro | **97** | 0,9 | 98 | 100 | 98 | 92 | 98 | 98 |
| 20 Matriarca | **95** | 1,2 | 72 | 100 | 100 | 100 | 100 | 96 |
| 30 Riakis | **81** | 2,2 | 78 | 72 | 78 | 68 | 94 | 96 |
| 40 Usurpador | **74** | 2,5 | 66 | 84 | 72 | 78 | 72 | 74 |
| 50 Custodio | **40** | 2,8 | 26 | 50 | 40 | 30 | 44 | 50 |
| 60 Storm Gush | **41** | 2,7 | 56 | 22 | 32 | 46 | 34 | 58 |
| 70 Sin Forma | **33** | 2,7 | 36 | 30 | 36 | 26 | 36 | 34 |
| 80 Corazón | **30** | 2,6 | 26 | 38 | 14 | 24 | 36 | 42 |
| 90 Carcelero | **13** | 1,9 | 8 | 14 | 18 | 8 | 20 | 8 |
| 100 Retornado | **5** | 1,3 | 8 | 2 | 2 | 10 | 2 | 8 |

Con profesión (25 por profesión, 300 por jefe):

| Jefe | Media | ±EE | Baluarte | Verdugo | Custodio | Inquisidor | Danzante | Ejecutor | Ballestero | Francotirador | Piromante | Criomante | Plaguero | Maldecidor |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 90 | **19** | 2,2 | 20 | 24 | 24 | 8 | 16 | 12 | 16 | 12 | 48 | 24 | 20 | 8 |
| 100 | **11** | 1,8 | 16 | 8 | 0 | 8 | 12 | 8 | 8 | 8 | 8 | 12 | 24 | 16 |

## 81-100 con profesión (niveles completados %, 17 por profesión, 204 por nivel)

| Nivel | Media | ±EE | Baluarte | Verdugo | Custodio | Inquisidor | Danzante | Ejecutor | Ballestero | Francotirador | Piromante | Criomante | Plaguero | Maldecidor |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 83 | **16** | 2,5 | 35 | 24 | 18 | 18 | 12 | 24 | 12 | 6 | 18 | 12 | 6 | 6 |
| 85 | **23** | 2,8 | 18 | 35 | 29 | 41 | 24 | 18 | 29 | 29 | 18 | 18 | 6 | 6 |
| 87 | **12** | 2,2 | 0 | 0 | 18 | 18 | 24 | 6 | 24 | 18 | 12 | 18 | 0 | 6 |
| 93 | **12** | 2,2 | 12 | 24 | 0 | 12 | 0 | 6 | 0 | 12 | 18 | 12 | 29 | 24 |
| 95 | **22** | 2,7 | 0 | 18 | 0 | 0 | 18 | 41 | 35 | 47 | 12 | 18 | 35 | 35 |
| 97 | **6** | 1,5 | 0 | 0 | 0 | 0 | 0 | 12 | 12 | 6 | 0 | 0 | 24 | 12 |

Sin profesión, los mismos niveles completan 14 / 21 / 6 / 7 / 17 / 2%. **La profesión sube de 2 a 9 puntos**, como se
calibró: las tablas de 81-100 usan el valor de la profesión cuando la hay.

## Niveles uno a uno

### Completado (%)

| Nivel | Media | ±EE | Guerrero | Paladín | Asesino | Arquero | Mago | Hechicero |
|---|---|---|---|---|---|---|---|---|
| 3 | **100** | 0 | 100 | 100 | 100 | 100 | 100 | 100 |
| 5 | **99** | 0,7 | 100 | 97 | 100 | 100 | 100 | 97 |
| 7 | **99** | 0,7 | 100 | 97 | 100 | 100 | 97 | 100 |
| 13 | **96** | 1,3 | 100 | 94 | 94 | 88 | 100 | 100 |
| 15 | **93** | 1,8 | 82 | 97 | 94 | 88 | 100 | 94 |
| 17 | **92** | 1,9 | 91 | 91 | 85 | 97 | 94 | 94 |
| 23 | **75** | 3,0 | 74 | 76 | 74 | 79 | 59 | 85 |
| 25 | **68** | 3,2 | 74 | 68 | 65 | 68 | 85 | 50 |
| 27 | **61** | 3,4 | 56 | 62 | 56 | 65 | 65 | 59 |
| 33 | **69** | 3,1 | 50 | 82 | 71 | 82 | 76 | 50 |
| 35 | **72** | 3,0 | 50 | 76 | 74 | 88 | 74 | 71 |
| 37 | **65** | 3,3 | 59 | 71 | 62 | 76 | 71 | 53 |
| 43 | **63** | 3,4 | 53 | 62 | 65 | 68 | 68 | 62 |
| 45 | **71** | 3,1 | 65 | 65 | 68 | 76 | 85 | 65 |
| 47 | **34** | 3,2 | 26 | 32 | 18 | 50 | 56 | 21 |
| 53 | **62** | 3,3 | 50 | 62 | 68 | 74 | 50 | 65 |
| 55 | **29** | 3,0 | 12 | 12 | 56 | 35 | 26 | 35 |
| 57 | **23** | 2,8 | 12 | 9 | 29 | 18 | 35 | 32 |
| 63 | **47** | 3,5 | 41 | 59 | 50 | 41 | 50 | 41 |
| 65 | **44** | 3,4 | 65 | 47 | 35 | 26 | 44 | 47 |
| 67 | **29** | 3,1 | 15 | 21 | 26 | 35 | 44 | 32 |
| 73 | **34** | 3,2 | 44 | 53 | 35 | 24 | 29 | 21 |
| 75 | **39** | 3,3 | 21 | 29 | 56 | 44 | 44 | 38 |
| 77 | **28** | 3,1 | 15 | 18 | 29 | 35 | 44 | 29 |
| 83 | **14** | 2,3 | 24 | 15 | 15 | 18 | 9 | 0 |
| 85 | **21** | 2,8 | 26 | 15 | 26 | 29 | 24 | 3 |
| 87 | **6** | 1,6 | 6 | 12 | 3 | 9 | 3 | 3 |
| 93 | **7** | 1,7 | 12 | 6 | 0 | 3 | 9 | 9 |
| 95 | **17** | 2,4 | 6 | 0 | 24 | 44 | 3 | 26 |
| 97 | **2** | 1,0 | 0 | 0 | 0 | 9 | 0 | 3 |

### Llegar vivo al guardián (%)

| Nivel | Media | ±EE | Guerrero | Paladín | Asesino | Arquero | Mago | Hechicero |
|---|---|---|---|---|---|---|---|---|
| 3 | **100** | 0 | 100 | 100 | 100 | 100 | 100 | 100 |
| 5 | **99** | 0,7 | 100 | 97 | 100 | 100 | 100 | 97 |
| 7 | **100** | 0,5 | 100 | 97 | 100 | 100 | 100 | 100 |
| 13 | **97** | 1,3 | 100 | 94 | 94 | 91 | 100 | 100 |
| 15 | **98** | 1,0 | 97 | 97 | 100 | 94 | 100 | 100 |
| 17 | **94** | 1,7 | 91 | 91 | 88 | 97 | 97 | 97 |
| 23 | **83** | 2,6 | 82 | 85 | 76 | 85 | 68 | 100 |
| 25 | **91** | 2,0 | 97 | 94 | 82 | 94 | 91 | 85 |
| 27 | **75** | 3,0 | 74 | 76 | 68 | 74 | 79 | 79 |
| 33 | **87** | 2,4 | 82 | 88 | 85 | 94 | 91 | 79 |
| 35 | **90** | 2,1 | 88 | 97 | 85 | 88 | 88 | 91 |
| 37 | **80** | 2,8 | 76 | 85 | 76 | 79 | 85 | 76 |
| 43 | **81** | 2,7 | 79 | 91 | 71 | 82 | 82 | 82 |
| 45 | **83** | 2,6 | 82 | 97 | 68 | 85 | 85 | 82 |
| 47 | **59** | 3,3 | 65 | 65 | 32 | 65 | 68 | 59 |
| 53 | **82** | 2,7 | 82 | 82 | 85 | 94 | 74 | 74 |
| 55 | **78** | 2,8 | 82 | 71 | 88 | 88 | 62 | 76 |
| 57 | **75** | 2,9 | 91 | 68 | 59 | 88 | 68 | 74 |
| 63 | **75** | 3,0 | 74 | 71 | 76 | 62 | 76 | 88 |
| 65 | **75** | 3,0 | 74 | 53 | 79 | 74 | 79 | 88 |
| 67 | **69** | 3,2 | 65 | 76 | 76 | 59 | 65 | 71 |
| 73 | **81** | 2,7 | 82 | 91 | 74 | 88 | 79 | 71 |
| 75 | **86** | 2,4 | 82 | 91 | 91 | 74 | 91 | 85 |
| 77 | **75** | 3,0 | 68 | 88 | 76 | 74 | 82 | 59 |
| 83 | **61** | 3,3 | 68 | 59 | 59 | 79 | 47 | 53 |
| 85 | **75** | 3,0 | 79 | 79 | 82 | 79 | 71 | 59 |
| 87 | **60** | 3,4 | 59 | 53 | 59 | 74 | 47 | 68 |
| 93 | **55** | 3,4 | 53 | 47 | 38 | 62 | 65 | 65 |
| 95 | **64** | 3,3 | 59 | 62 | 59 | 71 | 59 | 74 |
| 97 | **52** | 3,5 | 56 | 47 | 44 | 56 | 53 | 53 |

### Guardián ganado cuando se llega (%)

| Nivel | Media | ±EE | n | Guerrero | Paladín | Asesino | Arquero | Mago | Hechicero |
|---|---|---|---|---|---|---|---|---|---|
| 3 | **100** | 0 | 204 | 100 | 100 | 100 | 100 | 100 | 100 |
| 5 | **100** | 0 | 202 | 100 | 100 | 100 | 100 | 100 | 100 |
| 7 | **100** | 0,5 | 203 | 100 | 100 | 100 | 100 | 97 | 100 |
| 13 | **100** | 0,5 | 197 | 100 | 100 | 100 | 97 | 100 | 100 |
| 15 | **95** | 1,6 | 200 | 85 | 100 | 94 | 94 | 100 | 94 |
| 17 | **99** | 0,9 | 191 | 100 | 100 | 97 | 100 | 97 | 97 |
| 23 | **90** | 2,3 | 169 | 89 | 90 | 96 | 93 | 87 | 85 |
| 25 | **75** | 3,1 | 185 | 76 | 72 | 79 | 72 | 94 | 59 |
| 27 | **81** | 3,2 | 153 | 76 | 81 | 83 | 88 | 81 | 74 |
| 33 | **79** | 3,0 | 177 | 61 | 93 | 83 | 88 | 84 | 63 |
| 35 | **80** | 2,8 | 183 | 57 | 79 | 86 | 100 | 83 | 77 |
| 37 | **82** | 3,0 | 163 | 77 | 83 | 81 | 96 | 83 | 69 |
| 43 | **78** | 3,1 | 166 | 67 | 68 | 92 | 82 | 82 | 75 |
| 45 | **86** | 2,5 | 170 | 79 | 67 | 100 | 90 | 100 | 79 |
| 47 | **57** | 4,4 | 120 | 41 | 50 | 55 | 77 | 83 | 35 |
| 53 | **75** | 3,3 | 167 | 61 | 75 | 79 | 78 | 68 | 88 |
| 55 | **37** | 3,6 | 159 | 14 | 17 | 63 | 40 | 43 | 46 |
| 57 | **32** | 3,6 | 152 | 13 | 13 | 50 | 20 | 52 | 44 |
| 63 | **64** | 3,8 | 152 | 56 | 83 | 65 | 67 | 65 | 47 |
| 65 | **61** | 3,6 | 152 | 88 | 89 | 44 | 36 | 56 | 53 |
| 67 | **43** | 4,0 | 140 | 23 | 27 | 35 | 60 | 68 | 46 |
| 73 | **42** | 3,7 | 165 | 54 | 58 | 48 | 27 | 37 | 29 |
| 75 | **45** | 3,6 | 175 | 25 | 32 | 61 | 60 | 48 | 45 |
| 77 | **39** | 3,8 | 152 | 22 | 20 | 38 | 48 | 54 | 50 |
| 83 | **21** | 3,5 | 124 | 35 | 25 | 25 | 22 | 19 | 0 |
| 85 | **27** | 3,4 | 153 | 33 | 19 | 32 | 37 | 33 | 5 |
| 87 | **10** | 2,7 | 122 | 10 | 22 | 5 | 12 | 6 | 4 |
| 93 | **11** | 2,9 | 112 | 22 | 13 | 0 | 5 | 14 | 14 |
| 95 | **26** | 3,2 | 130 | 10 | 0 | 40 | 63 | 5 | 36 |
| 97 | **4** | 1,7 | 105 | 0 | 0 | 0 | 16 | 0 | 6 |

## Avisos

- **Ruido:** dos configuraciones idénticas pueden diferir varios puntos. Compara siempre con el error estándar de cada
  tabla y, a ser posible, en la misma sesión.
- **La foto `__snapshot`:** enemigos y jugador salen iguales que en `main` (35f67646 / 3012d3b9). Las partidas cambian
  (70087149) porque cambió la IA del simulador, no el juego (ver `snapshot-hashes.md`).
- **El cuelgue del 45:** ninguna de las ~11.000 simulaciones de esta medición dio error (`__simErrores` vacío en las tres
  pestañas). Los recorridos atascados no se contaron aparte.
