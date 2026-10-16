# Investigación: cómo calibrar la dificultad de Dungeon & Stone

Rama `investigacion-calibracion`, sobre `main` en `c44dfd1` (reglas de década, votos e inmunidad de la Ley del Caos ya
incluidas). Escrito el 2026-10-16. **No cambia nada del juego**: es un informe con su propuesta. El simulador se ejecutó en
local (navegador contra `python -m http.server`, sin iniciar sesión, todo en `simMode`). No se tocó la base de datos, Supabase,
`main` ni el despliegue.

**Segunda parte:** `plan-reestructuracion.md` (en esta misma rama) trae lo siguiente:
- las tablas completas de crecimiento por nivel, hoy y propuestas;
- el plan paso a paso con tiempos;
- los objetivos por rango de equipo y los cambios de kit por senda;
- la lista de constantes que se borran o se fusionan y la reorganización del código;
- el simulador nuevo, que ya se mueve, se defiende, lee las reglas y aprende, con sus medidas.

Convenciones del documento:

- **[fuente]**: dato tomado de la fuente enlazada.
- **[medido]**: lo midió el simulador del propio juego en esta sesión (ver anexo A para cómo y cuánto ruido tiene).
- **[código]**: leído directamente de `src/game.js`.
- **[estimación]**: número o juicio mío, sin fuente. Hay que tratarlo como propuesta, no como dato.

---

## 1. Resumen ejecutivo

1. **El combate en sí está bien pensado; lo que falla es la escala.** La fórmula de daño (multiplicador por % de
   resistencia con topes, penetraciones planas, crítico, posición, estados) se parece a lo que usan Diablo 2, Path of Exile o
   Darkest Dungeon, y es correcta. El problema es que el jugador y los enemigos crecen con **curvas que no tienen relación
   entre sí**, y la diferencia se tapa con unas **400 constantes de calibración** apiladas en unas 14 capas [código, recuento
   mío]. Cada una se buscó con el simulador para un objetivo de % de victorias en un momento dado.
2. **Datos que lo muestran [medido]:** desde el nivel 20 hasta el 80, el daño base del jugador de referencia (equipo A,
   media de las seis sendas) crece unas ×1,9 y su vida unas ×3,4. La vida de un enemigo normal crece ×6,5 y su ataque ×4,5. Por eso hacen falta
   factores de ×1,5 a ×10 por década (`BETA_ENEMY_SCALE`, `DECADE_ENEMY_TUNING`). Esos factores además **van en zigzag**:
   el normal del 35 tiene 5.500 de vida, el del 45 2.900 y el del 55 7.900. Resultado: un combate normal pasa de 3-4 turnos
   en 1-20 a 20-30 turnos en 55-95, y al mismo tiempo el golpe de un normal pasa de quitar el ~10% de la vida del jugador al
   ~50%. El enemigo es a la vez más esponja y más cañón de cristal.
3. **El equipo pesa cada vez menos.** Sus estadísticas son planas por rareza y no dependen del nivel. Por eso el Rango A
   multiplica el daño base por ~3 a nivel 20 y solo por ~1,4-1,6 a nivel 80. El Tier S suma un 4-16% de daño sobre el A a
   nivel 80 y casi nada de vida [medido con `__defensa`]. En juegos como Diablo 3 o Darkest Dungeon el equipo es la mitad o más del progreso. Esto choca con la
   monetización que planeas (piezas SS numeradas, comercio entre jugadores): si el S casi no se nota, el SS vale por su efecto
   único, no por sus números.
4. **El reparto por senda se resuelve haciendo que el enemigo pegue distinto según tu clase** (`ENEMY_VS_CLASS`,
   `GUARDIAN_VS_CLASS`, `BOSS_VS_CLASS`, `ENEMY_VS_CLASS_81`, de ×0,46 a ×1,80). Es invisible para el jugador y cambia de
   sentido de una década a otra: al Guerrero las salas le pegan ×1,80 en 41-49, y su guardián de 61-69 ×0,79 (1,44 × 0,55).
   No encontré nada parecido en ninguno de los juegos estudiados. Ellos compensan las clases en el kit: vida, curación, posición, inmunidades.
5. **Las reglas de década (que es lo mejor del diseño actual) se añadieron encima de una calibración hecha sin ellas.**
   Los juegos que mejor envejecen (Hades, Slay the Spire, Diablo 2, Darkest Dungeon en modo Stygian) suben la dificultad
   sobre todo con **reglas**, no con números. En Dungeon & Stone las reglas suman dificultad sobre unos números que ya estaban
   ajustados al objetivo. Medido hoy (sección 4.4): en el simulador las reglas mueven poco los resultados (solo el Decreto,
   −12 puntos en niveles completados, y la Ley del Caos contra el jefe 70, −16, superan el ruido). Pero el simulador no se
   mueve de posición ni se defiende, así que no puede jugar ni medir bien las reglas. Además, la dispersión entre sendas
   (de 0 a 100% en el mismo nivel) y la deriva desde la última calibración son mayores que el efecto de cualquier regla.
6. **Recomendación: reajustar, pero por fases y sin tirar el motor.** No hace falta reescribir el combate ni tocar la base
   de datos: las estadísticas de equipo se recalculan del catálogo al cargar (`refreshGearFromTemplate`) y las del jugador
   salen de `derived()`. Se propone (sección 6):
   - una **curva de referencia única** por nivel para el jugador (vida y daño lineales);
   - los enemigos **derivados de esa curva por presupuesto**: rondas para ganar y golpes que aguanta el jugador, por tipo de
     enemigo y por tramo;
   - el **equipo como porcentaje** de esa curva (A ≈ +25%, S ≈ +35%, SS ≈ +42%);
   - la **dificultad de cada década repartida entre una tabla corta de presupuestos y su regla**;
   - **sin tablas por clase en los enemigos**.

   Serían unas 80 constantes legibles en vez de ~400. La migración (sección 7) empieza por un refactor que da exactamente los
   mismos números y termina década a década, con la condición de no empeorar a ningún personaje respecto a su piso actual.

---

## 2. Qué hacen los juegos comparables

### 2.1 Tabla comparativa

| Juego | Curva de enemigos | Fórmula de daño / defensa | Equipo vs nivel | Dificultad por modo | Reglas en vez de números | Fuentes |
|---|---|---|---|---|---|---|
| **Darkest Dungeon 1** | Tres niveles de mazmorra con números pequeños y casi lineales. Bone Soldier: 10 / 15 / 21 de vida, 15 / 25 / 25% de PROT, golpe 3-8 / 3-10 / 5-15 (Aprendiz / Veterano / Campeón) | PROT = % de reducción del daño directo, **tope 80%**; los DoT (Sangrado, Plaga) no los reduce | El héroe crece con las mejoras de arma y armadura (Crusader: vida 33 → 61, daño 6-12 → 10-19) y con baratijas; no hay XP de stats | **Stygian**: enemigos +20% de vida y +3% de crítico, *más* límite de 86 semanas y de 12 héroes muertos. **Radiant**: los mismos stats, menos fricción | Sí: estrés, luz, la Puerta de la Muerte, límites de tiempo y de muertes | [PROT](https://darkestdungeon.wiki.gg/wiki/Protection), [Bone Soldier](https://darkestdungeon.wiki.gg/wiki/Bone_Soldier), [Crusader](https://darkestdungeon.wiki.gg/wiki/Crusader), [Stygian](https://darkestdungeon.wiki.gg/wiki/Stygian) |
| **Darkest Dungeon 2** | Sin niveles de héroe por XP; mejoras en la Ciudad Viviente | Modificadores **aditivos dentro de cada bando y multiplicados entre bandos**. Fichas: Bloqueo −50%, Bloqueo+ −75%, Fuerza +50%, Débil −50%, Vulnerable +50%; crítico ×1,5 del máximo del rango | Casi todo el poder viene de fichas, baratijas y mejoras, no de stats | Kingdoms: fatiga que reduce la vida máxima | El sistema de fichas *es* la dificultad: el enemigo pone y quita fichas | [Mecánicas de combate](https://darkestdungeon.wiki.gg/wiki/Combat_Mechanics_(Darkest_Dungeon_II)), [Fichas](https://darkestdungeon.wiki.gg/wiki/Token) |
| **Slay the Spire (Ascensión 1-20)** | Saltos muy pequeños: Gremlin Nob 82-86 → 85-90 de vida (A8); Hexaghost 250 → 264 (A9); Skull Bash 6 → 8 (A3) | Daño plano menos Bloqueo; Vulnerable / Débil como multiplicadores | El poder está en el mazo y las reliquias, no hay nivel | 20 niveles acumulativos; solo 6 de 20 tocan la vida o el daño de los enemigos | A1 más élites, A5 curas menores tras el jefe, A10 maldición inicial, A11 menos pociones, **A17-19 patrones de ataque más duros**, A20 dos jefes | [Ascensión](https://slaythespire.wiki.gg/wiki/Ascension), [Gremlin Nob](https://slaythespire.wiki.gg/wiki/Gremlin_Nob), [Hexaghost](https://slaythespire.wiki.gg/wiki/Hexaghost), [GDC 2019](https://www.gdcvault.com/play/1025731) |
| **Hades (Calor)** | La vida y el daño de base no cambian por modo | Daño plano con multiplicadores de bendiciones | Poder por bendiciones de la partida + espejo permanente | Condiciones del Pacto (la fuente lista 15); solo 2 son números puros: Trabajos Forzados (+20% de daño por rango, 5 rangos) y Calistenia (+15% de vida por rango, 2 rangos) | Medidas Extremas (jefes con técnicas nuevas), Citación del Jurado (+20% de enemigos por rango), Consecuencias Duraderas (−25% de curación por rango), límite de tiempo, menos opciones de bendición… | [RPG Site](https://www.rpgsite.net/feature/10287-hades-pact-of-punishment-heat-modifiers-and-how-to-maximize-your-rewards) |
| **Diablo 2** | Nivel de monstruo por zona | Probabilidad de impacto = 2·AR/(AR+DEF) · nivel_atac/(nivel_atac+nivel_def), con topes 5-95% [fuente de foro, no oficial]; resistencias en %, **tope 75%** | El nivel abre habilidades; el equipo da resistencias y bonos | Pesadilla −40% y Infierno −100% a todas las resistencias | Inmunidades en Infierno, robo de vida −50% / −66%, Campo Estático que no baja de 33% / 50%, más modificadores en los únicos, XP perdida al morir | [Gamer Guides](https://www.gamerguides.com/diablo-ii-resurrected/guide/characters/builds/difficulty-levels), [hilo de Blizzard](https://us.forums.blizzard.com/en/d2r/t/bug-terrorized-zones-are-not-calculating-hit-chance-properly/141620) |
| **Diablo 3** | **Exponencial**: Normal → Tormento XVI = ×138.888 de vida y ×647 de daño. En las Grietas Mayores la vida es ×1,17 por nivel y el daño ×1,13 / ×1,07 / ×1,023 por tramos | Multiplicadores por cubetas, sin topes prácticos | Casi todo el poder viene de los conjuntos y del Paragon | Cada Tormento: +60% de vida, +45% de daño (T1-T6) | Pocas reglas: es la crítica clásica del juego | [Blizzard Watch](https://blizzardwatch.com/2019/05/22/torment-level-ready-diablo-3/), [Maxroll](https://maxroll.gg/d3/resources/greater-rift-explained) |
| **Diablo 4** | Por nivel de monstruo y tier | Armadura con tope del 85% de reducción física; las resistencias se calculan aparte | En la temporada 2 Blizzard pasó buena parte del daño de cubetas multiplicativas a aditivas y reajustó la escala de los monstruos | Tormento 1-4: −250 / −500 / −750 / −1000 de armadura y −25% / −50% / −75% / −100% de resistencias | Las penalizaciones son al *jugador*, no a los números del enemigo | [Wowhead (T2)](https://www.wowhead.com/diablo-4/news/diablo-4-season-2-campfire-chat-in-depth-blue-post-released-335447), [Pro Game Talk](https://progametalk.com/diablo-4/armor-cap-guide/), [Mein-MMO](https://mein-mmo.de/en/diablo-4-komplizierte-werte-einfach-nur-noch-eine-zahl-merken,1122015) |
| **Path of Exile** | Por nivel de zona | Armadura: reducción = A / (A + 5·daño_del_golpe), rinde menos contra golpes grandes; **tope del 90%** a la reducción física; resistencias con **tope del 75%** (hasta 90% con bonos) | Equipo y árbol pasivo | Penalización de −30% de resistencias tras el acto 5 y otra de −30% tras el acto 10 (−60% en total) | Modificadores de mapa | [gráfica de armadura (wiki)](https://pathofexile.gamepedia.com/File:ArmourReductionPlot.png), [resistencias (wiki)](https://pathofexile.fandom.com/wiki/Resistance), [GameDev.net](https://gamedev.net/blogs/entry/2265049-resistances-and-defenses) |
| **Final Fantasy X** | Por zona, sin niveles (Esferódromo) | Físico: base = (stat³/32 + 32) × factor de defensa (Def − 280,4)²/110 + 16, normalizado a /730; stats con tope 255 | El poder viene del Esferódromo; las armas aportan habilidades más que números | Sin modos | Overkill, Turbo, cambios de miembro | [compilación de fórmulas](https://lively-kernel.org/lively4/gs/damage-formula.md), [respuesta en StackExchange](https://backiee.wasmer.app/http_gamedev_stackexchange_com/a/22155) |
| **Octopath Traveler** | Por zona | Aproximación de la comunidad: max(0, 0,8·(ATQ − 0,5·DEF)) [no oficial] | Equipo y nivel | — | **Ruptura**: al vaciar los escudos el enemigo pierde un turno y recibe **×2 de daño**; PB: 1 por turno, guardas hasta 5 y gastas hasta 3 | [Gamer Guides](https://www.gamerguides.com/octopath-traveler/guide/the-basics/game-mechanics/battle-system), [compilación](https://lively-kernel.org/lively4/gs/damage-formula.md) |
| **Dragon Quest (XI / Walk)** | Por zona, lineal | Daño físico ≈ ATQ/2 − DEF/4 (resta) | Nivel y equipo | — | Tensión, estados | [Game8 (DQ11)](https://game8.jp/dq11/86597) |
| **Pokémon** | Stats **lineales con el nivel** | Daño = ((2·Nv/5 + 2) · Poder · A/D)/50 + 2, por STAB 1,5, tipo, crítico y azar 0,85-1. Vida = ⌊(2·Base + IV + ⌊EV/4⌋)·Nv/100⌋ + Nv + 10 | Nivel (y crianza) | — | Tipos, estados, clima | [Bulbapedia (daño)](https://bulbapedia.bulbagarden.net/wiki/Damage), [Smogon (stats)](https://www.smogon.com/dp/articles/stats) |
| **Monster Train (Pacto 1-25)** | Más vida y daño por pacto, con números por enemigo | Daño plano | Mazo y artefactos | 25 niveles acumulativos | Por ejemplo, la pira recibe daño (pacto 9), más vida para los jefes mayores (12) y menores (14), Serafín +1000 de vida (25) | [wiki (rangos de Pacto)](https://monster-train.fandom.com/wiki/Covenant_Ranks) |
| **Into the Breach** | Sin escala de stats | Daño fijo y determinista, ataques avisados | Pilotos y mejoras de núcleo | Fácil / Normal / Difícil / Injusto | La dificultad sube **con más Vek, no con Vek más fuertes** (según la comunidad); Injusto añade daño a la red inevitable | [PC Gamer](https://pcgamer.com/into-the-breach-preview), [Steam](https://steamcommunity.com/app/590380/discussions/0/1639790664923209434), [PC Gamer AE](https://pcgamer.com/into-the-breach-advanced-edition-2022) |
| **Persona 5 Royal** | Por zona | Aproximación: √Poder · √ATQ / √(8·DEF + 30) [compilación] | Nivel y personas | Seguro: daño recibido ×0,5 y causado ×1,6. Fácil ×0,5 / ×1. Difícil ×1,6 / ×0,8. Despiadado ×1,6 / ×0,65 pero **debilidades y críticos ×3** | Despiadado cambia la *regla* (premia explotar debilidades) | [Samurai Gamers](https://samurai-gamers.com/persona-5/system-difficulty/), [Push Square](https://www.pushsquare.com/guides/persona-5-royal-difficulty-settings-what-does-the-difficulty-level-change) |
| **Etrian Odyssey II** | Por piso | Ataque = (FUE + ATQ_arma/6)·(20 + FUE)·(20 + ATQ_arma/3); daño = ⌊ataque/DEF_monstruo⌋·1,7 (**cociente**, no resta); los monstruos usan otra fórmula por 0,8 | La FUE pesa mucho más que el arma | Picnic / Básico / Experto en los posteriores | Peligros del mapa (F.O.E.) | [LP Archive](https://lparchive.org/Etrian-Odyssey-II-Heroes-of-Lagaard/Update%2007/), [Wikipedia (Nexus)](https://en.wikipedia.org/wiki/Etrian_Odyssey_Nexus) |
| **Honkai: Star Rail** | Enemigos hasta nivel 95 | DEF: 1 − DEF/(DEF + 200 + 10·Nv_atacante); RES base 20%, rango −100% a 90%; multiplicador de Ruptura | Equipo (reliquias) ≫ nivel en el endgame | Contenidos de fin de juego por rotación | Debilidades y dureza (Ruptura) | [Prydwen](https://prydwen.gg/star-rail/guides/damage-formula) |
| **Epic Seven** | — | Daño ∝ ATQ·mult / (1 + DEF/300) [hilo de 2018, puede haber cambiado] | Equipo ≫ nivel | — | Ventaja elemental como probabilidad de fallar | [Reddit 2018](https://lr.eu.psf.lt/r/EpicSeven/comments/a4w774/damage_formula) |

### 2.2 Tasas de victoria publicadas o deducibles

No encontré tasas objetivo publicadas por los estudios. La charla de Mega Crit en la GDC 2019 explica que balanceaban con
métricas de elección y de victoria por carta, pero no publica los objetivos ([GDC Vault](https://www.gdcvault.com/play/1025731),
[resumen en Game Developer](https://www.gamedeveloper.com/design/learn-i-slay-the-spire-i-s-metrics-driven-approach-to-game-balancing-at-gdc-2019)).
Lo que sí es público son los porcentajes globales de logros de Steam, consultados el 2026-10-16. Miden a la población de
jugadores, no la probabilidad de ganar un intento, pero sirven de **embudo de referencia**:

| Juego | Hito | % de jugadores |
|---|---|---|
| Slay the Spire | Ganar con el Ironclad / Silent / Defect / Watcher | 56 / 51 / 44 / 26 |
| Slay the Spire | Completar Ascensión 10 / Ascensión 20 | 14,8 / 7,3 |
| Hades | Salir del Tártaro / Asfódelos / Elíseo / primera huida | 81,8 / 72,2 / 58,8 / 46,7 |
| Darkest Dungeon | Primer jefe / primera muerte de equipo entero | 53,4 / 41,8 |

Fuentes: [StS](https://steamcommunity.com/stats/646570/achievements), [Hades](https://steamcommunity.com/stats/1145360/achievements),
[DD](https://steamcommunity.com/stats/262060/achievements).

Lo que se deduce [estimación]: en Hades cada región "retiene" entre el 80 y el 88% de quienes llegan, y en Slay the Spire la
mitad de los jugadores que ganan una vez llega a Ascensión 10. Ningún juego exitoso apunta a una victoria del 10-20% contra el
jefe final con el equipo de referencia como modo *normal*. Eso se reserva al modo opcional (A20, Calor 32, Tormento XVI).
Tus objetivos (jefe 90 → 20%, jefe 100 → 10% con Rango A) son de "modo de prestigio". Para un juego que se va a monetizar,
eso implica que el contenido 81-100 lo verá una minoría muy pequeña: decisión tuya, pero conviene tomarla sabiéndolo.

### 2.3 Golpes para matar y para morir en los juegos de referencia [estimación a partir de las fuentes]

| Juego | Normal muere en | Élite / jefe muere en | El jugador aguanta |
|---|---|---|---|
| Darkest Dungeon 1 (Campeón) | Bone Sergeant, 21 de vida con 25% de PROT, contra un Crusader nivel 5 (10-19 de daño): **~2 golpes** | Jefes: 8-15 rondas | Crusader con 61 de vida contra 5-15 por golpe: **~6 golpes**, y después la Puerta de la Muerte |
| Slay the Spire | Gremlin Nob, 82-86 de vida: **~3-4 turnos** con el mazo inicial | Hexaghost, 250: **~8-10 turnos** | Ironclad con 80 de vida contra 6-16 por turno al principio: **~6-8 turnos** |
| Octopath | 2-4 acciones; la Ruptura duplica el daño durante un turno | Jefes: 15-30 turnos con 2-3 Rupturas | — |
| Pokémon (mismo nivel) | **2-4 golpes**, constante en todo el juego porque la vida, el ataque y la defensa crecen lineales y el daño usa el cociente A/D | — | Igual |

La lección de Pokémon, Etrian Odyssey, HSR y Epic Seven: **cuando la fórmula de defensa es un cociente (A/D, DEF/(DEF+k))
y los stats de ambos lados crecen con la misma curva, los golpes para matar y para morir se mantienen solos** en todo el
juego. Ese es el mando que falta en Dungeon & Stone.

### 2.4 Lo que se repite en los juegos que funcionan

1. **Una sola curva de poder** y los enemigos definidos contra ella. En Diablo 3 la curva es exponencial y explícita
   (×1,17 por Grieta). En Pokémon es lineal en los dos lados. Los dos son fáciles de mantener porque hay *una* regla.
2. **Topes duros en las defensas** (PROT 80% en DD, resistencias 75% en D2 y PoE, armadura 85% en D4, reducción física 90% en
   PoE, RES 90% en HSR). Evitan la inmunidad y hacen que las penetraciones rindan de forma predecible.
3. **Los modos difíciles tocan pocos números** y casi siempre con pasos grandes y legibles (+20% en DD Stygian, +20% de daño
   por rango en Hades), **y muchas reglas** (A17-19, Medidas Extremas, inmunidades de D2, Despiadado ×3).
4. **Las clases se equilibran en su kit**, nunca cambiando cuánto pega el enemigo según quién seas.
5. **Las cubetas multiplicativas se terminan pagando.** Blizzard tuvo que pasar daño de cubetas multiplicativas a aditivas en
   Diablo 4 y reajustar la escala de los monstruos ([Wowhead](https://www.wowhead.com/diablo-4/news/diablo-4-season-2-campfire-chat-in-depth-blue-post-released-335447)).
   Maxroll describe el "power creep de cada parche" que dejó obsoleta la escala de las Grietas de Diablo 3
   ([Maxroll](https://maxroll.gg/d3/resources/greater-rift-explained)). WoW necesitó varias compresiones de stats y niveles
   ([warcraft.wiki.gg](https://warcraft.wiki.gg/wiki/Level_squish)).

---

## 3. Cómo funciona hoy Dungeon & Stone

### 3.1 Jugador

- **Atributos** [código, `CLASS_GROWTH`]: cada senda reparte unos 5 puntos por nivel (el Guerrero 1,2 de Físico y 1,6 de
  Vigor; el Mago 1,4 de Habilidad y 1,0 de Vigor…).
- **Vida** [código, `derived()`]: `40 + nivel × HP_PER_LEVEL_REDESIGN` (Guerrero 17 … Mago 12) `+ 3 × Vigor` + vida plana
  del equipo. Lineal.
- **Daño base** [código, `baseDamageFromStat`]: `8 + 2,2 × stat de escala + 1,5 × nivel`, por el multiplicador de la
  habilidad. Lineal. `CLASS_DMG_REDESIGN` está en ×1 para todas; `CLASS_CURVE` / `CLASS_CURVE_BETA` ya no se usan con
  `CLASS_REDESIGN = true` y son **código muerto**.
- **Defensa**: `totalRes` limitado a −60…80; Vigor da hasta un 25% de reducción multiplicativa; reducción del equipo y de las
  piedras multiplicativa; evasión por Agilidad (tope 60%); bloqueo con perforación por nivel (`TANK_TUNE.blockPierce`,
  0,75% por nivel hasta el 80%).
- **Equipo** [código, `SET_CATALOG`, `WEAPON_CATALOG`]: valores **planos por rareza** (Guantes de Jack: Físico 5 / 8 / 12 /
  16 / 21 / 28 de Común a S), sin relación con el nivel. Las **piedras** suman 2 / 4 / 8 / 16 / 24 / 32 / 40 / 50 de stat de
  E a SS, con un hueco cada 10 niveles. Ambas se recalculan del catálogo al cargar (`refreshGearFromTemplate`).

Medido con `__defensa` (humano, sin piedras ni Caídos) [medido]:

| Nivel | Guerrero vida (sin equipo / A / S) | Guerrero daño base (sin / A / S) | Mago vida | Mago daño base (sin / A / S) |
|---|---|---|---|---|
| 1 | 72 / 174* / 309* | 21 / 124* / 175* | 67 | 23 / 221* / 357* |
| 20 | 485 / 622 / 722 | 97 / 218 / 251 | 352 | 108 / 353 / 443 |
| 40 | 921 / 1058 / 1158 | 180 / 312 / 334 | 652 | 200 / 444 / 534 |
| 60 | 1357 / 1494 / 1594 | 263 / 384 / 417 | 952 | 292 / 536 / 626 |
| 80 | 1793 / 1930 / 2030 | 346 / 478 / 498 | 1252 | 383 / 627 / 718 |
| 100 | 2229 / 2366 / 2466 | 429 / 550 / 580 | 1552 | 475 / 719 / 809 |

\* Nivel 1 con Rango B o S solo como prueba del catálogo (el S no se puede equipar hasta el 40). Se ve que **el equipo
multiplica el daño del Guerrero por 6 a nivel 1, por 2,2 a nivel 20 y por 1,4 a nivel 80**: su peso cae con el nivel
porque es plano. Del A al S, a nivel 80, el Guerrero gana +4% de daño y +5% de vida; el resto de sendas, +13-16% de daño.
La vida del Mago no cambia con el equipo porque su conjunto no da vida.

### 3.2 Enemigos: las capas

`makeEnemy` y el combate aplican, en este orden [código]:

1. base al azar por tipo (normal 55-65 de vida y 9 de ataque, élite 125-135 y 16, guardián o jefe 300 y 26);
2. `tpl.hp` y `tpl.atk` de cada plantilla;
3. `floorMult = 1 + piso × 0,05 u 0,08` (`floorDifficultyStep`);
4. curva por tipo: `regularHPMult` (×1,16 compuesto hasta el 10 y +14% lineal después), `eliteHPMult`, `levelMult`
   (×1,14 y +6%) y `monsterAtkMult` (×1,14 y +2,5%). Son **cuatro curvas distintas** para vida y ataque;
5. jefe de década: `DECADE_BOSS_TUNING` o `BETA_DECADE_BOSS_TUNING` y `tpl.tune` (variantes del Retornado);
6. cuentas beta y décadas 0-3: `BETA_ENEMY_SCALE`, `BETA_ENEMY_SCALE_TUTORIAL` y `BETA_LEVEL_TAPER`; el resto,
   `DECADE_ENEMY_TUNING`, que es otra tabla para las cuentas alfa en 21-40;
7. modo de juego (`GAME_MODES`: HardMode ×1,30);
8. rifts: `RIFT_TUNING` y `RIFT_BOSS_HP`; escoltas: `GUARDIAN_ELITE_81` / `_91`, `PARAISO_GUARDIAN_GROUP`;
9. resistencia +0,8 por piso, evasión, precisión y crítico por piso o por nivel;
10. en cada golpe al jugador: `enemyVsClassMult` (`ENEMY_VS_CLASS` × `GUARDIAN_VS_CLASS`, o `BOSS_VS_CLASS`, por senda y por
    profesión);
11. `vsFront`, `GUARDIAN_VS_FRONT` y `_81`, `COMMON_VS_TANK` y `_81`; `rearMult` y `BOSS_AOE_REAR_FACTOR`;
    `HIDDEN_FRONT_GUARD` (solo aliados, oculto); perforación de bloqueo;
12. `levelDiffDamageMult`, `ENEMY_CRIT_MULT` 1,3;
13. reglas de década: Telaraña +15% recibido, Manada +10% por muerte, Muralla −30%, Decreto, Marea 8% de la vida máxima,
    Suelo ardiente, Condena, Ley del Caos (+15%, +10% de evasión, inmunidades), Corrupción (+4% recibido por carga, hasta 10);
14. votos: Sin piedad +12%, Codicia con más enemigos, Soledad con un aliado menos.

Las tablas de calibración suman unas **400 constantes** [código, recuento mío]: `ENEMY_VS_CLASS` ≈ 84,
`GUARDIAN_VS_CLASS` ≈ 84, `BOSS_VS_CLASS` ≈ 84, `DECADE_ENEMY_TUNING` 48, `BETA_ENEMY_SCALE` 24, jefes 28, `RIFT_TUNING` 40,
`BETA_LEVEL_TAPER` 10, más los castigos al frente.

### 3.3 Qué sale de todo eso

Vida y ataque de base sin plantilla (piso 3) [código, calculado con las fórmulas], y lo que el simulador encontró en
combate (primer enemigo del grupo, media de las seis sendas, n = 6 por celda) [medido]:

| Nivel | Vida de un normal (fórmula) | Ataque de un normal | Factor de década | En el sim: vida / ataque del 1.er enemigo normal | Vida del jugador A (media) | Ataque / vida del jugador | Turnos del combate normal |
|---|---|---|---|---|---|---|---|
| 5 | 231 | 32 | 1,85 | 257 / 37 | 352 | 10% | 3 |
| 15 | 1.071 | 98 | 2,40 / 2,58 | 1.091 / 116 | 542 | 21% | 4 |
| 25 | 2.099 | 119 | 2,58 | 2.569 / 152 | 809 | 19% | 13 |
| 35 | 4.452 | 238 | 3,77 / 4,35 | 5.530 / 309 | 1.111 | 28% | 18 |
| 45 | 2.307 | 94 | 1,49 | 2.930 / 125 | 1.420 | 9% | 11 |
| 55 | 5.517 | 299 | 2,88 / 4,18 | 7.910 / 391 | 1.383 | 28% | 21 |
| 65 | 7.511 | 399 | 3,29 / 4,99 | 9.215 / 501 | 1.853 | 27% | 31 |
| 75 | 9.223 | 471 | 3,48 / 5,33 | 11.652 / 621 | 1.995 | 31% | 20 |
| 85 | 15.692 | 772 | 5,20 / 7,98 | 21.313 / 1.004 | 2.268 | 44% | 19 |
| 95 | 22.612 | 1.079 | 6,68 / 10,26 | 29.679 / 1.366 | 2.566 | 53% | 27 |

Jefes de década (vida / ataque en el sim, vida del jugador y turnos) [medido]: Ogro 873 / 71 (445 de vida, 5 turnos);
Matriarca 5.310 / 164 (676, 18); Riakis 17.813 / 468 (1.027, 38); Usurpador 20.717 / 635 (1.029, 26); Custodio
16.133 / 538 (1.423, 89); Storm Gush 53.104 / 1.753 (1.608, 29); Sin Forma 52.272 / 1.700 (1.981, 27); Corazón 65.137 /
1.835 (2.022, 27); Carcelero 79.285 / 2.277 (2.475, 27); Retornado 210.887 / 5.922 (2.780, 24).

El ataque es en bruto, antes de resistencia (16-46% según la senda), multiplicador de habilidad y tabla por senda. Aun así, a
partir del 60 **el golpe básico de un jefe de década iguala o supera la vida entera del jugador** (Storm Gush 109%, Retornado
213%). La defensa y los aliados son los que lo hacen sobrevivible, y eso es exactamente lo que hace el sistema tan sensible.

---

## 4. Diagnóstico

### 4.1 Lo que está bien (y se parece a los buenos)

- **La fórmula de mitigación** por porcentaje con topes (−60…80 en el jugador), las penetraciones planas y los críticos se
  parecen a Diablo 2 / PoE / DD. Son legibles para el jugador.
- **Posición, frente y retaguardia, intenciones visibles, estados con cargas**: es el lenguaje de Darkest Dungeon y Octopath.
- **Las reglas de década** (Telaraña, Manada, Espejismo, Decreto, Marea, Ley del Caos, Corrupción, Suelo ardiente, Condena) y
  los **votos** son exactamente lo que hacen Hades, Slay the Spire y DD Stygian. Es lo más valioso del diseño actual.
- **Calibrar con simulador** es lo que hace Mega Crit con métricas. Tener `simLevels` / `simRun` es una ventaja grande.
- **Las estadísticas se derivan, no se guardan**: un rediseño no exige migrar la base de datos.

### 4.2 Lo que no

1. **Curvas sin relación.** El jugador crece de forma lineal y los enemigos con cuatro curvas lineales distintas (vida
   normal +14% por nivel desde el 10, élite +10%, guardián +6%, ataque +2,5%), además de un compuesto ×1,14-1,16 en los
   primeros 10 niveles. La diferencia la absorben factores de década en zigzag (1,85 → 2,40 → 2,58 → 3,77 → **1,49** → 2,88 →
   3,29 → 3,48 → 5,20 → 6,68 en vida de normales). Ningún juego de la tabla tiene una curva con forma de sierra: se corrige con
   una curva bien elegida.
2. **Los combates se alargan y se vuelven más letales a la vez** [medido]: de 3-4 turnos a 20-30 en un combate normal, y el
   golpe de un normal pasa del 10% al 50% de la vida del jugador. Es el peor cuadrante: largo (mucho tiempo invertido) y
   frágil (se pierde de golpe). DD y StS se mueven en 2-4 golpes para matar a un normal y 6-8 para morir.
3. **El equipo pierde peso con el nivel** (sección 3.1). Para un juego que quiere vender o comerciar piezas SS es un problema
   de diseño, no solo de balance: lo que se persigue tiene que notarse.
4. **Tablas por senda en el daño enemigo.** Cambian de década en década sin una lógica de clase reconocible. Al Guerrero
   le pegan ×1,80 en las salas de 41-49 y ×0,79 en el guardián de 61-69 (1,44 × 0,55). Al Hechicero, ×0,56 en las salas de
   61-69 y ×1,03 en el guardián de 71-79 (0,57 × 1,80). Además:
   (a) son invisibles, (b) cualquier cambio en un kit desajusta las 10 décadas, (c) con las 12 profesiones ya son 18 columnas,
   y (d) castigan al que juega mejor su clase. Ninguno de los juegos estudiados lo hace.
5. **Sensibilidad extrema.** Las notas del propio código dicen que el Corazón Marchito pasa del 23% al 39% con un cambio de
   ~2% en vida y ataque (`DECADE_BOSS_TUNING[80]`), y que el Usurpador y el jefe 40 son "muy sensibles". Cuando el ataque
   del jefe ronda la vida del jugador, cada punto decide si muere de uno o de dos golpes: la curva de victorias se vuelve un
   escalón. Las memorias de calibración registran además diferencias de 17 puntos entre sesiones con la misma configuración.
6. **Dos juegos en paralelo** en 1-40 (`BETA_BALANCE`: cuentas alfa con `DECADE_ENEMY_TUNING` y 4 aliados; cuentas beta con
   `BETA_ENEMY_SCALE`, `BETA_DECADE_BOSS_TUNING` y las tablas por senda). Duplica el trabajo de cada ajuste.
7. **Código muerto y capas residuales**: `CLASS_CURVE`, `CLASS_CURVE_BETA` y `CLASS_DMG_REDESIGN` (todo ×1), el viejo
   `bonus.stat==='maxhp'` ×8, `FRONTLINE_DAMAGE_REDUCTION = 0`, `COMMON_VS_TANK_81 = ×1`. No hacen daño pero confunden.
8. **Las reglas se calibraron después de los números.** Ver la sección 4.4.

### 4.3 La pila de multiplicadores: mantenimiento, sensibilidad, sendas

- **Mantenimiento**: añadir una habilidad, un Caído o una pieza SS obliga en teoría a volver a medir todas las décadas, porque
  cada número se ajustó con todos los demás fijos. Es un problema de *acoplamiento*: el valor de `ENEMY_VS_CLASS[6].mago`
  solo tiene sentido con el kit, el equipo de referencia, los aliados, la regla de la década y la IA del simulador de ese día.
- **Sensibilidad**: con capas multiplicativas los errores también se multiplican. Un ±5% en tres capas es un ±16% al final.
- **Sendas**: la tabla por senda **iguala la media pero no la experiencia**. En las salas de 61-69, un Mago recibe la mitad del daño
  (×0,71) que un Guerrero (×1,44) por el mismo golpe del mismo enemigo, y ninguno de los dos lo sabe.

### 4.4 Las reglas nuevas, medidas

`__alter(false)` apaga las reglas de década, la Ley del Caos y la Corrupción. Todo con la referencia de
`tools/calib_harness.js` (de 81 a 100, Rango A con 4 aliados y sin profesión) [medido].

**a) Nivel entero** (`__simLevel`: vida, MP, pociones y bajas se arrastran de sala en sala hasta el guardián), en los niveles
x5, con 8 recorridos por senda (48 por celda). Error estándar de la media ≈ ±7 puntos; de cada senda ≈ ±17.

| Nivel | Regla de la década | Niveles completados sin reglas → con reglas (%) | Por senda con reglas (Gue / Pal / Ase / Arq / Mag / Hec) |
|---|---|---|---|
| 15 | Telaraña | 96 → 94 | 88 / 100 / 100 / 100 / 100 / 75 |
| 25 | Manada | 58 → 54 | 38 / 50 / 63 / 63 / 75 / 38 |
| 35 | Espejismo | 71 → 77 | 50 / 75 / 75 / 100 / 100 / 63 |
| 45 | Decreto | 81 → 69 | 63 / 75 / 63 / 38 / 88 / 88 |
| 55 | Marea | 25 → 19 | 0 / 25 / 38 / 0 / 25 / 25 |
| 65 | Ley del Caos | 48 → 50 | 50 / 63 / 50 / 25 / 50 / 63 |
| 75 | Corrupción | 31 → 50 | 25 / 38 / 50 / 63 / 50 / 75 |
| 85 | Suelo ardiente | 19 → 17 | 25 / 13 / 50 / 13 / 0 / 0 |
| 95 | Condena | 21 → 19 | 13 / 0 / 13 / 63 / 0 / 25 |

**b) Combates sueltos** con el grupo descansado, 12 por senda (72 por celda, ±6 en la media). Las salas normales y los
guardianes de 15-45 están en el 96-100% con o sin reglas, porque un combate suelto con el grupo descansado casi no se pierde
(el objetivo de las salas se mide por recorrido). Lo que sí discrimina:

| Combate | Sin → con reglas (%) | | Combate | Sin → con reglas (%) |
|---|---|---|---|---|
| Jefe 30 (Riakis) | 85 → 88 | | Guardián 75 | 83 → 76 |
| Jefe 40 (Usurpador) | 68 → 65 | | Jefe 80 (Corazón) | 42 → 33 |
| Jefe 50 (Custodio) | 75 → 74 | | Normal 85 | 89 → 85 |
| Guardián 55 | 44 → 49 | | Guardián 85 | 49 → 50 |
| Jefe 60 (Storm Gush) | 44 → 40 | | Jefe 90 (Carcelero) | 15 → 11 |
| Guardián 65 | 90 → 88 | | Normal 95 | 61 → 71 |
| Jefe 70 (Sin Forma) | 47 → 31 | | Guardián 95 | 38 → 33 |
| Normal 75 | 97 → 93 | | Jefe 100 (Retornado) | 6 → 4 |

Lo que se puede afirmar con este ruido:

1. **El efecto de las reglas sobre el simulador es pequeño, casi siempre dentro del ruido.** Las únicas diferencias que
   pasan de dos errores estándar son el Decreto de 41-50 (−12 en niveles completados) y el jefe 70 con la Ley del Caos
   (−16). Hace falta n ≥ 200 por celda para medir reglas de ±5 puntos.
2. **La dispersión entre sendas (0-100% en el mismo nivel) es mucho mayor que el efecto de cualquier regla.** Con
   `ENEMY_VS_CLASS` y compañía ya puestos, la calibración por senda no se sostiene en cuanto cambia algo, o nunca fue más
   precisa que el ruido de 8-16 intentos con que se ajustó.
3. **Deriva respecto a la última calibración.** En los niveles x5, 21-29 completa ~56% y 51-59 ~22%. Las notas de la
   recalibración del 2026-10-09 daban ~69% y ~38% en los niveles x3 / x7. Puede ser por el nivel elegido (x5) o por lo que
   cambió después (guardianes con lección, grupos inteligentes, reglas). Hay que confirmarlo con más muestra antes de tocar
   nada, pero es la clase de deriva que produce un sistema donde cada número depende de todos los demás.
4. Los jefes medidos con reglas (30 88, 40 65, 50 74, 60 40, 70 31, 80 33, 90 11, 100 4) quedan cerca de tus objetivos
   (80 / 75 / 70 / 50 / 40 / 30 / 20 / 10). Los de 60-100 quedan por debajo, aunque 90 y 100 se calibraron con profesiones y
   aquí se midieron sin ellas.

Advertencia importante sobre esta medida: **el simulador no cambia de posición ni se defiende** (`simOneFight` siempre usa la
habilidad elegida por `simPickSkill`). Por eso exagera el coste de las reglas de posición (Telaraña 11-20, Marea 51-60, Suelo
ardiente 81-90), que un jugador real esquiva moviéndose. Y no entiende el Espejismo (31-40): pega al falso igual que a uno real.

---

## 5. Veredicto

**Conviene reajustar el sistema de escala y de calibración, no el motor de combate.** La fórmula de daño, los estados, la
posición, las reglas y los votos se quedan. Lo que se sustituye es *cómo se obtienen los números* de vida y ataque (del
jugador, del equipo y de los enemigos) y *dónde vive el equilibrio entre clases*.

Si prefieres no reajustar ahora, el mínimo que recomiendo (sección 6.7) es: quitar el zigzag de décadas, poner los
multiplicadores por senda a ×1 en un nivel fijo de prueba y medir de nuevo con las reglas puestas, y hacer que el simulador
use posición y defensa.

---

## 6. Propuesta: sistema por presupuesto

### 6.1 Idea

1. Una **referencia por nivel** con dos números: vida efectiva del jugador `H(L)` y daño por acción `D(L)`.
2. Cada tipo de enemigo se define por **presupuesto**: cuántas rondas tarda el grupo de referencia en ganarle (`R`) y cuántos
   de sus golpes aguanta el jugador de referencia (`G`). La vida y el ataque *salen* de ahí:
   - `vida_enemigo = R × daño_por_ronda_del_grupo(L) / número_de_enemigos`
   - `ataque_enemigo = H(L) / G / (1 − mitigación_de_referencia)`
3. La plantilla del enemigo solo dice su **forma** (tanque 1,4× de vida y 0,7× de ataque, asesino 0,7× y 1,4×, etc.,
   manteniendo el producto) y su kit.
4. La **década** cambia `R`, `G` y su **regla**. Nada más.
5. El **equipo** y las **piedras** son un porcentaje sobre `D` y `H`, así que valen lo mismo a nivel 20 que a nivel 90.
6. Las **clases** se equilibran en su kit con un presupuesto de clase: aguante × daño ≈ constante.

Es la idea de Pokémon (cociente con stats que crecen juntos) aplicada al revés: en vez de esperar que las curvas coincidan, los
enemigos *se calculan* desde la curva del jugador.

### 6.2 Fórmulas concretas [estimación: valores de partida para afinar con el simulador]

**Jugador** (se mantiene el orden de magnitud actual para que nadie note un "recorte"):

- `H_base(L) = 40 + 16·L` (vida media de las seis sendas). Por senda: Guerrero ×1,25, Paladín ×1,15, Asesino ×0,95, Arquero
  ×0,9, Hechicero ×0,85, Mago ×0,8.
- `D_base(L) = 10 + 5·L` (daño por acción de la habilidad principal). Por senda, al revés: Guerrero ×0,8, Paladín ×0,85,
  Asesino ×1,05, Arquero ×1,1, Hechicero ×1,15, Mago ×1,2. Así **vida × daño ≈ 1,0** en todas.
- Los atributos siguen existiendo y repartiéndose como hoy (`CLASS_GROWTH`), pero normalizados: el stat de escala se
  convierte en daño de modo que el jugador de referencia caiga en `D_base(L)`.

**Equipo** (porcentaje sobre la curva, no plano):

| Rareza | Común | Poco común | Raro | B | A | S | SS |
|---|---|---|---|---|---|---|---|
| Bono total (vida y daño) con el conjunto completo | 0% | +5% | +10% | +16% | +25% | +35% | +42% (+ efecto único) |

**Piedras de alma**: hasta +10% sumando todos los huecos (+1% por hueco en A, +1,5% en S). Su efecto avanzado (robo de vida,
doble lanzamiento, revivir) se queda: es el sabor, no el número.

**Caídos y aliados**: en la referencia cuentan como daño de grupo: `daño_por_ronda = D(L) × (1 + 0,55 × aliados)`. El 0,55
hay que medirlo [estimación]. Que la referencia de aliados por década sea **explícita** (hoy 0 / 1 / 2 / 3 / 4) hace que los
enemigos no tengan que cambiar de tabla según lo que lleves.

**Defensa**: se mantiene el % de resistencia con tope (−60…80, se propone bajar el tope a 75 como D2 y PoE). La resistencia
del enemigo deja de crecer +0,8 por piso y queda fija por plantilla (débil 0, normal 15, resistente 35, muy resistente 55).
El crecimiento por piso pasa a `R` / `G`, que es donde se ve.

### 6.3 Presupuestos y números de ejemplo [estimación]

Presupuesto por tramo (`R` = rondas del grupo de referencia para ganar; `G` = golpes que aguanta el jugador de referencia):

| Tipo | 1-20 R / G | 21-60 R / G | 61-100 R / G |
|---|---|---|---|
| Grupo normal (3 enemigos) | 3 / 8 | 4 / 7 | 4,5 / 6 |
| Élite | 5 / 5 | 6 / 4,5 | 7 / 4 |
| Guardián | 8 / 4 | 10 / 3,5 | 12 / 3 |
| Jefe de década | 12 / 3,5 | 15 / 3 | 18 / 2,5 (golpe fuerte avisado: 1,5) |

Valores resultantes (mitigación de referencia 35%, aliados de referencia 0/0/1/3/4/4/4):

| Nivel | Vida jugador | Daño jugador | Aliados | Normal vida / ataque | Élite | Guardián | Jefe de década |
|---|---|---|---|---|---|---|---|
| 1 | 56 | 15 | 0 | 15 / 11 | 75 / 17 | 120 / 22 | 180 / 25 |
| 10 | 220 | 66 | 0 | 66 / 42 | 330 / 68 | 528 / 85 | 792 / 97 |
| 20 | 432 | 132 | 1 | 205 / 83 | 1.023 / 133 | 1.637 / 166 | 2.455 / 190 |
| 40 | 850 | 262 | 3 | 926 / 187 | 4.166 / 291 | 6.943 / 374 | 10.415 / 436 |
| 60 | 1.300 | 403 | 4 | 1.719 / 286 | 7.738 / 444 | 12.896 / 571 | 19.344 / 667 |
| 80 | 1.716 | 533 | 4 | 2.558 / 440 | 11.939 / 660 | 20.467 / 880 | 30.701 / 1.056 |
| 100 | 2.132 | 663 | 4 | 3.182 / 547 | 14.851 / 820 | 25.459 / 1.093 | 38.189 / 1.312 |

Se calculó con las fórmulas de 6.2. El bono de equipo de referencia es ×1,0 hasta el 4, ×1,1 hasta el 19, ×1,2 hasta el
39, ×1,25 hasta el 59 y ×1,3 después. Los normales comparten el presupuesto entre 3. Comparado con hoy: los
normales de 55-95 tendrían de 3 a 9 veces menos vida y algo menos de ataque, y **los combates normales volverían a 4-5
rondas en vez de 20-30**. Si prefieres combates más largos, se sube `R`, que es un único número por tramo. Los jefes de
década quedan en el mismo orden de magnitud que hoy (Storm Gush ~53.000 hoy, 19.000 en la propuesta; Retornado ~211.000 hoy,
38.000 más sus fases y sombras). La diferencia es que el golpe del jefe deja de igualar la vida del jugador: pasa a quitarle
un tercio, o media vida con el golpe fuerte avisado.

### 6.4 Las reglas de década en este sistema

Cada regla tiene un **valor en presupuesto**, medido una vez con el simulador (con la IA de posición, ver 7.1), y la década
**descuenta ese valor de `R` / `G`**. Así la regla *sustituye* números en vez de sumarse:

| Década | Regla | Dónde actúa | Compensación propuesta |
|---|---|---|---|
| 11-20 | Telaraña | frente, cada 3 rondas | G +10% si el jugador puede salir; ninguna si no |
| 21-30 | Manada | +10% por muerte | G +10% (castiga el orden en que matas, no el total) |
| 31-40 | Espejismo | un enemigo falso | R −10% (añade un objetivo, no daño) |
| 41-50 | Decreto | coste, curación o muralla | R y G sin cambio; medir cada decreto por separado |
| 51-60 | Marea | 8% de la vida máxima cada 4 rondas | G +8% |
| 61-70 | Ley del Caos | un enemigo con ley | R −5% |
| 71-80 | Corrupción | ±3-4% por carga | sin cambio (es una apuesta del jugador) |
| 81-90 | Suelo ardiente | quieto 3 rondas → Quemadura | G +5% |
| 91-100 | Condena | una habilidad encadenada | R −10% |

Los porcentajes son **míos y de partida**: hay que medirlos (sección 7, fase 3). La regla es lo que hace distinta a la
década; los números solo deberían subir de forma suave y monótona.

**Votos** (como el Calor): cada voto debería costar un número fijo de puntos de presupuesto (por ejemplo, Sin piedad = G −10%,
Codicia = +1 enemigo por élite, Soledad = −0,55 en el multiplicador de aliados) y dar una recompensa proporcional a ese coste.
HardMode puede expresarse igual: R ×1,3 y G ×0,77 (lo mismo que hoy ×1,3), más su regla de foco.

### 6.5 Clases sin tablas en los enemigos

- Presupuesto de clase en la curva (vida × daño ≈ 1).
- Lo que hoy compensan `ENEMY_VS_CLASS` y compañía se mueve al kit: robo de vida o escudo propio para Arquero y Mago (las
  memorias de calibración ya mostraron que su problema es el aguante, no el daño), protección de retaguardia, y que los
  castigos al frente sean una **regla visible** de esos guardianes ("pega más fuerte a quien está delante").
- Se acepta un margen: cada senda dentro de ±10 puntos de la media en cada tramo. Fuera de eso se toca el kit, no el enemigo.

### 6.6 Objetivos de victoria

Se mantienen los que fijaste el 2026-10-09 (salas 90 → 60%, jefes 90 → 10%), medidos con las reglas puestas. Mi
recomendación [estimación, por la sección 2.2]: separar "normal" y "prestigio". En normal, los jefes 60-100 en 50-35%; el
10-20% déjalo para HardMode, los votos y el Retornado.

### 6.7 Si no se reajusta: retoques mínimos

1. Sustituir los factores de década por una curva monótona: ajustar `regularHPMult` / `monsterAtkMult` para que el factor
   de década quede entre 1 y 1,5, sin el hueco de 41-50 (el desierto de Paraíso puede ser una regla: más élites, sin
   descansos).
2. Equipo: multiplicar el bono plano de cada rareza por `(1 + nivel/40)`, o pasarlo a porcentaje.
3. Llevar `ENEMY_VS_CLASS` y `GUARDIAN_VS_CLASS` hacia 1 y compensar con el kit.
4. Simulador con IA de posición y defensa; volver a medir las décadas con las reglas puestas.
5. Borrar `CLASS_CURVE`, `CLASS_CURVE_BETA` y `CLASS_DMG_REDESIGN`.

---

## 7. Plan de migración por fases

Condición en todas las fases: **ningún personaje existente queda peor respecto al piso en el que está**. Se comprueba con la
referencia y con un "personaje tipo" por década (el equipo más común de los jugadores, que se puede sacar de `death_log` y
de `characters` sin escribir nada).

**Fase 0. Herramientas (sin cambios de juego).**
- IA de simulador con posición y defensa (mover si hay Telaraña, Marea o Suelo ardiente; defender ante golpes avisados) y con
  noción del Espejismo.
- Un banco fijo de pruebas: semilla, 200 combates por celda, todas las décadas, reglas encendidas, en una pestaña visible.
- Un "informe de presupuesto" que mida, para el estado actual, `R` y `G` reales por tipo y década. Es el punto de partida.

**Fase 1. Refactor sin cambio de números.**
- Una sola función `enemyStats(tpl, nivel, tipo, contexto)` que reúna todas las capas actuales y dé **exactamente** los mismos
  valores. Pruebas de instantánea (vida y ataque de cada plantilla en cada nivel) antes y después.
- Borrar el código muerto.

**Fase 2. Jugador y equipo.**
- Cambiar la conversión stat → daño y el equipo a porcentaje. Los objetos se recalculan solos al cargar
  (`refreshGearFromTemplate`), así que **no hace falta migrar la base**.
- Ajustar para que el personaje de referencia de cada nivel quede igual o por encima de hoy, y que S y SS se noten (+10% y
  +17% sobre el A).
- Las piezas SS numeradas conservan su efecto único; su base pasa a "S +15%" sobre la curva nueva, igual que hoy pero
  relativo.

**Fase 3. Enemigos por presupuesto, década a década.**
- Empezar por una década con regla clara y poco tráfico (por ejemplo 51-60), detrás de un interruptor por década. Medir
  regla por regla su valor en presupuesto.
- Al dar por buena una década, borrar sus entradas de `DECADE_ENEMY_TUNING`, `BETA_ENEMY_SCALE`, `ENEMY_VS_CLASS`,
  `GUARDIAN_VS_CLASS`, `BOSS_VS_CLASS` y `RIFT_TUNING`.
- Rifts: tres etapas sin curarse = presupuesto de la década con `G` repartido entre las tres (hoy `RIFT_TUNING` lo hace a mano).

**Fase 4. Unificar alfa y beta** en 1-40: las cuentas alfa adoptan la referencia de aliados de la beta o reciben un bono de
grupo explícito, sin tablas paralelas.

**Fase 5. Clases.** Quitar las tablas por senda; mover lo necesario al kit y medir con la IA nueva.

Cada fase se puede desplegar sola y deshacer con un interruptor.

---

## 8. Riesgos

| Riesgo | Mitigación |
|---|---|
| Los jugadores perciben un "nerf" (números más pequeños, el S que "ya no es tanto") | Mantener el orden de magnitud de vida y daño del jugador; S y SS ganan peso relativo; comunicarlo como "temporada" |
| Las piezas SS y el comercio entre jugadores (monetización) cambian de valor | Fijar su ventaja relativa en porcentaje antes de tocar nada; no cambiar su efecto único |
| El simulador no representa a un jugador real (rotaciones, posición, Espejismo) | Fase 0; contrastar con `death_log` (dónde muere la gente de verdad) |
| Ruido de medida: ±14-17 puntos por senda con 8-12 intentos | 200 combates por celda en la fase 3, pestaña visible, misma sesión para comparar |
| Coste de trabajo: re-medir 10 décadas, 6 sendas y 12 profesiones | Por fases; cada década es independiente gracias al presupuesto |
| Rifts, HardMode, Inmortal y votos dependen de la escala actual | Expresarlos como modificadores de R / G (sección 6.4), que se trasladan solos |
| Los objetivos de victoria del 10-20% dejan 81-100 a muy pocos jugadores | Decisión de diseño: ver 6.6 |
| Cambiar durante la beta altera récords y comparativas | Desplegar por década y anunciar |

---

## Nota sobre las fuentes

Algunas páginas no se pudieron leer desde aquí: Bulbapedia, varias wikis de Fandom (Path of Exile, Monster Train, Hades),
poewiki y Prydwen bloquearon la descarga. En esos casos el dato sale del extracto del buscador o de una segunda fuente que se
cita al lado (Smogon para las stats de Pokémon, el blog de GameDev.net para las resistencias de PoE). Varias fórmulas son
reconstrucciones de la comunidad y no documentación oficial: la de impacto de Diablo 2, la de Octopath, la de Persona 5, la
de Epic Seven (hilo de 2018) y la de defensa de HSR (Prydwen). Así se indica en la tabla. Los porcentajes de logros de Steam
se consultaron el 2026-10-16 y cambian con el tiempo.

## Anexo A. Cómo se midió

- Servidor local `python -m http.server 5188` sobre esta rama (igual a `main` en `c44dfd1`), navegador integrado, sin sesión.
- `window.__defensa(senda, nivel, rango)` para las estadísticas del jugador (humano, sin piedras ni Caídos).
- `window.__sim({style, level, dungeonLevel, node, beta:true, n:1, ...refFor(nivel)})` para los combates sueltos (grupo
  descansado, 3 pociones de vida mayor, aliados y equipo de `tools/calib_harness.js`; de 81 a 100 se usa la última
  referencia, Rango A con 4 aliados y **sin profesión**).
- Tabla 3.3: un combate por senda y celda; los valores de vida y ataque son del primer enemigo del grupo, así que dependen de
  la plantilla que salió (sirven como orden de magnitud, no como dato exacto). Las victorias de esa tabla, con n = 6, no
  sirven como tasa.
- Sección 4.4: niveles enteros con 8 recorridos por senda, nivel y estado de las reglas (864 recorridos), y combates sueltos
  con 12 por senda, celda y estado (3.888 combates). En total, unos 20 minutos de simulación en una pestaña en segundo plano.
  Una primera tanda se perdió porque otra sesión navegó la pestaña compartida; se repitió en una pestaña propia.
- `__alter(false)` apaga las reglas de década, la Ley del Caos y la Corrupción (`SIM_NO_ALTERATIONS`).
- Las vidas y ataques "de fórmula" de la sección 3.3 se calcularon con las funciones de `src/game.js` copiadas, para el piso
  3, sin plantilla y con la escala beta en 1-40.
