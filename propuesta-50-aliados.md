# Propuesta: 50 aliados nuevos (Taberna de Shaza)

Rama `propuesta-aliados`, sobre `origin/main`. Solo es un documento: no toca `src/`, ni Supabase, ni nada desplegado.
Fecha: 2026-10-17.

Marcas:
- **[nuevo]**: hace falta código nuevo (o una migración) para que funcione. Lo que no lleva la marca usa piezas que el motor ya tiene: estados con `dmgMult`, `incomingDmgReduction`, `regenPct`, `evasionDelta`, `resBonus`; `applyStatus`; `grantShield`; curación; elegir objetivo; aliados invitados (`guest`, `isShadow`).
- Todos los números son **míos, sin medir**. Son el punto de partida para el simulador, no valores cerrados.

---

## 0. Qué hay hoy (leído en `src/game.js`)

**Los 10 aliados actuales** (`ALLY_ROSTER`). Cada uno tiene una sola habilidad, que sale cada 3 turnos propios (`ALLY_SKILL_COOLDOWN`) y cuesta 20 de MP o de espíritu (`ALLY_SKILL_COST`, `ALLY_SKILL_POOL`):

| Aliado | Rol técnico | Posición | Habilidad |
|---|---|---|---|
| Aldric de la Muralla | guerrero | frente | Golpe Pesado: +60% de daño y un 12% de aturdir |
| Brann el Bastión | guerrero | frente | Muralla Viviente: −20% de daño recibido 3 turnos y se cura un 10%; atrae los golpes (1-60) |
| Neira la Certera | arquero | retaguardia | Disparo Certero: ignora el 40% de la resistencia |
| Lyra la Comandante | arquero | retaguardia | Mando de Retaguardia: +10% de daño a la retaguardia aliada 3 turnos |
| Vex el Desgarrador | asesino | retaguardia | Golpe Sombrío: más daño cuanto más herido esté el objetivo |
| Kael el Desangrador | asesino | retaguardia | Tajo Sangriento: Sangrado garantizado y un 30% de una segunda carga |
| Fennwick el Incendiario | mago | retaguardia | Bola de Fuego: daño de fuego +15% |
| Eira la Escarchada | mago | retaguardia | Aliento Glacial: hielo +15% y un 25% de Ralentizar |
| Hermana Delyth | sacerdote | retaguardia | Cura al jugador o a un aliado por debajo del 50%; si nadie lo necesita, Bendecido al enemigo del frente |
| Seraphina la Égida | sacerdote | retaguardia | Escudo del 20% y −10% de daño al más débil; Debilitado al enemigo del frente |

**Cómo actúan** (`resolveOneAllyTurn`): Miedo y Confusión pueden quitarles el turno. Después viene `allyMaybeSelfPreserve`: con poca vida beben poción de la mochila, se quitan los estados con un Antídoto o se repliegan a la retaguardia. Luego el sacerdote cura o bendice, y el resto ataca. Los de frente solo alcanzan al enemigo del frente. Los de retaguardia rematan al enemigo vivo con menos vida (`allyTargetEnemyIndex`). El reflejo (`reflectPct`) solo existe en enemigos.

**A quién pegan los enemigos** (`frontlineTarget`): en los pisos 1-60 reparten entre la fila del frente; Brann con Muralla y la Sombra Cazadora atraen los golpes. Del 61 en adelante pegan siempre al primer aliado de frente vivo. Las reglas de década que dependen de la posición solo afectan al jugador, porque los aliados no se mueven.

**Rama `kits-retaguardia`** (sin fusionar): `ALLY_BOOST = {to:80, hpMult:1.5, parity:true, rearAoe:0.5}`. En 1-80 los aliados tienen vida ×1,5, las mismas defensas que el jugador y reciben la mitad del área de jefes y guardianes si están en la retaguardia. Además, un enemigo Ralentizado pega un 30% menos. Los 50 aliados nuevos heredan esa regla. Las mediciones de esta propuesta deben hacerse **después** de fusionar esa rama.

**Desbloqueo** (`tavernUnlocked`, `allyCap`): la Taberna abre con nivel 10 y el Ogro vencido. Los cupos van de 1 a 4 según los jefes de década vencidos (regla aplicada a todas las cuentas desde la migración 0045). `hire_ally` cobra `baseCost + nivel × costPerLevel`. Despedir a un aliado no lo veta, pero vuelve a empezar en nivel 1. Cada aliado cobra un salario al salir del laberinto.

**Estados disponibles**: Aturdido, Tambaleo, Sangrado, Veneno, Quemadura, Marcado, Ralentizado, Bendecido, Debilitado, Mermado, Ruina, Quebranto, Paralisis, Armadura Rota, Corrosion, Ceguera, Miedo, Confusion, Silencio. Del lado propio: Inspirado, Furioso, Bastión, Égida y escudos.

**Límite técnico importante**: la tabla `character_allies` y la función `hire_ally` solo aceptan los roles `guerrero, arquero, asesino, mago, sacerdote` (migraciones 0009 y 0016). Para tener aliados Paladín, Hechicero y Apoyo hace falta **una migración [nuevo]**, y la escribiré como texto SQL para que la ejecute ariochbu.

---

## 1. Resumen y principios

Son 50 aliados nuevos, 5 por década. Cada uno viene de la capa del laberinto que corresponde a su década: un preso, un desertor, un guardián o alguien que se quedó atrapado allí. Con los 10 actuales serían 60. El grupo sigue siendo de 4 como máximo, así que lo interesante es elegir.

**Principios de diseño**

1. **Una idea por aliado.** Cada uno hace una sola cosa que ningún otro hace igual. Si dos aliados comparten estado (por ejemplo, el Ralentizado), lo usan de forma distinta: uno lo aplica, otro lo alarga, otro lo convierte en aturdimiento y otro lo pone en quien le pega.
2. **Toda mecánica es condicional.** Su fuerza depende de algo: que haya un estado puesto, que alguien esté herido, que haya varios enemigos, que el objetivo esté en la retaguardia o que el jefe tenga un refuerzo activo. Fuera de esa situación, el aliado rinde como uno normal de su rol.
3. **Mismas estadísticas base por rol.** La vida, el ataque y el MP o espíritu los da el rol técnico (`allyMaxHP`, `makeCombatAlly`), no el aliado. Lo que los distingue es el kit, no los números.
4. **Presupuesto de poder.** Cada kit cabe en un presupuesto equivalente a la habilidad de un aliado actual del mismo rol: «Aldric» para tanques, «Delyth» para sanadores, etc. Una mecánica muy fuerte lleva una pega visible: no ataca ese turno, cuesta vida, va lenta, solo funciona una vez por combate o solo con ciertos objetivos.
5. **Nada de inmunidades permanentes ni aturdimientos en cadena contra jefes.** Lo que aturde tiene cooldown propio por objetivo, y contra jefes rinde menos (ver sección 6).
6. **Tres palabras de rol para el jugador.** El panfleto de la Taberna dice papel (Tanque, Paladín, Sanador, Asesino, Arquero, Mago, Hechicero, Apoyo), posición y «Combina con» (la senda). Así cada jugador encuentra los suyos sin leer todo el kit.
7. **Se mide la utilidad, no solo la victoria.** El registro `allyStats` (daño, curación, escudo, control, apoyo, daño recibido y ronda en que cae) ya existe. Cada aliado nuevo debe quedar cerca del aliado actual de su rol (sección 6).

**Cómo se evita que uno sea «mejor en todo»**
- Ninguno combina daño alto con defensa alta o curación. Los que hacen dos cosas (los paladines) hacen ambas a medias.
- Los multiplicadores de daño de grupo no se suman sin límite. Inspirado no se acumula: solo se refresca. Un aliado nuevo que da daño de grupo usa un estado propio con tope (sección 3).
- Las sinergias fuertes necesitan dos o tres piezas, que ocupan cupos que se quitan a otros papeles. Un grupo de control con Tecla, Hakon e Ingrid no tiene sanador.
- Cada década trae un problema distinto (Telaraña, Manada, Espejismo, Decreto, Marea, Ley del Caos, Corrupción, Suelo ardiente, Condena). Varios aliados están pensados para resolver uno de esos problemas y rinden menos fuera de él. Así ningún grupo es el mejor en todas las décadas.

---

## 2. Tabla general de los 50

Columna «Combina con»: senda principal (entre paréntesis, la segunda). Columna «Década»: la capa de la que viene y desde la que aparece en la Taberna (sección 5).

| # | Nombre | Papel | Posición | Combina con | Mecánica propia | Década |
|---|---|---|---|---|---|---|
| 1 | Odo Zarzal, el Espinoso | Tanque | Frente | Guerrero (Paladín) | Devuelve parte del daño cuerpo a cuerpo que recibe | 1 (1-10) |
| 2 | Aya Ruda, la Herbolaria | Sanador | Retaguardia | Guerrero (todas) | Limpia estados negativos antes de curar | 1 |
| 3 | Pizca Tres-Frascos | Apoyo | Retaguardia | Hechicero (Asesino) | Ácido que deja Corrosión al enemigo y corta sus curas | 1 |
| 4 | Tilo el Furtivo | Asesino | Retaguardia | Guerrero (Paladín) | Ataque extra gratis contra enemigos Aturdidos o con Tambaleo | 1 |
| 5 | Ser Anselmo del Roble | Paladín | Frente | Guerrero (Paladín) | Consagra el suelo: regeneración para toda la fila del frente | 1 |
| 6 | Gaspar Piel-de-Sapo | Tanque | Frente | Guerrero (Hechicero) | Se queda con los estados negativos que iban para otros | 2 (11-20) |
| 7 | Tecla la Hilandera | Apoyo | Retaguardia | Mago (Arquero) | Alarga todos los Ralentizados del combate | 2 |
| 8 | Iska Ponzoña | Hechicero | Retaguardia | Hechicero (Asesino) | Veneno que se contagia de un enemigo al de al lado | 2 |
| 9 | Calla Quemanidos | Arquero | Retaguardia | Mago (Hechicero) | Embrea al objetivo: el próximo fuego pega más y quema más | 2 |
| 10 | Nim la Sigilosa | Asesino | Retaguardia | Paladín (Guerrero) | Caza a la retaguardia enemiga y silencia al que va a lanzar | 2 |
| 11 | Torvald Rompehuesos | Tanque | Frente | Asesino (Guerrero) | Cada golpe suyo deja Armadura Rota | 3 (21-30) |
| 12 | Brígida de los Pastos | Sanador | Retaguardia | Arquero (Paladín) | La curación que sobra se convierte en escudo | 3 |
| 13 | Rasca, Hijo de la Manada | Asesino | Retaguardia | Asesino (Hechicero) | Consume el Sangrado del objetivo en un solo desgarro | 3 |
| 14 | Yara la Rastreadora | Arquero | Retaguardia | Arquero (Guerrero) | Flecha que atraviesa al primero y golpea al de detrás | 3 |
| 15 | Fausto el Risueño | Hechicero | Retaguardia | Arquero (Mago) | Confunde a varios enemigos a la vez | 3 |
| 16 | Ser Lucan el Juramentado | Paladín | Frente | Asesino (Mago) | Recibe por ti parte del daño que te hacen | 4 (31-40) |
| 17 | Candela la Veladora | Sanador | Retaguardia | Mago (Arquero) | Cada enemigo que cae cura a todo el grupo | 4 |
| 18 | Ilario el Doble | Asesino | Retaguardia | Hechicero (Mago) | Crea un doble suyo que atrae los golpes | 4 |
| 19 | Narciso de los Espejos | Mago | Retaguardia | Hechicero (Mago) | Copia en otro enemigo el último estado que aplicaste | 4 |
| 20 | Ofelia la Marchita | Hechicero | Retaguardia | Asesino (Hechicero) | Los daños por turno pegan más sobre su objetivo | 4 |
| 21 | Malaquías Ancla | Tanque | Frente | Mago (Hechicero) | Desafío: todos los enemigos le pegan a él, en cualquier piso | 5 (41-50) |
| 22 | Ser Elvira la Sentenciadora | Paladín | Frente | Arquero (Asesino) | Aturde sin falta a los enemigos Marcados | 5 |
| 23 | Marisol del Manantial | Sanador | Retaguardia | Hechicero (Mago) | Devuelve MP y espíritu en vez de vida | 5 |
| 24 | Jacobo Florete, el Corsario | Asesino | Frente | Asesino (Guerrero) | Duelista: esquiva mucho y contraataca al esquivar | 5 |
| 25 | Brisa Ojo-de-Gaviota | Arquero | Retaguardia | Asesino (Guerrero) | Marca al enemigo más peligroso para todo el grupo | 5 |
| 26 | Hakon Rompeolas | Tanque | Frente | Arquero (Mago) | Quien le pega queda Ralentizado | 6 (51-60) |
| 27 | Ser Amparo Guardamareas | Paladín | Frente | Paladín (Mago) | Aura de resistencia elemental para todo el grupo | 6 |
| 28 | Ingrid Mar-Helado | Mago | Retaguardia | Arquero (Mago) | Congela: un enemigo Ralentizado queda Aturdido | 6 |
| 29 | Amaro Sal-de-Trueno | Mago | Retaguardia | Paladín (Guerrero) | Tormenta que golpea a todos los enemigos | 6 |
| 30 | Tomasa la Abanderada | Apoyo | Frente | Guerrero (Paladín) | Estandarte: más daño para todo el grupo, jugador incluido, mientras siga en pie | 6 |
| 31 | Ser Baldomero el Inamovible | Paladín | Frente | Mago (Arquero) | Cuando alguien cae por debajo del 40%, cubre a todo el grupo | 7 (61-70) |
| 32 | Mara Venas-Abiertas | Sanador | Retaguardia | Asesino (Guerrero) | Cura con su propia vida, sin espíritu | 7 |
| 33 | Ívori la Tuerta | Arquero | Retaguardia | Hechicero (Paladín) | Ciega al enemigo que más daño hizo | 7 |
| 34 | Zenón el que Midió la Grieta | Mago | Retaguardia | Arquero (Asesino) | Golpea siempre con el elemento que menos resiste el objetivo | 7 |
| 35 | Zaida Hilo-Rojo | Hechicero | Retaguardia | Mago (Asesino) | Ata a dos enemigos: parte del daño de uno lo sufre el otro | 7 |
| 36 | Ser Verena del Último Árbol | Paladín | Frente | Paladín (Guerrero) | Sella a un compañero: anula el próximo estado negativo (y frena la Corrupción) | 8 (71-80) |
| 37 | Abuelo Raigón | Sanador | Retaguardia | Paladín (Guerrero) | Curación lenta que se acumula con el tiempo | 8 |
| 38 | Isaura Savia-Negra | Mago | Retaguardia | Guerrero (Paladín) | Su daño mágico cura al grupo | 8 |
| 39 | Fray Osmundo el Arrepentido | Hechicero | Retaguardia | Hechicero (Mago) | Levanta a un enemigo caído para que pelee de tu lado | 8 |
| 40 | Brunilda Mano-Seca | Hechicero | Retaguardia | Paladín (Guerrero) | Merma fuerte al enemigo que más pega | 8 |
| 41 | Uzbal, el Guardián que Desertó | Tanque | Frente | Hechicero (Arquero) | Se interpone ante el golpe que dejaría casi muerto a un compañero | 9 (81-90) |
| 42 | Ser Ignacia de la Llama Blanca | Paladín | Frente | Hechicero (Asesino) | Más daño por cada estado negativo del objetivo | 9 |
| 43 | Gertrud Cerrojo | Arquero | Retaguardia | Paladín (Guerrero) | Virote que atraviesa reducciones de daño y escudos del enemigo | 9 |
| 44 | Cendra la Fogonera | Mago | Retaguardia | Mago (Arquero) | Deja el suelo ardiendo bajo el frente enemigo | 9 |
| 45 | Lis Saeta-Negra | Arquero | Retaguardia | Guerrero (Paladín) | Lluvia que solo cae en la retaguardia enemiga | 9 |
| 46 | Cadmo el Encadenado | Tanque | Frente | Paladín (Guerrero) | Cuanto menos vida le queda, menos daño recibe | 10 (91-100) |
| 47 | Sor Inés de los Retornos | Sanador | Retaguardia | Arquero (Mago) | Una vez por combate, devuelve a un caído | 10 |
| 48 | Absalón el Verdugo | Asesino | Retaguardia | Mago (Arquero) | Ejecuta a los enemigos con poca vida | 10 |
| 49 | Severina la Rompesellos | Hechicero | Retaguardia | Guerrero (Paladín) | Quita al enemigo sus refuerzos activos | 10 |
| 50 | Aurelio el que Vuelve | Apoyo | Retaguardia | Asesino (Arquero) | Prisa: un compañero actúa dos veces | 10 |

---

## 3. Fichas

Reglas comunes a todos, salvo que la ficha diga otra cosa:
- **Habilidad activa**: cada 3 turnos propios, 20 de MP (tanques, asesinos, arqueros, magos, hechiceros y apoyos) o de espíritu (sanadores y paladines). No se usa el primer turno. Si no tiene recurso, ataca normal.
- **Rasgo**: una pasiva siempre encendida.
- **Reacción** (solo algunos): se dispara sola cuando pasa algo concreto.
- Los textos entre comillas son los que vería el jugador en el panfleto y en la ficha.
- Se dice «el grupo» por el jugador más sus aliados.

Cambios comunes a todos los aliados nuevos **[nuevo]**:
- **Tabla de kits** (`ALLY_KITS[templateId]` con `active`, `trait` y `react`) en lugar de seguir sumando `if(ally.templateId===...)` a `resolveOneAllyTurn`. Es un cambio estructural: los 10 actuales pasan a la tabla sin cambiar su comportamiento, y la foto `__snapshot` lo comprueba.
- **Roles técnicos `paladin`, `hechicero` y `apoyo`**: `ALLY_SKILL_POOL`, `ALLY_ROLE_TO_WEAPON_STYLE`, la vida por nivel, la migración de roles y la IA. Paladín: frente, espíritu, equipo de Paladín. Hechicero: retaguardia, MP, equipo de Hechicero. Apoyo: MP y equipo por definir (pregunta abierta 3).

### Década 1: Bosque Goblin

**1. Odo Zarzal, el Espinoso**. Leñador al que los goblins mordían tanto que dejó crecer zarzas en su armadura. Desde entonces ya no le muerden.
- Papel: Tanque, frente. Combina con: Guerrero (Paladín).
- Rasgo, *Coraza de zarza*: «Devuelve el 20% del daño cuerpo a cuerpo que recibe al enemigo que lo golpeó».
- Activa, *Erizarse*: «Durante 2 turnos devuelve el 40% en vez del 20%, y recibe un 10% menos de daño». No ataca ese turno.
- Mecánica propia: es el único que castiga a quien le pega. Rinde más cuanto más le peguen, y nada contra las áreas a distancia.
- Combina con Malaquías (atrae todos los golpes hacia él) y con Ser Anselmo (regeneración en el frente).
- [nuevo] Reflejo en aliados: `reflectPct` hoy solo se lee en enemigos. Habría que añadirlo en `dealDamageToAlly` solo para golpes cuerpo a cuerpo.

**2. Aya Ruda, la Herbolaria**. Cultivaba ruda en el linde del bosque para los heridos de las patrullas. Dice que la mitad de los males se van solos y que la otra mitad se van con su ruda.
- Papel: Sanador, retaguardia. Combina con: Guerrero (todas).
- Activa, cada turno con espíritu, como Delyth: *Infusión de ruda*: «Si alguien tiene un estado negativo, se lo quita (primero Aturdido, Miedo, Confusión y Parálisis; luego Veneno, Sangrado y Quemadura). Si nadie lo tiene, cura un 12% al más herido por debajo del 50%».
- Rasgo, *Mano de herbolaria*: «Quien acaba de limpiar resiste un 25% más los estados durante 2 turnos».
- Mecánica propia: la limpieza va antes que la curación. Cura menos que Delyth (12% contra 15%) y no hace nada al enemigo.
- Combina con tanques que comen estados (Gaspar) y es clave en la década 2 (Telaraña) y la 7 (Corrupción: ver la pregunta 7).
- [nuevo] Limpiar un solo estado elegido (hoy el Antídoto los quita todos) y un bono temporal a `statusResist`.

**3. Pizca Tres-Frascos**. Goblin desertora. Robó los frascos del chamán de su tribu y se fue a beber a la Taberna, donde nadie le pregunta de dónde viene.
- Papel: Apoyo, retaguardia. Combina con: Hechicero (Asesino).
- Activa, *Frasco de ácido*: «Lanza ácido a un enemigo: queda con Corrosión 3 turnos (−15 de resistencia física y la mitad de cualquier curación)».
- Activa alterna, si el grupo recibió mucho daño el turno anterior, *Frasco de humo*: «El grupo gana +15% de evasión 2 turnos».
- Mecánica propia: es la única que corta las curas del enemigo. Sirve contra enemigos que se curan, contra el decreto Vigilia de la década 5 y contra los jefes con regeneración.
- Combina con Torvald (Corrosión y Armadura Rota se suman en resistencia física) y con Iska (más turnos de veneno sin que se curen).
- [nuevo] Corrosión hoy solo la sufre el jugador: habría que leerla en `effectiveEnemyRes` y en las curaciones del enemigo. Además, una IA que elija entre dos activas.

**4. Tilo el Furtivo**. Cazador furtivo del bosque. Aprendió a no gastar flechas en una presa que todavía corre.
- Papel: Asesino, retaguardia. Combina con: Guerrero (Paladín).
- Rasgo, *Presa quieta*: «Cuando un enemigo queda Aturdido o con Tambaleo, Tilo le hace al momento un ataque extra con +30% de daño (una vez por enemigo y ronda)».
- Activa, *Tajo al tendón*: «Golpe con +40% de daño; si el objetivo ya estaba Aturdido, le deja Tambaleo».
- Mecánica propia: reacciona al aturdimiento que ponen otros. Solo no hace nada especial; con un Guerrero (Golpe bruto deja Tambaleo, Machacar aturde) o con Aldric se dispara a menudo.
- Combina con Aldric, Ser Elvira e Ingrid (aturden).
- [nuevo] Un enganche para reaccionar cuando se aplica Aturdido o Tambaleo (`applyStatus` sobre un enemigo).

**5. Ser Anselmo del Roble**. El último caballero que juró proteger el camino del bosque. Lleva cuarenta años de guardia y nadie le ha dicho que la orden se disolvió.
- Papel: Paladín, frente. Combina con: Guerrero (Paladín).
- Activa, *Tierra consagrada*: «Consagra el suelo del frente: todos los que estén en el Frente (tú incluido) recuperan un 4% de su vida máxima cada ronda durante 3 rondas». Ataca ese mismo turno con daño normal.
- Rasgo, *Raíz*: «Recibe un 10% menos de daño mientras haya alguien más en el Frente».
- Mecánica propia: es la única curación que depende de la posición. Premia los grupos con dos o tres en el frente. Con el jugador en la retaguardia rinde la mitad.
- Combina con Odo, Brann y Tomasa, y con la senda del Guerrero o del Paladín jugando al frente.
- Usa `regenPct` en un estado. [nuevo] Que un estado se aplique a una fila entera e incluya al jugador.

### Década 2: Nido de Arañas

**6. Gaspar Piel-de-Sapo**. Se perdió una semana en el nido y sobrevivió comiendo lo que encontró. Ya no le afecta casi nada, y tampoco le apetece casi nada.
- Papel: Tanque, frente. Combina con: Guerrero (Hechicero).
- Reacción, *Piel de sapo*: «Cuando un estado negativo cae sobre ti o sobre otro aliado, hay un 40% de que lo reciba Gaspar en su lugar». Él tiene +30% de resistencia a estados.
- Activa, *Sudor amargo*: «Se quita todos sus estados negativos y gana un 15% menos de daño recibido durante 2 turnos». No ataca ese turno.
- Mecánica propia: es la esponja de estados. No reduce el daño de nadie más.
- Combina con Aya (limpia lo que Gaspar se queda) y con sendas frágiles ante el control (Mago, Hechicero).
- [nuevo] Redirigir un estado en `applyStatus` cuando el objetivo es el grupo del jugador.

**7. Tecla la Hilandera**. Tejía velas para barcos hasta que el nido la retuvo años tejiendo para las arañas. Ahora teje para quien le pague, pero solo hilo que ate.
- Papel: Apoyo, retaguardia. Combina con: Mago (Arquero).
- Rasgo, *Hilo que no se rompe*: «Todo Ralentizado que caiga sobre un enemigo, lo ponga quien lo ponga, dura 1 turno más».
- Activa, *Madeja*: «Enreda al enemigo que más daño hizo: Ralentizado 3 turnos. Si ya estaba Ralentizado, se le suma −10% de evasión».
- Mecánica propia: es el apoyo que alarga el Ralentizado, como pidió ariochbu. Hace poco daño, pero con la regla de `kits-retaguardia` (un enemigo Ralentizado pega un 30% menos) cada turno extra de Ralentizado es defensa para todos.
- Combina con Eira, Ingrid (congela lo Ralentizado), Hakon y la Lluvia de flechas del Arquero.
- [nuevo] Un modificador global de duración para un estado concreto, que se lee en `applyStatus`.

**8. Iska Ponzoña**. Ordeñaba arañas para un boticario. Un día dejó de ordeñarlas y empezó a escucharlas.
- Papel: Hechicero, retaguardia. Combina con: Hechicero (Asesino).
- Activa, *Mordida de viuda*: «Envenena al objetivo (Veneno, se acumula hasta x3)».
- Rasgo, *Plaga*: «Al final de cada ronda, cada enemigo con 2 o más cargas de Veneno contagia 1 carga a otro enemigo al azar que no tenga veneno».
- Mecánica propia: el veneno se contagia mientras el portador vive. Rinde mucho contra grupos y muy poco contra un jefe solo.
- Combina con el Toque venenoso del Hechicero (llega a x5 y contagia más), con Ofelia y con Pizca.
- [nuevo] Un paso de contagio al cerrar la ronda. Ojo: el daño del Veneno escala con la Habilidad del jugador (`tickStatuses`), no con la del aliado, igual que hoy el Sangrado de Kael.

**9. Calla Quemanidos**. La contrató el pueblo para quemar el nido desde fuera. Entró a buscar un nido más grande.
- Papel: Arquero, retaguardia. Combina con: Mago (Hechicero).
- Activa, *Flecha de brea*: «Deja al objetivo Embreado 3 turnos: el próximo golpe de fuego que reciba hace +50% de daño y le deja 2 cargas de Quemadura».
- Rasgo, *Mecha corta*: «Sus ataques normales contra un enemigo con Quemadura hacen +15% de daño».
- Mecánica propia: prepara el fuego para otros. Sin nadie de fuego en el grupo, es una arquera normal.
- Combina con Fennwick, Cendra y la Bola de fuego y la Explosión arcana del Mago.
- [nuevo] El estado Embreado y que se consuma con el primer golpe de fuego (del jugador o de un aliado).

**10. Nim la Sigilosa**. Se especializó en lo que nadie más quería: entrar al fondo del nido, donde están las madres.
- Papel: Asesino, retaguardia. Combina con: Paladín (Guerrero).
- Rasgo, *Al fondo*: «Ataca siempre a la retaguardia enemiga si queda alguien allí, aunque haya frente vivo».
- Activa, *Aguijón*: «Golpe con +30% de daño que deja Silencio al objetivo (su próximo turno solo puede atacar normal)». Elige primero a un enemigo con una habilidad lista.
- Mecánica propia: es la única que elige objetivo por posición y por amenaza, no por vida restante. Corta las habilidades fuertes de lanzadores y sanadores enemigos.
- Combina con sendas de frente que no llegan atrás (Guerrero, Paladín) y con Lis (también apunta atrás).
- [nuevo] Saber si una habilidad enemiga está lista (enfriamiento) desde la IA del aliado.

### Década 3: Tierra de Bestias

**11. Torvald Rompehuesos**. Luchaba con osos en una feria. Cuando cerraron la feria, siguió buscando osos.
- Papel: Tanque, frente. Combina con: Asesino (Guerrero).
- Rasgo, *Mazo de hueso*: «Cada golpe suyo deja Armadura Rota 2 turnos (−15 de resistencia física)».
- Activa, *Quebrar*: «Golpe con +40% de daño que alarga 2 turnos la Armadura Rota y Debilita al objetivo».
- Mecánica propia: es el tanque que prepara el daño físico de los demás. Defiende menos que Brann (no tiene reducción propia).
- Combina con Kael, Vex, Rasca y las sendas físicas (Asesino, Guerrero, Arquero).
- Armadura Rota existe (`corrosionResPenalty`), pero solo del lado del jugador. [nuevo] Leerla en `effectiveEnemyRes`.

**12. Brígida de los Pastos**. Pastora. Cuando las bestias entraron en el valle, aprendió a coser heridas de animales y después de personas. No ve gran diferencia.
- Papel: Sanador, retaguardia. Combina con: Arquero (Paladín).
- Activa, cada turno con espíritu: *Cuidado de pastora*: «Cura un 15% al más herido por debajo del 60%. La parte que sobra (si lo cura por encima de su vida máxima) se convierte en escudo».
- Rasgo, *Rebaño*: «Si nadie está por debajo del 60%, da un escudo del 8% a quien tenga menos vida».
- Mecánica propia: no desperdicia nada. Es buena con grupos que reciben golpes pequeños y seguidos, y floja contra golpes enormes.
- Combina con Seraphina (escudos), con Ser Lucan y con sendas de retaguardia que reciben áreas.
- [nuevo] Convertir el exceso de curación en escudo (`grantShield` ya existe).

**13. Rasca, Hijo de la Manada**. Lo criaron lobos y le enseñaron a no soltar nunca la presa. Habla poco y muerde mucho.
- Papel: Asesino, retaguardia. Combina con: Asesino (Hechicero).
- Activa, *Desgarro*: «Consume todas las cargas de Sangrado del objetivo y le hace de golpe el daño que le faltaba por sangrar, +25%».
- Rasgo, *Olor a sangre*: «Sus ataques normales contra un objetivo que sangra hacen +15% de daño».
- Mecánica propia: convierte el Sangrado en daño inmediato. Va bien contra enemigos que morirían antes de desangrarse, y es inútil si nadie pone Sangrado.
- Combina con Kael, con la senda del Asesino (Corte rápido llega a x4) y con Ofelia (pero no a la vez: Ofelia quiere que el Sangrado dure y Rasca lo consume).
- [nuevo] Calcular el daño restante de un estado por turnos y cargas, y quitarlo.

**14. Yara la Rastreadora**. Siguió el rastro de una manada durante tres años. Al final la encontró, pero no la manada que buscaba.
- Papel: Arquero, retaguardia. Combina con: Arquero (Guerrero).
- Activa, *Flecha pasante*: «Atraviesa al primer enemigo del frente (daño normal) y golpea al que está detrás con el 60% del daño».
- Rasgo, *Rastro*: «Si un enemigo está Marcado, la flecha pasante lo prioriza y le hace +15%».
- Mecánica propia: daño en línea, frente y fondo a la vez. Es distinta de Lis (solo fondo) y de Amaro (todos).
- Combina con la Marca del cazador del Arquero, con Brisa y con sendas de frente.
- [nuevo] Un golpe a dos objetivos en línea (la Lanza de hielo en línea de `kits-retaguardia` ya tiene la lógica).

**15. Fausto el Risueño**. Sirvió a Riakis. Dice que también oyó la grieta, pero que a él solo le contó chistes.
- Papel: Hechicero, retaguardia. Combina con: Arquero (Mago).
- Activa, *Carcajada*: «Hasta 3 enemigos quedan con Confusión 2 turnos (probabilidad de golpear a un compañero suyo)». Los jefes tienen la mitad de probabilidad de quedar confundidos.
- Rasgo, *Chiste malo*: «Los enemigos confundidos por él reciben +10% de daño de sus propios compañeros».
- Mecánica propia: control en grupo que convierte al enemigo en daño contra sí mismo. Inútil contra un jefe solo.
- Combina con sendas que golpean a muchos (Arquero con Lluvia, Mago) y con la década 3 (Manada: si se matan entre ellos, la furia de la manada sigue subiendo, así que hay que pensarlo).
- Confusión sobre enemigos ya existe. [nuevo] Varios objetivos y la regla de los jefes.

### Década 4: Salón del Usurpador

**16. Ser Lucan el Juramentado**. Escudero del Usurpador cuando aún tenía nombre. Juró protegerlo y llegó tarde. Ahora se lo jura a cualquiera que baje.
- Papel: Paladín, frente. Combina con: Asesino (Mago).
- Rasgo, *Juramento*: «El 20% del daño que recibes tú lo recibe Ser Lucan en tu lugar (mientras tenga más del 30% de vida)».
- Activa, *Renovar el juramento*: «Te da un escudo del 15% de tu vida máxima y sube su parte al 35% durante 2 turnos». Ataca ese turno con daño normal.
- Mecánica propia: protege solo al jugador, y lo hace siempre, esté donde esté. No protege a los demás aliados.
- Combina con sendas frágiles (Asesino, Mago, Hechicero) y con Brígida o Abuelo Raigón, que lo mantienen arriba.
- [nuevo] Desviar parte del daño en `dealDamageToPlayer`.

**17. Candela la Veladora**. Encendía las velas del salón para fiestas que no terminaban nunca. Sigue encendiendo una por cada muerto.
- Papel: Sanador, retaguardia. Combina con: Mago (Arquero).
- Rasgo, *Una vela por cada uno*: «Cada vez que muere un enemigo, todo el grupo recupera el 6% de su vida máxima».
- Activa, cada turno con espíritu: *Luz de vela*: «Cura un 10% al más herido por debajo del 50%».
- Mecánica propia: su curación depende de matar. Es enorme en combates de muchos enemigos y escasa contra un jefe solo.
- Combina con Amaro, Lis, Absalón y la Lluvia de flechas. Los espejismos de la década 4 no cuentan (no son enemigos reales).
- [nuevo] Un enganche cuando muere un enemigo (existe algo parecido para la Manada).

**18. Ilario el Doble**. Hizo de doble del Usurpador durante años. Cuando todos eran copias, él era la mejor.
- Papel: Asesino, retaguardia. Combina con: Hechicero (Mago).
- Activa, *Doble*: «Crea un doble suyo en el Frente con el 25% de su vida máxima. El doble atrae los golpes cuerpo a cuerpo y desaparece al recibir uno (o a los 3 turnos)».
- Rasgo, *El original*: «Mientras su doble esté vivo, Ilario hace +25% de daño».
- Mecánica propia: es un escudo de un solo golpe que se renueva cada 3 turnos. Contra golpes enormes salva una vida entera; contra áreas no sirve.
- Combina con la década 4 (por fin le pagas al Usurpador con su moneda) y con sendas de retaguardia sin tanque.
- La Sombra Cazadora (`ssSpawnShadow`, `isShadow`) ya hace casi esto. [nuevo] Un doble de un golpe y con duración.

**19. Narciso de los Espejos**. Pulía los espejos del salón. Un día su reflejo dejó de imitarlo, y Narciso empezó a imitar a los demás.
- Papel: Mago, retaguardia. Combina con: Hechicero (Mago).
- Activa, *Reflejo*: «Copia el último estado negativo que tú hayas aplicado a un enemigo y se lo pone a otro enemigo distinto, con la misma duración». Si no hay ninguno que copiar, lanza un golpe mágico +15%.
- Rasgo, *Espejo roto*: «Si copia un estado que se acumula, le añade 1 carga más».
- Mecánica propia: amplifica las habilidades del jugador, no las de los aliados. Cambia de valor según la senda: con Hechicero (Miedo, Veneno, Quebranto) es enorme; con Guerrero copia Tambaleo.
- Combina con Hechicero y Mago, y con Ofelia.
- [nuevo] Guardar el último estado que aplicó el jugador.

**20. Ofelia la Marchita**. Dama de la corte. Se secó esperando a un rey que nunca bajó a verla, y ahora seca lo que toca.
- Papel: Hechicero, retaguardia. Combina con: Asesino (Hechicero).
- Activa, *Marchitar*: «Su objetivo queda Marchito 3 turnos: el Sangrado, el Veneno y la Quemadura le hacen +40% de daño».
- Rasgo, *Lenta*: «Los estados de daño por turno sobre un enemigo Marchito pierden la duración más despacio (1 de cada 2 rondas)».
- Mecánica propia: multiplica los daños por turno, no los aplica. Sin nadie que aplique daño por turno, no hace nada.
- Combina con Kael, Iska, Calla, Cendra y las sendas Asesino y Hechicero. Choca con Rasca.
- [nuevo] El estado Marchito y su lectura en `tickStatuses` y `decrementStatuses` (existe algo parecido: `venenoLento`).

### Década 5: Isla Paraíso

**21. Malaquías Ancla**. Contramaestre de un barco que encalló en la arena pintada. Se ató el ancla a la espalda «por si acaso». Nadie le ha explicado que no hay agua.
- Papel: Tanque, frente. Combina con: Mago (Hechicero).
- Activa, *¡A mí!*: «Desafía a todos los enemigos: durante 2 rondas le atacan a él y no a ti ni a la retaguardia, en cualquier piso. Recibe un 15% menos de daño mientras dure». No ataca ese turno.
- Rasgo, *Lastre*: «No puede quedar Aturdido».
- Mecánica propia: es la única provocación de verdad. Funciona también del 61 en adelante, donde Brann no atrae nada. Las áreas siguen alcanzando a todos.
- Combina con sendas de retaguardia frágiles, con Odo (le devuelve los golpes) y con Abuelo Raigón.
- [nuevo] Una provocación para todo `frontlineTarget` (hoy solo cuenta en 1-60).

**22. Ser Elvira la Sentenciadora**. Ejecutaba los decretos de la isla al pie de la letra. Cuando entendió quién los escribía, empezó a ejecutarlos al revés.
- Papel: Paladín, frente. Combina con: Arquero (Asesino).
- Activa, *Sentencia*: «Golpe con +30% de daño. Si el objetivo está Marcado, queda Aturdido sin falta (una vez cada 4 rondas por enemigo; contra jefes, Tambaleo en vez de Aturdido)».
- Rasgo, *Juicio justo*: «Recibe un 15% menos de daño de los enemigos Marcados».
- Mecánica propia: convierte el Marcado en control. Solo funciona si alguien marca.
- Combina con la Marca del cazador del Arquero, con Brisa y con Tilo (reacciona al aturdimiento).
- [nuevo] Enfriamiento de aturdimiento por enemigo.

**23. Marisol del Manantial**. Cuidaba el único manantial de agua dulce de la isla. Dice que el agua sabe distinta desde que se rompió el cielo.
- Papel: Sanador, retaguardia. Combina con: Hechicero (Mago).
- Activa, cada turno con espíritu: *Agua del manantial*: «Si tienes menos del 50% de MP, te devuelve un 12% de tu MP. Si no, devuelve 10 de MP o de espíritu al aliado al que le falte más».
- Rasgo, *Fuente*: «Cuando alguien baja del 30% de vida, lo cura un 10% (una vez por persona y combate)».
- Mecánica propia: es la única que da recursos y no vida. Contra el decreto de Doble coste o Triple coste de la década 5 vale oro.
- Combina con sendas de MP caro (Mago, Hechicero), con aliados que dependen de la activa (Malaquías, Tomasa) y con Aurelio.
- [nuevo] Devolver MP al jugador desde un aliado.

**24. Jacobo Florete, el Corsario**. Duelista de cubierta. Perdió el barco, pero no el florete ni la sonrisa.
- Papel: Asesino, **frente**. Combina con: Asesino (Guerrero).
- Rasgo, *Guardia de florete*: «+25% de evasión. Cada vez que esquiva un golpe cuerpo a cuerpo, contraataca con el 70% de su daño».
- Activa, *Estocada*: «Golpe con +50% de daño. Si esquivó algún golpe desde su último turno, es crítico seguro».
- Mecánica propia: es el único tanque por evasión. Va genial contra muchos golpes pequeños y muere ante los golpes que no se esquivan (áreas, jefes con precisión).
- Combina con Ilario y con Ser Verena. Es delicado con los jefes del 60 en adelante.
- [nuevo] Que un aliado tenga evasión propia (hoy los aliados no esquivan) y el contraataque.

**25. Brisa Ojo-de-Gaviota**. Vigía en la cofa de un barco. Ve primero quién va a dar problemas.
- Papel: Arquero, retaguardia. Combina con: Asesino (Guerrero).
- Activa, *Señalar*: «Marca al enemigo con más ataque: Marcado 3 turnos (recibe +20% de todo el daño)».
- Rasgo, *Desde la cofa*: «+15% de daño contra enemigos Marcados».
- Mecánica propia: es la única aliada que marca, y elige por amenaza. Da daño a todo el grupo y no solo a sí misma.
- Combina con Ser Elvira, Yara, sendas físicas y la Marca del cazador (que se aplica sola al objetivo ya marcado).
- Marcado ya existe y se lee en los golpes de los aliados. Elegir por ataque no es nuevo en la IA, pero sí en la de los aliados.

### Década 6: El Mar

**26. Hakon Rompeolas**. Pescador de altura. Lleva una coraza cubierta de sal helada que no se derrite nunca.
- Papel: Tanque, frente. Combina con: Arquero (Mago).
- Rasgo, *Coraza de sal fría*: «Quien le golpea cuerpo a cuerpo tiene un 35% de quedar Ralentizado 2 turnos».
- Activa, *Rompeolas*: «Recibe un 15% menos de daño 2 turnos y Ralentiza al enemigo del frente». Ataca ese turno.
- Mecánica propia: pone el Ralentizado en quien le pega, no en quien él elige. Es defensivo con la regla de `kits-retaguardia`.
- Combina con Tecla (alarga), Ingrid (congela) y el Arquero.
- [nuevo] Una reacción al recibir un golpe cuerpo a cuerpo (la misma que Odo).

**27. Ser Amparo Guardamareas**. Juró defender el puerto de la tormenta. La tormenta no llegó al puerto: se la llevó a ella.
- Papel: Paladín, frente. Combina con: Paladín (Mago).
- Rasgo, *Aura de la bahía*: «Todo el grupo tiene +12 de resistencia a fuego, hielo y veneno mientras ella siga en pie».
- Activa, *Marea alta*: «Durante 2 turnos el aura sube a +25 y ella recibe un 10% menos de daño». Ataca ese turno.
- Mecánica propia: es la defensa contra golpes elementales y áreas mágicas (Storm Gush, Tetrasea, el Abismo). No sirve contra golpes físicos.
- Combina con el Paladín (aguantan juntos), con Candela, con Sor Inés y con la década 6 y la 9.
- [nuevo] Un aura `resBonus` para todo el grupo (el estado ya existe, la aplicación en grupo no).

**28. Ingrid Mar-Helado**. Se quedó atrapada en el hielo de un barco congelado y salió en primavera, sin prisa.
- Papel: Mago, retaguardia. Combina con: Arquero (Mago).
- Activa, *Congelar*: «Magia de hielo +15%. Si el objetivo estaba Ralentizado, queda Aturdido 1 turno y pierde el Ralentizado (contra jefes: Tambaleo, y una vez cada 4 rondas)».
- Rasgo, *Agua quieta*: «+20% de daño de hielo contra enemigos Ralentizados».
- Mecánica propia: convierte el Ralentizado en aturdimiento, a cambio de gastarlo.
- Combina con Tecla, Hakon, Eira, la Lluvia de flechas del Arquero y la Lanza de hielo del Mago.
- [nuevo] Consumir un estado y la regla de los jefes (la misma que Elvira).

**29. Amaro Sal-de-Trueno**. Fue sacerdote de Storm Gush. Cuando cayó el dios, se quedó con la mitad de su tormenta.
- Papel: Mago, retaguardia. Combina con: Paladín (Guerrero).
- Activa, *Tormenta*: «Golpea a todos los enemigos con magia de hielo al 45% de su daño».
- Rasgo, *Empapado*: «Los enemigos golpeados por su tormenta quedan Empapados 2 turnos (−10% de evasión)».
- Mecánica propia: es la única área de los aliados. Hace poco daño individual y mucho contra grupos.
- Combina con Candela y Absalón (rematan lo que deja bajo) y con sendas de frente que solo pegan a uno.
- Empapado ya existe. [nuevo] Una activa en área para un aliado.

**30. Tomasa la Abanderada**. Llevaba el estandarte de una flota que se hundió entera. Ella sigue en pie, y el estandarte también.
- Papel: Apoyo, **frente**. Combina con: Guerrero (Paladín).
- Rasgo, *Estandarte*: «Mientras siga en pie, todo el grupo (tú incluido) hace un 6% más de daño».
- Activa, *¡Adelante!*: «Durante 2 turnos el estandarte sube al 12% y quien esté en el Frente recibe un 5% menos de daño». No ataca ese turno.
- Reacción, *El estandarte no cae*: «Al caer Tomasa, el grupo queda con +10% de daño 2 turnos».
- Mecánica propia: es el único aumento de daño que incluye al jugador (Lyra solo sube a la retaguardia aliada) y depende de mantenerla viva en el frente.
- Combina con grupos de frente (Anselmo, Odo) y con cualquier senda.
- [nuevo] Un estado propio, `Estandarte`, que no se suma con Inspirado (para no apilar daño de grupo).

### Década 7: La Grieta

**31. Ser Baldomero el Inamovible**. Lo pusieron a vigilar el borde de la Grieta. La Grieta se movió y él no.
- Papel: Paladín, frente. Combina con: Mago (Arquero).
- Reacción, *Inamovible*: «La primera vez en cada ronda que alguien del grupo baja del 40% de vida, todo el grupo recibe un 15% menos de daño hasta su próximo turno (enfriamiento: 3 rondas)».
- Activa, *Firmeza*: «Escudo del 12% para él y para quien tenga menos vida».
- Mecánica propia: es una defensa reactiva de grupo, para los golpes de pánico. Hace poco daño.
- Combina con sendas frágiles, con Sor Inés y con La Grieta (Ley del Caos: los enemigos con «pega más»).
- [nuevo] Una reacción a «alguien baja de un umbral».

**32. Mara Venas-Abiertas**. Curandera de una secta que se desangraba para sellar la Grieta. La secta se acabó. A ella le sobró sangre.
- Papel: Sanador, retaguardia. Combina con: Asesino (Guerrero).
- Activa, cada turno, sin espíritu: *Transfusión*: «Pierde el 8% de su vida máxima y cura el 14% de la vida máxima del más herido por debajo del 50%». No la usa si ella está por debajo del 35%.
- Rasgo, *Sangre que vuelve*: «Recupera un 3% de su vida cada vez que alguien del grupo aplica Sangrado».
- Mecánica propia: es el sanador que no gasta espíritu. Es muy fuerte en combates largos y frágil ante las áreas. Contra el decreto Curas a medias sufre igual que los demás.
- Combina con Kael, el Asesino, Isaura y Abuelo Raigón (que la cura a ella).
- [nuevo] Un coste en vida y la recuperación al aplicarse Sangrado.

**33. Ívori la Tuerta**. Miró dentro de la Grieta con un ojo. Con el otro apunta.
- Papel: Arquero, retaguardia. Combina con: Hechicero (Paladín).
- Activa, *Polvo de grieta*: «Dispara al enemigo que más daño hizo la ronda pasada y le deja Ceguera 2 turnos (32% de fallar sus golpes)».
- Rasgo, *Un solo ojo*: «Hace +20% de daño a los enemigos ciegos».
- Mecánica propia: es control defensivo dirigido a la mayor amenaza de cada ronda, que va cambiando.
- Combina con Brunilda (la misma idea por otra vía, se suman), con tanques y con el Hechicero.
- Ceguera sobre enemigos ya existe (los enemigos la ponen). [nuevo] Que los enemigos fallen por Ceguera y registrar quién pegó más.

**34. Zenón el que Midió la Grieta**. Pasó treinta años midiendo la Grieta. Lo que aprendió es que todo tiene un punto débil, también la Grieta.
- Papel: Mago, retaguardia. Combina con: Arquero (Asesino).
- Activa, *Medida exacta*: «Golpe mágico con el elemento (fuego, hielo o veneno) que menos resiste el objetivo, +20%».
- Rasgo, *Cálculo*: «Su ataque normal también usa el elemento más débil del objetivo».
- Mecánica propia: no hace falta preparar nada. Es buena contra la Ley del Caos de la década 7 y contra enemigos con resistencias altas en un elemento. Nunca hace daño físico (si el enemigo es inmune a lo mágico, no sirve).
- Combina con Ser Ignacia, con Delyth (Bendecido baja todas las resistencias) y con sendas físicas, para cubrir la parte mágica.
- Solo lee resistencias. Casi todo existe; [nuevo] solo la elección de elemento.

**35. Zaida Hilo-Rojo**. Cosía heridas en el borde de la Grieta. Un día cosió a dos personas entre sí, y le gustó.
- Papel: Hechicero, retaguardia. Combina con: Mago (Asesino).
- Activa, *Hilo rojo*: «Ata al enemigo con más vida con otro al azar durante 3 turnos: el 30% del daño que recibe uno lo sufre también el otro».
- Rasgo, *Nudo*: «Si uno de los atados muere, el otro queda con Quebranto 2 turnos».
- Mecánica propia: convierte el daño a un objetivo en daño a dos. Es lo mejor para sendas de un solo objetivo (Asesino, Mago con Explosión arcana) en salas con varios enemigos. Contra un jefe solo no sirve, pero sí contra jefe con escolta.
- Combina con Vex, con el Asesino y con Absalón.
- [nuevo] Duplicar daño entre enemigos atados.

### Década 8: Bosque muerto

**36. Ser Verena del Último Árbol**. Guardiana del último árbol vivo del bosque. Lo perdió, y guarda su semilla.
- Papel: Paladín, frente. Combina con: Paladín (Guerrero).
- Activa, *Sello de savia*: «Sella a ti o a un aliado (primero a quien vaya a recibir más): el próximo estado negativo que le caiga se anula. Si es Corrupción, se anula y además se le quita una carga».
- Rasgo, *Semilla*: «El sellado recupera un 5% de vida cuando el sello se gasta».
- Mecánica propia: protege antes de que llegue el estado (Aya limpia después y Gaspar lo desvía). Es el antídoto contra la regla de la década 8.
- Combina con Aya y con sendas que odian el control.
- [nuevo] El estado Sello y su lectura en `applyStatus`.

**37. Abuelo Raigón**. Druida que se quedó dormido en el bosque cuando aún estaba vivo. Despertó entre árboles muertos y se puso a cuidar a los vivos.
- Papel: Sanador, retaguardia. Combina con: Paladín (Guerrero).
- Activa, cada turno con espíritu: *Brote*: «Planta un Brote en quien tenga menos vida: recupera un 3% de su vida cada ronda durante 4 rondas. Si ya tenía un Brote, se acumula hasta x3 y se renueva la duración».
- Rasgo, *Raíz profunda*: «Los Brotes curan el doble a quien está por debajo del 30%».
- Mecánica propia: es curación lenta que se acumula. Hace mucho en combates largos y no salva a nadie de un golpe enorme.
- Combina con tanques (Cadmo, Malaquías), con Mara (la mantiene) y con el Paladín.
- `regenPct` existe. [nuevo] Que se acumule por cargas.

**38. Isaura Savia-Negra**. Bebía la savia de los árboles muertos y aprendió a beber de otras cosas.
- Papel: Mago, retaguardia. Combina con: Guerrero (Paladín).
- Activa, *Sifón*: «Magia de veneno +10%. El 40% del daño que hace se reparte como curación entre todo el grupo».
- Rasgo, *Raíz negra*: «Su ataque normal cura al aliado con menos vida el 15% del daño».
- Mecánica propia: es una maga que cura. Hace menos daño que Fennwick y cura menos que un sanador, pero ocupa un solo cupo.
- Combina con grupos sin sanador y con sendas de frente.
- Robo de vida existe para el propio aliado. [nuevo] Repartirlo al grupo.

**39. Fray Osmundo el Arrepentido**. Aprendiz del liche del Bosque muerto. Huyó cuando entendió para quién trabajaba.
- Papel: Hechicero, retaguardia. Combina con: Hechicero (Mago).
- Activa, *Levántate*: «Levanta al último enemigo caído (no jefes ni guardianes) como esbirro de tu lado durante 3 rondas, con el 30% de su vida y su ataque normal». Solo un esbirro a la vez.
- Rasgo, *Penitencia*: «Mientras su esbirro esté vivo, Osmundo recibe un 10% menos de daño».
- Mecánica propia: es el único que añade un cuerpo al grupo (hasta 6 en total, como la Sombra Cazadora). El esbirro atrae golpes y hace daño.
- Combina con Candela (cada muerte cura y da un cadáver), con Amaro y con el Hechicero.
- [nuevo] Esbirros aliados creados a partir de una plantilla de enemigo (los invitados `guest` y la Sombra ya existen).

**40. Brunilda Mano-Seca**. Partera del pueblo que el bosque se tragó. Ahora seca la fuerza de lo que encuentra.
- Papel: Hechicero, retaguardia. Combina con: Paladín (Guerrero).
- Activa, *Mano seca*: «Deja Mermado al enemigo con más ataque: −25% de su daño durante 3 turnos».
- Rasgo, *Leche agria*: «Los enemigos Mermados por ella se curan un 50% menos».
- Mecánica propia: reduce el daño del enemigo más fuerte (Seraphina hace −15% solo al frente). Es la mejor contra jefes y no sirve contra grupos.
- Combina con tanques, con el Paladín y con Ívori.
- Mermado existe. [nuevo] Elegir el objetivo por ataque.

### Década 9: Abismo en llamas

**41. Uzbal, el Guardián que Desertó**. Demonio carcelero. Tiró las llaves al fuego el día que entendió que también él estaba preso.
- Papel: Tanque, frente. Combina con: Hechicero (Arquero).
- Reacción, *Interponerse*: «Cuando un golpe iba a dejar a ti o a un aliado de retaguardia por debajo del 20% de vida, Uzbal lo recibe en su lugar con un 30% menos de daño (una vez cada 3 rondas)».
- Activa, *Cadenas al rojo*: «Golpe de fuego que deja Quemadura y se cura un 8%».
- Mecánica propia: es un salvavidas reactivo para la retaguardia. No sirve contra áreas (no puede interponerse ante todos a la vez).
- Combina con sendas de retaguardia y con Sor Inés (si aun así cae alguien).
- [nuevo] Interceptar un golpe antes de aplicarlo.

**42. Ser Ignacia de la Llama Blanca**. Caballera que entró en el Abismo a purificarlo. El fuego no la quemó: la volvió blanca.
- Papel: Paladín, frente. Combina con: Hechicero (Asesino).
- Activa, *Juicio blanco*: «Golpe sagrado con +10% de daño por cada estado negativo distinto que tenga el objetivo (máximo +50%)».
- Rasgo, *Llama blanca*: «Se cura el 30% del daño que hace con *Juicio blanco*».
- Mecánica propia: es el paladín que castiga lo ya debilitado. Es fuerte con sendas que apilan estados y floja si nadie los pone.
- Combina con el Hechicero, con Ofelia, con Iska y con Pizca.
- `negativeStatusCount` existe (Maleficio). Casi todo está.

**43. Gertrud Cerrojo**. Carcelera del Abismo. Su ballesta abría las celdas de una en una. Ahora abre corazas.
- Papel: Arquero, retaguardia. Combina con: Paladín (Guerrero).
- Activa, *Virote de cerrojo*: «Carga 1 turno (no ataca) y al siguiente dispara un virote con +80% de daño que ignora los escudos y reducciones de daño del enemigo (Caparazón, Muralla, Cristalización...)».
- Rasgo, *Llave maestra*: «Sus ataques normales contra enemigos con reducción de daño activa hacen +15%».
- Mecánica propia: rompe defensas de jefes. Es lenta y su utilidad depende del jefe.
- Combina con sendas de poco daño (Paladín) y con Severina (que quita los refuerzos).
- [nuevo] Habilidad en dos turnos y saltarse `incomingDmgReduction`.

**44. Cendra la Fogonera**. Alimentaba los hornos del Abismo. Echa de menos el calor.
- Papel: Mago, retaguardia. Combina con: Mago (Arquero).
- Activa, *Suelo en brasas*: «Durante 3 rondas, al final de cada ronda, todos los enemigos del frente reciben 1 carga de Quemadura».
- Rasgo, *Fogón*: «Sus ataques normales hacen +20% de daño a enemigos con 2 o más cargas de Quemadura».
- Mecánica propia: es la versión aliada del Suelo ardiente: una zona que quema a una fila. Más lenta que la Bola de fuego y no llega a la retaguardia enemiga.
- Combina con Calla, con el Mago (Explosión arcana detona Quemadura) y con Ofelia.
- [nuevo] Efectos de zona por fila con duración.

**45. Lis Saeta-Negra**. Arquera de la guardia demoníaca. Disparaba al fondo de la celda, donde se esconden los que no quieren ser vistos.
- Papel: Arquero, retaguardia. Combina con: Guerrero (Paladín).
- Activa, *Lluvia negra*: «Golpea a todos los enemigos de la retaguardia enemiga con el 60% de su daño (si no hay retaguardia, al frente con el 40%)».
- Rasgo, *Saeta negra*: «+15% de daño a enemigos invocados».
- Mecánica propia: es un área solo para la fila de atrás. Ataca a lanzadores e invocaciones que la senda de frente no alcanza.
- Combina con Nim, con el Guerrero, con el Paladín y con Candela.
- `lluviaLineIndices` ya distingue filas. [nuevo] Usarlo desde un aliado.

### Década 10: La Celda

**46. Cadmo el Encadenado**. El preso más antiguo de la Celda. Lleva tantas cadenas que ya no le pesan: le sostienen.
- Papel: Tanque, frente. Combina con: Paladín (Guerrero).
- Rasgo, *Las cadenas sostienen*: «Recibe menos daño cuanto menos vida tiene: −1% por cada 3% de vida que le falta (tope −30%)».
- Activa, *Tirón de cadenas*: «Arrastra al enemigo del frente: Ralentizado 2 turnos y Debilitado 2 turnos». Ataca ese turno.
- Mecánica propia: es el tanque que empieza blando y acaba de piedra. Necesita un sanador que lo mantenga en la zona media, no a tope.
- Combina con Abuelo Raigón (cura lento, perfecto para la zona media) y con el Paladín.
- [nuevo] Reducción de daño que escala con la vida.

**47. Sor Inés de los Retornos**. Monja que vio volver a muchos del fondo del laberinto. Aprendió a llamarlos ella misma.
- Papel: Sanador, retaguardia. Combina con: Arquero (Mago).
- Reacción, *Vuelve*: «Una vez por combate, 2 rondas después de que caiga un aliado, lo devuelve con el 30% de su vida».
- Activa, cada turno con espíritu: *Oración corta*: «Cura un 10% al más herido por debajo del 50%».
- Mecánica propia: es el único rescate de un caído. Según `aliados-2026-10-16.md`, «vuelve a las 3 rondas» subía unos 20 puntos contra los jefes 70-80, y allí se recomendaba guardarlo como rasgo de un aliado concreto. Esta es esa aliada. No reanima al jugador.
- Combina con tanques que caen, con Uzbal y con Baldomero.
- [nuevo] Reanimar a un aliado durante el combate (el simulador ya tiene `reviveAfter` de prueba).

**48. Absalón el Verdugo**. Verdugo de la Celda. Nunca supo los nombres. Ahora los pregunta.
- Papel: Asesino, retaguardia. Combina con: Mago (Arquero).
- Activa, *Ejecución*: «Si un enemigo (no jefe ni guardián) está por debajo del 18% de vida, lo mata en el acto. Contra jefes y guardianes por debajo del 18%: golpe con +100% de daño».
- Rasgo, *Hacha paciente*: «Si no hay a quién ejecutar, guarda la habilidad y la usa en cuanto aparezca uno (no gasta MP hasta entonces)».
- Mecánica propia: remate seguro. Rinde con sendas de área que dejan a muchos tocados y no aporta nada al principio del combate.
- Combina con Amaro, con la Lluvia de flechas, con Zaida y con Candela.
- [nuevo] Una activa que espera condición sin gastar MP.

**49. Severina la Rompesellos**. Presa por haber abierto la Celda una vez. La metieron dentro de lo que había abierto.
- Papel: Hechicero, retaguardia. Combina con: Guerrero (Paladín).
- Activa, *Romper el sello*: «Quita al objetivo su refuerzo activo más fuerte (Frenesí, Caparazón, Muralla, Furia, Cristalización...)». Si no tiene ninguno, golpe mágico +10%.
- Rasgo, *Sello roto*: «El enemigo al que le quitó un refuerzo queda con Quebranto 2 turnos».
- Mecánica propia: es la única que quita refuerzos al enemigo. Es la respuesta a los jefes que se protegen. Quedan fuera los estados de fase o de historia (inmunidad de Sacerdote de la Tormenta, Fortalecido del voto Piedad), que no se pueden quitar.
- Combina con Gertrud, con sendas de poco daño y con la década 10 (Condena: cuando te encadenan una habilidad, ella sustituye una respuesta que no tienes).
- [nuevo] Una lista de estados que se pueden disipar y quitarlos.

**50. Aurelio el que Vuelve**. Un Retornado de otra vuelta. Recuerda cosas que todavía no han pasado, y casi nunca acierta cuándo.
- Papel: Apoyo, retaguardia. Combina con: Asesino (Arquero).
- Activa, *Prisa*: «El aliado con más ataque actúa dos veces en su próximo turno (la segunda vez, ataque normal)». No ataca ese turno.
- Rasgo, *Ya lo viví*: «Una vez por combate, el primer golpe que te dejaría por debajo del 10% de vida falla».
- Mecánica propia: da una acción extra a otro. Su valor depende de quién sea el mejor del grupo. El rasgo es un seguro solo para el jugador.
- Combina con Vex, Absalón, Rasca y Marisol (que le devuelve MP a él).
- [nuevo] Turnos extra para aliados y la anulación de un golpe.

---

## 4. Reparto

**Por papel**

| Papel | Cantidad | Aliados |
|---|---|---|
| Tanque | 7 | Odo, Gaspar, Torvald, Malaquías, Hakon, Uzbal, Cadmo |
| Paladín | 7 | Anselmo, Lucan, Elvira, Amparo, Baldomero, Verena, Ignacia |
| Sanador | 7 | Aya, Brígida, Candela, Marisol, Mara, Raigón, Inés |
| Asesino | 6 | Tilo, Nim, Rasca, Ilario, Jacobo (frente), Absalón |
| Arquero | 6 | Calla, Yara, Brisa, Ívori, Gertrud, Lis |
| Mago | 6 | Narciso, Ingrid, Amaro, Zenón, Isaura, Cendra |
| Hechicero | 7 | Iska, Fausto, Ofelia, Zaida, Osmundo, Brunilda, Severina |
| Apoyo | 4 | Pizca, Tecla, Tomasa (frente), Aurelio |
| **Total** | **50** | 16 de frente, 34 de retaguardia |

Con los 10 actuales: 9 tanques, 7 paladines, 9 sanadores, 8 asesinos, 8 arqueros, 8 magos, 7 hechiceros y 4 apoyos.

**Por senda principal** (cada ficha también nombra una segunda senda, así que en la práctica cada senda tiene unos 15-17 aliados que le sirven):

| Senda | Principal | Aliados |
|---|---|---|
| Guerrero | 9 | Odo, Aya, Tilo, Anselmo, Gaspar, Isaura, Tomasa, Lis, Severina |
| Paladín | 8 | Nim, Amparo, Amaro, Verena, Raigón, Brunilda, Gertrud, Cadmo |
| Asesino | 8 | Torvald, Rasca, Lucan, Ofelia, Jacobo, Brisa, Mara, Aurelio |
| Arquero | 8 | Brígida, Yara, Fausto, Elvira, Hakon, Ingrid, Zenón, Inés |
| Mago | 8 | Tecla, Calla, Candela, Malaquías, Baldomero, Zaida, Cendra, Absalón |
| Hechicero | 9 | Pizca, Iska, Ilario, Narciso, Marisol, Ívori, Osmundo, Uzbal, Ignacia |

**Por década** (5 por década, mezclando papeles):

| Década | Tanque | Paladín | Sanador | Asesino | Arquero | Mago | Hechicero | Apoyo |
|---|---|---|---|---|---|---|---|---|
| 1 (1-10) Bosque Goblin | Odo | Anselmo | Aya | Tilo | | | | Pizca |
| 2 (11-20) Arañas | Gaspar | | | Nim | Calla | | Iska | Tecla |
| 3 (21-30) Bestias | Torvald | | Brígida | Rasca | Yara | | Fausto | |
| 4 (31-40) Usurpador | | Lucan | Candela | Ilario | | Narciso | Ofelia | |
| 5 (41-50) Isla Paraíso | Malaquías | Elvira | Marisol | Jacobo | Brisa | | | |
| 6 (51-60) El Mar | Hakon | Amparo | | | | Ingrid, Amaro | | Tomasa |
| 7 (61-70) La Grieta | | Baldomero | Mara | | Ívori | Zenón | Zaida | |
| 8 (71-80) Bosque muerto | | Verena | Raigón | | | Isaura | Osmundo, Brunilda | |
| 9 (81-90) Abismo | Uzbal | Ignacia | | | Gertrud, Lis | Cendra | | |
| 10 (91-100) La Celda | Cadmo | | Inés | Absalón | | | Severina | Aurelio |

Comprobaciones: en las dos primeras décadas ya hay tanque, paladín, sanador, hechicero, apoyo, asesino y arquero (es decir, todo salvo mago, que ya cubren Fennwick y Eira). Ninguna década se queda sin una opción defensiva (tanque o paladín) ni sin una de daño.

---

## 5. Cómo se consiguen: la Taberna de Shaza

Decisión de ariochbu: los 50 se consiguen en la Taberna. Esta es mi propuesta de cómo funcionaría.

### 5.1 Lo que hay hoy y lo que se conserva

La Taberna es una escena ilustrada (`renderTaberna`, `TABERNA_SPOTS`) con dos puntos: «Reclutar» (la barra, donde Shaza enseña los panfletos «Busca equipo» en un carrusel) y «Tu equipo» (la mesa, con los aliados sentados). Se conservan sin cambios:
- Abre con nivel 10 y el Ogro vencido. Los cupos van de 1 a 4 según los jefes de década vencidos.
- Contrato en oro (`baseCost + nivel × costPerLevel`), salario al salir del laberinto, satisfacción y deserción.
- Los 10 aliados actuales siguen en el tablón como hoy, siempre disponibles y sin requisitos.
- Despedir a un aliado no lo veta. Al volver a reclutarlo empieza en nivel 1.

### 5.2 Lo nuevo: «Forasteros»

**Un tercer punto en la escena: la mesa del rincón.** En la ilustración de la Taberna se añade un punto «Forasteros», una mesa apartada con hasta 3 asientos. Allí se sientan los aliados nuevos que todavía no conoces, dibujados con su figura sentada (como el equipo en la mesa grande).

**Llegan por década.** Un aliado de la década D puede aparecer en la mesa de forasteros cuando tu personaje ha llegado al primer piso de esa década (récord del personaje, `record_level`):
- Década 1 y década 2: desde que abre la Taberna (abrirla exige el Ogro, y vencerlo te deja en el 11).
- Década D (3-10): desde que alcanzas el piso (D−1)×10+1, es decir, desde que cae el jefe de la década anterior.
- Encaja con la historia: cada jefe es un cerrojo y, al caer, suben a la superficie los que estaban atrapados en esa capa.
- Shaza lo anuncia cuando cae un jefe: «Ha subido gente rara del fondo. Están en la mesa del rincón».

**Rotación de la mesa.** La mesa tiene 3 asientos y se renueva cada 12 horas, el mismo ritmo que los contratos del Gremio. Reglas al rellenarla:
1. Al menos uno de los 3 combina con tu senda (columna «Combina con», principal o segunda).
2. Al menos uno es de la década más honda que tengas desbloqueada, si te quedan forasteros de esa década.
3. El resto, al azar entre los desbloqueados que aún no conoces.
4. Un forastero con quien tienes un encargo en curso conserva su asiento hasta que lo termines o lo abandones.

Por qué rota: 50 panfletos de golpe abruman, y con la rotación cada vuelta a la ciudad trae caras nuevas. La garantía de senda evita que alguien espere días por un aliado para su estilo. Además, Shaza ofrece un «¿A quién buscas?» una vez al día: eliges un papel y uno de los asientos se cambia por un forastero de ese papel (si lo hay).

**Conocer y reclutar: conversación y encargo.**
1. Tocas al forastero y habla: 2-3 líneas con su historia y lo que quiere (en el tono del Cronista, sin emojis).
2. Te propone un **encargo** breve en el laberinto, ligado a su década y a su idea. Ejemplos:
   - Odo Zarzal: «Vence a 10 goblins con un aliado en el Frente».
   - Tecla: «Deja Ralentizados a 8 enemigos en los pisos 11-20».
   - Fausto: «Vence a un grupo de 3 o más bestias sin que caiga nadie».
   - Ser Lucan: «Vence a un guardián de la década 4 sin bajar del 30% de vida».
   - Severina: «Vence a un enemigo que tenga un refuerzo activo».
3. Cuando lo cumples, vuelves a la Taberna. El forastero pasa a **conocido**: su panfleto entra en el tablón de «Reclutar» para siempre, con los 10 actuales, y ya se puede contratar con oro.
4. El primer contrato tras el encargo tiene un **50% de descuento**, como premio por el encargo.

Los encargos usan las mismas piezas que los contratos del Gremio: contadores por tipo de enemigo, piso, condición al terminar el combate. Hay que escribir 50 encargos, uno por aliado. Se puede abandonar un encargo sin coste.

**Coste.** El mismo modelo de hoy, `baseCost + nivel × costPerLevel`, con el `baseCost` del rol: tanque 195, arquero 220, asesino 245, mago 285, sanador 310. Para los roles nuevos propongo paladín 300, hechicero 285 y apoyo 260. No hay un sobrecoste por década: el filtro es haber llegado y el encargo. El precio ya sube solo con el nivel del personaje.

**Fama.** Los títulos ya dan cupos. Propongo que también den una ventaja pequeña en la Taberna, de economía y no de combate, como los beneficios de Fama actuales: con «Héroe» o más, la mesa de forasteros tiene 4 asientos en vez de 3.

### 5.3 Pros y contras

| | A favor | En contra |
|---|---|---|
| Llegar por década | Da algo nuevo en cada década y encaja con la historia de los cerrojos | Los de la década 10 llegan tarde y se usan poco (ver la pregunta 4) |
| Mesa rotatoria | La Taberna está viva y no abruma | Puede frustrar a quien busca a uno concreto (lo compensan la garantía de senda y «¿A quién buscas?») |
| Encargo | Enseña la mecánica del aliado antes de tenerlo y es un objetivo de juego | Son 50 encargos que escribir y validar |
| Conocido para siempre | Despedir no castiga y puedes probar grupos | Con el tiempo, el tablón vuelve a ser largo (ayudaría filtrar por papel) |

### 5.4 Lo que necesita código [nuevo]

- Campo `decade` y `encargo` en cada entrada de `ALLY_ROSTER`.
- Estado de la Taberna por personaje: forasteros sentados, hora de la próxima rotación, encargos en curso y aliados conocidos. Puede ser una columna `tavern jsonb` en `characters`, con migración que entrego como SQL.
- `hire_ally` en el servidor: aceptar los roles nuevos y comprobar que el aliado es de los 10 iniciales o está en `tavern.known`. El servidor también puede comprobar la década con `record_level`. Comprobar el encargo en el servidor es más difícil: hoy los contratos del Gremio se comprueban en el cliente (pregunta abierta 6).
- El punto «Forasteros» en `TABERNA_SPOTS`, con sus asientos medidos sobre `taberna.jpg` y `taberna_movil.jpg`. Hace falta repasar la ilustración, porque hoy no hay mesa de rincón.
- Arte por aliado: retrato (`src/assets/aliados/<id>.jpg`), figura sentada (`escenas/aliados/<id>.webp`) y tira chibi de combate (`import_chibi.py`). Son 150 piezas. Es la parte más cara del proyecto, y conviene que vaya por tandas como el código.

---

## 6. Plan de implementación en tandas

Son cinco tandas de diez, por pares de décadas, para que cada tanda entre en el orden en que el jugador la encuentra. Cada tanda se mide en su rama, sin desplegar, y con aprobación de ariochbu antes de fusionar. Antes de empezar debe estar fusionada `kits-retaguardia` (por `ALLY_BOOST` y el Ralentizado a −30%), porque si no las mediciones no valen.

**Tanda 0: estructura (sin aliados nuevos)**
- Pasar los 10 actuales a `ALLY_KITS` sin cambiar nada. Se comprueba con la foto `__snapshot`, que debe salir idéntica, y con las tasas de referencia dentro del ruido.
- Roles `paladin`, `hechicero` y `apoyo` en el cliente, y la migración de roles como texto SQL para ariochbu.
- Sistema de la Taberna: forasteros, rotación, encargos, conocidos y la comprobación en `hire_ally`.
- Simulador: que `SIM_ALLIES` acepte cualquier plantilla y una prueba de «cambiar uno» (ver abajo).

**Tanda 1: décadas 1-2** (Odo, Aya, Pizca, Tilo, Anselmo, Gaspar, Tecla, Iska, Calla, Nim). Incluye el primer paladín y el primer hechicero, y casi todas las piezas nuevas de base: reflejo, limpiar un estado, Corrosión en enemigos, reacción al aturdir, regeneración de fila, desvío de estados, alargar estados, contagio y Embreado.

**Tanda 2: décadas 3-4** (Torvald, Brígida, Rasca, Yara, Fausto, Lucan, Candela, Ilario, Narciso, Ofelia). Trae el desvío de daño al jugador, el doble y los efectos al morir un enemigo.

**Tanda 3: décadas 5-6** (Malaquías, Elvira, Marisol, Jacobo, Brisa, Hakon, Amparo, Ingrid, Amaro, Tomasa). Trae la provocación en todos los pisos, la evasión de aliados, el área y el aumento de daño de grupo. Es la tanda con más riesgo de balance (aturdimiento en cadena, Estandarte).

**Tanda 4: décadas 7-8** (Baldomero, Mara, Ívori, Zenón, Zaida, Verena, Raigón, Isaura, Osmundo, Brunilda). Trae los esbirros y las reacciones a umbrales de vida. Se mide contra las reglas de Ley del Caos y Corrupción.

**Tanda 5: décadas 9-10** (Uzbal, Ignacia, Gertrud, Cendra, Lis, Cadmo, Inés, Absalón, Severina, Aurelio). Trae la reanimación, el turno extra, disipar y la interceptación. Va contra los jefes más calibrados del juego (90 y 100), así que es donde más cuidado hay que tener.

**Qué medir en cada tanda** (con `tools/medir_aliados.js` y `tools/calib_harness.js`, IA v2, 30 combates por senda y 180 por fila, error ±3,5 puntos):

1. **Cambiar uno.** El grupo de referencia de `aliados-2026-10-16.md`, cambiando el aliado actual del mismo papel por el nuevo, en combates sueltos, guardianes y jefe de su década y de la siguiente. Objetivo: victorias dentro de ±5 puntos del aliado actual al que sustituye. Más de +8 es un aviso de que está fuerte. Los roles nuevos sin equivalente se comparan con el rol más cercano: paladín con Brann y Seraphina juntos, hechicero con Eira, apoyo con Lyra.
2. **Utilidad (`allyStats`).** Daño, curación, escudo, control y apoyo por combate. La métrica principal debe estar en la categoría de su papel, y ningún aliado debe ser el primero del grupo en dos categorías a la vez (el principio de que nadie es «mejor en todo»).
3. **Ronda de la primera baja** y aliados muertos al final, sobre todo para tanques, paladines y sanadores. Es lo que mejor mide si un defensor defiende.
4. **Combos de riesgo**, cada uno medido con y sin la combinación:
   - Aturdimiento en cadena contra jefes: Tecla, Hakon e Ingrid; Brisa y Elvira; Tilo con cualquier aturdidor. El jefe no debe pasar más del 25% de sus turnos sin actuar.
   - Daño de grupo apilado: Tomasa, Lyra y el Grito de guerra.
   - Bucles de curación: Candela con Amaro y Absalón en salas grandes; Isaura y Mara.
   - Provocación con reflejo (Malaquías y Odo) contra jefes de muchos golpes.
5. **Reglas de década.** Cada tanda se mide con las reglas de su década encendidas y sin ellas (`SIM_NO_ALTERATIONS`), para ver qué aliado responde a qué regla y si alguno la anula del todo (por ejemplo, Verena contra la Corrupción).
6. **Las sendas.** Victorias por senda con su mejor grupo de 4 entre los disponibles hasta esa década. Ninguna senda debe ganar más de 10 puntos por los aliados nuevos sobre las otras, porque si no los aliados nuevos deshacen el reparto de clases.
7. **Recalibrar después, no antes.** Si las tasas suben (es lo esperable con aliados mejores), se toca primero el aliado. Los jefes solo se tocan cuando hayan entrado las 5 tandas, para no recalibrar cinco veces.

---

## 7. Preguntas abiertas para ariochbu

1. **Nombres y tono.** ¿Te encajan los nombres y las historias? Varios aliados salen de la historia (el escudero del Usurpador, el sacerdote de Storm Gush, el aprendiz del liche, un demonio carcelero desertor). ¿Alguno choca con lo que tienes pensado para el Carcelero perdonable o para los Retornados?
2. **Roles nuevos.** ¿Paladín, Hechicero y Apoyo como roles técnicos nuevos (necesitan migración) o prefieres meterlos dentro de los 5 que existen, con Paladín como «guerrero de espíritu»? Lo nuevo es más limpio, pero toca la base de datos.
3. **Equipo del Apoyo.** ¿Qué armas y armaduras lleva un Apoyo? Opciones: las del Sacerdote, las del Arquero, o un catálogo propio (más trabajo).
4. **Década 10.** Los aliados de la Celda llegan al piso 91 y casi solo sirven para el 91-100, los modos de juego y el futuro Retornado. ¿Te parece bien así, o prefieres que la última tanda llegue antes (por ejemplo, la década 10 al vencer al jefe 80)?
5. **Rotación.** ¿Mesa de forasteros con rotación cada 12 h, o prefieres que todos los desbloqueados estén siempre visibles (más simple y menos sorpresa)?
6. **Encargos.** ¿Encargo obligatorio para conocer a cada aliado, o solo conversación y oro? Y si hay encargo, ¿basta con comprobarlo en el cliente, como los contratos del Gremio, o quieres comprobación en el servidor?
7. **Corrupción y limpiezas.** La Corrupción de la década 8 dura todo el combate. ¿Se puede limpiar? Hoy un Antídoto la quita (vacía todos los estados). Si se puede limpiar, Aya y Verena son casi obligatorias en 71-80. Propongo que no se limpie y que solo Verena la frene.
8. **Cupo de 4.** Con 60 aliados, ¿mantenemos el máximo de 4 aliados? Recomiendo que sí: elegir es la gracia.
9. **Aturdimiento contra jefes.** ¿Te parece bien la regla de Tambaleo en vez de Aturdido contra jefes, y una vez cada 4 rondas por enemigo, para Elvira e Ingrid?
10. **Precio de los roles nuevos.** ¿Paladín 300, Hechicero 285 y Apoyo 260 de coste base te parecen bien?
11. **Arte.** Son 150 piezas (retrato, figura sentada y tira chibi). ¿Las preparas por tandas de 10 como el código, y con qué estilo para los de 61-100 (la tira chibi detallada de 1-60)?
12. **Orden.** ¿Empezamos por la tanda 0 (estructura y Taberna) cuando se fusione `kits-retaguardia`, o prefieres ver primero 2-3 aliados de prueba con la estructura actual?
