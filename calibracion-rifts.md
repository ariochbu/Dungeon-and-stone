# Calibración de los rifts

Rama `calibrar-rifts`, sobre `ca86f78`. Medido entre el 2026-10-11 y el 2026-10-15 con el simulador del propio juego
(navegador contra `python -m http.server`, sin iniciar sesión y sin tocar la base: todo en `simMode`).

## Cómo se mide

- `simRifts(cfg)` / `window.__simRift` (nuevo, en `src/game.js`): pelea las tres etapas de un rift seguidas con el motor
  real de combate. Entre etapas no se cura nadie: la vida, el MP y las pociones del jugador siguen como quedaron, y los
  aliados conservan su vida y sus bajas (`syncAllyHPToDungeon`), igual que en `riftAdvance`. La sala del rift sale al azar
  entre las intermedias, como en `generateDungeon`.
- `tools/calib_rifts.js`: `riftMedir` (tablas) y `riftCalibrar` (búsqueda de los factores).
- Referencia: la de `tools/calib_harness.js` (rango B y 0-1 aliados en 1-20, rango A, piedras A, Caídos épicos y 2-4 aliados
  después), las seis sendas sin profesión, niveles x5 y x9 de cada década.
- Cada década: 6 sendas × 2 niveles × 4 temas (cripta, forja, tormenta, sombras) × 40 rifts = 1.920 rifts.
  Aparte, los 20 temas con 10 rifts por celda (120 por tema y década) para buscar temas que se salgan.
- Cifras: `oleada 1 / oleada 2 / jefe / completo`, en %. Oleada 2 y jefe son "de las veces que se llega".

## Situación de partida (sin tocar nada)

| Década | Total | Guerrero | Paladín | Asesino | Arquero | Mago | Hechicero |
|---|---|---|---|---|---|---|---|
| 1-10 | 100/49/55/**27** | 100/28/22/6 | 99/59/88/52 | 99/37/26/10 | 100/28/39/11 | 100/63/56/35 | 100/76/61/47 |
| 11-20 | 99/5/14/**1** | 99/2/0/0 | 99/15/26/4 | 100/1/0/0 | 98/0/–/0 | 99/3/0/0 | 99/8/0/0 |
| 21-30 | 99/27/0/**0** | 100/23/0/0 | 95/33/0/0 | 100/25/0/0 | 100/9/0/0 | 99/20/0/0 | 100/52/0/0 |
| 31-40 | 99/24/3/**1** | 97/16/8/1 | 96/37/4/1 | 100/20/3/1 | 100/14/2/0 | 100/24/3/1 | 100/33/0/0 |
| 41-50 | 100/99/77/**76** | 100/94/66/62 | 100/98/49/48 | 100/100/74/74 | 100/100/86/86 | 100/100/92/92 | 100/100/93/93 |
| 51-60 | 86/16/0/**0** | 80/12/0/0 | 65/26/0/0 | 91/9/0/0 | 95/9/0/0 | 94/10/0/0 | 92/33/0/0 |
| 61-70 | 89/18/2/**0** | 81/14/0/0 | 73/32/0/0 | 91/14/10/1 | 97/19/0/0 | 98/11/0/0 | 96/22/1/0 |
| 71-80 | 94/25/4/**1** | 91/22/0/0 | 93/52/0/0 | 83/17/7/1 | 97/14/7/1 | 99/16/2/0 | 99/27/12/3 |
| 81-90 | 80/35/15/**4** | 74/28/0/0 | 61/57/0/0 | 73/33/30/7 | 88/29/23/6 | 96/29/20/6 | 90/39/19/7 |
| 91-100 | 63/32/0/**0** | 43/15/0/0 | 50/57/0/0 | 55/30/0/0 | 67/26/0/0 | 88/34/0/0 | 75/32/0/0 |

Lo que mata no es la primera oleada (casi siempre se gana, salvo en 91-100) sino la segunda, con la élite, y sobre todo
el jefe: es el jefe de década con +10% de vida y escolta, calibrado para un grupo descansado, y aquí llega un grupo que
ya peleó dos combates sin curarse. La década 41-50 es la excepción al revés (Isla Paraíso tiene la escala de enemigos
más baja): el rift era casi gratis.

## Qué se cambió

### 1. `RIFT_TUNING` por década (el mando principal)

Una tabla en `src/game.js`, aplicada en `buildRiftGroup` encima de la escala normal de la década. `hp/atk` multiplican a
todas las criaturas de las oleadas (élite incluida) y a la escolta del jefe; `bossHp/bossAtk`, al jefe del rift. Vida y
ataque se mueven siempre juntos (un factor por par). Búsqueda: primero las oleadas hasta que la referencia llega al jefe
el ~76% de las veces (dos oleadas al 87%), después el jefe hasta ~60%.

| Década | hp = atk (oleadas) | bossHp = bossAtk |
|---|---|---|
| 1-10 | 0.84 | 1.00 |
| 11-20 | 0.60 | 0.43 |
| 21-30 | 0.76 | 0.34 |
| 31-40 | 0.76 | 0.50 |
| 41-50 | 1.40 | 0.99 |
| 51-60 | 0.71 | 0.33 |
| 61-70 | 0.68 | 0.50 |
| 71-80 | 0.74 | 0.57 |
| 81-90 | 0.71 | 0.66 |
| 91-100 | 0.66 | 0.35 |

### 2. El jefe del rift ya no recibe el "castigo al frente" de los guardianes (`guardianVsFront`)

Fuera del código de rifts en sentido estricto, pero solo afecta a rifts (una línea: `if(enemy.tpl.riftBoss) return null`).
En 61-89 el jefe del rift tiene `tpl.boss` y el nivel no es múltiplo de 10, así que contaba como guardián de piso: +50%
de daño al frente y Armadura Rota. En los niveles normales eso lo compensa `GUARDIAN_VS_CLASS` (Guerrero x0.55, Paladín
x0.52 en 61-70), que solo se aplica en la sala `jefe`, no en el rift. Resultado: en 61-70 los tanques le ganaban al jefe
del rift el 20% (Guerrero) y el 7% (Paladín) mientras el resto de sendas estaba en 70-86%. Quitando el castigo solo a
este jefe (como ya pasa con los jefes de década): 76% y 68% en la misma prueba. Después se reajustó el jefe de 61-90.

### 3. Temas que se salían

Con la tabla ya ajustada, el barrido de los 20 temas dejó cinco muy por debajo (completado, en %):

| Tema | 11-20 | 31-40 | 51-60 | Con el estado apagado (31-40 / 51-60) |
|---|---|---|---|---|
| Santuario de ceniza (Quemadura) | 22 | 22 | 23 | 60 / 64 |
| Forja apagada (Quemadura) | 38 | 33 | 26 | 59 / 57 |
| Cueva de hongos (Veneno) | 41 | 31 | 28 | 54 / 57 |
| Jardín devorador (Veneno) | 43 | 33 | 36 | 65 / 62 |
| Nido profundo (Veneno) | 34 | 27 | 31 | 42 / 35 |

El resto de temas estaba en 47-72. La Quemadura sobre el jugador y sus aliados quita el 22% del daño base del jugador por
turno desde la primera carga, y el Veneno apila hasta 4; en estos temas casi todas las criaturas lo aplican (también con
áreas cada 4 turnos), así que se les baja el estado del tema (`RIFT_THEMES[...].status`):

| Tema | Antes | Ahora |
|---|---|---|
| forja | Quemadura 0.45, 3 turnos | 0.22, 2 turnos |
| ceniza | Quemadura 0.50, 3 turnos | 0.25, 2 turnos |
| hongos | Veneno 0.60, 3 turnos, 4 cargas | 0.30, 2 turnos, 2 cargas |
| jardín | Veneno 0.55, 4 cargas | 0.30, 3 cargas |
| nido | Veneno 0.50, 3 turnos, 4 cargas | 0.25, 2 turnos, 3 cargas |

El nido no mejoraba solo con eso. Probé a quitar cada pieza por separado (Corrosión, cría, Sangrado, remate de la
Guadaña, caparazón, cura): ninguna sola movía más de 2-3 puntos; todas juntas lo llevaban de 33% a 61%. En su kit
(`RIFT_KITS.nido`): la Avispa ya no aplica Sangrado, la Mantis tampoco, la Corrosión de la Escupidora baja de 0.55/3
turnos a 0.25/2, la cría de la Nodriza nace con el 15% de la vida (antes el 50%) y el remate de la Guadaña baja de
x1.40 a x1.25.

### 4. Simulador

`simRiftOnce` / `simRifts` (con `cfg.stages` para pelear solo las primeras etapas) y los ganchos `__simRift`,
`__riftTuning` y `__riftTemas` (solo en localhost).

## Resultado

| Década | Total | Guerrero | Paladín | Asesino | Arquero | Mago | Hechicero |
|---|---|---|---|---|---|---|---|
| 1-10 | 100/78/64/**49** | 100/57/33/18 | 100/79/90/71 | 100/79/41/33 | 100/65/50/32 | 100/90/77/69 | 100/96/76/73 |
| 11-20 | 100/75/65/**49** | 100/70/45/32 | 100/86/94/81 | 100/68/38/26 | 100/53/31/17 | 100/82/76/62 | 100/92/81/74 |
| 21-30 | 100/77/59/**46** | 100/68/60/41 | 100/71/71/51 | 100/83/60/50 | 100/62/31/19 | 100/82/54/44 | 100/96/72/69 |
| 31-40 | 100/74/66/**49** | 100/52/71/37 | 100/75/77/58 | 100/73/65/47 | 100/73/76/56 | 100/83/65/54 | 100/88/46/40 |
| 41-50 | 100/82/60/**49** | 100/65/63/41 | 99/78/46/36 | 100/66/59/39 | 100/92/52/48 | 100/95/73/69 | 100/95/64/61 |
| 51-60 | 100/78/66/**51** | 99/66/80/53 | 98/71/76/53 | 100/76/80/61 | 100/77/37/29 | 100/82/59/48 | 100/95/65/62 |
| 61-70 | 100/78/67/**52** | 100/69/67/47 | 99/76/56/42 | 100/80/80/64 | 100/79/55/43 | 100/81/64/52 | 100/83/78/64 |
| 71-80 | 100/74/63/**47** | 100/77/74/57 | 100/88/68/60 | 100/55/57/32 | 100/68/46/31 | 100/71/43/31 | 100/84/83/70 |
| 81-90 | 100/81/59/**47** | 99/77/39/30 | 98/82/31/25 | 100/78/75/58 | 100/80/59/48 | 100/82/64/52 | 100/86/84/73 |
| 91-100 | 99/78/63/**49** | 98/63/45/28 | 97/79/51/39 | 98/75/74/55 | 100/75/52/38 | 100/92/69/63 | 100/88/80/70 |

Todas las décadas quedan en 46-52% de rifts completos, con el jefe en 59-67%. Por nivel dentro de la década (media de las
sendas): el x5 completa 35-48% y el x9 50-63%, porque el rift pelea como el final de la década sea cual sea el nivel.

Barrido de los 20 temas después de los cambios (completado, 120 rifts por tema): en casi todas las décadas los temas
quedan entre ~35 y ~65. Media por década: 53, 47, 46, 39 (31-40 se midió con el jefe anterior, 0.57; con 0.50 la media
de los cuatro temas de referencia pasó de 39 a 49), 48, 51, 57, 48, – y 49.

## Lo que queda sin resolver o dudoso

1. **Las oleadas no quedan al 87% cada una.** Quedan ~100% la primera y ~75-80% la segunda. Lo intenté con un mando
   aparte para la élite: con la primera oleada ajustada al 87%, la segunda no pasaba del 78% ni con la élite a una décima
   parte de su fuerza (y en 1-10 hacía falta subir la primera oleada x1.9). Entre etapas no se cura nadie, así que lo que
   se pierde en la primera se arrastra. Elegí apuntar a "llegar al jefe el 76%" (= 87% × 87%) con un solo mando: el rift
   completo cae en el 45-50% pedido. Si se quiere de verdad 87/87, hace falta algo de curación entre etapas (decisión de
   diseño, no la tomé).
2. **Reparto por senda.** Con un mando por década el total queda bien, pero las sendas van del 17-30% (Arquero en 11-30,
   Guerrero en 1-20 y 91-100, tanques en 81-90) al 70-80% (Hechicero, Paladín en 1-20). Viene sobre todo de
   `ENEMY_VS_CLASS` / `BOSS_VS_CLASS`, que se calibraron para los niveles normales y se aplican igual en el rift (en 91-99,
   por ejemplo, el Guerrero recibe x1.75). No añadí una tabla por senda para rifts: serían seis mandos más por década.
3. **Temas que siguen fuera:** Sala de espejos en 1-30 (23-33%, el jefe "El Reflejo" gana mucho a esos niveles; en 41-60
   está en 59-67%), Astillero fantasma (28-41%) y Nido profundo (33-48%) algo bajos, Torre del reloj siempre alta (50-71%).
   Con 120 rifts por tema el margen de error es de ±4-5 puntos.
4. **Décadas 81-100 sin profesión.** La referencia son las seis sendas sin profesión, como pidió el encargo; esas décadas
   se calibraron en su día con las 12 profesiones, así que un jugador real con profesión probablemente gane algo más.
5. **Combates atascados:** 0-47 de 1.920 rifts por década acaban porque el simulador llega a su tope de 400 acciones; se
   cuentan como derrota (más en 61-100).
6. **1-10 con valores de ataque pequeños:** en esa década el redondeo de ataques de un dígito hace la respuesta a
   escalones (con 0.84 medí 78% y 63% de llegada al jefe en dos tandas); conviene vigilarlo.
7. El factor 0.33-0.43 del jefe en 11-30 y 51-60 es muy bajo: el jefe de esas décadas se diseñó para pelear descansado.
   Si se prefiere un jefe más digno, la alternativa es curar algo antes del jefe y subir `bossHp/bossAtk`.

## Main mientras tanto

Main recibió la barra de turnos, el arreglo de la Defensa (ahora sí reduce el daño a la mitad) y la v376. No afecta a
estas medidas: el simulador nunca usa Defensa (solo habilidades con daño y unas pocas de apoyo, `SIM_UTILITY_SKILLS`) y
la barra es solo interfaz. Un jugador que use Defensa tendrá los rifts algo más fáciles de lo medido.

## Cómo repetirlo

```
python -m http.server 5199        (en la raíz del repo; abrir http://127.0.0.1:5199 sin iniciar sesión)
await import('/tools/calib_rifts.js');
riftMedir({decs:[0,1,2,3,4,5,6,7,8,9], n:40, clave:'x'});      // tabla; progreso en RIFT.tick, resultado en RIFT.x
riftMedir({decs:[3], n:10, clave:'temas', temas:Object.keys(__riftTemas)});
riftCalibrar([3], {solo:['jefe']});                             // reajusta un par de RIFT_TUNING
```
Con varias pestañas a la vez va más rápido (una década por pestaña). Ojo: el navegador cachea `src/game.js`; si cambias
el archivo, comprueba `__riftTuning` antes de medir.
