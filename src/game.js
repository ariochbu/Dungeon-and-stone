"use strict";

import { supabase } from './supabaseClient.js';
import * as auth from './auth.js';
import { syncBattleStage, playBattleAnim } from './battleStage.js?v=98';
import { mountLabyrinth } from './labyrinthMap.js?v=4';
import { CLASS_SPRITES, ENEMY_SPRITES, playerSpriteFor, playerIllustrationFor, enemySpriteFor, ALLY_TEMPLATE_SPRITES } from './battleSprites.js?v=86';

/* ============================================================
   DATA
   ============================================================ */

// pros/cons (2026-09-26, pedido explícito: "coloquemos 'ventajas y
// desventajas' de cada raza") — reflejan literalmente los stats/res/passive
// de arriba, no son adorno: quien lee la ficha antes de crear personaje
// tiene que poder anticipar el hueco que le va a tocar tapar con equipo.
// Agilidad y Vigor (pedido explícito 2026-09-28, "Paso 0" del rediseño de
// stats): se agregan como 4º y 5º stat base de cada raza. No vinieron
// números dados — se repartieron por identidad de cada raza, buscando un
// total aproximadamente parejo entre todas (25-28 puntos sumando los 5
// stats) para no romper el equilibrio ya establecido entre fis/esp/hab.
// Agilidad reemplaza a Habilidad como fuente de crítico/evasión/precisión
// (ver derived()) — por eso el texto de pros/cons que hablaba de "Habilidad"
// para eso se reescribió a "Agilidad" en Enano/Dracónido/Hombre bestia.
// Vigor es nuevo (vida + reducción de daño) — Enano queda como la raza con
// más Vigor, reforzando su identidad ya existente de "la más resistente".
const RACES = {
  barbaro: {
    id:'barbaro', name:'Bárbaro', icon:'🪓',
    desc:'Carne y furia. El más fuerte y el más despreciado fuera del combate.',
    stats:{fis:8, esp:3, hab:5, agi:3, vig:6},
    res:{fisico:15, fuego:-10, hielo:0, veneno:0, aturdimiento:20},
    passive:'Furia de sangre', passiveDesc:'Por debajo del 30% de vida, tu daño físico aumenta un 20%.',
    pros:'El Físico más alto del juego y gran resistencia a Aturdimiento.',
    cons:'Espíritu muy bajo (poco Espíritu y poca resistencia a estados) y débil contra Fuego.'
  },
  enano: {
    id:'enano', name:'Enano', icon:'⛏️',
    desc:'Robusto y terco. Resiste lo que otros no soportarían.',
    stats:{fis:7, esp:4, hab:4, agi:2, vig:9},
    res:{fisico:10, fuego:0, hielo:10, veneno:25, aturdimiento:5},
    passive:'Piel de piedra', passiveDesc:'Reduce todo daño físico recibido en una cantidad plana adicional.',
    pros:'La raza más resistente en general — Físico, Veneno y Hielo por encima del resto, y el Vigor más alto del juego.',
    cons:'Agilidad baja: menos crítico y evasión que cualquier otra raza.'
  },
  hada: {
    id:'hada', name:'Hada', icon:'🦋',
    desc:'Frágil pero certera. Vive de no ser tocada.',
    stats:{fis:3, esp:9, hab:6, agi:8, vig:1},
    res:{fisico:-10, fuego:15, hielo:15, veneno:5, aturdimiento:0},
    passive:'Gracia', passiveDesc:'+15% de probabilidad de esquivar cualquier ataque.',
    pros:'El Espíritu más alto del juego (más daño para Paladín/Sacerdote, más Espíritu y resistencia a estados) + Agilidad muy alta (crítico y evasión) + 15% de evasión propia.',
    cons:'El Físico más bajo del juego y el Vigor más bajo (poca vida), y encima resta resistencia física: cada golpe que sí conecta duele más.'
  },
  humano: {
    id:'humano', name:'Humano', icon:'🗡️',
    desc:'Sin extremos, sin techo. Aprende más rápido que el resto.',
    stats:{fis:5, esp:5, hab:6, agi:5, vig:5},
    res:{fisico:5, fuego:5, hielo:5, veneno:5, aturdimiento:5},
    passive:'Adaptable', passiveDesc:'Ganas un 10% más de experiencia de cada victoria.',
    pros:'La más equilibrada de todas, sin ningún punto débil real, y sube de nivel un 10% más rápido.',
    cons:'Ningún stat ni resistencia sobresale por encima de las demás razas — sin techo propio.'
  },
  draconido: {
    id:'draconido', name:'Dracónido', icon:'🐉',
    desc:'Sangre de bestia antigua. Poderoso, pero torpe con el hielo.',
    stats:{fis:7, esp:7, hab:3, agi:3, vig:6},
    res:{fisico:0, fuego:30, hielo:-15, veneno:0, aturdimiento:10},
    passive:'Sangre ancestral', passiveDesc:'Tus habilidades de fuego infligen un 15% adicional de daño.',
    pros:'La única raza fuerte en Físico Y Espíritu a la vez, casi inmune al Fuego (+30%).',
    cons:'Agilidad baja (poco crítico/evasión) y con resistencia negativa a Hielo — su elemento opuesto pega más fuerte.'
  },
  bestia: {
    id:'bestia', name:'Hombre bestia', icon:'🐺',
    desc:'Instinto puro. Golpea primero, golpea fuerte, golpea rápido.',
    stats:{fis:6, esp:2, hab:9, agi:9, vig:2},
    res:{fisico:5, fuego:0, hielo:0, veneno:-10, aturdimiento:15},
    passive:'Instinto cazador', passiveDesc:'+15% de probabilidad de golpe crítico.',
    pros:'La Agilidad más alta del juego (más crítico y evasión) + 15% de crítico propio adicional.',
    cons:'El Espíritu más bajo del juego (poco Espíritu y resistencia a estados), Vigor bajo (poca vida), y resta resistencia a Veneno.'
  }
};

const STYLES = {
  pesada: {
    id:'pesada', name:'Guerrero', icon:'🔨', scaleStat:'fis',
    desc:'Mazos y hachas. Rompe la guardia y remata al aturdido.',
    skills:['golpe_bruto','machacar','grito_guerra']
  },
  doblefilo: {
    // 2026-10-02 (pedido explícito): Asesino pasa a ser 100% Físico — antes
    // promediaba Físico+Habilidad ('fishab'). Sus armas y guantes pasan a dar
    // Físico en el mismo cambio (ver WEAPON_CATALOG.doblefilo).
    id:'doblefilo', name:'Asesino', icon:'🔪', scaleStat:'fis',
    desc:'Dagas gemelas. Desangra a tu presa y luego termina el trabajo.',
    skills:['corte_rapido','danza_cuchillas','golpe_gracia']
  },
  tirador: {
    id:'tirador', name:'Arquero', icon:'🏹', scaleStat:'fis',
    desc:'Distancia y precisión. Marca, retrocede, dispara.',
    skills:['disparo_certero','marca_cazador','lluvia_flechas']
  },
  mago: {
    // 2026-10-02 (pedido explícito): Mago pasa a escalar con Habilidad (antes
    // Espíritu), y sus 3 habilidades pasan a costar MP — que desde el Paso 0
    // lo alimenta Habilidad — en vez de Espíritu, igual que el Hechicero. Si
    // siguiera pagando con Espíritu, itemizar Habilidad lo dejaría sin pozo.
    id:'mago', name:'Mago', icon:'🔥', scaleStat:'hab',
    desc:'Fuego y hielo. Siembra el elemento y detónalo después.',
    skills:['bola_fuego','lanza_hielo','explosion_arcana']
  },
  // Paladín y Hechicero (pedido explícito 2026-09-28, "Paso 1" del rediseño
  // de clases). Paladín: línea frontal como el Guerrero, pero escala con
  // Espíritu — tanque/soporte con daño ligero, reducción de daño y escudos.
  // Hechicero: a distancia, escala con Habilidad — control y debuffs
  // (Veneno, Miedo, Confusión; Parálisis queda reservada a su ultimate).
  paladin: {
    id:'paladin', name:'Paladín', icon:'⚜️', scaleStat:'esp',
    desc:'Escudo y juramento. Encaja el golpe, protege al resto, nunca cae el primero.',
    skills:['golpe_consagrado','muro_de_fe','escudo_del_juramento']
  },
  hechicero: {
    id:'hechicero', name:'Hechicero', icon:'🌀', scaleStat:'hab',
    desc:'Maldiciones y control. Envenena, aterra, confunde — y remata lo que ya no puede defenderse.',
    skills:['toque_venenoso','grito_de_panico','mirada_de_locura']
  }
};

/* ============================================================
   TABERNA — aliados reclutables (v1: solo Gremio, sin traición ni
   mantenimiento recurrente todavía; nivel 10 de personaje requerido)
   ============================================================ */
const ALLY_ROSTER = [
  // Golpe Pesado de Aldric suma 12% de probabilidad de aturdir al golpear
  // (pedido explícito 2026-09-26, pequeño buff — ver resolveOneAllyTurn).
  {templateId:'aldric', role:'guerrero', name:'Aldric de la Muralla', icon:'🛡️', bio:'Escudero retirado que aún no aprende a rendirse. Se planta al frente y no se mueve.', skillName:'Golpe Pesado', skillDesc:'Cada pocos turnos, un golpe con 60% más de daño y 12% de probabilidad de aturdir.', baseCost:195, costPerLevel:13, frontline:true},
  {templateId:'neira', role:'arquero', name:'Neira la Certera', icon:'🏹', bio:'Cazadora de las tierras altas. Nunca falla dos veces al mismo blanco.', skillName:'Disparo Certero', skillDesc:'Cada pocos turnos, un disparo que ignora buena parte de la resistencia del objetivo.', baseCost:220, costPerLevel:14, frontline:false},
  // Epíteto agregado (pedido explícito 2026-09-26) para que quede a la par
  // del resto del roster — la habilidad (Golpe Sombrío) no cambia.
  {templateId:'vex', role:'asesino', name:'Vex el Desgarrador', icon:'🗡️', bio:'No cuenta su pasado. Solo dice que llegó tarde a la venganza que buscaba.', skillName:'Golpe Sombrío', skillDesc:'Cada pocos turnos, más daño mientras más herido esté el objetivo.', baseCost:245, costPerLevel:16, frontline:false},
  // Epíteto agregado (pedido explícito 2026-09-26) — la habilidad (Bola de
  // Fuego) no cambia.
  {templateId:'fennwick', role:'mago', name:'Fennwick el Incendiario', icon:'🔮', bio:'Aprendiz expulsado del Círculo Roto por "experimentar de más".', skillName:'Bola de Fuego', skillDesc:'Cada pocos turnos, daño de fuego en vez de físico — útil contra enemigos resistentes al golpe.', baseCost:285, costPerLevel:18, frontline:false},
  {templateId:'delyth', role:'sacerdote', name:'Hermana Delyth', icon:'✨', bio:'La última de su orden. Cura a cualquiera que se lo pida, sin preguntar por qué pelea.', skillName:'Bendición Sagrada', skillDesc:'Cuando nadie necesita curación, baja todas las resistencias del enemigo del frente por unos turnos.', baseCost:310, costPerLevel:20, frontline:false},

  // 5 aliados nuevos (pedido explícito 2026-09-26) — segunda opción por
  // senda, mismo costo que su contraparte del mismo rol (ver resolveOneAllyTurn
  // para el detalle mecánico de cada habilidad, todas con cooldown de 3 turnos
  // igual que el resto del roster).
  {templateId:'brann', role:'guerrero', name:'Brann el Bastión', icon:'🪖', bio:'Antiguo capitán de guarnición. Prefiere encajar el golpe él mismo a ver caer a alguien más.', skillName:'Muralla Viviente', skillDesc:'Cada pocos turnos, -20% de daño recibido durante 3 turnos y recupera el 10% de su vida máxima al instante (no ataca ese turno).', baseCost:195, costPerLevel:13, frontline:true},
  {templateId:'lyra', role:'arquero', name:'Lyra la Comandante', icon:'🎯', bio:'Dirigió una compañía de exploradores antes de que el laberinto se la tragara entera.', skillName:'Mando de Retaguardia', skillDesc:'Cada pocos turnos, ella y el resto de la retaguardia reciben +10% de daño durante 3 turnos, sin dejar de atacar ese mismo turno.', baseCost:220, costPerLevel:14, frontline:false},
  {templateId:'kael', role:'asesino', name:'Kael el Desangrador', icon:'🔪', bio:'Aprendió el oficio en fosas de pelea clandestinas. Nunca deja que una herida cierre.', skillName:'Tajo Sangriento', skillDesc:'Cada pocos turnos, un ataque que aplica Sangrado garantizado (y 30% de probabilidad de una segunda carga).', baseCost:245, costPerLevel:16, frontline:false},
  {templateId:'eira', role:'mago', name:'Eira la Escarchada', icon:'❄️', bio:'Sobrevivió sola un invierno entero en las cumbres. El frío dejó de asustarla hace mucho.', skillName:'Aliento Glacial', skillDesc:'Cada pocos turnos, magia de hielo (+15% de daño) con 25% de probabilidad de Ralentizar al objetivo.', baseCost:285, costPerLevel:18, frontline:false},
  {templateId:'seraphina', role:'sacerdote', name:'Seraphina la Égida', icon:'🕊️', bio:'Juró proteger antes de aprender a rezar. Todavía no decide cuál de las dos cosas se le da mejor.', skillName:'Égida Sagrada', skillDesc:'Sin enfriamiento: cada turno que tenga espíritu, escuda al aliado con menos vida que no tenga ya un escudo (20% de su vida máxima) y debilita al enemigo del frente (-15% de su daño durante 2 turnos).', baseCost:310, costPerLevel:20, frontline:false}
];
const ALLY_MIN_LEVEL = 10;
const MAX_ALLIES = 4;
// ============================================================
// FAMA Y CUPOS DE ALIADOS (pedido explícito 2026-10-02, entra con la BETA)
// Cada jefe de década derrotado da un título y, con BETA_ALLY_UNLOCKS
// encendido, un cupo de aliado:
//   Ogro (10)      → Aventurero  · abre la Taberna (además de nivel 10) · 1 aliado
//   Matriarca (20) → Renombrado  · 2 aliados
//   Riakis (30)    → Héroe       · 3 aliados
//   Usurpador (40) → Leyenda     · 4 aliados (tope)
// Mientras BETA_ALLY_UNLOCKS sea false (alfa) los títulos se muestran igual,
// pero la Taberna y los cupos funcionan como siempre (nivel 10, 4 aliados).
// Al lanzar la beta: poner true (y el límite equivalente en hire_ally).
//
// 2026-10-04 (pedido explícito): el sistema se enciende SOLO para las cuentas
// creadas desde BETA_ACCOUNTS_FROM; las cuentas anteriores siguen como en la
// alfa. Se decide al iniciar sesión (onAuthed) con profiles.created_at, y
// hire_ally aplica la misma fecha en el servidor (migración 0034).
// ============================================================
let BETA_ALLY_UNLOCKS = false;
const BETA_ACCOUNTS_FROM = Date.parse('2026-10-05T04:00:00Z');
// El BALANCE de los pisos 1-40 (jefes, enemigos y curva de sendas calibrados
// para 0/1/2/3 aliados) es el mismo para TODAS las cuentas (aclaración de
// ariochbu, 2026-10-04); solo los cupos de aliados dependen de la cuenta.
let BETA_BALANCE = true;
const RENOWN_TITLES = ['', 'Aventurero', 'Renombrado', 'Héroe', 'Leyenda',
  'El que sobrevivió a la tormenta', 'Inmune al caos', 'Retornado del laberinto', 'El primer retornado'];
// Títulos altos (pedido explícito 2026-10-04): pisos 60, 80 y 100. Jefes de
// década que exige cada título (índice = id del título). Los dos últimos
// piden el jefe del piso 100; "El primer retornado" además solo lo tiene el
// PRIMER personaje que lo derrota (characters.first_retornado, lo decide la
// base — migración 0032 —, nunca el cliente).
const TITLE_BOSSES = [0, 1, 2, 3, 4, 6, 8, 10, 10];
const TITLE_FIRST_RETORNADO = 8;
// Beneficios del título EN USO — "Fama" (opción elegida por ariochbu el
// 2026-10-04: beneficios muy sutiles, de economía y no de combate, donde cada
// título mejora al anterior). Solo cuenta el título que el jugador lleva
// puesto (myTitleN()), nunca se suman varios.
//   gold: más oro del laberinto (combates y cofres)
//   tax:  parte del impuesto del 10% al volver a la ciudad que se perdona
//   xp:   más experiencia para el jugador (los aliados reciben la base)
//   wage: rebaja del sueldo de los aliados
const TITLE_PERKS = [
  {gold:0,    tax:0,    xp:0,    wage:0},
  {gold:0.02, tax:0,    xp:0,    wage:0},     // Aventurero
  {gold:0.04, tax:0.05, xp:0,    wage:0},     // Renombrado
  {gold:0.06, tax:0.10, xp:0.02, wage:0},     // Héroe
  {gold:0.08, tax:0.15, xp:0.04, wage:0.05},  // Leyenda
  {gold:0.08, tax:0.15, xp:0.04, wage:0.05},  // del piso 60 en adelante: la economía de Leyenda...
  {gold:0.08, tax:0.15, xp:0.04, wage:0.05},
  {gold:0.08, tax:0.15, xp:0.04, wage:0.05},
  {gold:0.08, tax:0.15, xp:0.04, wage:0.05},
];
// ...y además stats de COMBATE (pedido explícito 2026-10-04: "estos ya deben
// dar stats de combate"). Mismo vocabulario que los bonuses de PET_CATALOG:
// entran por petModSum/specialsFromPets, así que reutilizan toda la lógica de
// combate existente. Solo para el jugador, y solo el título que lleva puesto.
const TITLE_BONUSES = [[], [], [], [], [],
  [{type:'aumento_dano', value:0.03}, {mod:'maxhp_flat', value:150}],
  [{type:'aumento_dano', value:0.05}, {mod:'maxhp_flat', value:250}, {mod:'resistencia_estado', value:10}],
  [{type:'aumento_dano', value:0.08}, {mod:'maxhp_flat', value:400}, {type:'reduccion_dano', value:0.05}],
  [{type:'aumento_dano', value:0.10}, {mod:'maxhp_flat', value:500}, {type:'reduccion_dano', value:0.05}, {type:'prob_critico', value:0.05}],
];
function titlePerks(){ return TITLE_PERKS[state && state.char ? myTitleN() : 0] || TITLE_PERKS[0]; }
function titleBonuses(){ return TITLE_BONUSES[state && state.char ? myTitleN() : 0] || []; }
function titlePerksText(n){
  const p = TITLE_PERKS[n] || TITLE_PERKS[0];
  const pc = (v)=> Math.round(v*100)+'%';
  return petBonusLines({bonuses: TITLE_BONUSES[n] || []}).concat(
         [p.gold ? `+${pc(p.gold)} de oro en el laberinto` : '', p.tax ? `−${pc(p.tax)} de impuestos al volver` : '',
          p.xp ? `+${pc(p.xp)} de experiencia` : '', p.wage ? `−${pc(p.wage)} en el sueldo de tus aliados` : ''].filter(Boolean));
}
const RENOWN_TITLE_HOW = ['',
  'Lo ganaste al derrotar al Ogro, guardián del nivel 10.',
  'Lo ganaste al derrotar a la Matriarca Escarlata, guardiana del nivel 20.',
  'Lo ganaste al derrotar a Riakis, guardián del nivel 30.',
  'Lo ganaste al derrotar al Usurpador Sin Nombre, guardián del nivel 40.',
  'Lo ganaste al derrotar a Storm Gush, guardián del nivel 60.',
  'Lo ganaste al derrotar al guardián del nivel 80.',
  'Lo ganaste al derrotar al guardián del nivel 100.',
  'Fuiste el primero en derrotar al guardián del nivel 100. Nadie más puede llevarlo.'];
// Jefes de década derrotados (0-10). Hasta el 40 se deduce del checkpoint y
// del récord (llegar al nivel 11 implica haber vencido al Ogro, al 21 a la
// Matriarca...). Eso no alcanza para el último jefe implementado: el
// checkpoint y el récord topan en LEVEL_CAP, así que vencer al del piso 60 no
// dejaba rastro. Por eso `stored` (characters.bosses_beaten, migración 0032)
// guarda la cuenta real; se toma el mayor de los tres.
function decadeBossesBeaten(checkpointLevel, recordLevel, stored){
  const n = Math.max(Math.floor(((checkpointLevel||1)-1)/10), Math.floor(((recordLevel||1)-1)/10), stored||0);
  return Math.max(0, Math.min(10, n));
}
function myBossesBeaten(){
  return decadeBossesBeaten(state.char.checkpointLevel, state.char.record && state.char.record.level, state.char.bossesBeaten);
}
// Anota un jefe de década vencido (ver handleVictory).
function noteDecadeBossBeaten(clearedLevel){
  // primera vez que cae este jefe: toca su escena de historia (ver STORY_SCENES)
  if((state.char.bossesBeaten||0) < Math.floor(clearedLevel/10)) pendingStoryLevel = clearedLevel;
  state.char.bossesBeaten = Math.max(state.char.bossesBeaten||0, Math.floor(clearedLevel/10));
}
// ============================================================
// HISTORIA DEL LABERINTO (pedido explícito 2026-10-05). El laberinto es una
// prisión construida capa sobre capa para encerrar algo en el fondo; cada
// jefe de década es un cerrojo y, al caer, el Cronista cuenta un pedazo.
// Se muestra la PRIMERA vez que el personaje vence a ese jefe, antes del
// cartel de "continuar o retirarse".
// Arte: src/assets/historia/<piso>_<n>.jpg (n desde 1, 16:9 o más ancho);
// mientras no exista se ve el fondo de la década.
// Arco completo acordado: 61-70 La Grieta (caos), 71-80 Bosque muerto (jefe:
// un liche), 81-90 Abismo en llamas (los demonios son los carceleros; al
// Carcelero se le puede perdonar), 91-100 La Celda (el Primer Retornado; el
// espíritu del Usurpador habla antes del jefe y entra como sexto aliado que
// muere de un golpe).
// ============================================================
let pendingStoryLevel = 0;
const STORY_SCENES = {
  10: {title:'El guardián de la entrada', pages:[
    'El Ogro cae de rodillas. No ruge: mira hacia la boca del laberinto, como quien acaba de fallar una guardia. En su garrote hay muescas talladas, una por cada día que pasó aquí. Son demasiadas para la vida de un ogro.',
    'Bajo su cuerpo, la piedra guarda una inscripción medio borrada: «Que nadie baje». Los goblins nunca vigilaron un tesoro. Vivían de lo que subía.',
  ]},
  20: {title:'Lo que tapaba la telaraña', pages:[
    'La Matriarca escarlata se pliega sobre sí misma y la colmena entera calla. Al arder, las telarañas dejan ver los muros: están cubiertos de sellos, cientos de ellos, tallados por manos que no eran de araña.',
    'Las arañas no construyeron este nido. Tejieron encima de algo que ya estaba cerrado. Y algunos sellos están rotos… desde dentro.',
  ]},
  30: {title:'El primero en oírla', pages:[
    'Riakis ríe mientras se deshace. «¿Señor del Caos? Yo solo me asomé a una grieta… y la grieta me miró.» Las bestias dejan de aullar; por un momento parecen animales corrientes.',
    '«Yo no abrí la puerta», susurra. «Solo fui el primero en oírla. Abajo hay alguien que quiere salir… y tú le estás quitando los cerrojos, uno por uno.»',
  ]},
  40: {title:'El que bajó antes que tú', pages:[
    'Las copias se desvanecen una a una hasta que queda un solo hombre, con una armadura de aventurero tan gastada como la tuya. Busca su nombre en la memoria y no lo encuentra.',
    '«Yo también bajé a conquistarlo. Llegué más hondo que nadie… y volví a empezar. Y otra vez. Cada vuelta me quitó algo.» Te mira por primera vez. «No bajes buscando gloria. Baja sabiendo qué hay.» Su cuerpo se disuelve, pero su voz no se va del todo.',
  ]},
  50: {title:'El cielo pintado', pages:[
    'El Custodio clava su arma en la arena y el cielo de la isla se resquebraja como pintura vieja. Detrás del azul no hay sol: hay roca. El paraíso era un techo pintado.',
    '«Lo hicimos hermoso para que nadie quisiera seguir», dice sin rencor. «No te guardábamos el camino a ti. Te guardábamos de él.» Señala hacia abajo, donde ya se oye el mar.',
  ]},
  60: {title:'El foso', pages:[
    'Tetrasea, el Señor de las Lágrimas, se hunde y el mar se retira con él. No era un océano: era un foso. En el fondo seco hay una puerta redonda de piedra, del tamaño de una ciudad.',
    '«Lloré mil años para mantenerla cerrada», dice la última ola. La puerta cruje. Una grieta la recorre de lado a lado y algo, al otro lado, respira por primera vez. El sello está roto. Lo rompiste tú.',
  ]},
  70: {title:'La cicatriz', pages:[
    'El Sin Forma prueba una silueta más, y otra, y ninguna le sirve. Se deshace sin hacer ruido, como una idea que nadie termina de pensar. La Grieta se queda quieta por primera vez.',
    'Pero algo no desaparece con él: en el muro de la prisión queda una cicatriz que no cierra. Por ella se cuela un olor a tierra mojada y a flores viejas. Lo que estaba contenido aquí ya salió… y abajo había un jardín.',
  ]},
  80: {title:'El jardín', pages:[
    'El Corazón Marchito deja caer sus raíces. No se defiende: late una vez, despacio. «Pódame». Cuando el último latido se apaga, las flores se cierran, los jardineros dejan de moverse y la luz verde se va. Por primera vez desde que entraste, el bosque está muerto de verdad.',
    'Entonces, desde abajo, sube una luz naranja. Calor. Ceniza. El jardín no era una amenaza: era un filtro. Absorbía lo que subía de las capas de más abajo… y acabas de arrancarlo.',
  ]},
};
// Crónicas (ciudad): tres apartados. Historia — las escenas ya desbloqueadas
// se pueden volver a ver; las que faltan aparecen selladas, sin título, para
// no adelantar nada. Bestiario y Música se sumaron el 2026-10-07.
let cronTab = 'historia';
function renderCronicas(){
  const tabs = [['historia','📜 Historia'],['bestiario','🐾 Bestiario'],['musica','🎼 Música']];
  const body = cronTab==='bestiario' ? bestiaryHTML() : cronTab==='musica' ? soundtrackHTML() : storyListHTML();
  document.getElementById('main-panel').innerHTML = `
    <div class="cronicas">
      <h2 class="cw-title">Crónicas del laberinto</h2>
      <div class="cron-tabs">${tabs.map(([k, l])=>`<button class="${cronTab===k?'on':''}" data-crontab="${k}">${l}</button>`).join('')}</div>
      ${body}
    </div>`;
  document.querySelectorAll('[data-crontab]').forEach(b=> b.onclick = ()=>{ cronTab = b.dataset.crontab; renderCronicas(); });
  document.querySelectorAll('[data-cron]').forEach(b=> b.onclick = ()=> showStoryScenes(+b.dataset.cron, ()=>{}));
}
function storyListHTML(){
  const beaten = myBossesBeaten();
  const levels = Object.keys(STORY_SCENES).map(Number).sort((a, b)=> a - b);
  return `<p class="cr-note">Lo que el Cronista ha contado hasta ahora. Cada jefe de década que derrotes revela un capítulo.</p>
    <div class="cron-grid">${levels.map((lv, i)=>{
      const open = beaten >= lv/10;
      return open
        ? `<button class="cron-card" data-cron="${lv}"><div class="cron-img" style="background-image:url('src/assets/historia/${lv}_1.jpg?v=2'), url('src/assets/fondos/${lv-9}-${lv}.jpg')"></div><div class="cron-txt"><small>Capítulo ${i+1} · Piso ${lv}</small><b>${STORY_SCENES[lv].title}</b></div></button>`
        : `<div class="cron-card locked"><div class="cron-img"><span>🔒</span></div><div class="cron-txt"><small>Capítulo ${i+1}</small><b>Derrota al jefe del piso ${lv}</b></div></div>`;
    }).join('')}</div>`;
}

// ---------- Bestiario (pedido explícito 2026-10-07) ----------
// Cada criatura se revela al derrotarla. Lo ya visto se guarda en
// characters.bestiary (migración 0036); mientras esa columna no exista, en
// este navegador. Las décadas cuyo jefe ya cayó se dan por vistas enteras:
// antes de existir el bestiario no se anotaba a quién se vencía.
function loadLocalBestiary(charId){
  try{ return JSON.parse(localStorage.getItem('ds_bestiary_' + charId) || '[]'); }catch(e){ return []; }
}
function recordBestiaryKills(enemies){
  if(simMode || !state.char) return;
  const seen = new Set(state.char.bestiary || []);
  const before = seen.size;
  (enemies||[]).forEach(e=>{ if(e && e.tpl && e.tpl.id && !e.summoned && !e.tpl.decoy) seen.add(e.tpl.id); });
  if(seen.size === before) return;
  state.char.bestiary = Array.from(seen);
  if(!state.char.bestiaryColumn){ try{ localStorage.setItem('ds_bestiary_' + state.char.id, JSON.stringify(state.char.bestiary)); }catch(e){} }
}
function bestiaryGroups(decade){
  const uniq = (list)=>{ const ids = new Set(); return (list||[]).filter(t=> t && t.id && !ids.has(t.id) && ids.add(t.id)); };
  const byFloor = decade.guardianByFloor ? Object.entries(decade.guardianByFloor).sort((a, b)=> a[0] - b[0]).map(([f, t])=> Object.assign({}, t, {_floor: +f})) : [];
  return [
    {key:'regular', label:'Criaturas', icon:'🐾', list: uniq(decade.regular)},
    {key:'elite', label:'Élites', icon:'⚔️', list: uniq(decade.elite)},
    {key:'guardian', label:'Guardianes', icon:'🛡️', list: uniq(byFloor.concat(decade.guardians||[]))},
    {key:'boss', label:'Jefe de década', icon:'👑', list: uniq([decade.decadeBoss])},
  ].filter(g=> g.list.length);
}
const RES_WORDS = {fisico:'físico', fuego:'fuego', hielo:'hielo', veneno:'veneno', aturdimiento:'aturdimiento'};
function bestiaryHTML(){
  const seen = new Set(state.char.bestiary || []), beaten = myBossesBeaten();
  let total = 0, found = 0;
  const decadesHTML = DECADE_BESTIARY.map((decade, di)=>{
    const groups = bestiaryGroups(decade);
    if(!groups.length) return '';
    const first = di*10 + 1, cleared = beaten > di;
    let dTotal = 0, dFound = 0;
    const groupsHTML = groups.map(g=>{
      const cards = g.list.map(t=>{
        const open = cleared || seen.has(t.id);
        dTotal++; if(open) dFound++;
        const src = ENEMY_SPRITES[t.id] || '';
        const floorTag = g.key==='guardian' && t._floor ? `Piso ${first - 1 + t._floor}` : g.key==='boss' ? `Piso ${first + 9}` : '';
        if(!open) return `<div class="best-card locked"><div class="best-art">${src ? `<img src="${src}" alt="" loading="lazy">` : '<span>?</span>'}</div><b>???</b><small>${floorTag || 'Sin descubrir'}</small></div>`;
        const res = t.res || {};
        const weak = Object.keys(res).filter(k=> res[k] < 0).map(k=> RES_WORDS[k] || k);
        const strong = Object.keys(res).filter(k=> res[k] >= 20).map(k=> RES_WORDS[k] || k);
        return `<div class="best-card"><div class="best-art">${src ? `<img src="${src}" alt="" loading="lazy">` : `<span>${t.icon||'👾'}</span>`}</div>
          <b>${t.name}</b><small>${floorTag}</small>
          ${weak.length ? `<span class="best-res weak">Débil a ${weak.join(', ')}</span>` : ''}
          ${strong.length ? `<span class="best-res strong">Resiste ${strong.join(', ')}</span>` : ''}</div>`;
      }).join('');
      return `<div class="best-group best-${g.key}"><div class="best-group-head"><span>${g.icon} ${g.label}</span><i></i></div><div class="best-grid">${cards}</div></div>`;
    }).join('');
    total += dTotal; found += dFound;
    return `<section class="best-decade">
      <header style="background-image:linear-gradient(180deg, rgba(14,11,9,0.2), rgba(30,26,22,0.95)), url('src/assets/fondos/${first}-${first+9}.jpg')"><div><small>Pisos ${first}–${first+9}</small><h3>${DECADE_GATE_NAMES[first] || 'Década ' + (di+1)}</h3></div><span class="best-count ${dFound===dTotal?'full':''}">${dFound}/${dTotal}</span></header>
      ${groupsHTML}</section>`;
  }).join('');
  return `<p class="cr-note">Cada criatura se revela cuando la derrotas. Llevas <b>${found}</b> de <b>${total}</b>.</p>${decadesHTML}`;
}

// ---------- Música (pedido explícito 2026-10-07): qué suena en cada lugar ----------
const SOUNDTRACK = [
  {place:'Inicio y ciudad', title:'Passacaglia (clavecín)', from:'G. F. Händel — Suite n.º 7 en sol menor, HWV 432'},
  {place:'Pisos 1–10 · Bosque Goblin', title:'Tema de batalla (Suite sinfónica)', from:'Dragon Quest V — Koichi Sugiyama'},
  {place:'Pisos 11–20 · Nido de Arañas', title:'Forgotten Challenge', from:'Kingdom Hearts Re:Chain of Memories — Yoko Shimomura'},
  {place:'Pisos 21–30 · Tierra de Bestias', title:'最後の闘い (La batalla final) — arreglo', from:'Final Fantasy IV — Nobuo Uematsu'},
  {place:'Pisos 31–40 · Salón del Usurpador', title:'Forgotten Challenge (versión GBA)', from:'Kingdom Hearts: Chain of Memories — Yoko Shimomura'},
  {place:'Pisos 41–50 · Isla Paraíso', title:'Pirate\'s Gigue', from:'Kingdom Hearts — Yoko Shimomura'},
  {place:'Pisos 51–60 · El Mar', title:'戦士と共に (Junto a los guerreros) — Polka', from:''},
  {place:'Jefes de década', title:'A Violent Encounter', from:'Shadow of the Colossus — Kow Otani'},
];
function soundtrackHTML(){
  return `<p class="cr-note">Lo que suena en cada rincón del laberinto.</p>
    <div class="ost-list">${SOUNDTRACK.map(t=>`<div class="ost-row"><span class="ost-note">♪</span><div><small>${t.place}</small><b>${t.title}</b>${t.from ? `<em>${t.from}</em>` : ''}</div></div>`).join('')}</div>
    <p class="ost-thanks">Toda la música pertenece a sus compositores y a quienes tienen sus derechos. Gracias a cada uno de ellos: sin estas piezas el laberinto no sonaría igual.</p>`;
}
function showStoryScenes(level, onDone){
  const story = STORY_SCENES[level];
  if(!story){ onDone(); return; }
  const div = document.createElement('div');
  div.className = 'overlay-msg story-ov';
  document.body.appendChild(div);
  const fallback = `src/assets/fondos/${level-9}-${level}.jpg`;
  let step = 0;
  const draw = ()=>{
    const last = step === story.pages.length-1;
    div.innerHTML = `<div class="story-card">
      <h2 class="cw-title">${story.title}</h2>
      <div class="ws-scene has-art" style="background:#0b0907 url('${fallback}') center/cover">
        <img class="ws-illus" src="src/assets/historia/${level}_${step+1}.jpg?v=2" alt="" onerror="this.remove()">
      </div>
      <div class="ws-dialog">
        <div class="ws-narrator"><div class="ws-portrait"><img src="src/assets/bienvenida/cronista.jpg?v=1" alt="" onerror="this.replaceWith('📜')"></div><b>El Cronista</b></div>
        <p class="ws-text">${story.pages[step]}</p>
        <div class="ws-foot">
          <div class="ws-dots">${story.pages.map((_,i)=>`<i class="${i===step?'on':(i<step?'done':'')}"></i>`).join('')}</div>
          <div class="ws-btns">
            ${step>0 ? '<button class="reset-btn" data-st="prev">‹ Atrás</button>' : ''}
            ${last ? '' : '<button class="reset-btn" data-st="skip">Saltar</button>'}
            <button class="btn-main" data-st="next">${last ? 'Continuar' : 'Continuar ›'}</button>
          </div>
        </div>
      </div>
    </div>`;
    const finish = ()=>{ div.remove(); onDone(); };
    div.querySelectorAll('[data-st]').forEach(b=> b.onclick = ()=>{
      const k = b.dataset.st;
      if(k==='skip' || (k==='next' && last)) return finish();
      step += k==='prev' ? -1 : 1; draw();
    });
  };
  draw();
}
// Jefes que cuentan para títulos: sin la migración 0032 (bosses_beaten y el
// check ampliado de title_choice) solo existen los cuatro primeros — elegir
// uno más alto haría que la base rechazara el guardado.
function myTitleBosses(){ return state.char.bossesColumn ? myBossesBeaten() : Math.min(4, myBossesBeaten()); }
// Ids de los títulos ganados, de menor a mayor.
function earnedTitles(bosses, firstRetornado){
  const out = [];
  for(let k=1; k<RENOWN_TITLES.length; k++){
    if(bosses >= TITLE_BOSSES[k] && (k!==TITLE_FIRST_RETORNADO || firstRetornado)) out.push(k);
  }
  return out;
}
function myEarnedTitles(){ return earnedTitles(myTitleBosses(), !!state.char.firstRetornado); }
function renownTitle(n){ return RENOWN_TITLES[Math.max(0, Math.min(RENOWN_TITLES.length-1, n||0))] || ''; }
function renownBadge(n){
  const t = renownTitle(n);
  return t ? ` <span class="renown-badge renown-${n}" title="Título por jefes de década derrotados">${t}</span>` : '';
}
// Título en uso (pedido explícito 2026-10-04): el jugador elige en la Ficha
// cuál de sus títulos ganados lleva, o ninguno; solo ese se muestra. Sin
// elección (null) se usa el más alto, como antes. Se guarda en
// characters.title_choice (migración 0031) para que lo vean los demás en el
// ranking; si esa columna aún no existe, queda guardado solo en este
// dispositivo. Nunca puede mostrarse un título no ganado: se recorta al
// más alto de los ganados que no pase del elegido.
function titleFromChoice(choice, bosses, firstRetornado){
  const earned = earnedTitles(bosses, firstRetornado);
  const top = earned.length ? earned[earned.length-1] : 0;
  if(choice===null || choice===undefined) return top;
  return earned.filter(k=> k<=choice).pop() || 0;
}
function myTitleN(){
  let choice = state.char.titleChoice;
  if(!state.char.titleColumn){
    const local = lsGet(charKey('title'));
    choice = local===null || local==='' ? null : parseInt(local, 10);
  }
  return titleFromChoice(Number.isFinite(choice) ? choice : null, myTitleBosses(), !!state.char.firstRetornado);
}
function setMyTitle(choice){
  state.char.titleChoice = choice;
  if(!state.char.titleColumn) lsSet(charKey('title'), choice===null ? '' : String(choice));
  save();
  renderAll();
}
function allyCap(){ return BETA_ALLY_UNLOCKS ? Math.min(MAX_ALLIES, myBossesBeaten()) : MAX_ALLIES; }
function tavernUnlocked(){ return state.char.level >= ALLY_MIN_LEVEL && (!BETA_ALLY_UNLOCKS || myBossesBeaten() >= 1); }
function allyHireCost(tpl, charLevel){ return tpl.baseCost + charLevel*tpl.costPerLevel; }

// skill definitions
// Mejoras de habilidad por hito de nivel de personaje (pedido explícito):
// nivel 30 refuerza las 3 habilidades base de cada senda con números más
// fuertes, nivel 60 agrega una 4ta habilidad "ultimate" por senda. Los
// números de la mejora de nivel 30 viven todos acá, en un solo lugar, para
// que la descripción que se ve en combate (SKILLS[...].desc, ahora function)
// y la resolución real (playerUseSkill) lean siempre del mismo valor - así
// nunca hay un texto que diga una cosa y una pelea que haga otra.
const LEVEL_30_MILESTONE = 30;
const LEVEL_60_MILESTONE = 60;
const LEVEL30_SKILL_BONUS = {
  golpe_bruto:      {tambaleoChance: 0.85},                 // era 0.70
  machacar:         {comboBonusMult: 2.1},                  // era 1.8
  grito_guerra:     {healPct: 0.10, allyDmgMult: 1.10},      // nuevo: cura 10% y +10% daño a aliados 2 turnos
  corte_rapido:     {maxStack: 4, duration: 4},              // maxStack era 3, duration era 3
  golpe_gracia:     {perStackMult: 0.32},                    // era 0.25
  marca_cazador:    {duration: 4},                           // era 3
  explosion_arcana: {bonusMult: 0.75, penaltyIfNone: 0.20},  // era 0.60 / 0.30
  golpe_consagrado: {healPct: 0.22},                          // era 0.15
  muro_de_fe:       {reductionPct: 0.35},                     // era 0.25
  escudo_del_juramento: {shieldPct: 0.30},                    // era 0.20
  grito_de_panico:  {applyChance: 0.8},                       // era 0.6
  mirada_de_locura: {applyChance: 0.8},                       // era 0.6
  // 2026-10-02 (pedido explícito): las 6 habilidades que no tenían mejora de
  // nivel 30, aunque el tutorial lo promete para las 3 de cada senda.
  danza_cuchillas:  {perStackMult: 0.20},                     // era 0.15
  disparo_certero:  {ignoreResist: 0.65},                     // era 0.50
  lluvia_flechas:   {bonusVsMarked: 0.35},                    // era 0.25 (sin subir el daño en área)
  bola_fuego:       {applyChance: 1.0},                       // era 0.8
  lanza_hielo:      {duration: 3},                            // era 2
  toque_venenoso:   {maxStack: 4}                             // era 3
};
function skillBonus(skillId, field, base){
  if(!state || !state.char || state.char.level < LEVEL_30_MILESTONE) return base;
  const b = LEVEL30_SKILL_BONUS[skillId];
  return (b && b[field]!==undefined) ? b[field] : base;
}
// Ultimates de nivel 60: una por senda, tapando el hueco que cada kit tenía
// (Guerrero sin AoE, Asesino sin pago final grande, Tirador sin rematador,
// Mago sin nada físico/AoE). Son tan fuertes que están limitadas a
// ULTIMATE_MAX_USES por entrada al laberinto (no por nivel del laberinto -
// ver dónde se resetea/preserva ultimateUses en btn-enter-dungeon y en
// "Continuar al nivel") y a un enfriamiento de ULTIMATE_COOLDOWN_TURNS
// turnos propios tras usarse (ver endPlayerTurn).
const ULTIMATE_BY_STYLE = {pesada:'furia_titan', doblefilo:'vals_sangre', tirador:'disparo_cazador_final', mago:'cataclismo_elemental', paladin:'juicio_divino', hechicero:'grito_del_abismo'};
const ULTIMATE_MAX_USES = 3;
const ULTIMATE_COOLDOWN_TURNS = 5;

const SKILLS = {
  ataque_basico: {
    id:'ataque_basico', name:'Ataque básico', cost:null, dmgType:'fisico', mult:0.55,
    desc: ()=> state && state.char && state.char.style==='tirador'
      ? 'Un golpe simple y confiable. No cuesta recursos. +60% de daño para el Arquero — su golpe más fuerte.'
      : 'Un golpe simple y confiable. No cuesta recursos.',
    targetMode:'front'
  },
  defender: {
    id:'defender', name:'Defenderse', cost:null, utility:'defend',
    desc:'Hasta tu próximo turno: al menos 50% de probabilidad de esquivar cualquier ataque, y si te golpean igual, el daño recibido se reduce a la mitad.', targetMode:'self'
  },
  reposicionar: {
    id:'reposicionar', name:'Reposicionarse', cost:null, utility:'reposition',
    desc:'Cambia entre Frente y Retaguardia. Ocupa tu turno.', targetMode:'self'
  },

  golpe_bruto: {
    id:'golpe_bruto', name:'Golpe bruto', cost:{tipo:'estamina', valor:15}, dmgType:'fisico', mult:1.0,
    requiresPos:'frente', applies:{name:'Tambaleo', chance:0.7, duration:2},
    desc: ()=> `Daño físico. ${Math.round(skillBonus('golpe_bruto','tambaleoChance',0.7)*100)}% de aplicar Tambaleo.`,
    targetMode:'front'
  },
  machacar: {
    id:'machacar', name:'Machacar', cost:{tipo:'estamina', valor:20}, dmgType:'fisico', mult:0.7,
    requiresPos:'frente', consumes:{name:'Tambaleo', bonusMult:1.8, applies:{name:'Aturdido', duration:1}},
    desc: ()=> `Si el objetivo está Tambaleante: lo aturde y hace x${skillBonus('machacar','comboBonusMult',1.8)} de daño.`,
    targetMode:'front'
  },
  grito_guerra: {
    id:'grito_guerra', name:'Grito de guerra', cost:{tipo:'espiritu', valor:10}, utility:'buff_self',
    applySelf:{name:'Furioso', duration:2, dmgMult:1.3, evasionDelta:-10, incomingDmgReduction:0.2},
    desc: ()=> `+30% daño físico y -20% daño recibido durante 2 turnos, a cambio de -10% evasión.` +
      (state && state.char && state.char.level>=LEVEL_30_MILESTONE ? ' Además te cura un 10% de tu vida máxima y da +10% de daño a tus aliados durante 2 turnos.' : ''),
    targetMode:'self'
  },

  corte_rapido: {
    id:'corte_rapido', name:'Corte rápido', cost:{tipo:'estamina', valor:12}, dmgType:'fisico', mult:0.6,
    applies:{name:'Sangrado', chance:0.85, duration:3, stack:true, maxStack:3},
    desc: ()=> `Daño físico. Apila Sangrado (hasta x${skillBonus('corte_rapido','maxStack',3)}) durante ${skillBonus('corte_rapido','duration',3)} turnos.`,
    targetMode:'front'
  },
  danza_cuchillas: {
    id:'danza_cuchillas', name:'Danza de cuchillas', cost:{tipo:'estamina', valor:22}, dmgType:'fisico', mult:0.5, hits:2,
    scalesWithStack:{name:'Sangrado', perStackMult:0.15},
    desc: ()=> `Golpea dos veces. +${Math.round(skillBonus('danza_cuchillas','perStackMult',0.15)*100)}% de daño por cada carga de Sangrado en el objetivo.`, targetMode:'front'
  },
  golpe_gracia: {
    id:'golpe_gracia', name:'Golpe de gracia', cost:{tipo:'estamina', valor:18}, dmgType:'fisico', mult:0.9,
    consumesStackBonus:{name:'Sangrado', perStackMult:0.25},
    desc: ()=> `Consume el Sangrado del objetivo: +${Math.round(skillBonus('golpe_gracia','perStackMult',0.25)*100)}% daño por carga consumida.`,
    targetMode:'front'
  },

  disparo_certero: {
    id:'disparo_certero', name:'Disparo certero', cost:{tipo:'estamina', valor:10}, dmgType:'fisico', mult:0.8,
    ignoreResist:0.5, penaltyIfFrente:0.2,
    desc: ()=> `Ignora ${Math.round(skillBonus('disparo_certero','ignoreResist',0.5)*100)}% de la resistencia física. Menos preciso desde el Frente.`, targetMode:'any'
  },
  marca_cazador: {
    id:'marca_cazador', name:'Marca del cazador', cost:{tipo:'espiritu', valor:20}, utility:'mark',
    applies:{name:'Marcado', chance:1, duration:3},
    desc: ()=> `No hace daño. El objetivo recibe +20% de todo el daño durante ${skillBonus('marca_cazador','duration',3)} turnos.`,
    targetMode:'any'
  },
  lluvia_flechas: {
    // Nerf explícito 2026-09-26: de 20 a 40 MP (era barata para ser daño en
    // área a todos los enemigos vivos).
    id:'lluvia_flechas', name:'Lluvia de flechas', cost:{tipo:'estamina', valor:40}, dmgType:'fisico', mult:0.55,
    bonusVsMarked:0.25,
    // Nerf 2026-10-02 (pedido explícito, "borra a todos en 5 turnos"): ya no
    // pega a TODOS los enemigos vivos — solo a la línea frontal; recién
    // cuando no queda nadie al frente cae sobre la retaguardia (misma regla
    // de línea que playerFrontTargetIndices). Se eligió esto en vez de un
    // enfriamiento para no tener que meter enfriamientos en todas las sendas.
    desc: ()=> `Daño a toda la línea frontal enemiga (si ya no queda nadie al frente, a toda la retaguardia). +${Math.round(skillBonus('lluvia_flechas','bonusVsMarked',0.25)*100)}% contra los Marcados.`, targetMode:'all'
  },

  bola_fuego: {
    id:'bola_fuego', name:'Bola de fuego', cost:{tipo:'estamina', valor:15}, dmgType:'fuego', mult:0.9,
    applies:{name:'Quemadura', chance:0.8, duration:3},
    desc: ()=> `Daño de fuego. ${Math.round(skillBonus('bola_fuego','applyChance',0.8)*100)}% de aplicar Quemadura (daño por turno).`, targetMode:'any'
  },
  lanza_hielo: {
    id:'lanza_hielo', name:'Lanza de hielo', cost:{tipo:'estamina', valor:15}, dmgType:'hielo', mult:0.8,
    applies:{name:'Ralentizado', chance:0.8, duration:2},
    desc: ()=> `Daño de hielo. Aplica Ralentizado (-20% evasión, actúa después) durante ${skillBonus('lanza_hielo','duration',2)} turnos.`, targetMode:'any'
  },
  explosion_arcana: {
    id:'explosion_arcana', name:'Explosión arcana', cost:{tipo:'estamina', valor:25}, dmgType:'arcano', mult:0.75,
    consumesEither:[{name:'Quemadura', bonusMult:0.6},{name:'Ralentizado', bonusMult:0.6}], penaltyIfNone:0.3,
    desc: ()=> `Consume Quemadura o Ralentizado del objetivo para +${Math.round(skillBonus('explosion_arcana','bonusMult',0.6)*100)}% de daño.`,
    targetMode:'any'
  },

  // ---------- Paladín ----------
  golpe_consagrado: {
    id:'golpe_consagrado', name:'Golpe Consagrado', cost:{tipo:'espiritu', valor:12}, dmgType:'fisico', mult:0.85,
    requiresPos:'frente', selfHealPctOfDmg:0.15,
    desc: ()=> `Daño físico. Te cura un ${Math.round(skillBonus('golpe_consagrado','healPct',0.15)*100)}% de lo infligido.`,
    targetMode:'front'
  },
  muro_de_fe: {
    id:'muro_de_fe', name:'Muro de Fe', cost:{tipo:'espiritu', valor:15}, utility:'buff_self',
    applySelf:{name:'Fe Inquebrantable', duration:2, incomingDmgReduction:0.25},
    desc: ()=> `Reduce el daño que recibes un ${Math.round(skillBonus('muro_de_fe','reductionPct',0.25)*100)}% durante 2 turnos.`,
    targetMode:'self'
  },
  escudo_del_juramento: {
    id:'escudo_del_juramento', name:'Escudo del Juramento', cost:{tipo:'espiritu', valor:20}, utility:'shield_self',
    shieldPct:0.20,
    desc: ()=> `Te otorga un escudo equivalente al ${Math.round(skillBonus('escudo_del_juramento','shieldPct',0.20)*100)}% de tu vida máxima.`,
    targetMode:'self'
  },

  // ---------- Hechicero ----------
  toque_venenoso: {
    id:'toque_venenoso', name:'Toque Venenoso', cost:{tipo:'estamina', valor:15}, dmgType:'veneno', mult:0.85,
    applies:{name:'Veneno', chance:0.85, duration:3, stack:true, maxStack:3},
    desc: ()=> `Daño de veneno. Apila Veneno (hasta x${skillBonus('toque_venenoso','maxStack',3)}) durante 3 turnos.`, targetMode:'any'
  },
  grito_de_panico: {
    id:'grito_de_panico', name:'Grito de Pánico', cost:{tipo:'estamina', valor:20}, dmgType:'arcano', mult:0.5,
    applies:{name:'Miedo', chance:0.6, duration:2, procChance:0.4},
    desc: ()=> `Daño arcano menor. ${Math.round(skillBonus('grito_de_panico','applyChance',0.6)*100)}% de aplicar Miedo — cada turno que dure, 40% de que el objetivo pierda su turno.`,
    targetMode:'any'
  },
  mirada_de_locura: {
    id:'mirada_de_locura', name:'Mirada de Locura', cost:{tipo:'estamina', valor:20}, dmgType:'arcano', mult:0.5,
    applies:{name:'Confusion', chance:0.6, duration:2, procChance:0.35},
    desc: ()=> `Daño arcano menor. ${Math.round(skillBonus('mirada_de_locura','applyChance',0.6)*100)}% de aplicar Confusión — cada turno que dure, 35% de que el objetivo ataque a ciegas y falle.`,
    targetMode:'any'
  },

  // ---------- Ultimates (nivel 60) ----------
  furia_titan: {
    id:'furia_titan', name:'Furia del Titán', cost:null, dmgType:'fisico', mult:1.15, ultimate:true,
    requiresPos:'frente', targetMode:'all',
    consumes:{name:'Tambaleo', bonusMult:1.6, applies:{name:'Aturdido', duration:1}},
    desc:'Ultimate del Guerrero. Golpea a todos los enemigos; a los que estén Tambaleantes los aturde y les hace mucho más daño.'
  },
  vals_sangre: {
    id:'vals_sangre', name:'Vals de sangre', cost:null, dmgType:'fisico', mult:0.5, ultimate:true,
    targetMode:'all',
    consumesStackBonus:{name:'Sangrado', perStackMult:0.3},
    selfHealPctOfDmg:0.3,
    desc:'Ultimate del Asesino. Golpea a todos los enemigos consumiendo el Sangrado de cada uno para más daño, y te cura el 30% de lo infligido.'
  },
  disparo_cazador_final: {
    id:'disparo_cazador_final', name:'Disparo del cazador final', cost:null, dmgType:'fisico', mult:1.4, ultimate:true,
    ignoreResist:1.0, bonusVsMarked:0.5, guaranteedCrit:true, targetMode:'any',
    desc:'Ultimate del Arquero. Ignora toda la resistencia física, crítico garantizado, y +50% de daño si el objetivo está Marcado.'
  },
  cataclismo_elemental: {
    id:'cataclismo_elemental', name:'Cataclismo elemental', cost:null, dmgType:'mixto', mult:1.0, ultimate:true,
    targetMode:'all', applies:{name:'Quemadura', chance:1, duration:2},
    desc:'Ultimate del Mago. Fuego y hielo combinados a todos los enemigos, golpeando la resistencia más débil de cada uno entre las dos.'
  },
  juicio_divino: {
    id:'juicio_divino', name:'Juicio Divino', cost:null, dmgType:'fisico', mult:0.8, ultimate:true,
    requiresPos:'frente', targetMode:'all', selfHealPctOfDmg:0.25,
    desc:'Ultimate del Paladín. Golpea a todos los enemigos y te cura el 25% de todo lo infligido.'
  },
  grito_del_abismo: {
    id:'grito_del_abismo', name:'Grito del Abismo', cost:null, dmgType:'arcano', mult:1.2, ultimate:true,
    targetMode:'any', applies:{name:'Paralisis', chance:1, duration:2},
    desc:'Ultimate del Hechicero. Daño arcano fuerte a un objetivo y lo Paraliza por completo durante 2 turnos — garantizado, no depende de probabilidad.'
  }
};

// Tema goblin para los niveles 1-10: arqueros/guerreros/saqueadores/chamanes
// como tropa regular, un Jefe goblin como élite, y Hobgoblin/Gilgoblin como
// guardianes normales — salvo el nivel 10, cuyo guardián es siempre el Ogro
// (ver la selección de plantilla en enterNode()).
// frontline:true = ocupa el puesto de tanque (slot 0, el único que reciben los
// ataques 'front'); los demás (a distancia/soporte) se acomodan detrás.
// Bestiario por década (pisos 1-10, 11-20, ..., 51-60). Cada década define:
// regular (mobs comunes), elite (élite de esa década), guardians (jefes de
// nivel normales, todo nivel que NO cierra la década) y decadeBoss (el jefe
// del nivel que cierra la década: 10, 20, 30...).
function decadeIndexForLevel(level){ return Math.min(DECADE_BESTIARY.length-1, Math.floor((level-1)/10)); }

// Tema visual de fondo por década para la escena de combate (battleStage.js)
// — mismo mapeo que prototype-2d/combat.html: forest (Bosque Goblin/Arañas),
// cave (Riakis/bestias), cult (Usurpador), sea (Isla Paraíso/El Mar).
const DECADE_BG_THEME = ['forest','forest','cave','cult','sea','sea','cult','forest'];

// Plantillas de invocación (2026-10-02). Señuelo: 1 de vida (se fija al
// invocar), no actúa, va al Frente y absorbe el golpe dirigido al frente.
function decoyTpl(id, name, icon){
  return {id, name, icon, hp:0.1, atk:0.1, res:{fisico:0,fuego:0,hielo:0,veneno:0,aturdimiento:0}, frontline:true, decoy:true,
    abilities:{nada:{label:'—', mult:0}}, aiPriority:['nada']};
}
// Resistencias en una línea (décadas 61+): físico, fuego, hielo, veneno, aturdimiento.
function rs(fisico, fuego, hielo, veneno, aturdimiento){ return {fisico, fuego, hielo, veneno, aturdimiento}; }
// Corrupción (Bosque muerto, 71-80): estado acumulable sobre el jugador y sus
// aliados. Por cada carga: +3% al daño que hacen y +4% al que reciben. Dura el
// combate entero. Lo leen statusStackDealtMult / statusStackTakenMult.
const CORRUPCION_STATUS = {name:'Corrupción', duration:99, stack:true, maxStack:10, perStackDmg:0.03, perStackTaken:0.04};
function CORRUPCION(chance){ return Object.assign({chance}, CORRUPCION_STATUS); }
const DECOY_CIERVO = decoyTpl('senuelo_ciervo', 'Copia Falsa', '🦌');
// Invocaciones de las décadas 61-80.
const LARVA_ERRANTE_TPL = {id:'larva_errante', name:'Larva Errante', icon:'🐛', hp:0.3, atk:0.45, res:rs(0,-10,0,10,0), frontline:true,
  abilities:{mordisco_le:{label:'Mordisco', mult:1.0, applies:{name:'Ralentizado', chance:0.15, duration:2}}}, aiPriority:['mordisco_le']};
const REFLEJO_FALLIDO_TPL = {id:'reflejo_fallido', name:'Reflejo Fallido', icon:'🕳️', hp:0.3, atk:0.45, res:rs(0,0,0,0,0), frontline:true, mentalResist:0.5,
  abilities:{golpe_rf:{label:'Golpe', mult:1.0, applies:{name:'Confusion', chance:0.15, duration:1}}}, aiPriority:['golpe_rf']};
const BROTE_MENOR_TPL = {id:'brote_menor', name:'Brote Menor', icon:'🌱', hp:0.3, atk:0.45, res:rs(0,-15,0,15,0), frontline:true,
  abilities:{mordida_bm:{label:'Mordida', mult:1.0, applies:Object.assign({chance:0.20}, CORRUPCION_STATUS)}}, aiPriority:['mordida_bm']};
const DECOY_CLON_SOMBRA = decoyTpl('senuelo_clon', 'Clon de Sombra', '👤');
const DECOY_REPLICA = decoyTpl('senuelo_replica', 'Réplica', '🪞');
const DECOY_DUPLICADO = decoyTpl('senuelo_duplicado', 'Duplicado', '🪞');
// Copias del Usurpador (fase 3): débiles pero sí pelean, y lo protegen al Frente.
const USURPADOR_COPY_TPL = {id:'copia_usurpador', name:'Copia del Usurpador', icon:'🎭', hp:0.1, atk:0.4,
  res:{fisico:10,fuego:10,hielo:10,veneno:10,aturdimiento:10}, frontline:true,
  abilities:{confundir_c:{label:'Confundir', mult:0.6, applies:{name:'Confusion', chance:0.15, duration:2, procChance:0.35}, cooldown:4}, golpe_c:{label:'Golpe', mult:1.0}},
  aiPriority:['confundir_c','golpe_c']};
const GARVEL_SMALL_TPL = {id:'garvel_pequeno', name:'Garvel pequeño', icon:'🦠', hp:0.35, atk:0.5,
  res:{fisico:-10,fuego:0,hielo:-5,veneno:15,aturdimiento:0},
  abilities:{mordida_gp:{label:'Mordida', mult:1.0}}, aiPriority:['mordida_gp']};
const CORROSION_STATUS = {name:'Corrosion', duration:2, resPenalty:15, healMult:0.5};
// Crías de la Matriarca Escarlata y cangrejos del Custodio (fases, 2026-10-02).
const CRIA_ARANA_TPL = {id:'cria_arana', name:'Cría de araña', icon:'🕷️', hp:0.3, atk:0.4, res:{fisico:0,fuego:-10,hielo:0,veneno:30,aturdimiento:0}, frontline:true,
  abilities:{mordida_cria:{label:'Mordida', mult:1.0, applies:{name:'Veneno', chance:0.25, duration:2, stack:true, maxStack:3}}}, aiPriority:['mordida_cria']};
const CANGREJO_ISLA_TPL = {id:'cangrejo_isla', name:'Cangrejo de la Isla', icon:'🦀', hp:0.4, atk:0.4, res:{fisico:20,fuego:0,hielo:0,veneno:10,aturdimiento:10}, frontline:true, immuneRetroceso:true,
  abilities:{pinza_isla:{label:'Pinza', mult:1.0}}, aiPriority:['pinza_isla']};

const DECADE_BESTIARY = [
  // Década 0 — pisos 1-10 — Bosque Goblin
  // Plantilla de roles (2026-09-16, pedido explícito): cada bestiario de
  // década reparte sus 'regular' en 3 arquetipos — melee (cuerpo a cuerpo,
  // frontline, daño físico), ranged (a distancia, daño físico igual, pero
  // sin ocupar el frente) y mago (elemental de verdad: su golpe usa
  // resistencia mágica/elemental del objetivo en vez de la física de
  // siempre — antes NINGÚN enemigo hacía esto, todos pegaban 'atk' físico
  // sin importar el move). El chamán, además, cura a otros enemigos
  // (curar_aliado, nuevo — antes 'curar' solo existía como auto-curación de
  // jefe). Esta década es la plantilla; el resto se replica con el mismo
  // patrón, manteniendo la temática propia de cada una.
  {
    regular: [
      {id:'goblin_arquero', name:'Goblin arquero', icon:'🏹', role:'ranged', hp:0.85, atk:1.1, res:{fisico:-5,fuego:0,hielo:0,veneno:5,aturdimiento:0}, moves:['pegar','robar']},
      {id:'goblin_guerrero', name:'Goblin guerrero', icon:'🗡️', role:'melee', hp:1.15, atk:1.05, res:{fisico:10,fuego:-5,hielo:0,veneno:0,aturdimiento:5}, moves:['pegar'], frontline:true},
      {id:'goblin_saqueador', name:'Goblin saqueador', icon:'🪓', role:'melee', hp:1.0, atk:1.0, res:{fisico:0,fuego:0,hielo:-10,veneno:10,aturdimiento:10}, moves:['pegar','robar'], frontline:true},
      {id:'goblin_chaman', name:'Chamán goblin', icon:'💀', role:'mago', hp:0.85, atk:0.95, res:{fisico:-10,fuego:15,hielo:15,veneno:25,aturdimiento:-10}, moves:['maldicion_venenosa','curar_aliado','debilitar']}
    ],
    elite: [{id:'jefe_goblin', name:'Jefe goblin', icon:'👹', role:'melee', hp:1.9, atk:1.4, res:{fisico:20,fuego:-10,hielo:5,veneno:15,aturdimiento:25}, moves:['pegar','aplastar'], elite:true, frontline:true}],
    guardians: [
      {id:'hobgoblin', name:'Hobgoblin', icon:'🛡️', role:'melee', hp:1.8, atk:1.15, res:{fisico:15,fuego:5,hielo:5,veneno:15,aturdimiento:30}, moves:['pegar','aplastar','debilitar'], boss:true, frontline:true},
      {id:'gilgoblin', name:'Gilgoblin', icon:'🔱', role:'melee', hp:1.7, atk:1.2, res:{fisico:10,fuego:10,hielo:10,veneno:20,aturdimiento:20}, moves:['pegar','aplastar','debilitar'], boss:true, frontline:true}
    ],
    // Fases (2026-10-02): 60% Furia, 30% lanza rocas.
    decadeBoss: {id:'ogro', name:'Ogro', icon:'👺', role:'melee', hp:4.2, atk:1.9, res:{fisico:25,fuego:0,hielo:0,veneno:10,aturdimiento:35}, boss:true, frontline:true,
      phases:[{below:0.6, msg:'ruge y entra en <b>Furia</b> (fase 2).'},{below:0.3, msg:'arranca una roca del suelo: <b>golpes devastadores</b> (fase 3).'}],
      abilities:{
        furia_ogro:{label:'Furia del Ogro', utility:'self_buff', oncePerCombat:true, instant:true, condition:(ctx)=>ctx.selfHpPct<0.6, selfBuff:{name:'Furia del Ogro', duration:99, dmgMult:1.15}},
        lanzar_roca:{label:'Lanzar Roca', mult:1.5, cooldown:3, condition:(ctx)=>ctx.selfHpPct<0.3, applies:{name:'Paralisis', chance:0.30, duration:1}},
        aplastar_o:{label:'Aplastar', mult:1.35, cooldown:3},
        debilitar_o:{label:'Golpe Debilitante', mult:0.7, cooldown:4, applies:{name:'Debilitado', chance:0.6, duration:2}},
        pegar_o:{label:'Garrotazo', mult:1.0}},
      aiPriority:['furia_ogro','lanzar_roca','aplastar_o','debilitar_o','pegar_o']}
  },
  // Década 1 — pisos 11-20 — Arañas (REWORK 2026-09-25, pedido explícito,
  // "Década 2" en la nomenclatura del PDF de diseño — el compendio la sigue
  // llamando Década 1 por índice de array, ver DECADE_BG_THEME/etc.).
  // Primera década en usar el sistema nuevo de IA data-driven (abilities +
  // aiPriority + cooldowns reales) en vez del if-chain de moves — ver
  // resolveNewStyleEnemyMove(). Simplificaciones deliberadas frente al PDF
  // (por tiempo, no por descuido — quedan documentadas acá, no ocultas):
  // - El motor de combate solo tiene UN objetivo posible por turno enemigo
  //   (frontlineTarget()), así que las reglas de "priorizar objetivo con
  //   0-1 cargas de Veneno" no aplican — se conservan los bonos de daño
  //   condicionales (bonusVsOwnStatus) pero no la elección de blanco.
  // - "Doble Picadura" (2 golpes) se aproxima a un solo golpe más fuerte
  //   (mult 1.10 en vez de 2×0.65) — el motor actual no tiene multi-hit
  //   para el sistema nuevo.
  // - Los self-buffs de resistencia plana (Araña de Caparazón, Reina
  //   Devoradora "por cada aliado <40% HP") se aproximan con
  //   incomingDmgReduction/dmgMult genéricos en vez de un stat nuevo.
  // - "Sello de Presa" reusa el estado Marcado existente (+20% de TODO el
  //   daño que reciba, no solo el de esta Matriarca en particular).
  {
    regular: [
      {id:'tarantula_cazadora', name:'Tarántula cazadora', icon:'🕷️', hp:1.05, atk:1.00, res:{fisico:5,fuego:-5,hielo:0,veneno:25,aturdimiento:0}, frontline:true,
        abilities:{
          mordida:{label:'Mordida', mult:1.00},
          picadura_venenosa:{label:'Picadura venenosa', mult:0.85, applies:{name:'Veneno', chance:0.25, duration:3, stack:true, maxStack:3}, cooldown:3},
          acecho:{label:'Acecho', mult:1.38, cooldown:4, condition:(ctx)=>ctx.targetHpPct>0.7},
        },
        aiPriority:['acecho','picadura_venenosa','mordida']},
      {id:'tarantula_saltarina', name:'Tarántula saltarina', icon:'🕷️', hp:0.85, atk:1.10, res:{fisico:0,fuego:-10,hielo:0,veneno:25,aturdimiento:0}, frontline:true,
        abilities:{
          mordida_veloz:{label:'Mordida veloz', mult:1.00},
          salto_paralizante:{label:'Salto paralizante', mult:0.75, applies:{name:'Paralisis', chance:0.22, duration:1}, cooldown:3, selfBuff:{name:'Instinto Cazador', duration:2, dmgMult:1.15}},
          picadura_rapida:{label:'Picadura rápida', mult:0.80, applies:{name:'Veneno', chance:0.15, duration:3, stack:true, maxStack:3}, cooldown:2},
        },
        aiPriority:['salto_paralizante','picadura_rapida','mordida_veloz']},
      {id:'tarantula_tejedora', name:'Tarántula tejedora', icon:'🕸️', hp:0.85, atk:0.90, res:{fisico:-5,fuego:-10,hielo:10,veneno:30,aturdimiento:0},
        abilities:{
          mordida_tejedora:{label:'Mordida', mult:1.00},
          telarana_inmovilizante:{label:'Telaraña inmovilizante', mult:0.50, applies:{name:'Paralisis', chance:0.20, duration:1}, cooldown:3},
          picadura_debilitante:{label:'Picadura debilitante', mult:0.70, applies:{name:'Debilitado', chance:0.20, duration:2}, cooldown:3, condition:(ctx)=>ctx.targetStatuses.length===0},
        },
        aiPriority:['picadura_debilitante','telarana_inmovilizante','mordida_tejedora']},
      {id:'viuda_venenosa', name:'Viuda venenosa', icon:'🕸️', hp:0.70, atk:0.95, res:{fisico:-10,fuego:-10,hielo:5,veneno:40,aturdimiento:0},
        abilities:{
          mordida_toxica:{label:'Mordida tóxica', mult:1.00, applies:{name:'Veneno', chance:0.15, duration:3, stack:true, maxStack:3}},
          veneno_concentrado:{label:'Veneno concentrado', mult:0.65, applies:{name:'Veneno', chance:0.35, duration:3, stack:true, maxStack:3}, cooldown:3},
          aguijon_paralizante:{label:'Aguijón paralizante', mult:0.70, applies:{name:'Paralisis', chance:0.15, duration:1}, cooldown:4},
        },
        bonusVsOwnStatus:{name:'Veneno', minStacks:2, mult:1.15},
        aiPriority:['veneno_concentrado','aguijon_paralizante','mordida_toxica']},
    ],
    // Acompañante de élite: la Matriarca Telaraña ya no pelea sola — trae 1
    // araña normal sorteada por peso (ver eliteCompanions/pickWeighted en enterNode).
    eliteCompanions:[
      {tpl:{id:'tarantula_cazadora', name:'Tarántula cazadora', icon:'🕷️', hp:1.05, atk:1.00, res:{fisico:5,fuego:-5,hielo:0,veneno:25,aturdimiento:0}, frontline:true,
        abilities:{mordida:{label:'Mordida', mult:1.00}, picadura_venenosa:{label:'Picadura venenosa', mult:0.85, applies:{name:'Veneno', chance:0.25, duration:3, stack:true, maxStack:3}, cooldown:3}, acecho:{label:'Acecho', mult:1.38, cooldown:4, condition:(ctx)=>ctx.targetHpPct>0.7}},
        aiPriority:['acecho','picadura_venenosa','mordida']}, weight:0.5},
      {tpl:{id:'tarantula_tejedora', name:'Tarántula tejedora', icon:'🕸️', hp:0.85, atk:0.90, res:{fisico:-5,fuego:-10,hielo:10,veneno:30,aturdimiento:0},
        abilities:{mordida_tejedora:{label:'Mordida', mult:1.00}, telarana_inmovilizante:{label:'Telaraña inmovilizante', mult:0.50, applies:{name:'Paralisis', chance:0.20, duration:1}, cooldown:3}, picadura_debilitante:{label:'Picadura debilitante', mult:0.70, applies:{name:'Debilitado', chance:0.20, duration:2}, cooldown:3, condition:(ctx)=>ctx.targetStatuses.length===0}},
        aiPriority:['picadura_debilitante','telarana_inmovilizante','mordida_tejedora']}, weight:0.3},
      {tpl:{id:'tarantula_saltarina', name:'Tarántula saltarina', icon:'🕷️', hp:0.85, atk:1.10, res:{fisico:0,fuego:-10,hielo:0,veneno:25,aturdimiento:0}, frontline:true,
        abilities:{mordida_veloz:{label:'Mordida veloz', mult:1.00}, salto_paralizante:{label:'Salto paralizante', mult:0.75, applies:{name:'Paralisis', chance:0.22, duration:1}, cooldown:3, selfBuff:{name:'Instinto Cazador', duration:2, dmgMult:1.15}}, picadura_rapida:{label:'Picadura rápida', mult:0.80, applies:{name:'Veneno', chance:0.15, duration:3, stack:true, maxStack:3}, cooldown:2}},
        aiPriority:['salto_paralizante','picadura_rapida','mordida_veloz']}, weight:0.2},
    ],
    elite: [{id:'matriarca_telaranha', name:'Matriarca telaraña', icon:'🕷️', hp:1.80, atk:1.25, res:{fisico:10,fuego:-15,hielo:5,veneno:35,aturdimiento:0}, elite:true, frontline:true,
      abilities:{
        mordida_matriarca:{label:'Mordida de Matriarca', mult:1.10},
        gran_telarana:{label:'Gran Telaraña', mult:0.70, applies:{name:'Paralisis', chance:0.30, duration:1}, cooldown:3},
        aguijon_dominante:{label:'Aguijón dominante', mult:1.00, applies:{name:'Veneno', chance:0.20, duration:3, stack:true, maxStack:3}, cooldown:3, bonusVsTargetStatus:{name:'Paralisis', mult:1.25}},
        orden_colmena:{label:'Orden de la Colmena', utility:'buff_companion', buffCompanion:{name:'Enardecido', duration:3, dmgMult:1.15}, cooldown:5},
      },
      passiveWhileCompanionAlive:{reduccion:0.10},
      aiPriority:['orden_colmena','gran_telarana','aguijon_dominante','mordida_matriarca']}],
    // Guardián único y determinista por piso (11 a 19) — ver guardianByFloor
    // en enterNode(). `guardians` (pool viejo, al azar) se deja vacío: ya no
    // se usa para esta década, pero otras décadas todavía lo necesitan.
    guardians: [],
    guardianByFloor: {
      1: {id:'reina_telaranha', name:'Reina telaraña', icon:'👑', hp:2.70, atk:1.25, res:{fisico:10,fuego:-10,hielo:10,veneno:30,aturdimiento:10}, boss:true, frontline:true,
        abilities:{
          mordida_real:{label:'Mordida Real', mult:1.10},
          gran_telarana_r:{label:'Gran Telaraña', mult:0.75, applies:{name:'Paralisis', chance:0.30, duration:1}, cooldown:3},
          seda_protectora:{label:'Seda Protectora', utility:'self_buff', selfBuff:{name:'Seda Protectora', duration:3, incomingDmgReduction:0.15}, cooldown:4},
        },
        hpThresholdBuff:{threshold:0.5, buff:{name:'Furia de Reina', duration:3, dmgMult:1.10}},
        aiPriority:['gran_telarana_r','seda_protectora','mordida_real']},
      2: {id:'viuda_alfa', name:'Viuda Alfa', icon:'🕸️', hp:2.85, atk:1.28, res:{fisico:-10,fuego:-5,hielo:5,veneno:45,aturdimiento:5}, boss:true, frontline:true,
        abilities:{
          mordida_alfa:{label:'Mordida Alfa', mult:1.05},
          veneno_real:{label:'Veneno Real', mult:0.70, applies:{name:'Veneno', chance:0.40, duration:3, stack:true, maxStack:3}, cooldown:3},
          aguijon_paralizante_a:{label:'Aguijón Paralizante', mult:0.80, applies:{name:'Paralisis', chance:0.20, duration:1}, cooldown:4},
        },
        bonusVsOwnStatus:{name:'Veneno', minStacks:2, mult:1.15},
        aiPriority:['veneno_real','aguijon_paralizante_a','mordida_alfa']},
      3: {id:'saltadora_alfa', name:'Saltadora Alfa', icon:'🕷️', hp:2.75, atk:1.32, res:{fisico:0,fuego:-10,hielo:10,veneno:25,aturdimiento:0}, boss:true, frontline:true,
        abilities:{
          mordida_veloz_a:{label:'Mordida Veloz', mult:1.05},
          salto_paralizante_a:{label:'Salto Paralizante', mult:0.90, applies:{name:'Paralisis', chance:0.25, duration:1}, cooldown:3, selfBuff:{name:'Instinto Cazador', duration:2, dmgMult:1.15}},
          salto_depredador:{label:'Salto Depredador', mult:1.30, cooldown:4, condition:(ctx)=>ctx.targetStatusCount('Paralisis')>=1},
        },
        aiPriority:['salto_depredador','salto_paralizante_a','mordida_veloz_a']},
      4: {id:'gran_tejedora', name:'Gran Tejedora', icon:'🕸️', hp:3.00, atk:1.20, res:{fisico:10,fuego:-10,hielo:15,veneno:35,aturdimiento:5}, boss:true, frontline:true,
        abilities:{
          mordida_gt:{label:'Mordida', mult:1.00},
          red_acero:{label:'Red de Acero', mult:0.60, applies:{name:'Paralisis', chance:0.30, duration:1}, cooldown:3},
          debilitar_presa:{label:'Debilitar Presa', mult:0.80, applies:{name:'Debilitado', chance:0.25, duration:2}, cooldown:3},
          caparazon_seda:{label:'Caparazón de Seda', utility:'self_buff', selfBuff:{name:'Caparazón de Seda', duration:3, incomingDmgReduction:0.15}, cooldown:5},
        },
        aiPriority:['caparazon_seda','red_acero','debilitar_presa','mordida_gt']},
      5: {id:'devoradora_nido', name:'Devoradora de nido', icon:'🕷️', hp:3.20, atk:1.28, res:{fisico:20,fuego:-5,hielo:5,veneno:40,aturdimiento:10}, boss:true, frontline:true,
        abilities:{
          mandibula_brutal:{label:'Mandíbula Brutal', mult:1.25},
          picadura_voraz:{label:'Picadura Voraz', mult:0.95, applies:{name:'Veneno', chance:0.25, duration:3, stack:true, maxStack:3}, cooldown:3},
          golpe_brutal_dn:{label:'Golpe Brutal', mult:1.45, cooldown:4},
        },
        hpThresholdBuff:{threshold:0.4, buff:{name:'Frenesí Voraz', duration:3, dmgMult:1.15}},
        aiPriority:['golpe_brutal_dn','picadura_voraz','mandibula_brutal']},
      // Física bajada de 35 a 18 (2026-09-26, pedido explícito): ningún
      // guardián de piso puede resistir más golpe físico que el propio jefe
      // de década (Matriarca escarlata, 20) — antes lo superaba por 15 puntos.
      6: {id:'arana_caparazon', name:'Araña de Caparazón', icon:'🕷️', hp:3.50, atk:1.15, res:{fisico:18,fuego:0,hielo:10,veneno:20,aturdimiento:30}, boss:true, frontline:true,
        abilities:{
          golpe_patas:{label:'Golpe de Patas', mult:1.00},
          caparazon_endurecido:{label:'Caparazón Endurecido', utility:'self_buff', selfBuff:{name:'Caparazón Endurecido', duration:3, incomingDmgReduction:0.30}, cooldown:5},
          empuje:{label:'Empuje', mult:1.10, applies:{name:'Paralisis', chance:0.15, duration:1}, cooldown:3},
        },
        // Simplificado: "+10 Res Física y Aturdimiento" del PDF se aproxima
        // con reducción de daño genérica (ver nota al inicio de la década).
        hpThresholdBuff:{threshold:0.5, buff:{name:'Instinto de Supervivencia', duration:3, incomingDmgReduction:0.08}},
        aiPriority:['caparazon_endurecido','empuje','golpe_patas']},
      7: {id:'viuda_carmesi', name:'Viuda Carmesí', icon:'🕸️', hp:3.10, atk:1.32, res:{fisico:15,fuego:-10,hielo:5,veneno:50,aturdimiento:5}, boss:true, frontline:true,
        abilities:{
          mordida_carmesi:{label:'Mordida Carmesí', mult:1.10, applies:{name:'Veneno', chance:0.15, duration:3, stack:true, maxStack:3}},
          sangre_venenosa:{label:'Sangre Venenosa', mult:0.85, applies:{name:'Veneno', chance:0.35, duration:3, stack:true, maxStack:3}, cooldown:3},
          picadura_mortal:{label:'Picadura Mortal', mult:1.10, applies:{name:'Paralisis', chance:0.15, duration:1}, cooldown:4},
        },
        bonusVsOwnStatus:{name:'Veneno', minStacks:1, mult:1.30},
        aiPriority:['picadura_mortal','sangre_venenosa','mordida_carmesi']},
      8: {id:'matriarca_abisal', name:'Matriarca Abisal', icon:'🕷️', hp:3.35, atk:1.25, res:{fisico:15,fuego:0,hielo:15,veneno:45,aturdimiento:15}, boss:true, frontline:true,
        abilities:{
          mordida_profunda:{label:'Mordida Profunda', mult:1.15},
          telarana_abisal:{label:'Telaraña Abisal', mult:0.70, applies:{name:'Paralisis', chance:0.35, duration:1}, cooldown:3},
          // Simplificado: reusa Marcado (+20% de TODO el daño, no solo el propio).
          sello_presa:{label:'Sello de Presa', mult:0.85, applies:{name:'Marcado', incomingDmgMult:1.15, chance:1, duration:3}, cooldown:4},
        },
        aiPriority:['sello_presa','telarana_abisal','mordida_profunda']},
      9: {id:'reina_devoradora', name:'Reina Devoradora', icon:'🕷️', hp:3.70, atk:1.35, res:{fisico:25,fuego:-10,hielo:5,veneno:55,aturdimiento:15}, boss:true, frontline:true,
        abilities:{
          mandibula_devastadora:{label:'Mandíbula Devastadora', mult:1.20},
          // Simplificado: "Doble Picadura" (2×0.65) se aproxima a 1 golpe
          // más fuerte — el motor nuevo no tiene multi-hit todavía.
          doble_picadura:{label:'Doble Picadura', mult:1.10, applies:{name:'Veneno', chance:0.15, duration:3, stack:true, maxStack:3}, cooldown:4},
          telarana_mortal:{label:'Telaraña Mortal', mult:0.80, applies:{name:'Paralisis', chance:0.30, duration:1}, cooldown:4},
        },
        // Simplificado: "por cada aliado <40% HP" se aproxima a un umbral
        // de vida propia (ver nota al inicio de la década).
        hpThresholdBuff:{threshold:0.5, buff:{name:'Furia de Colmena', duration:3, dmgMult:1.15}},
        aiPriority:['mandibula_devastadora','telarana_mortal','doble_picadura']},
    },
    decadeBoss: {id:'matriarca_escarlata', name:'Matriarca escarlata', icon:'🕷️', hp:4.2, atk:1.5, res:{fisico:20,fuego:-15,hielo:10,veneno:45,aturdimiento:10}, boss:true, frontline:true,
      phases:[{below:0.6, msg:'chilla y su <b>nido</b> despierta: veneno y crías (fase 2).'},{below:0.3, msg:'entra en <b>frenesí</b>: golpes brutales (fase 3).'}],
      abilities:{
        frenesi_matriarca:{label:'Frenesí', utility:'self_buff', oncePerCombat:true, instant:true, condition:(ctx)=>ctx.selfHpPct<0.3, selfBuff:{name:'Frenesí', duration:99, dmgMult:1.20}},
        crias_nido:{label:'Llamado del Nido', utility:'summon', cooldown:5, condition:(ctx)=>ctx.selfHpPct<0.6, summon:{tpl:CRIA_ARANA_TPL, count:2, maxAlive:2, hpPct:0.04, atkPct:0.30}},
        mordida_final:{label:'Mordida', mult:1.00},
        paralisis_matriarca:{label:'Parálisis', mult:0.90, applies:{name:'Paralisis', chance:0.30, duration:1}, cooldown:3},
        // Fase 2 (<60% HP): presión de Veneno.
        veneno_matriarca:{label:'Veneno Corrosivo', mult:0.85, applies:{name:'Veneno', chance:0.50, duration:3, stack:true, maxStack:3}, cooldown:3, condition:(ctx)=>ctx.selfHpPct<0.6},
        // Fase 3 (<30% HP): cadencia agresiva.
        golpe_brutal_final:{label:'Golpe Brutal', mult:1.40, cooldown:4, condition:(ctx)=>ctx.selfHpPct<0.3},
      },
      aiPriority:['frenesi_matriarca','crias_nido','golpe_brutal_final','veneno_matriarca','paralisis_matriarca','mordida_final']}
  },
  // Década 2 — pisos 21-30 — Bestias (REWORK 2026-09-25, pedido explícito,
  // PDF "Rework Decada 3: Bestias" — el compendio la sigue llamando Década 2
  // por índice de array). Sangrado es la identidad (ya existía como estado,
  // ver applies:{name:'Sangrado', stack:true, maxStack:3}). Segunda década en
  // usar el motor nuevo (abilities+aiPriority). Simplificaciones deliberadas
  // frente al PDF: "Aullido de Dominio" (el Alfa sube el ATQ del OTRO élite)
  // se aproxima a un autobuff propio — los 2 élites de un encuentro se
  // sortean al azar del mismo pool, sin companionRef entre ellos, así que no
  // hay a quién apuntar el buff. "Piel Densa"/pasivas de reducción constante
  // se aproximan con una habilidad de auto-buff (utility:'self_buff') que se
  // recasta por cooldown en vez de estar siempre activa.
  {
    regular: [
      {id:'loba_acantilado', name:'Loba de Acantilado', icon:'🐺', hp:1.00, atk:1.05, res:{fisico:10,fuego:0,hielo:5,veneno:0,aturdimiento:0}, frontline:true,
        abilities:{
          mordida:{label:'Mordida', mult:1.00, applies:{name:'Sangrado', chance:0.10, duration:2, stack:true, maxStack:3}},
          desgarro:{label:'Desgarro', mult:0.80, applies:{name:'Sangrado', chance:0.30, duration:3, stack:true, maxStack:3}, cooldown:3},
          carrera_depredadora:{label:'Carrera Depredadora', mult:1.15, cooldown:4, condition:(ctx)=>ctx.targetStatusCount('Sangrado')>=1, bonusVsTargetStatus:{name:'Sangrado', mult:1.20}},
        },
        aiPriority:['desgarro','carrera_depredadora','mordida']},
      {id:'oso_cuevas', name:'Oso de las Cuevas', icon:'🐻', hp:1.25, atk:1.10, res:{fisico:20,fuego:0,hielo:5,veneno:0,aturdimiento:10}, frontline:true,
        abilities:{
          zarpazo:{label:'Zarpazo', mult:1.00, applies:{name:'Sangrado', chance:0.10, duration:2, stack:true, maxStack:3}},
          garra_profunda:{label:'Garra Profunda', mult:1.15, applies:{name:'Sangrado', chance:0.30, duration:3, stack:true, maxStack:3}, cooldown:3},
          golpe_brutal_oso:{label:'Golpe Brutal', mult:1.35, cooldown:4, condition:(ctx)=>ctx.targetStatusCount('Sangrado')>=1, bonusVsTargetStatus:{name:'Sangrado', mult:1.20}},
        },
        aiPriority:['garra_profunda','golpe_brutal_oso','zarpazo']},
      {id:'buitre_corrupto', name:'Buitre Corrupto', icon:'🦅', hp:0.80, atk:0.95, res:{fisico:-5,fuego:0,hielo:0,veneno:15,aturdimiento:0},
        abilities:{
          picotazo:{label:'Picotazo', mult:1.00, applies:{name:'Sangrado', chance:0.10, duration:2, stack:true, maxStack:3}},
          garra_desgarradora:{label:'Garra Desgarradora', mult:0.75, applies:{name:'Sangrado', chance:0.25, duration:3, stack:true, maxStack:3}, cooldown:3},
          cegar_buitre:{label:'Cegar', mult:0.50, applies:{name:'Ceguera', chance:0.20, duration:2}, cooldown:4, condition:(ctx)=>ctx.targetStatusCount('Ceguera')===0},
        },
        aiPriority:['cegar_buitre','garra_desgarradora','picotazo']},
      {id:'lince_sombrio', name:'Lince Sombrío', icon:'🐈‍⬛', hp:0.85, atk:1.15, res:{fisico:5,fuego:0,hielo:0,veneno:0,aturdimiento:5},
        abilities:{
          zarpazo_lince:{label:'Zarpazo', mult:1.00, applies:{name:'Sangrado', chance:0.15, duration:2, stack:true, maxStack:3}},
          corte_garganta:{label:'Corte de Garganta', mult:0.85, applies:{name:'Sangrado', chance:0.30, duration:3, stack:true, maxStack:3}, cooldown:3, bonusVsLowHp:{below:0.5, mult:1.20}},
          atemorizar_lince:{label:'Atemorizar', mult:0.60, applies:{name:'Miedo', chance:0.20, duration:2}, cooldown:5},
        },
        aiPriority:['corte_garganta','atemorizar_lince','zarpazo_lince']},
    ],
    elite: [
      {id:'alfa_manada', reductionWithAllies:{min:1, value:0.10}, name:'Alfa de la Manada', icon:'🐺', hp:1.85, atk:1.28, res:{fisico:15,fuego:0,hielo:5,veneno:0,aturdimiento:5}, elite:true, frontline:true,
        abilities:{
          mordida_alfa:{label:'Mordida Alfa', mult:1.05, applies:{name:'Sangrado', chance:0.15, duration:2, stack:true, maxStack:3}},
          desgarro_alfa:{label:'Desgarro Alfa', mult:1.05, applies:{name:'Sangrado', chance:0.35, duration:3, stack:true, maxStack:3}, cooldown:3},
          frenesi_manada:{label:'Frenesí de Manada', mult:1.30, cooldown:4, condition:(ctx)=>ctx.targetStatusCount('Sangrado')>=1, bonusVsTargetStatus:{name:'Sangrado', mult:1.25}},
          aullido_dominio:{label:'Aullido de Dominio', utility:'buff_allies', cooldown:5, buffAllies:{name:'Fortalecido', duration:2, stacks:5}},
        },
        aiPriority:['aullido_dominio','desgarro_alfa','frenesi_manada','mordida_alfa']},
    ],
    guardians: [],
    // Guardián único y determinista por piso (21 a 29) — mismo patrón que
    // Arañas (guardianByFloor en enterNode(), f%10).
    guardianByFloor: {
      1: {id:'gran_lobo_hoja', name:'Gran Lobo de Hoja', icon:'🐺', hp:2.80, atk:1.25, res:{fisico:15,fuego:0,hielo:5,veneno:5,aturdimiento:5}, boss:true, frontline:true,
        abilities:{
          mordida_g21:{label:'Mordida', mult:1.10, applies:{name:'Sangrado', chance:0.15, duration:2, stack:true, maxStack:3}},
          desgarro_g21:{label:'Desgarro', mult:0.95, applies:{name:'Sangrado', chance:0.35, duration:3, stack:true, maxStack:3}, cooldown:3},
          carga_salvaje_g21:{label:'Carga Salvaje', mult:1.25, cooldown:4},
        },
        bonusVsOwnStatus:{name:'Sangrado', minStacks:1, mult:1.15},
        aiPriority:['desgarro_g21','carga_salvaje_g21','mordida_g21']},
      2: {id:'oso_roca_lunar', name:'Oso Roca Lunar', icon:'🐻', hp:3.10, atk:1.20, res:{fisico:30,fuego:0,hielo:10,veneno:5,aturdimiento:15}, boss:true, frontline:true,
        abilities:{
          zarpazo_g22:{label:'Zarpazo', mult:1.10, applies:{name:'Sangrado', chance:0.20, duration:2, stack:true, maxStack:3}},
          garra_pesada_g22:{label:'Garra Pesada', mult:1.25, applies:{name:'Sangrado', chance:0.30, duration:3, stack:true, maxStack:3}, cooldown:3},
          aplastamiento_g22:{label:'Aplastamiento', mult:1.40, cooldown:4},
          piel_densa:{label:'Piel Densa', utility:'self_buff', selfBuff:{name:'Piel Densa', duration:4, incomingDmgReduction:0.10}, cooldown:5},
        },
        aiPriority:['piel_densa','garra_pesada_g22','aplastamiento_g22','zarpazo_g22']},
      3: {id:'halcon_guerra', name:'Halcón de Guerra', icon:'🦅', hp:2.60, atk:1.30, res:{fisico:0,fuego:0,hielo:10,veneno:5,aturdimiento:5}, boss:true,
        abilities:{
          garra_g23:{label:'Garra', mult:1.00, applies:{name:'Sangrado', chance:0.10, duration:2, stack:true, maxStack:3}},
          picado_g23:{label:'Picado', mult:1.30, applies:{name:'Sangrado', chance:0.20, duration:2, stack:true, maxStack:3}, cooldown:3, selfBuff:{name:'Tras Picado', duration:1, evasionDelta:15}},
          corte_ala:{label:'Corte de Ala', mult:0.80, applies:{name:'Sangrado', chance:0.35, duration:3, stack:true, maxStack:3}, cooldown:3},
        },
        aiPriority:['picado_g23','corte_ala','garra_g23']},
      4: {id:'tigre_sable', name:'Tigre Sable', icon:'🐅', hp:2.75, atk:1.30, res:{fisico:10,fuego:0,hielo:0,veneno:5,aturdimiento:5}, boss:true, frontline:true,
        abilities:{
          garra_g24:{label:'Garra', mult:1.05, applies:{name:'Sangrado', chance:0.15, duration:2, stack:true, maxStack:3}},
          presa_g24:{label:'Presa', mult:0.90, applies:{name:'Sangrado', chance:0.35, duration:3, stack:true, maxStack:3}, cooldown:3},
          salto_mortal_g24:{label:'Salto Mortal', mult:1.40, cooldown:4, condition:(ctx)=>ctx.targetHpPct<0.5},
        },
        bonusVsOwnStatus:{name:'Sangrado', minStacks:1, mult:1.15},
        aiPriority:['salto_mortal_g24','presa_g24','garra_g24']},
      5: {id:'jabali_hierro', name:'Jabalí de Hierro', icon:'🐗', hp:3.25, atk:1.28, res:{fisico:25,fuego:0,hielo:0,veneno:5,aturdimiento:15}, boss:true, frontline:true,
        abilities:{
          embestida_g25:{label:'Embestida', mult:1.15, applies:{name:'Sangrado', chance:0.20, duration:2, stack:true, maxStack:3}},
          colmillos_g25:{label:'Colmillos', mult:0.90, applies:{name:'Sangrado', chance:0.30, duration:3, stack:true, maxStack:3}, cooldown:3},
          carga_brutal_g25:{label:'Carga Brutal', mult:1.35, cooldown:4},
        },
        aiPriority:['carga_brutal_g25','colmillos_g25','embestida_g25']},
      6: {id:'lobo_quimera', name:'Lobo Quimera', icon:'🐺', hp:3.00, atk:1.35, res:{fisico:15,fuego:0,hielo:5,veneno:20,aturdimiento:10}, boss:true, frontline:true,
        abilities:{
          mordida_quimera:{label:'Mordida Quimera', mult:1.10, applies:{name:'Sangrado', chance:0.20, duration:2, stack:true, maxStack:3}},
          aullido_salvaje:{label:'Aullido Salvaje', mult:0.75, applies:{name:'Miedo', chance:0.25, duration:2}, cooldown:4},
          desgarro_quimerico:{label:'Desgarro Quimérico', mult:1.20, applies:{name:'Sangrado', chance:0.35, duration:3, stack:true, maxStack:3}, cooldown:3},
        },
        bonusVsOwnStatus:{name:'Sangrado', minStacks:1, mult:1.15},
        aiPriority:['aullido_salvaje','desgarro_quimerico','mordida_quimera']},
      7: {id:'oso_acorazado', name:'Oso Acorazado', icon:'🐻', hp:3.55, atk:1.20, res:{fisico:40,fuego:0,hielo:10,veneno:20,aturdimiento:30}, boss:true, frontline:true,
        abilities:{
          golpe_g27:{label:'Golpe', mult:1.00},
          garra_blindada:{label:'Garra Blindada', mult:1.15, applies:{name:'Sangrado', chance:0.30, duration:3, stack:true, maxStack:3}, cooldown:3},
          carga_g27:{label:'Carga', mult:1.30, cooldown:4},
          coraza:{label:'Coraza', utility:'self_buff', selfBuff:{name:'Coraza', duration:4, incomingDmgReduction:0.15}, cooldown:5},
        },
        aiPriority:['coraza','garra_blindada','carga_g27','golpe_g27']},
      8: {id:'bestia_carmesi', name:'Bestia Carmesí', icon:'🩸', hp:3.25, atk:1.40, res:{fisico:20,fuego:0,hielo:5,veneno:25,aturdimiento:10}, boss:true, frontline:true,
        abilities:{
          mordida_g28:{label:'Mordida', mult:1.10, applies:{name:'Sangrado', chance:0.20, duration:2, stack:true, maxStack:3}},
          doble_garra:{label:'Doble Garra', mult:1.20, applies:{name:'Sangrado', chance:0.35, duration:3, stack:true, maxStack:3}, cooldown:3},
          frenesi_carmesi:{label:'Frenesí Carmesí', mult:1.35, cooldown:4, condition:(ctx)=>ctx.targetStatusCount('Sangrado')>=2, bonusVsTargetStatus:{name:'Sangrado', minStacks:2, mult:1.30}},
        },
        aiPriority:['doble_garra','frenesi_carmesi','mordida_g28']},
      9: {id:'rey_manada', name:'Rey de la Manada', icon:'👑', hp:3.75, atk:1.40, res:{fisico:25,fuego:0,hielo:5,veneno:35,aturdimiento:15}, boss:true, frontline:true,
        abilities:{
          mordida_real:{label:'Mordida Real', mult:1.15, applies:{name:'Sangrado', chance:0.20, duration:2, stack:true, maxStack:3}},
          aullido_rey:{label:'Aullido del Rey', mult:0.60, applies:{name:'Miedo', chance:0.15, duration:2}, cooldown:5, buffAllies:{name:'Fortalecido', duration:2, stacks:3}},
          desgarro_real:{label:'Desgarro Real', mult:1.25, applies:{name:'Sangrado', chance:0.35, duration:3, stack:true, maxStack:3}, cooldown:3},
          frenesi_alfa:{label:'Frenesí del Alfa', mult:1.30, cooldown:4, condition:(ctx)=>ctx.targetHpPct<0.4},
        },
        aiPriority:['aullido_rey','desgarro_real','frenesi_alfa','mordida_real']},
    },
    // Riakis: su "escudo de corrupción" resiste casi todo el daño mundano
    // (físico/veneno/aturdimiento) pero es vulnerable a fuego/hielo — el hueco
    // que un Canalizador puede explotar hoy. Intacto por pedido explícito del
    // PDF ("Riakis no se reequilibra").
    // Fases (2026-10-02, PDF Bestias: F1 presión de Caos, F2 portal/Orbes,
    // F3 corrupción, F4 velocidad). Stats del compendio intactos.
    decadeBoss: {id:'riakis', name:'Señor del Caos Riakis', icon:'👁️', hp:5.0, atk:1.6, res:{fisico:55,fuego:-25,hielo:-25,veneno:40,aturdimiento:30}, boss:true, frontline:true,
      phases:[{below:0.75, msg:'abre una <b>Puerta del Caos</b>: acumula Orbes de poder (fase 2).'},{below:0.5, msg:'agrieta el suelo: la <b>corrupción</b> se extiende (fase 3).'},{below:0.25, msg:'desata el <b>Caos</b>: más rápido y feroz (fase 4).'}],
      abilities:{
        caos_desatado:{label:'Caos Desatado', utility:'self_buff', oncePerCombat:true, instant:true, condition:(ctx)=>ctx.selfHpPct<0.25, selfBuff:{name:'Caos Desatado', duration:99, dmgMult:1.20, evasionDelta:10}},
        grieta_mal:{label:'Grieta del Mal', mult:1.30, cooldown:3, condition:(ctx)=>ctx.selfHpPct<0.5, applies:Object.assign({chance:1}, CORROSION_STATUS)},
        puerta_caos:{label:'Puerta del Caos', utility:'buff_allies', cooldown:4, condition:(ctx)=>ctx.selfHpPct<0.75, buffAllies:{name:'Fortalecido', duration:99, stacks:2, maxStacks:6}},
        presa_r:{label:'Presa', mult:0.70, cooldown:4, condition:(ctx)=>ctx.selfHpPct<0.75 && ctx.targetStatusCount('Marcado')===0, applies:{name:'Marcado', incomingDmgMult:1.25, chance:1, duration:3}},
        lluvia_desesperacion:{label:'Lluvia de Desesperación', mult:0.80, cooldown:4, applies:Object.assign({chance:0.6}, CORROSION_STATUS)},
        cegar_r:{label:'Mirada del Caos', mult:0.60, cooldown:3, condition:(ctx)=>ctx.targetStatusCount('Ceguera')===0, applies:{name:'Ceguera', chance:0.30, duration:2, procChance:0.32}},
        atemorizar_r:{label:'Rugido del Caos', mult:0.60, cooldown:4, applies:{name:'Miedo', chance:0.25, duration:2, procChance:0.4}},
        pegar_r:{label:'Garra del Caos', mult:1.00}},
      aiPriority:['caos_desatado','grieta_mal','puerta_caos','presa_r','lluvia_desesperacion','cegar_r','atemorizar_r','pegar_r']}
  },
  // Década 3 — pisos 31-40 — El Usurpador Sin Nombre (REWORK 2026-09-25,
  // pedido explícito, PDF "Decada 4 - El Usurpador Sin Nombre"). Identidad:
  // Confusión (ya existía como estado — MENTAL_STATUSES/hasStatus). El PDF
  // limita Confusión a 18% en normales / 28% en élites / 32% en guardianes;
  // se respeta ese techo. Simplificaciones frente al PDF: el motor no tiene
  // "intercambio de posición entre enemigos" ni "señuelo de 1 HP invocado a
  // mitad de combate" ni reflejo de daño — esas 3 mecánicas (Espejo/Doble/
  // varios guardianes) se aproximan con autobuffs defensivos propios
  // (utility:'self_buff') o un golpe extra, documentado unidad por unidad
  // solo donde hace diferencia real.
  {
    regular: [
      {id:'sombra_mimetica', name:'Sombra Mimética', icon:'🫥', hp:0.90, atk:1.00, res:{fisico:0,fuego:0,hielo:0,veneno:0,aturdimiento:10},
        abilities:{
          golpe_umbrio:{label:'Golpe Umbrío', mult:1.00},
          rostro_falso:{label:'Rostro Falso', mult:0.70, applies:{name:'Confusion', chance:0.16, duration:2}, cooldown:4},
          ataque_mimetico:{label:'Ataque Mimético', mult:0.80, cooldown:3, condition:(ctx)=>ctx.targetStatusCount('Confusion')>=1, bonusVsTargetStatus:{name:'Confusion', mult:1.25}},
        },
        aiPriority:['rostro_falso','ataque_mimetico','golpe_umbrio']},
      {id:'espejo_viviente', name:'Espejo Viviente', icon:'🪞', hp:0.95, atk:0.95, res:{fisico:5,fuego:5,hielo:5,veneno:5,aturdimiento:5}, frontline:true, reflectPct:0.20,
        abilities:{
          fragmento:{label:'Fragmento', mult:1.00},
          reflejo_hostil:{label:'Reflejo Hostil', mult:0.70, applies:{name:'Confusion', chance:0.18, duration:2}, cooldown:3},
          copia_defensiva:{label:'Copia Defensiva', utility:'self_buff', selfBuff:{name:'Copia Defensiva', duration:2, incomingDmgReduction:0.15}, cooldown:5},
        },
        aiPriority:['copia_defensiva','reflejo_hostil','fragmento']},
      {id:'doble_corrupto', name:'Doble Corrupto', icon:'👥', hp:1.05, atk:1.12, res:{fisico:10,fuego:0,hielo:0,veneno:0,aturdimiento:0}, frontline:true,
        abilities:{
          golpe_dc:{label:'Golpe', mult:1.00},
          golpe_espejo:{label:'Golpe Espejo', mult:1.15, cooldown:3},
          doble_impacto:{label:'Doble Impacto', mult:1.20, cooldown:4, condition:(ctx)=>ctx.targetStatusCount('Confusion')>=1, bonusVsTargetStatus:{name:'Confusion', mult:1.20}},
        },
        hpThresholdBuff:{threshold:0.4, buff:{name:'Furia del Doble', duration:99, dmgMult:1.10}},
        aiPriority:['doble_impacto','golpe_espejo','golpe_dc']},
      {id:'farsante_menor', name:'Farsante Menor', icon:'🎭', hp:0.85, atk:0.95, res:{fisico:0,fuego:0,hielo:0,veneno:0,aturdimiento:0},
        abilities:{
          punalada:{label:'Puñalada', mult:1.00},
          robo_identidad:{label:'Robo de Identidad', mult:0.60, applies:{name:'Confusion', chance:0.12, duration:2}, cooldown:4},
          robar_fm:{label:'Robar', mult:0.70, cooldown:3, mpDrain:0.05},
        },
        aiPriority:['robo_identidad','robar_fm','punalada']},
    ],
    elite: [
      {id:'impostor_mayor', name:'Impostor Mayor', icon:'🎭', hp:1.90, atk:1.30, res:{fisico:10,fuego:5,hielo:5,veneno:5,aturdimiento:15}, elite:true, frontline:true,
        abilities:{
          estocada_im:{label:'Estocada', mult:1.05},
          identidad_robada:{label:'Identidad Robada', mult:0.80, applies:{name:'Confusion', chance:0.25, duration:2}, cooldown:5},
          golpe_oportunidad:{label:'Golpe de Oportunidad', mult:1.15, cooldown:3, condition:(ctx)=>ctx.targetStatusCount('Confusion')>=1, bonusVsTargetStatus:{name:'Confusion', mult:1.30}},
        },
        aiPriority:['identidad_robada','golpe_oportunidad','estocada_im']},
      {id:'doble_perfecto', name:'Doble Perfecto', icon:'🪞', hp:2.00, atk:1.25, res:{fisico:15,fuego:10,hielo:10,veneno:10,aturdimiento:20}, elite:true, frontline:true,
        abilities:{
          golpe_copiado:{label:'Golpe Copiado', mult:1.05},
          reflejo_perfecto_e:{label:'Reflejo Perfecto', mult:0.75, applies:{name:'Confusion', chance:0.22, duration:2}, cooldown:4},
          replica:{label:'Réplica', utility:'summon', cooldown:5, summon:{tpl:DECOY_REPLICA, count:1, maxAlive:1, oneHp:true}},
        },
        aiPriority:['replica','reflejo_perfecto_e','golpe_copiado']},
    ],
    guardians: [],
    // Guardián único y determinista por piso (31 a 39).
    guardianByFloor: {
      1: {id:'reflejo_perfecto_g', firstMentalResist:true, name:'Reflejo Perfecto', icon:'🪞', hp:2.70, atk:1.20, res:{fisico:10,fuego:5,hielo:5,veneno:5,aturdimiento:10}, boss:true, frontline:true,
        abilities:{
          golpe_g31:{label:'Golpe', mult:1.00},
          reflejo_perfecto_g31:{label:'Reflejo Perfecto', mult:0.75, applies:{name:'Confusion', chance:0.22, duration:2}, cooldown:4},
          copia_defensiva_g31:{label:'Copia Defensiva', utility:'self_buff', selfBuff:{name:'Copia Defensiva', duration:2, incomingDmgReduction:0.15}, cooldown:5},
        },
        aiPriority:['copia_defensiva_g31','reflejo_perfecto_g31','golpe_g31']},
      2: {id:'mascara_viviente_g', name:'Máscara Viviente', icon:'🎭', hp:2.80, atk:1.25, res:{fisico:10,fuego:10,hielo:10,veneno:10,aturdimiento:20}, boss:true, frontline:true,
        abilities:{
          estocada_g32:{label:'Estocada', mult:1.05},
          mascara_g32:{label:'Máscara', mult:0.70, applies:{name:'Confusion', chance:0.25, duration:2}, cooldown:4},
          golpe_brutal_g32:{label:'Golpe Brutal', mult:1.30, cooldown:3, condition:(ctx)=>ctx.targetStatusCount('Confusion')>=1, bonusVsTargetStatus:{name:'Confusion', mult:1.20}},
        },
        aiPriority:['mascara_g32','golpe_brutal_g32','estocada_g32']},
      3: {id:'espejo_sombras', name:'Espejo de Sombras', icon:'🪞', hp:2.75, atk:1.22, res:{fisico:10,fuego:5,hielo:5,veneno:5,aturdimiento:10}, boss:true,
        abilities:{
          fragmento_g33:{label:'Fragmento', mult:1.00},
          reflejo_oscuro:{label:'Reflejo Oscuro', mult:0.75, applies:{name:'Confusion', chance:0.20, duration:2}, cooldown:3},
          clon_sombra:{label:'Clon de Sombra', utility:'summon', cooldown:5, summon:{tpl:DECOY_CLON_SOMBRA, count:1, maxAlive:1, oneHp:true}, selfBuff:{name:'Tras el Clon', duration:3, evasionDelta:10}},
        },
        aiPriority:['clon_sombra','reflejo_oscuro','fragmento_g33']},
      4: {id:'doble_traicionero', name:'Doble Traicionero', icon:'👥', hp:2.90, atk:1.28, res:{fisico:10,fuego:5,hielo:5,veneno:5,aturdimiento:10}, boss:true, frontline:true,
        abilities:{
          ataque_g34:{label:'Ataque', mult:1.05},
          traicion:{label:'Traición', mult:0.75, applies:{name:'Confusion', chance:0.25, duration:2}, cooldown:4},
          ataque_copiado:{label:'Ataque Copiado', mult:1.20, cooldown:3, condition:(ctx)=>ctx.targetStatusCount('Confusion')>=1, bonusVsTargetStatus:{name:'Confusion', mult:1.25}},
        },
        aiPriority:['traicion','ataque_copiado','ataque_g34']},
      5: {id:'imitador_formacion', name:'Imitador de Formación', icon:'🎭', hp:3.00, atk:1.25, res:{fisico:10,fuego:5,hielo:5,veneno:5,aturdimiento:10}, boss:true, frontline:true,
        abilities:{
          ataque_g35:{label:'Ataque', mult:1.00},
          imitacion:{label:'Imitación', mult:0.70, applies:{name:'Confusion', chance:0.22, duration:2}, cooldown:4},
          formacion:{label:'Formación', utility:'self_buff', selfBuff:{name:'Formación', duration:3, incomingDmgReduction:0.10}, cooldown:5},
        },
        aiPriority:['formacion','imitacion','ataque_g35']},
      6: {id:'falso_companero', name:'Falso Compañero', icon:'🎭', hp:3.10, atk:1.30, res:{fisico:10,fuego:5,hielo:5,veneno:5,aturdimiento:10}, boss:true, frontline:true,
        abilities:{
          ataque_g36:{label:'Ataque', mult:1.05},
          identidad_robada_g36:{label:'Identidad Robada', mult:0.75, applies:{name:'Confusion', chance:0.28, duration:2}, cooldown:4},
          punalada_traicionera:{label:'Puñalada Traicionera', mult:1.25, cooldown:3, condition:(ctx)=>ctx.targetStatusCount('Confusion')>=1, bonusVsTargetStatus:{name:'Confusion', mult:1.25}},
        },
        aiPriority:['identidad_robada_g36','punalada_traicionera','ataque_g36']},
      7: {id:'maestro_reflejo', dmgMultWhileSummonsAlive:1.10, name:'Maestro del Reflejo', icon:'🪞', hp:3.20, atk:1.28, res:{fisico:10,fuego:5,hielo:5,veneno:5,aturdimiento:10}, boss:true,
        abilities:{
          fragmento_g37:{label:'Fragmento', mult:1.05},
          confusion_g37:{label:'Confusión', mult:0.75, applies:{name:'Confusion', chance:0.28, duration:2}, cooldown:4},
          reflexion:{label:'Reflexión', utility:'self_buff', selfBuff:{name:'Reflexión', duration:3, incomingDmgReduction:0.15}, cooldown:5},
          duplicado:{label:'Duplicado', utility:'summon', cooldown:5, summon:{tpl:DECOY_DUPLICADO, count:1, maxAlive:1, oneHp:true}},
        },
        aiPriority:['duplicado','reflexion','confusion_g37','fragmento_g37']},
      8: {id:'maestro_rostros', name:'Maestro de Rostros', icon:'🎭', hp:3.35, atk:1.35, res:{fisico:10,fuego:5,hielo:5,veneno:5,aturdimiento:10}, boss:true, frontline:true,
        abilities:{
          golpe_g38:{label:'Golpe', mult:1.05},
          rostro_falso_g38:{label:'Rostro Falso', mult:0.75, applies:{name:'Confusion', chance:0.30, duration:2}, cooldown:4},
          golpe_copiado_g38:{label:'Golpe Copiado', mult:1.20, cooldown:3, condition:(ctx)=>ctx.targetStatusCount('Confusion')>=1, bonusVsTargetStatus:{name:'Confusion', mult:1.25}},
        },
        aiPriority:['rostro_falso_g38','golpe_copiado_g38','golpe_g38']},
      9: {id:'usurpador_fragmentado', reductionWhileSummonsAlive:0.25, name:'Usurpador Fragmentado', icon:'🎭', hp:3.50, atk:1.40, res:{fisico:15,fuego:10,hielo:10,veneno:10,aturdimiento:15}, boss:true, frontline:true,
        abilities:{
          ataque_g39:{label:'Ataque', mult:1.10},
          confusion_profunda:{label:'Confusión Profunda', mult:0.80, applies:{name:'Confusion', chance:0.30, duration:2}, cooldown:4},
          duplicacion:{label:'Duplicación', utility:'summon', cooldown:5, summon:{tpl:DECOY_DUPLICADO, count:2, maxAlive:2, oneHp:true}},
          golpe_brutal_g39:{label:'Golpe Brutal', mult:1.35, cooldown:3, condition:(ctx)=>ctx.targetStatusCount('Confusion')>=1, bonusVsTargetStatus:{name:'Confusion', mult:1.20}},
        },
        hpThresholdBuff:{threshold:0.4, buff:{name:'Fragmentación', duration:99, dmgMult:1.15}},
        aiPriority:['duplicacion','confusion_profunda','golpe_brutal_g39','ataque_g39']},
    },
    // Fases (2026-10-02, PDF Usurpador): Forma original -> Mimetismo ->
    // Autorreplicación/Intercambio (copias al Frente; mientras vivan recibe
    // -35% de daño) -> Cristalización. Stats del compendio intactos.
    decadeBoss: {id:'usurpador', name:'El Usurpador Sin Nombre', icon:'🎭', hp:4.8, atk:1.8, res:{fisico:20,fuego:10,hielo:10,veneno:10,aturdimiento:20}, boss:true, frontline:true,
      reductionWhileSummonsAlive:0.35,
      phases:[{below:0.75, msg:'adopta tu forma (<b>Mimetismo</b>): imita tu estilo de pelea.'},{below:0.5, msg:'se <b>fragmenta en copias</b> e intercambia su lugar con ellas.'},{below:0.25, msg:'se <b>cristaliza</b>: su cuerpo se vuelve casi impenetrable por unos turnos.'}],
      abilities:{
        cristalizacion:{label:'Cristalización', utility:'self_buff', oncePerCombat:true, condition:(ctx)=>ctx.selfHpPct<0.25, selfBuff:{name:'Cristalización', duration:3, incomingDmgReduction:0.6}},
        replicacion:{label:'Autorreplicación', utility:'summon', cooldown:5, condition:(ctx)=>ctx.selfHpPct<0.5, summon:{tpl:USURPADOR_COPY_TPL, count:2, maxAlive:2, hpPct:0.08, atkPct:0.4}},
        mimetismo:{label:'Mimetismo', utility:'self_buff', oncePerCombat:true, condition:(ctx)=>ctx.selfHpPct<0.75, selfBuff:{name:'Forma Robada', duration:99, dmgMult:1.15}},
        confundir_u:{label:'Confundir', mult:0.70, cooldown:4, applies:{name:'Confusion', chance:0.28, duration:2, procChance:0.35}},
        golpe_mimetico:{label:'Golpe Mimético', mult:1.20, cooldown:3, condition:(ctx)=>ctx.selfHpPct<0.75, bonusVsTargetStatus:{name:'Confusion', mult:1.25}},
        golpe_brutal_u:{label:'Golpe Brutal', mult:1.40, cooldown:3},
        pegar_u:{label:'Golpe', mult:1.00}},
      aiPriority:['cristalizacion','replicacion','mimetismo','confundir_u','golpe_mimetico','golpe_brutal_u','pegar_u']}
  },
  // Década 4 — pisos 41-50 — Isla Paraíso (REWORK 2026-09-25, pedido
  // explícito, PDF "Decada 4 - Isla Paraiso"). Ver reglas de generación
  // especiales (5-6 normales, 3 élites, piso 41-49 = 5 regulares + 1 élite
  // en vez de guardián individual) en generateDungeon()/enterNode() —
  // ninguna de esas reglas es específica de esta década en el código, ya
  // son genéricas por nivel/decadeIndex, así que no hace falta tocarlas.
  {
    regular: [
      {id:'explorador_rival', name:'Explorador Rival', icon:'🗡️', hp:0.95, atk:1.05, res:{fisico:5,fuego:0,hielo:0,veneno:0,aturdimiento:5}, frontline:true,
        abilities:{
          estocada_er:{label:'Estocada', mult:1.00},
          ataque_oportunista:{label:'Ataque Oportunista', mult:0.80, cooldown:3, bonusVsLowHp:{below:0.5, mult:1.20}},
          robar_er:{label:'Robar', mult:0.65, cooldown:4, mpDrain:0.05, selfBuff:{name:'Tras Robar', duration:1, evasionDelta:10}},
        },
        aiPriority:['ataque_oportunista','robar_er','estocada_er']},
      {id:'mercenario_desertor', name:'Mercenario Desertor', icon:'🪓', hp:1.08, atk:1.12, res:{fisico:10,fuego:0,hielo:0,veneno:0,aturdimiento:5}, frontline:true,
        abilities:{
          golpe_md:{label:'Golpe', mult:1.00},
          golpe_brutal_md:{label:'Golpe Brutal', mult:1.25, cooldown:3},
          corte_profundo_md:{label:'Corte Profundo', mult:0.85, applies:{name:'Sangrado', chance:0.25, duration:3, stack:true, maxStack:3}, cooldown:4},
        },
        hpThresholdBuff:{threshold:0.5, buff:{name:'Resistencia Final', duration:2, incomingDmgReduction:0.10}},
        aiPriority:['golpe_brutal_md','corte_profundo_md','golpe_md']},
      {id:'cazarrecompensas', name:'Cazarrecompensas', icon:'🏹', hp:0.85, atk:1.10, res:{fisico:-5,fuego:0,hielo:0,veneno:0,aturdimiento:0},
        abilities:{
          disparo_cr:{label:'Disparo', mult:1.00},
          disparo_preciso:{label:'Disparo Preciso', mult:0.90, cooldown:3, bonusVsLowHp:{below:0.5, mult:1.25}},
          marca_presa:{label:'Marca de Presa', mult:0.70, cooldown:4, applies:{name:'Marcado', incomingDmgMult:1.15, chance:1, duration:2}},
        },
        aiPriority:['disparo_preciso','marca_presa','disparo_cr']},
      {id:'superviviente_curtido', name:'Superviviente Curtido', icon:'🔪', hp:1.00, atk:1.10, res:{fisico:5,fuego:0,hielo:0,veneno:5,aturdimiento:5},
        abilities:{
          corte_sc:{label:'Corte', mult:1.00, applies:{name:'Sangrado', chance:0.10, duration:2, stack:true, maxStack:3}},
          atemorizar_sc:{label:'Atemorizar', mult:0.60, applies:{name:'Miedo', chance:0.20, duration:2}, cooldown:5},
          golpe_sucio:{label:'Golpe Sucio', mult:0.80, applies:{name:'Sangrado', chance:0.20, duration:3, stack:true, maxStack:3}, cooldown:3},
        },
        hpThresholdBuff:{threshold:0.3, buff:{name:'Último Aliento', duration:2, dmgMult:1.15, incomingDmgReduction:0.10}},
        aiPriority:['atemorizar_sc','golpe_sucio','corte_sc']},
      {id:'asesino_isla', name:'Asesino de la Isla', icon:'🗡️', hp:0.80, atk:1.20, res:{fisico:0,fuego:0,hielo:0,veneno:5,aturdimiento:5},
        abilities:{
          doble_daga:{label:'Doble Daga', mult:1.00, applies:{name:'Sangrado', chance:0.15, duration:2, stack:true, maxStack:3}},
          paso_sombrio:{label:'Paso Sombrío', mult:0.60, cooldown:4, selfBuff:{name:'Paso Sombrío', duration:1, evasionDelta:10}},
          corte_ejecutor:{label:'Corte Ejecutor', mult:1.15, cooldown:4, bonusVsLowHp:{below:0.4, mult:1.25}},
        },
        aiPriority:['corte_ejecutor','paso_sombrio','doble_daga']},
      {id:'medico_campana', name:'Médico de Campaña', icon:'⚕️', hp:0.75, atk:0.80, res:{fisico:-5,fuego:5,hielo:5,veneno:10,aturdimiento:5},
        abilities:{
          baston:{label:'Bastón', mult:0.80},
          curacion_mc:{label:'Curación', utility:'heal_ally', healPct:0.10, cooldown:4, condition:(ctx)=>combat.enemies.some(e=>e.hp>0 && e.hp<e.maxHP)},
          adrenalina:{label:'Adrenalina', utility:'buff_allies', cooldown:5, buffAllies:{name:'Adrenalina', duration:2, dmgMult:1.10, single:true}},
        },
        aiPriority:['curacion_mc','adrenalina','baston']},
    ],
    // 5 tipos de élite (el PDF pide 3 por encuentro, de un pool de 5 —
    // pick() con reemplazo ya hace esa variedad). Superviviente Despiadado
    // va primero: es el que escolta en solitario al jefe (bestiary.elite[0]
    // en enterNode) y el escuadrón de "guardián" de 5+1.
    elite: [
      {id:'superviviente_despiadado', name:'Superviviente Despiadado', icon:'⚔️', hp:1.90, atk:1.38, res:{fisico:10,fuego:0,hielo:0,veneno:5,aturdimiento:5}, elite:true, frontline:true,
        abilities:{
          golpe_sd:{label:'Golpe', mult:1.05},
          golpe_brutal_sd:{label:'Golpe Brutal', mult:1.35, cooldown:3},
          desgarro_sd:{label:'Desgarro', mult:0.90, applies:{name:'Sangrado', chance:0.35, duration:3, stack:true, maxStack:3}, cooldown:3},
          atemorizar_sd:{label:'Atemorizar', mult:0.70, applies:{name:'Miedo', chance:0.25, duration:2}, cooldown:5},
        },
        hpThresholdBuff:{threshold:0.35, buff:{name:'Furia Final', duration:2, dmgMult:1.15, incomingDmgReduction:0.10}},
        aiPriority:['atemorizar_sd','desgarro_sd','golpe_brutal_sd','golpe_sd']},
      {id:'cazador_veterano', name:'Cazador Veterano', icon:'🏹', hp:1.65, atk:1.35, res:{fisico:0,fuego:0,hielo:0,veneno:0,aturdimiento:5}, elite:true,
        abilities:{
          disparo_cv:{label:'Disparo', mult:1.00},
          marca_mortal:{label:'Marca Mortal', mult:0.75, cooldown:4, applies:{name:'Marcado', incomingDmgMult:1.15, chance:1, duration:3}},
          disparo_ejecutor:{label:'Disparo Ejecutor', mult:1.30, cooldown:4, bonusVsLowHp:{below:0.4, mult:1.30}},
        },
        aiPriority:['disparo_ejecutor','marca_mortal','disparo_cv']},
      {id:'duelista_veterano', riposte:{chance:0.30, mult:0.75}, name:'Duelista Veterano', icon:'🤺', hp:1.80, atk:1.32, res:{fisico:5,fuego:0,hielo:0,veneno:0,aturdimiento:5}, elite:true, frontline:true,
        abilities:{
          estocada_dv:{label:'Estocada', mult:1.05},
          corte_preciso:{label:'Corte Preciso', mult:1.00, applies:{name:'Sangrado', chance:0.25, duration:3, stack:true, maxStack:3}, cooldown:3},
        },
        aiPriority:['corte_preciso','estocada_dv']},
      {id:'capitan_mercenario', name:'Capitán Mercenario', icon:'🎖️', hp:2.00, atk:1.30, res:{fisico:10,fuego:0,hielo:0,veneno:0,aturdimiento:10}, elite:true, frontline:true,
        abilities:{
          espadazo:{label:'Espadazo', mult:1.05},
          orden_ataque:{label:'Orden de Ataque', utility:'buff_allies', cooldown:5, buffAllies:{name:'Fortalecido', duration:2, stacks:4}},
          guarda_alta:{label:'Guarda Alta', utility:'self_buff', selfBuff:{name:'Guarda Alta', duration:2, incomingDmgReduction:0.15}, cooldown:5},
          golpe_mando:{label:'Golpe de Mando', mult:1.20, cooldown:3},
        },
        aiPriority:['orden_ataque','guarda_alta','golpe_mando','espadazo']},
      {id:'asesino_elite_isla', name:'Asesino de Élite', icon:'🗡️', hp:1.70, atk:1.40, res:{fisico:0,fuego:0,hielo:0,veneno:5,aturdimiento:5}, elite:true,
        abilities:{
          doble_corte:{label:'Doble Corte', mult:1.00},
          paso_letal:{label:'Paso Letal', mult:0.60, cooldown:4, selfBuff:{name:'Paso Letal', duration:1, evasionDelta:15}},
          corte_mortal:{label:'Corte Mortal', mult:1.20, cooldown:4, bonusVsLowHp:{below:0.4, mult:1.30}},
          silencio_ae:{label:'Silencio', mult:0.70, applies:{name:'Silencio', chance:0.15, duration:1}, cooldown:5},
        },
        aiPriority:['corte_mortal','silencio_ae','paso_letal','doble_corte']},
    ],
    guardians: [], // sin plantilla propia de guardián — el piso 41-49 usa 5 regulares + 1 élite (ver enterNode)
    // El jefe de década llega escoltado (ver enterNode) y no busca hacer daño
    // directo: cura, se bufa solo y llama refuerzos. Débil en poder bruto
    // frente al Usurpador, pero nunca solo. Intacto por pedido explícito.
    // Fases (2026-10-02, lámina "Custodio de la Isla"): curación, invocación
    // de cangrejos, golpe en área con Corrosión, coraza de coral y furia final.
    decadeBoss: {id:'custodio_isla', name:'Custodio de la Isla', icon:'🏝️', hp:3.2, atk:1.2, res:{fisico:15,fuego:10,hielo:10,veneno:10,aturdimiento:15}, boss:true, frontline:true,
      phases:[{below:0.7, msg:'la isla despierta: llama a sus <b>criaturas</b> (fase 2).'},{below:0.4, msg:'se cubre de <b>coral</b>: se endurece y se regenera (fase 3).'},{below:0.15, msg:'desata la <b>Furia de la Marea</b> (fase 4).'}],
      abilities:{
        furia_marea:{label:'Furia de la Marea', utility:'self_buff', oncePerCombat:true, instant:true, condition:(ctx)=>ctx.selfHpPct<0.15, selfBuff:{name:'Furia de la Marea', duration:99, dmgMult:1.25}},
        coraza_coral:{label:'Coraza de Coral', utility:'self_buff', oncePerCombat:true, condition:(ctx)=>ctx.selfHpPct<0.4, selfBuff:{name:'Coraza de Coral', duration:99, regenPct:0.02, incomingDmgReduction:0.15}},
        invocar_cangrejos:{label:'Invocación', utility:'summon', cooldown:7, condition:(ctx)=>ctx.selfHpPct<0.7, summon:{tpl:CANGREJO_ISLA_TPL, count:2, maxAlive:2, hpPct:0.05, atkPct:0.30}},
        impacto_area:{label:'Impacto en Área', utility:'aoe', mult:0.55, cooldown:3, applies:Object.assign({chance:1}, CORROSION_STATUS)},
        aura_curacion:{label:'Aura de Curación', utility:'self_heal', healPct:0.08, cooldown:4, condition:(ctx)=>ctx.selfHpPct<0.6},
        golpe_coral:{label:'Golpe de Coral', mult:1.0}},
      aiPriority:['furia_marea','coraza_coral','invocar_cangrejos','impacto_area','aura_curacion','golpe_coral']}
  },
  // Década 5 — pisos 51-60 — El Mar (Storm Gush / Tetrasea) (REWORK
  // 2026-09-25, pedido explícito, PDF "Decada 6 - Storm Gush" — el propio
  // documento aclara que el compendio interno la numera Década 5). Se
  // mantienen los 4 enemigos ya existentes con kits nuevos y se suman Naga
  // Arquero y Garvel para llegar a 5-6 por encuentro. Simplificaciones:
  // "inmune a Retroceso" (Cangrejo) y "al morir genera un Garvel pequeño"
  // (Garvel) no tienen gancho en el motor actual (ni chequeo de inmunidad a
  // proc, ni evento on-death) — se omiten, documentado acá en vez de
  // silencioso.
  // Gran Cangrejo Abisal (piso 55, guardián de piso, más abajo) mantiene su
  // física en 18 en vez de su valor original de 30 (2026-09-26): con 30
  // superaba al propio jefe de década Storm Gush (25) — ningún guardián
  // puede resistir más golpe físico que el jefe de su propia década. El
  // resto de esta década vuelve a sus valores originales.
  {
    regular: [
      {id:'triton_guerrero', name:'Tritón Guerrero', icon:'🔱', hp:1.10, atk:1.10, res:{fisico:10,fuego:5,hielo:-10,veneno:0,aturdimiento:0}, frontline:true,
        abilities:{
          tridente:{label:'Tridente', mult:1.00},
          golpe_brutal_tg:{label:'Golpe Brutal', mult:1.25, cooldown:3},
          estocada_marina:{label:'Estocada Marina', mult:0.90, applies:{name:'Ralentizado', chance:0.20, duration:2}, cooldown:4},
        },
        aiPriority:['golpe_brutal_tg','estocada_marina','tridente']},
      {id:'triton_hechicero', name:'Tritón Hechicero', icon:'🌊', hp:0.80, atk:1.00, res:{fisico:-5,fuego:10,hielo:-10,veneno:5,aturdimiento:0},
        abilities:{
          descarga_acuatica:{label:'Descarga Acuática', mult:0.80},
          debilitar_th:{label:'Debilitar', mult:0.70, applies:{name:'Debilitado', chance:0.20, duration:2}, cooldown:3},
          corriente_inversa:{label:'Corriente Inversa', mult:0.60, cooldown:4, applies:{name:'Ralentizado', chance:1, duration:2}},
        },
        aiPriority:['debilitar_th','corriente_inversa','descarga_acuatica']},
      {id:'cangrejo_gigante', immuneRetroceso:true, name:'Cangrejo Gigante', icon:'🦀', hp:1.30, atk:1.05, res:{fisico:20,fuego:0,hielo:-5,veneno:0,aturdimiento:10}, frontline:true,
        abilities:{
          pinza:{label:'Pinza', mult:1.00},
          pinza_aplastante:{label:'Pinza Aplastante', mult:1.20, applies:{name:'Paralisis', chance:0.15, duration:1}, cooldown:4},
          caparazon:{label:'Caparazón', utility:'self_buff', selfBuff:{name:'Caparazón', duration:2, incomingDmgReduction:0.20}, cooldown:5},
        },
        aiPriority:['caparazon','pinza_aplastante','pinza']},
      {id:'sirena_corrupta', name:'Sirena Corrupta', icon:'🧜', hp:0.75, atk:0.95, res:{fisico:-5,fuego:5,hielo:-5,veneno:5,aturdimiento:0},
        abilities:{
          grito_cortante:{label:'Grito Cortante', mult:0.90},
          canto_corrupto:{label:'Canto Corrupto', mult:0.70, applies:{name:'Confusion', chance:0.18, duration:1}, cooldown:4},
          ola_maldita:{label:'Ola Maldita', mult:0.75, applies:{name:'Debilitado', chance:0.15, duration:2}, cooldown:3, bonusVsTargetStatus:{name:'Confusion', mult:1.15}},
        },
        aiPriority:['canto_corrupto','ola_maldita','grito_cortante']},
      {id:'naga_arquero', passiveDmgMult:1.10, name:'Naga Arquero', icon:'🏹', hp:0.80, atk:1.10, res:{fisico:0,fuego:0,hielo:-5,veneno:5,aturdimiento:0},
        abilities:{
          flecha_marina:{label:'Flecha Marina', mult:1.00},
          flecha_perforante:{label:'Flecha Perforante', mult:0.85, cooldown:3, ignoreResist:0.25},
          flecha_entumecedora:{label:'Flecha Entumecedora', mult:0.65, applies:{name:'Ralentizado', chance:0.20, duration:2}, cooldown:4},
        },
        aiPriority:['flecha_entumecedora','flecha_perforante','flecha_marina']},
      {id:'garvel', onDeathSpawn:{tpl:GARVEL_SMALL_TPL, chance:0.30}, name:'Garvel', icon:'🦠', hp:0.75, atk:0.90, res:{fisico:-10,fuego:0,hielo:-5,veneno:15,aturdimiento:0},
        abilities:{
          mordida_garvel:{label:'Mordida', mult:1.00},
          salpicadura_acida:{label:'Salpicadura Ácida', mult:0.65, applies:{name:'Veneno', chance:0.15, duration:3, stack:true, maxStack:3}, cooldown:3},
        },
        aiPriority:['salpicadura_acida','mordida_garvel']},
    ],
    elite: [
      {id:'guardia_profundidades', name:'Guardia de las Profundidades', icon:'🔱', hp:2.10, atk:1.35, res:{fisico:15,fuego:5,hielo:-10,veneno:5,aturdimiento:10}, elite:true, frontline:true,
        abilities:{
          tridente_gp:{label:'Tridente', mult:1.05},
          golpe_brutal_gp:{label:'Golpe Brutal', mult:1.40, cooldown:3},
          estocada_profunda:{label:'Estocada Profunda', mult:1.00, applies:{name:'Ralentizado', chance:0.25, duration:2}, cooldown:4},
          guardia_marea:{label:'Guardia de Marea', utility:'self_buff', selfBuff:{name:'Guardia de Marea', duration:2, incomingDmgReduction:0.15}, cooldown:5},
        },
        aiPriority:['guardia_marea','golpe_brutal_gp','estocada_profunda','tridente_gp']},
      {id:'naga_capitan', reductionWithAllies:{min:2, value:0.10}, name:'Naga Capitán', icon:'🏹', hp:1.90, atk:1.35, res:{fisico:5,fuego:0,hielo:-10,veneno:5,aturdimiento:5}, elite:true,
        abilities:{
          ataque_nc:{label:'Ataque', mult:1.00},
          flecha_perforante_nc:{label:'Flecha Perforante', mult:0.90, cooldown:3, ignoreResist:0.35},
          orden_ataque_nc:{label:'Orden de Ataque', utility:'buff_allies', cooldown:5, buffAllies:{name:'Fortalecido', duration:2, stacks:4}},
        },
        aiPriority:['orden_ataque_nc','flecha_perforante_nc','ataque_nc']},
      {id:'sacerdotisa_mareas', auraRegenPct:0.02, name:'Sacerdotisa de las Mareas', icon:'🌊', hp:1.70, atk:1.15, res:{fisico:0,fuego:5,hielo:-5,veneno:10,aturdimiento:5}, elite:true,
        abilities:{
          ataque_sm:{label:'Ataque', mult:0.80},
          debilitamiento_oceanico:{label:'Debilitamiento Oceánico', mult:0.65, applies:{name:'Debilitado', chance:0.25, duration:2}, cooldown:3},
          curacion_marina:{label:'Curación Marina', utility:'heal_ally', healPct:0.10, cooldown:4, condition:(ctx)=>combat.enemies.some(e=>e.hp>0 && e.hp<e.maxHP)},
          canto_marea:{label:'Canto de Marea', mult:0.60, applies:{name:'Confusion', chance:0.15, duration:1}, cooldown:5},
        },
        aiPriority:['curacion_marina','debilitamiento_oceanico','canto_marea','ataque_sm']},
    ],
    guardians: [],
    // Guardián único y determinista por piso (51 a 59).
    guardianByFloor: {
      1: {id:'campeon_triton', passiveReduction:0.10, name:'Campeón Tritón', icon:'🔱', hp:2.70, atk:1.25, res:{fisico:10,fuego:5,hielo:-10,veneno:5,aturdimiento:5}, boss:true, frontline:true,
        abilities:{
          tridente_g51:{label:'Tridente', mult:1.05},
          estocada_g51:{label:'Estocada', mult:1.20, cooldown:3},
          golpe_brutal_g51:{label:'Golpe Brutal', mult:1.35, applies:{name:'Ralentizado', chance:0.20, duration:2}, cooldown:4},
        },
        aiPriority:['golpe_brutal_g51','estocada_g51','tridente_g51']},
      2: {id:'naga_maestro', passiveDmgMult:1.15, name:'Naga Maestro', icon:'🏹', hp:2.65, atk:1.35, res:{fisico:0,fuego:0,hielo:-10,veneno:5,aturdimiento:5}, boss:true,
        abilities:{
          flecha_g52:{label:'Flecha', mult:1.05},
          perforante_g52:{label:'Perforante', mult:0.95, cooldown:3, ignoreResist:0.30},
          entumecedora_g52:{label:'Entumecedora', mult:0.85, applies:{name:'Ralentizado', chance:0.25, duration:2}, cooldown:4},
        },
        aiPriority:['entumecedora_g52','perforante_g52','flecha_g52']},
      3: {id:'guardian_abismo', name:'Guardián del Abismo', icon:'🌀', hp:3.00, atk:1.25, res:{fisico:10,fuego:5,hielo:-5,veneno:5,aturdimiento:10}, boss:true, frontline:true,
        abilities:{
          golpe_g53:{label:'Golpe', mult:1.00},
          drenaje_marino:{label:'Drenaje Marino', mult:0.60, cooldown:4, mpDrain:0.10},
          caparazon_g53:{label:'Caparazón', utility:'self_buff', selfBuff:{name:'Caparazón', duration:2, incomingDmgReduction:0.20}, cooldown:5},
        },
        aiPriority:['caparazon_g53','drenaje_marino','golpe_g53']},
      4: {id:'sirena_matriarca', name:'Sirena Matriarca', icon:'🧜', hp:2.80, atk:1.20, res:{fisico:0,fuego:5,hielo:-5,veneno:10,aturdimiento:5}, boss:true,
        abilities:{
          canto_g54:{label:'Canto', mult:0.75, applies:{name:'Confusion', chance:0.25, duration:1}, cooldown:4},
          ola_mental:{label:'Ola Mental', mult:0.80, applies:{name:'Debilitado', chance:0.20, duration:2}, cooldown:3},
          whirlpool:{label:'Whirlpool', mult:0.70, applies:{name:'Ralentizado', chance:0.20, duration:2}, cooldown:4},
        },
        aiPriority:['canto_g54','whirlpool','ola_mental']},
      // Física bajada de 30 a 18 (2026-09-26, pedido explícito): superaba al
      // propio jefe de década (Storm Gush, 25) — ningún guardián puede
      // resistir más golpe físico que su jefe.
      5: {id:'gran_cangrejo_abisal', immuneRetroceso:true, name:'Gran Cangrejo Abisal', icon:'🦀', hp:3.50, atk:1.20, res:{fisico:18,fuego:0,hielo:-5,veneno:5,aturdimiento:15}, boss:true, frontline:true,
        abilities:{
          pinza_g55:{label:'Pinza', mult:1.05},
          aplastante_g55:{label:'Aplastante', mult:1.30, applies:{name:'Paralisis', chance:0.20, duration:1}, cooldown:4},
          caparazon_g55:{label:'Caparazón', utility:'self_buff', selfBuff:{name:'Caparazón', duration:2, incomingDmgReduction:0.30}, cooldown:5},
        },
        aiPriority:['caparazon_g55','aplastante_g55','pinza_g55']},
      6: {id:'serpiente_palpus', name:'Serpiente de Palpus', icon:'🐍', hp:2.90, atk:1.35, res:{fisico:10,fuego:0,hielo:-5,veneno:15,aturdimiento:5}, boss:true,
        abilities:{
          mordida_g56:{label:'Mordida', mult:1.05, applies:{name:'Veneno', chance:0.15, duration:3, stack:true, maxStack:3}},
          constriccion:{label:'Constricción', mult:0.75, applies:{name:'Ralentizado', chance:0.20, duration:2}, cooldown:3},
          emboscada:{label:'Emboscada', mult:1.35, cooldown:4},
        },
        aiPriority:['emboscada','constriccion','mordida_g56']},
      7: {id:'centinela_coral_g', name:'Centinela de Coral', icon:'🪸', hp:3.50, atk:1.45, res:{fisico:20,fuego:5,hielo:-10,veneno:15,aturdimiento:10}, boss:true, frontline:true,
        abilities:{
          golpe_g57:{label:'Golpe', mult:1.05},
          golpe_brutal_g57:{label:'Golpe Brutal', mult:1.35, cooldown:3},
          debilitar_g57:{label:'Debilitar', mult:0.70, applies:{name:'Debilitado', chance:0.25, duration:2}, cooldown:3},
          formacion_coralina:{label:'Formación Coralina', utility:'self_buff', selfBuff:{name:'Formación Coralina', duration:2, incomingDmgReduction:0.20}, cooldown:5},
        },
        aiPriority:['formacion_coralina','golpe_brutal_g57','debilitar_g57','golpe_g57']},
      8: {id:'leviatan_abisal', name:'Leviatán Abisal', icon:'🐋', hp:3.80, atk:1.50, res:{fisico:25,fuego:5,hielo:-10,veneno:10,aturdimiento:15}, boss:true, frontline:true,
        abilities:{
          mordida_g58:{label:'Mordida', mult:1.10},
          golpe_cola:{label:'Golpe de Cola', mult:1.25, cooldown:3},
          embestida_g58:{label:'Embestida', mult:1.35, applies:{name:'Ralentizado', chance:0.15, duration:2}, cooldown:4},
        },
        aiPriority:['embestida_g58','golpe_cola','mordida_g58']},
      9: {id:'heraldo_tormenta', name:'Heraldo de la Tormenta', icon:'⚡', hp:3.70, atk:1.45, res:{fisico:20,fuego:5,hielo:-15,veneno:10,aturdimiento:20}, boss:true, frontline:true,
        abilities:{
          tridente_g59:{label:'Tridente', mult:1.05},
          rayo_marino:{label:'Rayo Marino', mult:0.90, applies:{name:'Debilitado', chance:0.20, duration:2}, cooldown:3},
          tormenta_menor:{label:'Tormenta Menor', mult:0.60, cooldown:5, selfBuff:{name:'Tormenta Menor', duration:2, dmgMult:1.15, regenPct:0.05}},
        },
        aiPriority:['tormenta_menor','rayo_marino','tridente_g59']},
    },
    // Fases (2026-10-02, PDF Storm Gush): 1 Patrones (100-70%), 2 Lluvia
    // (70-40%), 3 Tormenta (40-10%), 4 Sacerdote de la Tormenta (<10%,
    // inmunidad 1 turno y luego solo ataques físicos). Stats intactos.
    decadeBoss: {id:'storm_gush', name:'Storm Gush, Tetrasea el Señor de las Lágrimas', icon:'🔱', hp:5.4, atk:1.85, res:{fisico:25,fuego:5,hielo:-15,veneno:10,aturdimiento:20}, boss:true, frontline:true,
      phases:[{below:0.7, msg:'inicia el <b>Ritual de Lluvia</b>: la tormenta lo fortalece (fase 2).'},{below:0.4, msg:'llama a la <b>Tormenta</b>: las aguas lo regeneran (fase 3).'},{below:0.1, msg:'se transforma en el <b>Sacerdote de la Tormenta</b>: carrera final (fase 4).'}],
      abilities:{
        sacerdote_tormenta:{label:'Sacerdote de la Tormenta', utility:'self_buff', oncePerCombat:true, condition:(ctx)=>ctx.selfHpPct<0.1, selfBuff:{name:'Sacerdote de la Tormenta', duration:2, incomingDmgReduction:1.0}},
        ritual_lluvia:{label:'Ritual de Lluvia', utility:'self_buff', oncePerCombat:true, condition:(ctx)=>ctx.selfHpPct<0.7, selfBuff:{name:'Lluvia', duration:4, dmgMult:1.15, regenPct:0.03}, debuffTarget:{name:'Empapado', duration:4, evasionDelta:-10}},
        ritual_lluvia_2:{label:'Ritual de Lluvia', utility:'self_buff', oncePerCombat:true, condition:(ctx)=>ctx.selfHpPct<0.4, selfBuff:{name:'Lluvia', duration:4, dmgMult:1.15, regenPct:0.03}, debuffTarget:{name:'Empapado', duration:4, evasionDelta:-10}},
        llamado_tormenta:{label:'Llamado de la Tormenta', utility:'self_heal', cooldown:4, healPct:0.08, requiresStatus:'Lluvia', condition:(ctx)=>ctx.selfHpPct<0.4 && ctx.selfHpPct>=0.1, debuffTarget:{name:'Empapado', duration:2, evasionDelta:-10}},
        sangre_tormenta:{label:'Sangre de la Tormenta', utility:'self_buff', cooldown:5, condition:(ctx)=>ctx.selfHpPct>=0.7, selfBuff:{name:'Sangre de la Tormenta', duration:2, dmgMult:1.10}},
        rugido_tiranico:{label:'Rugido Tiránico', utility:'aoe', mult:0.55, cooldown:4, condition:(ctx)=>ctx.selfHpPct>=0.1, applies:{name:'Miedo', chance:0.15, duration:2, procChance:0.4}}, // onda que golpea a todo el grupo (lámina de Storm Gush)
        vena_dragon:{label:'Vena del Dragón', mult:0.60, cooldown:4, mpDrain:0.10, condition:(ctx)=>ctx.selfHpPct>=0.1, applies:{name:'Ralentizado', chance:0.20, duration:2}},
        ojo_tormenta:{label:'Ojo de la Tormenta', mult:0.80, cooldown:3, applies:{name:'Ralentizado', chance:0.20, duration:2}},
        golpe_cola_sg:{label:'Golpe de Cola', utility:'aoe', mult:0.70, cooldown:3}, // barrido de cola en área
        tridente_sg:{label:'Tridente', mult:1.00}},
      aiPriority:['sacerdote_tormenta','ritual_lluvia_2','ritual_lluvia','llamado_tormenta','sangre_tormenta','rugido_tiranico','vena_dragon','ojo_tormenta','golpe_cola_sg','tridente_sg']}
  },
  // Década 6 — pisos 61-70 — La Grieta (2026-10-08, pedido explícito; diseño de
  // ariochbu: aberraciones del caos). Primera versión: cada mecánica del
  // documento se aproxima con lo que el motor ya sabe hacer —
  //   saltos espaciales / fases  -> auto-buff de evasión unos turnos
  //   resistencia que cambia     -> auto-buff de reducción de daño por cooldown
  //   copias falsas              -> señuelos (decoy) de 1 de vida
  //   bloquear/devorar habilidades y beneficios -> Silencio y Debilitado
  //   distorsión, voces, gravedad -> Confusión, Miedo, Ralentizado, Ceguera
  // Solo entran los monstruos que ya tienen arte chibi (faltan Mordedor de
  // Grieta, Medusa de Vidrio Negro, Esquirla Viva, Polilla de Ruido y el
  // élite Devoranombres). La "Ley del Caos" de cada combate va aparte: ver
  // CHAOS_LAWS.
  {
    regular: [
      {id:'larva_fase', name:'Larva de Fase', icon:'🐛', hp:0.95, atk:0.95, res:rs(10,-10,0,10,0), frontline:true,
        abilities:{
          mordisco_lf:{label:'Mordisco', mult:1.00},
          desfase:{label:'Desfase', utility:'self_buff', selfBuff:{name:'Desfasada', duration:2, incomingDmgReduction:0.25}, cooldown:4},
          baba_inestable:{label:'Baba Inestable', mult:0.75, applies:{name:'Ralentizado', chance:0.25, duration:2}, cooldown:3},
        },
        aiPriority:['desfase','baba_inestable','mordisco_lf']},
      {id:'ojo_reflujo', name:'Ojo de Reflujo', icon:'👁️', hp:0.75, atk:1.10, res:rs(-10,5,5,0,-5),
        abilities:{
          mirada_ro:{label:'Mirada', mult:1.00},
          reflujo:{label:'Reflujo', mult:0.85, applies:{name:'Confusion', chance:0.20, duration:1}, cooldown:4},
          pupila_ciega:{label:'Pupila Ciega', mult:0.70, applies:{name:'Ceguera', chance:0.25, duration:2, procChance:0.35}, cooldown:4},
        },
        aiPriority:['pupila_ciega','reflujo','mirada_ro']},
      {id:'sabueso_invertido', name:'Sabueso Invertido', icon:'🐕', hp:1.05, atk:1.10, res:rs(5,0,0,0,5), frontline:true,
        abilities:{
          dentellada_si:{label:'Dentellada', mult:1.00, applies:{name:'Sangrado', chance:0.15, duration:2, stack:true, maxStack:3}},
          piel_invertida:{label:'Piel Invertida', utility:'self_buff', selfBuff:{name:'Piel Invertida', duration:2, incomingDmgReduction:0.20}, cooldown:5},
          presa_torcida:{label:'Presa Torcida', mult:1.25, cooldown:3, bonusVsTargetStatus:{name:'Sangrado', mult:1.15}},
        },
        aiPriority:['piel_invertida','presa_torcida','dentellada_si']},
      {id:'acaro_umbral', name:'Ácaro del Umbral', icon:'🕷️', hp:0.80, atk:0.90, res:rs(15,-10,0,10,0),
        abilities:{
          pinchazo_au:{label:'Pinchazo', mult:0.90},
          injerto_caos:{label:'Injerto de Caos', utility:'buff_allies', cooldown:4, buffAllies:{name:'Fortalecido', duration:3, stacks:3, single:true}},
          esquirla_au:{label:'Esquirla', mult:0.75, applies:{name:'Marcado', chance:0.25, duration:2}, cooldown:3},
        },
        aiPriority:['injerto_caos','esquirla_au','pinchazo_au']},
      {id:'vigilante_descosido', name:'Vigilante Descosido', icon:'🧍', hp:1.15, atk:1.10, res:rs(10,0,0,0,10), frontline:true,
        abilities:{
          brazo_largo:{label:'Brazo Largo', mult:1.00},
          brazos_cruzados:{label:'Brazos Cruzados', mult:1.30, cooldown:3},
          costura_floja:{label:'Costura Floja', mult:0.80, applies:{name:'Debilitado', chance:0.25, duration:2}, cooldown:4},
        },
        aiPriority:['brazos_cruzados','costura_floja','brazo_largo']},
      {id:'ciervo_torcido', name:'Ciervo Torcido', icon:'🦌', hp:1.10, atk:1.15, res:rs(5,0,5,0,0), frontline:true,
        abilities:{
          cornada_ct:{label:'Cornada', mult:1.00},
          embestida_fractal:{label:'Embestida Fractal', mult:1.25, cooldown:4},
          copia_falsa:{label:'Copia Falsa', utility:'summon', cooldown:6, summon:{tpl:DECOY_CIERVO, count:1, maxAlive:1, oneHp:true}},
        },
        aiPriority:['copia_falsa','embestida_fractal','cornada_ct']},
      {id:'boca_peregrina', name:'Boca Peregrina', icon:'👄', hp:1.00, atk:1.05, res:rs(0,-5,0,15,0), frontline:true,
        abilities:{
          mordisco_bp:{label:'Mordisco', mult:1.05},
          devorar_beneficio:{label:'Devorar Beneficio', mult:0.80, applies:{name:'Debilitado', chance:0.35, duration:2}, cooldown:4, mpDrain:0.08},
          tragar:{label:'Tragar', mult:1.20, cooldown:3, bonusVsLowHp:{below:0.5, mult:1.15}},
        },
        aiPriority:['devorar_beneficio','tragar','mordisco_bp']},
      {id:'ciempies_especular', name:'Ciempiés Especular', icon:'🐛', hp:1.00, atk:1.00, res:rs(15,0,-5,5,0), frontline:true,
        abilities:{
          pinza_ce:{label:'Pinza', mult:1.00},
          reflejo_tardio:{label:'Reflejo Tardío', utility:'self_buff', selfBuff:{name:'Reflejo Tardío', duration:2, evasionDelta:12}, cooldown:5},
          latigo_espejo:{label:'Látigo de Espejo', mult:0.85, applies:{name:'Ralentizado', chance:0.25, duration:2}, cooldown:3},
        },
        aiPriority:['reflejo_tardio','latigo_espejo','pinza_ce']},
    ],
    elite: [
      {id:'quimera_disonante', name:'Quimera Disonante', icon:'🐲', hp:2.10, atk:1.38, res:rs(10,5,5,5,10), elite:true, frontline:true,
        abilities:{
          zarpa_qd:{label:'Zarpa', mult:1.05, applies:{name:'Sangrado', chance:0.20, duration:2, stack:true, maxStack:3}},
          rasgo_robado:{label:'Rasgo Robado', utility:'self_buff', selfBuff:{name:'Rasgo Robado', duration:3, dmgMult:1.15, evasionDelta:8}, cooldown:5},
          rugido_disonante:{label:'Rugido Disonante', mult:0.85, applies:{name:'Confusion', chance:0.25, duration:1}, cooldown:4},
          doble_fauce:{label:'Doble Fauce', mult:1.40, cooldown:3},
        },
        aiPriority:['rasgo_robado','doble_fauce','rugido_disonante','zarpa_qd']},
      {id:'ancla_vacio', immuneRetroceso:true, passiveReduction:0.10, name:'Ancla del Vacío', icon:'⚓', hp:2.30, atk:1.20, res:rs(20,5,5,10,25), elite:true, frontline:true,
        abilities:{
          pulso_av:{label:'Pulso', mult:0.95},
          gravedad_torcida:{label:'Gravedad Torcida', utility:'aoe', mult:0.45, cooldown:4, applies:{name:'Ralentizado', chance:0.6, duration:2}},
          atraccion:{label:'Atracción', mult:1.10, applies:{name:'Paralisis', chance:0.25, duration:1}, cooldown:4},
        },
        aiPriority:['gravedad_torcida','atraccion','pulso_av']},
      {id:'pastor_errores', name:'Pastor de Errores', icon:'🧙', hp:1.80, atk:1.20, res:rs(0,5,5,5,5), elite:true,
        abilities:{
          baculo_pe:{label:'Báculo', mult:0.90},
          mutacion_forzada:{label:'Mutación Forzada', utility:'buff_allies', cooldown:4, buffAllies:{name:'Fortalecido', duration:3, stacks:4}},
          llamar_rebano:{label:'Llamar al Rebaño', utility:'summon', cooldown:6, summon:{tpl:LARVA_ERRANTE_TPL, count:1, maxAlive:2, hpPct:0.20, atkPct:0.45}},
          orden_errada:{label:'Orden Errada', mult:0.75, applies:{name:'Silencio', chance:0.25, duration:1}, cooldown:4},
        },
        aiPriority:['mutacion_forzada','llamar_rebano','orden_errada','baculo_pe']},
      {id:'eco_heredado', name:'Eco Heredado', icon:'👻', hp:1.95, atk:1.32, res:rs(5,0,0,10,5), elite:true,
        abilities:{
          golpe_eh:{label:'Golpe de Eco', mult:1.00},
          veneno_heredado:{label:'Veneno Heredado', mult:0.85, applies:{name:'Veneno', chance:0.40, duration:3, stack:true, maxStack:3}, cooldown:3},
          caos_heredado:{label:'Caos Heredado', utility:'self_buff', selfBuff:{name:'Caos Heredado', duration:3, dmgMult:1.15}, cooldown:5},
          lluvia_heredada:{label:'Lluvia Heredada', mult:1.25, cooldown:4, applies:{name:'Debilitado', chance:0.25, duration:2}},
        },
        aiPriority:['caos_heredado','lluvia_heredada','veneno_heredado','golpe_eh']},
    ],
    guardians: [],
    guardianByFloor: {
      1: {id:'la_costura', name:'La Costura', icon:'🪡', hp:3.00, atk:1.30, res:rs(15,0,0,10,10), boss:true, frontline:true,
        abilities:{
          mordisco_cs:{label:'Mordisco', mult:1.05},
          atravesar_costura:{label:'Atravesar la Costura', mult:1.35, cooldown:3, selfBuff:{name:'Tras la Costura', duration:2, evasionDelta:10}},
          hilo_tenso:{label:'Hilo Tenso', mult:0.85, applies:{name:'Paralisis', chance:0.30, duration:1}, cooldown:4},
        },
        aiPriority:['hilo_tenso','atravesar_costura','mordisco_cs']},
      2: {id:'el_inversor', name:'El Inversor', icon:'🔄', hp:2.90, atk:1.35, res:rs(10,5,5,5,10), boss:true, frontline:true,
        abilities:{
          golpe_inv:{label:'Golpe', mult:1.05},
          giro_ofensivo:{label:'Giro Ofensivo', utility:'self_buff', selfBuff:{name:'Mitad Ofensiva', duration:2, dmgMult:1.25, incomingDmgReduction:-0.15}, cooldown:5, condition:(ctx)=>ctx.selfHpPct>=0.5},
          giro_defensivo:{label:'Giro Defensivo', utility:'self_buff', selfBuff:{name:'Mitad Defensiva', duration:2, incomingDmgReduction:0.30}, cooldown:5, condition:(ctx)=>ctx.selfHpPct<0.5},
          doble_cara:{label:'Doble Cara', mult:1.35, cooldown:3},
        },
        aiPriority:['giro_defensivo','giro_ofensivo','doble_cara','golpe_inv']},
      3: {id:'coro_hueco', name:'El Coro Hueco', icon:'🗣️', hp:3.10, atk:1.25, res:rs(5,0,0,10,15), boss:true, frontline:true,
        abilities:{
          grito_ch:{label:'Grito', mult:0.95},
          voz_del_miedo:{label:'Voz del Miedo', mult:0.80, applies:{name:'Miedo', chance:0.30, duration:2, procChance:0.35}, cooldown:4},
          voz_del_silencio:{label:'Voz del Silencio', mult:0.80, applies:{name:'Silencio', chance:0.30, duration:1}, cooldown:4},
          coro_entero:{label:'Coro Entero', utility:'aoe', mult:0.50, cooldown:5, applies:{name:'Debilitado', chance:0.5, duration:2}},
        },
        aiPriority:['coro_entero','voz_del_miedo','voz_del_silencio','grito_ch']},
      4: {id:'geometra_ciega', name:'La Geómetra Ciega', icon:'🕸️', hp:3.00, atk:1.30, res:rs(15,5,-5,10,10), boss:true, frontline:true,
        abilities:{
          pata_cristal:{label:'Pata de Cristal', mult:1.05},
          zona_imposible:{label:'Zona Imposible', mult:0.90, applies:{name:'Paralisis', chance:0.35, duration:1}, cooldown:3},
          figura_cerrada:{label:'Figura Cerrada', utility:'self_buff', selfBuff:{name:'Figura Cerrada', duration:2, incomingDmgReduction:0.25}, cooldown:5},
          trazo_cortante:{label:'Trazo Cortante', mult:1.30, cooldown:4, ignoreResist:0.25},
        },
        aiPriority:['figura_cerrada','trazo_cortante','zona_imposible','pata_cristal']},
      5: {id:'hambre_colores', name:'El Hambre de Colores', icon:'🌈', hp:3.20, atk:1.35, res:rs(10,25,25,25,10), boss:true, frontline:true,
        abilities:{
          zarpazo_hc:{label:'Zarpazo', mult:1.05},
          tragar_color:{label:'Tragar Color', utility:'self_heal', healPct:0.06, cooldown:5, condition:(ctx)=>ctx.selfHpPct<0.7},
          piel_cambiante:{label:'Piel Cambiante', utility:'self_buff', selfBuff:{name:'Piel Cambiante', duration:3, dmgMult:1.15, incomingDmgReduction:0.10}, cooldown:5},
          dentellada_prismatica:{label:'Dentellada Prismática', mult:1.35, cooldown:3, applies:{name:'Quemadura', chance:0.30, duration:2}},
        },
        aiPriority:['piel_cambiante','tragar_color','dentellada_prismatica','zarpazo_hc']},
      6: {id:'recuerdo_mal_nacido', name:'El Recuerdo Mal Nacido', icon:'🧟', hp:3.30, atk:1.35, res:rs(15,0,0,15,10), boss:true, frontline:true,
        abilities:{
          golpe_rm:{label:'Golpe', mult:1.05},
          garrote_del_ogro:{label:'Garrote del Ogro', mult:1.40, cooldown:4, applies:{name:'Aturdido', chance:0.20, duration:1}},
          veneno_de_la_matriarca:{label:'Veneno de la Matriarca', mult:0.85, applies:{name:'Veneno', chance:0.50, duration:3, stack:true, maxStack:3}, cooldown:3},
          tridente_de_tetrasea:{label:'Tridente de Tetrasea', mult:1.20, cooldown:4, applies:{name:'Ralentizado', chance:0.30, duration:2}},
        },
        hpThresholdBuff:{threshold:0.4, buff:{name:'Memoria Rota', duration:99, dmgMult:1.15}},
        aiPriority:['garrote_del_ogro','tridente_de_tetrasea','veneno_de_la_matriarca','golpe_rm']},
      7: {id:'rey_articulaciones', name:'Rey de las Articulaciones', icon:'🦴', hp:3.20, atk:1.42, res:rs(10,0,0,5,15), boss:true, frontline:true,
        abilities:{
          brazo_lanza:{label:'Brazo Lanza', mult:1.10, ignoreResist:0.20},
          brazo_maza:{label:'Brazo Maza', mult:1.35, cooldown:3, applies:{name:'Aturdido', chance:0.15, duration:1}},
          brazo_latigo:{label:'Brazo Látigo', mult:0.90, cooldown:3, applies:{name:'Sangrado', chance:0.40, duration:3, stack:true, maxStack:3}},
          mil_codos:{label:'Mil Codos', utility:'aoe', mult:0.50, cooldown:5},
        },
        aiPriority:['mil_codos','brazo_maza','brazo_latigo','brazo_lanza']},
      8: {id:'marea_seca', immuneRetroceso:true, name:'La Marea Seca', icon:'🐋', hp:3.70, atk:1.40, res:rs(20,5,5,5,15), boss:true, frontline:true,
        abilities:{
          coletazo_ms:{label:'Coletazo', mult:1.05},
          gravedad_lateral:{label:'Gravedad Lateral', utility:'aoe', mult:0.50, cooldown:4, applies:{name:'Ralentizado', chance:0.6, duration:2}},
          corriente_invisible:{label:'Corriente Invisible', utility:'self_buff', selfBuff:{name:'Corriente Invisible', duration:2, evasionDelta:12, incomingDmgReduction:0.10}, cooldown:5},
          embestida_seca:{label:'Embestida Seca', mult:1.45, cooldown:4},
        },
        aiPriority:['corriente_invisible','gravedad_lateral','embestida_seca','coletazo_ms']},
      9: {id:'puerta_camina', reductionWhileSummonsAlive:0.20, name:'La Puerta que Camina', icon:'🚪', hp:3.60, atk:1.35, res:rs(15,5,5,10,15), boss:true, frontline:true,
        abilities:{
          pisoton_pc:{label:'Pisotón', mult:1.05},
          abrir_portal:{label:'Abrir Portal', utility:'summon', cooldown:5, summon:{tpl:LARVA_ERRANTE_TPL, count:2, maxAlive:2, hpPct:0.07, atkPct:0.35}},
          umbral_voraz:{label:'Umbral Voraz', mult:1.35, cooldown:3, applies:{name:'Miedo', chance:0.25, duration:2, procChance:0.35}},
          portazo:{label:'Portazo', mult:1.20, cooldown:4, applies:{name:'Aturdido', chance:0.20, duration:1}},
        },
        aiPriority:['abrir_portal','umbral_voraz','portazo','pisoton_pc']},
    },
    // El Sin Forma: tres configuraciones según su vida (el sprite cambia con
    // ellas, ver enemyFormId en battleSprites.js). Carne = golpes físicos
    // enormes; Idea = ataques mentales; Reflejo/Fallida = todo a la vez.
    decadeBoss: {id:'sin_forma', name:'El Sin Forma', icon:'🕳️', hp:5.6, atk:1.90, res:rs(20,10,10,15,20), boss:true, frontline:true,
      phases:[{below:0.66, msg:'pierde partes del cuerpo: <b>Forma de Idea</b>, ataca la mente (fase 2).'},{below:0.33, msg:'ya no sostiene ninguna silueta: <b>Forma Fallida</b> (fase 3).'}],
      abilities:{
        golpe_de_carne:{label:'Golpe de Carne', mult:1.05},
        aplastar_sf:{label:'Aplastar', mult:1.40, cooldown:3, condition:(ctx)=>ctx.selfHpPct>=0.66, applies:{name:'Aturdido', chance:0.15, duration:1}},
        masa_viva:{label:'Masa Viva', utility:'self_buff', oncePerCombat:true, condition:(ctx)=>ctx.selfHpPct>=0.66 && ctx.selfHpPct<0.9, selfBuff:{name:'Masa Viva', duration:3, incomingDmgReduction:0.20}},
        idea_cortante:{label:'Idea Cortante', mult:0.95, cooldown:3, condition:(ctx)=>ctx.selfHpPct<0.66, applies:{name:'Confusion', chance:0.35, duration:1}, ignoreResist:0.25},
        olvido:{label:'Olvido', mult:0.80, cooldown:4, condition:(ctx)=>ctx.selfHpPct<0.66, applies:{name:'Silencio', chance:0.40, duration:1}, mpDrain:0.10},
        pliegue_espacial:{label:'Pliegue Espacial', utility:'aoe', mult:0.50, cooldown:5, condition:(ctx)=>ctx.selfHpPct<0.66, applies:{name:'Miedo', chance:0.4, duration:2, procChance:0.35}},
        reflejo_imperfecto:{label:'Reflejo Imperfecto', utility:'summon', cooldown:6, condition:(ctx)=>ctx.selfHpPct<0.33, summon:{tpl:REFLEJO_FALLIDO_TPL, count:2, maxAlive:2, hpPct:0.05, atkPct:0.35}},
        forma_fallida:{label:'Forma Fallida', utility:'self_buff', oncePerCombat:true, instant:true, condition:(ctx)=>ctx.selfHpPct<0.33, selfBuff:{name:'Forma Fallida', duration:99, dmgMult:1.20, evasionDelta:8}},
        colapso:{label:'Colapso', mult:1.45, cooldown:4, condition:(ctx)=>ctx.selfHpPct<0.33},
      },
      aiPriority:['forma_fallida','masa_viva','reflejo_imperfecto','pliegue_espacial','colapso','aplastar_sf','olvido','idea_cortante','golpe_de_carne']}
  },
  // Década 7 — pisos 71-80 — Bosque muerto (2026-10-08, pedido explícito). Su
  // identidad es la CORRUPCIÓN: un estado acumulable (hasta x10) sobre el
  // jugador y sus aliados que les sube el daño que hacen y, más todavía, el
  // que reciben (ver CORRUPCION_STATUS). Dura lo que el combate. El resto de
  // mecánicas del documento se aproxima igual que en La Grieta: enterrarse =
  // evasión, podar beneficios = Debilitado/Silencio, robar vida = curarse,
  // resucitar/plantar = invocar brotes. Aún sin animaciones: se dibujan con su
  // imagen fija. Falta el élite Podador Negro (sin arte).
  {
    regular: [
      {id:'raiz_desenterrada', name:'Raíz Desenterrada', icon:'🖐️', hp:1.10, atk:1.10, res:rs(15,-15,0,10,5), frontline:true,
        abilities:{
          zarpazo_rd:{label:'Zarpazo', mult:1.00},
          enterrarse:{label:'Enterrarse', utility:'self_buff', selfBuff:{name:'Enterrada', duration:2, evasionDelta:15}, cooldown:5},
          emerger:{label:'Emerger', mult:1.30, cooldown:3, applies:{name:'Paralisis', chance:0.20, duration:1}},
        },
        aiPriority:['enterrarse','emerger','zarpazo_rd']},
      {id:'jardinero_hueco', name:'Jardinero Hueco', icon:'🧑‍🌾', hp:1.00, atk:1.05, res:rs(5,-10,0,10,0), frontline:true,
        abilities:{
          tijeretazo:{label:'Tijeretazo', mult:1.00},
          podar_beneficios:{label:'Podar Beneficios', mult:0.75, applies:{name:'Debilitado', chance:0.30, duration:2}, cooldown:4},
          abono_ajeno:{label:'Abono Ajeno', utility:'heal_ally', healPct:0.08, cooldown:5, condition:(ctx)=>combat.enemies.some(e=>e.hp>0 && e.hp<e.maxHP)},
        },
        aiPriority:['abono_ajeno','podar_beneficios','tijeretazo']},
      {id:'ciervo_sepulcral', name:'Ciervo Sepulcral', icon:'🦌', hp:1.05, atk:1.12, res:rs(5,-10,5,5,0), frontline:true,
        abilities:{
          cornada_cs:{label:'Cornada', mult:1.00},
          semilla_explosiva:{label:'Semilla Explosiva', mult:1.25, cooldown:4, applies:CORRUPCION(0.30)},
          embestida_cs:{label:'Embestida', mult:1.15, cooldown:3},
        },
        aiPriority:['semilla_explosiva','embestida_cs','cornada_cs']},
      {id:'polilla_funeraria', name:'Polilla Funeraria', icon:'🦋', hp:0.75, atk:0.95, res:rs(-10,-15,0,10,-5),
        abilities:{
          aleteo_pf:{label:'Aleteo', mult:0.90},
          esporas_luminosas:{label:'Esporas Luminosas', mult:0.70, applies:CORRUPCION(0.60), cooldown:3},
          polvo_gris:{label:'Polvo Gris', mult:0.65, applies:{name:'Ceguera', chance:0.25, duration:2, procChance:0.35}, cooldown:4},
        },
        aiPriority:['esporas_luminosas','polvo_gris','aleteo_pf']},
      {id:'hongo_osario', name:'Hongo de Osario', icon:'🍄', hp:1.00, atk:0.90, res:rs(10,-15,0,25,10),
        abilities:{
          golpe_ho:{label:'Golpe', mult:0.90},
          nube_de_osario:{label:'Nube de Osario', utility:'summon', cooldown:6, summon:{tpl:BROTE_MENOR_TPL, count:1, maxAlive:2, hpPct:0.30, atkPct:0.45}},
          esporas_ho:{label:'Esporas', mult:0.70, applies:{name:'Veneno', chance:0.35, duration:3, stack:true, maxStack:3}, cooldown:3},
        },
        aiPriority:['nube_de_osario','esporas_ho','golpe_ho']},
      {id:'enredadera_viuda', name:'Enredadera Viuda', icon:'🌿', hp:0.95, atk:1.00, res:rs(5,-15,0,15,5),
        abilities:{
          latigazo_ev:{label:'Latigazo', mult:0.95},
          atrapar:{label:'Atrapar', mult:0.80, applies:{name:'Paralisis', chance:0.30, duration:1}, cooldown:3},
          arrastrar:{label:'Arrastrar', mult:1.10, cooldown:4, applies:{name:'Marcado', chance:0.35, duration:2}},
        },
        aiPriority:['atrapar','arrastrar','latigazo_ev']},
      {id:'cuervo_savia', name:'Cuervo de Savia', icon:'🐦‍⬛', hp:0.80, atk:1.10, res:rs(-5,-10,0,5,0),
        abilities:{
          picotazo_cv:{label:'Picotazo', mult:1.00},
          robar_savia:{label:'Robar Savia', mult:0.85, cooldown:3, mpDrain:0.08},
          depositar_savia:{label:'Depositar Savia', utility:'heal_ally', healPct:0.07, cooldown:4, condition:(ctx)=>combat.enemies.some(e=>e.hp>0 && e.hp<e.maxHP)},
        },
        aiPriority:['depositar_savia','robar_savia','picotazo_cv']},
      {id:'brote_carronero', name:'Brote Carroñero', icon:'🌺', hp:1.05, atk:1.05, res:rs(5,-15,0,15,5), frontline:true,
        abilities:{
          mordida_bc:{label:'Mordida', mult:1.00},
          devorar_restos:{label:'Devorar Restos', utility:'self_buff', selfBuff:{name:'Bien Alimentado', duration:3, dmgMult:1.20, regenPct:0.03}, cooldown:5},
          corona_dentada:{label:'Corona Dentada', mult:1.25, cooldown:3, applies:{name:'Sangrado', chance:0.30, duration:3, stack:true, maxStack:3}},
        },
        aiPriority:['devorar_restos','corona_dentada','mordida_bc']},
      {id:'caracol_tumba', immuneRetroceso:true, name:'Caracol de Tumba', icon:'🐌', hp:1.35, atk:0.95, res:rs(25,-5,0,15,15), frontline:true,
        abilities:{
          embestida_ct:{label:'Embestida', mult:0.95},
          rastro_viscoso:{label:'Rastro Viscoso', mult:0.70, applies:{name:'Ralentizado', chance:0.40, duration:2}, cooldown:3},
          lapida:{label:'Lápida', utility:'self_buff', selfBuff:{name:'Lápida', duration:2, incomingDmgReduction:0.30}, cooldown:5},
          liquen_corrupto:{label:'Liquen Corrupto', mult:0.70, applies:CORRUPCION(0.35), cooldown:4},
        },
        aiPriority:['lapida','liquen_corrupto','rastro_viscoso','embestida_ct']},
      {id:'espantapajaros_raigal', name:'Espantapájaros Raigal', icon:'🎃', hp:1.10, atk:1.05, res:rs(10,-20,0,10,10), frontline:true,
        abilities:{
          golpe_er:{label:'Golpe', mult:1.00},
          imitar_postura:{label:'Imitar Postura', utility:'self_buff', selfBuff:{name:'Postura Imitada', duration:3, incomingDmgReduction:0.20}, cooldown:5},
          espantar:{label:'Espantar', mult:0.75, applies:{name:'Miedo', chance:0.25, duration:2, procChance:0.35}, cooldown:4},
        },
        aiPriority:['imitar_postura','espantar','golpe_er']},
      {id:'mantis_poda', name:'Mantis de Poda', icon:'🦗', hp:0.90, atk:1.18, res:rs(0,-15,0,10,0), frontline:true,
        abilities:{
          tijera_mp:{label:'Tijera', mult:1.05},
          poda_doble:{label:'Poda Doble', mult:1.30, cooldown:3, applies:{name:'Sangrado', chance:0.30, duration:2, stack:true, maxStack:3}},
          recortar:{label:'Recortar', mult:0.80, applies:{name:'Debilitado', chance:0.30, duration:2}, cooldown:4},
        },
        aiPriority:['poda_doble','recortar','tijera_mp']},
      {id:'semilla_doliente', name:'Semilla Doliente', icon:'🌰', hp:0.60, atk:0.80, res:rs(0,-15,0,10,0),
        abilities:{
          pinchar_sd:{label:'Pinchar', mult:0.85},
          germinar:{label:'Germinar', utility:'buff_allies', cooldown:4, buffAllies:{name:'Fortalecido', duration:3, stacks:4, single:true}},
          escabullirse:{label:'Escabullirse', utility:'self_buff', selfBuff:{name:'Escurridiza', duration:2, evasionDelta:20}, cooldown:4},
        },
        aiPriority:['germinar','escabullirse','pinchar_sd']},
    ],
    elite: [
      {id:'madre_micelio', reductionWithAllies:{min:1, value:0.15}, name:'Madre Micelio', icon:'🍄', hp:2.20, atk:1.25, res:rs(10,-15,0,25,15), elite:true,
        abilities:{
          golpe_mm:{label:'Golpe', mult:0.95},
          red_micelial:{label:'Red Micelial', utility:'heal_ally', healPct:0.10, cooldown:4, condition:(ctx)=>combat.enemies.some(e=>e.hp>0 && e.hp<e.maxHP)},
          esporas_mm:{label:'Esporas', mult:0.80, applies:CORRUPCION(0.50), cooldown:3},
          brotar:{label:'Brotar', utility:'summon', cooldown:6, summon:{tpl:BROTE_MENOR_TPL, count:1, maxAlive:2, hpPct:0.20, atkPct:0.40}},
        },
        aiPriority:['brotar','red_micelial','esporas_mm','golpe_mm']},
      {id:'injerto_profano', name:'Injerto Profano', icon:'🌵', hp:2.10, atk:1.40, res:rs(10,-15,0,15,10), elite:true, frontline:true,
        abilities:{
          brazo_espino:{label:'Brazo de Espino', mult:1.05, applies:{name:'Sangrado', chance:0.25, duration:2, stack:true, maxStack:3}},
          brazo_liana:{label:'Brazo de Liana', mult:0.90, applies:{name:'Paralisis', chance:0.30, duration:1}, cooldown:3},
          brazo_flor:{label:'Brazo de Flor', mult:0.85, applies:CORRUPCION(0.50), cooldown:4},
          injerto_nuevo:{label:'Injerto Nuevo', utility:'self_buff', selfBuff:{name:'Injerto Nuevo', duration:3, dmgMult:1.20}, cooldown:5},
        },
        aiPriority:['injerto_nuevo','brazo_liana','brazo_flor','brazo_espino']},
      {id:'custodio_invernadero', passiveReduction:0.10, name:'Custodio del Invernadero', icon:'🤖', hp:2.30, atk:1.20, res:rs(25,0,5,20,20), elite:true, frontline:true,
        abilities:{
          golpe_ci:{label:'Golpe', mult:1.00},
          regar:{label:'Regar', utility:'heal_ally', healPct:0.10, cooldown:4, condition:(ctx)=>combat.enemies.some(e=>e.hp>0 && e.hp<e.maxHP)},
          cristal_protector:{label:'Cristal Protector', utility:'buff_allies', cooldown:5, buffAllies:{name:'Fortalecido', duration:3, stacks:3}},
          farol_verde:{label:'Farol Verde', mult:1.20, cooldown:3, applies:{name:'Ceguera', chance:0.25, duration:2, procChance:0.35}},
        },
        aiPriority:['cristal_protector','regar','farol_verde','golpe_ci']},
      {id:'heraldo_flor_negra', name:'Heraldo de la Flor Negra', icon:'🥀', hp:1.90, atk:1.30, res:rs(5,-10,0,15,10), elite:true,
        abilities:{
          toque_marchito:{label:'Toque Marchito', mult:0.95, applies:CORRUPCION(0.35)},
          flor_negra:{label:'Flor Negra', utility:'aoe', mult:0.45, cooldown:4, applies:CORRUPCION(1)},
          cosecha:{label:'Cosecha', mult:1.20, cooldown:3, bonusVsTargetStatus:{name:'Corrupción', minStacks:3, mult:1.30}},
        },
        aiPriority:['flor_negra','cosecha','toque_marchito']},
    ],
    guardians: [],
    guardianByFloor: {
      1: {id:'jardinero_enterrado', immuneRetroceso:true, name:'El Jardinero Enterrado', icon:'⛏️', hp:3.30, atk:1.35, res:rs(20,-10,0,15,15), boss:true, frontline:true,
        abilities:{
          palazo:{label:'Palazo', mult:1.10},
          plantar_muertos:{label:'Plantar Muertos', utility:'summon', cooldown:6, summon:{tpl:BROTE_MENOR_TPL, count:2, maxAlive:2, hpPct:0.06, atkPct:0.35}},
          tierra_removida:{label:'Tierra Removida', mult:1.35, cooldown:3, applies:{name:'Ralentizado', chance:0.35, duration:2}},
        },
        aiPriority:['plantar_muertos','tierra_removida','palazo']},
      2: {id:'gran_madre_micelio', reductionWhileSummonsAlive:0.25, name:'La Madre Micelio', icon:'🍄', hp:3.40, atk:1.25, res:rs(10,-15,0,30,15), boss:true, frontline:true,
        abilities:{
          pisoton_gm:{label:'Pisotón', mult:1.05},
          cuerpos_secundarios:{label:'Cuerpos Secundarios', utility:'summon', cooldown:5, summon:{tpl:BROTE_MENOR_TPL, count:2, maxAlive:3, hpPct:0.07, atkPct:0.35}},
          nube_madre:{label:'Nube Madre', utility:'aoe', mult:0.45, cooldown:4, applies:CORRUPCION(0.7)},
          esporas_gm:{label:'Esporas', mult:0.90, applies:{name:'Veneno', chance:0.45, duration:3, stack:true, maxStack:3}, cooldown:3},
        },
        aiPriority:['cuerpos_secundarios','nube_madre','esporas_gm','pisoton_gm']},
      3: {id:'ciervo_cementerio', name:'El Ciervo Cementerio', icon:'🦌', hp:3.30, atk:1.40, res:rs(15,-10,5,10,10), boss:true, frontline:true,
        abilities:{
          cornada_cc:{label:'Cornada', mult:1.10},
          asta_rota:{label:'Asta Rota', utility:'self_buff', oncePerCombat:true, instant:true, condition:(ctx)=>ctx.selfHpPct<0.5, selfBuff:{name:'Asta Rota', duration:99, dmgMult:1.20}},
          estampida:{label:'Estampida', mult:1.40, cooldown:3},
          flores_funerarias:{label:'Flores Funerarias', mult:0.85, applies:CORRUPCION(0.6), cooldown:4},
        },
        aiPriority:['asta_rota','estampida','flores_funerarias','cornada_cc']},
      4: {id:'novia_raices', name:'La Novia de las Raíces', icon:'👰', hp:3.20, atk:1.35, res:rs(5,-15,0,15,10), boss:true,
        abilities:{
          liana_nr:{label:'Liana', mult:1.00},
          lazo_nupcial:{label:'Lazo Nupcial', utility:'aoe', mult:0.50, cooldown:4, applies:{name:'Marcado', chance:0.6, duration:2}},
          velo_marchito:{label:'Velo Marchito', mult:0.85, applies:{name:'Miedo', chance:0.30, duration:2, procChance:0.35}, cooldown:4},
          abrazo_de_raices:{label:'Abrazo de Raíces', mult:1.35, cooldown:3, applies:{name:'Paralisis', chance:0.30, duration:1}},
        },
        aiPriority:['lazo_nupcial','abrazo_de_raices','velo_marchito','liana_nr']},
      5: {id:'arbol_juramentos', immuneRetroceso:true, passiveReduction:0.10, name:'El Árbol de los Juramentos', icon:'🌳', hp:3.80, atk:1.35, res:rs(25,-20,0,15,25), boss:true, frontline:true,
        abilities:{
          rama_aj:{label:'Rama', mult:1.05},
          juramento_de_silencio:{label:'Juramento de Silencio', mult:0.80, applies:{name:'Silencio', chance:0.45, duration:1}, cooldown:4},
          juramento_de_quietud:{label:'Juramento de Quietud', mult:0.80, applies:{name:'Paralisis', chance:0.40, duration:1}, cooldown:4},
          cadenas_antiguas:{label:'Cadenas Antiguas', utility:'aoe', mult:0.55, cooldown:5, applies:{name:'Ralentizado', chance:0.6, duration:2}},
        },
        aiPriority:['cadenas_antiguas','juramento_de_silencio','juramento_de_quietud','rama_aj']},
      6: {id:'bestia_invernadero', name:'La Bestia del Invernadero', icon:'🐆', hp:3.40, atk:1.45, res:rs(15,-10,0,20,10), boss:true, frontline:true,
        abilities:{
          zarpazo_bi:{label:'Zarpazo', mult:1.10, applies:{name:'Sangrado', chance:0.25, duration:2, stack:true, maxStack:3}},
          comer_corrupcion:{label:'Comer Corrupción', mult:1.20, cooldown:3, bonusVsTargetStatus:{name:'Corrupción', minStacks:2, mult:1.35}, selfBuff:{name:'Evolución', duration:3, dmgMult:1.10, regenPct:0.02}},
          salto_bi:{label:'Salto', mult:1.40, cooldown:4},
          aliento_bi:{label:'Aliento Podrido', mult:0.80, applies:CORRUPCION(0.6), cooldown:4},
        },
        aiPriority:['aliento_bi','comer_corrupcion','salto_bi','zarpazo_bi']},
      7: {id:'sepulturero_savia', immuneRetroceso:true, name:'El Sepulturero de Savia', icon:'⚰️', hp:3.60, atk:1.42, res:rs(20,-10,0,15,20), boss:true, frontline:true,
        abilities:{
          pala_hacha:{label:'Pala-Hacha', mult:1.10},
          enterrar_arena:{label:'Enterrar', mult:1.30, cooldown:3, applies:{name:'Paralisis', chance:0.30, duration:1}},
          tumbas_de_raices:{label:'Tumbas de Raíces', utility:'aoe', mult:0.55, cooldown:5, applies:{name:'Sangrado', chance:0.5, duration:3, stack:true, maxStack:3}},
          beber_savia:{label:'Beber Savia', utility:'self_heal', healPct:0.06, cooldown:6, condition:(ctx)=>ctx.selfHpPct<0.6},
        },
        aiPriority:['beber_savia','tumbas_de_raices','enterrar_arena','pala_hacha']},
      8: {id:'flor_mil_voces', name:'La Flor de las Mil Voces', icon:'🌸', hp:3.50, atk:1.35, res:rs(10,-20,0,20,15), boss:true,
        abilities:{
          petalo:{label:'Pétalo', mult:1.00},
          voz_que_riega:{label:'Voz que Riega', utility:'self_heal', healPct:0.05, cooldown:6, condition:(ctx)=>ctx.selfHpPct<0.7},
          voz_que_poda:{label:'Voz que Poda', mult:1.25, cooldown:3, applies:{name:'Debilitado', chance:0.40, duration:2}},
          voz_que_siembra:{label:'Voz que Siembra', utility:'aoe', mult:0.45, cooldown:4, applies:CORRUPCION(0.8)},
          voz_que_calla:{label:'Voz que Calla', mult:0.85, applies:{name:'Silencio', chance:0.40, duration:1}, cooldown:4},
        },
        aiPriority:['voz_que_siembra','voz_que_riega','voz_que_poda','voz_que_calla','petalo']},
      9: {id:'ultimo_jardinero', name:'El Último Jardinero', icon:'🧑‍🌾', hp:3.80, atk:1.50, res:rs(15,-10,0,20,20), boss:true, frontline:true,
        abilities:{
          guadana_uj:{label:'Guadaña', mult:1.10, applies:{name:'Sangrado', chance:0.25, duration:2, stack:true, maxStack:3}},
          sembrar_uj:{label:'Sembrar', utility:'summon', cooldown:6, summon:{tpl:BROTE_MENOR_TPL, count:2, maxAlive:2, hpPct:0.06, atkPct:0.35}},
          podar_uj:{label:'Podar', mult:1.40, cooldown:3, applies:{name:'Debilitado', chance:0.35, duration:2}},
          regadera_negra:{label:'Regadera Negra', utility:'aoe', mult:0.50, cooldown:4, applies:CORRUPCION(0.8)},
        },
        hpThresholdBuff:{threshold:0.4, buff:{name:'Último Turno', duration:99, dmgMult:1.15}},
        aiPriority:['sembrar_uj','regadera_negra','podar_uj','guadana_uj']},
    },
    // El Corazón Marchito: 1) el Jardín lo protege (invoca, casi no ataca);
    // 2) el Corazón se defiende (ataca y corrompe); 3) "Pódame": deja de
    // luchar y solo late — Último Latido corrompe a todo el grupo cada pocos
    // turnos. El sprite cambia con las fases (enemyFormId).
    decadeBoss: {id:'corazon_marchito', immuneRetroceso:true, reductionWhileSummonsAlive:0.30, name:'El Corazón Marchito', icon:'🫀', hp:6.0, atk:1.80, res:rs(20,-10,5,25,30), boss:true, frontline:true,
      phases:[{below:0.65, msg:'empieza a reaccionar: <b>el Corazón se defiende</b> (fase 2).'},{below:0.25, msg:'deja caer sus defensas. «<b>Pódame</b>». Ya no puede contener la Corrupción (fase 3).'}],
      abilities:{
        latido:{label:'Latido', mult:0.60},
        el_jardin_protege:{label:'El Jardín Protege', utility:'summon', cooldown:4, condition:(ctx)=>ctx.selfHpPct>=0.25, summon:{tpl:BROTE_MENOR_TPL, count:2, maxAlive:3, hpPct:0.05, atkPct:0.35}},
        raices_negras:{label:'Raíces Negras', mult:1.30, cooldown:3, condition:(ctx)=>ctx.selfHpPct<0.65 && ctx.selfHpPct>=0.25, applies:{name:'Paralisis', chance:0.30, duration:1}},
        savia_corrupta:{label:'Savia Corrupta', utility:'aoe', mult:0.55, cooldown:4, condition:(ctx)=>ctx.selfHpPct<0.65 && ctx.selfHpPct>=0.25, applies:CORRUPCION(0.8)},
        espinas:{label:'Espinas', mult:1.15, cooldown:3, condition:(ctx)=>ctx.selfHpPct<0.65 && ctx.selfHpPct>=0.25, applies:{name:'Sangrado', chance:0.40, duration:3, stack:true, maxStack:3}},
        ultimo_latido:{label:'Último Latido', utility:'aoe', mult:0.35, cooldown:2, condition:(ctx)=>ctx.selfHpPct<0.25, applies:CORRUPCION(1)},
      },
      aiPriority:['ultimo_latido','el_jardin_protege','savia_corrupta','raices_negras','espinas','latido']}
  }
];

/* ============================================================
   GACHA "CAÍDOS DEL LABERINTO" — mascotas (2026-09-24, pedido explícito)
   ============================================================
   100 mascotas en 6 rangos (fuente: PDF que pasó ariochbu). El rango de
   cada una viene del RANGO DE NÚMERO del PDF, no de la etiqueta que haya
   quedado dibujada dentro de su imagen — ariochbu confirmó explícitamente
   que #041-070 son "Raro" aunque la lámina generada las etiquete "Poco
   Común". bonuses usa un vocabulario chico y reutilizable:
     {stat:'fis'|'hab', value:N}              -> estadística base (baseStat)
     {mod:'maxhp_flat'|'mp_flat'|'espiritu_flat'|'res_magica'|
          'resistencia_estado'|'defensa_fisica', value:N} -> pool/resistencia plana
     {type:'aumento_dano'|'critico_dano'|'prob_critico'|'evasion_flat'|
           'reduccion_dano'|'bloqueo'|'retroceso'|'aturdir'|
           'penetracion_armadura'|'robovida'|'succion_hechizo'|
           'segundo_ataque_basico'|'doble_encantamiento', value|chance|percent:N}
       -> mismo `type` que ya consume el equipo (ver specialsFromEquip/
          applyEquippedSpecials) — una mascota equipada inyecta estos
          objetos exactamente en esos mismos arrays, así que reutiliza TODA
          la lógica de combate ya existente sin duplicar nada.
     {type:'aumento_dano_raza', raza:'goblin'|'arana'|'bestia'|'humano'|
           'criatura_marina', value:N}         -> nuevo, ver ENEMY_RACE_TAG
     {type:'aumento_dano_posicion', posicion:'frontline'|'retaguardia', value:N} -> nuevo
   Épico en adelante suma además `unique:{name, desc, effect}` (ver
   checkPetTriggers) para su habilidad única/mítica.
*/
const PET_RARITIES = {
  poco_comun: {id:'poco_comun', name:'Poco Común', color:'#46c168', weight:80},
  raro:       {id:'raro',       name:'Raro',        color:'#3b8fe0', weight:15},
  unico:      {id:'unico',      name:'Único',       color:'#9350dd', weight:4},
  epico:      {id:'epico',      name:'Épico',       color:'#d6409f', weight:0.9},
  legendario: {id:'legendario', name:'Legendario',  color:'#e0b23f', weight:0.099},
  mitico:     {id:'mitico',     name:'Mítico',      color:'#e0393f', weight:0.001}
};
const PET_RARITY_ORDER = ['poco_comun','raro','unico','epico','legendario','mitico'];
// Las imágenes de Caídos Épico/Legendario/Mítico (y algunos Únicos) no son
// verticales como el resto (512x341, 512x512, 768x512, 307x1024...): con
// object-fit:cover la carta las recortaba y se veían desproporcionadas.
// Al cargar, si la proporción de la imagen se aleja de la de su caja, pasa a
// "contain" (se ve entera, con fondo oscuro) — las verticales de siempre
// siguen igual. Listener en captura porque 'load' no burbujea.
document.addEventListener('load', (e)=>{
  const img = e.target;
  if(!img || img.tagName!=='IMG' || !(img.getAttribute('src')||'').includes('/mascotas/')) return;
  const box = img.parentElement && img.parentElement.getBoundingClientRect();
  if(!box || !box.width || !box.height || !img.naturalWidth || !img.naturalHeight) return;
  const imgRatio = img.naturalWidth/img.naturalHeight, boxRatio = box.width/box.height;
  // Solo si la imagen es bastante más ANCHA que su caja, o el doble de alta:
  // los retratos verticales de siempre (0.6) siguen con el recorte de antes.
  if(imgRatio > boxRatio*1.25 || imgRatio < boxRatio*0.5){
    img.style.objectFit = 'contain';
    img.style.objectPosition = 'center';
    img.style.background = '#0d0b09';
  }
}, true);
// Arte limpio de los Caídos (2026-10-03, pedido explícito): las imágenes
// originales son cartas completas con nombre, rango y bonos PINTADOS dentro
// (ilegibles en chico, formatos mezclados, y quedan desactualizadas si cambia
// un bono). Las nuevas son solo la ilustración (vertical 2:3, sin texto) en
// src/assets/mascotas/arte/, y el juego dibuja la carta con los datos reales
// (ver petCardHTML). Se migra por tandas: los ids listados acá ya tienen arte
// limpio; el resto sigue con su carta vieja. Importar con tools/import_caidos.py.
const PET_CLEAN_ART = new Set(Array.from({length:100}, (_,i)=>i+1)); // 1..100: todos migrados
function petHasCleanArt(id){ return PET_CLEAN_ART.has(Number(id)); }
function petArtPath(id){
  const n = String(id).padStart(3,'0');
  return `src/assets/mascotas/arte/mascota_${n}.jpg?v=1`; // las cartas viejas (mascota_NNN.png) se retiraron al completar los 100
}
// Texto de los bonos de un Caído, desde PET_CATALOG. Los del mismo tipo se
// suman en una sola línea (dos "aumento_dano" de 10% y 12% -> "+22% daño").
const PET_RAZA_LABELS = {goblin:'goblins', arana:'arañas', bestia:'bestias', humano:'humanos', criatura_marina:'criaturas marinas'};
const PET_MOD_LABELS = {maxhp_flat:'HP', mp_flat:'MP', espiritu_flat:'Espíritu', res_magica:'Resistencia mágica', resistencia_estado:'Resistencia a estados', defensa_fisica:'Defensa física'};
const PET_STAT_LABELS = {fis:'Físico', hab:'Habilidad', esp:'Espíritu', agi:'Agilidad', vig:'Vigor'};
const PET_TYPE_LABELS = {aumento_dano:'daño', critico_dano:'daño crítico', prob_critico:'prob. de crítico', evasion_flat:'evasión',
  reduccion_dano:'reducción de daño', penetracion_armadura:'penetración de armadura', bloqueo:'bloqueo', retroceso:'retroceso',
  aturdir:'aturdir', segundo_ataque_basico:'segundo ataque básico', doble_encantamiento:'segundo hechizo'};
function petBonusLines(tpl){
  const acc = new Map();
  (tpl.bonuses||[]).forEach(b=>{
    const key = b.stat ? 'stat:'+b.stat : b.mod ? 'mod:'+b.mod : 'type:'+b.type+':'+(b.raza||b.posicion||'');
    const cur = acc.get(key) || {b, total:0};
    cur.total += (b.value!==undefined ? b.value : b.chance!==undefined ? b.chance : b.percent)||0;
    acc.set(key, cur);
  });
  return [...acc.values()].map(({b,total})=>{
    if(b.stat) return `+${total} ${PET_STAT_LABELS[b.stat]||b.stat}`;
    if(b.mod) return `+${total} ${PET_MOD_LABELS[b.mod]||b.mod}`;
    const pct = `+${Math.round(total*100)}%`;
    if(b.type==='aumento_dano_raza') return `${pct} daño a ${PET_RAZA_LABELS[b.raza]||b.raza}`;
    if(b.type==='aumento_dano_posicion') return `${pct} daño a la ${b.posicion==='frontline'?'primera línea':'retaguardia'}`;
    return `${pct} ${PET_TYPE_LABELS[b.type]||b.type}`;
  });
}
// Carta completa (zoom) de un Caído con arte limpio: ilustración + nombre,
// rango, bonos y habilidad única escritos por el juego.
function petCardHTML(petId){
  const tpl = petTpl(petId);
  const r = PET_RARITIES[tpl.rarity];
  return `<div class="pet-card" style="--rc:${r.color}">
    <div class="pet-card-art"><img src="${petArtPath(petId)}" alt=""><span class="pet-card-num">#${String(tpl.id).padStart(3,'0')}</span></div>
    <div class="pet-card-body">
      <div class="pet-card-name">${tpl.name}</div>
      <div class="pet-card-rank">${r.name}</div>
      <ul class="pet-card-bonuses">${petBonusLines(tpl).map(l=>`<li>${l}</li>`).join('')}</ul>
      ${tpl.unique ? `<div class="pet-card-unique"><b>${tpl.unique.name}</b>${tpl.unique.desc}</div>` : ''}
    </div>
  </div>`;
}
// Zoom al pasar el cursor (o mantener presionado en celular) sobre una
// carta de Caído del Laberinto (2026-09-25, pedido explícito: "se ven muy
// diminutos... al pasar el puntero por encima... si estas en celular si se
// mantiene presionado") — una sola capa reutilizada en toda la pantalla en
// vez de un tooltip por tile, para no duplicar DOM. Cualquier elemento con
// data-pet-zoom="<id>" queda enganchado por wirePetZoomEvents().
function ensurePetZoomLayer(){
  let el = document.getElementById('pet-zoom-preview');
  if(!el){
    el = document.createElement('div');
    el.id = 'pet-zoom-preview';
    el.className = 'pet-zoom-preview';
    document.body.appendChild(el);
  }
  return el;
}
function showPetZoom(petId){
  const tpl = petTpl(petId);
  if(!tpl) return;
  const r = PET_RARITIES[tpl.rarity];
  const el = ensurePetZoomLayer();
  el.innerHTML = petHasCleanArt(petId) ? petCardHTML(petId) : `<img src="${petArtPath(petId)}" alt="${tpl.name}">`;
  el.style.boxShadow = `0 0 0 3px ${r.color}, 0 0 34px ${r.color}99`;
  el.classList.add('visible');
}
function hidePetZoom(){
  const el = document.getElementById('pet-zoom-preview');
  if(el) el.classList.remove('visible');
}
function wirePetZoomEvents(root){
  if(!root) return;
  root.querySelectorAll('[data-pet-zoom]').forEach(el=>{
    const id = el.dataset.petZoom;
    el.addEventListener('mouseenter', ()=> showPetZoom(id));
    el.addEventListener('mouseleave', hidePetZoom);
    el.addEventListener('touchstart', ()=> showPetZoom(id), {passive:true});
    el.addEventListener('touchend', hidePetZoom);
    el.addEventListener('touchcancel', hidePetZoom);
  });
}
// Bug real reportado (2026-09-26): a veces la imagen agrandada se quedaba
// flotando en pantalla "de largo", incluso cambiando de pestaña o entrando
// al laberinto. Causa: #pet-zoom-preview es una sola capa fija reusada en
// TODA la pantalla (ver ensurePetZoomLayer) que sobrevive a los re-renders
// a propósito, pero solo se oculta con mouseleave/touchend/touchcancel del
// tile que la abrió — si ese tile desaparece de un re-render (cambiaste de
// pantalla, terminó un turno de combate, etc.) ANTES de que el mouse salga
// de encima o termine el toque, ese evento nunca llega a dispararse y la
// capa se queda visible para siempre. Dos redes de seguridad: se oculta
// sola al cambiar de pestaña, y se oculta sola al principio de cada
// renderAll() (cualquier navegación/re-render general implica que el hover
// que la abrió ya no es válido).
document.addEventListener('visibilitychange', ()=>{ if(document.visibilityState==='hidden') hidePetZoom(); });
const PET_CATALOG = [
  {id:1, name:'Horn Rabbit', rarity:'poco_comun', bonuses:[{type:'evasion_flat', value:0.03}]},
  {id:2, name:'Blade Rabbit', rarity:'poco_comun', bonuses:[{type:'prob_critico', value:0.02}]},
  {id:3, name:'Poisonous Viper', rarity:'poco_comun', bonuses:[{mod:'maxhp_flat', value:50}]},
  {id:4, name:'Night Viper', rarity:'poco_comun', bonuses:[{mod:'res_magica', value:10}]},
  {id:5, name:'Mad Mamba', rarity:'poco_comun', bonuses:[{stat:'hab', value:15}]},
  {id:6, name:'Trash Mamba', rarity:'poco_comun', bonuses:[{type:'aumento_dano', value:0.02}]},
  {id:7, name:'Wild Dog', rarity:'poco_comun', bonuses:[{stat:'fis', value:15}]},
  {id:8, name:'Blue Wolf', rarity:'poco_comun', bonuses:[{type:'aumento_dano_raza', raza:'bestia', value:0.05}]},
  {id:9, name:'Black Wolf', rarity:'poco_comun', bonuses:[{type:'critico_dano', value:0.05}]},
  {id:10, name:'Red Deer', rarity:'poco_comun', bonuses:[{mod:'espiritu_flat', value:30}]},
  {id:11, name:'Blue Stag', rarity:'poco_comun', bonuses:[{mod:'resistencia_estado', value:10}]},
  {id:12, name:'Black Stag', rarity:'poco_comun', bonuses:[{mod:'mp_flat', value:30}]},
  {id:13, name:'Stamp Boar', rarity:'poco_comun', bonuses:[{type:'aumento_dano_posicion', posicion:'frontline', value:0.05}]},
  {id:14, name:'Gigant Boar', rarity:'poco_comun', bonuses:[{mod:'defensa_fisica', value:10}]},
  {id:15, name:'Steel Boar', rarity:'poco_comun', bonuses:[{type:'bloqueo', chance:0.05}]},
  {id:16, name:'Big Cocco', rarity:'poco_comun', bonuses:[{mod:'maxhp_flat', value:50}]},
  {id:17, name:'Poisonous Cocco', rarity:'poco_comun', bonuses:[{type:'aumento_dano_raza', raza:'arana', value:0.05}]},
  {id:18, name:'Venenous Cocco', rarity:'poco_comun', bonuses:[{type:'aturdir', chance:0.05}]},
  {id:19, name:'Green Slime', rarity:'poco_comun', bonuses:[{mod:'mp_flat', value:30}]},
  {id:20, name:'Heat Slime', rarity:'poco_comun', bonuses:[{type:'doble_encantamiento', chance:0.02}]},
  {id:21, name:'Turtle Snake', rarity:'poco_comun', bonuses:[{type:'aumento_dano_raza', raza:'criatura_marina', value:0.05}]},
  {id:22, name:'Gold Turtle Snake', rarity:'poco_comun', bonuses:[{mod:'res_magica', value:10}]},
  {id:23, name:'Armored Tanuki', rarity:'poco_comun', bonuses:[{type:'aumento_dano_posicion', posicion:'retaguardia', value:0.05}]},
  {id:24, name:'Copper Armored Tanuki', rarity:'poco_comun', bonuses:[{mod:'maxhp_flat', value:50}]},
  {id:25, name:'Seven Colored Bat', rarity:'poco_comun', bonuses:[{type:'segundo_ataque_basico', chance:0.02}]},
  {id:26, name:'Demon Spider', rarity:'poco_comun', bonuses:[{type:'aumento_dano_raza', raza:'arana', value:0.05}]},
  {id:27, name:'Poison Mantis', rarity:'poco_comun', bonuses:[{type:'aumento_dano_raza', raza:'goblin', value:0.05}]},
  {id:28, name:'Paralyzing Mantis', rarity:'poco_comun', bonuses:[{type:'aturdir', chance:0.05}]},
  {id:29, name:'Seal Mantis', rarity:'poco_comun', bonuses:[{type:'retroceso', chance:0.05}]},
  {id:30, name:'Copper Squirrel', rarity:'poco_comun', bonuses:[{type:'aumento_dano_raza', raza:'humano', value:0.05}]},
  {id:31, name:'Iron Squirrel', rarity:'poco_comun', bonuses:[{mod:'defensa_fisica', value:10}]},
  {id:32, name:'Crystal Squirrel', rarity:'poco_comun', bonuses:[{stat:'fis', value:15}]},
  {id:33, name:'Red Lizard', rarity:'poco_comun', bonuses:[{stat:'hab', value:15}]},
  {id:34, name:'Green Lizard', rarity:'poco_comun', bonuses:[{type:'aumento_dano_raza', raza:'humano', value:0.05}]},
  {id:35, name:'Blue Lizard', rarity:'poco_comun', bonuses:[{type:'aumento_dano_raza', raza:'bestia', value:0.05}]},
  {id:36, name:'Goblin Punk', rarity:'poco_comun', bonuses:[{type:'aumento_dano_raza', raza:'goblin', value:0.05}]},
  {id:37, name:'Sword Kobold', rarity:'poco_comun', bonuses:[{type:'aumento_dano_posicion', posicion:'frontline', value:0.05}]},
  {id:38, name:'Archer Kobold', rarity:'poco_comun', bonuses:[{type:'aumento_dano_posicion', posicion:'retaguardia', value:0.05}]},
  {id:39, name:'Kobold Mage', rarity:'poco_comun', bonuses:[{mod:'espiritu_flat', value:30}]},
  {id:40, name:'Orc', rarity:'poco_comun', bonuses:[{type:'aumento_dano', value:0.02}]},

  {id:41, name:'Vorpal Bunny', rarity:'raro', bonuses:[{type:'aumento_dano', value:0.05},{type:'prob_critico', value:0.03}]},
  {id:42, name:'Hazard Mamba', rarity:'raro', bonuses:[{type:'aumento_dano_raza', raza:'goblin', value:0.05},{type:'retroceso', chance:0.03}]},
  {id:43, name:'Void Viper', rarity:'raro', bonuses:[{mod:'res_magica', value:10},{type:'evasion_flat', value:0.03}]},
  {id:44, name:'Triple Horned Horse', rarity:'raro', bonuses:[{stat:'fis', value:15},{type:'aumento_dano_posicion', posicion:'frontline', value:0.05}]},
  {id:45, name:'Crimson Horned Horse', rarity:'raro', bonuses:[{type:'aumento_dano', value:0.05},{type:'critico_dano', value:0.05}]},
  {id:46, name:'Boroforu', rarity:'raro', bonuses:[{mod:'defensa_fisica', value:10},{mod:'maxhp_flat', value:50}]},
  {id:47, name:'Black Boroforu', rarity:'raro', bonuses:[{mod:'resistencia_estado', value:10},{type:'evasion_flat', value:0.03}]},
  {id:48, name:'Argiope', rarity:'raro', bonuses:[{type:'aumento_dano_raza', raza:'arana', value:0.05},{type:'aturdir', chance:0.05}]},
  {id:49, name:'Gray Slime', rarity:'raro', bonuses:[{mod:'mp_flat', value:30},{mod:'res_magica', value:10}]},
  {id:50, name:'Carbuncle', rarity:'raro', bonuses:[{mod:'espiritu_flat', value:30},{type:'doble_encantamiento', chance:0.02}]},
  {id:51, name:'Armored Blue Shrimp', rarity:'raro', bonuses:[{mod:'defensa_fisica', value:10},{type:'bloqueo', chance:0.05}]},
  {id:52, name:'Armored Scissorman', rarity:'raro', bonuses:[{type:'aumento_dano_raza', raza:'humano', value:0.05},{type:'retroceso', chance:0.05}]},
  {id:53, name:'Rhinoceros Beetle', rarity:'raro', bonuses:[{mod:'maxhp_flat', value:50},{type:'aumento_dano_posicion', posicion:'frontline', value:0.05}]},
  {id:54, name:'Messenger Locust', rarity:'raro', bonuses:[{type:'aumento_dano_posicion', posicion:'retaguardia', value:0.05},{type:'evasion_flat', value:0.03}]},
  {id:55, name:'Yellow Monkey', rarity:'raro', bonuses:[{stat:'hab', value:15},{type:'prob_critico', value:0.03}]},
  {id:56, name:'Bicorn', rarity:'raro', bonuses:[{stat:'fis', value:15},{type:'aturdir', chance:0.05}]},
  {id:57, name:'Cave Alligator', rarity:'raro', bonuses:[{mod:'maxhp_flat', value:50},{type:'aumento_dano', value:0.05}]},
  {id:58, name:'Crystal Crocodile', rarity:'raro', bonuses:[{mod:'defensa_fisica', value:10},{mod:'res_magica', value:10}]},
  {id:59, name:'Amethyst Crocodile', rarity:'raro', bonuses:[{mod:'espiritu_flat', value:30},{type:'critico_dano', value:0.05}]},
  {id:60, name:'Poison Cave Lizard', rarity:'raro', bonuses:[{type:'aumento_dano_raza', raza:'bestia', value:0.05},{mod:'resistencia_estado', value:10}]},
  {id:61, name:'Skull Lizard', rarity:'raro', bonuses:[{type:'aumento_dano', value:0.05},{mod:'res_magica', value:10}]},
  {id:62, name:'Rock-Turtle Frog', rarity:'raro', bonuses:[{mod:'maxhp_flat', value:50},{type:'bloqueo', chance:0.05}]},
  {id:63, name:'Ness Frog', rarity:'raro', bonuses:[{mod:'mp_flat', value:30},{type:'aumento_dano_raza', raza:'criatura_marina', value:0.05}]},
  {id:64, name:'Capybara', rarity:'raro', bonuses:[{mod:'maxhp_flat', value:50},{stat:'fis', value:15}]},
  {id:65, name:'Dire Cat', rarity:'raro', bonuses:[{type:'aumento_dano_posicion', posicion:'retaguardia', value:0.05},{type:'prob_critico', value:0.03}]},
  {id:66, name:'Nail Cat', rarity:'raro', bonuses:[{stat:'hab', value:15},{type:'critico_dano', value:0.05}]},
  {id:67, name:'Cockatrice', rarity:'raro', bonuses:[{type:'aturdir', chance:0.05},{mod:'resistencia_estado', value:10}]},
  {id:68, name:'Harpy', rarity:'raro', bonuses:[{type:'aumento_dano_posicion', posicion:'retaguardia', value:0.05},{type:'evasion_flat', value:0.03}]},
  {id:69, name:'Falaise Eagle', rarity:'raro', bonuses:[{type:'aumento_dano_raza', raza:'humano', value:0.05},{type:'segundo_ataque_basico', chance:0.02}]},
  {id:70, name:'Jade Eagle', rarity:'raro', bonuses:[{mod:'espiritu_flat', value:30},{type:'doble_encantamiento', chance:0.02}]},

  {id:71, name:'Orthrus', rarity:'unico', bonuses:[{type:'aumento_dano', value:0.08},{type:'aumento_dano_raza', raza:'bestia', value:0.05},{type:'critico_dano', value:0.05}]},
  {id:72, name:'Four Armed Bear', rarity:'unico', bonuses:[{mod:'maxhp_flat', value:100},{mod:'defensa_fisica', value:10},{type:'bloqueo', chance:0.05}]},
  {id:73, name:'Oniguma', rarity:'unico', bonuses:[{type:'aumento_dano', value:0.08},{mod:'maxhp_flat', value:100},{type:'reduccion_dano', value:0.05}]},
  {id:74, name:'Steel-armored Great Bear', rarity:'unico', bonuses:[{mod:'maxhp_flat', value:150},{mod:'defensa_fisica', value:15},{type:'bloqueo', chance:0.05}]},
  {id:75, name:'Desolation Spirit Panda', rarity:'unico', bonuses:[{mod:'maxhp_flat', value:100},{mod:'res_magica', value:10},{mod:'resistencia_estado', value:10}]},
  {id:76, name:'Black Wolf Leader', rarity:'unico', bonuses:[{type:'aumento_dano', value:0.10},{type:'aumento_dano_raza', raza:'bestia', value:0.05},{type:'segundo_ataque_basico', chance:0.02}]},
  {id:77, name:'Red Bear', rarity:'unico', bonuses:[{mod:'maxhp_flat', value:120},{type:'aumento_dano', value:0.10},{type:'critico_dano', value:0.05}]},
  {id:78, name:'Great Skeleton Centipede', rarity:'unico', bonuses:[{type:'aumento_dano', value:0.08},{type:'prob_critico', value:0.05},{mod:'resistencia_estado', value:10}]},
  {id:79, name:'Stone Golem', rarity:'unico', bonuses:[{mod:'maxhp_flat', value:200},{mod:'defensa_fisica', value:20},{type:'bloqueo', chance:0.05}]},
  {id:80, name:'Rock Golem', rarity:'unico', bonuses:[{mod:'maxhp_flat', value:150},{mod:'res_magica', value:10},{type:'reduccion_dano', value:0.05}]},
  {id:81, name:'Steel Golem', rarity:'unico', bonuses:[{mod:'maxhp_flat', value:200},{mod:'defensa_fisica', value:15},{mod:'resistencia_estado', value:10}]},
  {id:82, name:'High Octorp', rarity:'unico', bonuses:[{type:'aumento_dano', value:0.10},{type:'retroceso', chance:0.05},{type:'evasion_flat', value:0.03}]},
  {id:83, name:'Octorp Queen', rarity:'unico', bonuses:[{type:'aumento_dano', value:0.08},{mod:'res_magica', value:10},{type:'doble_encantamiento', chance:0.02}]},
  {id:84, name:'Chimera', rarity:'unico', bonuses:[{type:'aumento_dano', value:0.10},{type:'prob_critico', value:0.05},{type:'aumento_dano_posicion', posicion:'retaguardia', value:0.05}]},
  {id:85, name:'Jadar Wyvern', rarity:'unico', bonuses:[{type:'aumento_dano', value:0.12},{type:'aumento_dano_posicion', posicion:'retaguardia', value:0.05},{type:'critico_dano', value:0.05}]},

  {id:86, name:'Jadar Wyvern Leader', rarity:'epico', bonuses:[{type:'aumento_dano', value:0.10},{type:'aumento_dano', value:0.12},{type:'prob_critico', value:0.08}],
    unique:{name:'Succión de vida', desc:'+10% de succión de vida', effect:{kind:'robovida', percent:0.10}}},
  {id:87, name:'Hell Cerberus', rarity:'epico', bonuses:[{type:'aumento_dano', value:0.10},{type:'aumento_dano', value:0.15},{type:'segundo_ataque_basico', chance:0.04}],
    unique:{name:'Recuperación', desc:'Cuando bajas al 30% de HP o menos, recuperas 25% de tu HP máxima (1 vez por combate).', effect:{kind:'hp_threshold_heal', threshold:0.30, healPct:0.25}}},
  {id:88, name:'Fomor', rarity:'epico', bonuses:[{type:'aumento_dano', value:0.10},{mod:'maxhp_flat', value:200},{mod:'defensa_fisica', value:18}],
    unique:{name:'Escudo', desc:'10% de probabilidad al recibir daño de generar un escudo = 5% de tu HP máxima.', effect:{kind:'shield_on_hit', chance:0.10, shieldPct:0.05}}},
  {id:89, name:'Balor', rarity:'epico', bonuses:[{type:'aumento_dano', value:0.10},{type:'aumento_dano', value:0.12},{type:'penetracion_armadura', value:0.08}],
    unique:{name:'Succión de hechizo', desc:'+10% de succión de hechizo', effect:{kind:'succion_hechizo', percent:0.10}}},
  {id:90, name:'Giant Steel Toad', rarity:'epico', bonuses:[{type:'aumento_dano', value:0.10},{mod:'maxhp_flat', value:250},{type:'reduccion_dano', value:0.08}],
    unique:{name:'Recuperación', desc:'Cuando bajas al 30% de HP o menos, recuperas 25% de tu HP máxima (1 vez por combate).', effect:{kind:'hp_threshold_heal', threshold:0.30, healPct:0.25}}},
  {id:91, name:'Griffin', rarity:'epico', bonuses:[{type:'aumento_dano', value:0.10},{type:'prob_critico', value:0.08},{type:'evasion_flat', value:0.05}],
    unique:{name:'Escudo', desc:'10% de probabilidad al recibir daño de generar un escudo = 5% de tu HP máxima.', effect:{kind:'shield_on_hit', chance:0.10, shieldPct:0.05}}},
  {id:92, name:'Grief Charybdis', rarity:'epico', bonuses:[{type:'aumento_dano', value:0.10},{type:'aumento_dano', value:0.12},{type:'doble_encantamiento', chance:0.04}],
    unique:{name:'Recuperación de MP/Espíritu', desc:'Cuando tu MP o Espíritu baja al 20% o menos, recuperas 30% del recurso máximo correspondiente (1 vez por combate).', effect:{kind:'resource_threshold_recovery', threshold:0.20, recoverPct:0.30}}},
  {id:93, name:'Large Vulcan Golden Elephant', rarity:'epico', bonuses:[{type:'aumento_dano', value:0.10},{mod:'maxhp_flat', value:200},{mod:'defensa_fisica', value:20}],
    unique:{name:'Recuperación', desc:'Cuando bajas al 30% de HP o menos, recuperas 25% de tu HP máxima (1 vez por combate).', effect:{kind:'hp_threshold_heal', threshold:0.30, healPct:0.25}}},
  {id:94, name:'Flame Dragon Empress', rarity:'epico', bonuses:[{type:'aumento_dano', value:0.10},{type:'aumento_dano', value:0.15},{type:'prob_critico', value:0.08}],
    unique:{name:'Succión de vida', desc:'+10% de succión de vida', effect:{kind:'robovida', percent:0.10}}},

  {id:95, name:'Thunder Dragon', rarity:'legendario', bonuses:[{type:'aumento_dano', value:0.10},{type:'aumento_dano', value:0.16},{type:'prob_critico', value:0.10},{type:'segundo_ataque_basico', chance:0.06}],
    unique:{name:'Escudo del Trueno', desc:'15% de probabilidad al recibir daño de generar un escudo que absorbe 25% de tu HP máxima.', effect:{kind:'shield_on_hit', chance:0.15, shieldPct:0.25}}},
  {id:96, name:'Thunderstorm Dragon', rarity:'legendario', bonuses:[{type:'aumento_dano', value:0.10},{type:'aumento_dano', value:0.14},{type:'prob_critico', value:0.10},{type:'doble_encantamiento', chance:0.06}],
    unique:{name:'Absorción Arcana', desc:'+30% de succión de hechizo', effect:{kind:'succion_hechizo', percent:0.30}}},
  {id:97, name:'Crimson Dragon Emperor', rarity:'legendario', bonuses:[{type:'aumento_dano', value:0.10},{type:'aumento_dano', value:0.18},{type:'critico_dano', value:0.08},{type:'segundo_ataque_basico', chance:0.06}],
    unique:{name:'Devorador Carmesí', desc:'+30% de succión de vida', effect:{kind:'robovida', percent:0.30}}},
  {id:98, name:'Tatsushirou', rarity:'legendario', bonuses:[{type:'aumento_dano', value:0.10},{mod:'maxhp_flat', value:300},{mod:'defensa_fisica', value:20},{type:'reduccion_dano', value:0.08}],
    unique:{name:'Regeneración del Último Aliento', desc:'Cuando bajas al 30% de HP o menos, recuperas 50% de tu HP máxima (1 vez por combate).', effect:{kind:'hp_threshold_heal', threshold:0.30, healPct:0.50}}},
  {id:99, name:'Grand Leviathan', rarity:'legendario', bonuses:[{type:'aumento_dano', value:0.10},{type:'aumento_dano', value:0.16},{mod:'maxhp_flat', value:250},{type:'doble_encantamiento', chance:0.06}],
    unique:{name:'Reserva Abisal', desc:'Cuando tu MP o Espíritu baja al 20% o menos, recuperas 60% del recurso máximo correspondiente (1 vez por combate).', effect:{kind:'resource_threshold_recovery', threshold:0.20, recoverPct:0.60}}},

  {id:100, name:'Dragon Emperor of Order', rarity:'mitico', bonuses:[{type:'aumento_dano', value:0.10},{type:'aumento_dano', value:0.25},{type:'prob_critico', value:0.15},{type:'segundo_ataque_basico', chance:0.10},{type:'reduccion_dano', value:0.12}],
    unique:{name:'Orden de la Eternidad', desc:'Restauración Imperial: al 30% de HP o menos, recuperas 75% de tu HP máxima y generas un escudo = 40% de tu HP máxima (1 vez por combate). Renacimiento del Emperador: si recibes daño letal, revives con 50% de tu HP máxima y un escudo = 25% de tu HP máxima (1 vez por combate).',
      effect:{kind:'mythic_bundle', heal:{threshold:0.30, healPct:0.75, shieldPct:0.40}, revive:{hpPct:0.50, shieldPct:0.25}}}}
];
function petTpl(id){ return PET_CATALOG.find(p=>p.id===Number(id)); }

// Tags de raza por enemigo, derivados por década (no hace falta etiquetar
// a mano cada una de las ~60 entradas de DECADE_BESTIARY): Década 0 son
// Goblins, 1 Arañas, 2 Bestias, 3 el Usurpador (dobles/impostores, sin tag
// de mascota que le calce), 4 Isla Paraíso (sobrevivientes/mercenarios
// HUMANOS) y 5 El Mar/Storm Gush (criaturas marinas). Se calcula una sola
// vez recorriendo todas las formas que puede tomar una década (regular/
// elite/guardianByFloor objeto-o-array/decadeBoss).
const DECADE_RACE_TAG = ['goblin','arana','bestia',null,'humano','criatura_marina',null,null];
const ENEMY_RACE_TAG = {};
(function buildEnemyRaceTags(){
  DECADE_BESTIARY.forEach((decade, di)=>{
    const tag = DECADE_RACE_TAG[di];
    if(!tag) return;
    const tag1 = (tpl)=>{ if(tpl && tpl.id) ENEMY_RACE_TAG[tpl.id] = tag; };
    (decade.regular||[]).forEach(tag1);
    (decade.elite||[]).forEach(tag1);
    if(decade.guardianByFloor) Object.values(decade.guardianByFloor).forEach(tag1);
    if(decade.decadeBoss) tag1(decade.decadeBoss);
  });
})();

// Slots de mascota equipada — pasivo puro (2026-09-24, pedido explícito):
// base 3, +1 a nivel de personaje 30 (4), +1 al pasar el piso 60 del
// laberinto ("derrotar un Storm Gush", ver maxLevelUnlocked: se vuelve 61
// recién cuando el piso 60 ya se limpió) (5), +1 en piso 80 (6), +1 en
// piso 90 (7 en total, tope).
function maxPetSlots(){
  let n = 3;
  if(state.char.level >= 30) n += 1;
  const maxLvl = state.char.maxLevelUnlocked||1;
  if(maxLvl >= 61) n += 1;
  if(maxLvl >= 81) n += 1;
  if(maxLvl >= 91) n += 1;
  return n;
}
function ensurePets(){
  if(!state.char.pets) state.char.pets = {owned:{}, equipped:[], pendingFreePulls:0};
  if(!state.char.pets.owned) state.char.pets.owned={};
  if(!state.char.pets.equipped) state.char.pets.equipped=[];
  if(!state.char.pets.pendingFreePulls) state.char.pets.pendingFreePulls=0;
}
function ownedPetCount(id){ ensurePets(); return state.char.pets.owned[id]||0; }
function equippedPetIds(){ ensurePets(); return state.char.pets.equipped; }
function equippedPets(){ return equippedPetIds().map(petTpl).filter(Boolean); }
function togglePetEquip(id){
  ensurePets();
  id = Number(id);
  const eq = state.char.pets.equipped;
  const idx = eq.indexOf(id);
  if(idx>=0){ eq.splice(idx,1); return true; }
  if(eq.length >= maxPetSlots()){ log('No tienes más espacios para Caídos del Laberinto disponibles.'); return false; }
  if(ownedPetCount(id)<=0) return false;
  eq.push(id);
  return true;
}
// Suma de bonuses {stat:...} de las mascotas equipadas — usado desde
// baseStat() exactamente como ya suma equipo/piedras.
function petStatSum(key){
  let total = 0;
  equippedPets().forEach(p=> p.bonuses.forEach(b=>{ if(b.stat===key) total += b.value; }));
  return total;
}
// Suma de bonuses {mod:...} — usado desde derived()/totalRes() junto a
// equipModsSum(eq,...).
function petModSum(key){
  let total = 0;
  equippedPets().forEach(p=> p.bonuses.forEach(b=>{ if(b.mod===key) total += b.value; }));
  titleBonuses().forEach(b=>{ if(b.mod===key) total += b.value; }); // título en uso (ver TITLE_BONUSES)
  return total;
}
// Todos los bonuses {type:...} de las mascotas equipadas, en el MISMO
// formato {type, value|chance|percent} que ya consumen specialsFromEquip/
// applyEquippedSpecials/blockChance — se inyectan directo en esos arrays
// (ver el cambio en specialsFromEquip), así que ya heredan toda la lógica
// de combate existente (bloqueo, retroceso, robo de vida, segundo ataque,
// penetración, reducción de daño, doble encantamiento...) sin duplicarla.
function specialsFromPets(){
  const out = [];
  equippedPets().forEach(p=> p.bonuses.forEach(b=>{ if(b.type) out.push(b); }));
  titleBonuses().forEach(b=>{ if(b.type) out.push(b); }); // título en uso (ver TITLE_BONUSES)
  return out;
}
function petUniqueEffects(){
  return equippedPets().filter(p=>p.unique).map(p=>({petId:p.id, name:p.name, unique:p.unique}));
}

// Tiradas de gacha (2026-09-24, pedido explícito): x1 = 10 mil de oro; x10 =
// 100 mil de oro pero entrega 11 tiradas (1 extra de regalo). También se
// puede pagar con Sellos del Laberinto (2026-09-25, pedido explícito) — el
// primer número que propuso ariochbu (20/200) quedaba muy por debajo de lo
// que ya cuestan las cosas en Sellos (equipo Único 350, Épico 700, Forja
// 1500 — ver SELLO_SHOP_SLOTS/TIER_S_RECIPE), así que tras mi recomendación
// quedó en 100/1.000, misma proporción 10x que el oro (sin descuento real,
// solo la tirada de regalo). Sin pity (confirmado explícito, "cada tirada
// es independiente", igual que el espíritu real de MIR4). Duplicado (ya
// tenías esa mascota exacta): desde 2026-09-26 (pedido explícito, de cara
// al futuro sistema de "grabados" por colección completa) YA NO se descarta
// — `owned[id]` es una cantidad real acumulable, no una presencia 0/1. El
// oro de +1000 por duplicado (que existía SOLO porque antes se descartaba
// y había que compensar esa pérdida) se quitó el mismo día por el mismo
// pedido: ya no hay pérdida real que compensar, un duplicado ahora vale
// tanto como cualquier otra tirada (suma al contador).
const GACHA_COST_X1 = 10000;
const GACHA_COST_X10 = 100000; // entrega 11 tiradas
const GACHA_COST_SELLOS_X1 = 100;
const GACHA_COST_SELLOS_X10 = 1000; // entrega 11 tiradas
// x100 (2026-10-03, pedido explícito): diez x10 de una vez — mismo precio por
// tirada y mismo regalo (10 x 11 = 110 Caídos).
const GACHA_COST_X100 = GACHA_COST_X10 * 10;
const GACHA_COST_SELLOS_X100 = GACHA_COST_SELLOS_X10 * 10;
const GACHA_KINDS = {
  x1:   {count:1,   gold:GACHA_COST_X1,   sellos:GACHA_COST_SELLOS_X1,   label:'x1'},
  x10:  {count:11,  gold:GACHA_COST_X10,  sellos:GACHA_COST_SELLOS_X10,  label:'x10 +1'},
  x100: {count:110, gold:GACHA_COST_X100, sellos:GACHA_COST_SELLOS_X100, label:'x100 +10'}
};
function rollPetId(){
  const rarity = pickWeighted(PET_RARITY_ORDER.map(r=>({tpl:r, weight:PET_RARITIES[r].weight})));
  const pool = PET_CATALOG.filter(p=>p.rarity===rarity);
  return pick(pool).id;
}
// Núcleo compartido: tira `count` mascotas y acumula duplicados en el
// contador de cada una (isDup solo queda para el badge "Duplicado" en el
// reveal) — usado tanto por una tirada pagada (pullGacha) como por una tirada gratis
// (grantFreePetPulls, ver el check-in diario) sin duplicar la lógica.
function doPetPulls(count){
  ensurePets();
  const results = [];
  for(let i=0;i<count;i++){
    const id = rollPetId();
    const tpl = petTpl(id);
    const isDup = !!state.char.pets.owned[id];
    // Acumulable (2026-09-26, pedido explícito): un duplicado no se descarta
    // — suma al contador (owned[id] pasa de presencia 0/1 a cantidad real),
    // para que el futuro sistema de "grabados" pueda leer cuántas copias
    // exactas tienes de cada Caído. Ya NO da oro (pedido explícito, mismo
    // día): el oro solo existía para compensar el descarte de antes.
    state.char.pets.owned[id] = (state.char.pets.owned[id]||0) + 1;
    results.push({id, tpl, isDup});
  }
  return results;
}
// pullGacha/grantFreePetPulls guardan con flushSave() (INMEDIATO, no el
// save() debounced de siempre) — pedido explícito 2026-09-26, bug urgente:
// una invocación quedaba solo en memoria hasta que el debounce de 1.5s
// disparara solo; si el jugador cambiaba de personaje o la pestaña se iba a
// segundo plano (el navegador puede suspender/descargar la pestaña, sobre
// todo en móvil) ANTES de que ese timer disparara, la invocación se perdía
// por completo (a veces con el costo ya descontado sin nada a cambio, a
// veces pareciendo que "se las devuelven" porque ni el costo llegó a
// guardarse). Al ser la única acción del juego que gasta oro/Sellos/tiradas
// gratis de forma irreversible para dar algo tan valioso como un Caído del
// Laberinto, no puede depender de un temporizador — se escribe a Supabase
// apenas se resuelve la tirada, antes de que el jugador pueda alejarse.
async function pullGacha(kind, payWith){
  if(!(await checkSessionStillActive())) return null;
  ensurePets();
  payWith = payWith==='sellos' ? 'sellos' : 'gold';
  const k = GACHA_KINDS[kind] || GACHA_KINDS.x1;
  const count = k.count;
  let cost, costLabel;
  if(payWith==='sellos'){
    cost = k.sellos;
    if((state.char.missionCurrency||0) < cost) return null;
    state.char.missionCurrency -= cost;
    costLabel = `${cost.toLocaleString('es')} Sellos del Laberinto`;
  } else {
    cost = k.gold;
    if(state.char.gold < cost) return null;
    state.char.gold -= cost;
    costLabel = `${cost.toLocaleString('es')} de oro`;
  }
  const results = doPetPulls(count);
  const rareCount = results.filter(r=>['epico','legendario','mitico'].includes(r.tpl.rarity)).length;
  log(`Otorgas una ofrenda al árbol (${k.label}, -${costLabel}): consigues ${count} Caído(s) del Laberinto${rareCount?`, ¡${rareCount} de rango Épico o superior!`:''}.`);
  renderSheet();
  await flushSave();
  results.filter(r=> r.tpl.rarity==='mitico' && !r.isDup).forEach(r=> announceMythicSummon(r.id));
  return results;
}
// Tiradas de regalo (check-in diario y otorgadas por admin, ver más abajo)
// — mismo motor de doPetPulls, sin cobrar nada. resuelve YA MISMO (revela
// las mascotas); las que llegan como "pendientes" (ver pets.pendingFreePulls)
// se resuelven recién cuando el jugador las reclama a mano en la Ofrenda.
// También guarda con flushSave() inmediato — mismo motivo que pullGacha().
async function grantFreePetPulls(count){
  ensurePets();
  const results = doPetPulls(count);
  const rareCount = results.filter(r=>['epico','legendario','mitico'].includes(r.tpl.rarity)).length;
  log(`El árbol te concede ${count} ofrenda(s) gratis: consigues ${count} Caído(s) del Laberinto${rareCount?`, ¡${rareCount} de rango Épico o superior!`:''}.`);
  renderSheet();
  await flushSave();
  results.filter(r=> r.tpl.rarity==='mitico' && !r.isDup).forEach(r=> announceMythicSummon(r.id));
  return results;
}

/* ============================================================
   CHECK-IN DIARIO (2026-09-25, pedido explícito, ajustado en el mismo
   pedido) — un reclamo cada 24h, el día calendario cambia a las 00:01 hora
   de Ecuador (mismo huso que ya usa el reloj del header, ver
   ECUADOR_UTC_OFFSET). Si faltas un día no se reinicia — solo se pausa, y
   al volver reclamas el día siguiente al último que reclamaste. La
   recompensa de cada día N es N tiradas gratis a la Ofrenda (día 1 = 1,
   día 30 = 30) — no se resuelven solas: se acumulan en
   pets.pendingFreePulls hasta que el jugador las reclama a mano frente al
   árbol (mismo motor que usa el admin para otorgar tiradas por fuera, p.ej.
   pagos por criptomonedas — ver grantPendingPulls en el panel admin). El
   ciclo entero se reinicia al día 1 el 1 de cada mes (calendario de
   Ecuador), sin importar en qué día se había quedado.
   ============================================================ */
function ecuadorDateStr(date){
  date = date || new Date();
  const shifted = new Date(date.getTime() + ECUADOR_UTC_OFFSET*3600000);
  return shifted.toISOString().slice(0,10); // YYYY-MM-DD, calendario de Ecuador
}
function ensureCheckin(){ if(!state.char.checkin) state.char.checkin = {day:0, lastClaimDate:null}; }
function checkinAvailable(){
  ensureCheckin();
  return state.char.checkin.lastClaimDate !== ecuadorDateStr();
}
// true si el último reclamo fue en un mes calendario distinto al actual
// (hora de Ecuador) — el disparador del reinicio a día 1. La primerísima
// vez (lastClaimDate null) NO cuenta como reinicio, es simplemente el inicio.
function checkinIsNewMonth(){
  ensureCheckin();
  if(!state.char.checkin.lastClaimDate) return false;
  return state.char.checkin.lastClaimDate.slice(0,7) !== ecuadorDateStr().slice(0,7);
}
// Vista previa del día que TOCARÍA reclamar ahora mismo (para pintar la
// cuadrícula antes de hacer clic), sin efectos secundarios.
function checkinPreviewDay(){
  ensureCheckin();
  if(checkinIsNewMonth() || !state.char.checkin.day) return 1;
  return Math.min(30, state.char.checkin.day+1);
}
// Días ya reclamados DENTRO del ciclo vigente (0 si el mes ya rotó y el
// contador guardado quedó "viejo") — lo que la cuadrícula pinta como ✓.
function checkinCycleClaimedDay(){
  return checkinIsNewMonth() ? 0 : (state.char.checkin.day||0);
}
// flushSave() inmediato — mismo motivo que pullGacha()/grantFreePetPulls():
// las ofrendas pendientes que reparte esto son la materia prima de una
// invocación real, así que tampoco deben quedar a merced del debounce.
async function claimCheckin(){
  if(!(await checkSessionStillActive())) return null;
  ensureCheckin();
  if(!checkinAvailable()) return null;
  const day = checkinPreviewDay();
  state.char.checkin.day = day;
  state.char.checkin.lastClaimDate = ecuadorDateStr();
  state.char.pets.pendingFreePulls = (state.char.pets.pendingFreePulls||0) + day;
  log(`Check-in diario (día ${day}/30 de este mes): se suman ${day} ofrenda(s) gratis pendientes en el árbol (total acumulado: ${state.char.pets.pendingFreePulls}).`);
  renderSheet();
  await flushSave();
  return {day, pending: state.char.pets.pendingFreePulls};
}

const POTION_TEMPLATES = {
  vida_menor: {id:'vida_menor', name:'Poción de vida menor', icon:'🧪', desc:'Restaura el 35% de tu vida máxima.', effect:{heal:'hp', amount:0.35}},
  vida_mayor: {id:'vida_mayor', name:'Poción de vida mayor', icon:'🍷', desc:'Restaura el 70% de tu vida máxima.', effect:{heal:'hp', amount:0.7}},
  estamina: {id:'estamina', name:'Tónico de MP', icon:'🥃', desc:'Restaura el 50% de tu MP máximo.', effect:{heal:'sta', amount:0.5}},
  espiritu: {id:'espiritu', name:'Elixir de espíritu', icon:'💠', desc:'Restaura el 50% de tu espíritu máximo.', effect:{heal:'spi', amount:0.5}},
  antidoto: {id:'antidoto', name:'Antídoto', icon:'🌿', desc:'Elimina todos tus efectos negativos activos.', effect:{cure:true}}
};

/* ============================================================
   ITEM RARITY, TIENDA (SHOP) & GUARDIAN REWARDS
   ============================================================ */
// Paleta de rareza (actualizada 2026-09-25, pedido explícito: "implementa
// esos colores" sobre el catálogo de referencia que pasó ariochbu —
// F/Común gris, E/Poco común verde, C/Raro azul, B/Épico magenta, A/
// Legendario violeta, S/Único oro, SS/Mítico rojo). Los NOMBRES de rango
// del juego (Común/Poco común/Raro/Rango B/Rango A/Legendario/SS) no
// cambian — solo se re-mapea el color por posición en la escala para que
// coincida con el catálogo. Como el color se lee en vivo de esta tabla (no
// se guarda por objeto), este cambio recolorea TODO lo que ya existe en
// cualquier inventario sin ninguna migración. Debe reflejarse en espejo en
// SOUL_TIER_COLORS (misma escala, con letras E-SS) — ver comentario ahí.
const RARITIES = {
  comun: {id:'comun', name:'Común', color:'#9a958c'},
  poco_comun: {id:'poco_comun', name:'Poco común', color:'#46c168'},
  raro: {id:'raro', name:'Raro', color:'#3b8fe0'}, // mismo color que SOUL_TIER_COLORS.C — mismo escalón en la misma escala de letras
  rango_b: {id:'rango_b', name:'Rango B', color:'#d6409f'},
  rango_a: {id:'rango_a', name:'Rango A', color:'#9350dd'},
  legendario: {id:'legendario', name:'Legendario', color:'#e0b23f'}, // mismo color que SOUL_TIER_COLORS.S
  ss: {id:'ss', name:'SS', color:'#e0393f'} // mismo color que SOUL_TIER_COLORS.SS
};
// ============================================================
// CATÁLOGO DE ARMAS — recalibración 2026-09-15 (pedido explícito de
// ariochbu). Cada arma con NOMBRE PROPIO tiene su propio valor y sus
// propios efectos especiales por rango — ya no es "un bono genérico por
// senda", cada nombre dentro de una senda se juega distinto a partir de
// Poco Común. En Común (E) todavía no hay diferencia entre nombres: solo
// daño base fijo, tal como se pidió.
// Estructura: WEAPON_CATALOG[styleId][slot][nombre] = [{rank, value, specials}, ...]
// rank usa los mismos ids que RARITIES (comun=E, poco_comun=F, raro=C,
// rango_b=B, rango_a=A). "value" es el bono a WEAPON_CATALOG[styleId].stat.
// "specials" es un array (0, 1 o 2 efectos) — ver aplicación en combate.
function wTier(rank, value, specials, mods){ return {rank, value, specials: specials||[], mods: mods||undefined}; }

// Arma 1 de Mago. Hasta el 2026-10-02 era un pool COMPARTIDO con el
// Sacerdote (mismos nombres y números); con el paso del Mago a Habilidad
// (pedido explícito) dejan de tener sentido juntos — el Mago escala
// Habilidad y paga con MP, el Sacerdote sigue con Espíritu — así que el
// Sacerdote recibe su propia Arma 1 (SACERDOTE_ARMA1, más abajo) y esta
// queda solo para el Mago. Mismos números de siempre; la Vara arcana pasa
// de devolver Espíritu a devolver MP, porque ahora sus habilidades cuestan MP.
//
// TIER S (legendario), pedido explícito 2026-09-24: "libera el tier S, tanto
// para armas como para piedras". Cada arma con nombre propio suma una
// estadística superior MÁS una pasiva de especialización (no solo más
// número) — filosofía documentada en el propio catálogo: el Tier A ya
// diferencia por nombre, Tier S profundiza esa diferencia. Todas las
// pasivas de "firma" (las que no son solo un special ya existente escalado)
// valen 1 vez por combate y 4 turnos de duración cuando aplican un
// buff/debuff temporal — ver fireTierSBuff() y combat.tierSFired. No se
// vende en la Tienda de oro/Sellos normal: solo en la Forja Legendaria (ver
// TIER_S_RECIPE/buyTierSWeapon), desde piso 40+.
const MAGO_ARMA1 = {
  'Vara arcana': [
    wTier('comun', 13),
    wTier('poco_comun', 18, [{type:'mp_refund', chance:0.05, amount:0.5, text:'de recuperar la mitad del MP gastado'}]),
    wTier('raro', 22, [{type:'mp_refund', chance:0.08, amount:0.5, text:'de recuperar la mitad del MP gastado'}]),
    wTier('rango_b', 26, [{type:'mp_refund', chance:0.12, amount:0.5, text:'de recuperar la mitad del MP gastado'}]),
    wTier('rango_a', 30, [{type:'mp_refund', chance:0.15, amount:0.5, text:'de recuperar la mitad del MP gastado'}]),
    wTier('legendario', 43, [{type:'mp_refund', chance:0.20, amount:0.5, text:'de recuperar la mitad del MP gastado'}, {type:'mp_refund_on_apply', chance:0.05, tierSProc:'vara_s', text:'de recuperar todo tu MP al aplicar Quemadura o Ralentizado'}]),
  ],
  'Bastón rúnico': [
    wTier('comun', 13),
    wTier('poco_comun', 18, [{type:'aumento_dano', value:0.05, text:'de aumento de daño'}]),
    wTier('raro', 22, [{type:'aumento_dano', value:0.08, text:'de aumento de daño'}]),
    wTier('rango_b', 26, [{type:'aumento_dano', value:0.10, text:'de aumento de daño'}]),
    wTier('rango_a', 30, [{type:'aumento_dano', value:0.13, text:'de aumento de daño'}]),
    wTier('legendario', 43, [{type:'aumento_dano', value:0.18, text:'de aumento de daño'}, {type:'tier_s_passive', tierSProc:'baston_s', text:'la primera habilidad elemental de cada combate hace +15% de daño'}]),
  ],
};
// Arma 1 propia del Sacerdote (pedido explícito 2026-10-02, documento
// "Propuestas alternativas de armas": Set 3 Cántico de Penitencia y Set 4
// Custodio de las Almas). Escala Espíritu, igual que antes. Sus efectos se
// leen en el turno del aliado Sacerdote (resolveOneAllyTurn): el Cetro
// acompaña al Sacerdote curandero, la Vara a Seraphina (escudos).
const SACERDOTE_ARMA1 = {
  'Cetro de Penitencia': [
    wTier('comun', 13),
    wTier('poco_comun', 18, [{type:'aumento_curacion', value:0.05, text:'de aumento de curación'}]),
    wTier('raro', 22, [{type:'aumento_curacion', value:0.08, text:'de aumento de curación'}]),
    wTier('rango_b', 26, [{type:'aumento_curacion', value:0.10, text:'de aumento de curación'}]),
    wTier('rango_a', 30, [{type:'aumento_curacion', value:0.13, text:'de aumento de curación'}, {type:'penitencia_merma', chance:0.10, reduction:0.05, text:'de que, al curar, el enemigo del frente quede Mermado (-5% de daño) durante 2 turnos'}]),
    wTier('legendario', 43, [{type:'aumento_curacion', value:0.18, text:'de aumento de curación'}, {type:'penitencia_merma', chance:0.15, reduction:0.08, text:'de que, al curar, el enemigo del frente quede Mermado (-8% de daño) durante 2 turnos'}, {type:'penitencia_urgente', reduction:0.08, cooldown:4, text:'curar a alguien por debajo del 35% de vida deja Mermado (-8% de daño) al enemigo del frente durante 2 turnos (cada 4 turnos)'}]),
  ],
  'Vara de la Salvaguarda': [
    wTier('comun', 13),
    wTier('poco_comun', 18, [{type:'aumento_escudo', value:0.05, text:'de potencia de escudos'}]),
    wTier('raro', 22, [{type:'aumento_escudo', value:0.08, text:'de potencia de escudos'}]),
    wTier('rango_b', 26, [{type:'aumento_escudo', value:0.10, text:'de potencia de escudos'}]),
    wTier('rango_a', 30, [{type:'aumento_escudo', value:0.12, text:'de potencia de escudos'}, {type:'espiritu_al_escudar', chance:0.10, amount:5, text:'de recuperar 5 de Espíritu al colocar un escudo'}]),
    wTier('legendario', 43, [{type:'aumento_escudo', value:0.15, text:'de potencia de escudos'}, {type:'espiritu_al_escudar', chance:0.15, amount:5, text:'de recuperar 5 de Espíritu al colocar un escudo'}, {type:'escudo_renovado', chance:0.20, pct:0.05, text:'de que, al romperse un escudo de tu grupo, aparezca al instante otro del 5% de la vida máxima de quien lo llevaba'}]),
  ],
};

const WEAPON_CATALOG = {
  pesada: {
    stat:'fis',
    arma: {
      'Martillo de guerra': [
        wTier('comun', 12),
        wTier('poco_comun', 20, [{type:'aturdir_retardado', chance:0.08, text:'de aturdir al oponente (su próximo turno)'}]),
        wTier('raro', 27, [{type:'aturdir_retardado', chance:0.14, text:'de aturdir al oponente (su próximo turno)'}]),
        wTier('rango_b', 33, [{type:'aturdir_retardado', chance:0.20, text:'de aturdir al oponente (su próximo turno)'}]),
        wTier('rango_a', 42, [{type:'aturdir_retardado', chance:0.20, text:'de aturdir al oponente (su próximo turno)'}, {type:'aumento_dano', value:0.05, text:'de aumento de daño contra monstruos'}]),
        wTier('legendario', 50, [{type:'aturdir_retardado', chance:0.25, text:'de aturdir al oponente (su próximo turno)', tierSProc:'martillo_s'}, {type:'aumento_dano', value:0.08, text:'de aumento de daño contra monstruos'}]),
      ],
      'Maza de combate': [
        wTier('comun', 12),
        wTier('poco_comun', 19, [{type:'retroceso', chance:0.12, text:'de aplicar retroceso'}]),
        wTier('raro', 26, [{type:'retroceso', chance:0.18, text:'de aplicar retroceso'}]),
        wTier('rango_b', 30, [{type:'retroceso', chance:0.22, text:'de aplicar retroceso'}]),
        wTier('rango_a', 38, [{type:'retroceso', chance:0.18, text:'de aplicar retroceso'}, {type:'reduccion_dano', value:0.05, text:'de reducción de daño recibido'}]),
        wTier('legendario', 46, [{type:'retroceso', chance:0.25, text:'de aplicar retroceso'}, {type:'reduccion_dano', value:0.08, text:'de reducción de daño recibido'}, {type:'debilitar_enemigo', chance:0.10, tierSProc:'maza_s', text:'de reducir el ataque del enemigo un 15% durante 4 turnos'}]),
      ],
      'Espadón pesado': [
        wTier('comun', 12),
        wTier('poco_comun', 19, [{type:'bloqueo', chance:0.05, text:'de bloquear ataque'}]),
        wTier('raro', 26, [{type:'bloqueo', chance:0.09, text:'de bloquear ataque'}]),
        wTier('rango_b', 30, [{type:'bloqueo', chance:0.12, text:'de bloquear ataque'}]),
        wTier('rango_a', 37, [{type:'bloqueo', chance:0.12, text:'de bloquear ataque'}, {type:'reduccion_dano', value:0.05, text:'de reducción de daño recibido'}]),
        wTier('legendario', 45, [{type:'bloqueo', chance:0.15, text:'de bloquear ataque', tierSProc:'espadon_s'}, {type:'reduccion_dano', value:0.08, text:'de reducción de daño recibido'}]),
      ],
    },
    arma2: {
      'Escudo de hierro': [
        wTier('comun', 0, [{type:'bloqueo', chance:0.10, text:'de bloquear ataque'}]),
        wTier('poco_comun', 0, [{type:'bloqueo', chance:0.12, text:'de bloquear ataque'}]),
        wTier('raro', 0, [{type:'bloqueo', chance:0.16, text:'de bloquear ataque'}]),
        wTier('rango_b', 0, [{type:'bloqueo', chance:0.18, text:'de bloquear ataque'}]),
        wTier('rango_a', 0, [{type:'bloqueo', chance:0.18, text:'de bloquear ataque'}, {type:'reflect', pct:0.10, text:'de devolver el daño recibido'}]),
        wTier('legendario', 0, [{type:'bloqueo', chance:0.20, text:'de bloquear ataque'}, {type:'reflect', pct:0.15, text:'de devolver el daño recibido'}, {type:'defend_bloqueo_bonus', value:0.10, text:'de bloqueo extra mientras te Defiendes'}], {maxhp_flat:50}),
      ],
    },
  },
  // 2026-10-02: Asesino pasa a ser 100% Físico (ver STYLES.doblefilo) —
  // mismos números, solo cambia el stat que alimentan.
  doblefilo: {
    stat:'fis',
    arma: {
      'Daga curva': [
        wTier('comun', 7),
        wTier('poco_comun', 10, [{type:'sangrado', chance:0.12, text:'de aplicar sangrado 2 turnos'}]),
        wTier('raro', 13, [{type:'sangrado', chance:0.15, text:'de aplicar sangrado 2 turnos'}]),
        wTier('rango_b', 17, [{type:'sangrado', chance:0.20, text:'de aplicar sangrado 2 turnos'}]),
        wTier('rango_a', 20, [{type:'sangrado', chance:0.20, text:'de aplicar sangrado 2 turnos'}, {type:'succion_hechizo', percent:0.10, text:'succión de hechizo (solo habilidades)'}]),
        wTier('legendario', 27, [{type:'sangrado', chance:0.25, duration:4, text:'de aplicar sangrado 4 turnos', tierSProc:'daga_s'}, {type:'succion_hechizo', percent:0.15, text:'succión de hechizo (solo habilidades)'}]),
      ],
      'Cuchillo largo': [
        wTier('comun', 7),
        wTier('poco_comun', 12, [{type:'sangrado', chance:0.05, text:'de aplicar sangrado 2 turnos'}]),
        wTier('raro', 15, [{type:'sangrado', chance:0.08, text:'de aplicar sangrado 2 turnos'}]),
        wTier('rango_b', 20, [{type:'sangrado', chance:0.12, text:'de aplicar sangrado 2 turnos'}]),
        wTier('rango_a', 24, [{type:'sangrado', chance:0.12, text:'de aplicar sangrado 2 turnos'}, {type:'silencio', chance:0.10, text:'de aplicar silencio al enemigo'}]),
        wTier('legendario', 31, [{type:'sangrado', chance:0.15, duration:4, text:'de aplicar sangrado 4 turnos'}, {type:'silencio', chance:0.15, text:'de aplicar silencio al enemigo'}, {type:'tier_s_passive', tierSProc:'cuchillo_s', text:'objetivos por debajo del 25% de vida reciben +20% de daño'}]),
      ],
    },
    arma2: {
      'Daga gemela': [
        wTier('comun', 7),
        wTier('poco_comun', 10, [{type:'sangrado', chance:0.12, text:'de aplicar sangrado 2 turnos'}]),
        wTier('raro', 13, [{type:'sangrado', chance:0.15, text:'de aplicar sangrado 2 turnos'}]),
        wTier('rango_b', 17, [{type:'sangrado', chance:0.20, text:'de aplicar sangrado 2 turnos'}]),
        wTier('rango_a', 20, [{type:'sangrado', chance:0.20, text:'de aplicar sangrado 2 turnos'}, {type:'succion_hechizo', percent:0.10, text:'succión de hechizo (solo habilidades)'}]),
        wTier('legendario', 27, [{type:'sangrado', chance:0.25, duration:4, text:'de aplicar sangrado 4 turnos', tierSProc:'daga_s'}, {type:'succion_hechizo', percent:0.15, text:'succión de hechizo (solo habilidades)'}]),
      ],
      'Cuchillo gemelo': [
        wTier('comun', 7),
        wTier('poco_comun', 12, [{type:'sangrado', chance:0.05, text:'de aplicar sangrado 2 turnos'}]),
        wTier('raro', 15, [{type:'sangrado', chance:0.08, text:'de aplicar sangrado 2 turnos'}]),
        wTier('rango_b', 20, [{type:'sangrado', chance:0.12, text:'de aplicar sangrado 2 turnos'}]),
        wTier('rango_a', 24, [{type:'sangrado', chance:0.12, text:'de aplicar sangrado 2 turnos'}, {type:'silencio', chance:0.10, text:'de aplicar silencio al enemigo'}]),
        wTier('legendario', 31, [{type:'sangrado', chance:0.15, duration:4, text:'de aplicar sangrado 4 turnos'}, {type:'silencio', chance:0.15, text:'de aplicar silencio al enemigo'}, {type:'tier_s_passive', tierSProc:'cuchillo_s', text:'objetivos por debajo del 25% de vida reciben +20% de daño'}]),
      ],
    },
  },
  tirador: {
    stat:'fis',
    arma: {
      'Arco corto': [
        wTier('comun', 10),
        wTier('poco_comun', 16, [{type:'robovida', percent:0.10, text:'de robo de vida (solo ataque básico)'}]),
        wTier('raro', 20, [{type:'robovida', percent:0.12, text:'de robo de vida (solo ataque básico)'}]),
        wTier('rango_b', 25, [{type:'robovida', percent:0.15, text:'de robo de vida (solo ataque básico)'}]),
        wTier('rango_a', 30, [{type:'robovida', percent:0.15, text:'de robo de vida (solo ataque básico)'}, {type:'segundo_ataque_basico', chance:0.10, text:'de realizar un segundo ataque básico'}]),
        wTier('legendario', 40, [{type:'robovida', percent:0.20, text:'de robo de vida (solo ataque básico)'}, {type:'segundo_ataque_basico', chance:0.10, tierSProc:'arcocorto_s', text:'de realizar un segundo ataque básico que además cura 3% de tu vida máxima'}]),
      ],
      'Arco largo': [
        wTier('comun', 10),
        wTier('poco_comun', 18, [{type:'penetracion_armadura', value:0.10, text:'de penetración de armadura'}]),
        wTier('raro', 23, [{type:'penetracion_armadura', value:0.12, text:'de penetración de armadura'}]),
        wTier('rango_b', 29, [{type:'penetracion_armadura', value:0.15, text:'de penetración de armadura'}]),
        wTier('rango_a', 35, [{type:'penetracion_armadura', value:0.15, text:'de penetración de armadura'}, {type:'aumento_dano', value:0.05, text:'de aumento de daño'}]),
        wTier('legendario', 44, [{type:'penetracion_armadura', value:0.20, text:'de penetración de armadura'}, {type:'aumento_dano', value:0.08, text:'de aumento de daño'}, {type:'tier_s_passive', tierSProc:'arcolargo_s', text:'objetivos por encima del 70% de vida reciben +15% de daño'}]),
      ],
    },
    arma2: {
      'Carcaj de cuero': [
        wTier('comun', 10),
        wTier('poco_comun', 14, [{type:'robovida', percent:0.10, text:'de robo de vida (solo ataque básico)'}]),
        wTier('raro', 18, [{type:'robovida', percent:0.12, text:'de robo de vida (solo ataque básico)'}]),
        wTier('rango_b', 22, [{type:'robovida', percent:0.15, text:'de robo de vida (solo ataque básico)'}]),
        wTier('rango_a', 26, [{type:'robovida', percent:0.15, text:'de robo de vida (solo ataque básico)'}, {type:'segundo_ataque_basico', chance:0.10, text:'de realizar un segundo ataque básico'}]),
        wTier('legendario', 40, [{type:'robovida', percent:0.20, text:'de robo de vida (solo ataque básico)'}, {type:'segundo_ataque_basico', chance:0.10, tierSProc:'carcaj_s', text:'de realizar un segundo ataque básico con 10% de probabilidad de ignorar 50% de resistencia física'}]),
      ],
    },
  },
  mago: {
    stat:'hab',
    arma: MAGO_ARMA1,
    arma2: {
      'Foco arcano': [
        wTier('comun', 10),
        wTier('poco_comun', 15, [{type:'doble_encantamiento', chance:0.05, text:'de realizar doble encantamiento'}]),
        wTier('raro', 20, [{type:'doble_encantamiento', chance:0.08, text:'de realizar doble encantamiento'}]),
        wTier('rango_b', 24, [{type:'doble_encantamiento', chance:0.12, text:'de realizar doble encantamiento'}]),
        wTier('rango_a', 28, [{type:'doble_encantamiento', chance:0.15, text:'de realizar doble encantamiento'}]),
        wTier('legendario', 38, [{type:'doble_encantamiento', chance:0.20, text:'de realizar doble encantamiento'}, {type:'tier_s_passive', tierSProc:'foco_s', text:'cuando una habilidad consume un estado (combo), +10% de daño'}]),
      ],
    },
  },
  // Sacerdote no es un estilo de combate del jugador — solo existe para que
  // los aliados de ese rol tengan su propia arma. Desde el 2026-10-02 su
  // arma 1 también es propia (SACERDOTE_ARMA1), no la del Mago.
  sacerdote: {
    stat:'esp',
    arma: SACERDOTE_ARMA1,
    arma2: {
      'Grimorio de plegarias': [
        wTier('comun', 10),
        wTier('poco_comun', 15, [{type:'bendecido_dur', text:'Aumenta la duración de Bendecido a 3 turnos'}]),
        wTier('raro', 20, [{type:'bendecido_dur', text:'Aumenta la duración de Bendecido a 3 turnos'}]),
        wTier('rango_b', 24, [{type:'bendecido_dur', text:'Aumenta la duración de Bendecido a 3 turnos'}]),
        // Ojo: el número del debuff "aumento de daño recibido" no vino especificado
        // en el pedido original — usé 10% como valor razonable por defecto.
        wTier('rango_a', 28, [{type:'bendecido_dur', text:'Aumenta la duración de Bendecido a 3 turnos'}, {type:'dano_recibido_debuff', value:0.10, text:'de aumento de daño recibido al enemigo bendecido, por 2 turnos'}]),
        // Tier S: sube Bendecido a 4 turnos y agrega "Bendición" (2026-09-25:
        // ya existe el buff genérico — ver fireTierSBuff/'Bendición' en
        // resolveOneAllyTurn) — al bendecir a un enemigo, el propio Sacerdote
        // se fortalece: +20% de resistencias y -10% de daño recibido, 4
        // turnos, 1 vez por combate.
        wTier('legendario', 38, [{type:'bendecido_dur', duration:4, text:'Aumenta la duración de Bendecido a 4 turnos'}, {type:'dano_recibido_debuff', value:0.15, text:'de aumento de daño recibido al enemigo bendecido, por 2 turnos'}, {type:'bendicion_propia', resBonus:20, dmgReduction:0.10, tierSProc:'grimorio_s', text:'te da +20% de resistencias y -10% de daño recibido durante 4 turnos al bendecir a un enemigo'}]),
      ],
      'Tomo sagrado': [
        wTier('comun', 10),
        wTier('poco_comun', 15, [{type:'aumento_curacion', value:0.05, text:'de aumento de curación'}]),
        wTier('raro', 20, [{type:'aumento_curacion', value:0.08, text:'de aumento de curación'}]),
        wTier('rango_b', 24, [{type:'aumento_curacion', value:0.12, text:'de aumento de curación'}]),
        wTier('rango_a', 28, [{type:'aumento_curacion', value:0.12, text:'de aumento de curación'}, {type:'dano_aliado_curado', value:0.05, text:'de aumento de daño al aliado curado, por 2 turnos'}]),
        // Tier S: sube curación y daño al curado, y agrega la pasiva de
        // escudo (2026-09-25: ya existe un sistema genérico de escudo, ver
        // grantShield()/combat.playerShield/ally.shield) — si cura a
        // alguien por debajo del 40% de vida, 15% de probabilidad de darle
        // además un escudo = 8% de su vida máxima.
        wTier('legendario', 38, [{type:'aumento_curacion', value:0.18, text:'de aumento de curación'}, {type:'dano_aliado_curado', value:0.05, text:'de aumento de daño al aliado curado, por 2 turnos'}, {type:'escudo_en_curacion', chance:0.15, shieldPct:0.08, tierSProc:'tomo_s', text:'de aplicar un escudo = 8% de la vida máxima al curar a alguien por debajo del 40% de vida'}]),
      ],
    },
  },
  // Paladín y Hechicero — catálogo definitivo (pedido explícito 2026-10-02,
  // documento "Propuestas alternativas de armas"; de las 3 alternativas por
  // clase se eligieron 2 sets). Reemplaza al catálogo provisorio de un arma
  // por slot (Espada del Juramento / Escudo Sagrado / Cetro Maldito / Orbe
  // de la Maldición) — los objetos que ya existan con esos nombres se
  // renombran solos al cargar (ver WEAPON_RENAMES).
  // Escala de referencia del documento: Arma 1 +13/18/22/26/30/43, Arma 2
  // +10/15/20/24/28/38. "Debilitado" en estos textos = el enemigo tiene
  // Debilitado o Mermado (ver isEnemyWeakened).
  paladin: {
    stat:'esp',
    arma: {
      // Set 3 — Guardián de la Luz: mitigación y Muro de Fe como eje.
      'Maza del Guardián': [
        wTier('comun', 13),
        wTier('poco_comun', 18, [{type:'reduccion_dano', value:0.03, text:'de reducción de daño recibido'}]),
        wTier('raro', 22, [{type:'reduccion_dano', value:0.05, text:'de reducción de daño recibido'}]),
        wTier('rango_b', 26, [{type:'reduccion_dano', value:0.07, text:'de reducción de daño recibido'}]),
        wTier('rango_a', 30, [{type:'reduccion_dano', value:0.08, text:'de reducción de daño recibido'}, {type:'muro_fe_extend', chance:0.15, text:'de que Muro de Fe dure 1 turno más'}]),
        wTier('legendario', 43, [{type:'reduccion_dano', value:0.10, text:'de reducción de daño recibido'}, {type:'muro_fe_extend', chance:0.25, text:'de que Muro de Fe dure 1 turno más'}, {type:'muro_fe_espiritu', amount:6, text:'al usar Muro de Fe recuperas 6 de Espíritu'}]),
      ],
      // Set 5 — Heraldo del Juicio: tanque/debuffer ofensivo.
      'Espada del Heraldo': [
        wTier('comun', 13),
        wTier('poco_comun', 18, [{type:'aumento_dano_habilidad', value:0.05, text:'de daño de habilidades'}]),
        wTier('raro', 22, [{type:'aumento_dano_habilidad', value:0.08, text:'de daño de habilidades'}]),
        wTier('rango_b', 26, [{type:'aumento_dano_habilidad', value:0.10, text:'de daño de habilidades'}]),
        wTier('rango_a', 30, [{type:'aumento_dano_habilidad', value:0.13, text:'de daño de habilidades'}, {type:'heraldo_merma', chance:0.10, reduction:0.05, text:'de que Golpe Consagrado deje al enemigo Mermado (-5% de daño) durante 2 turnos'}]),
        wTier('legendario', 43, [{type:'aumento_dano_habilidad', value:0.18, text:'de daño de habilidades'}, {type:'heraldo_merma', chance:0.15, reduction:0.08, text:'de que Golpe Consagrado deje al enemigo Mermado (-8% de daño) durante 2 turnos'}, {type:'juicio_merma', reduction:0.10, text:'Juicio Divino deja Mermados (-10% de daño) a todos los enemigos golpeados durante 2 turnos'}]),
      ],
    },
    arma2: {
      'Escudo de la Vigilia': [
        wTier('comun', 10, [{type:'bloqueo', chance:0.06, text:'de bloquear ataque'}]),
        wTier('poco_comun', 15, [{type:'bloqueo', chance:0.08, text:'de bloquear ataque'}]),
        wTier('raro', 20, [{type:'bloqueo', chance:0.10, text:'de bloquear ataque'}]),
        wTier('rango_b', 24, [{type:'bloqueo', chance:0.12, text:'de bloquear ataque'}]),
        wTier('rango_a', 28, [{type:'bloqueo', chance:0.12, text:'de bloquear ataque'}, {type:'cura_al_bloquear', pct:0.02, text:'de tu vida máxima recuperada al bloquear'}]),
        // El documento dice "el primer bloqueo del combate reduce 20%
        // adicional ese golpe", pero en este juego un bloqueo YA anula el
        // golpe entero — no queda daño que reducir. Adaptado: tras el primer
        // bloqueo del combate, el SIGUIENTE golpe recibido hace -20%.
        wTier('legendario', 38, [{type:'bloqueo', chance:0.15, text:'de bloquear ataque'}, {type:'cura_al_bloquear', pct:0.03, text:'de tu vida máxima recuperada al bloquear'}, {type:'vigilia_guardia', reduction:0.20, tierSProc:'vigilia_s', text:'tras tu primer bloqueo del combate, el siguiente golpe que recibas hace -20% de daño'}]),
      ],
      'Sello de la Sentencia': [
        wTier('comun', 10),
        wTier('poco_comun', 15, [{type:'dano_vs_debilitado', value:0.05, text:'de daño contra enemigos debilitados'}]),
        wTier('raro', 20, [{type:'dano_vs_debilitado', value:0.08, text:'de daño contra enemigos debilitados'}]),
        wTier('rango_b', 24, [{type:'dano_vs_debilitado', value:0.10, text:'de daño contra enemigos debilitados'}]),
        wTier('rango_a', 28, [{type:'dano_vs_debilitado', value:0.12, text:'de daño contra enemigos debilitados'}, {type:'cura_vs_debilitado', value:0.05, text:'más de curación de Golpe Consagrado contra enemigos debilitados'}]),
        wTier('legendario', 38, [{type:'dano_vs_debilitado', value:0.15, text:'de daño contra enemigos debilitados'}, {type:'cura_vs_debilitado', value:0.08, text:'más de curación de Golpe Consagrado contra enemigos debilitados'}, {type:'espiritu_vs_debilitado', amount:5, text:'Golpe Consagrado contra un enemigo debilitado te devuelve 5 de Espíritu'}]),
      ],
    },
  },
  hechicero: {
    stat:'hab',
    arma: {
      // Set 3 — Maldición de la Ruina: vulnerabilidad y castigo por estados.
      'Vara de la Ruina': [
        wTier('comun', 13),
        wTier('poco_comun', 18, [{type:'dano_vs_estado', value:0.03, text:'de daño contra enemigos con algún estado negativo'}]),
        wTier('raro', 22, [{type:'dano_vs_estado', value:0.05, text:'de daño contra enemigos con algún estado negativo'}]),
        wTier('rango_b', 26, [{type:'dano_vs_estado', value:0.08, text:'de daño contra enemigos con algún estado negativo'}]),
        wTier('rango_a', 30, [{type:'dano_vs_estado', value:0.10, text:'de daño contra enemigos con algún estado negativo'}, {type:'ruina_resistencias', chance:0.10, resPenalty:5, text:'de que, al aplicar un estado, el objetivo pierda 5 de todas sus resistencias durante 2 turnos'}]),
        wTier('legendario', 43, [{type:'dano_vs_estado', value:0.15, text:'de daño contra enemigos con algún estado negativo'}, {type:'ruina_resistencias', chance:0.15, resPenalty:8, text:'de que, al aplicar un estado, el objetivo pierda 8 de todas sus resistencias durante 2 turnos'}, {type:'dano_vs_multiestado', value:0.05, text:'de daño adicional contra enemigos con 2 o más estados negativos'}]),
      ],
      // Set 4 — Devorador de Almas: economía de MP y rotaciones largas.
      // ("Estamina" en el documento = MP en el juego, ver COST_LABELS.)
      'Cetro del Devorador': [
        wTier('comun', 13),
        wTier('poco_comun', 18, [{type:'mp_al_aplicar_estado', chance:0.05, amount:4, text:'de recuperar 4 de MP al aplicar un estado'}]),
        wTier('raro', 22, [{type:'mp_al_aplicar_estado', chance:0.08, amount:4, text:'de recuperar 4 de MP al aplicar un estado'}]),
        wTier('rango_b', 26, [{type:'mp_al_aplicar_estado', chance:0.12, amount:4, text:'de recuperar 4 de MP al aplicar un estado'}]),
        wTier('rango_a', 30, [{type:'mp_al_aplicar_estado', chance:0.15, amount:4, text:'de recuperar 4 de MP al aplicar un estado'}, {type:'mp_al_rematar', amount:6, text:'derrotar a un enemigo con algún estado negativo te devuelve 6 de MP'}]),
        wTier('legendario', 43, [{type:'mp_al_aplicar_estado', chance:0.18, amount:4, text:'de recuperar 4 de MP al aplicar un estado'}, {type:'mp_al_rematar', amount:10, text:'derrotar a un enemigo con algún estado negativo te devuelve 10 de MP'}, {type:'control_descuento', amount:5, text:'la primera habilidad de control de cada combate cuesta 5 de MP menos'}]),
      ],
    },
    arma2: {
      'Libro de las Maldiciones': [
        wTier('comun', 10),
        wTier('poco_comun', 15, [{type:'estado_extra_turno', chance:0.05, text:'de que tus estados negativos duren 1 turno más'}]),
        wTier('raro', 20, [{type:'estado_extra_turno', chance:0.08, text:'de que tus estados negativos duren 1 turno más'}]),
        wTier('rango_b', 24, [{type:'estado_extra_turno', chance:0.12, text:'de que tus estados negativos duren 1 turno más'}]),
        wTier('rango_a', 28, [{type:'estado_extra_turno', chance:0.15, text:'de que tus estados negativos duren 1 turno más'}, {type:'estado_merma', reduction:0.03, text:'aplicar un estado deja al enemigo Mermado (-3% de daño) durante 2 turnos'}]),
        wTier('legendario', 38, [{type:'estado_extra_turno', chance:0.20, text:'de que tus estados negativos duren 1 turno más'}, {type:'estado_merma', reduction:0.05, text:'aplicar un estado deja al enemigo Mermado (-5% de daño) durante 2 turnos'}, {type:'primer_estado_garantizado', tierSProc:'libro_s', text:'la primera alteración negativa que apliques en cada combate dura 1 turno más, garantizado'}]),
      ],
      'Orbe de las Almas': [
        wTier('comun', 10),
        wTier('poco_comun', 15, [{type:'dano_por_estado', value:0.03, max:3, text:'de daño por cada estado negativo distinto del objetivo (máx. 3)'}]),
        wTier('raro', 20, [{type:'dano_por_estado', value:0.04, max:3, text:'de daño por cada estado negativo distinto del objetivo (máx. 3)'}]),
        wTier('rango_b', 24, [{type:'dano_por_estado', value:0.05, max:3, text:'de daño por cada estado negativo distinto del objetivo (máx. 3)'}]),
        wTier('rango_a', 28, [{type:'dano_por_estado', value:0.05, max:3, text:'de daño por cada estado negativo distinto del objetivo (máx. 3)'}, {type:'mp_vs_multiestado', chance:0.10, amount:3, text:'de recuperar 3 de MP al dañar a un enemigo con 2+ estados'}]),
        wTier('legendario', 38, [{type:'dano_por_estado', value:0.06, max:3, text:'de daño por cada estado negativo distinto del objetivo (máx. 3)'}, {type:'mp_vs_multiestado', chance:0.15, amount:3, text:'de recuperar 3 de MP al dañar a un enemigo con 2+ estados'}, {type:'abismo_mp', amount:10, text:'Grito del Abismo te devuelve 10 de MP si el objetivo tenía 2+ estados'}]),
      ],
    },
  },
};
// Nombres de armas que ya no existen en el catálogo -> su reemplazo. Sin
// esto, refreshGearFromTemplate() (que re-deriva cada objeto guardado del
// catálogo vigente al cargar) caería en makeWeaponItem con un nombre
// inexistente y le asignaría un nombre AL AZAR distinto en cada recarga.
// Clave: styleId -> slot -> nombre viejo -> nombre nuevo. Cada reemplazo se
// eligió por identidad parecida (defensa -> defensa, MP -> MP, etc).
const WEAPON_RENAMES = {
  paladin: {
    arma: {'Espada del Juramento':'Maza del Guardián'},
    arma2: {'Escudo Sagrado':'Escudo de la Vigilia'},
  },
  hechicero: {
    arma: {'Cetro Maldito':'Cetro del Devorador'},
    arma2: {'Orbe de la Maldición':'Orbe de las Almas'},
  },
  // Sacerdote: Vara arcana devolvía recursos -> Vara de la Salvaguarda
  // (recupera Espíritu); Bastón rúnico era daño plano -> Cetro de Penitencia.
  sacerdote: {
    arma: {'Vara arcana':'Vara de la Salvaguarda', 'Bastón rúnico':'Cetro de Penitencia'},
  },
};
const OFFHAND_LABELS = {pesada:'Escudo', doblefilo:'Arma 2', tirador:'Carcaj', mago:'Foco', sacerdote:'Grimorio', paladin:'Escudo', hechicero:'Orbe'};
// rol de aliado -> senda de arma (WEAPON_CATALOG). Los 4 primeros calzan
// 1-a-1 con las sendas de combate del jugador; sacerdote no tiene
// equivalente entre esos 4, así que tiene su propia entrada en el catálogo.
const ALLY_ROLE_TO_WEAPON_STYLE = {guerrero:'pesada', arquero:'tirador', asesino:'doblefilo', mago:'mago', sacerdote:'sacerdote'};
function weaponEntry(styleId, slot, name, rank){
  const cat = WEAPON_CATALOG[styleId];
  const pool = cat && cat[slot] && cat[slot][name];
  return pool ? pool.find(e=>e.rank===rank) : null;
}
function makeWeaponItem(slot, styleId, rank, name){
  const cat = WEAPON_CATALOG[styleId];
  if(!cat || !cat[slot]) return null;
  const names = Object.keys(cat[slot]);
  const renamed = name && WEAPON_RENAMES[styleId] && WEAPON_RENAMES[styleId][slot] && WEAPON_RENAMES[styleId][slot][name];
  if(renamed) name = renamed;
  const chosenName = (name && cat[slot][name]) ? name : pick(names);
  const entry = weaponEntry(styleId, slot, chosenName, rank);
  if(!entry) return null;
  const item = {kind:'equip', slot, name:chosenName, bonus:{stat:cat.stat, value:entry.value}, rarity:rank, styleId};
  if(entry.specials && entry.specials.length) item.specials = entry.specials.map(s=>Object.assign({}, s));
  if(entry.mods) item.mods = Object.assign({}, entry.mods);
  return item;
}

// ============================================================
// Orden de rangos del equipo (lo usan conjuntos, armas y el equipo
// automático). El catálogo viejo de equipo por senda (Casco de piedra...
// Placa de vacío, CASCO_TIERS/ARMADURA_TIERS/...) se ELIMINÓ el 2026-10-02:
// quedó retirado al pasar todo el equipo general a Voluntad Inquebrantable
// y ya nada lo leía.
// ============================================================
const GEAR_RANK_ORDER = ['comun','poco_comun','raro','rango_b','rango_a','legendario'];
// 2026-10-02 (pedido explícito): el equipo general por senda (Casco de
// piedra/bronce..., Túnica..., etc.) queda RETIRADO por completo. Todo lo que
// antes generaba esa pieza (tienda de oro y de Sellos, botín, kit inicial,
// equipo automático del Sacerdote) ahora da la pieza equivalente del conjunto
// Voluntad Inquebrantable, del mismo slot y rango. styleId se ignora.
function makeGearItem(slot, styleId, rank){
  return makeSetItem('voluntad', slot, rank);
}

// ============================================================
// CONJUNTOS DE EQUIPAMIENTO F–S (pedido explícito 2026-10-02, documentos
// "Conjuntos de Equipamiento F a S" + "Estadísticas de Equipamientos F a S
// CORREGIDO", con los cambios de Vigor/Agilidad aprobados ese mismo día:
// Yelmo y Guanteletes del Guardián dan Vigor (no Vida/Físico), los Pasos de
// Jack y de Artemisa dan Agilidad (no % de evasión plano, que queda solo en
// A/S), y los Guanteletes de la Voluntad dan Vigor + Agilidad).
//
// - El conjunto y el rango son independientes: piezas de rangos distintos
//   cuentan igual para activar los bonos de 2/3/5 piezas.
// - Las piezas NO tienen senda (styleId): cualquiera puede equiparlas, la
//   "afinidad" es solo una guía. Se identifican por item.setId.
// - Rango del documento -> rango interno: F=comun, E=poco_comun, C=raro,
//   B=rango_b, A=rango_a, S=legendario (mismo orden que GEAR_RANK_ORDER).
// - Estadísticas -> claves del juego: fis/hab/esp/agi/vig (stats, ver
//   baseStat), maxhp_flat (HP), mp_flat (MP), precision, fortaleza_mental
//   (R. Mental), res_magica (RM), res_fisica (RF), y como specials:
//   evasion_flat, reduccion_dano, aumento_dano, aumento_dano_habilidad,
//   aumento_dano_basico, penetracion_armadura/magica, sangrado, prob_estados,
//   aumento_curacion, aumento_escudo, bloqueo.
// ============================================================
const SET_STAT_MODS = new Set(['fis','hab','esp','agi','vig','maxhp_flat','mp_flat','precision','fortaleza_mental','res_magica','res_fisica']);
const SET_SPECIAL_DEFS = {
  evasion:   v=>({type:'evasion_flat', value:v, text:'de evasión'}),
  reduccion: v=>({type:'reduccion_dano', value:v, text:'de reducción de daño recibido'}),
  dano:      v=>({type:'aumento_dano', value:v, text:'de aumento de daño'}),
  dano_hab:  v=>({type:'aumento_dano_habilidad', value:v, text:'de daño de habilidades'}),
  dano_basico: v=>({type:'aumento_dano_basico', value:v, text:'de daño del ataque básico'}),
  pen_fis:   v=>({type:'penetracion_armadura', value:v, text:'de penetración de armadura física'}),
  pen_mag:   v=>({type:'penetracion_magica', value:v, text:'de penetración de resistencia mágica'}),
  sangrado:  v=>({type:'sangrado', chance:v, text:'de aplicar sangrado 2 turnos (con ataque básico; el Asesino también con habilidades)'}),
  estados:   v=>({type:'prob_estados', value:v, text:'de probabilidad de aplicar estados'}),
  curacion:  v=>({type:'aumento_curacion', value:v, text:'de aumento de curación'}),
  escudo:    v=>({type:'aumento_escudo', value:v, text:'de potencia de escudos'}),
  bloqueo:   v=>({type:'bloqueo', chance:v, text:'de bloquear ataque'}),
};
// Una fila por rango (F..S) de una pieza, en notación compacta -> {mods, specials}.
function setTier(o){
  const mods = {}, specials = [];
  Object.entries(o).forEach(([k,v])=>{
    if(SET_STAT_MODS.has(k)) mods[k] = v;
    else if(SET_SPECIAL_DEFS[k]) specials.push(SET_SPECIAL_DEFS[k](v));
  });
  return {mods, specials};
}
// Nombre por rango: denominaciones "de ..." van detrás del sustantivo; las
// que son adjetivo se concuerdan en género/número (g: m, f, mp, fp) y, en
// Jack, conservan el apellido de la pieza ("Sombrero Acechante de Whitechapel").
function setAdj(adj, g){
  if(adj.endsWith('o')){ const root = adj.slice(0,-1); return {m:adj, f:root+'a', mp:root+'os', fp:root+'as'}[g]; }
  const plural = adj.endsWith('e') ? adj+'s' : adj+'es';
  return (g==='mp'||g==='fp') ? plural : adj;
}
function setPieceName(set, piece, rankIdx){
  const d = set.denoms[rankIdx];
  if(d.startsWith('de ') || d.startsWith('del ')) return `${piece.noun} ${d}`;
  return `${piece.noun} ${setAdj(d, piece.g)}${set.keepSuffixOnAdj && piece.suffix ? ' '+piece.suffix : ''}`;
}
const SET_CATALOG = {
  jack: {
    name:'Jack el Destripador', affinity:'Asesino', keepSuffixOnAdj:true,
    denoms:['Acechante','Ensangrentado','Despiadado','Macabro','del Destripador','de la Noche Carmesí'],
    pieces:{
      casco:{noun:'Sombrero', suffix:'de Whitechapel', g:'m', tiers:[
        {fis:5, fortaleza_mental:3},{fis:8, fortaleza_mental:5},{fis:12, fortaleza_mental:8},{fis:16, fortaleza_mental:11},{fis:21, fortaleza_mental:15, dano:0.03},{fis:28, fortaleza_mental:20, dano:0.05}]},
      armadura:{noun:'Abrigo', suffix:'del Destripador', g:'m', tiers:[
        {res_fisica:7},{res_fisica:11, res_magica:3},{res_fisica:15, res_magica:5},{res_fisica:20, res_magica:8},{res_fisica:26, res_magica:11, evasion:0.03},{res_fisica:34, res_magica:15, evasion:0.05}]},
      botas:{noun:'Pasos', suffix:'de Whitechapel', g:'mp', tiers:[
        {agi:3},{agi:5, res_magica:3},{agi:7, res_magica:6},{agi:10, res_magica:9},{agi:13, res_magica:13, fortaleza_mental:5, evasion:0.03},{agi:17, res_magica:18, fortaleza_mental:8, evasion:0.05}]},
      // +% de daño desde Poco Común (2026-10-02, pedido explícito: que el
      // Asesino no pierda tanto daño tras retirarse el equipo por senda).
      guantes:{noun:'Guantes', suffix:'del Destripador', g:'mp', tiers:[
        {fis:5},{fis:8, pen_fis:0.02, dano:0.03},{fis:12, pen_fis:0.04, dano:0.05},{fis:16, pen_fis:0.06, dano:0.07},{fis:21, pen_fis:0.08, sangrado:0.03, dano:0.09},{fis:28, pen_fis:0.11, sangrado:0.05, dano:0.12}]},
      amuleto:{noun:'Recuerdo', suffix:'de la Última Víctima', g:'m', tiers:[
        {maxhp_flat:5, fortaleza_mental:3},{maxhp_flat:8, fortaleza_mental:5},{maxhp_flat:12, fortaleza_mental:8},{maxhp_flat:18, fortaleza_mental:11},{maxhp_flat:25, fortaleza_mental:15, dano:0.03},{maxhp_flat:35, fortaleza_mental:20, dano:0.05}]},
    },
  },
  artemisa: {
    name:'Artemisa', affinity:'Arquero',
    denoms:['del Rastreador','del Cazador','de la Luna','de la Luna Llena','de Artemisa','de la Cacería Celestial'],
    pieces:{
      casco:{noun:'Diadema', g:'f', tiers:[
        {fis:5, precision:4},{fis:8, precision:7},{fis:12, precision:10},{fis:16, precision:14},{fis:21, precision:19, dano:0.03},{fis:28, precision:25, dano:0.05}]},
      armadura:{noun:'Vestidura', g:'f', tiers:[
        {res_fisica:7},{res_fisica:10, res_magica:4},{res_fisica:14, res_magica:7},{res_fisica:18, res_magica:10},{res_fisica:23, res_magica:14, reduccion:0.03},{res_fisica:30, res_magica:19, reduccion:0.05}]},
      botas:{noun:'Pasos', g:'mp', tiers:[
        {agi:3},{agi:5, res_magica:3},{agi:7, res_magica:6},{agi:10, res_magica:9},{agi:13, res_magica:13, fortaleza_mental:5, evasion:0.03},{agi:17, res_magica:18, fortaleza_mental:8, evasion:0.05}]},
      // +% de daño desde Poco Común (mismo motivo, Arquero).
      guantes:{noun:'Guantes', g:'mp', tiers:[
        {fis:5},{fis:8, precision:3, dano:0.03},{fis:12, precision:5, dano:0.05},{fis:16, precision:8, dano:0.07},{fis:21, precision:11, pen_fis:0.04, dano:0.09},{fis:28, precision:15, pen_fis:0.07, dano:0.12}]},
      amuleto:{noun:'Medallón', g:'m', tiers:[
        {maxhp_flat:5, fortaleza_mental:3},{maxhp_flat:8, fortaleza_mental:5},{maxhp_flat:12, fortaleza_mental:8},{maxhp_flat:18, fortaleza_mental:11},{maxhp_flat:25, fortaleza_mental:15, dano_basico:0.03},{maxhp_flat:35, fortaleza_mental:20, dano_basico:0.06}]},
    },
  },
  soberano: {
    name:'Soberano Elemental', affinity:'Mago',
    denoms:['Elemental','Imbuido','de Escarcha y Llama','del Dominador Elemental','del Soberano Elemental','de la Convergencia'],
    pieces:{
      casco:{noun:'Corona', g:'f', tiers:[
        {hab:5},{hab:8, mp_flat:5},{hab:12, mp_flat:8},{hab:16, mp_flat:12},{hab:21, mp_flat:16, dano_hab:0.03},{hab:28, mp_flat:22, dano_hab:0.06}]},
      armadura:{noun:'Vestidura', g:'f', tiers:[
        {res_magica:7},{res_magica:11, res_fisica:3},{res_magica:15, res_fisica:5},{res_magica:20, res_fisica:8},{res_magica:26, res_fisica:11, reduccion:0.03},{res_magica:34, res_fisica:15, reduccion:0.06}]},
      botas:{noun:'Pasos', g:'mp', tiers:[
        {fortaleza_mental:4},{fortaleza_mental:7, res_magica:3},{fortaleza_mental:10, res_magica:6},{fortaleza_mental:14, res_magica:9},{fortaleza_mental:18, res_magica:13, evasion:0.03},{fortaleza_mental:24, res_magica:18, evasion:0.05}]},
      guantes:{noun:'Manos', g:'fp', tiers:[
        {hab:5},{hab:8, pen_mag:0.02},{hab:12, pen_mag:0.04},{hab:16, pen_mag:0.06},{hab:21, pen_mag:0.08, dano_hab:0.03},{hab:28, pen_mag:0.11, dano_hab:0.06}]},
      amuleto:{noun:'Núcleo', g:'m', tiers:[
        {mp_flat:5},{mp_flat:9, hab:3},{mp_flat:14, hab:5},{mp_flat:19, hab:8},{mp_flat:25, hab:11, fortaleza_mental:5},{mp_flat:34, hab:15, fortaleza_mental:8}]},
    },
  },
  eclipse: {
    name:'Eclipse', affinity:'Hechicero',
    denoms:['Sombrío','Maldito','de la Aflicción','de la Mente Quebrada','del Eclipse','del Eclipse Total'],
    pieces:{
      casco:{noun:'Corona', g:'f', tiers:[
        {hab:5},{hab:8, precision:4},{hab:12, precision:7},{hab:16, precision:10},{hab:21, precision:14, estados:0.03},{hab:28, precision:19, estados:0.06}]},
      armadura:{noun:'Manto', g:'m', tiers:[
        {res_magica:7},{res_magica:11, res_fisica:3},{res_magica:15, res_fisica:5},{res_magica:20, res_fisica:8},{res_magica:26, res_fisica:11, fortaleza_mental:5},{res_magica:34, res_fisica:15, fortaleza_mental:9}]},
      botas:{noun:'Pasos', g:'mp', tiers:[
        {fortaleza_mental:5},{fortaleza_mental:8},{fortaleza_mental:11, res_magica:4},{fortaleza_mental:15, res_magica:7},{fortaleza_mental:20, res_magica:11, evasion:0.03},{fortaleza_mental:27, res_magica:16, evasion:0.05}]},
      guantes:{noun:'Manos', g:'fp', tiers:[
        {hab:5},{hab:8, estados:0.02},{hab:12, estados:0.04},{hab:16, estados:0.06},{hab:21, estados:0.09},{hab:28, estados:0.13}]},
      amuleto:{noun:'Ojo', g:'m', tiers:[
        {mp_flat:5},{mp_flat:9, hab:3},{mp_flat:14, hab:5},{mp_flat:19, hab:8},{mp_flat:25, hab:11, fortaleza_mental:5},{mp_flat:34, hab:15, fortaleza_mental:9}]},
    },
  },
  guardian: {
    name:'Guardián Eterno', affinity:'Guerrero / Paladín',
    denoms:['del Centinela','del Protector','del Guardián','del Bastión','del Guardián Eterno','de la Muralla Eterna'],
    pieces:{
      casco:{noun:'Yelmo', g:'m', tiers:[
        {vig:5, fortaleza_mental:3},{vig:8, fortaleza_mental:5},{vig:12, fortaleza_mental:8},{vig:16, fortaleza_mental:11},{vig:21, fortaleza_mental:15, reduccion:0.03},{vig:28, fortaleza_mental:20, reduccion:0.05}]},
      armadura:{noun:'Coraza', g:'f', tiers:[
        {res_fisica:10},{res_fisica:14, res_magica:3},{res_fisica:19, res_magica:6},{res_fisica:24, res_magica:9},{res_fisica:30, res_magica:13, reduccion:0.05},{res_fisica:38, res_magica:18, reduccion:0.08}]},
      botas:{noun:'Grebas', g:'fp', tiers:[
        {res_magica:8},{res_magica:12, res_fisica:3},{res_magica:16, res_fisica:5},{res_magica:21, res_fisica:8},{res_magica:27, res_fisica:11, fortaleza_mental:5},{res_magica:35, res_fisica:15, fortaleza_mental:9}]},
      // Recuperan el Físico del documento (Guerrero) y conservan algo de
      // Vigor; +% de daño menor que Jack/Artemisa (es un set de tanque).
      guantes:{noun:'Guanteletes', g:'mp', tiers:[
        {fis:4, vig:2, maxhp_flat:5},{fis:7, vig:4, maxhp_flat:8, dano:0.02},{fis:10, vig:5, maxhp_flat:12, dano:0.03},{fis:14, vig:7, maxhp_flat:18, dano:0.04},{fis:18, vig:9, maxhp_flat:25, bloqueo:0.03, dano:0.05},{fis:24, vig:12, maxhp_flat:35, bloqueo:0.06, dano:0.06}]},
      amuleto:{noun:'Sello', g:'m', tiers:[
        {fortaleza_mental:4},{fortaleza_mental:7, maxhp_flat:5},{fortaleza_mental:10, maxhp_flat:10},{fortaleza_mental:14, maxhp_flat:15},{fortaleza_mental:18, maxhp_flat:22, reduccion:0.03},{fortaleza_mental:24, maxhp_flat:32, reduccion:0.05}]},
    },
  },
  bastion: {
    name:'Bastión Sagrado', affinity:'Paladín / Sacerdote',
    denoms:['del Acólito','del Juramento','del Protector','de la Égida','del Bastión Sagrado','del Juramento Divino'],
    pieces:{
      casco:{noun:'Corona', g:'f', tiers:[
        {esp:4, maxhp_flat:5},{esp:7, maxhp_flat:9},{esp:10, maxhp_flat:14},{esp:14, maxhp_flat:20},{esp:18, maxhp_flat:28, fortaleza_mental:5},{esp:24, maxhp_flat:40, fortaleza_mental:9}]},
      armadura:{noun:'Coraza', g:'f', tiers:[
        {res_fisica:8, res_magica:4},{res_fisica:12, res_magica:7},{res_fisica:16, res_magica:10},{res_fisica:21, res_magica:14},{res_fisica:27, res_magica:19, reduccion:0.04},{res_fisica:35, res_magica:25, reduccion:0.07}]},
      botas:{noun:'Grebas', g:'fp', tiers:[
        {res_magica:6},{res_magica:9, fortaleza_mental:3},{res_magica:13, fortaleza_mental:6},{res_magica:17, fortaleza_mental:9},{res_magica:22, fortaleza_mental:13, maxhp_flat:15},{res_magica:29, fortaleza_mental:18, maxhp_flat:25}]},
      guantes:{noun:'Manos', g:'fp', tiers:[
        {esp:5},{esp:8, maxhp_flat:5},{esp:12, maxhp_flat:10},{esp:16, maxhp_flat:15},{esp:21, maxhp_flat:20, escudo:0.03},{esp:28, maxhp_flat:30, escudo:0.06}]},
      amuleto:{noun:'Reliquia', g:'f', tiers:[
        {mp_flat:5, fortaleza_mental:3},{mp_flat:8, fortaleza_mental:5},{mp_flat:12, fortaleza_mental:8},{mp_flat:17, fortaleza_mental:11},{mp_flat:23, fortaleza_mental:15, maxhp_flat:10},{mp_flat:32, fortaleza_mental:20, maxhp_flat:20}]},
    },
  },
  gracia: {
    name:'Gracia Celestial', affinity:'Sacerdote / Paladín',
    denoms:['del Peregrino','Bendecido','de la Gracia','del Milagro','de la Gracia Celestial','de la Bendición Divina'],
    pieces:{
      casco:{noun:'Halo', g:'m', tiers:[
        {esp:5},{esp:8, mp_flat:5},{esp:12, mp_flat:8},{esp:16, mp_flat:12},{esp:21, mp_flat:17, fortaleza_mental:4},{esp:28, mp_flat:24, fortaleza_mental:8}]},
      armadura:{noun:'Vestidura', g:'f', tiers:[
        {res_fisica:6, res_magica:6},{res_fisica:9, res_magica:9},{res_fisica:13, res_magica:13},{res_fisica:17, res_magica:17},{res_fisica:22, res_magica:22, reduccion:0.03},{res_fisica:29, res_magica:29, reduccion:0.06}]},
      botas:{noun:'Pasos', g:'mp', tiers:[
        {fortaleza_mental:5},{fortaleza_mental:8, res_magica:3},{fortaleza_mental:11, res_magica:6},{fortaleza_mental:15, res_magica:9},{fortaleza_mental:20, res_magica:13},{fortaleza_mental:27, res_magica:18}]},
      guantes:{noun:'Manos', g:'fp', tiers:[
        {esp:5},{esp:8, curacion:0.03},{esp:12, curacion:0.05},{esp:16, curacion:0.08},{esp:21, curacion:0.11},{esp:28, curacion:0.15}]},
      amuleto:{noun:'Lágrima', g:'f', tiers:[
        {mp_flat:6},{mp_flat:10, esp:3},{mp_flat:15, esp:5},{mp_flat:21, esp:8},{mp_flat:28, esp:11, fortaleza_mental:5},{mp_flat:38, esp:15, fortaleza_mental:9}]},
    },
  },
  voluntad: {
    name:'Voluntad Inquebrantable', affinity:'Universal',
    denoms:['Sereno','Resistente','Determinado','Imperturbable','Inquebrantable','de la Voluntad Absoluta'],
    pieces:{
      casco:{noun:'Yelmo', g:'m', tiers:[
        {fortaleza_mental:7},{fortaleza_mental:10},{fortaleza_mental:14},{fortaleza_mental:18},{fortaleza_mental:23, maxhp_flat:10},{fortaleza_mental:30, maxhp_flat:20}]},
      armadura:{noun:'Coraza', g:'f', tiers:[
        {res_fisica:6, res_magica:6},{res_fisica:9, res_magica:9},{res_fisica:13, res_magica:13},{res_fisica:17, res_magica:17},{res_fisica:22, res_magica:22, reduccion:0.03},{res_fisica:29, res_magica:29, reduccion:0.05}]},
      botas:{noun:'Pasos', g:'mp', tiers:[
        {fortaleza_mental:5},{fortaleza_mental:8, res_magica:3},{fortaleza_mental:11, res_magica:5},{fortaleza_mental:15, res_magica:8},{fortaleza_mental:20, res_magica:11},{fortaleza_mental:27, res_magica:16}]},
      guantes:{noun:'Guanteletes', g:'mp', tiers:[
        {vig:4, agi:4},{vig:6, agi:6},{vig:9, agi:9},{vig:12, agi:12},{vig:16, agi:16, dano:0.03},{vig:21, agi:21, dano:0.05}]},
      amuleto:{noun:'Amuleto', g:'m', tiers:[
        {fortaleza_mental:8},{fortaleza_mental:11},{fortaleza_mental:15},{fortaleza_mental:20},{fortaleza_mental:26, mp_flat:8},{fortaleza_mental:34, mp_flat:15}]},
    },
  },
};
const SET_IDS = Object.keys(SET_CATALOG);
const SET_SLOTS = ['casco','armadura','botas','guantes','amuleto'];
// Bonos de conjunto — rebajados el mismo 2026-10-02 (pedido explícito: "son
// más bien una pequeña ayuda, no algo que rompa el juego"). Criterio: todo
// número ronda la mitad o menos de la primera propuesta; los de 5 piezas
// tienen tope (1 vez por combate, cargas, o escudo que no se acumula) y no
// hay ejecución/instakill. El grueso del poder sigue estando en las piezas.
// - mods/specials se suman como si fueran de una pieza más (también en
//   aliados, vía equipModsSum/specialsFromEquip);
// - los efectos con lógica propia se buscan por type 'set_*' en combate.
const SET_BONUSES = {
  jack: {
    2:{name:'Herida Profunda', text:'+5% de probabilidad de aplicar Sangrado (armas y habilidades).', specials:[{type:'set_sangrado_bonus', value:0.05}]},
    3:{name:'Desangramiento', text:'+2% de daño por cada carga de Sangrado del objetivo (máx. +6%).', specials:[{type:'set_dano_por_sangrado', value:0.02}]},
    5:{name:'Última Víctima', text:'+10% de daño contra enemigos por debajo del 30% de vida.', specials:[{type:'set_ultima_victima', value:0.10}]},
  },
  artemisa: {
    2:{name:'Disparo Gemelo', text:'5% de realizar un segundo ataque básico.', specials:[{type:'segundo_ataque_basico', chance:0.05}]},
    3:{name:'Flecha Expansiva', text:'Cada ataque duplicado salpica el 15% de su daño a otro enemigo al azar.', specials:[{type:'set_flecha_expansiva', pct:0.15}]},
    5:{name:'Lluvia de Artemisa', text:'Cada duplicación carga Luna Llena: tu siguiente ataque básico hace +15% y salpica el 15% de su daño a los demás enemigos.', specials:[{type:'set_luna_llena', bonus:0.15, splash:0.15}]},
  },
  soberano: {
    2:{name:'Afinidad Elemental', text:'+5% de daño de Fuego y Hielo.', specials:[{type:'set_dano_elemental', value:0.05}]},
    3:{name:'Choque Térmico', text:'Fuego contra un objetivo Ralentizado, o Hielo contra uno con Quemadura: +8% de daño.', specials:[{type:'set_choque_termico', value:0.08}]},
    5:{name:'Cataclismo', text:'Cada habilidad elemental suma 1 carga (máx. 4). Con 4 cargas, la siguiente habilidad elemental hace +25% y las consume.', specials:[{type:'set_cataclismo', charges:4, value:0.25}]},
  },
  eclipse: {
    2:{name:'Maldición', text:'+4% de probabilidad de aplicar estados con tus habilidades.', specials:[{type:'prob_estados', value:0.04}]},
    3:{name:'Mente Quebrada', text:'Contra enemigos que ya tienen algún estado negativo, +5% de probabilidad de aplicar Miedo y Confusión.', specials:[{type:'set_mente_quebrada', value:0.05}]},
    5:{name:'Eclipse Total', text:'Contra enemigos con 2+ estados negativos distintos: otro +5% para Miedo/Confusión, y cada estado que les apliques los deja Mermados (-4% de daño) 2 turnos.', specials:[{type:'set_eclipse_total', value:0.05, reduction:0.04}]},
  },
  guardian: {
    2:{name:'Fortaleza', text:'-3% de daño recibido.', specials:[{type:'reduccion_dano', value:0.03}]},
    3:{name:'Muralla', text:'+3% de bloqueo.', specials:[{type:'bloqueo', chance:0.03}]},
    5:{name:'Último Bastión', text:'Al caer por debajo del 30% de vida: barrera del 10% de tu vida máxima y -8% de daño recibido durante 2 turnos (1 vez por combate).', specials:[{type:'set_ultimo_bastion', shieldPct:0.10, reduction:0.08, turns:2}]},
  },
  bastion: {
    2:{name:'Égida', text:'+5% de potencia de escudos.', specials:[{type:'aumento_escudo', value:0.05}]},
    3:{name:'Protector', text:'Mientras tengas un escudo activo recibes -4% de daño. Si lo lleva un Sacerdote aliado, aplica a todo el grupo con escudo.', specials:[{type:'set_protector', value:0.04}]},
    5:{name:'Bastión Divino', text:'Al colocar un escudo, el protegido gana Égida (-5% de daño recibido) 2 turnos.', specials:[{type:'set_bastion_divino', reduction:0.05}]},
  },
  gracia: {
    2:{name:'Bendición', text:'+5% de curación.', specials:[{type:'aumento_curacion', value:0.05}]},
    3:{name:'Gracia', text:'Cada curación también da un escudo del 3% de la vida máxima del curado (no se acumula).', specials:[{type:'set_gracia_escudo', pct:0.03}]},
    5:{name:'Milagro', text:'Cada 3 curaciones recuperas 8 de Espíritu y la siguiente curación es +15%.', specials:[{type:'set_milagro', every:3, spirit:8, bonus:0.15}]},
  },
  voluntad: {
    2:{name:'Mente Firme', text:'+5% de Fortaleza mental.', mods:{fortaleza_mental:5}},
    3:{name:'Voluntad', text:'Al recibir Miedo o Confusión: +8% de Fortaleza mental durante 3 turnos.', specials:[{type:'set_voluntad', value:0.08}]},
    5:{name:'Inquebrantable', text:'8% de resistir por completo Miedo y Confusión; al resistir recuperas 3% de vida y de MP.', specials:[{type:'set_inquebrantable', chance:0.08, pct:0.03}]},
  },
};
function makeSetItem(setId, slot, rank){
  const set = SET_CATALOG[setId];
  const piece = set && set.pieces[slot];
  const idx = GEAR_RANK_ORDER.indexOf(rank);
  if(!piece || idx<0 || !piece.tiers[idx]) return null;
  const t = setTier(piece.tiers[idx]);
  const item = {kind:'equip', slot, name:setPieceName(set, piece, idx), rarity:rank, setId};
  if(Object.keys(t.mods).length) item.mods = t.mods;
  if(t.specials.length) item.specials = t.specials;
  return item;
}
// {setId: piezas equipadas} de un objeto de equipo (jugador o aliado).
function setPieceCounts(equip){
  const counts = {};
  SET_SLOTS.forEach(slot=>{
    const it = equip && equip[slot];
    if(it && it.setId) counts[it.setId] = (counts[it.setId]||0) + 1;
  });
  return counts;
}
// Bonos activos (umbrales 2/3/5 alcanzados) como lista plana.
// Umbral que se aplica con n piezas de un conjunto: SOLO el más alto alcanzado
// (corrección de ariochbu, 2026-10-04: "si tienen los 5 solo debe aplicarse el
// 5; se puso 2 y 3 por si escogen dos conjuntos distintos"). Antes se sumaban
// los tres. 2 piezas -> bono de 2; 3 o 4 -> bono de 3; 5 -> bono de 5.
function setBonusTier(setId, n){
  const b = SET_BONUSES[setId];
  if(!b) return 0;
  return [5,3,2].find(k=> n>=k && b[k]) || 0;
}
function activeSetBonuses(equip){
  const out = [];
  Object.entries(setPieceCounts(equip)).forEach(([setId, n])=>{
    const k = setBonusTier(setId, n);
    if(k) out.push(Object.assign({setId, pieces:k}, SET_BONUSES[setId][k]));
  });
  return out;
}
function setBonusSpecials(equip){ return activeSetBonuses(equip).flatMap(b=>(b.specials||[]).map(sp=>Object.assign({fromSet:b.setId}, sp))); }
function setBonusMod(equip, key){ return activeSetBonuses(equip).reduce((sum,b)=>sum + ((b.mods && b.mods[key])||0), 0); }

// Chips de conjuntos para la hoja de personaje: piezas llevadas y bonos activos.
function setBonusChipsHTML(equip){
  return Object.entries(setPieceCounts(equip)).map(([setId, n])=>{
    const set = SET_CATALOG[setId], b = SET_BONUSES[setId];
    const tier = setBonusTier(setId, n);
    const active = tier ? [b[tier].name] : [];
    const desc = [2,3,5].map(k=>`${k} piezas — ${b[k].name}: ${b[k].text}`).join(' | ').replace(/"/g,'&quot;');
    return `<span class="res-chip ${active.length?'pos':''}" title="${desc}">${set.name} ${n}/5${active.length?': '+active.join(' · '):''}</span>`;
  }).join('');
}

function shopWeaponPrice(isOffhand){ return isOffhand ? 40 + state.char.level*4 : 55 + state.char.level*6; }
const SHOP_POTION_PRICES = {vida_menor:12, vida_mayor:30, estamina:12, espiritu:12, antidoto:22};

function dealDamageToPlayer(amount){
  if(amount<=0) return;
  let shieldBroke = false;
  if(combat && combat.playerShield>0){
    const absorbed = Math.min(combat.playerShield, amount);
    combat.playerShield -= absorbed;
    amount -= absorbed;
    shieldBroke = combat.playerShield<=0;
  }
  if(amount>0){
    const wouldBeLethal = combat && (state.char.curHP - amount) <= 0;
    if(!(wouldBeLethal && checkPetRevive())) state.char.curHP = Math.max(0, state.char.curHP - amount);
  }
  checkPetShieldOnHit();
  checkFuriaContenidaTrigger();
  checkPetTriggers();
  if(shieldBroke && state.char.curHP>0) tryRenewShield(true, null);
  checkUltimoBastion(true, null);
  checkVitalidadHeal();
}
// Habilidades únicas de mascota Épico+ (ver PET_CATALOG unique.effect) —
// mismo choke point que checkFuriaContenidaTrigger (dealDamageToPlayer es
// la única puerta de entrada de daño al jugador, cubre enemigos/DOT/
// autogolpe por igual) y misma bandera combat.tierSFired para "1 vez por
// combate", con una key por mascota para que dos mascotas equipadas con el
// mismo tipo de única no se pisen entre sí.
function checkPetTriggers(){
  if(!combat) return;
  const d = derived();
  if(d.maxHP<=0) return;
  petUniqueEffects().forEach(({petId, name, unique})=>{
    const eff = unique.effect;
    const key = `pet_${petId}_heal`;
    let threshold=null, healPct=null, shieldPct=null;
    if(eff.kind==='hp_threshold_heal'){ threshold=eff.threshold; healPct=eff.healPct; }
    else if(eff.kind==='mythic_bundle'){ threshold=eff.heal.threshold; healPct=eff.heal.healPct; shieldPct=eff.heal.shieldPct; }
    else return;
    if(combat.tierSFired.has(key)) return;
    if(state.char.curHP/d.maxHP > threshold) return;
    combat.tierSFired.add(key);
    const before = state.char.curHP;
    state.char.curHP = Math.min(d.maxHP, state.char.curHP + Math.round(d.maxHP*healPct));
    if(shieldPct) grantShield(true, null, Math.round(d.maxHP*shieldPct));
    log(`<b>${name}</b> se activa (${unique.name}): recuperas ${state.char.curHP-before} de vida${shieldPct?' y generas un escudo':''}.`);
  });
}
// Escudo al recibir daño (Fomor/Griffin/Thunder Dragon): a diferencia de lo
// de arriba, NO es "1 vez por combate" — su propio texto dice "X% de
// probabilidad al recibir daño", así que puede repetirse golpe a golpe.
function checkPetShieldOnHit(){
  if(!combat) return;
  const d = derived();
  petUniqueEffects().forEach(({name, unique})=>{
    const eff = unique.effect;
    if(eff.kind!=='shield_on_hit') return;
    if(chance(eff.chance)){
      grantShield(true, null, Math.round(d.maxHP*eff.shieldPct));
      log(`<b>${name}</b> genera un escudo que absorbe ${Math.round(eff.shieldPct*100)}% de tu vida máxima.`);
    }
  });
}
// Renacimiento del Emperador (mascota Mítica única): se evalúa ANTES de
// restar el daño letal — si revive, ese golpe ya no te baja a 0.
function checkPetRevive(){
  if(!combat) return false;
  const d = derived();
  let revived = false;
  petUniqueEffects().forEach(({petId, name, unique})=>{
    if(revived) return;
    const eff = unique.effect;
    if(eff.kind!=='mythic_bundle' || !eff.revive) return;
    const key = `pet_${petId}_revive`;
    if(combat.tierSFired.has(key)) return;
    combat.tierSFired.add(key);
    state.char.curHP = Math.max(1, Math.round(d.maxHP*eff.revive.hpPct));
    grantShield(true, null, Math.round(d.maxHP*eff.revive.shieldPct));
    log(`<b>${name}</b> se activa: ¡Renacimiento del Emperador! Revives con ${state.char.curHP} de vida y un escudo.`);
    revived = true;
  });
  return revived;
}
// Recuperación de MP/Espíritu por umbral (Grief Charybdis/Grand Leviathan) —
// se evalúa cada vez que el jugador gasta MP o Espíritu (ver playerUseSkill),
// mismo criterio de "1 vez por combate" que checkPetTriggers.
function checkPetResourceRecovery(){
  if(!combat) return;
  const d = derived();
  petUniqueEffects().forEach(({petId, name, unique})=>{
    const eff = unique.effect;
    if(eff.kind!=='resource_threshold_recovery') return;
    const key = `pet_${petId}_resource`;
    if(combat.tierSFired.has(key)) return;
    const staPct = d.maxSta>0 ? state.char.curSta/d.maxSta : 1;
    const spiPct = d.maxSpi>0 ? state.char.curSpi/d.maxSpi : 1;
    if(staPct <= eff.threshold && staPct<=spiPct){
      combat.tierSFired.add(key);
      const before = state.char.curSta;
      state.char.curSta = Math.min(d.maxSta, state.char.curSta + Math.round(d.maxSta*eff.recoverPct));
      log(`<b>${name}</b> se activa (${unique.name}): recuperas ${state.char.curSta-before} de MP.`);
    } else if(spiPct <= eff.threshold){
      combat.tierSFired.add(key);
      const before = state.char.curSpi;
      state.char.curSpi = Math.min(d.maxSpi, state.char.curSpi + Math.round(d.maxSpi*eff.recoverPct));
      log(`<b>${name}</b> se activa (${unique.name}): recuperas ${state.char.curSpi-before} de Espíritu.`);
    }
  });
}
// Escudo (2026-09-25, pedido explícito): un valor que se resta ANTES que la
// vida — "750 (250)/750" significa 750 de vida intacta + 250 de escudo por
// encima, y cualquier golpe drena primero esos 250. isPlayer=true suma a
// combat.playerShield; si no, a ally.shield. No hay tope de acumulación (un
// segundo escudo simplemente se suma al que ya había).
function grantShield(isPlayer, ally, amount){
  if(amount<=0) return;
  if(isPlayer){ if(combat) combat.playerShield = (combat.playerShield||0) + amount; }
  else if(ally) ally.shield = (ally.shield||0) + amount;
}
// Furia Contenida (REWORK 2026-09-24, ver SOUL_STONES.furia_*): se dispara
// la primera vez que la vida cruza el umbral de la piedra engarzada, en
// TODO el combate — no importa si te curás y volvés a bajar, no vuelve a
// activarse (reusa combat.tierSFired, la misma bandera "1 vez por combate"
// de las pasivas de Tier S). Único choke point de daño al jugador, así que
// cubre cualquier fuente: enemigos, DOT, autogolpe por Confusión, etc.
function checkFuriaContenidaTrigger(){
  if(!combat || combat.tierSFired.has('furia_contenida')) return;
  const stone = socketedStones().find(s=> s.special && s.special.type==='furia_v2');
  if(!stone) return;
  const d = derived();
  if(d.maxHP<=0 || (state.char.curHP/d.maxHP) >= stone.special.threshold) return;
  combat.tierSFired.add('furia_contenida');
  applyStatus(null, {name:'Furioso', duration:stone.special.duration, dmgMult:1+stone.special.dmgBonus, incomingDmgReduction:stone.special.dmgReduction||0}, true);
  const reducTxt = stone.special.dmgReduction ? ` y -${Math.round(stone.special.dmgReduction*100)}% de daño recibido` : '';
  log(`<b>${stone.name}</b> se activa: +${Math.round(stone.special.dmgBonus*100)}% de daño${reducTxt} durante ${stone.special.duration} turnos.`);
}

function buyWeapon(slot, styleId, name){
  styleId = styleId || state.char.style;
  const price = shopWeaponPrice(slot==='arma2');
  if(state.char.gold < price){ log('No tienes suficiente oro para eso.'); return; }
  const item = makeWeaponItem(slot, styleId, 'comun', name);
  if(!item) return;
  state.char.gold -= price;
  addToInventory(item);
  log(`Compras <b>${item.name}</b> por ${price} de oro (guardada en la mochila — decide tú a quién equipársela).`);
  renderAll(); save();
}

// equipo común no ligado al arma: armadura, casco, botas, guantes y
// amuleto ("Accesorio" en pantalla). Ahora cada senda tiene su propio
// nombre y (para guantes) su propio stat — ver SET_CATALOG. El precio en
// oro sigue siendo el mismo para las 5, solo el nombre/stat cambia.
const SHOP_GEAR_SLOTS = ['armadura','casco','botas','guantes','amuleto'];
function shopGearPrice(slot){ return slot==='armadura' ? 45 + state.char.level*4 : 35 + state.char.level*3; }
function buyGear(slot){
  const cls = shopWeaponRole || state.char.style;
  const price = shopGearPrice(slot);
  if(state.char.gold < price){ log('No tienes suficiente oro para eso.'); return; }
  const item = makeGearItem(slot, cls, 'comun');
  if(!item) return;
  state.char.gold -= price;
  addToInventory(item);
  log(`Compras <b>${item.name}</b> por ${price} de oro.`);
  renderAll(); save();
}

// Kit inicial (petición del 2026-09-14): antes un personaje nuevo arrancaba
// desnudo con 20 de oro y tenía que ganar su primera arma jugando. Ahora
// arranca ya equipado con un set común completo (mismo generador que la
// tienda) más un fondo de pociones básico, para no perder la primera media
// hora sin poder pelear en serio. Se llama una sola vez, justo después de
// create_character, con state.char.level todavía en 1.
const STARTER_GOLD = 200;
const STARTER_POTIONS = {vida_mayor:5, vida_menor:10, estamina:5, espiritu:5};
function grantStarterKit(){
  state.char.gold = STARTER_GOLD;
  const styleId = state.char.style;
  const cat = WEAPON_CATALOG[styleId] || WEAPON_CATALOG.pesada;
  state.char.equip.arma = makeWeaponItem('arma', styleId, 'comun');
  if(cat.arma2) state.char.equip.arma2 = makeWeaponItem('arma2', styleId, 'comun');
  SHOP_GEAR_SLOTS.forEach(slot=>{
    state.char.equip[slot] = makeGearItem(slot, styleId, 'comun');
  });
  Object.entries(STARTER_POTIONS).forEach(([potionId, qty])=>{
    state.char.inventory.push({kind:'potion', potionId, qty});
  });
}

// Equipo poco común, también con oro (no Sellos) — un escalón intermedio
// entre lo común de siempre y la tienda de Sellos del Gremio.
function shopGearPricePocoComun(slot){ return Math.round(shopGearPrice(slot) * 2.2); }
function buyGearPocoComun(slot){
  const cls = shopWeaponRole || state.char.style;
  const price = shopGearPricePocoComun(slot);
  if(state.char.gold < price){ log('No tienes suficiente oro para eso.'); return; }
  const item = makeGearItem(slot, cls, 'poco_comun');
  if(!item) return;
  state.char.gold -= price;
  addToInventory(item);
  log(`Compras <b>${item.name}</b> por ${price} de oro.`);
  renderAll(); save();
}

// Raro (C): un escalón por encima de Poco Común, todavía con oro — el techo
// del oro antes de tener que pasar a Sellos del Gremio por Único/Épico.
function shopGearPriceRaro(slot){ return Math.round(shopGearPrice(slot) * 3.4); }
function buyGearRaro(slot){
  const cls = shopWeaponRole || state.char.style;
  const price = shopGearPriceRaro(slot);
  if(state.char.gold < price){ log('No tienes suficiente oro para eso.'); return; }
  const item = makeGearItem(slot, cls, 'raro');
  if(!item) return;
  state.char.gold -= price;
  addToInventory(item);
  log(`Compras <b>${item.name}</b> por ${price} de oro.`);
  renderAll(); save();
}
// Arma Raro (C): mismo trato que la de senda común, pero con más bono de daño.
function shopWeaponPriceRaro(isOffhand){ return Math.round(shopWeaponPrice(isOffhand) * 2.6); }
function buyWeaponRaro(slot, styleId, name){
  styleId = styleId || state.char.style;
  const price = shopWeaponPriceRaro(slot==='arma2');
  if(state.char.gold < price){ log('No tienes suficiente oro para eso.'); return; }
  const item = makeWeaponItem(slot, styleId, 'raro', name);
  if(!item) return;
  state.char.gold -= price;
  addToInventory(item);
  log(`Compras <b>${item.name}</b> por ${price} de oro (guardada en la mochila).`);
  renderAll(); save();
}

// Tienda del Gremio: se paga con Sellos del Laberinto (misiones), no con oro.
// Vende equipo de rango Único (B) y Épico (A) — Legendario (S) todavía no está
// definido, así que no se vende aquí.
const SELLO_SHOP_SLOTS = ['arma','armadura','casco','botas','guantes','amuleto'];
// 2026-10-02 (pedido explícito): precios de la Tienda de Sellos a la mitad.
// La Forja Legendaria (Tier S, TIER_S_RECIPE) mantiene su precio.
function selloShopPrice(rarity){ return rarity==='rango_a' ? 350 : 175; }
function makeSelloShopItem(slot, rarity, styleId, name){
  styleId = styleId || state.char.style;
  if(slot==='arma'){
    // Las armas no cambian de nombre por rango (siguen siendo "Martillo de
    // guerra" en cualquier rango) — acá sí hace falta el sufijo para marcar
    // que es la versión Único/Épico comprada con Sellos.
    const tag = rarity==='rango_a' ? 'épico' : 'único';
    const item = makeWeaponItem('arma', styleId, rarity, name);
    if(!item) return null;
    item.name = `${item.name} ${tag} del Gremio`;
    return item;
  }
  // El equipo general SÍ cambia de nombre por rango (de piedra/bronce/
  // plata/oro/platino — hoy son piezas de conjunto, ver SET_CATALOG) — ese nombre ya deja claro el rango,
  // no hace falta un sufijo "del Gremio" encima.
  return makeGearItem(slot, styleId, rarity);
}
// Piezas de conjunto en la Tienda de Sellos (pedido explícito 2026-10-02),
// mismos rangos y precios que el resto del equipo de Sellos.
function buySelloSetPiece(setId, slot, rarity){
  const price = selloShopPrice(rarity);
  if((state.char.missionCurrency||0) < price){ log('No tienes suficientes Sellos del Laberinto.'); return; }
  const item = makeSetItem(setId, slot, rarity);
  if(!item) return;
  state.char.missionCurrency -= price;
  addToInventory(item);
  log(`Compras <b>${item.name}</b> (conjunto ${SET_CATALOG[setId].name}) por ${price} Sellos del Laberinto.`);
  renderAll(); save();
}
function buySelloGear(slot, rarity, name){
  const price = selloShopPrice(rarity);
  if((state.char.missionCurrency||0) < price){ log('No tienes suficientes Sellos del Laberinto.'); return; }
  const item = makeSelloShopItem(slot, rarity, slot==='arma' ? shopWeaponRole : null, name);
  if(!item) return;
  state.char.missionCurrency -= price;
  addToInventory(item);
  log(`Compras <b>${item.name}</b> por ${price} Sellos del Laberinto.`);
  renderAll(); save();
}

// ============================================================
// FORJA LEGENDARIA (Tier S) — pedido explícito 2026-09-24. Único camino para
// conseguir armas Tier S (WEAPON_CATALOG rango 'legendario') y piedras de
// alma de rango S: se compran, no caen al azar (el drop al azar de
// legendario/S sigue apagado — ver LEGENDARY_TIERS_ENABLED). Exige haber
// llegado alguna vez al piso 40 (state.char.maxLevelUnlocked, no el piso de
// la partida en curso) — "debe ser mucho más difícil de conseguir, atención
// principal en esto" fue el pedido explícito, así que además de Sellos pide
// un fragmento de CADA jefe de década (pisos 10 a 60) — no hay atajo: para
// forjar un solo objeto Tier S hace falta haber derrotado a los 6 jefes de
// década al menos 2 veces cada uno. Las cantidades son elección propia
// (ariochbu pidió explícitamente "las cantidades ponlas tú").
// ============================================================
const TIER_S_MIN_FLOOR = 40;
const TIER_S_RECIPE = {
  sellos: 1500,
  fragments: {ogro:2, matriarca_escarlata:2, riakis:2, usurpador:2, custodio_isla:2, storm_gush:2}
};
function tierSUnlocked(){ return (state.char.maxLevelUnlocked||1) >= TIER_S_MIN_FLOOR; }
function fragmentQty(fragId){
  const it = state.char.inventory.find(i=>i.kind==='fragmento' && i.fragId===fragId);
  return it ? it.qty : 0;
}
function hasTierSMaterials(){
  if((state.char.missionCurrency||0) < TIER_S_RECIPE.sellos) return false;
  return Object.keys(TIER_S_RECIPE.fragments).every(fragId=> fragmentQty(fragId) >= TIER_S_RECIPE.fragments[fragId]);
}
function spendTierSMaterials(){
  state.char.missionCurrency -= TIER_S_RECIPE.sellos;
  Object.keys(TIER_S_RECIPE.fragments).forEach(fragId=>{
    const it = state.char.inventory.find(i=>i.kind==='fragmento' && i.fragId===fragId);
    if(it) it.qty -= TIER_S_RECIPE.fragments[fragId];
  });
  state.char.inventory = state.char.inventory.filter(i=> !(i.kind==='fragmento' && i.qty<=0));
}
function buyTierSWeapon(slot, name){
  if(!tierSUnlocked()){ log(`La Forja Legendaria solo abre para quien ya llegó al piso ${TIER_S_MIN_FLOOR}.`); return; }
  if(!hasTierSMaterials()){ log('Te faltan Sellos del Laberinto o fragmentos de jefe de década para forjar esto.'); return; }
  const item = makeWeaponItem(slot, shopWeaponRole, 'legendario', name);
  if(!item) return;
  spendTierSMaterials();
  addToInventory(item);
  log(`La Forja Legendaria termina: <b>${item.name}</b> (Tier S).`);
  renderAll(); save();
}
function buyTierSStone(family){
  if(!tierSUnlocked()){ log(`La Forja Legendaria solo abre para quien ya llegó al piso ${TIER_S_MIN_FLOOR}.`); return; }
  if(!hasTierSMaterials()){ log('Te faltan Sellos del Laberinto o fragmentos de jefe de década para forjar esto.'); return; }
  const tpl = Object.values(SOUL_STONES).find(s=>s.family===family && s.tier==='S');
  if(!tpl) return;
  spendTierSMaterials();
  addToInventory(makeSoulStoneItem(tpl));
  log(`La Forja Legendaria termina: <b>${tpl.name}</b>.`);
  renderAll(); save();
}

/* ============================================================
   PROGRESIÓN AUTOMÁTICA DE EQUIPO — Sacerdote (pedido 2026-09-15)
   ============================================================
   Sacerdote quedó fuera del pool de botín aleatorio del laberinto (nunca
   lo puede equipar el jugador, así que "desperdiciaba" tiradas — ver
   WEAPON_STYLE_IDS). En su lugar, el aliado Sacerdote desbloquea equipo
   completo solo en 3 hitos: nivel de aliado 10 (Raro), nivel 20 (Único), y
   al derrotar al jefe de la década 30 (Épico) — este último no depende del
   nivel del aliado. El arma 1 nunca se toca acá (queda a criterio del
   jugador, comprada aparte — CAMBIÓ el 2026-10-02: ahora también se otorga,
   ver grantSacerdoteArma1). El arma 2 el jugador la elige una sola vez
   (Grimorio de plegarias / Tomo sagrado) y esa elección se recuerda y se
   reaplica sola, al rango más alto, en cada hito siguiente. */
const AUTO_GEAR_LEVEL = {raro:10, rango_b:20}; // rango_a no depende del nivel, ver el jefe de década 30
// RARITIES[x].name dice "Rango B"/"Rango A" (nombre interno) — en el resto
// de la interfaz esos dos rangos siempre se muestran como "Único"/"Épico"
// (ver el tag de makeSelloShopItem), así que la progresión automática usa
// la misma etiqueta para no decir una cosa distinta al resto de la tienda.
const AUTO_GEAR_TIER_LABEL = {raro:'Raro', rango_b:'Único', rango_a:'Épico', legendario:'Tier S'};
// Siempre 'sacerdote' explícito — antes de que el equipo general tuviera
// styleId esto daba igual (cualquier nombre/stat servía para cualquier
// senda), pero ahora que SÍ está restringido por senda, dejar que
// makeSelloShopItem() caiga a state.char.style por defecto le pondría al
// aliado equipo con el nombre/stat de la senda del JUGADOR, no la suya.
// Conjunto que recibe cada Sacerdote en sus hitos (pedido explícito
// 2026-10-05): ya no Voluntad Inquebrantable sino el que calza con su kit,
// igual que el Arma 1 — Seraphina (escudos) Bastión Sagrado, el resto
// (curanderos) Gracia Celestial. Solo para las recompensas que se entreguen
// desde ahora: lo ya entregado como Voluntad no se convierte (las cuentas se
// van a resetear).
const SACERDOTE_AUTO_SET = {seraphina:'bastion'};
function sacerdoteAutoSet(row){ return SACERDOTE_AUTO_SET[row && row.template_id] || 'gracia'; }
function makeAutoGearItem(slot, rarity, row){
  const item = makeSetItem(sacerdoteAutoSet(row), slot, rarity) || makeGearItem(slot, 'sacerdote', rarity);
  if(item) item.autoGear = true; // exento del requisito de nivel SOLO en un aliado Sacerdote
  return item;
}
async function saveAllyAutoGear(row){
  const { error } = await supabase.from('character_allies').update({
    equip: row.equip||{},
    auto_gear_tier: row.auto_gear_tier||'none',
    auto_gear_pending: !!row.auto_gear_pending,
    auto_gear_arma2_name: row.auto_gear_arma2_name||null
  }).eq('id', row.id);
  if(error) console.error('No se pudo guardar el equipo automático del aliado:', error.message);
  return !error;
}
// Arma 1 del Sacerdote en los hitos (pedido explícito 2026-10-02): cada
// Sacerdote recibe la que calza con su kit — Seraphina (escudos) la Vara de
// la Salvaguarda, el resto (curanderos) el Cetro de Penitencia. Si el jugador
// ya le había puesto la OTRA arma de Sacerdote, se respeta esa elección y se
// sube de rango la que lleva. Nunca baja de rango un arma que ya tenga.
const SACERDOTE_AUTO_ARMA1 = {seraphina:'Vara de la Salvaguarda'};
function grantSacerdoteArma1(row, tier){
  if(!row.equip) row.equip = {};
  const prior = row.equip.arma;
  const priorIsSacerdote = prior && prior.styleId==='sacerdote';
  if(priorIsSacerdote && GEAR_RANK_ORDER.indexOf(prior.rarity) >= GEAR_RANK_ORDER.indexOf(tier)) return false;
  const name = priorIsSacerdote ? weaponBaseName(prior.name) : (SACERDOTE_AUTO_ARMA1[row.template_id] || 'Cetro de Penitencia');
  const item = makeWeaponItem('arma', 'sacerdote', tier, name);
  if(!item) return false;
  item.autoGear = true;
  row.equip.arma = ensureItemUid(item);
  if(prior) state.char.inventory.push(ensureItemUid(prior));
  return true;
}
async function grantAllyAutoGear(row, tier){
  if(!row.equip) row.equip = {};
  // Si la base rechaza el guardado, se deshace todo (2026-10-05). Antes el
  // equipo nuevo quedaba solo en pantalla y el viejo se copiaba a la mochila:
  // así perdió SoshiroHoshina el set Tier S de su Sacerdote tras Storm Gush
  // (la restricción de auto_gear_tier no aceptaba 'legendario' hasta la 0035).
  const undo = {equip: JSON.stringify(row.equip), tier: row.auto_gear_tier, pending: row.auto_gear_pending, inv: state.char.inventory.length};
  grantSacerdoteArma1(row, tier);
  ['armadura','casco','botas','guantes','amuleto'].forEach(slot=>{
    const prior = row.equip[slot];
    row.equip[slot] = makeAutoGearItem(slot, tier, row);
    if(prior) state.char.inventory.push(ensureItemUid(prior));
  });
  if(row.auto_gear_arma2_name){
    const prior = row.equip.arma2;
    row.equip.arma2 = makeWeaponItem('arma2', 'sacerdote', tier, row.auto_gear_arma2_name);
    if(prior) state.char.inventory.push(ensureItemUid(prior));
    row.auto_gear_pending = false;
  } else {
    row.auto_gear_pending = true;
  }
  row.auto_gear_tier = tier;
  if(!(await saveAllyAutoGear(row))){
    row.equip = JSON.parse(undo.equip); row.auto_gear_tier = undo.tier; row.auto_gear_pending = undo.pending;
    state.char.inventory.length = undo.inv;
    log(`No se pudo guardar el equipo ${AUTO_GEAR_TIER_LABEL[tier]} de <b>${row.name}</b>; se volverá a intentar la próxima vez que entres.`);
    return false;
  }
  log(`<b>${row.name}</b> desbloquea su equipo ${AUTO_GEAR_TIER_LABEL[tier]}${row.auto_gear_pending ? ' — elige su arma2 en la Taberna' : ''}.`);
  save();
  if(invOpen) renderInventory();
}
// Llamada tras cada subida de nivel de aliado (ver advanceAllyXp) — solo
// Sacerdote tiene esta progresión; el resto de sendas ya consigue equipo
// por botín normal.
async function checkAllyAutoGearByLevel(row){
  if(row.role!=='sacerdote') return;
  const tier = row.auto_gear_tier || 'none';
  if(tier==='none' && row.level>=AUTO_GEAR_LEVEL.raro) await grantAllyAutoGear(row,'raro');
  else if(tier==='raro' && row.level>=AUTO_GEAR_LEVEL.rango_b) await grantAllyAutoGear(row,'rango_b');
}
function chooseAllyAutoGearArma2(allyId, name){
  const row = (state.char.allies||[]).find(a=>a.id===allyId);
  if(!row || !row.auto_gear_pending) return;
  row.auto_gear_arma2_name = name;
  if(!row.equip) row.equip = {};
  const prior = row.equip.arma2;
  row.equip.arma2 = makeWeaponItem('arma2', 'sacerdote', row.auto_gear_tier, name);
  if(prior) state.char.inventory.push(ensureItemUid(prior));
  row.auto_gear_pending = false;
  log(`<b>${row.name}</b> equipa <b>${name}</b>.`);
  saveAllyAutoGear(row);
  renderAll();
}

function buyPotion(potionId, qty){
  qty = qty || 1;
  const totalPrice = (SHOP_POTION_PRICES[potionId] || 15) * qty;
  if(state.char.gold < totalPrice){ log('No tienes suficiente oro para eso.'); return; }
  state.char.gold -= totalPrice;
  for(let i=0;i<qty;i++) addToInventory({kind:'potion', potionId});
  log(`Compras <b>${POTION_TEMPLATES[potionId].name}</b> x${qty} por ${totalPrice.toLocaleString('es')} de oro.`);
  renderAll(); save();
}

const SOUL_STONE_SELL_BASE = {E:20, F:40, D:80, C:160, B:320, A:640, S:1280, SS:2560}; // se duplica por rango, igual que las piedras
function itemSellValue(item){
  if(item.kind==='potion') return Math.round((SHOP_POTION_PRICES[item.potionId]||15) * 0.5);
  if(item.kind==='soulstone') return Math.round((SOUL_STONE_SELL_BASE[item.tier]||20) * 0.5);
  // equipo: mitad de un valor estimado a partir de su rareza y la magnitud de su bono
  const rarityBase = {comun:20, poco_comun:50}[item.rarity] || 15;
  let bonusValue = 0;
  if(item.bonus){
    if(item.bonus.stat) bonusValue = item.bonus.value*4;
    else if(item.bonus.res) bonusValue = item.bonus.value*1.5;
  }
  // item.mods: estadísticas del equipo general nuevas (maxhp_flat, precision,
  // res_magica, resistencia_estado, fortaleza_mental, mp_flat, espiritu_flat
  // — ver SET_CATALOG), cada una suma algo de valor aunque no pasen por bonus.
  Object.values(item.mods||{}).forEach(v=> bonusValue += v*1.5);
  const specialsCount = (item.specials||(item.special?[item.special]:[])).length;
  const specialBonus = specialsCount * 15;
  return Math.round((rarityBase + bonusValue + specialBonus) * 0.5);
}
function sellEquipOrStone(uid){
  const idx = state.char.inventory.findIndex(i=>i.uid===uid);
  if(idx<0) return;
  const item = state.char.inventory[idx];
  const value = itemSellValue(item);
  state.char.inventory.splice(idx,1);
  state.char.gold += value;
  log(`Vendes <b>${item.name}</b> por ${value} de oro (50% de su valor original).`);
  renderAll(); save();
}
function sellPotionStack(potionId){
  const item = state.char.inventory.find(i=>i.kind==='potion' && i.potionId===potionId);
  if(!item) return;
  const value = itemSellValue(item);
  item.qty -= 1;
  if(item.qty<=0) state.char.inventory = state.char.inventory.filter(i=>i!==item);
  state.char.gold += value;
  log(`Vendes <b>${POTION_TEMPLATES[potionId].name}</b> por ${value} de oro (50% de su valor original).`);
  renderAll(); save();
}

// Los guardianes (incluidos los jefes de década) ya no dan una recompensa
// garantizada — sueltan botín igual que cualquier otro enemigo, tirando
// contra la tabla plana de rareza (ver FLAT_GEAR_TABLE/FLAT_STONE_TABLE más
// abajo), solo que un jefe de década tira dos veces en vez de una.

/* ============================================================
   PIEDRAS DE ALMA (SOUL STONES) — v2, familias con fórmulas por rango
   ============================================================
   Investigué la novela «Sobreviviendo siendo un bárbaro»: usa "Esencias" con
   rango numérico 9 (débil) a 1 (fuerte), no piedras con letras. Este sistema
   sigue siendo una capa propia de nuestro juego, con el ranking pedido:
   E (más bajo) < F < D < C < B < A < S < SS (más alto).
   Todos los rangos ya existen como objetos — lo que controla cuándo se
   consiguen de verdad es la tabla plana de drop (FLAT_STONE_TABLE) y el nivel
   mínimo de personaje para A/S/SS (ver GEAR_STONE_MIN_LEVEL más abajo), no una
   banda por década. Los efectos "avanzados" prometidos en el preview de cada
   familia a partir de A (escudo de maná, mitad de costo, doble lanzamiento,
   autocuración, revivir, invocar sombra) siguen sin código de combate propio
   — quedan pendientes a propósito; solo Vigor cambia de verdad en A/S/SS
   (roba vida, que ya es un special genérico existente). */
const SOUL_STONE_TIERS = ['E','F','D','C','B','A','S','SS']; // ascendente: E la más baja, SS la más alta
// Espejo de la rampa de RARITIES (ver comentario ahí) sobre las 8 letras de
// piedras de alma en vez de los 7 slugs de equipo. D no tiene equivalente en
// equipo (el equipo pasa de Poco común directo a Raro/C) — se le da un tono
// puente propio (verde azulado) para no repetir ni C ni F.
const SOUL_TIER_COLORS = {E:'#9a958c', F:'#46c168', D:'#2fb0a8', C:'#3b8fe0', B:'#d6409f', A:'#9350dd', S:'#e0b23f', SS:'#e0393f'};
function soulTierIdx(tier){ return SOUL_STONE_TIERS.indexOf(tier); }

// Fórmulas de escalado por familia (documentadas para cuando D-SS estén disponibles).
// statValue: se duplica por cada rango. procChance: se duplica desde F en adelante.
// advValue: "efecto avanzado" que arranca en rango A y sube +10 puntos/rango (o tabla fija).
const SOUL_FAMILIES = {
  // 2026-10-02 (pedido explícito): Vigor deja de dar Físico — da solo Vida
  // máxima (mismos números que Vitalidad); conserva aturdir/robo de vida.
  vigor:     {name:'Vigor',           statKey:'maxhp',  baseE:1,  procBaseAtF:0.02, advBaseAtA:0.05, advLabel:'robo de vida (% del daño causado)'},
  sabiduria: {name:'Sabiduría',       statKey:'maxsta', baseE:8,  procBaseAtF:0.05, advBaseAtA:0.05, advLabel:'probabilidad de escudo de maná'},
  voluntad:  {name:'Voluntad',        statKey:'esp',    baseE:2,  procBaseAtF:0.05, advBaseAtA:0.05, advLabel:'probabilidad de que tu próxima habilidad cueste la mitad de espíritu'},
  instinto:  {name:'Instinto',        statKey:'hab',    baseE:2,  procBaseAtF:0.02, advBaseAtA:0.05, advLabel:'probabilidad de doble lanzamiento (el segundo gratis y sin turno)'},
  vitalidad: {name:'Vitalidad',       statKey:'maxhp',  baseE:1,  procBaseAtF:0.02, advBaseAtA:0.05, advLabel:'probabilidad de curar 10% de tu vida máxima'},
  furia:     {name:'Furia Contenida', statKey:null,     advTable:{A:0.25, S:0.50, SS:1.00}, advLabel:'probabilidad de revivir una vez por laberinto'},
  sombra:    {name:'Sombra Cazadora', statKey:null,     advTable:{A:0.01, S:0.05, SS:0.10}, advLabel:'probabilidad de invocar una sombra que atrae el agro'},
  // Piedras nuevas (pedido explícito 2026-10-02) — ver NEW_STONE_DEFS.
  celeridad: {name:'Celeridad',       statKey:'agi',    advLabel:'golpe crítico garantizado tras esquivar'},
  baluarte:  {name:'Baluarte',        statKey:'vig',    advLabel:'escudo al recibir un golpe crítico'},
  maleficio: {name:'Maleficio',       statKey:'hab',    advLabel:'cada estado del enemigo le baja todas las resistencias'}
};
function soulAdvancedValue(famId, tier){
  const fam = SOUL_FAMILIES[famId];
  if(!fam) return 0;
  const idx = soulTierIdx(tier);
  if(fam.advTable) return fam.advTable[tier] || 0;
  if(idx < 5) return 0; // 5 = rango A; antes de eso no hay efecto avanzado
  return fam.advBaseAtA + (idx-5)*0.10;
}
// Nerfeadas a la mitad de sus valores originales a pedido explícito: todo
// bonus.value, y todo special que sea magnitud directa de poder (robo de
// vida/reflejo/evasión/daño de Furia), quedó exactamente a la mitad. Las
// probabilidades de proc (aturdir/mp_refund/esp_refund/elemental_proc) y sus
// montos de recuperación NO se tocaron - son "qué tan seguido", no
// "estadística" en el sentido que se pidió nerfear.
const SOUL_STONES = {
  vigor_e:     {id:'vigor_e',     family:'vigor',     name:'Piedra del Alma: Vigor (E)',            tier:'E', icon:'🟤', bonus:{stat:'fis', value:2},
    desc:'+2 Físico permanente.', preview:'Desde F: probabilidad de aturdir al golpear. Desde A: roba vida.'},
  vigor_f:     {id:'vigor_f',     family:'vigor',     name:'Piedra del Alma: Vigor (F)',            tier:'F', icon:'🟤', bonus:{stat:'fis', value:4},
    special:{type:'aturdir', chance:0.02},
    desc:'+4 Físico. 2% de probabilidad de aturdir al enemigo al golpear.', preview:'Desde A: roba vida (% del daño causado).'},
  sabiduria_e: {id:'sabiduria_e', family:'sabiduria', name:'Piedra del Alma: Sabiduría (E)',        tier:'E', icon:'📘', bonus:{stat:'maxsta', value:8},
    desc:'+8 MP máximo.', preview:'Desde F: probabilidad de recuperar MP gastado. Desde A: escudo de maná.'},
  sabiduria_f: {id:'sabiduria_f', family:'sabiduria', name:'Piedra del Alma: Sabiduría (F)',        tier:'F', icon:'📘', bonus:{stat:'maxsta', value:16},
    special:{type:'mp_refund', chance:0.05, amount:0.05},
    desc:'+16 MP máximo. 5% de probabilidad de recuperar el 5% del MP gastado.', preview:'Desde A: probabilidad de escudo de maná (cubre daño físico y mágico según tu MP máximo).'},
  voluntad_e:  {id:'voluntad_e',  family:'voluntad',  name:'Piedra del Alma: Voluntad (E)',         tier:'E', icon:'🔷', bonus:{stat:'esp', value:2},
    desc:'+2 Espíritu permanente.', preview:'Desde F: probabilidad de recuperar espíritu gastado. Desde A: próxima habilidad a mitad de costo.'},
  voluntad_f:  {id:'voluntad_f',  family:'voluntad',  name:'Piedra del Alma: Voluntad (F)',         tier:'F', icon:'🔷', bonus:{stat:'esp', value:4},
    special:{type:'esp_refund', chance:0.05, amount:0.05},
    desc:'+4 Espíritu. 5% de probabilidad de recuperar el 5% del espíritu gastado.', preview:'Desde A: probabilidad de que tu próxima habilidad cueste la mitad de espíritu.'},
  instinto_e:  {id:'instinto_e',  family:'instinto',  name:'Piedra del Alma: Instinto (E)',         tier:'E', icon:'🟢', bonus:{stat:'hab', value:2},
    desc:'+2 Habilidad permanente.', preview:'Desde F: probabilidad de quemar, congelar/ralentizar o envenenar según la habilidad. Desde A: doble lanzamiento.'},
  instinto_f:  {id:'instinto_f',  family:'instinto',  name:'Piedra del Alma: Instinto (F)',         tier:'F', icon:'🟢', bonus:{stat:'hab', value:4},
    special:{type:'elemental_proc', chance:0.02},
    desc:'+4 Habilidad. 2% de probabilidad de quemar (fuego), congelar/ralentizar (hielo) o envenenar (el resto de habilidades) al enemigo, según la habilidad usada.', preview:'Desde A: probabilidad de lanzar la habilidad dos veces (la segunda gratis, sin gastar turno).'},
  vitalidad_e: {id:'vitalidad_e', family:'vitalidad', name:'Piedra del Alma: Vitalidad (E)',        tier:'E', icon:'❤️', bonus:{stat:'maxhp', value:1},
    desc:'+8 Vida máxima aprox.', preview:'Desde F: refleja parte del daño recibido. Desde A: probabilidad de autocurarte.'},
  vitalidad_f: {id:'vitalidad_f', family:'vitalidad', name:'Piedra del Alma: Vitalidad (F)',        tier:'F', icon:'❤️', bonus:{stat:'maxhp', value:2},
    special:{type:'reflect', pct:0.01},
    desc:'+16 Vida máxima aprox. Devuelves el 1% del daño físico que recibes a tu atacante.', preview:'Desde A: probabilidad de recuperar el 10% de tu vida máxima.'},
  // Furia Contenida — REWORK 2026-09-24 (pedido explícito). Deja de ser un
  // multiplicador pasivo recalculado en cada golpe mientras estés bajo el
  // umbral (podía durar el combate entero, sin límite de usos) y pasa a ser
  // una piedra de supervivencia ofensiva: al cruzar el umbral de vida por
  // primera vez en el combate, se dispara 1 SOLA VEZ un buff de daño (+
  // reducción de daño recibido desde D) durante un número fijo de turnos —
  // ver checkFuriaContenidaTrigger(), enganchado en dealDamageToPlayer().
  // Ahora también da un bono plano de Físico permanente (antes no daba
  // ningún stat, solo el efecto de bajo HP) — misma progresión que Vigor.
  // Sinergia con el Bárbaro (Furia de sangre, +20% daño bajo 30% de vida):
  // esta piedra convierte esa condición racial en una build de riesgo/
  // recompensa a propósito.
  furia_e:     {id:'furia_e',     family:'furia',     name:'Piedra del Alma: Furia Contenida (E)',  tier:'E', icon:'🔥', bonus:{stat:'fis', value:2},
    special:{type:'furia_v2', threshold:0.30, dmgBonus:0.05, dmgReduction:0, duration:2},
    desc:'+2 Físico. Por debajo del 30% de vida (1 vez por combate): +5% de daño durante 2 turnos.', preview:'Desde D: también reduce el daño que recibís mientras dura.'},
  furia_f:     {id:'furia_f',     family:'furia',     name:'Piedra del Alma: Furia Contenida (F)',  tier:'F', icon:'🔥', bonus:{stat:'fis', value:4},
    special:{type:'furia_v2', threshold:0.35, dmgBonus:0.07, dmgReduction:0, duration:2},
    desc:'+4 Físico. Por debajo del 35% de vida (1 vez por combate): +7% de daño durante 2 turnos.', preview:'Desde D: también reduce el daño que recibís mientras dura.'},
  sombra_e:    {id:'sombra_e',    family:'sombra',    name:'Piedra del Alma: Sombra Cazadora (E)',  tier:'E', icon:'🌑',
    special:{type:'evasion_flat', value:0.015},
    desc:'+1.5% de probabilidad de esquivar cualquier ataque.', preview:'Desde A: probabilidad de invocar una sombra que atrae el agro de los enemigos (1% en A, 5% en S, 10% en SS; máximo una sombra a la vez).'},
  sombra_f:    {id:'sombra_f',    family:'sombra',    name:'Piedra del Alma: Sombra Cazadora (F)',  tier:'F', icon:'🌑',
    special:{type:'evasion_flat', value:0.03},
    desc:'+3% de probabilidad de esquivar cualquier ataque.', preview:'Desde A: probabilidad de invocar una sombra que atrae el agro de los enemigos (1% en A, 5% en S, 10% en SS; máximo una sombra a la vez).'},

  // Rangos D-A: mismas fórmulas de escalado documentadas arriba (se duplican
  // por rango), ya activas. El "efecto avanzado" prometido en A para
  // Voluntad/Instinto/Vitalidad (mitad de costo, doble lanzamiento,
  // autocuración) todavía no tiene código de combate propio — esas piedras
  // se quedan con el efecto de F escalado hasta que se implemente esa
  // mecánica nueva. Vigor/Sombra/Furia ya cambian en A (robo de vida/
  // invocar sombra/buff de bajo HP, respectivamente) y Sabiduría también
  // desde 2026-09-26 (escudo de maná — pedido explícito tras reportar que
  // no hacía nada real, ver 'mana_shield' en playerUseSkill).
  vigor_d:     {id:'vigor_d',     family:'vigor',     name:'Piedra del Alma: Vigor (D)',            tier:'D', icon:'🟤', bonus:{stat:'fis', value:8},
    special:{type:'aturdir', chance:0.04},
    desc:'+8 Físico. 4% de probabilidad de aturdir al enemigo al golpear.', preview:'Desde A: roba vida (% del daño causado).'},
  vigor_c:     {id:'vigor_c',     family:'vigor',     name:'Piedra del Alma: Vigor (C)',            tier:'C', icon:'🟤', bonus:{stat:'fis', value:16},
    special:{type:'aturdir', chance:0.08},
    desc:'+16 Físico. 8% de probabilidad de aturdir al enemigo al golpear.', preview:'Desde A: roba vida (% del daño causado).'},
  vigor_b:     {id:'vigor_b',     family:'vigor',     name:'Piedra del Alma: Vigor (B)',            tier:'B', icon:'🟤', bonus:{stat:'fis', value:24},
    special:{type:'aturdir', chance:0.16},
    desc:'+24 Físico. 16% de probabilidad de aturdir al enemigo al golpear.', preview:'Desde A: roba vida (% del daño causado).'},
  vigor_a:     {id:'vigor_a',     family:'vigor',     name:'Piedra del Alma: Vigor (A)',            tier:'A', icon:'🟤', bonus:{stat:'fis', value:32},
    special:{type:'robovida', percent:0.05},
    desc:'+32 Físico. Robas el 5% del daño físico que causas como vida.'},

  sabiduria_d: {id:'sabiduria_d', family:'sabiduria', name:'Piedra del Alma: Sabiduría (D)',        tier:'D', icon:'📘', bonus:{stat:'maxsta', value:32},
    special:{type:'mp_refund', chance:0.10, amount:0.05},
    desc:'+32 MP máximo. 10% de probabilidad de recuperar el 5% del MP gastado.', preview:'Desde A: probabilidad de generar un escudo de maná que absorbe daño físico y mágico.'},
  sabiduria_c: {id:'sabiduria_c', family:'sabiduria', name:'Piedra del Alma: Sabiduría (C)',        tier:'C', icon:'📘', bonus:{stat:'maxsta', value:64},
    special:{type:'mp_refund', chance:0.20, amount:0.05},
    desc:'+64 MP máximo. 20% de probabilidad de recuperar el 5% del MP gastado.', preview:'Desde A: probabilidad de generar un escudo de maná que absorbe daño físico y mágico.'},
  sabiduria_b: {id:'sabiduria_b', family:'sabiduria', name:'Piedra del Alma: Sabiduría (B)',        tier:'B', icon:'📘', bonus:{stat:'maxsta', value:96},
    special:{type:'mp_refund', chance:0.40, amount:0.05},
    desc:'+96 MP máximo. 40% de probabilidad de recuperar el 5% del MP gastado.', preview:'Desde A: probabilidad de generar un escudo de maná que absorbe daño físico y mágico.'},
  sabiduria_a: {id:'sabiduria_a', family:'sabiduria', name:'Piedra del Alma: Sabiduría (A)',        tier:'A', icon:'📘', bonus:{stat:'maxsta', value:128},
    specials:[{type:'mp_refund', chance:0.80, amount:0.05}, {type:'mana_shield', chance:0.05, shieldPct:0.40}],
    desc:'+128 MP máximo. 80% de probabilidad de recuperar el 5% del MP gastado. 5% de probabilidad de generar un escudo de maná (40% de tu MP máximo) que absorbe daño físico y mágico.'},

  voluntad_d:  {id:'voluntad_d',  family:'voluntad',  name:'Piedra del Alma: Voluntad (D)',         tier:'D', icon:'🔷', bonus:{stat:'esp', value:8},
    special:{type:'esp_refund', chance:0.10, amount:0.05},
    desc:'+8 Espíritu. 10% de probabilidad de recuperar el 5% del espíritu gastado.', preview:'Desde A: próxima habilidad a mitad de costo (pendiente de implementar).'},
  voluntad_c:  {id:'voluntad_c',  family:'voluntad',  name:'Piedra del Alma: Voluntad (C)',         tier:'C', icon:'🔷', bonus:{stat:'esp', value:16},
    special:{type:'esp_refund', chance:0.20, amount:0.05},
    desc:'+16 Espíritu. 20% de probabilidad de recuperar el 5% del espíritu gastado.', preview:'Desde A: próxima habilidad a mitad de costo (pendiente de implementar).'},
  voluntad_b:  {id:'voluntad_b',  family:'voluntad',  name:'Piedra del Alma: Voluntad (B)',         tier:'B', icon:'🔷', bonus:{stat:'esp', value:24},
    special:{type:'esp_refund', chance:0.40, amount:0.05},
    desc:'+24 Espíritu. 40% de probabilidad de recuperar el 5% del espíritu gastado.', preview:'Desde A: próxima habilidad a mitad de costo (pendiente de implementar).'},
  voluntad_a:  {id:'voluntad_a',  family:'voluntad',  name:'Piedra del Alma: Voluntad (A)',         tier:'A', icon:'🔷', bonus:{stat:'esp', value:32},
    special:{type:'esp_refund', chance:0.80, amount:0.05},
    desc:'+32 Espíritu. 80% de probabilidad de recuperar el 5% del espíritu gastado. (La mitad de costo prometida en este rango todavía no está implementada.)'},

  instinto_d:  {id:'instinto_d',  family:'instinto',  name:'Piedra del Alma: Instinto (D)',         tier:'D', icon:'🟢', bonus:{stat:'hab', value:8},
    special:{type:'elemental_proc', chance:0.04},
    desc:'+8 Habilidad. 4% de probabilidad de quemar (fuego), congelar/ralentizar (hielo) o envenenar (el resto de habilidades) al enemigo, según la habilidad usada.', preview:'Desde A: doble lanzamiento (pendiente de implementar).'},
  instinto_c:  {id:'instinto_c',  family:'instinto',  name:'Piedra del Alma: Instinto (C)',         tier:'C', icon:'🟢', bonus:{stat:'hab', value:16},
    special:{type:'elemental_proc', chance:0.08},
    desc:'+16 Habilidad. 8% de probabilidad de quemar (fuego), congelar/ralentizar (hielo) o envenenar (el resto de habilidades) al enemigo, según la habilidad usada.', preview:'Desde A: doble lanzamiento (pendiente de implementar).'},
  instinto_b:  {id:'instinto_b',  family:'instinto',  name:'Piedra del Alma: Instinto (B)',         tier:'B', icon:'🟢', bonus:{stat:'hab', value:24},
    special:{type:'elemental_proc', chance:0.16},
    desc:'+24 Habilidad. 16% de probabilidad de quemar (fuego), congelar/ralentizar (hielo) o envenenar (el resto de habilidades) al enemigo, según la habilidad usada.', preview:'Desde A: doble lanzamiento (pendiente de implementar).'},
  instinto_a:  {id:'instinto_a',  family:'instinto',  name:'Piedra del Alma: Instinto (A)',         tier:'A', icon:'🟢', bonus:{stat:'hab', value:32},
    special:{type:'elemental_proc', chance:0.32},
    desc:'+32 Habilidad. 32% de probabilidad de quemar (fuego), congelar/ralentizar (hielo) o envenenar (el resto de habilidades) al enemigo, según la habilidad usada. (El doble lanzamiento prometido en este rango todavía no está implementado.)'},

  vitalidad_d: {id:'vitalidad_d', family:'vitalidad', name:'Piedra del Alma: Vitalidad (D)',        tier:'D', icon:'❤️', bonus:{stat:'maxhp', value:4},
    special:{type:'reflect', pct:0.02},
    desc:'+32 Vida máxima aprox. Devuelves el 2% del daño físico que recibes a tu atacante.', preview:'Desde A: probabilidad de autocurarte (pendiente de implementar).'},
  vitalidad_c: {id:'vitalidad_c', family:'vitalidad', name:'Piedra del Alma: Vitalidad (C)',        tier:'C', icon:'❤️', bonus:{stat:'maxhp', value:8},
    special:{type:'reflect', pct:0.04},
    desc:'+64 Vida máxima aprox. Devuelves el 4% del daño físico que recibes a tu atacante.', preview:'Desde A: probabilidad de autocurarte (pendiente de implementar).'},
  vitalidad_b: {id:'vitalidad_b', family:'vitalidad', name:'Piedra del Alma: Vitalidad (B)',        tier:'B', icon:'❤️', bonus:{stat:'maxhp', value:12},
    special:{type:'reflect', pct:0.08},
    desc:'+96 Vida máxima aprox. Devuelves el 8% del daño físico que recibes a tu atacante.', preview:'Desde A: probabilidad de autocurarte (pendiente de implementar).'},
  vitalidad_a: {id:'vitalidad_a', family:'vitalidad', name:'Piedra del Alma: Vitalidad (A)',        tier:'A', icon:'❤️', bonus:{stat:'maxhp', value:16},
    special:{type:'reflect', pct:0.16},
    desc:'+128 Vida máxima aprox. Devuelves el 16% del daño físico que recibes a tu atacante. (La autocuración prometida en este rango todavía no está implementada.)'},

  furia_d:     {id:'furia_d',     family:'furia',     name:'Piedra del Alma: Furia Contenida (D)',  tier:'D', icon:'🔥', bonus:{stat:'fis', value:8},
    special:{type:'furia_v2', threshold:0.35, dmgBonus:0.10, dmgReduction:0.05, duration:2},
    desc:'+8 Físico. Por debajo del 35% de vida (1 vez por combate): +10% de daño y -5% de daño recibido durante 2 turnos.'},
  furia_c:     {id:'furia_c',     family:'furia',     name:'Piedra del Alma: Furia Contenida (C)',  tier:'C', icon:'🔥', bonus:{stat:'fis', value:16},
    special:{type:'furia_v2', threshold:0.35, dmgBonus:0.12, dmgReduction:0.08, duration:2},
    desc:'+16 Físico. Por debajo del 35% de vida (1 vez por combate): +12% de daño y -8% de daño recibido durante 2 turnos.'},
  furia_b:     {id:'furia_b',     family:'furia',     name:'Piedra del Alma: Furia Contenida (B)',  tier:'B', icon:'🔥', bonus:{stat:'fis', value:24},
    special:{type:'furia_v2', threshold:0.40, dmgBonus:0.15, dmgReduction:0.10, duration:2},
    desc:'+24 Físico. Por debajo del 40% de vida (1 vez por combate): +15% de daño y -10% de daño recibido durante 2 turnos.'},
  furia_a:     {id:'furia_a',     family:'furia',     name:'Piedra del Alma: Furia Contenida (A)',  tier:'A', icon:'🔥', bonus:{stat:'fis', value:32},
    special:{type:'furia_v2', threshold:0.40, dmgBonus:0.18, dmgReduction:0.12, duration:2},
    desc:'+32 Físico. Por debajo del 40% de vida (1 vez por combate): +18% de daño y -12% de daño recibido durante 2 turnos.'},

  sombra_d:    {id:'sombra_d',    family:'sombra',    name:'Piedra del Alma: Sombra Cazadora (D)',  tier:'D', icon:'🌑',
    special:{type:'evasion_flat', value:0.045},
    desc:'+4.5% de probabilidad de esquivar cualquier ataque.', preview:'Desde A: invocar una sombra que atrae el agro (pendiente de implementar).'},
  sombra_c:    {id:'sombra_c',    family:'sombra',    name:'Piedra del Alma: Sombra Cazadora (C)',  tier:'C', icon:'🌑',
    special:{type:'evasion_flat', value:0.06},
    desc:'+6% de probabilidad de esquivar cualquier ataque.', preview:'Desde A: invocar una sombra que atrae el agro (pendiente de implementar).'},
  sombra_b:    {id:'sombra_b',    family:'sombra',    name:'Piedra del Alma: Sombra Cazadora (B)',  tier:'B', icon:'🌑',
    special:{type:'evasion_flat', value:0.08},
    desc:'+8% de probabilidad de esquivar cualquier ataque.', preview:'Desde A: invocar una sombra que atrae el agro (pendiente de implementar).'},
  // 2026-09-25: se implementa "invocar una sombra" (ver trySummonShadow(),
  // enganchado al inicio de cada turno propio) — 1% en A. Respeta el tope
  // de 6 combatientes y solo se activa 1 vez por combate (recomendación
  // propia: más simple y predecible que un cooldown en turnos, y ya de por
  // sí es una probabilidad baja + máximo una sombra viva a la vez).
  sombra_a:    {id:'sombra_a',    family:'sombra',    name:'Piedra del Alma: Sombra Cazadora (A)',  tier:'A', icon:'🌑',
    specials:[{type:'evasion_flat', value:0.10}, {type:'sombra_summon', chance:0.01}],
    desc:'+10% de probabilidad de esquivar cualquier ataque. 1% de invocar una Sombra Cazadora que se planta al frente y atrae el agro (1 vez por combate).'},

  // Rangos S y SS: mismas fórmulas, continuadas un escalón más. SS es el tope
  // absoluto del sistema — numerado/único mundial en espíritu, aunque todavía
  // sin ese control de unicidad real implementado.
  vigor_s:     {id:'vigor_s',     family:'vigor',     name:'Piedra del Alma: Vigor (S)',            tier:'S', icon:'🟤', bonus:{stat:'fis', value:40},
    special:{type:'robovida', percent:0.10},
    desc:'+40 Físico. Robas el 10% del daño físico que causas como vida.'},
  vigor_ss:    {id:'vigor_ss',    family:'vigor',     name:'Piedra del Alma: Vigor (SS)',           tier:'SS', icon:'🟤', bonus:{stat:'fis', value:50},
    special:{type:'robovida', percent:0.15},
    desc:'+50 Físico. Robas el 15% del daño físico que causas como vida.'},

  sabiduria_s: {id:'sabiduria_s', family:'sabiduria', name:'Piedra del Alma: Sabiduría (S)',        tier:'S', icon:'📘', bonus:{stat:'maxsta', value:160},
    specials:[{type:'mp_refund', chance:1, amount:0.05}, {type:'mana_shield', chance:0.15, shieldPct:0.55}],
    desc:'+160 MP máximo. Recuperas siempre el 5% del MP gastado. 15% de probabilidad de generar un escudo de maná (55% de tu MP máximo) que absorbe daño físico y mágico.'},
  sabiduria_ss:{id:'sabiduria_ss',family:'sabiduria', name:'Piedra del Alma: Sabiduría (SS)',       tier:'SS', icon:'📘', bonus:{stat:'maxsta', value:200},
    specials:[{type:'mp_refund', chance:1, amount:0.05}, {type:'mana_shield', chance:0.25, shieldPct:0.70}],
    desc:'+200 MP máximo. Recuperas siempre el 5% del MP gastado. 25% de probabilidad de generar un escudo de maná (70% de tu MP máximo) que absorbe daño físico y mágico.'},

  voluntad_s:  {id:'voluntad_s',  family:'voluntad',  name:'Piedra del Alma: Voluntad (S)',         tier:'S', icon:'🔷', bonus:{stat:'esp', value:40},
    special:{type:'esp_refund', chance:1, amount:0.05},
    desc:'+40 Espíritu. Recuperas siempre el 5% del espíritu gastado.'},
  voluntad_ss: {id:'voluntad_ss', family:'voluntad',  name:'Piedra del Alma: Voluntad (SS)',        tier:'SS', icon:'🔷', bonus:{stat:'esp', value:50},
    special:{type:'esp_refund', chance:1, amount:0.05},
    desc:'+50 Espíritu. Recuperas siempre el 5% del espíritu gastado.'},

  instinto_s:  {id:'instinto_s',  family:'instinto',  name:'Piedra del Alma: Instinto (S)',         tier:'S', icon:'🟢', bonus:{stat:'hab', value:40},
    special:{type:'elemental_proc', chance:0.64},
    desc:'+40 Habilidad. 64% de probabilidad de quemar (fuego), congelar/ralentizar (hielo) o envenenar (el resto de habilidades) al enemigo, según la habilidad usada.'},
  instinto_ss: {id:'instinto_ss', family:'instinto',  name:'Piedra del Alma: Instinto (SS)',        tier:'SS', icon:'🟢', bonus:{stat:'hab', value:50},
    special:{type:'elemental_proc', chance:1},
    desc:'+50 Habilidad. Siempre quemas, congelas/ralentizas o envenenas al enemigo, según la habilidad usada.'},

  vitalidad_s: {id:'vitalidad_s', family:'vitalidad', name:'Piedra del Alma: Vitalidad (S)',        tier:'S', icon:'❤️', bonus:{stat:'maxhp', value:20},
    special:{type:'reflect', pct:0.32},
    desc:'+160 Vida máxima aprox. Devuelves el 32% del daño físico que recibes a tu atacante.'},
  vitalidad_ss:{id:'vitalidad_ss',family:'vitalidad', name:'Piedra del Alma: Vitalidad (SS)',       tier:'SS', icon:'❤️', bonus:{stat:'maxhp', value:25},
    special:{type:'reflect', pct:0.5},
    desc:'+200 Vida máxima aprox. Devuelves el 50% del daño físico que recibes a tu atacante.'},

  furia_s:     {id:'furia_s',     family:'furia',     name:'Piedra del Alma: Furia Contenida (S)',  tier:'S', icon:'🔥', bonus:{stat:'fis', value:40},
    special:{type:'furia_v2', threshold:0.45, dmgBonus:0.22, dmgReduction:0.15, duration:3},
    desc:'+40 Físico. Por debajo del 45% de vida (1 vez por combate): +22% de daño y -15% de daño recibido durante 3 turnos.'},
  furia_ss:    {id:'furia_ss',    family:'furia',     name:'Piedra del Alma: Furia Contenida (SS)', tier:'SS', icon:'🔥', bonus:{stat:'fis', value:50},
    special:{type:'furia_v2', threshold:0.50, dmgBonus:0.25, dmgReduction:0.20, duration:3},
    desc:'+50 Físico. Por debajo del 50% de vida (1 vez por combate): +25% de daño y -20% de daño recibido durante 3 turnos.'},

  sombra_s:    {id:'sombra_s',    family:'sombra',    name:'Piedra del Alma: Sombra Cazadora (S)',  tier:'S', icon:'🌑',
    specials:[{type:'evasion_flat', value:0.12}, {type:'sombra_summon', chance:0.05}],
    desc:'+12% de probabilidad de esquivar cualquier ataque. 5% de invocar una Sombra Cazadora que se planta al frente y atrae el agro (1 vez por combate).'},
  sombra_ss:   {id:'sombra_ss',   family:'sombra',    name:'Piedra del Alma: Sombra Cazadora (SS)', tier:'SS', icon:'🌑',
    specials:[{type:'evasion_flat', value:0.14}, {type:'sombra_summon', chance:0.10}],
    desc:'+14% de probabilidad de esquivar cualquier ataque. 10% de invocar una Sombra Cazadora que se planta al frente y atrae el agro (1 vez por combate).'}
};
// ---- Ajustes 2026-10-02 (pedido explícito) sobre el catálogo de arriba ----
const STONE_TIER_LIST = ['E','F','D','C','B','A','S','SS'];
// 1) Vigor: solo Vida máxima (misma escala que Vitalidad), sin Físico, y
//    (pedido explícito 2026-10-02, opción "regeneración") su efecto pasa a
//    ser regenerar vida cada turno — deja de aturdir y de robar vida, para
//    no pisarse con Baluarte (escudo/reducción) ni con Furia (daño).
//    Desde A, la regeneración se duplica por debajo del 50% de vida.
const VIT_STONE_VALUES = {E:1, F:2, D:4, C:8, B:12, A:16, S:20, SS:25};
const VIGOR_REGEN = {E:0, F:0.01, D:0.015, C:0.02, B:0.025, A:0.03, S:0.035, SS:0.04};
STONE_TIER_LIST.forEach(t=>{
  const st = SOUL_STONES['vigor_'+t.toLowerCase()];
  if(!st) return;
  const v = VIT_STONE_VALUES[t], r = VIGOR_REGEN[t];
  const lowHpDouble = ['A','S','SS'].includes(t);
  st.bonus = {stat:'maxhp', value:v};
  delete st.special;
  st.specials = r ? [{type:'regen_vida', pct:r, lowHpDouble}] : [];
  st.desc = `+${v*8} Vida máxima aprox.` + (r ? ` Regeneras el ${(r*100).toLocaleString('es')}% de tu vida máxima cada turno.` : '') + (lowHpDouble ? ' Por debajo del 50% de vida, la regeneración se duplica.' : '');
  st.preview = lowHpDouble ? undefined : 'Desde F: regeneras vida cada turno. Desde A: la regeneración se duplica por debajo del 50% de vida.';
});
// 2) Efectos de rango A/S/SS que estaban prometidos y nunca se programaron
//    (Voluntad: mitad de costo; Instinto: doble lanzamiento; Vitalidad:
//    autocuración). Se agregan como un special más; probabilidades de
//    soulAdvancedValue (A 5%, S 15%, SS 25%).
const ADV_STONE_EFFECTS = {
  voluntad: (c)=>({sp:{type:'esp_mitad_siguiente', chance:c}, text:`${Math.round(c*100)}% de que tu siguiente habilidad de Espíritu cueste la mitad.`}),
  instinto: (c)=>({sp:{type:'doble_encantamiento', chance:c}, text:`${Math.round(c*100)}% de lanzar tu habilidad dos veces (la segunda gratis).`}),
  vitalidad:(c)=>({sp:{type:'autocuracion', chance:c, pct:0.10}, text:`${Math.round(c*100)}% al recibir daño de recuperar el 10% de tu vida máxima (máx. 1 vez por turno).`}),
};
Object.entries(ADV_STONE_EFFECTS).forEach(([fam, mk])=>{
  ['A','S','SS'].forEach(t=>{
    const st = SOUL_STONES[fam+'_'+t.toLowerCase()];
    if(!st) return;
    const {sp, text} = mk(soulAdvancedValue(fam, t));
    st.specials = (st.specials || (st.special ? [st.special] : [])).concat([sp]);
    delete st.special;
    st.desc = st.desc.replace(/ ?\([^)]*(no está implementad|pendiente)[^)]*\)/g, '') + ' ' + text;
  });
});
STONE_TIER_LIST.forEach(t=>{
  ['voluntad','instinto','vitalidad'].forEach(fam=>{
    const st = SOUL_STONES[fam+'_'+t.toLowerCase()];
    if(st && st.preview) st.preview = st.preview.replace(/ ?\(pendiente de implementar\)/g, '');
  });
});
// 3) Piedras nuevas: Celeridad (Agilidad), Baluarte (Vigor), Maleficio
//    (Habilidad). Stat con la misma escala que las piedras de stat viejas.
const NEW_STONE_STAT = {E:2, F:4, D:8, C:16, B:24, A:32, S:40, SS:50};
const NEW_STONE_DEFS = {
  celeridad: {icon:'💨', statLabel:'Agilidad',
    f:{E:0, F:0.05, D:0.08, C:0.12, B:0.16, A:0.20, S:0.25, SS:0.30}, fType:'critico_dano', fText:v=>`+${Math.round(v*100)}% de daño crítico.`,
    adv:{A:3, S:2, SS:1}, advType:'celeridad_contraataque', advText:v=>`Al esquivar un ataque, tu siguiente golpe es crítico garantizado (como mucho cada ${v} turno${v>1?'s':''}).`,
    preview:'Desde F: daño crítico. Desde A: crítico garantizado tras esquivar — combina con Sombra Cazadora (evasión).'},
  baluarte: {icon:'🛡️', statLabel:'Vigor',
    f:{E:0, F:0.02, D:0.03, C:0.04, B:0.05, A:0.06, S:0.08, SS:0.10}, fType:'reduccion_dano', fText:v=>`${Math.round(v*100)}% de reducción de daño recibido.`,
    adv:{A:0.10, S:0.15, SS:0.20}, advType:'baluarte_escudo', advText:v=>`Al recibir un golpe crítico, ganas un escudo del ${Math.round(v*100)}% de tu vida máxima (1 vez por combate).`,
    preview:'Desde F: reducción de daño. Desde A: escudo al recibir un golpe crítico.'},
  maleficio: {icon:'🕯️', statLabel:'Habilidad',
    f:{E:0, F:0.03, D:0.05, C:0.08, B:0.10, A:0.12, S:0.15, SS:0.20}, fType:'prob_estados', fText:v=>`+${Math.round(v*100)}% de probabilidad de aplicar estados con tus habilidades.`,
    adv:{A:2, S:3, SS:4}, advType:'maleficio_res', advText:v=>`Cada estado negativo distinto del enemigo le quita ${v} puntos a todas sus resistencias (máx. 3 estados).`,
    preview:'Desde F: probabilidad de aplicar estados. Desde A: los estados del enemigo bajan sus resistencias.'},
};
Object.entries(NEW_STONE_DEFS).forEach(([fam, def])=>{
  STONE_TIER_LIST.forEach(t=>{
    const statV = NEW_STONE_STAT[t];
    const specials = [];
    const parts = [`+${statV} ${def.statLabel}.`];
    if(def.f[t]){ specials.push(def.fType==='critico_dano'||def.fType==='reduccion_dano'||def.fType==='prob_estados' ? {type:def.fType, value:def.f[t]} : {type:def.fType, chance:def.f[t]}); parts.push(def.fText(def.f[t])); }
    if(def.adv[t]){
      const a = def.adv[t];
      specials.push(def.advType==='celeridad_contraataque' ? {type:a ? def.advType : '', cooldown:a}
        : def.advType==='baluarte_escudo' ? {type:def.advType, shieldPct:a}
        : {type:def.advType, perStatus:a});
      parts.push(def.advText(a));
    }
    const id = fam+'_'+t.toLowerCase();
    SOUL_STONES[id] = {id, family:fam, name:`Piedra del Alma: ${SOUL_FAMILIES[fam].name} (${t})`, tier:t, icon:def.icon,
      bonus:{stat:SOUL_FAMILIES[fam].statKey, value:statV}, specials, desc:parts.join(' '), preview: def.adv[t] ? undefined : def.preview};
  });
});
// Instancia de inventario de una piedra (antes cada lugar copiaba los campos a
// mano y se olvidaba de `specials` — bug 2026-10-02: Sombra Cazadora A+ y
// Sabiduría S+ nunca tuvieron sus efectos porque viven en `specials`).
function makeSoulStoneItem(tpl){
  const it = {kind:'soulstone', stoneId:tpl.id, family:tpl.family, name:tpl.name, tier:tpl.tier, icon:tpl.icon, desc:tpl.desc, preview:tpl.preview, bonus:tpl.bonus};
  if(tpl.special) it.special = tpl.special;
  if(tpl.specials) it.specials = tpl.specials;
  return it;
}

function maxSoulSlots(level){ return Math.floor((level||1)/10); } // 1 espacio cada 10 niveles
function ensureSoulSlots(){
  if(!state || !state.char) return;
  if(!state.char.soulSlots) state.char.soulSlots = [];
  const need = maxSoulSlots(state.char.level);
  while(state.char.soulSlots.length < need) state.char.soulSlots.push(null);
}
function socketedStones(){ return (state.char.soulSlots||[]).filter(Boolean); }

function socketStone(uid){
  ensureSoulSlots();
  const idx = state.char.inventory.findIndex(i=>i.kind==='soulstone' && i.uid===uid);
  if(idx<0) return;
  const stone = state.char.inventory[idx];
  if(!meetsStoneEquipLevel(stone, state.char.level)){
    log(`<b>${stone.name}</b> requiere nivel ${stoneEquipMinLevel(stone.tier)} para engarzarse.`);
    return;
  }
  // solo 1 piedra por familia a la vez: si ya tienes una de la misma familia,
  // la nueva la reemplaza SOLO si es de rango igual o superior; la anterior se destruye.
  const sameFamilySlot = state.char.soulSlots.findIndex(s=>s && s.family===stone.family);
  if(sameFamilySlot>=0){
    const old = state.char.soulSlots[sameFamilySlot];
    if(soulTierIdx(stone.tier) < soulTierIdx(old.tier)){
      log(`Ya llevas una piedra de ${SOUL_FAMILIES[stone.family].name} de rango igual o superior (${old.tier}). No la reemplazas.`);
      return;
    }
    if(!confirm(`Ya llevas engarzada "${old.name}" (rango ${old.tier}). Reemplazarla la destruye para siempre — no vuelve a tu mochila. ¿Continuar?`)) return;
    state.char.inventory.splice(idx,1);
    state.char.soulSlots[sameFamilySlot] = stone;
    log(`Tu <b>${old.name}</b> se destruye al ser reemplazada por <b>${stone.name}</b>.`);
    renderSheet();
    if(invOpen) renderInventory();
    save();
    return;
  }
  const emptySlot = state.char.soulSlots.findIndex(s=>!s);
  if(emptySlot<0){ log('No tienes espacios de alma libres. Retira una piedra primero.'); return; }
  state.char.inventory.splice(idx,1);
  state.char.soulSlots[emptySlot] = stone;
  log(`Engarzas <b>${stone.name}</b> en tu espacio de alma.`);
  renderSheet();
  if(invOpen) renderInventory();
  save();
}
function unsocketStone(slotIdx){
  const stone = state.char.soulSlots[slotIdx];
  if(!stone) return;
  if(!confirm(`Retirar "${stone.name}" (rango ${stone.tier}) la destruye para siempre — no vuelve a tu mochila. ¿Continuar?`)) return;
  state.char.soulSlots[slotIdx] = null;
  log(`Retiras <b>${stone.name}</b> de tu espacio de alma — se pierde para siempre.`);
  renderSheet();
  if(invOpen) renderInventory();
  save();
}

// Piedras de alma de aliado — pedido explícito 2026-09-24. Mismo criterio
// "duro" que las del jugador (reemplazar/retirar destruye la piedra para
// siempre, no vuelve a la mochila) para no tener dos reglas distintas en el
// mismo juego. Se persisten aparte (character_allies.soul_slots, ver
// migración 0009) porque el resto de saveAllyEquip solo guarda `equip`.
async function saveAllySoulSlots(row){
  const { error } = await supabase.from('character_allies').update({soul_slots: row.soul_slots||[]}).eq('id', row.id);
  if(error) console.error('No se pudo guardar las piedras de alma del aliado:', error.message);
}
function socketStoneOnAlly(uid, allyId){
  const row = (state.char.allies||[]).find(a=>a.id===allyId);
  if(!row) return;
  if(!row.soul_slots) row.soul_slots = [];
  while(row.soul_slots.length < ALLY_SOUL_SLOTS_MAX) row.soul_slots.push(null);
  const idx = state.char.inventory.findIndex(i=>i.kind==='soulstone' && i.uid===uid);
  if(idx<0) return;
  const stone = state.char.inventory[idx];
  if(!meetsStoneEquipLevel(stone, row.level)){
    log(`<b>${stone.name}</b> requiere nivel ${stoneEquipMinLevel(stone.tier)} — ${row.name} todavía no lo alcanza.`);
    return;
  }
  const sameFamilySlot = row.soul_slots.findIndex(s=>s && s.family===stone.family);
  if(sameFamilySlot>=0){
    const old = row.soul_slots[sameFamilySlot];
    if(soulTierIdx(stone.tier) < soulTierIdx(old.tier)){
      log(`${row.name} ya lleva una piedra de ${SOUL_FAMILIES[stone.family].name} de rango igual o superior (${old.tier}). No la reemplazas.`);
      return;
    }
    if(!confirm(`${row.name} ya lleva engarzada "${old.name}" (rango ${old.tier}). Reemplazarla la destruye para siempre — no vuelve a tu mochila. ¿Continuar?`)) return;
    state.char.inventory.splice(idx,1);
    row.soul_slots[sameFamilySlot] = stone;
    log(`La <b>${old.name}</b> de ${row.name} se destruye al ser reemplazada por <b>${stone.name}</b>.`);
  } else {
    const emptySlot = row.soul_slots.findIndex(s=>!s);
    if(emptySlot<0){ log(`${row.name} no tiene espacios de alma libres (máximo ${ALLY_SOUL_SLOTS_MAX}). Retira una piedra primero.`); return; }
    state.char.inventory.splice(idx,1);
    row.soul_slots[emptySlot] = stone;
    log(`Engarzas <b>${stone.name}</b> en ${row.name}.`);
  }
  renderSheet();
  if(invOpen) renderInventory();
  saveAllySoulSlots(row);
  save();
}
function unsocketAllyStone(allyId, slotIdx){
  const row = (state.char.allies||[]).find(a=>a.id===allyId);
  if(!row || !row.soul_slots) return;
  const stone = row.soul_slots[slotIdx];
  if(!stone) return;
  if(!confirm(`Retirar "${stone.name}" (rango ${stone.tier}) de ${row.name} la destruye para siempre — no vuelve a tu mochila. ¿Continuar?`)) return;
  row.soul_slots[slotIdx] = null;
  log(`Retiras <b>${stone.name}</b> de ${row.name} — se pierde para siempre.`);
  renderSheet();
  if(invOpen) renderInventory();
  saveAllySoulSlots(row);
  save();
}

/* ============================================================
   STATE
   ============================================================ */

let simMode = false, simOutcome = null; // simulador de balance (solo localhost, ver simRun)
let state = null;
let combat = null; // transient combat state, rebuilt each fight
let invOpen = false; // whether the inventory/equipment panel is showing
let equipTarget = 'player'; // 'player' o el id de un aliado — a quién equipa el Inventario ahora mismo
let invGearFilter = 'todos'; // 'todos' o un EQUIP_SLOTS — qué categoría de la mochila se muestra
let invGearTierFilter = 'todos'; // 'todos' o una key de RARITIES — filtro de rareza en el inventario
let invGearClassFilter = 'todos'; // 'todos' o una key de SHOP_ROLE_LABELS — filtro por senda en el inventario
let invStoneTierFilter = 'todos'; // 'todos' o una letra E-SS — filtro de rango en piedras de alma
let homeOpen = false; // whether the Hogar (home stash) panel is showing
// Filtros del Hogar (pedido explícito 2026-09-27, "ponle filtro al guardado,
// asi como la tienda") — mismo patrón de chips que invGearFilter/invGearTierFilter
// de arriba, pero por separado para la mochila y lo ya guardado en el Hogar,
// ya que son dos listas independientes en la misma pantalla.
let homeBagGearFilter = 'todos';
let homeBagGearTierFilter = 'todos';
let homeStashGearFilter = 'todos';
let homeStashGearTierFilter = 'todos';
// Tope de objetos guardados en el Hogar (pedido explícito 2026-09-27, junto
// con "guardar todo el equipamiento") — antes no tenía límite; ahora que hay
// un botón para volcar toda la mochila de una vez, hace falta un tope para
// que el stash no crezca sin control (mismo criterio que el límite de 250
// de la mochila misma, ver validate_character_update()).
const STASH_ITEM_CAP = 100;
let shopOpen = false; // whether the Tienda (shop) panel is showing
let rankingOpen = false; // whether the Ranking panel is showing
let adminOpen = false; // whether the Admin panel is showing
let missionsOpen = false; // whether the Gremio (missions board) panel is showing
let tabernaOpen = false; // whether the Taberna (allies) panel is showing
let ofrendaOpen = false; // whether the Otorgar Ofrenda (pet gacha) panel is showing
let checkinOpen = false; // whether the check-in diario panel is showing
let optionsOpen = false; // whether the Opciones (volumen + atajos de teclado) panel is showing
let currentUser = null; // Supabase auth user
let currentProfile = null; // {id, username, role, is_banned}


/* ============================================================
   UTIL
   ============================================================ */
function rnd(min,max){ return Math.floor(Math.random()*(max-min+1))+min; }
function chance(p){ return Math.random() < p; }
function clamp(v,a,b){ return Math.max(a, Math.min(b, v)); }
function pick(arr){ return arr[rnd(0,arr.length-1)]; }
// Elige un elemento de [{tpl, weight}, ...] respetando su peso relativo —
// usado por bestiary.eliteCompanions (2026-09-25, "Década 2 - Arañas").
function pickWeighted(list){
  const total = list.reduce((s,e)=>s+e.weight,0);
  let r = Math.random()*total;
  for(const e of list){ if((r-=e.weight)<=0) return e.tpl; }
  return list[list.length-1].tpl;
}

function log(msg){
  if(simMode) return;
  petFlashFromLog(msg);
  state.log.push(msg);
  if(state.log.length > 60) state.log.shift();
  renderLog();
  cityNotice(msg);
  save();
}
// Caídos del Laberinto en combate (pedido explícito 2026-10-07): cada vez que
// uno hace algo — su habilidad única o un efecto que salta al golpear — su
// carta entra un momento sobre la escena con lo que hizo. Fuera de la ofrenda
// y del inventario no se los volvía a ver. Todos esos efectos ya escriben en
// la Crónica una línea que empieza con el nombre del Caído en negrita, así
// que se engancha ahí en vez de tocar cada efecto por separado.
const petFlashQueue = [];
let petFlashBusy = false;
const petFlashLast = {};
function petFlashFromLog(msg){
  if(!combat || typeof msg !== 'string') return;
  const m = /^<b>([^<]+)<\/b>\s*(.*)$/.exec(msg);
  if(!m) return;
  const pet = equippedPets().find(p=> p.name === m[1]);
  if(!pet) return;
  const now = Date.now();
  if(now - (petFlashLast[pet.id]||0) < 2500 || petFlashQueue.length >= 3) return; // el mismo Caído no se repite golpe a golpe
  petFlashLast[pet.id] = now;
  let text = m[2].replace(/<[^>]+>/g, '').replace(/^se activa\s*(\(([^)]*)\))?:?\s*/i, (all, g, name)=> name ? name + ': ' : '').trim();
  text = text.charAt(0).toUpperCase() + text.slice(1);
  petFlashQueue.push({pet, text});
  if(!petFlashBusy) nextPetFlash();
}
function nextPetFlash(){
  const item = petFlashQueue.shift();
  const mount = document.getElementById('battle-stage-mount');
  if(!item || !mount || !combat){ petFlashBusy = false; petFlashQueue.length = 0; return; }
  petFlashBusy = true;
  const r = PET_RARITIES[item.pet.rarity] || {color:'#d9b76b', name:''};
  const rect = mount.getBoundingClientRect();
  const el = document.createElement('div');
  el.className = 'pet-flash';
  el.style.cssText = `--rc:${r.color}; left:${Math.round(rect.left + 10)}px; top:${Math.round(Math.max(8, rect.top + 10))}px; max-width:${Math.round(Math.max(220, rect.width - 20))}px;`;
  el.innerHTML = `<div class="pet-flash-art"><img src="${petArtPath(item.pet.id)}" alt=""></div>
    <div class="pet-flash-txt"><small>Caído del Laberinto</small><b>${item.pet.name}</b><span>${item.text}</span></div>`;
  document.body.appendChild(el);
  setTimeout(()=>{ el.remove(); nextPetFlash(); }, 2100);
}
// La Crónica ya no se ve en la ciudad (decisión de ariochbu 2026-10-04: solo
// queda en el laberinto, como relato de los turnos). El registro se sigue
// escribiendo igual, oculto. Para que una acción rechazada en la ciudad no
// quede sin explicación ("No tienes esa cantidad de oro", "requiere nivel
// 20", "El Hogar está lleno") ni pase inadvertido un regalo, esas líneas
// salen como un aviso breve. Los fallos de guardado NO se muestran al jugador.
function cityNotice(msg){
  if(!inCityMode()) return;
  const plain = String(msg).replace(/<[^>]+>/g,'').trim();
  if(!/^(No |Ingresa )|requiere nivel|está lleno|no puede usarla|^🎁/.test(plain) || /No se pudo guardar/.test(plain)) return;
  const gift = plain.startsWith('🎁');
  spawnFxToast('notice', gift ? '🎁' : '❕', plain.replace(/^🎁\s*/, ''), null);
}

/* ============================================================
   DERIVED CHARACTER STATS
   ============================================================ */
function race(){ return RACES[state.char.race]; }
function style(){ return STYLES[state.char.style]; }
const EQUIP_SLOTS = ['arma','arma2','armadura','amuleto','casco','botas','guantes'];
function slotLabel(slot){
  if(slot==='arma2') return OFFHAND_LABELS[state.char.style] || 'Arma 2';
  return {arma:'Arma', armadura:'Armadura', amuleto:'Accesorio', casco:'Casco', botas:'Botas', guantes:'Guantes'}[slot] || slot;
}

function baseStat(key){
  const r = race();
  let v = r.stats[key] + Math.floor((state.char.level-1) * 1); // +1 all stats per level
  const eq = state.char.equip;
  EQUIP_SLOTS.forEach(slot=>{
    const it = eq[slot];
    if(it && it.bonus && it.bonus.stat === key) v += it.bonus.value;
  });
  socketedStones().forEach(s=>{ if(s.bonus && s.bonus.stat === key) v += s.bonus.value; });
  // Piezas de conjunto (2026-10-02): pueden dar varios stats a la vez, así
  // que viven en item.mods con la clave del stat (fis/hab/esp/agi/vig).
  v += equipModsSum(eq, key);
  v += petStatSum(key);
  return v;
}

function totalRes(key){
  const r = race();
  let v = r.res[key] || 0;
  const eq = state.char.equip;
  EQUIP_SLOTS.forEach(slot=>{
    const it = eq[slot];
    if(it && it.bonus && it.bonus.res === key) v += it.bonus.value;
  });
  socketedStones().forEach(s=>{ if(s.bonus && s.bonus.res === key) v += s.bonus.value; });
  if(key==='fisico') v += petModSum('defensa_fisica') + equipModsSum(eq, 'res_fisica'); // RF de piezas de conjunto
  if(state.char.race === 'enano' && key==='fisico'){ /* flat handled in damage calc */ }
  return clamp(v, -60, 80);
}

// Vida máxima (2026-09-16, pedido explícito): Físico deja de alimentar la
// vida — ahora esa estadística solo importa para daño/otras cosas, y la
// "Vida máxima" es un stat propio del equipo (Casco, ver SET_CATALOG).
// Lo que SÍ debe subir la vida es el nivel, y con más fuerza que antes: a
// nivel 16 un Asesino no llegaba ni a 230 HP, que se sentía injusto contra
// jefes de ~10 mil HP — la meta que dio ariochbu fue ~700-800 HP a nivel 20
// para Asesino y ~1000-1100 para Guerrero. HP_PER_LEVEL variaría por senda
// (el Guerrero es más resistente por diseño, no por su Físico) — Tirador y
// Mago no vinieron con una meta explícita, los ubiqué por criterio propio
// entre ambos extremos (Tirador cerca de Asesino, Mago el más frágil).
const HP_BASE = 40;
const FORTALEZA_MENTAL_CAP = 0.6; // ver derived()
// 2026-09-16, pedido explícito (segunda baja: el laberinto se sentía muy
// fácil con la vida anterior) — Guerrero baja a x20, el resto a x10.
// Paladín: tanque/soporte, casi tanto HP como Guerrero pero no tanto (su
// supervivencia también viene de reducción de daño/escudos, no solo vida
// cruda). Hechicero: igual de frágil que Mago, mismo arquetipo de caster.
const HP_PER_LEVEL = {pesada:20, tirador:10, doblefilo:10, mago:10, sacerdote:10, paladin:17, hechicero:10};
// Paso 0 del rediseño de stats (pedido explícito 2026-09-28): Agilidad y
// Vigor se suman como stats de verdad, y Habilidad/Espíritu/Físico cambian
// de trabajo. Mago se deja intacto a propósito ("seguirá siendo con
// espíritu, aún no lo modifiques, esto hasta que cree las armas nuevas") —
// su arma1/arma2 siguen dando Espíritu y su daño sigue escalando con
// Espíritu; lo único que cambia para Mago acá es que Agilidad (no ya
// Habilidad) rige su crítico/evasión, igual que para el resto.
function derived(){
  const fis = baseStat('fis'), esp = baseStat('esp'), hab = baseStat('hab'), agi = baseStat('agi'), vig = baseStat('vig');
  let maxHP = Math.round((HP_BASE + state.char.level * (HP_PER_LEVEL[state.char.style]||40)) * classCurve('hp'));
  // MP (barra "MP", internamente curSta) ahora la alimenta SOLO Habilidad —
  // antes era fis×3+hab×2. Efecto esperado y ya avisado: Guerrero/Arquero/
  // Asesino, que hoy no invierten nada en Habilidad, van a notar su MP más
  // chico que antes hasta que el equipamiento libre de clase (fase 2) les
  // deje itemizar algo de Habilidad si quieren más pozo. No es un bug.
  const HAB_MP_RATE = 5;
  let maxSta = Math.round(20 + hab*HAB_MP_RATE);
  let maxSpi = Math.round(20 + esp*4);
  // Vigor → Vida máxima, lineal y simple (mismo criterio que Stamina→HP de
  // WoW/Diablo) — +3 HP por punto. A nivel 60 con Vigor bien invertido
  // (~100-130 con raza+nivel) suma +300-400 HP, un empujón real sin opacar
  // la vida que ya da el nivel/clase (Guerrero sigue siendo el más vivo).
  const VIG_HP_PER_POINT = 3;
  maxHP += Math.round(vig * VIG_HP_PER_POINT);
  const eq = state.char.equip;
  // El viejo bono bonus.stat==='maxhp' (×8) ya no lo otorga ningún equipo
  // nuevo (Armadura ahora da resistencia física, no vida) — se deja este
  // bucle solo por compatibilidad con piedras de alma/objetos viejos que
  // todavía puedan traerlo, no por diseño actual.
  EQUIP_SLOTS.forEach(slot=>{
    const it = eq[slot];
    if(it && it.bonus && it.bonus.stat === 'maxhp') maxHP += it.bonus.value*8;
  });
  socketedStones().forEach(s=>{
    if(s.bonus && s.bonus.stat === 'maxhp') maxHP += s.bonus.value*8;
    if(s.bonus && s.bonus.stat === 'maxsta') maxSta += s.bonus.value; // Sabiduría: valor directo, sin escalar
  });
  // Equipo general (recalibración 2026-09-16): casco/botas/accesorio dan
  // estadísticas nuevas que no encajan en el molde bonus.stat/bonus.res de
  // siempre (una sola pareja clave/valor por objeto) — viven en item.mods,
  // un diccionario libre {clave: valor} que se suma acá. maxhp_flat (Casco)
  // es HP real, sin el ×8 que sí aplica al viejo bonus.stat==='maxhp' de
  // Armadura.
  maxHP += equipModsSum(eq, 'maxhp_flat') + petModSum('maxhp_flat');
  maxSta += equipModsSum(eq, 'mp_flat') + petModSum('mp_flat');
  maxSpi += equipModsSum(eq, 'espiritu_flat') + petModSum('espiritu_flat');
  // Espíritu ahora alimenta las dos resistencias de estado (pedido explícito
  // 2026-09-28) — siguen siendo DOS stats separados entre sí (uno cubre
  // Miedo/Confusión, el otro Sangrado/Debilitado/Parálisis/Ceguera/
  // Ralentizado), Espíritu solo pasa a ser la fuente natural de ambos,
  // sumándose a lo que ya daba el equipo.
  const ESP_RESIST_RATE = 0.3;
  // Tope 60% (pedido explícito 2026-10-02): con Voluntad Inquebrantable como
  // equipo base de todos, en rango S se llegaba a ~96% y Miedo/Confusión
  // dejaban de existir. El tope también limita lo que Fortaleza mental le
  // pasa a Resistencia mágica más abajo.
  const fortalezaMentalPct = Math.min(FORTALEZA_MENTAL_CAP*100, equipModsSum(eq, 'fortaleza_mental') + esp*ESP_RESIST_RATE);
  // Fortaleza mental (Accesorio) ahora también aporta un poco a Resistencia
  // mágica (pedido explícito: "separarlas, pero que fortaleza mental
  // también aumente un poco resistencia mágica") — a una fracción de lo que
  // aporta Botas, para que Botas siga siendo la fuente principal.
  const FORTALEZA_MENTAL_TO_RES_MAGICA = 0.4;
  const resMagica = clamp(equipModsSum(eq, 'res_magica') + petModSum('res_magica') + fortalezaMentalPct*FORTALEZA_MENTAL_TO_RES_MAGICA, -60, 80);
  const fortalezaMental = clamp(fortalezaMentalPct/100, 0, FORTALEZA_MENTAL_CAP);
  const resistenciaEstado = clamp((equipModsSum(eq, 'resistencia_estado') + petModSum('resistencia_estado') + esp*ESP_RESIST_RATE)/100, 0, 0.9);
  // Precisión y Penetración: además de lo que dé el equipo, crecen solas
  // con el nivel (pedido explícito) — sin nada de equipo, un nivel 60 ya
  // trae ~9% de Precisión "de fábrica". Ahora Agilidad es su fuente
  // principal y Físico aporta una porción menor (secundaria) — pedido
  // explícito 2026-09-28.
  const PRECISION_PER_LEVEL = 0.0015, PENETRACION_PER_LEVEL = 0.001;
  const AGI_PRECISION_RATE = 0.0015, FIS_PRECISION_RATE = 0.0008;
  const precision = clamp(equipModsSum(eq, 'precision')/100 + state.char.level*PRECISION_PER_LEVEL + agi*AGI_PRECISION_RATE + fis*FIS_PRECISION_RATE, 0, 0.9);
  const penetracionNivel = state.char.level*PENETRACION_PER_LEVEL;
  const petCritProc = specialsFromPets().filter(sp=>sp.type==='prob_critico').reduce((s,sp)=>s+sp.value,0);
  // Crítico y Evasión ahora los rige Agilidad, no Habilidad (pedido
  // explícito 2026-09-28: "Agilidad se encargará de evasión, precisión y
  // probabilidad de crítico, separado de Habilidad"). Mismo ritmo para las
  // dos (0.35%/punto) ya que antes Habilidad repartía su presupuesto entre
  // ambas — ahora Agilidad reparte entre tres cosas (+Precisión), así que
  // cada una rinde menos por punto que cuando Habilidad solo alimentaba una.
  const AGI_CRIT_RATE = 0.0035, AGI_EVASION_RATE = 0.0035;
  const critChance = clamp(0.05 + agi*AGI_CRIT_RATE + (race().id==='bestia'?0.15:0) + petCritProc, 0, 0.6);
  const critDmgBonus = specialsFromPets().concat(stoneSpecials('critico_dano')).filter(sp=>sp.type==='critico_dano').reduce((s,sp)=>s+sp.value,0);
  // Esquivar: viene de Agilidad (ya no Habilidad), pero solo la parte
  // "natural" (raza + nivel) pesa completo — la que aporta EQUIPO pesa la
  // mitad (mismo freno que ya existía para Habilidad, ahora aplicado a
  // Agilidad: evita que itemizar a fondo un solo stat dispare la evasión).
  const agiNatural = race().stats.agi + Math.floor((state.char.level-1)*1);
  const agiGear = Math.max(0, agi - agiNatural);
  const EVASION_GEAR_AGI_WEIGHT = 0.5;
  let evasionBase = 0.04 + agiNatural*AGI_EVASION_RATE + agiGear*AGI_EVASION_RATE*EVASION_GEAR_AGI_WEIGHT + (race().id==='hada'?0.15:0);
  socketedStones().forEach(s=>{
    // itemSpecialsArr (no solo s.special) porque Sombra Cazadora A/S/SS ya
    // trae 2 specials a la vez (evasión + invocar sombra, ver
    // trySummonShadow) y usa el formato en array desde el 2026-09-25.
    itemSpecialsArr(s).forEach(sp=>{ if(sp.type==='evasion_flat') evasionBase += sp.value; });
  });
  specialsFromEquip(eq).forEach(sp=>{
    if(sp.type==='evasion_flat') evasionBase += sp.value;
  });
  // Vigor → reducción de daño recibido, física y mágica por igual (pedido
  // explícito 2026-09-28) — multiplicativa, como la que ya da el equipo
  // (Armadura/Maza/Espadón). Tope conservador (25%) porque esto YA se
  // multiplica con la vida extra que el mismo Vigor regala arriba: más HP y
  // menos daño por golpe juntos rinden más "vida efectiva" que la suma de
  // los dos por separado, así que su curva debe ser más suave que si Vigor
  // solo controlara una de las dos cosas.
  const reduccionVigor = clamp(vig * 0.002, 0, 0.25);
  return {fis,esp,hab,agi,vig,maxHP,maxSta,maxSpi,critChance,critDmgBonus,evasionBase,resMagica,fortalezaMental,resistenciaEstado,precision,penetracionNivel,reduccionVigor};
}

function scaleStatValue(){
  const d = derived();
  const sc = style().scaleStat;
  if(sc==='fis') return d.fis;
  if(sc==='esp') return d.esp;
  if(sc==='hab') return d.hab;
  return d.fis;
}

function baseDamageFromStat(statVal){
  return 8 + statVal*2.2 + state.char.level*1.5;
}
// Equilibrio de clases (2026-10-02): multiplicadores de vida y daño por
// clase en cada década (niveles 10, 20, 30, 40, 50 y 60, interpolados
// linealmente entre medio), calibrados con simulaciones contra los jefes de
// década (ver DECADE_BOSS_TUNING) para que todas las clases rindan parecido
// en cada tramo del laberinto.
const CLASS_CURVE_LEVELS = [1,10,20,30,40,50,60]; // nivel 1 = neutro (sin ajuste)
const CLASS_CURVE = {
  pesada:    {hp:[1.00,0.85,0.77,0.69,0.62,0.55,0.49], dmg:[1.00,0.92,0.88,0.83,0.79,0.74,0.70]},
  tirador:   {hp:[1.00,0.69,0.77,0.87,0.98,1.10,1.24], dmg:[1.00,0.83,0.88,0.93,0.99,1.05,1.11]},
  doblefilo: {hp:[1.00,1.06,1.02,0.99,0.96,0.93,0.90], dmg:[1.00,1.03,1.01,0.99,0.98,0.96,0.95]},
  mago:      {hp:[1.00,1.02,1.40,1.10,1.00,0.95,1.60], dmg:[1.00,1.01,1.25,1.03,0.97,0.93,1.14]}, // refuerzo vs Matriarca (20) y Storm Gush (60): sin resistencia física, caía ante paralisis/golpes en área
  paladin:   {hp:[1.00,1.19,1.10,1.02,0.95,0.88,0.81], dmg:[1.00,1.09,1.05,1.01,0.97,0.94,0.90]},
  hechicero: {hp:[1.00,0.55,0.60,0.67,0.76,0.85,0.95], dmg:[1.00,0.73,0.77,0.82,0.87,0.92,0.97]},
};
// Curva de la BETA (con BETA_ALLY_UNLOCKS): en las décadas 0-3 se juega con
// menos aliados (0-3), así que las clases frágiles necesitan otro ajuste;
// niveles 50 y 60 (4 aliados) quedan iguales que en CLASS_CURVE.
const CLASS_CURVE_BETA = {
  // Recalibrada 2026-10-04 con el simulador (pedido de ariochbu): Ogro sin
  // aliados y equipo raro/piedras C; Matriarca 1 aliado, Riakis 2 y Usurpador 3
  // con rango B/piedras B. Cada senda queda cerca del 65% contra su jefe.
  // El mago gana a Matriarca y Riakis casi siempre aunque se le baje la curva
  // (a distancia y con un tanque delante); no se le recortó más para no
  // hundirlo en los pisos normales.
  pesada:    {hp:[1.00,0.43,0.58,0.56,0.61,0.55,0.49], dmg:[1.00,0.59,0.76,0.74,0.61,0.74,0.70]},
  tirador:   {hp:[1.00,1.15,0.83,0.92,1.69,1.10,1.24], dmg:[1.00,1.06,0.91,0.96,1.30,1.05,1.11]},
  doblefilo: {hp:[1.00,1.22,1.27,1.57,1.34,0.93,0.90], dmg:[1.00,1.11,1.10,1.25,1.05,0.96,0.95]},
  mago:      {hp:[1.00,0.93,0.70,0.75,0.70,0.95,1.60], dmg:[1.00,0.97,0.85,0.85,0.81,0.93,1.14]},
  paladin:   {hp:[1.00,0.58,0.67,0.75,0.64,0.88,0.81], dmg:[1.00,0.76,0.82,0.86,0.79,0.94,0.90]},
  hechicero: {hp:[1.00,1.25,1.37,1.23,1.21,0.85,0.95], dmg:[1.00,1.10,1.16,0.85,1.11,0.92,0.97]},
};
function classCurve(kind){
  const c = (BETA_BALANCE ? CLASS_CURVE_BETA : CLASS_CURVE)[state.char.style];
  if(!c) return 1;
  const v = c[kind], L = CLASS_CURVE_LEVELS, lvl = state.char.level||1;
  if(lvl <= L[0]) return v[0];
  for(let i=1;i<L.length;i++){
    if(lvl <= L[i]) return v[i-1] + (v[i]-v[i-1]) * (lvl-L[i-1])/(L[i]-L[i-1]);
  }
  return v[v.length-1];
}
function skillBaseDamage(){
  return baseDamageFromStat(scaleStatValue()) * classCurve('dmg');
}

/* ============================================================
   PERSISTENCE — up to 3 independent save slots
   ============================================================ */
function migrateState(){
  // brings an older save shape up to date with the current fields
  if(!state || !state.char) return;
  if(!state.char.inventory) state.char.inventory = [];
  if(state.char.itemCounter===undefined) state.char.itemCounter = 0;
  if(state.char.maxLevelUnlocked===undefined){
    state.char.maxLevelUnlocked = Math.max(1, Math.min(LEVEL_CAP, (state.char.dungeonsCleared||0) + 1));
  }
  if(state.char.checkpointLevel===undefined) state.char.checkpointLevel = 1;
  if(!state.char.stash) state.char.stash = {gold:0, items:[]};
  if(!state.char.equip.hasOwnProperty('arma2')) state.char.equip.arma2 = null;
  ['casco','botas','guantes'].forEach(s=>{ if(!state.char.equip.hasOwnProperty(s)) state.char.equip[s] = null; });
  if(!state.char.soulSlots) state.char.soulSlots = [];
  if(!state.char.pets) state.char.pets = {owned:{}, equipped:[]};
  if(!state.char.checkin) state.char.checkin = {day:0, lastClaimDate:null};
  if(!state.char.record) state.char.record = {level: state.char.maxLevelUnlocked||1, floorIdx:0};
  if(state.dungeon && state.dungeon.level===undefined){
    state.dungeon.level = state.dungeon.tier || state.char.maxLevelUnlocked || 1;
  }
  // Bug real reportado 2026-09-27 ("el equipamiento inicial no se puede
  // vender", igual para el equipo automático de Sacerdote): equipItem/
  // equipItemOnAlly/grantAllyAutoGear empujaban el equipo REEMPLAZADO a la
  // mochila sin asegurarse de que tuviera uid (solo lo hacía al desequipar
  // a mano) — ya corregido en el origen (ver ensureItemUid), pero cualquier
  // objeto que ya haya quedado atascado así de antes necesita este arreglo
  // retroactivo, o se queda para siempre sin poder venderse ni guardarse.
  const backfilledUid = normalizeItemUids().changed;
  // Requisito de nivel para equipar (pedido explícito 2026-09-27, retroactivo):
  // ver stripUnmetLevelEquip/stripUnmetLevelStones más abajo.
  const strippedGear = stripUnmetLevelEquip(state.char.equip, state.char.level);
  const strippedStones = stripUnmetLevelStones(state.char.soulSlots, state.char.level);
  if(strippedGear || strippedStones || backfilledUid) save();
}

// El personaje vive en la tabla `characters` de Supabase (1 fila por cuenta).
// La Crónica (log) es solo sabor narrativo, no progreso: se queda en
// localStorage por dispositivo para no generar escrituras de red por cada línea.
// Clave por PERSONAJE (2026-10-02): antes era por cuenta y, con varios
// personajes por cuenta, la crónica de uno aparecía en la de otro.
function logStorageKey(charId){
  const id = charId || (state && state.char && state.char.id);
  return currentUser && id ? 'dns_log_'+currentUser.id+'_'+id : null;
}
function loadLocalLog(charId){
  const key = logStorageKey(charId);
  if(!key) return [];
  try{
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : [];
  }catch(e){ return []; }
}
function saveLocalLog(){
  const key = logStorageKey();
  if(!key || !state) return;
  try{ localStorage.setItem(key, JSON.stringify(state.log||[])); }catch(e){ /* best effort */ }
}

function characterToRow(){
  return {
    level: state.char.level,
    xp: state.char.xp,
    gold: state.char.gold,
    mission_currency: state.char.missionCurrency,
    cur_hp: state.char.curHP,
    cur_sta: state.char.curSta,
    cur_spi: state.char.curSpi,
    equip: state.char.equip,
    inventory: state.char.inventory,
    item_counter: state.char.itemCounter,
    max_level_unlocked: state.char.maxLevelUnlocked,
    checkpoint_level: state.char.checkpointLevel,
    record_level: state.char.record.level,
    record_floor_idx: state.char.record.floorIdx,
    stash: state.char.stash,
    soul_slots: state.char.soulSlots,
    pity_gear: state.char.pityGear,
    pity_stone: state.char.pityStone,
    pets: state.char.pets,
    checkin: state.char.checkin,
    dungeon: state.dungeon,
    ...(state.char.titleColumn ? {title_choice: state.char.titleChoice===undefined ? null : state.char.titleChoice} : {}),
    ...(state.char.bossesColumn ? {bosses_beaten: myBossesBeaten()} : {}),
    ...(state.char.bestiaryColumn ? {bestiary: state.char.bestiary || []} : {}),
    ...(state.char.recordTurnsColumn ? {record_turns: state.char.recordTurns || null, record_turns_level: state.char.recordTurnsLevel || null} : {}),
    ...(sessionEnforced ? {last_session: SESSION_ID} : {})
  };
}

// Las piedras de alma se guardan como una copia congelada de su plantilla
// en el momento en que caen (bonus/desc/special quedan escritos tal cual en
// el JSON del personaje) - así que un rebalanceo posterior a SOUL_STONES
// nunca llegaba a las piedras que un jugador ya tenía en la mochila o
// engarzadas, solo a las nuevas. refreshStoneFromTemplate() las "sana" cada
// vez que el personaje carga: vuelve a leer la plantilla actual por
// stoneId y reemplaza bonus/desc/special/nombre/ícono, conservando solo lo
// que es realmente de esa instancia (uid). Si la piedra queda socketeada o
// en la mochila, el próximo combate/guardado ya usa las estadísticas
// vigentes sin ninguna migración de base de datos.
function refreshStoneFromTemplate(stone){
  if(!stone || stone.kind!=='soulstone') return stone;
  const tpl = SOUL_STONES[stone.stoneId];
  if(!tpl) return stone; // plantilla renombrada/eliminada - se deja como está, defensivo
  const out = Object.assign({}, stone, {
    name: tpl.name, tier: tpl.tier, icon: tpl.icon, desc: tpl.desc,
    preview: tpl.preview, bonus: tpl.bonus, special: tpl.special, specials: tpl.specials
  });
  if(!tpl.special) delete out.special;
  if(!tpl.specials) delete out.specials;
  return out;
}
// Mismo criterio que refreshStoneFromTemplate, pero para equipo (armas y
// equipo general): un objeto ya dropeado quedó guardado como una copia
// congelada de bonus/mods/specials en el momento de caer, así que un
// rebalanceo posterior (como la subida de vida de Rango A del 2026-09-24)
// nunca llegaba a lo que un jugador ya tenía equipado o en la mochila.
// Se re-deriva del catálogo vigente por identidad (slot+styleId+rarity+
// nombre), preservando uid y cualquier campo propio de la instancia.
// Bug corregido 2026-10-02: las armas de la Tienda del Gremio se guardan con
// sufijo ("Martillo de guerra épico del Gremio", ver makeSelloShopItem) —
// ese nombre no existe en WEAPON_CATALOG, así que makeWeaponItem caía en
// pick() y el arma se convertía en OTRA arma al azar de la misma senda en la
// primera recarga (y perdía el sufijo). Ahora se busca por el nombre base y
// se le vuelve a poner el sufijo.
const GREMIO_WEAPON_SUFFIX = / (único|épico) del Gremio$/;
function refreshGearFromTemplate(item){
  // Conversión retroactiva (2026-10-02, todas las cuentas): cualquier pieza de
  // equipo general por senda (sin setId) pasa a ser la pieza de Voluntad
  // Inquebrantable del mismo slot y rango — "si era tier B, se reemplaza por
  // una tier B". Se conserva el uid; el equipo automático del Sacerdote
  // queda marcado (autoGear) para seguir exento del requisito de nivel.
  if(item && item.kind==='equip' && !item.setId && SET_SLOTS.includes(item.slot) && item.rarity){
    const conv = makeSetItem('voluntad', item.slot, item.rarity);
    if(conv){
      if(item.uid!==undefined) conv.uid = item.uid;
      if(item.styleId==='sacerdote' || item.autoGear) conv.autoGear = true;
      return conv;
    }
  }
  if(item && item.kind==='equip' && item.setId && item.rarity){
    const freshSet = makeSetItem(item.setId, item.slot, item.rarity);
    return freshSet ? Object.assign({}, item, {name:freshSet.name, mods:freshSet.mods, specials:freshSet.specials}) : item;
  }
  if(!item || item.kind!=='equip' || !item.styleId || !item.rarity) return item;
  const isWeapon = item.slot==='arma' || item.slot==='arma2';
  const suffixMatch = isWeapon && item.name ? item.name.match(GREMIO_WEAPON_SUFFIX) : null;
  const baseName = suffixMatch ? item.name.replace(GREMIO_WEAPON_SUFFIX, '') : item.name;
  const fresh = isWeapon
    ? makeWeaponItem(item.slot, item.styleId, item.rarity, baseName)
    : makeGearItem(item.slot, item.styleId, item.rarity);
  if(!fresh) return item; // esa combinación ya no existe en el catálogo - se deja como está, defensivo
  return Object.assign({}, item, {
    name: suffixMatch ? fresh.name + suffixMatch[0] : fresh.name, bonus: fresh.bonus, mods: fresh.mods, specials: fresh.specials
  });
}
function refreshEquipObject(equip){
  const out = Object.assign({}, equip);
  EQUIP_SLOTS.forEach(slot=>{ if(out[slot]) out[slot] = refreshGearFromTemplate(out[slot]); });
  return out;
}

function rowToState(row){
  return {
    char:{
      id: row.id, slotNumber: row.slot_number, nickname: row.nickname,
      role: row.role, hiddenFromLeaderboard: row.hidden_from_leaderboard,
      titleChoice: row.title_choice===undefined ? null : row.title_choice, titleColumn: row.title_choice !== undefined,
      bossesBeaten: row.bosses_beaten || 0, bossesColumn: row.bosses_beaten !== undefined, firstRetornado: !!row.first_retornado,
      race: row.race, style: row.style,
      level: row.level, xp: row.xp, gold: row.gold, missionCurrency: row.mission_currency || 0,
      missionRerollCycle: row.mission_reroll_cycle || null, missionRerollCount: row.mission_reroll_count || 0,
      curHP: row.cur_hp, curSta: row.cur_sta, curSpi: row.cur_spi,
      equip: refreshEquipObject(row.equip || {arma:null, arma2:null, armadura:null, amuleto:null, casco:null, botas:null, guantes:null}),
      inventory: (row.inventory || []).map(i=> i.kind==='soulstone' ? refreshStoneFromTemplate(i) : refreshGearFromTemplate(i)),
      itemCounter: row.item_counter || 0,
      maxLevelUnlocked: row.max_level_unlocked || 1,
      checkpointLevel: row.checkpoint_level || 1,
      record: {level: row.record_level || 1, floorIdx: row.record_floor_idx || 0},
      stash: (()=>{ const st = row.stash || {gold:0, items:[]}; return Object.assign({}, st, {items:(st.items||[]).map(i=> i.kind==='soulstone' ? refreshStoneFromTemplate(i) : refreshGearFromTemplate(i))}); })(),
      soulSlots: (row.soul_slots || []).map(refreshStoneFromTemplate),
      pityGear: row.pity_gear || 0,
      pityStone: row.pity_stone || 0,
      pets: row.pets || {owned:{}, equipped:[]},
      checkin: row.checkin || {day:0, lastClaimDate:null},
      bestiary: row.bestiary !== undefined ? (row.bestiary || []) : loadLocalBestiary(row.id), bestiaryColumn: row.bestiary !== undefined,
      recordTurns: row.record_turns || null, recordTurnsLevel: row.record_turns_level || null, recordTurnsColumn: row.record_turns !== undefined
    },
    dungeon: row.dungeon || null,
    log: loadLocalLog(row.id)
  };
}

let saveTimer = null;
let pendingSave = false;
const SAVE_DEBOUNCE_MS = 1500;

// 2026-10-02: reportes de "problemas de guardado" — antes un fallo solo
// quedaba en la consola y el jugador no se enteraba. Ahora se reintenta una
// vez y, si vuelve a fallar, se avisa en pantalla con el motivo exacto del
// servidor (sirve para saber QUÉ regla lo rechaza).
// ============================================================
// SESIÓN ÚNICA POR CUENTA (pedido explícito 2026-10-02, ver migración
// 0028_single_active_session.sql). Cada pestaña genera su propio id al
// abrir y lo reclama al entrar; la última en reclamar es la activa. Una
// pestaña reemplazada (otra pestaña, otro navegador, otro dispositivo) se
// bloquea: deja de guardar y pide recargar. Si la migración todavía no se
// corrió (claim_session no existe), todo sigue como antes.
// ============================================================
const SESSION_ID = (crypto && crypto.randomUUID) ? crypto.randomUUID()
  : 'xxxxxxxx-xxxx-4xxx-8xxx-xxxxxxxxxxxx'.replace(/x/g, ()=>Math.floor(Math.random()*16).toString(16));
let sessionEnforced = false;
let sessionKicked = false;
async function claimSession(){
  const { error } = await supabase.rpc('claim_session', {p_session: SESSION_ID});
  sessionEnforced = !error;
  if(error) console.warn('Sesión única no disponible todavía (¿falta la migración 0028?):', error.message);
}
// true si esta pestaña sigue siendo la sesión activa (o si no hay control).
async function checkSessionStillActive(){
  if(!sessionEnforced || sessionKicked || !currentUser) return !sessionKicked;
  const { data, error } = await supabase.from('active_sessions').select('session_id').eq('user_id', currentUser.id).maybeSingle();
  if(error || !data) return true; // ante la duda (red caída), no cerrar
  if(data.session_id !== SESSION_ID){ kickSession(); return false; }
  return true;
}
function kickSession(){
  if(sessionKicked) return;
  sessionKicked = true;
  pendingSave = false;
  if(saveTimer) clearTimeout(saveTimer);
  combat = null;
  const div = document.createElement('div');
  div.className = 'overlay-msg';
  div.style.zIndex = '99999';
  div.innerHTML = `<div class="overlay-card"><h2>Sesión cerrada</h2><p>Tu cuenta se abrió en otro navegador, dispositivo o pestaña. Solo puede haber una sesión activa a la vez, así que esta se cerró para no perder ni pisar tu progreso.</p><button class="btn-main" id="btn-session-retake">Jugar aquí (cierra la otra sesión)</button></div>`;
  document.body.appendChild(div);
  div.querySelector('#btn-session-retake').onclick = ()=> location.reload();
}
setInterval(()=>{ if(state) checkSessionStillActive(); }, 15000);

// Ofrendas regaladas por el admin (0029): llegan a characters.gift_pulls, una
// columna que este cliente nunca escribe al guardar — así no se pisan si el
// jugador estaba conectado. Se cobran al entrar y cada minuto.
// Bug reportado 2026-10-03 ("cuando se regala ofrenda y vas para invocar, no te
// salen si no actualizas"): solo se cobraban al entrar y cada minuto, así que
// al abrir el árbol justo después del regalo todavía no aparecían. Ahora
// también se cobran al abrir la pantalla de Ofrenda y al volver a la pestaña.
// Con la Ofrenda abierta solo se refresca el grupo de gratis (un renderAll
// borraría las cartas que se estén revelando).
let lastGiftClaimAt = 0;
let ofrendaRefreshFree = null; // lo define renderOfrenda mientras está abierta
async function claimGiftPulls(){
  if(!state || !state.char || !currentUser || sessionKicked) return;
  lastGiftClaimAt = Date.now();
  const { data, error } = await supabase.rpc('claim_gift_pulls', { p_char: state.char.id });
  if(error || !data || data<=0) return; // sin la función (SQL no corrido) o sin regalos
  if(!state.char.pets) state.char.pets = {owned:{}, equipped:[], pendingFreePulls:0};
  state.char.pets.pendingFreePulls = (state.char.pets.pendingFreePulls||0) + data;
  log(`🎁 Recibiste <b>${data}</b> ofrenda(s) gratis de regalo. Reclámalas frente al árbol (total pendiente: ${state.char.pets.pendingFreePulls}).`);
  await flushSave();
  if(ofrendaOpen && ofrendaRefreshFree && document.getElementById('of-free')){ ofrendaRefreshFree(); renderLog(); }
  else renderAll();
}
setInterval(()=>{ if(state) claimGiftPulls(); }, 60000);
document.addEventListener('visibilitychange', ()=>{ if(document.visibilityState==='visible' && state && Date.now()-lastGiftClaimAt > 5000) claimGiftPulls(); });

// ============================================================
// AVISO DE ACTUALIZACIÓN (pedido explícito 2026-10-02). Cada deploy sube el
// ?v= de game.js en index.html; esta pestaña compara el suyo con el del
// index.html publicado cada 3 minutos (y al volver a la pestaña). Si hay uno
// nuevo: guarda y muestra un aviso que obliga a recargar — pero nunca en
// medio de un combate: espera a que termine.
// ============================================================
const LOADED_VERSION = (()=>{ const m = import.meta.url.match(/[?&]v=(\d+)/); return m ? parseInt(m[1],10) : 0; })();
let updatePending = false, updateShown = false, updateChecking = false, updateVersion = 0;
async function checkForUpdate(){
  if(updateShown || updateChecking || !LOADED_VERSION) return;
  updateChecking = true;
  try{ await checkForUpdateInner(); } finally { updateChecking = false; }
}
async function checkForUpdateInner(){
  if(!updatePending){
    try{
      const html = await (await fetch('index.html?_=' + Date.now(), {cache:'no-store'})).text();
      const m = html.match(/game\.js\?v=(\d+)/);
      if(m && parseInt(m[1],10) > LOADED_VERSION){ updatePending = true; updateVersion = parseInt(m[1],10); }
    }catch(e){ return; }
  }
  if(!updatePending || (combat && !combat.over)) return; // en combate: esperar
  if(pendingSave) await flushSave();
  // Bug real reportado 2026-10-04: el aviso salía en pleno combate. El
  // guardado de arriba puede tardar varios segundos (más en datos móviles) y
  // en ese lapso el jugador ya entró al siguiente combate desde el mapa. Se
  // vuelve a comprobar DESPUÉS de guardar; si hay combate, se reintenta luego.
  if(combat && !combat.over) return;
  updateShown = true;
  const div = document.createElement('div');
  div.className = 'overlay-msg';
  div.style.zIndex = '99998';
  div.innerHTML = `<div class="overlay-card"><h2>¡Actualización disponible!</h2><p>Hay una nueva versión de Dungeon &amp; Stone. Tu progreso ya está guardado — recarga para seguir jugando con la versión nueva.</p><button class="btn-main" id="btn-update-reload">Recargar ahora</button></div>`;
  document.body.appendChild(div);
  // Bug real reportado 2026-10-04: location.reload() podía volver a servir el
  // index.html viejo desde la caché del navegador (sobre todo en el celular) y
  // había que recargar una segunda vez. Ahora se refresca la copia en caché y
  // se entra por una dirección nueva (?u=versión), que nunca está en caché.
  div.querySelector('#btn-update-reload').onclick = async (e)=>{
    e.target.disabled = true; e.target.textContent = 'Recargando…';
    try{ await fetch(location.pathname, {cache:'reload'}); }catch(err){ /* igual se recarga */ }
    location.replace(location.pathname + '?u=' + (updateVersion || Date.now()));
  };
}
setInterval(()=>{ checkForUpdate(); }, 180000);
// Mientras haya una actualización esperando a que termine un combate, se
// revisa seguido para mostrar el aviso apenas se pueda.
setInterval(()=>{ if(updatePending && !updateShown) checkForUpdate(); }, 5000);
document.addEventListener('visibilitychange', ()=>{ if(document.visibilityState==='visible') checkForUpdate(); });
window.addEventListener('focus', ()=>{ if(state) checkSessionStillActive(); });

let lastSaveErrorShown = 0;
// Aviso fijo cuando el guardado falla varias veces seguidas (2026-10-04). Los
// fallos sueltos siguen sin mostrarse (decisión de ariochbu), pero un fallo
// PERSISTENTE significa que todo lo que se juegue se va a perder al recargar:
// pasó de verdad (12 niveles perdidos) porque el jugador nunca se enteró.
let saveFailStreak = 0;
function showSaveFailureBanner(error){
  saveFailStreak = error ? saveFailStreak + 1 : 0;
  let el = document.getElementById('save-fail-banner');
  if(saveFailStreak < 3){ if(el) el.remove(); return; }
  if(!el){
    el = document.createElement('div');
    el.id = 'save-fail-banner';
    el.style.cssText = 'position:fixed; left:0; right:0; top:0; z-index:99997; background:#7a1c1c; color:#fff; padding:8px 12px; font-size:0.9em; text-align:center; border-bottom:2px solid #e0393f;';
    document.body.appendChild(el);
  }
  el.textContent = `⚠ Tu progreso NO se está guardando (${error.message}). No recargues ni sigas avanzando: avisa al administrador.`;
}
// Causa real del "perdí la ofrenda al recargar" (2026-10-02, visto en los
// logs de Postgres: "checkpoint_level no puede bajar" en ráfaga): si el mismo
// personaje avanza en OTRA pestaña/dispositivo, esta sesión queda con un
// checkpoint/récord/nivel más viejo que el de la base, y el trigger anti-
// trampa rechaza TODOS sus guardados desde ahí — la ofrenda (y todo lo
// demás) solo existía en memoria y se perdía al recargar. Ahora, ante esos
// rechazos de "no puede bajar/retroceder", se leen los valores de progreso
// de la base, se toma el MAYOR de cada uno y se reintenta: se conserva lo de
// esta sesión (oro, objetos, Caídos) sin pisar el progreso de la otra.
const STALE_SESSION_ERR = /no puede bajar|no puede retroceder|no puede superar max_level_unlocked/;
async function mergeServerProgress(){
  const { data, error } = await supabase.from('characters')
    .select('level, xp, checkpoint_level, max_level_unlocked, record_level, record_floor_idx')
    .eq('id', state.char.id).single();
  if(error || !data) return false;
  const c = state.char;
  if((data.level||1) > c.level){ c.level = data.level; c.xp = data.xp||0; }
  c.checkpointLevel = Math.max(c.checkpointLevel||1, data.checkpoint_level||1);
  c.maxLevelUnlocked = Math.max(c.maxLevelUnlocked||1, data.max_level_unlocked||1);
  const sv = {level: data.record_level||1, floorIdx: data.record_floor_idx||0};
  if(!c.record || sv.level > c.record.level || (sv.level===c.record.level && sv.floorIdx > c.record.floorIdx)) c.record = sv;
  c.maxLevelUnlocked = Math.max(c.maxLevelUnlocked, c.record.level);
  return true;
}
// Devuelve true solo si la partida quedó guardada en la base.
async function flushSave(){
  if(simMode) return false;
  if(!state || !currentUser || sessionKicked) return false;
  pendingSave = false;
  let { error } = await supabase.from('characters').update(characterToRow()).eq('id', state.char.id);
  if(error && (error.message||'').includes('SESION_REEMPLAZADA')){ kickSession(); return false; }
  if(error && STALE_SESSION_ERR.test(error.message||'') && await mergeServerProgress()){
    ({ error } = await supabase.from('characters').update(characterToRow()).eq('id', state.char.id));
    if(!error) log('Se detectó progreso guardado desde otra pestaña o dispositivo con este personaje: se combinó con esta sesión. Evita jugar el mismo personaje en dos lugares a la vez.');
  }
  // Mochila por encima del tope (sesiones que ya venían pasadas, o caminos que
  // no usan addToInventory): se vende lo de menor valor hasta que quepa.
  if(error && /inventory inválido/.test(error.message||'') && Array.isArray(state.char.inventory) && state.char.inventory.length > INVENTORY_CAP_OLD){
    if(state.char.inventory.length <= INVENTORY_CAP) INVENTORY_CAP = INVENTORY_CAP_OLD; // la base sigue con el tope viejo
    let sold = 0, gold = 0;
    while(state.char.inventory.length > INVENTORY_CAP){
      const worst = leastValuableInInventory();
      if(!worst) break;
      state.char.inventory = state.char.inventory.filter(i=> i!==worst);
      const v = itemSellValue(worst); state.char.gold += v; gold += v; sold++;
    }
    if(sold) log(`La mochila pasaba de ${INVENTORY_CAP} objetos y la partida no se podía guardar: se vendieron solos los ${sold} de menor valor por ${gold} de oro.`);
    ({ error } = await supabase.from('characters').update(characterToRow()).eq('id', state.char.id));
  }
  // Tras una racha de guardados fallidos, el personaje puede llevar más de 5
  // niveles de ventaja sobre la base y el trigger rechaza el salto para
  // siempre ("salto de nivel implausible"). Se sube el nivel por tramos.
  if(error && /salto de nivel implausible/.test(error.message||'')){
    const { data } = await supabase.from('characters').select('level').eq('id', state.char.id).single();
    let lvl = data ? data.level : null;
    while(lvl && state.char.level - lvl > 5){
      lvl += 5;
      const step = await supabase.from('characters').update({level: lvl, ...(sessionEnforced ? {last_session: SESSION_ID} : {})}).eq('id', state.char.id);
      if(step.error) break;
    }
    ({ error } = await supabase.from('characters').update(characterToRow()).eq('id', state.char.id));
  }
  if(error){
    await new Promise(r=>setTimeout(r, 1200));
    ({ error } = await supabase.from('characters').update(characterToRow()).eq('id', state.char.id));
  }
  showSaveFailureBanner(error);
  if(error){
    console.error('No se pudo guardar la partida:', error.message);
    if(Date.now() - lastSaveErrorShown > 15000){
      lastSaveErrorShown = Date.now();
      log(`<b style="color:var(--blood-light)">⚠ No se pudo guardar la partida</b> (${error.message}). Tu progreso de ahora podría perderse si recargas — avisa al administrador con este mensaje.`);
    }
  }
  return !error;
}

async function save(){
  if(simMode) return;
  saveLocalLog();
  if(!state || !currentUser || sessionKicked) return;
  pendingSave = true;
  if(saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(()=>{ if(pendingSave) flushSave(); }, SAVE_DEBOUNCE_MS);
}

// intenta no perder el último tramo de progreso si se cierra/oculta la pestaña
window.addEventListener('visibilitychange', ()=>{ if(document.visibilityState==='hidden' && pendingSave) flushSave(); });
window.addEventListener('beforeunload', ()=>{ if(pendingSave) flushSave(); });

async function loadCharacterRows(){
  const { data, error } = await supabase.from('characters').select('*').eq('user_id', currentUser.id).order('slot_number');
  if(error){ console.error('No se pudieron cargar los personajes:', error.message); return []; }
  return data || [];
}

async function createCharacterOnServer(raceId, styleId, nickname){
  const { data, error } = await supabase.rpc('create_character', {p_race: raceId, p_style: styleId, p_nickname: nickname});
  if(error) throw error;
  return data;
}

async function characterNicknameAvailable(nickname){
  const { data, error } = await supabase.rpc('character_nickname_available', {p_nickname: nickname});
  if(error) throw error;
  return !!data;
}

async function deleteCharacterById(characterId){
  const { error } = await supabase.from('characters').delete().eq('id', characterId);
  if(error) console.error('No se pudo borrar el personaje:', error.message);
}

async function fetchProfile(userId){
  const { data, error } = await supabase.from('profiles').select('id, username, username_set, is_banned, created_at').eq('id', userId).maybeSingle();
  if(error){ console.error('No se pudo cargar el perfil:', error.message); return null; }
  return data;
}

/* ============================================================
   DUNGEON LEVELS (1-60)
   ============================================================ */
const LEVEL_CAP = 80;      // 2026-10-08: La Grieta (61-70) y Bosque muerto (71-80). Requiere la migración 0039.
const CHAR_LEVEL_CAP = 80; // tope de nivel de personaje pedido
function mobXP(level){ return level; }        // mobs normales: 1 en piso 1, 2 en piso 2...
// 2026-09-25, pedido explícito: recalibrados para que el élite y el
// guardián/jefe de década den más en piso 1 (7 y 12 respectivamente, antes
// 2 y 4) — el aumento del 50% general (ver XP_GLOBAL_BOOST más abajo) se
// calcula sobre estos nuevos valores, no sobre los viejos.
function eliteXP(level){ return level+6; }    // élites: antes mob+1, ahora mob+6 (piso 1 = 7)
function guardianXP(level){ return 2*level+10; } // guardianes/jefes de década: antes 2×mob+2, ahora 2×mob+10 (piso 1 = 12)
// Nerf de XP en batallas grupales (2026-09-26, pedido explícito, urgente):
// desde el piso 40 los combates traen 5-6 enemigos a la vez (ver enterNode),
// y el multiplicador de xp por combate ANTES multiplicaba por
// combat.enemies.length de forma lineal — un grupo de 5-6 pagaba 5-6 veces
// el xp de un solo enemigo, encima del +50% global (XP_GLOBAL_BOOST) y la
// recalibración de mobXP/eliteXP/guardianXP de ayer. El resultado real eran
// combates de más de 400 xp en pisos 41-60, suficiente para llegar a nivel
// 60 en muy pocas entradas al laberinto. Grupos de 1-4 (pisos 1-39) NO
// cambian — ahí nunca hubo el problema y el ritmo ya estaba calibrado
// (incluye el +60% de earlyXpBoost en pisos 1-10). Solo grupos de 5+ (pisos
// 40+) dejan de multiplicar 1:1 y quedan en un tope fijo de 2.8, para que
// una batalla grupal de pisos 41-60 ronde 200-220 xp en vez de 400+.
function xpGroupMultiplier(enemyCount){
  return enemyCount <= 4 ? enemyCount : 2.8;
}
// +50% de experiencia en TODO el juego (mobs, élites, guardianes, jefes de
// década por igual) — pedido explícito 2026-09-25, se multiplica en
// handleVictory() junto con el resto de bonos (raza, brecha, early boost).
const XP_GLOBAL_BOOST = 1.5;
// La Década 0 (pisos 1-10) se sentía muy lenta para llegar a nivel de
// personaje 10 con un personaje nuevo (pedido explícito) — el mob/elite/
// guardián de esos pisos da poquísima xp porque la fórmula recién despega en
// niveles más profundos. +60% de xp solo en esos primeros 10 pisos.
function earlyXpBoost(level){ return level<=10 ? 1.6 : 1; }
// Como siempre se entra al laberinto desde el nivel 1, sin este freno
// convenía retirarse tras cada limpieza fácil y volver a entrar para
// farmear el mismo nivel trivial una y otra vez - subía de personaje mucho
// más rápido de lo que el laberinto en el que realmente estás parado
// justifica. maxLevelUnlocked() es la frontera más profunda que ya
// desbloqueaste; cuanto más atrás del nivel que estás peleando quede esa
// frontera, menos experiencia vale (tuya y de tus aliados) - empuja a seguir
// avanzando en vez dequedarte reciclando el piso 1 para siempre.
function xpGapMultiplier(){
  if(!state.dungeon) return 1;
  const gap = Math.max(0, maxLevelUnlocked() - state.dungeon.level);
  return Math.max(0.1, 1 - gap*0.15);
}
function xpNeededForLevel(level){
  // Se duplica tal cual pediste (5,10,20,40,80,160,320) hasta el nivel 7→8.
  // A partir de ahí, duplicar cada nivel hasta el 60 pedía cantidades imposibles de
  // conseguir (nivel 20→21 exigiría más de 2 millones de exp, con guardianes que dan
  // como máximo 22 por combate), así que después del corte crece de forma más suave
  // y constante en vez de seguir duplicando.
  if(level >= CHAR_LEVEL_CAP) return Infinity;
  const DOUBLE_UNTIL = 7;
  if(level <= DOUBLE_UNTIL) return Math.round(5 * Math.pow(2, level-1));
  const cutoffValue = 5 * Math.pow(2, DOUBLE_UNTIL-1); // 320, el valor justo en el corte
  return Math.round(cutoffValue * (1 + (level-DOUBLE_UNTIL)*0.15));
}
const BASE_FLOORS = 5; // floors on level 1, last floor = guardian
const MAX_FLOORS = 9; // cap so high levels don't become endless

function maxLevelUnlocked(){ return state.char.maxLevelUnlocked || 1; }

function updateRecord(level, floorIdx){
  if(!state.char.record) state.char.record = {level:1, floorIdx:0};
  const r = state.char.record;
  if(level > r.level || (level===r.level && floorIdx > r.floorIdx)){
    state.char.record = {level, floorIdx};
  }
}
function describeRecord(){
  const r = state.char.record || {level:1, floorIdx:0};
  const total = numFloorsForLevel(r.level);
  if(r.floorIdx <= 0) return `Nivel ${r.level} · Entrada`;
  if(r.floorIdx >= total-1) return `Nivel ${r.level} · Guardián`;
  return `Nivel ${r.level} · Piso ${r.floorIdx}`;
}
// Selector de checkpoint (pedido explícito, 2026-09-18, al estilo del
// elevador de las minas de Stardew Valley): como los checkpoints solo se
// liberan al cerrar una década (ver checkpointLevel en handleVictory) y el
// laberinto no se puede saltear de década, cada década por debajo de
// checkpointLevel quedó necesariamente superada también — no hace falta
// guardar la lista entera, alcanza con reconstruirla desde ese único número.
// Tope defensivo en LEVEL_CAP (2026-09-26, bug real reportado: un personaje
// derrotó a Storm Gush -piso 60, el jefe de la última década implementada-
// y quedó con un botón de checkpoint "61" que no lleva a ningún lado real
// (no hay bestiario para esa década todavía) — se quedaba en un bucle ahí.
// handleVictory() ya no debería escribir un checkpointLevel por encima del
// tope, pero esto protege también a cualquier cuenta que ya haya quedado
// con ese valor guardado de antes del fix.
function checkpointLevelsUnlocked(){
  const levels = [];
  const cap = Math.min(LEVEL_CAP, state.char.checkpointLevel||1);
  for(let lvl=1; lvl<=cap; lvl+=10) levels.push(lvl);
  return levels;
}

// real (mechanical) difficulty multiplier: compounds ~14% per level, as requested
// La curva original (1.14 compuesto) se pensó para 10 pisos; compuesta hasta
// el piso 60 daría un multiplicador de más de 2000x, una pared numérica
// imposible. Se preserva tal cual para los pisos 1-10 (ya jugado y afinado) y
// desde el 11 en adelante crece de forma mucho más suave — primer valor
// razonado, a ajustar con partidas reales igual que el resto de esta curva.
function levelMult(level){
  const base = Math.pow(1.14, Math.max(0, Math.min(level,10)-1));
  if(level<=10) return base;
  return base * (1 + (level-10)*0.06);
}

// Curvas de VIDA (2026-09-16, pedido explícito) para mob regular y élite —
// separadas de levelMult (que sigue igual, y sigue alimentando el ataque de
// todos y el HP de guardianes/jefes de década, sin cambios). Mismo molde que
// levelMult (compuesto hasta nivel 10, lineal después), pero con su propia
// tasa para que la vida de estos dos golpee los objetivos pedidos:
//   Regular (base 55-65): ~500-600 en nivel 20, ~1200-1300 en nivel 40,
//   ~1700-1800 en nivel 60 (no hay una tasa que caiga exacta en las 3 a la
//   vez — R=1.16/S=0.14 da 502-593 / 1088-1285 / 1673-1978, la más cercana).
//   Élite (base sube de 100-110 a 125-135): incremento de nivel 1 a 2 pasa
//   de ~14-15 a ~20-25, y nivel 20/40/60 caen EXACTOS en 1000/2000/3000.
function regularHPMult(level){
  const R = 1.16, S = 0.14;
  const base = Math.pow(R, Math.max(0, Math.min(level,10)-1));
  if(level<=10) return base;
  return base * (1 + (level-10)*S);
}
function eliteHPMult(level){
  const R = Math.pow(50/13, 1/9), S = 0.1; // R^9 = 50/13 exacto -> nivel 20/40/60 = 1000/2000/3000
  const base = Math.pow(R, Math.max(0, Math.min(level,10)-1));
  if(level<=10) return base;
  return base * (1 + (level-10)*S);
}
// Ataque de mob regular/élite (pedido explícito, 2026-09-18: "urgente" —
// piso 41 en adelante era imposible de avanzar, el equipo entero caía desde
// el primer combate). Misma curva que levelMult del nivel 1 al 10 (esa parte
// nunca se reportó como problema), pero la pendiente lineal de ahí en
// adelante baja de 0.06 a 0.025 — el mismo golpe individual que a nivel 41
// pegaba ~22% de la vida de un Asesino ahora pega ~14%, así 5-6 mobs
// regulares (el tamaño de grupo desde el piso 40, sin tocar) enfocando al
// mismo objetivo ya no lo matan de un round. La resistencia y el HP de los
// enemigos, y el ataque de los jefes, quedan exactamente igual — se pidió
// bajar solo esto.
function monsterAtkMult(level){
  const base = Math.pow(1.14, Math.max(0, Math.min(level,10)-1));
  if(level<=10) return base;
  return base * (1 + (level-10)*0.025);
}

// Incremento de dificultad por piso dentro de un mismo nivel. Se repite cada
// decena para cuando el laberinto crezca a 100 niveles: los que terminan en
// 1-5 (1,2,3,4,5,11,12,13,14,15,21...) suben +0.05 por piso, los que terminan
// en 6-10 (6,7,8,9,10,16,17,18,19,20,26...) suben +0.08. El nivel 1 exacto
// cae en la banda 1-5, así que ya queda con la curva suave sin necesitar un
// caso aparte — sigue siendo la introducción al juego.
function floorDifficultyStep(level){
  const band = level % 10 === 0 ? 10 : level % 10;
  return band <= 5 ? 0.05 : 0.08;
}

// misma lógica de banda por décadas que floorDifficultyStep: los niveles que
// terminan en 1-4 (1,2,3,4,11,12...) tienen 3 sendas, los que terminan en
// 5-10 (5,6,7,8,9,10,15,16...) tienen 5. Cada piso intermedio del laberinto
// genera exactamente ese número de nodos, uno por senda, y solo se puede
// avanzar a la senda igual o adyacente (arriba/medio/abajo según corresponda).
function laneCountForLevel(level){
  const band = level % 10 === 0 ? 10 : level % 10;
  return band <= 4 ? 3 : 5;
}

function numFloorsForLevel(level){
  return Math.min(MAX_FLOORS, BASE_FLOORS + Math.floor((level-1)/2)); // +1 floor every 2 levels
}

// visual-only threat rating shown to the player, decoupled from the real stat math above
function baseThreatForLevel(level){ return 5 + (level-1)*2; } // lvl1:5, lvl2:7, lvl3:9...
function expectedCharLevelFor(level){ return Math.round(level * (CHAR_LEVEL_CAP/LEVEL_CAP)); } // the char level this dungeon level is "built for"

// ============================================================
// BRECHA DE NIVEL (2026-09-16, pedido explícito, estilo MIR4) — curva
// "moderada" confirmada: ~1.5% de esquivar y ~0.8% de daño por cada nivel
// de diferencia, con piso/techo para que nunca sea 0%/100% garantizado ni
// un multiplicador absurdo. monsterEffectiveLevel() reusa
// expectedCharLevelFor() (ya existía para el indicador visual de amenaza)
// como "nivel" del monstruo — el nivel de personaje para el que esa
// entrada al laberinto está pensada.
const LEVEL_GAP_EVASION_PER_LEVEL = 0.015;
const LEVEL_GAP_DAMAGE_PER_LEVEL = 0.008;
function monsterEffectiveLevel(){ return expectedCharLevelFor((state.dungeon && state.dungeon.level) || 1); }
// Cuánta evasión EXTRA gana el enemigo (o pierde, si es negativo) frente al
// jugador por la diferencia de nivel — se resta cuando le toca esquivar AL
// JUGADOR (mismo número, signo invertido: un monstruo de más nivel también
// hace que el jugador esquive menos sus golpes).
function levelGapEvasionBonus(monsterLevel, charLevel){
  return (monsterLevel - charLevel) * LEVEL_GAP_EVASION_PER_LEVEL;
}
// Multiplicador de daño por diferencia de nivel — mismo signo para ambas
// direcciones: le pega más fuerte a quien esté por debajo suyo, más flojo
// a quien esté por encima. attackerLevel/defenderLevel son "nivel de
// personaje" o "nivel de monstruo" (monsterEffectiveLevel()) según quién
// ataca a quién.
function levelDiffDamageMult(attackerLevel, defenderLevel){
  return clamp(1 + (attackerLevel - defenderLevel) * LEVEL_GAP_DAMAGE_PER_LEVEL, 0.7, 1.25);
}
function visualThreat(level, charLevel){
  const base = baseThreatForLevel(level);
  const ratio = expectedCharLevelFor(level) / Math.max(1, charLevel||1);
  // if you're heavily overleveled the shown threat drops a lot; underleveled, it climbs
  return Math.max(1, Math.round(base * clamp(ratio, 0.35, 1.4)));
}

// Isla Paraíso (década 4, pisos 41-50): supervivencia pura — sin cofres ni
// descansos, más élites que combates normales, y la travesía es 3 pisos más
// larga que lo que le tocaría por fórmula normal.
function isParaisoDecade(level){ return decadeIndexForLevel(level)===4; }

function generateDungeon(level){
  const numFloors = numFloorsForLevel(level) + (isParaisoDecade(level) ? 3 : 0);
  const laneCount = laneCountForLevel(level);
  const paraiso = isParaisoDecade(level);
  const floors = [];
  for(let f=0; f<numFloors; f++){
    if(f === numFloors-1){
      floors.push([{type:'jefe', done:false}]);
      continue;
    }
    if(f === 0){
      floors.push([{type:'entrada', done:false}]);
      continue;
    }
    const nodes = [];
    for(let lane=0; lane<laneCount; lane++){
      let type;
      if(paraiso){
        type = chance(0.55) ? 'elite' : 'combate'; // sin cofres ni descansos, más élites que mobs normales
      } else {
        const roll = Math.random();
        if(roll < 0.48) type='combate';
        else if(roll < 0.68) type='tesoro';
        else if(roll < 0.85) type='descanso';
        else type='elite';
      }
      nodes.push({type, done:false});
    }
    floors.push(nodes);
  }
  return {floors, atFloor:0, atNode:0, visited:{'0-0':true}, level};
}

function nodeIcon(type){
  return {entrada:'🚪', combate:'⚔️', tesoro:'💰', descanso:'🔥', elite:'☠️', jefe:'🛡️'}[type] || '?';
}
function nodeLabel(type){
  return {entrada:'Entrada', combate:'Combate', tesoro:'Tesoro', descanso:'Descanso', elite:'Élite', jefe:'Jefe del laberinto'}[type] || type;
}

/* ============================================================
   RENDER: SHELL
   ============================================================ */
function showScreen(id){
  document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

function renderAll(){
  if(simMode) return;
  // Ver el comentario en wirePetZoomEvents: cualquier navegación real
  // (renderAll es el punto común de todas — combate por turno usa
  // renderCombat() directo y no pasa por acá, así que esto no interfiere
  // con tener el mouse quieto sobre un Caído mientras el combate sigue)
  // invalida cualquier zoom de Caído que hubiera quedado abierto.
  hidePetZoom();
  ensureSoulSlots();
  document.getElementById('clock-badge').style.display = 'flex';
  updateClockBadge();
  const musicBtn = document.getElementById('btn-music-toggle');
  musicBtn.style.display = 'inline-block';
  musicBtn.textContent = getLoginAudioMuted() ? '🔇 Música' : '🔊 Música';
  const optionsBtn = document.getElementById('btn-options');
  optionsBtn.style.display = 'inline-block';
  optionsBtn.classList.toggle('active', optionsOpen);
  optionsBtn.disabled = !!(combat && combat.active);
  document.getElementById('gold-badge').style.display = 'flex';
  document.getElementById('gold-amount').textContent = state.char.gold;
  const tierBadge = document.getElementById('tier-badge');
  if(state.dungeon){
    tierBadge.style.display = 'flex';
    document.getElementById('tier-amount').textContent = `Nivel ${state.dungeon.level} · ⚠ ${visualThreat(state.dungeon.level, state.char.level)}`;
  } else {
    tierBadge.style.display = 'none';
  }
  document.getElementById('header-sub').textContent = race().name + ' · ' + style().name + ' · Nivel ' + state.char.level;

  const navEl = document.getElementById('city-nav');
  if(navEl){
    const inDungeonRun = !!(state.dungeon && !state.dungeon.floors[state.dungeon.floors.length-1][0].done);
    const inCombat = !!(combat && combat.active);
    navEl.style.display = 'none'; // reemplazada por el menú lateral (renderSideNav)
    const navAdminBtn = document.getElementById('nav-admin-btn');
    if(navAdminBtn) navAdminBtn.style.display = (state.char.role==='admin') ? 'inline-flex' : 'none';
    const activeNavKey = homeOpen?'home' : shopOpen?'shop' : tabernaOpen?'taberna' : missionsOpen?'missions' : ofrendaOpen?'ofrenda' : checkinOpen?'checkin' : rankingOpen?'ranking' : adminOpen?'admin' : 'city';
    navEl.querySelectorAll('.nav-btn').forEach(btn=>{
      btn.classList.toggle('active', btn.dataset.nav===activeNavKey);
    });
  }

  const invBtn = document.getElementById('btn-inventory');
  invBtn.style.display = 'inline-block';
  invBtn.classList.toggle('active', invOpen);
  invBtn.disabled = !!(combat && combat.active);
  document.getElementById('btn-slots').style.display = 'inline-block';
  document.getElementById('btn-reset').style.display = 'inline-block';

  renderSheet();
  renderLog();
  if(combat && combat.active){
    invOpen = false;
    homeOpen = false;
    shopOpen = false;
    rankingOpen = false;
    adminOpen = false;
    missionsOpen = false;
    tabernaOpen = false;
    ofrendaOpen = false;
    checkinOpen = false;
    optionsOpen = false;
    renderCombat();
  } else if(invOpen){
    renderInventory();
  } else if(homeOpen){
    renderHome();
  } else if(shopOpen){
    renderShop();
  } else if(rankingOpen){
    renderRanking();
  } else if(adminOpen){
    renderAdmin();
  } else if(missionsOpen){
    renderMissions();
  } else if(tabernaOpen){
    renderTaberna();
  } else if(ofrendaOpen){
    renderOfrenda();
  } else if(checkinOpen){
    renderCheckin();
  } else if(optionsOpen){
    renderOptions();
  } else if(state.dungeon && !state.dungeon.floors[state.dungeon.floors.length-1][0].done){
    renderMap();
  } else {
    renderCity();
  }
}

function renderLog(){
  const box = document.getElementById('log-box');
  if(!box) return;
  box.innerHTML = state.log.slice(-40).map(m=>`<div>${m}</div>`).join('');
  box.scrollTop = box.scrollHeight;
}

/* ============================================================
   RENDER: CHARACTER SHEET
   ============================================================ */
// Nueva interfaz (2026-10-02, maqueta aprobada): en la ciudad la columna
// izquierda es el menú lateral (renderSideNav); en el laberinto y en combate
// sigue mostrando la ficha del personaje como siempre.
function inCityMode(){
  if(!state) return false;
  if(combat && combat.active) return false;
  return !(state.dungeon && !state.dungeon.floors[state.dungeon.floors.length-1][0].done);
}
function renderSheet(){
  const el = document.getElementById('sheet');
  // En la ciudad la barra de arriba se esconde (ver body.city-mode en el CSS):
  // todo lo que tenía vive ahora en el menú lateral (pedido 2026-10-04).
  document.body.classList.toggle('city-mode', inCityMode());
  document.body.classList.toggle('dungeon-mode', !inCityMode());
  el.classList.add('side-nav-mode');
  if(inCityMode()){ renderSideNav(); return; }
  renderDungeonNav();
}
// Panel izquierdo dentro del laberinto y en combate (2026-10-04, pedido
// explícito): antes era la hoja larga de estadísticas más una barra arriba con
// todos los botones. Ahora es una tarjeta del personaje (nombre, título, raza,
// senda, nivel y sus cuatro barras) y un menú corto, igual que en la ciudad:
//   · Ficha del personaje: se abre encima, sin salir del laberinto ni del
//     combate; ahí los títulos no se pueden cambiar (solo en la ciudad).
//   · Inventario: fuera de combate. En combate está la Mochila del menú.
//   · Opciones (con cerrar sesión y borrar personaje dentro) y música.
function renderDungeonNav(){
  const el = document.getElementById('sheet');
  const d = derived(), r = race(), st = style();
  const xpNeeded = xpNeededForLevel(state.char.level);
  const shieldAmt = (combat && combat.playerShield) || 0, hpScale = d.maxHP + shieldAmt;
  const pct = (a, b)=> clamp(a/b*100, 0, 100);
  const hpLabel = shieldAmt > 0 ? `${state.char.curHP} (${shieldAmt}) / ${d.maxHP}` : `${state.char.curHP} / ${d.maxHP}`;
  const low = (state.char.curHP/d.maxHP) <= 0.3 ? ' low' : '';
  const inCombat = !!(combat && combat.active);
  el.classList.toggle('in-combat', inCombat);
  const muted = /🔇/.test((document.getElementById('btn-music-toggle')||{}).textContent||'');
  const bar = (label, text, cls, w, extra = '')=> `<div class="bar-row"><div class="bar-label"><span>${label}</span><span>${text}</span></div>
      <div class="bar-track"><div class="bar-fill ${cls}" style="width:${w}%"></div>${extra}</div></div>`;
  const item = (key, ic, name, o = {})=> `<div class="sn-item ${o.locked ? 'locked' : ''}" data-dn="${key}" ${o.why ? `title="${o.why}"` : ''}><span class="sn-ic">${ic}</span><span class="sn-txt">${name}</span>${o.locked ? '<span class="sn-lock">🔒</span>' : ''}</div>`;
  el.innerHTML = `
    <div class="sn-brand"><b>Dungeon &amp; Stone</b><span id="sn-clock" title="Hora de Ecuador (UTC-5)">${(document.getElementById('clock-time')||{}).textContent||''}</span></div>
    <div class="dn-hero">
      <div class="dn-who">
        <div class="sn-ava"><img src="${playerSpriteFor(state.char.style, state.char.race)||''}" alt=""><span class="sn-lvl">${state.char.level}</span></div>
        <div class="sn-who">
          <div class="sn-name">${state.char.nickname}${renownBadge(myTitleN())}${myMythicBadge()}</div>
          <div class="sn-sub"><img src="src/assets/razas/${r.id}.png" alt="" onerror="this.remove()">${r.name} · <img src="src/assets/clases/${st.id}.png" alt="" onerror="this.remove()">${st.name}</div>
          <div class="sn-sub">Nivel ${state.char.level}</div>
        </div>
      </div>
      ${bar('Vida', hpLabel, 'hp' + low, pct(state.char.curHP, hpScale), shieldAmt > 0 ? `<div class="bar-fill shield" style="width:${pct(shieldAmt, hpScale)}%; left:${pct(state.char.curHP, hpScale)}%;"></div>` : '')}
      ${bar('MP', `${state.char.curSta} / ${d.maxSta}`, 'st', pct(state.char.curSta, d.maxSta))}
      ${bar('Espíritu', `${state.char.curSpi} / ${d.maxSpi}`, 'sp', pct(state.char.curSpi, d.maxSpi))}
      ${bar('Experiencia', `${state.char.xp} / ${xpNeeded}`, 'xp', pct(state.char.xp, xpNeeded))}
      <div class="dn-chips"><span title="Oro">⛁ ${state.char.gold.toLocaleString('es')}</span>${state.dungeon ? `<span title="Nivel del laberinto y su amenaza">Nivel ${state.dungeon.level} · ⚠ ${visualThreat(state.dungeon.level, state.char.level)}</span>` : ''}</div>
    </div>
    <div class="sn-nav">
      <div class="sn-sec">
        ${item('ficha', '🧝', 'Ficha del personaje')}
        ${inCombat ? '' : item('hdr:btn-inventory', '🎒', 'Personaje e inventario')}
        ${item('hdr:btn-options', '⚙️', 'Opciones', inCombat ? {locked:true, why:'No disponible en pleno combate'} : {})}
        ${item('hdr:btn-music-toggle', muted ? '🔇' : '🔊', muted ? 'Música: silenciada' : 'Música: activada')}
      </div>
    </div>`;
  el.querySelectorAll('[data-dn]').forEach(it=>{ it.onclick = ()=>{
    if(it.classList.contains('locked')) return;
    const key = it.dataset.dn;
    if(key === 'ficha') return openFichaOverlay();
    document.getElementById(key.slice(4)).click();
    if(key === 'hdr:btn-music-toggle') renderDungeonNav();
  }; });
}
// Ficha del personaje encima de la pantalla actual (laberinto o combate).
let fichaHostEl = null;
function openFichaOverlay(){
  if(fichaHostEl) return;
  const div = document.createElement('div');
  div.className = 'overlay-msg ficha-ov';
  div.innerHTML = `<div class="overlay-card ficha-card">
    <div class="ficha-ov-top"><h3>Ficha del personaje</h3><button class="reset-btn" id="ficha-ov-close">Cerrar</button></div>
    <div id="ficha-ov-body"></div></div>`;
  document.body.appendChild(div);
  const close = ()=>{ fichaHostEl = null; div.remove(); };
  div.querySelector('#ficha-ov-close').onclick = close;
  div.onclick = (e)=>{ if(e.target === div) close(); };
  fichaHostEl = div.querySelector('#ficha-ov-body');
  renderFicha();
}
function renderSheetPanel(targetId){
  const d = derived();
  const r = race(), s = style();
  const xpNeeded = xpNeededForLevel(state.char.level);
  // Escudo del jugador (ver combat.playerShield / grantShield): mientras esté
  // activo, la barra se reescala a maxHP+escudo para que el escudo siempre
  // tenga dónde mostrarse, incluso a vida completa (750 (250)/750).
  const playerShieldAmt = (combat && combat.playerShield) || 0;
  const hpScale = d.maxHP + playerShieldAmt;
  const hpPct = clamp(state.char.curHP/hpScale*100,0,100);
  const shieldPct = clamp(playerShieldAmt/hpScale*100,0,100);
  const hpLabel = playerShieldAmt>0 ? `${state.char.curHP} (${playerShieldAmt}) / ${d.maxHP}` : `${state.char.curHP} / ${d.maxHP}`;
  const hpLowClass = (state.char.curHP/d.maxHP) <= 0.3 ? ' low' : '';
  const stPct = clamp(state.char.curSta/d.maxSta*100,0,100);
  const spPct = clamp(state.char.curSpi/d.maxSpi*100,0,100);
  const xpPct = clamp(state.char.xp/xpNeeded*100,0,100);

  const resKeys = [['fisico','Físico'],['fuego','Fuego'],['hielo','Hielo'],['veneno','Veneno'],['aturdimiento','Aturd.']];
  const resHTML = resKeys.map(([k,label])=>{
    const v = totalRes(k);
    const cls = v>0?'pos':(v<0?'neg':'');
    return `<span class="res-chip ${cls}">${label} ${v>=0?'+':''}${v}%</span>`;
  }).join('');

  const equipHTML = EQUIP_SLOTS.map(slot=>{
    const it = state.char.equip[slot];
    const label = slotLabel(slot);
    if(!it) return `<div class="equip-row"><span>${label}</span><b>— vacío —</b></div>`;
    const color = RARITIES[it.rarity||'comun'].color;
    return `<div class="equip-row"><span>${label}</span><b style="color:${color};">${equipIcon(it)} ${it.name}</b></div>`;
  }).join('');

  const potionCount = (state.char.inventory||[]).filter(i=>i.kind==='potion').reduce((a,i)=>a+i.qty,0);
  const gearCount = (state.char.inventory||[]).filter(i=>i.kind==='equip').length;
  const stunChance = totalStunChance();
  const cs = combatStatsSummary();

  document.getElementById(targetId).innerHTML = `
    <div class="sheet-title">
      <div class="sheet-emblem"><img src="src/assets/razas/${r.id}.png" alt="" onerror="this.replaceWith('${r.icon}')"></div>
      <div>
        <div class="name">${state.char.nickname}${renownBadge(myTitleN())}${myMythicBadge()} · ${r.name} · <img src="src/assets/clases/${s.id}.png" alt="" style="width:1.1em; height:1.1em; object-fit:contain; vertical-align:-2px;" onerror="this.replaceWith('${s.icon} ')"> ${s.name}</div>
        <div class="tag">Nivel ${state.char.level}</div>
      </div>
    </div>

    <div class="bar-row">
      <div class="bar-label"><span>Vida</span><span>${hpLabel}</span></div>
      <div class="bar-track"><div class="bar-fill hp${hpLowClass}" style="width:${hpPct}%"></div>${playerShieldAmt>0?`<div class="bar-fill shield" style="width:${shieldPct}%; left:${hpPct}%;"></div>`:''}</div>
    </div>
    <div class="bar-row">
      <div class="bar-label"><span>MP</span><span>${state.char.curSta} / ${d.maxSta}</span></div>
      <div class="bar-track"><div class="bar-fill st" style="width:${stPct}%"></div></div>
    </div>
    <div class="bar-row">
      <div class="bar-label"><span>Espíritu</span><span>${state.char.curSpi} / ${d.maxSpi}</span></div>
      <div class="bar-track"><div class="bar-fill sp" style="width:${spPct}%"></div></div>
    </div>
    <div class="bar-row">
      <div class="bar-label"><span>Experiencia</span><span>${state.char.xp} / ${xpNeeded}</span></div>
      <div class="bar-track"><div class="bar-fill xp" style="width:${xpPct}%"></div></div>
    </div>

    <div class="stat-grid">
      <div class="stat-box"><div class="v">${d.fis}</div><div class="k">Físico</div></div>
      <div class="stat-box"><div class="v">${d.esp}</div><div class="k">Espíritu</div></div>
      <div class="stat-box"><div class="v">${d.hab}</div><div class="k">Habilidad</div></div>
      <div class="stat-box"><div class="v">${d.agi}</div><div class="k">Agilidad</div></div>
      <div class="stat-box"><div class="v">${d.vig}</div><div class="k">Vigor</div></div>
    </div>

    <div class="section-label">Estadísticas de combate</div>
    <div class="res-list">
      <span class="res-chip pos">Físico ${d.fis}</span>
      <span class="res-chip pos">Habilidad ${d.hab}</span>
      <span class="res-chip pos">Agilidad ${d.agi}</span>
      <span class="res-chip pos">Vigor ${d.vig}</span>
      <span class="res-chip pos">Crítico +${Math.round(d.critChance*100)}%</span>
      ${cs.criticoDano>0?`<span class="res-chip pos">Daño crítico +${Math.round((1.5+cs.criticoDano)*100)}%</span>`:''}
      <span class="res-chip pos">Evasión ${Math.round(d.evasionBase*100)}%</span>
      <span class="res-chip ${stunChance>0?'pos':''}">Aturdir al golpear ${Math.round(stunChance*100)}%</span>
      ${cs.aumentoDano>0?`<span class="res-chip pos">Aumento de daño +${Math.round(cs.aumentoDano*100)}%</span>`:''}
      ${cs.reduccionDano>0?`<span class="res-chip pos">Reducción de daño recibido (equipo) ${Math.round(cs.reduccionDano*100)}%</span>`:''}
      ${d.reduccionVigor>0?`<span class="res-chip pos">Reducción de daño recibido (Vigor) ${Math.round(d.reduccionVigor*100)}%</span>`:''}
      ${setBonusChipsHTML(state.char.equip)}
      ${cs.bloqueo>0?`<span class="res-chip pos">Bloqueo ${Math.round(cs.bloqueo*100)}%</span>`:''}
      ${cs.retroceso>0?`<span class="res-chip pos">Retroceso ${Math.round(cs.retroceso*100)}%</span>`:''}
      ${cs.robovida>0?`<span class="res-chip pos">Succión de vida ${Math.round(cs.robovida*100)}%</span>`:''}
      ${cs.succionHechizo>0?`<span class="res-chip pos">Succión de hechizo ${Math.round(cs.succionHechizo*100)}%</span>`:''}
      ${cs.penetracionFisica>0?`<span class="res-chip pos">Penetración física ${Math.round(cs.penetracionFisica*100)}%</span>`:''}
      ${cs.penetracionMagica>0?`<span class="res-chip pos">Penetración mágica ${Math.round(cs.penetracionMagica*100)}%</span>`:''}
      ${d.penetracionNivel>0?`<span class="res-chip pos">Penetración por nivel ${(d.penetracionNivel*100).toFixed(1)}%</span>`:''}
      ${cs.segundoAtaque>0?`<span class="res-chip pos">Segundo ataque básico ${Math.round(cs.segundoAtaque*100)}%</span>`:''}
      ${cs.dobleEncantamiento>0?`<span class="res-chip pos">Doble encantamiento ${Math.round(cs.dobleEncantamiento*100)}%</span>`:''}
      ${d.resMagica!==0?`<span class="res-chip ${d.resMagica>0?'pos':'neg'}">Resistencia mágica ${d.resMagica>=0?'+':''}${Math.round(d.resMagica)}%</span>`:''}
      ${d.resistenciaEstado>0?`<span class="res-chip pos">Resistencia a efectos de estado ${Math.round(d.resistenciaEstado*100)}%</span>`:''}
      ${d.fortalezaMental>0?`<span class="res-chip pos">Fortaleza mental ${Math.round(d.fortalezaMental*100)}%</span>`:''}
      ${Math.round(d.precision*100)>0?`<span class="res-chip pos">Precisión ${Math.round(d.precision*100)}%</span>`:''}
      ${cs.razaBonuses.map(sp=>`<span class="res-chip pos">Daño vs ${RAZA_TAG_LABEL[sp.raza]||sp.raza} +${Math.round(sp.value*100)}%</span>`).join('')}
      ${cs.posicionBonuses.map(sp=>`<span class="res-chip pos">Daño vs ${POSICION_TAG_LABEL[sp.posicion]||sp.posicion} +${Math.round(sp.value*100)}%</span>`).join('')}
    </div>
    <div class="sheet-hint">Evasión mostrada fuera de combate; en combate varía según el nivel del enemigo y tus efectos activos. Aturdir al golpear depende del arma, las piedras de alma y los Caídos del Laberinto que lleves equipados.</div>

    <div class="section-label">Resistencias</div>
    <div class="res-list">${resHTML}</div>

    <details class="sheet-details">
      <summary class="section-label">Equipo</summary>
      ${equipHTML}
      <div class="sheet-hint">${gearCount} objeto(s) y ${potionCount} poción(es) en la mochila. <button id="sheet-inv-link">Abrir inventario</button></div>
      <div class="sheet-hint">Espacios de alma: ${socketedStones().length}/${maxSoulSlots(state.char.level)}${maxSoulSlots(state.char.level)===0 ? ' (el primero se desbloquea en nivel 10)' : ''}.</div>
    </details>

    <div class="section-label">Rasgo pasivo — ${r.passive}</div>
    <div style="font-size:0.78em; color:var(--text-dim);">${r.passiveDesc}</div>
  `;

  const link = document.getElementById('sheet-inv-link');
  if(link){
    link.onclick = ()=>{
      if(combat && combat.active){ log('No puedes abrir el inventario en combate. Usa tus pociones desde el panel de combate.'); return; }
      invOpen = true;
      renderAll();
    };
  }
}

// Ficha del personaje (rediseño 2026-10-04, pedido explícito: "hacerlo algo más
// dinámico"): retrato grande con nivel y experiencia, vida/MP/espíritu, los
// cinco atributos como barras, y las estadísticas de combate repartidas en
// pestañas (Ataque / Defensa / Conjuntos) como fichas de valor en vez de la
// nube de etiquetas. El panel lateral del laberinto sigue usando la versión
// compacta (renderSheetPanel).
let fichaTab = 'ataque';
function renderFicha(){
  const d = derived(), r = race(), st = style(), cs = combatStatsSummary();
  const xpNeeded = xpNeededForLevel(state.char.level), xpPct = clamp(state.char.xp/xpNeeded*100,0,100);
  const pct = (v)=> `${Math.round(v*100)}%`;
  const bar = (label, cur, max, cls)=> `<div class="fc-vital"><div class="bar-label"><span>${label}</span><span>${cur} / ${max}</span></div>
    <div class="bar-track"><div class="bar-fill ${cls}" style="width:${clamp(cur/max*100,0,100)}%"></div></div></div>`;
  const attrs = [['⚔️','Físico','Daño físico',d.fis],['✨','Espíritu','Espíritu y curación',d.esp],['🔮','Habilidad','MP y magia',d.hab],['💨','Agilidad','Crítico y evasión',d.agi],['🛡️','Vigor','Vida y aguante',d.vig]];
  const attrMax = Math.max(...attrs.map(a=>a[3]), 1);
  const attrsHTML = attrs.map(([ic,name,sub,v])=>`<div class="fc-attr">
      <span class="fc-attr-ic">${ic}</span>
      <span class="fc-attr-txt"><b>${name}</b><small>${sub}</small></span>
      <span class="fc-attr-bar"><i style="width:${(v/attrMax*100).toFixed(1)}%"></i></span>
      <span class="fc-attr-val">${v}</span></div>`).join('');
  const stunChance = totalStunChance();
  const tile = (label, value, on)=> on===false ? '' : `<div class="fc-tile"><b>${value}</b><span>${label}</span></div>`;
  const ataque = [
    tile('Prob. de crítico', pct(d.critChance)),
    tile('Daño crítico', pct(1.5+cs.criticoDano)),
    tile('Aumento de daño', '+'+pct(cs.aumentoDano), cs.aumentoDano>0),
    tile('Precisión', pct(d.precision), Math.round(d.precision*100)>0),
    tile('Penetración física', pct(cs.penetracionFisica), cs.penetracionFisica>0),
    tile('Penetración mágica', pct(cs.penetracionMagica), cs.penetracionMagica>0),
    tile('Penetración por nivel', (d.penetracionNivel*100).toFixed(1)+'%', d.penetracionNivel>0),
    tile('Segundo ataque básico', pct(cs.segundoAtaque), cs.segundoAtaque>0),
    tile('Doble encantamiento', pct(cs.dobleEncantamiento), cs.dobleEncantamiento>0),
    tile('Succión de vida', pct(cs.robovida), cs.robovida>0),
    tile('Succión de hechizo', pct(cs.succionHechizo), cs.succionHechizo>0),
    tile('Aturdir al golpear', pct(stunChance), stunChance>0),
    tile('Retroceso', pct(cs.retroceso), cs.retroceso>0),
    ...cs.razaBonuses.map(sp=> tile(`Daño vs ${RAZA_TAG_LABEL[sp.raza]||sp.raza}`, '+'+pct(sp.value))),
    ...cs.posicionBonuses.map(sp=> tile(`Daño vs ${POSICION_TAG_LABEL[sp.posicion]||sp.posicion}`, '+'+pct(sp.value))),
  ].join('');
  const resKeys = [['fisico','Res. física'],['fuego','Res. al fuego'],['hielo','Res. al hielo'],['veneno','Res. al veneno'],['aturdimiento','Res. al aturdimiento']];
  const defensa = [
    tile('Evasión', pct(d.evasionBase)),
    tile('Bloqueo', pct(cs.bloqueo), cs.bloqueo>0),
    tile('Reducción de daño (equipo)', pct(cs.reduccionDano), cs.reduccionDano>0),
    tile('Reducción de daño (Vigor)', pct(d.reduccionVigor), d.reduccionVigor>0),
    tile('Resistencia mágica', (d.resMagica>=0?'+':'')+Math.round(d.resMagica)+'%', d.resMagica!==0),
    tile('Resistencia a estados', pct(d.resistenciaEstado), d.resistenciaEstado>0),
    tile('Fortaleza mental', pct(d.fortalezaMental), d.fortalezaMental>0),
    ...resKeys.map(([k,label])=>{ const v = totalRes(k); return tile(label, (v>=0?'+':'')+v+'%'); }),
  ].join('');
  const setCounts = Object.entries(setPieceCounts(state.char.equip));
  const conjuntos = setCounts.length ? setCounts.map(([setId,n])=>{
    const set = SET_CATALOG[setId], b = SET_BONUSES[setId];
    return `<div class="fc-set"><div class="fc-set-head"><b>${set.name}</b><span>${n} / 5 piezas</span></div>
      ${[2,3,5].filter(k=>b[k]).map(k=>`<div class="fc-set-line ${setBonusTier(setId,n)===k?'on':''}"><i>${k}</i><span><b>${b[k].name}</b> ${b[k].text}</span></div>`).join('')}</div>`;
  }).join('') + '<p class="sc-note" style="margin-top:6px;">De cada conjunto se aplica solo el bono más alto que alcances; los de 2 y 3 piezas sirven para combinar dos conjuntos.</p>'
  : '<p class="inv-empty-msg">No llevas piezas de ningún conjunto.</p>';
  const equipTiles = EQUIP_SLOTS.map(slot=>{
    const it = state.char.equip[slot];
    return it ? `<div class="fc-eq" style="--rc:${RARITIES[it.rarity||'comun'].color}">${itemArtTileHTML(it, 52)}</div>`
              : `<div class="fc-eq empty" title="${slotLabel(slot)}: vacío"><span>${slotLabel(slot)}</span></div>`;
  }).join('');
  const tabs = [['ataque','⚔️ Ataque'],['defensa','🛡️ Defensa'],['conjuntos','✨ Conjuntos']];
  (fichaHostEl || document.getElementById('main-panel')).innerHTML = `
    <div class="fc">
      <div class="fc-left">
        <div class="fc-portrait"><img src="${playerSpriteFor(state.char.style, state.char.race)||''}" alt=""><span class="fc-lvl">Nivel ${state.char.level}</span></div>
        <div class="fc-name">${state.char.nickname}${renownBadge(myTitleN())}${myMythicBadge()}</div>
        <div class="fc-sub"><img src="src/assets/razas/${r.id}.png" alt="" onerror="this.remove()">${r.name} · <img src="src/assets/clases/${st.id}.png" alt="" onerror="this.remove()">${st.name}</div>
        <div class="fc-xp"><div class="bar-track"><div class="bar-fill xp" style="width:${xpPct}%"></div></div><small>${state.char.xp} / ${xpNeeded} de experiencia</small></div>
        <div class="fc-passive"><b>Rasgo: ${r.passive}</b>${r.passiveDesc}</div>
        <div class="fc-equip">${equipTiles}</div>
        <button class="reset-btn" id="fc-inv">🎒 Abrir inventario</button>
      </div>
      <div class="fc-right">
        <div class="fc-vitals">${bar('Vida', state.char.curHP, d.maxHP, 'hp')}${bar('MP', state.char.curSta, d.maxSta, 'st')}${bar('Espíritu', state.char.curSpi, d.maxSpi, 'sp')}</div>
        <div class="fc-attrs">${attrsHTML}</div>
        <div class="rk-tabs fc-tabs">${tabs.map(([k,l])=>`<button class="${fichaTab===k?'on':''}" data-fc-tab="${k}">${l}</button>`).join('')}</div>
        <div class="${fichaTab==='conjuntos'?'':'fc-tiles'}">${fichaTab==='ataque' ? ataque : fichaTab==='defensa' ? defensa : conjuntos}</div>
        ${fichaTab==='defensa' ? '<p class="sc-note" style="margin-top:8px;">La evasión mostrada es fuera de combate; en combate varía según el nivel del enemigo y tus efectos activos.</p>' : ''}
        <div class="fc-titlebox">
          ${myEarnedTitles().length ? `
          <div class="fc-title"><label for="fc-title-sel">Título</label>
            <select id="fc-title-sel" class="auth-input">
              <option value="0" ${myTitleN()===0?'selected':''}>Sin título</option>
              ${myEarnedTitles().map(k=>`<option value="${k}" ${myTitleN()===k?'selected':''}>${renownTitle(k)}</option>`).join('')}
            </select></div>
          <div class="fc-title-desc">${myTitleN()>0 ? `${RENOWN_TITLE_HOW[myTitleN()]}
            <ul class="pet-card-bonuses">${titlePerksText(myTitleN()).map(t=>`<li>${t}</li>`).join('')}</ul>
            <small>Solo cuenta el título que llevas puesto.</small>` : 'No llevas ningún título puesto, así que no recibes sus beneficios.'}</div>`
          : '<div class="fc-title-desc">Aún sin títulos: el primero, Aventurero, se gana al derrotar al Ogro (nivel 10).</div>'}
        </div>
      </div>
    </div>`;
  document.querySelectorAll('[data-fc-tab]').forEach(b=>{ b.onclick = ()=>{ fichaTab = b.dataset.fcTab; renderFicha(); }; });
  const fcInv = document.getElementById('fc-inv');
  if(fichaHostEl){
    // Fuera de la ciudad la ficha es de consulta: sin atajo al inventario y
    // con el título bloqueado (pedido 2026-10-04: solo se cambia en la ciudad).
    if(fcInv) fcInv.remove();
    const sel = fichaHostEl.querySelector('#fc-title-sel'), box = fichaHostEl.querySelector('.fc-titlebox');
    if(sel) sel.disabled = true;
    if(box) box.insertAdjacentHTML('beforeend', '<p class="fc-title-lock">🔒 El título solo se puede cambiar en la ciudad.</p>');
  } else if(fcInv) fcInv.onclick = ()=> cityNavigate('inv');
  const titleSel = document.getElementById('fc-title-sel');
  if(titleSel) titleSel.onchange = ()=> setMyTitle(parseInt(titleSel.value, 10));
}

/* ============================================================
   RENDER: INVENTORY & EQUIPMENT
   ============================================================ */
const STAT_LABELS = {fis:'Físico', esp:'Espíritu', hab:'Habilidad', maxhp:'Vida máxima'};
const RES_LABELS = {fisico:'Físico', fuego:'Fuego', hielo:'Hielo', veneno:'Veneno', aturdimiento:'Aturdimiento'};
const COST_LABELS = {estamina:'MP', espiritu:'Espíritu'};

// Texto de un solo special (arma o piedra) — cada uno trae su propio "text"
// ya redactado (ver WEAPON_CATALOG); esta función solo antepone el % que
// corresponda (chance/value/percent/pct, en ese orden) o nada si el efecto
// es un flag puro sin número (ej. "Aumenta la duración de Bendecido").
function specialDisplayText(sp){
  const pct = sp.chance!==undefined ? sp.chance : sp.value!==undefined ? sp.value : sp.percent!==undefined ? sp.percent : sp.pct!==undefined ? sp.pct : null;
  return pct!==null ? `${Math.round(pct*100)}% ${sp.text||sp.label||''}` : (sp.text||sp.label||'');
}
// Descripción de un objeto: pedido explícito de que sea ÚNICAMENTE lo que
// describimos por rareza — "+19 de habilidad, 15% de aplicar sangrado 2
// turnos." — sin adornos genéricos como "daño puro" ni texto de relleno.
// item.mods: estadísticas del equipo general que no encajan en el molde
// bonus.stat/bonus.res de siempre (ver SET_CATALOG) — cada objeto puede
// traer varias a la vez (ej. Casco: maxhp_flat + precision juntos).
const MOD_LABELS = {maxhp_flat:'Vida máxima', precision:'Precisión', res_magica:'Resistencia mágica', resistencia_estado:'Resistencia a efectos de estado', fortaleza_mental:'Fortaleza mental', mp_flat:'MP', espiritu_flat:'Espíritu máximo',
  fis:'Físico', hab:'Habilidad', esp:'Espíritu', agi:'Agilidad', vig:'Vigor', res_fisica:'Resistencia física'};
const MOD_IS_PERCENT = new Set(['precision','resistencia_estado','fortaleza_mental','res_fisica']);
function itemBonusLines(item){
  const parts = [];
  if(item.bonus && item.bonus.value!==0){
    parts.push(item.bonus.stat
      ? `+${item.bonus.value} ${STAT_LABELS[item.bonus.stat] || item.bonus.stat}`
      : `+${item.bonus.value}% Resistencia a ${RES_LABELS[item.bonus.res] || item.bonus.res}`);
  }
  Object.entries(item.mods||{}).forEach(([key,value])=>{
    if(!value) return;
    parts.push(`+${value}${MOD_IS_PERCENT.has(key)?'%':''} ${MOD_LABELS[key]||key}`);
  });
  const specials = item.specials || (item.special ? [item.special] : []);
  specials.forEach(sp=> parts.push(specialDisplayText(sp)));
  return parts;
}
function itemBonusText(item){
  const parts = itemBonusLines(item);
  return parts.join(', ') + (parts.length ? '.' : '');
}
// Ícono por tipo de slot (y, en arma/arma2, por senda del arma) — pedido
// explícito 2026-09-25: el inventario era 100% texto, sin nada que distinga
// de un vistazo un casco de unas botas. Aproximado, no hay arte real por
// ítem todavía.
const EQUIP_SLOT_ICONS = {armadura:'🧥', amuleto:'📿', casco:'🪖', botas:'👢', guantes:'🧤'};
const WEAPON_STYLE_ICONS = {pesada:'⚔️', doblefilo:'🗡️', tirador:'🏹', mago:'🪄', sacerdote:'✨', paladin:'⚜️', hechicero:'🌀'};
const OFFHAND_STYLE_ICONS = {pesada:'🛡️', doblefilo:'🗡️', tirador:'🏹', mago:'🔮', sacerdote:'📖', paladin:'🛡️', hechicero:'🔮'};
function equipIcon(it){
  if(EQUIP_SLOT_ICONS[it.slot]) return EQUIP_SLOT_ICONS[it.slot];
  if(it.slot==='arma2') return OFFHAND_STYLE_ICONS[it.styleId] || '🗡️';
  return WEAPON_STYLE_ICONS[it.styleId] || '⚔️';
}

// ============================================================
// ARTE DE ÍTEM (2026-09-25, pedido explícito: "implementa la opción de las
// imágenes a cada arma, arma secundaria, equipamiento, etc, sin quitar la
// opción de las descripciones"). No generamos arte pintado/fotográfico —
// esto son siluetas vectoriales propias (SVG, viewBox 0 0 24 24,
// fill="currentColor"), una por arma con nombre propio y una por tipo de
// slot de armadura, coloreadas en vivo con el mismo color de rareza que ya
// usa el texto (RARITIES/SOUL_TIER_COLORS) — así que al recolorear esas
// tablas (ver más arriba) el arte se recolorea sola, sin tocar nada acá.
// El texto de nombre/descripción NO se toca: esto solo agrega un ícono al
// costado, en vez de reemplazar nada.
const ITEM_ART_SHAPES = {
  hammer: '<rect x="10.5" y="10" width="3" height="12" rx="1"/><rect x="5" y="3" width="14" height="7" rx="1.5"/>',
  mace: '<rect x="10.5" y="11" width="3" height="11" rx="1"/><circle cx="12" cy="7" r="5"/><polygon points="12,0.5 14,4 10,4"/><polygon points="4.5,7 8.5,5.5 8.5,8.5"/><polygon points="19.5,7 15.5,5.5 15.5,8.5"/>',
  greatsword: '<polygon points="12,1 14,3 13,17 11,17 10,3"/><rect x="7" y="16" width="10" height="2" rx="1"/><rect x="10.5" y="18" width="3" height="4"/><circle cx="12" cy="22.3" r="1.5"/>',
  shield: '<path d="M12 2 L19 5 V12 C19 17 15.5 20.5 12 22 C8.5 20.5 5 17 5 12 V5 Z"/><rect x="11" y="7.5" width="2" height="9" rx="1" fill-opacity="0.35"/>',
  dagger: '<path d="M12 2 Q14.3 8 12.6 15 L11.4 15 Q9.7 8 12 2 Z"/><rect x="9" y="14.5" width="6" height="1.6" rx="0.8"/><rect x="10.7" y="16" width="2.6" height="5" rx="1"/><circle cx="12" cy="21.5" r="1.3"/>',
  knife: '<polygon points="12,2 14.3,15 9.7,15"/><rect x="9" y="15" width="6" height="1.6" rx="0.8"/><rect x="10.7" y="16.6" width="2.6" height="5" rx="1"/>',
  bow_short: '<path d="M11 6 C6 8.3 6 15.7 11 18" fill="none" stroke="currentColor" stroke-width="1.5"/><line x1="11" y1="6" x2="11" y2="18" stroke="currentColor" stroke-width="0.8"/>',
  bow_long: '<path d="M10 2 C3.5 6.3 3.5 17.7 10 22" fill="none" stroke="currentColor" stroke-width="1.5"/><line x1="10" y1="2" x2="10" y2="22" stroke="currentColor" stroke-width="0.8"/>',
  quiver: '<path d="M9 10 L15 10 L13.5 22 L10.5 22 Z"/><line x1="10" y1="10" x2="8" y2="2" stroke="currentColor" stroke-width="1.4"/><line x1="12" y1="10" x2="12" y2="1" stroke="currentColor" stroke-width="1.4"/><line x1="14" y1="10" x2="16" y2="2" stroke="currentColor" stroke-width="1.4"/>',
  wand: '<rect x="10.6" y="8" width="2.6" height="15" rx="1.3" transform="rotate(25 12 15)"/><circle cx="8" cy="4.6" r="2.3"/>',
  staff: '<rect x="10.7" y="6" width="2.6" height="17" rx="1.3"/><circle cx="12" cy="4.3" r="3" fill="none" stroke="currentColor" stroke-width="1.8"/>',
  orb: '<path d="M9 20 L15 20 L13.5 22 L10.5 22 Z"/><circle cx="12" cy="12.5" r="6"/><circle cx="12" cy="12.5" r="2.8" fill="none" stroke="currentColor" stroke-width="1.1" stroke-opacity="0.5"/>',
  book: '<rect x="5" y="4" width="6.3" height="17" rx="1"/><rect x="12.7" y="4" width="6.3" height="17" rx="1"/><line x1="10.5" y1="8" x2="10.5" y2="10" stroke="currentColor" stroke-width="1.2"/><line x1="9.5" y1="9" x2="11.5" y2="9" stroke="currentColor" stroke-width="1.2"/>',
  casco: '<path d="M4 14 C4 6 8 3 12 3 C16 3 20 6 20 14 L20 15 L4 15 Z"/><rect x="3" y="15" width="18" height="2.2" rx="1.1"/><circle cx="9" cy="10" r="1.1"/><circle cx="15" cy="10" r="1.1"/>',
  armadura: '<path d="M6 7 L10 5 L12 7.5 L14 5 L18 7 L18 20 L6 20 Z"/><circle cx="5" cy="7" r="2"/><circle cx="19" cy="7" r="2"/>',
  botas: '<path d="M8 3 H14 V14 H16.5 C17.8 14 19 15.2 19 16.5 V19 H8 Z"/><rect x="7" y="19" width="13" height="2" rx="1"/>',
  guantes: '<rect x="7" y="12" width="10" height="8" rx="2.2"/><rect x="7.8" y="4" width="2.1" height="9.5" rx="1"/><rect x="10.6" y="3" width="2.1" height="10.5" rx="1"/><rect x="13.4" y="3.4" width="2.1" height="10" rx="1"/><rect x="16.1" y="4.6" width="2.1" height="8.8" rx="1"/><rect x="4.3" y="13" width="3" height="6" rx="1.5" transform="rotate(-18 5.8 16)"/>',
  amuleto: '<path d="M6 4 C6 8 9 9 12 9 C15 9 18 8 18 4" fill="none" stroke="currentColor" stroke-width="1.5"/><circle cx="12" cy="9.3" r="1.3" fill="none" stroke="currentColor" stroke-width="1"/><polygon points="12,10.5 16,14.5 12,20.5 8,14.5"/>',
  gem: '<polygon points="12,2 18,9 15,21 9,21 6,9"/><line x1="12" y1="2" x2="12" y2="21" stroke-opacity="0.3" stroke="currentColor" stroke-width="0.8"/><line x1="6" y1="9" x2="18" y2="9" stroke-opacity="0.3" stroke="currentColor" stroke-width="0.8"/>'
};
// Nombre de arma con nombre propio -> silueta. Daga/Cuchillo comparten forma
// entre arma principal y secundaria (misma familia, mismo pool de stats).
const WEAPON_NAME_SHAPE = {
  'Martillo de guerra':'hammer', 'Maza de combate':'mace', 'Espadón pesado':'greatsword', 'Escudo de hierro':'shield',
  'Daga curva':'dagger', 'Daga gemela':'dagger', 'Cuchillo largo':'knife', 'Cuchillo gemelo':'knife',
  'Arco corto':'bow_short', 'Arco largo':'bow_long', 'Carcaj de cuero':'quiver',
  'Vara arcana':'wand', 'Bastón rúnico':'staff', 'Foco arcano':'orb',
  'Grimorio de plegarias':'book', 'Tomo sagrado':'book',
  // 2026-10-02: armas nuevas de Paladín/Hechicero/Sacerdote — todavía sin
  // arte propia, usan la silueta de su familia.
  'Maza del Guardián':'mace', 'Espada del Heraldo':'greatsword', 'Escudo de la Vigilia':'shield', 'Sello de la Sentencia':'orb',
  'Vara de la Ruina':'wand', 'Cetro del Devorador':'staff', 'Libro de las Maldiciones':'book', 'Orbe de las Almas':'orb',
  'Cetro de Penitencia':'staff', 'Vara de la Salvaguarda':'wand'
};
// Nombre de catálogo de un arma, sin el sufijo de la Tienda del Gremio.
function weaponBaseName(name){ return (name||'').replace(GREMIO_WEAPON_SUFFIX, ''); }
// Arte real de armas (2026-09-25, pedido explícito, catálogos por senda que
// pasó ariochbu — Guerrero/Asesino/Arquero/Mago/Sacerdote, recortados en
// src/assets/armas/<nombre>_<rareza>.png). El catálogo llega hasta SS pero
// hoy ningún arma tiene ese rango en WEAPON_CATALOG (el tope real es
// 'legendario') — se recortó igual por si se habilita a futuro, pero no se
// referencia acá. El SVG por familia de arma (ITEM_ART_SHAPES/
// WEAPON_NAME_SHAPE) queda de respaldo para cualquier objeto sin imagen.
const WEAPON_NAME_SLUG = {
  'Martillo de guerra':'martillo_de_guerra', 'Maza de combate':'maza_de_combate', 'Espadón pesado':'espadon_pesado', 'Escudo de hierro':'escudo_de_hierro',
  'Daga curva':'daga_curva', 'Daga gemela':'daga_gemela', 'Cuchillo largo':'cuchillo_largo', 'Cuchillo gemelo':'cuchillo_gemelo',
  'Arco corto':'arco_corto', 'Arco largo':'arco_largo', 'Carcaj de cuero':'carcaj_de_cuero',
  'Vara arcana':'vara_arcana', 'Bastón rúnico':'baston_runico', 'Foco arcano':'foco_arcano',
  'Grimorio de plegarias':'grimorio_de_plegarias', 'Tomo sagrado':'tomo_sagrado',
  // Paladín (2026-10-02, catálogos de ariochbu en Assets/Nuevos equipos/Arma paladin)
  'Maza del Guardián':'maza_del_guardian', 'Escudo de la Vigilia':'escudo_de_la_vigilia', 'Espada del Heraldo':'espada_del_heraldo', 'Sello de la Sentencia':'sello_de_la_sentencia',
  // Hechicero y Sacerdote (2026-10-02)
  'Vara de la Ruina':'vara_de_la_ruina', 'Cetro del Devorador':'cetro_del_devorador', 'Libro de las Maldiciones':'libro_de_las_maldiciones', 'Orbe de las Almas':'orbe_de_las_almas',
  'Cetro de Penitencia':'cetro_de_penitencia', 'Vara de la Salvaguarda':'vara_de_la_salvaguarda'
};
const WEAPON_ART_RARITIES = new Set(['comun','poco_comun','raro','rango_b','rango_a','legendario']);
// Arte limpio de armas (2026-10-03, decisión de ariochbu: "un solo diseño
// para todos"): una ilustración por arma, sin fondo de color, en
// src/assets/armas/arte/<slug>.jpg; el rango lo pinta el juego (ver
// .item-art-tile.clean). El rango SS queda FUERA a propósito: sus armas aún
// no tienen ni estadísticas ni forma definidas, así que sigue sin arte como
// hasta ahora. Lo que no figure acá sigue con su imagen vieja por rango.
// Importar con tools/import_armas.py, que imprime la lista.
const WEAPON_CLEAN_ART = new Set(['arco_corto', 'arco_largo', 'baston_runico', 'carcaj_de_cuero', 'cetro_de_penitencia', 'cetro_del_devorador', 'cuchillo_gemelo', 'cuchillo_largo', 'daga_curva', 'daga_gemela', 'escudo_de_hierro', 'escudo_de_la_vigilia', 'espada_del_heraldo', 'espadon_pesado', 'foco_arcano', 'grimorio_de_plegarias', 'libro_de_las_maldiciones', 'martillo_de_guerra', 'maza_de_combate', 'maza_del_guardian', 'orbe_de_las_almas', 'sello_de_la_sentencia', 'tomo_sagrado', 'vara_arcana', 'vara_de_la_ruina', 'vara_de_la_salvaguarda']);
function weaponArtPath(it){
  const slug = WEAPON_NAME_SLUG[weaponBaseName(it.name)];
  if(!slug || !WEAPON_ART_RARITIES.has(it.rarity)) return null;
  return WEAPON_CLEAN_ART.has(slug) ? `src/assets/armas/arte/${slug}.jpg?v=2` : null; // las imágenes viejas por rango se retiraron
}
// Arte real de equipo general por senda (2026-09-25, pedido explícito:
// "continúa con cascos y armadura", luego "guantes y botas"). A diferencia
// de las armas, el NOMBRE del objeto cambia por rango (Casco de piedra ->
// ... -> Casco de vacío), así que la clave acá es (senda, slot) — no el
// nombre — más el rango. Recortado de los catálogos "Cascos - <clase>.png" /
// "armadura - <clase>.png" / "guantes - <clase>.png" / "botas - <clase>.png"
// en src/assets/equipo/<senda>_<slot>_<rareza>.png. Solo Accesorio (amuleto)
// sigue sin arte propia — cae al SVG genérico de siempre.
// Conjuntos con imagen recortada (src/assets/equipo/sets/<set>_<slot>_<rango>.png).
// Los que no figuran acá caen a la silueta genérica sin pedir un 404.
const SET_ART = {jack:SET_SLOTS, artemisa:SET_SLOTS, soberano:SET_SLOTS, bastion:SET_SLOTS, eclipse:SET_SLOTS, gracia:SET_SLOTS, guardian:SET_SLOTS, voluntad:SET_SLOTS};
// Arte limpio de piezas de conjunto (2026-10-03): igual que las armas, una
// ilustración por pieza para todos los rangos en
// src/assets/equipo/arte/<set>_<slot>.jpg (el SS queda fuera). Las claves
// "<set>_<slot>" listadas acá ya la tienen; el resto sigue con su imagen
// vieja por rango. Importar con tools/import_equipo.py.
const GEAR_CLEAN_ART = new Set(Object.keys(SET_ART).flatMap(setId=> SET_SLOTS.map(slot=>`${setId}_${slot}`))); // las 40 piezas de los 8 conjuntos
function gearArtPath(it){
  if(!it.setId || !(SET_ART[it.setId]||[]).includes(it.slot) || !WEAPON_ART_RARITIES.has(it.rarity)) return null;
  return GEAR_CLEAN_ART.has(`${it.setId}_${it.slot}`) ? `src/assets/equipo/arte/${it.setId}_${it.slot}.jpg?v=1` : null; // las imágenes viejas por rango se retiraron
}
// Una piedra de alma SIEMPRE trae `.tier` (letra E-SS) y NUNCA `.rarity`; el
// equipo es al revés — es el discriminante ya usado en todo el resto del
// archivo (SOUL_TIER_COLORS[x.tier] vs RARITIES[x.rarity]). No se usa
// `kind==='soulstone'` porque las entradas de SOUL_STONES (catálogo/plantilla,
// ej. la Forja Legendaria) no traen `kind` — solo las instancias ya
// guardadas en el inventario lo tienen.
function isSoulStoneLike(it){ return it.tier !== undefined; }
function itemArtShape(it){
  if(isSoulStoneLike(it)) return 'gem';
  if(EQUIP_SLOT_ICONS[it.slot]) return it.slot; // armadura/amuleto/casco/botas/guantes ya son las keys de ITEM_ART_SHAPES
  return WEAPON_NAME_SHAPE[weaponBaseName(it.name)] || null;
}
// Tile de ícono (mismo lenguaje visual que el retrato del HUD de combate,
// .phud-portrait: caja con anillo de color). El SVG cae al emoji de
// equipIcon() si el objeto no tiene silueta propia todavía (pociones,
// fragmentos, objetos futuros) — nunca deja el tile vacío.
// Arte real de piedras de alma (2026-09-25, pedido explícito): recortado del
// catálogo que pasó ariochbu (Assets/fuente/...png) — una imagen genérica
// por RANGO (F/E/D/C/B/A/S/SS), compartida entre las 7 familias (el
// catálogo no ilustra una piedra distinta por familia, solo por rango). Va
// en src/assets/piedras/<tier>.png; el SVG del diamante genérico queda como
// respaldo para cualquier tier que falte.
const SOUL_STONE_ART = {};
// Arte limpio (2026-10-04): ilustración nueva por rango en
// src/assets/piedras/arte/<rango>.jpg, con la gema del color de ese rango
// (SOUL_TIER_COLORS) sobre fondo oscuro. Los rangos listados acá ya la tienen;
// el resto sigue con su PNG viejo. Importar con tools/import_objetos.py.
const SOUL_STONE_CLEAN_ART = new Set(['F','E','D','C','B','A','S','SS']);
['F','E','D','C','B','A','S','SS'].forEach(t=> { if(SOUL_STONE_CLEAN_ART.has(t)) SOUL_STONE_ART[t] = `src/assets/piedras/arte/${t}.jpg?v=1`; }); // los PNG viejos se retiraron
// Lo mismo para las pociones: src/assets/pociones/arte/<id>.jpg.
const POTION_CLEAN_ART = new Set(['vida_menor','vida_mayor','estamina','espiritu','antidoto']);
// Carta de objeto al pasar el cursor / mantener presionado (2026-10-03,
// pedido explícito: "que al pasar por encima del arma se revelen las
// estadísticas, como sucede con los Caídos"). Cada tile de objeto se registra
// con una clave (data-item-zoom) y un único par de listeners delegados en
// document muestra la carta en la misma capa de zoom de los Caídos. Sirve
// para armas, equipo y piedras de alma, en cualquier pantalla que use
// itemArtTileHTML (mochila, ranuras, tienda, botín...).
const ITEM_ZOOM_REG = new Map();
let itemZoomSeq = 0, itemZoomShown = null;
function registerItemZoom(it){
  const key = 'z' + (++itemZoomSeq);
  ITEM_ZOOM_REG.set(key, it);
  if(ITEM_ZOOM_REG.size > 3000){ // las entradas viejas son de pantallas ya redibujadas
    let n = 0;
    for(const k of ITEM_ZOOM_REG.keys()){ ITEM_ZOOM_REG.delete(k); if(++n >= 1500) break; }
  }
  return key;
}
const POTION_CARD_COLOR = '#b8934a';
function itemCardHTML(it){
  if(it.potionCard){
    const tpl = POTION_TEMPLATES[it.potionCard];
    return `<div class="pet-card item-card" style="--rc:${POTION_CARD_COLOR}">
      <div class="pet-card-art item">${potionArtTileHTML(it.potionCard, 150)}</div>
      <div class="pet-card-body">
        <div class="pet-card-name">${tpl.name}</div>
        <div class="pet-card-rank">Poción</div>
        <ul class="pet-card-bonuses"><li>${tpl.desc}</li></ul>
      </div>
    </div>`;
  }
  const isStone = isSoulStoneLike(it);
  const color = isStone ? (SOUL_TIER_COLORS[it.tier]||'#9a958c') : RARITIES[it.rarity||'comun'].color;
  const rankName = isStone ? `Piedra de alma · ${it.tier}` : RARITIES[it.rarity||'comun'].name;
  const set = !isStone && it.setId ? SET_CATALOG[it.setId] : null;
  const subParts = isStone ? [] : [slotLabel(it.slot)];
  if(!isStone && it.styleId) subParts.push(SHOP_ROLE_LABELS[it.styleId] || it.styleId);
  if(set) subParts.push(`Conjunto: ${set.name}`);
  const lines = isStone ? (it.desc ? [it.desc] : []) : itemBonusLines(it);
  const minLvl = isStone ? stoneEquipMinLevel(it.tier) : gearEquipMinLevel(it.rarity);
  const setB = set && SET_BONUSES[it.setId];
  return `<div class="pet-card item-card" style="--rc:${color}">
    <div class="pet-card-art item">${itemArtTileHTML(it, 190, true)}</div>
    <div class="pet-card-body">
      <div class="pet-card-name">${it.name}</div>
      <div class="pet-card-rank">${rankName}</div>
      ${subParts.length ? `<div class="item-card-sub">${subParts.join(' · ')}</div>` : ''}
      <ul class="pet-card-bonuses">${lines.length ? lines.map(l=>`<li>${l}</li>`).join('') : '<li>Sin bonificaciones.</li>'}</ul>
      ${setB ? `<div class="pet-card-unique"><b>Bonos del conjunto (se aplica el más alto)</b>${[2,3,5].filter(k=>setB[k]).map(k=>`<span class="item-card-setline"><i>${k} piezas · ${setB[k].name}</i> ${setB[k].text}</span>`).join('')}</div>` : ''}
      ${minLvl>0 ? `<div class="item-card-sub">Nivel requerido: ${minLvl}</div>` : ''}
    </div>
  </div>`;
}
function showItemZoom(key){
  const it = ITEM_ZOOM_REG.get(key);
  if(!it) return;
  const el = ensurePetZoomLayer();
  if(itemZoomShown === key && el.classList.contains('visible')) return;
  itemZoomShown = key;
  const color = it.potionCard ? POTION_CARD_COLOR : isSoulStoneLike(it) ? (SOUL_TIER_COLORS[it.tier]||'#9a958c') : RARITIES[it.rarity||'comun'].color;
  el.innerHTML = itemCardHTML(it);
  el.style.boxShadow = `0 0 0 3px ${color}, 0 0 34px ${color}99`;
  el.classList.add('visible');
}
(()=>{
  const tileOf = (e)=>{ const t = e.target && e.target.closest ? e.target.closest('[data-item-zoom]') : null; return t && !t.closest('#pet-zoom-preview') ? t : null; };
  document.addEventListener('mouseover', (e)=>{ const t = tileOf(e); if(t) showItemZoom(t.dataset.itemZoom); });
  document.addEventListener('mouseout', (e)=>{ const t = tileOf(e); if(t && !(e.relatedTarget && t.contains(e.relatedTarget))){ itemZoomShown = null; hidePetZoom(); } });
  document.addEventListener('touchstart', (e)=>{ const t = tileOf(e); if(t) showItemZoom(t.dataset.itemZoom); }, {passive:true});
  const end = ()=>{ if(itemZoomShown){ itemZoomShown = null; hidePetZoom(); } };
  document.addEventListener('touchend', end);
  document.addEventListener('touchcancel', end);
})();
// Barras de filtros (.inv-filter-bar): sin la barra de scroll nativa (se veía
// como una franja blanca, pedido 2026-10-03). Se desplazan arrastrando en
// celular y con la rueda del mouse en escritorio, y al elegir un filtro la
// barra redibujada vuelve a donde estaba en vez de saltar al inicio.
document.addEventListener('wheel', (e)=>{
  const bar = e.target && e.target.closest ? e.target.closest('.inv-filter-bar') : null;
  if(!bar || bar.scrollWidth <= bar.clientWidth || Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
  bar.scrollLeft += e.deltaY;
  e.preventDefault();
}, {passive:false});
document.addEventListener('click', (e)=>{
  if(!(e.target && e.target.closest && e.target.closest('.inv-filter-bar'))) return;
  const pos = [...document.querySelectorAll('.inv-filter-bar')].map(b=>b.scrollLeft);
  setTimeout(()=>{ document.querySelectorAll('.inv-filter-bar').forEach((b,i)=>{ if(pos[i]) b.scrollLeft = pos[i]; }); }, 0);
}, true);
function itemArtTileHTML(it, px, noZoom){
  px = px || 36;
  const isStone = isSoulStoneLike(it);
  const color = isStone ? (SOUL_TIER_COLORS[it.tier]||'#9a958c') : RARITIES[it.rarity||'comun'].color;
  const isHighTier = isStone ? ['A','S','SS'].includes(it.tier) : ['rango_a','legendario','ss'].includes(it.rarity);
  const glow = isHighTier ? `, 0 0 10px ${color}66` : '';
  const artImg = isStone ? SOUL_STONE_ART[it.tier] : (weaponArtPath(it) || gearArtPath(it));
  const shape = itemArtShape(it);
  let inner;
  if(artImg){
    const fallbackIcon = isStone ? '💎' : equipIcon(it);
    inner = `<img src="${artImg}" alt="" style="width:100%; height:100%; object-fit:${artImg.includes('/arte/')?'cover':'contain'};" onerror="this.replaceWith(Object.assign(document.createElement('span'),{style:'font-size:${Math.round(px*0.55)}px', textContent:'${fallbackIcon}'}))">`;
  } else if(shape){
    inner = `<svg viewBox="0 0 24 24" width="${Math.round(px*0.62)}" height="${Math.round(px*0.62)}" fill="currentColor">${ITEM_ART_SHAPES[shape]}</svg>`;
  } else {
    inner = `<span style="font-size:${Math.round(px*0.55)}px;">${equipIcon(it)}</span>`;
  }
  const clean = !!artImg && artImg.includes('/arte/');
  return `<div class="item-art-tile ${clean?'clean':''}" ${noZoom ? '' : `data-item-zoom="${registerItemZoom(it)}"`} style="width:${px}px; height:${px}px; color:${color}; --rc:${color}; box-shadow:0 0 0 2px ${color}55 inset${glow};">${inner}</div>`;
}
// Envuelve el tile de ícono + el bloque de texto existente (nombre/pill/
// descripción) en una fila flex — el texto no cambia una letra, solo se le
// suma el ícono al lado.
// Fila compacta para las listas de objetos PROPIOS (mochila, equipado, piedras,
// vender, Hogar) — pedido explícito 2026-10-03: "ya no es necesario poner las
// estadísticas... dejamos solo el nombre", porque ahora salen en la carta al
// pasar el cursor (o mantener presionado). Toda la zona de ícono + nombre
// abre la carta; el botón de la fila no. La tienda (objetos por comprar)
// sigue mostrando las estadísticas escritas.
function itemNameOnlyHTML(it){
  const stone = isSoulStoneLike(it);
  const color = stone ? (SOUL_TIER_COLORS[it.tier]||'var(--text)') : RARITIES[it.rarity||'comun'].color;
  const glow = !stone && ['rango_a','legendario','ss'].includes(it.rarity) ? ` text-shadow:0 0 8px ${color}99;` : '';
  return `<b style="color:${color};${glow}">${it.name}</b>`; // el nombre de las piedras ya incluye su rango: "(E)", "(S)"
}
function itemRowCompact(it, noteHTML){
  return `<div class="item-row-zoom" data-item-zoom="${registerItemZoom(it)}" style="display:flex; align-items:center; gap:10px; min-width:0; flex:1;">${itemArtTileHTML(it, undefined, true)}<div style="min-width:0; flex:1;">${itemNameOnlyHTML(it)}${noteHTML||''}</div></div>`;
}
function itemRowWithArt(it, textHTML, px){
  return `<div style="display:flex; align-items:center; gap:10px; min-width:0; flex:1;">${itemArtTileHTML(it, px)}<div style="min-width:0; flex:1;">${textHTML}</div></div>`;
}
// Arte real de pociones (2026-09-25, pedido explícito) — sin rareza, así que
// el tile usa un anillo neutro (bronce) en vez del color por rango. Mismo
// respaldo de emoji si la imagen no existe.
function potionArtTileHTML(potionId, px){
  px = px || 36;
  const tpl = POTION_TEMPLATES[potionId];
  const clean = POTION_CLEAN_ART.has(potionId);
  const inner = `<img src="src/assets/pociones/arte/${potionId}.jpg?v=1" alt="" style="width:100%; height:100%; object-fit:${clean?'cover':'contain'};" onerror="this.replaceWith(Object.assign(document.createElement('span'),{style:'font-size:${Math.round(px*0.55)}px', textContent:'${tpl.icon}'}))">`;
  return `<div class="item-art-tile ${clean?'clean':''}" style="width:${px}px; height:${px}px; --rc:#3a3128; box-shadow:0 0 0 2px var(--border) inset;">${inner}</div>`;
}
function potionRowWithArt(potionId, textHTML, px){
  // Toda la zona ícono + nombre abre la carta de la poción (2026-10-03).
  return `<div class="item-row-zoom" data-item-zoom="${registerItemZoom({potionCard:potionId})}" style="display:flex; align-items:center; gap:10px; min-width:0; flex:1;">${potionArtTileHTML(potionId, px)}<div style="min-width:0; flex:1;">${textHTML}</div></div>`;
}
// Halo de color por rareza para toda la fila (no solo el nombre) — mismo
// criterio que pedía distinguir de un vistazo un objeto Rango A/Legendario
// del resto sin tener que leer el pill. El degradado se apaga a los ~110px
// para no teñir el botón de Equipar/Vender del otro extremo de la fila.
function rarityRowStyle(it){
  const r = RARITIES[it.rarity||'comun'];
  return rarityRowStyleColor(r.color);
}
// Mismo halo que rarityRowStyle(it), pero a partir de un color crudo — para
// paletas que no viven en RARITIES (ej. PET_RARITIES de los Caídos del
// Laberinto, que usan sus propios 6 rangos y colores).
function rarityRowStyleColor(color){
  return `border-left:3px solid ${color}; background:linear-gradient(90deg, ${color}1f, ${color}00 110px);`;
}
// Aviso visual de loot raro / subida de nivel (2026-09-25, pedido explícito):
// antes la única señal de "te cayó algo bueno" era una línea más en la
// Crónica, igual de discreta que cualquier otro mensaje — un objeto Rango A
// o Legendario pasaba desapercibido hasta abrir el inventario. Un toast
// flotante arriba de la pantalla, con el mismo lenguaje visual del resto del
// juego (Cinzel, bronce, halo dorado), en vez de un sistema de partículas o
// sprite nuevo — no depende de que el objeto tenga arte propio.
function ensureFxLayer(){
  let layer = document.getElementById('fx-toast-layer');
  if(!layer){
    layer = document.createElement('div');
    layer.id = 'fx-toast-layer';
    layer.className = 'fx-toast-layer';
    document.body.appendChild(layer);
  }
  return layer;
}
function spawnFxToast(cls, icon, title, subtitle){
  const layer = ensureFxLayer();
  const el = document.createElement('div');
  el.className = `fx-toast ${cls}`;
  el.innerHTML = `<span class="fx-icon">${icon}</span><span class="fx-text"><b></b>${subtitle?'<span></span>':''}</span>`;
  el.querySelector('b').textContent = title; // textContent, no innerHTML: title puede venir de un nombre de objeto
  if(subtitle) el.querySelector('span').textContent = subtitle;
  layer.appendChild(el);
  const remove = ()=>{ if(el.parentNode) el.remove(); };
  el.addEventListener('animationend', remove);
  setTimeout(remove, 3200); // red de seguridad si prefers-reduced-motion u otra causa se salta animationend
}
function flashRareDrop(item, tierLabel){
  spawnFxToast('rare', item.kind==='soulstone' ? '💎' : equipIcon(item), item.name, `¡Objeto de rango ${tierLabel}!`);
}
function flashLevelUp(level){
  spawnFxToast('levelup', '⭐', `¡Subes a nivel ${level}!`, null);
}

function itemNameHTML(it){
  const r = RARITIES[it.rarity||'comun'];
  // Las armas y el equipo general comprados/generados para una senda
  // específica (Guerrero/Asesino/Arquero/Mago/Sacerdote) llevan su
  // etiqueta aquí — el equipo de botín/cofres sí puede venir sin styleId
  // en casos viejos, en cuyo caso no se muestra ninguna etiqueta. El Arma 1
  // de Mago/Sacerdote comparte catálogo (ver weaponStyleCompatible) — se
  // rotula "Mago / Sacerdote" para no esconder que sirve para los dos.
  // (Desde el 2026-10-02 el Arma 1 de Mago y la de Sacerdote ya no se
  // comparten, así que ya no hace falta el rótulo "Mago / Sacerdote".)
  const roleLabel = SHOP_ROLE_LABELS[it.styleId]||it.styleId;
  const roleTag = it.styleId ? ` <span class="slot-tag" style="border-color:var(--bronze); color:var(--bronze-light);">${roleLabel}</span>` : '';
  // Piezas de conjunto: sin senda (cualquiera puede usarlas), llevan el
  // nombre del conjunto como etiqueta.
  const setTag = it.setId && SET_CATALOG[it.setId] ? ` <span class="slot-tag" style="border-color:#c9a14a; color:#e8c46a;">Conjunto: ${SET_CATALOG[it.setId].name}</span>` : '';
  // Rango A en adelante suma un halo de texto (además del color) — el color
  // solo a veces no basta para que un objeto especial se note al lado del
  // resto de la interfaz, sobre todo en pantallas chicas.
  const glow = ['rango_a','legendario','ss'].includes(it.rarity) ? ` text-shadow:0 0 8px ${r.color}99;` : '';
  return `<b style="color:${r.color};${glow}">${it.name}</b> <span class="slot-tag" style="border-color:${r.color}; color:${r.color};">${r.name}</span>${roleTag}${setTag}`;
}

// Sector de mascotas dentro del Inventario (2026-09-24/25, pedido explícito)
// — rediseñado con espacios explícitos (2026-09-25, "no se da una sensación
// real de equipamiento... similar a las piedras de alma"): arriba, un
// .inv-slot por espacio disponible (igual que soulSlotsHTML), vacío o con
// el Caído puesto y un botón "Quitar" explícito. Debajo, la bolsa de
// Caídos SIN equipar en miniaturas compactas agrupadas por rango (se
// mantiene el pedido original de "que no consuma tanto espacio visual") —
// clic en una miniatura de la bolsa equipa directo al primer espacio libre.
// Pasar el puntero (o mantener presionado en celular) sobre cualquier
// carta la agranda — ver showPetZoom/hidePetZoom.
function renderPetSectionHTML(){
  ensurePets();
  const slots = maxPetSlots();
  const eqIds = equippedPetIds();
  const slotsHTML = Array.from({length:slots}, (_,i)=>{
    const petId = eqIds[i];
    if(!petId){
      return `<div class="inv-slot pet-slot">
        <div class="inv-slot-label">Espacio de Caído ${i+1}</div>
        <div class="inv-empty">— vacío —</div>
      </div>`;
    }
    const tpl = petTpl(petId);
    const r = PET_RARITIES[tpl.rarity];
    return `<div class="inv-slot pet-slot equipped">
      <div class="inv-slot-label">Espacio de Caído ${i+1}</div>
      <div class="inv-item-row" style="margin-bottom:0; ${rarityRowStyleColor(r.color)}">
        <div style="display:flex; align-items:center; gap:10px; min-width:0; flex:1;">
          <div class="pet-slot-thumb" data-pet-zoom="${petId}" style="box-shadow:0 0 0 2px ${r.color}bb;"><img src="${petArtPath(petId)}" alt="${tpl.name}"></div>
          <div style="min-width:0; flex:1;"><b style="color:${r.color};">${tpl.name}</b> <span class="slot-tag" style="border-color:${r.color}; color:${r.color};">${r.name}</span> <span style="color:var(--text-dim); font-size:0.85em;">(${ownedPetCount(petId)})</span></div>
        </div>
        <button class="inv-btn danger" data-pet-unequip="${petId}">Desequipar</button>
      </div>
    </div>`;
  }).join('');

  const bagGroupsHTML = PET_RARITY_ORDER.map(rarity=>{
    const all = PET_CATALOG.filter(p=>p.rarity===rarity);
    const ownedAll = all.filter(p=>ownedPetCount(p.id)>0);
    const bag = ownedAll.filter(p=>!eqIds.includes(p.id));
    if(!ownedAll.length) return '';
    const r = PET_RARITIES[rarity];
    const tiles = bag.map(p=>`
      <div class="pet-bag-cell"><div class="pet-mini-tile" data-pet-zoom="${p.id}" data-pet-equip-bag="${p.id}" title="${p.name} — clic para equipar" style="box-shadow:0 0 0 2px ${r.color}88 inset;">
        <img src="${petArtPath(p.id)}" alt="${p.name}" loading="lazy">
        <span class="pet-equip-hint">+</span>
        <span class="pet-count-badge">(${ownedPetCount(p.id)})</span>
      </div><button class="inv-btn pet-equip-btn" data-pet-equip-bag="${p.id}" ${eqIds.length >= slots ? 'disabled title="No quedan espacios: desequipa uno primero"' : ''}>Equipar</button></div>`).join('');
    if(!bag.length) return ''; // todos los de este rango ya están equipados
    return `<div class="pet-rarity-row">
      <div class="pet-rarity-label" style="color:${r.color};">${r.name} <span style="opacity:0.7;">(${ownedAll.length}/${all.length})</span></div>
      <div class="pet-mini-grid">${tiles}</div>
    </div>`;
  }).join('');

  const ownedTotal = Object.keys(state.char.pets.owned).length;
  return `
    <div class="section-label inv-section-label">🌳 Caídos del Laberinto <span style="font-weight:normal; color:var(--text-dim); font-size:0.8em;">(${eqIds.length}/${slots} equipados · ${ownedTotal}/${PET_CATALOG.length} en colección)</span></div>
    ${slotsHTML}
    ${ownedTotal>eqIds.length ? `<div class="section-label" style="margin-top:10px; font-size:0.85em;">En la mochila</div>${bagGroupsHTML}` : ''}
    ${ownedTotal===0 ? `<p class="inv-empty-msg">Aún no tienes ninguno. Consigue el primero en 🌳 Otorgar ofrenda, en la ciudad.</p>` : ''}
  `;
}

// Pantalla de Personaje (2026-10-02, maqueta aprobada, estilo Shakes &
// Fidget): retrato con ranuras de equipo alrededor, atributos debajo y
// flechas ‹ › para pasar entre tú y tus aliados; a la derecha, pestañas de
// Mochila / Pociones / Piedras / Caídos. Toda la lógica (equipar, quitar,
// engarzar, filtros) es la misma de siempre: solo cambia la distribución.
let invTab = 'mochila';
let invSel = null; // casilla seleccionada en la mochila: uid del objeto o 'potion:<id>'
function renderInventory(){
  const allies = state.char.allies || [];
  const targetRow = equipTarget!=='player' ? allies.find(a=>a.id===equipTarget) : null;
  if(equipTarget!=='player' && !targetRow) equipTarget = 'player'; // el aliado ya no existe (lo despediste, etc.)
  const targetEquip = targetRow ? (targetRow.equip||{}) : state.char.equip;
  const targetName = targetRow ? targetRow.name : 'ti';
  const targetLevel = targetRow ? targetRow.level : state.char.level;

  const targetSelectorHTML = allies.length ? `
    <div class="section-label" style="margin-top:6px;">Equipando a</div>
    <select id="equip-target-select" class="auth-input" style="max-width:260px;">
      <option value="player" ${equipTarget==='player'?'selected':''}>Tú</option>
      ${allies.map(a=>`<option value="${a.id}" ${equipTarget===a.id?'selected':''}>${a.name} (${a.role})</option>`).join('')}
    </select>
  ` : '';

  const gearItems = state.char.inventory.filter(i=>i.kind==='equip');
  const potionItems = state.char.inventory.filter(i=>i.kind==='potion');

  // Filtros por slot: en vez de apilar una subsección por tipo de equipo
  // (Arma, Arma 2, Armadura...) siempre visibles una debajo de otra —lo que
  // hacía crecer mucho el scroll vertical en el móvil a medida que la
  // mochila se llena—, una barra horizontal de chips elige qué categoría
  // mostrar. "Todos" mantiene el listado completo de siempre.
  const gearSlotsPresent = EQUIP_SLOTS.filter(slot=> gearItems.some(it=>it.slot===slot));
  if(invGearFilter!=='todos' && !gearSlotsPresent.includes(invGearFilter)) invGearFilter = 'todos';
  const gearFilterHTML = gearItems.length ? `<div class="inv-filter-bar">
    <button class="nav-btn ${invGearFilter==='todos'?'active':''}" data-gearfilter="todos">Todos</button>
    ${gearSlotsPresent.map(slot=>`<button class="nav-btn ${invGearFilter===slot?'active':''}" data-gearfilter="${slot}">${slotLabel(slot)}</button>`).join('')}
  </div>` : '';
  // Filtro por rango (2026-09-25, pedido explícito: "Filtros tambien para
  // el tema del inventario... tambien pon las Tier ahi") — misma barra de
  // chips, ahora una segunda fila para el rango en vez del slot.
  const gearTiersPresent = Object.keys(RARITIES).filter(rk=> gearItems.some(it=>(it.rarity||'comun')===rk));
  if(invGearTierFilter!=='todos' && !gearTiersPresent.includes(invGearTierFilter)) invGearTierFilter = 'todos';
  const gearTierFilterHTML = ''; // ahora va como desplegable junto al de senda (ver gearSelectsHTML)
  // Filtro por senda (2026-09-26, pedido explícito: "en el inventario
  // tambien coloca por clase como filtro") — mismo patrón, tercera fila.
  // 2026-10-02: desde que el equipo general son piezas de CONJUNTO (sin
  // senda), este filtro también lista los conjuntos presentes ("set:<id>") —
  // antes esas piezas no aparecían en ninguna opción salvo "Todas".
  const gearClassesPresent = Object.keys(SHOP_ROLE_LABELS).filter(cid=> gearItems.some(it=>it.styleId===cid))
    .concat(SET_IDS.filter(id=> gearItems.some(it=>it.setId===id)).map(id=>'set:'+id));
  if(invGearClassFilter!=='todos' && !gearClassesPresent.includes(invGearClassFilter)) invGearClassFilter = 'todos';
  const gearClassLabel = (cid)=> cid.startsWith('set:') ? 'Conjunto: '+SET_CATALOG[cid.slice(4)].name : SHOP_ROLE_LABELS[cid];
  const gearClassFilterHTML = '';
  const gearSelectsHTML = (gearTiersPresent.length>1 || gearClassesPresent.length>=1) ? `<div class="bag-selects">
    ${gearTiersPresent.length>1 ? `<select class="auth-input" id="bag-tier-select">
      <option value="todos">Todos los rangos</option>
      ${gearTiersPresent.map(rk=>`<option value="${rk}" ${invGearTierFilter===rk?'selected':''}>${RARITIES[rk].name}</option>`).join('')}
    </select>` : ''}
    ${gearClassesPresent.length>=1 ? `<select class="auth-input" id="bag-class-select">
      <option value="todos">Todas las sendas y conjuntos</option>
      ${gearClassesPresent.map(cid=>`<option value="${cid}" ${invGearClassFilter===cid?'selected':''}>${gearClassLabel(cid)}</option>`).join('')}
    </select>` : ''}
  </div>` : '';
  // Mochila en cuadrícula (rediseño 2026-10-04, pedido: "hacer la interfaz más
  // bonita"): cada objeto es una casilla con su arte y el color de su rango.
  // Al tocar una casilla se selecciona y debajo sale su detalle con lo que
  // llevas puesto en esa ranura y el botón de equipar. La carta al pasar el
  // cursor sigue funcionando para un vistazo rápido.
  const rarityIdx = (it)=> Object.keys(RARITIES).indexOf(it.rarity||'comun');
  const gearShown = gearItems.filter(it=> (invGearFilter==='todos' || it.slot===invGearFilter)
      && (invGearTierFilter==='todos' || (it.rarity||'comun')===invGearTierFilter)
      && (invGearClassFilter==='todos' || (invGearClassFilter.startsWith('set:') ? it.setId===invGearClassFilter.slice(4) : it.styleId===invGearClassFilter)))
    .sort((a,b)=> (EQUIP_SLOTS.indexOf(a.slot)-EQUIP_SLOTS.indexOf(b.slot)) || (rarityIdx(b)-rarityIdx(a)));
  const selGear = gearShown.find(it=>it.uid===invSel) || null;
  const gearDetailHTML = (it)=>{
    const r = RARITIES[it.rarity||'comun'];
    const minLvl = gearEquipMinLevel(it.rarity);
    const levelBlocked = minLvl>0 && targetLevel<minLvl;
    const worn = targetEquip[it.slot];
    const sub = [slotLabel(it.slot), it.styleId ? (SHOP_ROLE_LABELS[it.styleId]||it.styleId) : null, it.setId && SET_CATALOG[it.setId] ? 'Conjunto: '+SET_CATALOG[it.setId].name : null].filter(Boolean).join(' · ');
    const lines = itemBonusLines(it);
    return `<div class="bag-detail" style="--rc:${r.color}">
      <div class="bag-detail-head">${itemArtTileHTML(it, 60, true)}
        <div><b style="color:${r.color}">${it.name}</b><small>${r.name} · ${sub}</small></div></div>
      <ul class="pet-card-bonuses">${lines.length ? lines.map(l=>`<li>${l}</li>`).join('') : '<li>Sin bonificaciones.</li>'}</ul>
      <div class="bag-worn">${worn ? `Llevas puesto: <b style="color:${RARITIES[worn.rarity||'comun'].color}">${worn.name}</b> — ${itemBonusText(worn) || 'sin bonificaciones.'}` : 'No llevas nada en esa ranura.'}</div>
      ${levelBlocked ? `<div class="bag-worn" style="color:var(--blood-light);">Nivel requerido: ${minLvl}</div>` : ''}
      <button class="btn-main" data-equip="${it.uid}" ${levelBlocked?'disabled':''}>Equipar en ${targetName}</button>
    </div>`;
  };
  const gearHTML = gearItems.length ? (gearShown.length ? `
    <div class="bag-grid">${gearShown.map(it=>{
      const minLvl = gearEquipMinLevel(it.rarity);
      const blocked = minLvl>0 && targetLevel<minLvl;
      return `<button class="bag-tile ${it.uid===invSel?'sel':''} ${blocked?'blocked':''}" data-bag-sel="${it.uid}" style="--rc:${RARITIES[it.rarity||'comun'].color}">${itemArtTileHTML(it, 54)}${blocked?'<i class="bag-lock">🔒</i>':''}</button>`;
    }).join('')}</div>
    ${selGear ? gearDetailHTML(selGear) : '<p class="bag-hint">Toca un objeto para ver su detalle y equiparlo.</p>'}`
    : `<p class="inv-empty-msg">No hay equipo con ese filtro.</p>`) : `<p class="inv-empty-msg">No llevas equipo suelto en la mochila.</p>`;

  const selPotion = potionItems.find(it=>'potion:'+it.potionId===invSel) || null;
  const potionHTML = potionItems.length ? `
    <div class="bag-grid">${potionItems.map(it=>`<button class="bag-tile ${'potion:'+it.potionId===invSel?'sel':''}" data-bag-sel="potion:${it.potionId}" style="--rc:#b8934a">${potionArtTileHTML(it.potionId, 54)}<i class="bag-qty">x${it.qty}</i></button>`).join('')}</div>
    ${selPotion ? `<div class="bag-detail" style="--rc:#b8934a">
      <div class="bag-detail-head">${potionArtTileHTML(selPotion.potionId, 60)}
        <div><b>${POTION_TEMPLATES[selPotion.potionId].name}</b><small>Poción · tienes ${selPotion.qty}</small></div></div>
      <ul class="pet-card-bonuses"><li>${POTION_TEMPLATES[selPotion.potionId].desc}</li></ul>
      <button class="btn-main" data-usepotion="${selPotion.potionId}">Usar</button>
    </div>` : '<p class="bag-hint">Toca una poción para ver qué hace y usarla.</p>'}`
    : `<p class="inv-empty-msg">No tienes pociones. Búscalas en cofres del laberinto.</p>`;

  ensureSoulSlots();
  // Piedras de alma: el jugador usa state.char.soulSlots (crece con el
  // nivel, ver maxSoulSlots); un aliado usa row.soul_slots (fijo en
  // ALLY_SOUL_SLOTS_MAX, sin restricción de familia — pedido explícito
  // 2026-09-24). Mismo panel para los dos, solo cambia la fuente de datos y
  // a qué función apunta cada botón.
  const isAllyTargetForStones = targetRow !== null;
  let allySoulSlots = null;
  if(isAllyTargetForStones){
    if(!targetRow.soul_slots) targetRow.soul_slots = [];
    while(targetRow.soul_slots.length < ALLY_SOUL_SLOTS_MAX) targetRow.soul_slots.push(null);
    allySoulSlots = targetRow.soul_slots;
  }
  const soulSlotsSource = isAllyTargetForStones ? allySoulSlots : state.char.soulSlots;
  const soulSlotsEmptyMsg = isAllyTargetForStones
    ? `<p class="inv-empty-msg">${targetName} no tiene piedras engarzadas todavía.</p>`
    : `<p class="inv-empty-msg">Alcanza el nivel 10 para desbloquear tu primer espacio de alma.</p>`;
  const soulSlotsHTML = soulSlotsSource.length ? soulSlotsSource.map((stone, idx)=>{
    if(!stone){
      return `<div class="inv-slot">
        <div class="inv-slot-label">Espacio de alma ${idx+1}</div>
        <div class="inv-empty">— vacío —</div>
      </div>`;
    }
    const c = SOUL_TIER_COLORS[stone.tier] || 'var(--text)';
    const unsocketAttr = isAllyTargetForStones ? `data-unsocket-ally="${idx}|${targetRow.id}"` : `data-unsocket="${idx}"`;
    return `<div class="inv-slot">
      <div class="inv-slot-label">Espacio de alma ${idx+1}</div>
      <div class="inv-item-row" style="margin-bottom:0;">
        ${itemRowCompact(stone)}
        <button class="inv-btn danger" ${unsocketAttr}>Retirar</button>
      </div>
    </div>`;
  }).join('') : soulSlotsEmptyMsg;

  const stoneItems = state.char.inventory.filter(i=>i.kind==='soulstone');
  // Filtro por rango (2026-09-25, pedido explícito) — mismo patrón de chips
  // que el equipo, ahora por letra E-SS en vez de rareza de gema.
  const stoneTiersPresent = ['F','E','D','C','B','A','S','SS'].filter(t=> stoneItems.some(it=>it.tier===t));
  if(invStoneTierFilter!=='todos' && !stoneTiersPresent.includes(invStoneTierFilter)) invStoneTierFilter = 'todos';
  const stoneTierFilterHTML = stoneTiersPresent.length>1 ? `<div class="inv-filter-bar">
    <button class="nav-btn ${invStoneTierFilter==='todos'?'active':''}" data-stonetierfilter="todos">Todos los rangos</button>
    ${stoneTiersPresent.map(t=>`<button class="nav-btn ${invStoneTierFilter===t?'active':''}" data-stonetierfilter="${t}" style="${invStoneTierFilter===t?`border-color:${SOUL_TIER_COLORS[t]}; color:${SOUL_TIER_COLORS[t]};`:''}">${t}</button>`).join('')}
  </div>` : '';
  const stoneItemsFiltered = invStoneTierFilter==='todos' ? stoneItems : stoneItems.filter(it=>it.tier===invStoneTierFilter);
  const stoneInfo = (it)=>{
    const sameFamily = soulSlotsSource.find(st=>st && st.family===it.family);
    const noRoom = soulSlotsSource.length===0 || soulSlotsSource.every(st=>st);
    const minLvl = stoneEquipMinLevel(it.tier);
    const levelBlocked = minLvl>0 && targetLevel<minLvl;
    return {sameFamily, minLvl, levelBlocked, blocked: (sameFamily ? soulTierIdx(it.tier) < soulTierIdx(sameFamily.tier) : noRoom) || levelBlocked};
  };
  const selStone = stoneItemsFiltered.find(it=>it.uid===invSel) || null;
  const stoneBagHTML = stoneItemsFiltered.length ? `
    <div class="bag-grid">${stoneItemsFiltered.map(it=>{
      const info = stoneInfo(it);
      return `<button class="bag-tile ${it.uid===invSel?'sel':''} ${info.blocked?'blocked':''}" data-bag-sel="${it.uid}" style="--rc:${SOUL_TIER_COLORS[it.tier]||'#9a958c'}">${itemArtTileHTML(it, 54)}${info.levelBlocked?'<i class="bag-lock">🔒</i>':''}</button>`;
    }).join('')}</div>
    ${selStone ? (()=>{
      const it = selStone, info = stoneInfo(it), c = SOUL_TIER_COLORS[it.tier] || 'var(--text)';
      const socketAttr = isAllyTargetForStones ? `data-socket-ally="${it.uid}|${targetRow.id}"` : `data-socket="${it.uid}"`;
      return `<div class="bag-detail" style="--rc:${c}">
        <div class="bag-detail-head">${itemArtTileHTML(it, 60, true)}
          <div><b style="color:${c}">${it.name}</b><small>Piedra de alma · rango ${it.tier}</small></div></div>
        <ul class="pet-card-bonuses"><li>${it.desc}</li></ul>
        ${info.sameFamily ? `<div class="bag-worn">Ya llevas una de esta familia: <b>${info.sameFamily.name}</b>. Se reemplazará.</div>` : ''}
        ${info.levelBlocked ? `<div class="bag-worn" style="color:var(--blood-light);">Nivel requerido: ${info.minLvl}</div>` : ''}
        <button class="btn-main" ${socketAttr} ${info.blocked?'disabled':''}>${info.sameFamily ? 'Reemplazar' : 'Engarzar'} en ${targetName}</button>
      </div>`;
    })() : '<p class="bag-hint">Toca una piedra para ver su detalle y engarzarla.</p>'}`
    : (stoneItems.length ? `<p class="inv-empty-msg">No hay piedras con ese filtro.</p>` : `<p class="inv-empty-msg">No tienes piedras de alma. Las dejan caer los guardianes de nivel 4 en adelante.</p>`);

  const fragmentItems = state.char.inventory.filter(i=>i.kind==='fragmento');
  const fragmentHTML = fragmentItems.length ? `<div class="inv-item-row" style="flex-wrap:wrap; gap:8px;">
    ${fragmentItems.map(it=>`<span class="slot-tag" style="border-color:var(--bronze); color:var(--bronze-light);">${it.icon} ${it.name} x${it.qty}</span>`).join('')}
  </div>` : '';
  const fragmentSection = fragmentItems.length ? `
    <div class="section-label">Fragmentos de jefe de década</div>
    <p style="color:var(--text-dim); font-size:0.82em; margin-top:0;">Ingredientes de la Forja Legendaria (Tienda, piso 40+). Uno garantizado por cada jefe de década derrotado.</p>
    ${fragmentHTML}
  ` : '';

  // ---------- Retrato + ranuras (estilo S&F) ----------
  const targets = ['player'].concat(allies.map(a=>a.id));
  const tIdx = Math.max(0, targets.indexOf(equipTarget));
  const plainText = (h)=> String(h||'').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim();
  const slotTile = (slot)=>{
    const it = targetEquip[slot];
    const label = slotLabel(slot);
    if(!it) return `<div class="pj-slot empty" title="${label}: vacío"><span>${label}</span></div>`;
    const r = RARITIES[it.rarity||'comun'];
    return `<div class="pj-slot" data-unequip="${slot}" title="Clic para quitar" style="--rc:${r.color}">
      ${itemArtTileHTML(it, 68)}<span class="pj-rank">${r.name}</span></div>`;
  };
  const stoneTiles = soulSlotsSource.map((stone, idx)=>{
    if(!stone) return `<div class="pj-stone empty" title="Espacio de alma ${idx+1}: vacío"></div>`;
    const c = SOUL_TIER_COLORS[stone.tier] || 'var(--text)';
    const attr = isAllyTargetForStones ? `data-unsocket-ally="${idx}|${targetRow.id}"` : `data-unsocket="${idx}"`;
    return `<div class="pj-stone" ${attr} title="${plainText(stone.name)} (${stone.tier}). Clic para retirar." style="--rc:${c}">${itemArtTileHTML(stone, 40)}</div>`;
  }).join('');
  let portraitHTML, plateSub, attrsHTML;
  if(targetRow){
    const ca = makeCombatAlly(targetRow);
    const tplA = ALLY_ROSTER.find(t=>t.templateId===targetRow.template_id) || {};
    // Sprite de combate del aliado, como el del jugador; si alguno no
    // tuviera, cae a su ilustración.
    const allySprite = ALLY_TEMPLATE_SPRITES[targetRow.template_id];
    portraitHTML = allySprite
      ? `<img class="pj-sprite" src="${allySprite}" alt="">`
      : `<img class="pj-ally-art" src="src/assets/aliados/${targetRow.template_id}.jpg" alt="" onerror="this.replaceWith('${tplA.icon||'🛡️'}')">`;
    plateSub = `Aliado · ${targetRow.role || tplA.role || ''} · Nivel ${targetRow.level||1}`;
    attrsHTML = [
      ['Ataque','Daño por golpe', ca.atk], ['Vida','Puntos de vida', ca.maxHP], ['MP','Maná', ca.maxMP],
      ['Res. física','Reducción de daño', (ca.res.fisico||0)+'%'], ['Posición', tplA.frontline?'Absorbe golpes':'Ataca desde atrás', tplA.frontline?'Frente':'Retaguardia'],
      ['Habilidad', tplA.skillName||'—', '★']
    ].map(([k,sub,v])=>`<div class="pj-attr"><div><b>${k}</b><small>${sub}</small></div><span>${v}</span></div>`).join('');
  } else {
    const d = derived();
    portraitHTML = `<img class="pj-sprite" src="${playerIllustrationFor(state.char.style, state.char.race)||''}" alt="">`;
    plateSub = `${race().name} · ${style().name} · Nivel ${state.char.level}`;
    attrsHTML = [
      ['Físico','Daño físico', d.fis], ['Espíritu','Espíritu y curación', d.esp], ['Habilidad','MP y magia', d.hab],
      ['Agilidad','Crítico y evasión', d.agi], ['Vigor','Vida', d.vig], ['Vida','Puntos de vida', d.maxHP],
      ['MP','Maná', d.maxSta], ['Espíritu máx.','Recurso de habilidades', d.maxSpi]
    ].map(([k,sub,v])=>`<div class="pj-attr"><div><b>${k}</b><small>${sub}</small></div><span>${v}</span></div>`).join('');
  }
  // Capacidad de la mochila, bajo los atributos (2026-10-04: en la cabecera
  // pasaba inadvertida). El aviso de venta automática solo sale cerca del tope.
  const bagCount = state.char.inventory.length, bagNear = bagCount >= INVENTORY_CAP - 10;
  const bagMeterHTML = `
    <div class="pj-bag ${bagNear ? 'near' : ''}">
      <div class="pj-bag-top"><b>🎒 Mochila</b><span>${bagCount} / ${INVENTORY_CAP}</span></div>
      <div class="bar-track"><div class="pj-bag-fill" style="width:${Math.min(100, bagCount/INVENTORY_CAP*100)}%"></div></div>
      ${bagNear ? '<p>⚠ Si excedes el límite, cualquier equipamiento se venderá automáticamente.</p>' : ''}
    </div>`;
  const dollHTML = `
    <div class="pj-who">
      <button class="pj-arrow" id="pj-prev" ${targets.length<2?'disabled':''} title="Anterior">‹</button>
      <div class="pj-who-txt"><b>${targetRow ? targetRow.name : state.char.nickname}</b><span>${plateSub}</span>
        <div class="pj-dots">${targets.map((t,i)=>`<i class="${i===tIdx?'on':''}"></i>`).join('')}</div></div>
      <button class="pj-arrow" id="pj-next" ${targets.length<2?'disabled':''} title="Siguiente">›</button>
    </div>
    <div class="pj-doll">
      <div class="pj-col">${slotTile('casco')}${slotTile('armadura')}${slotTile('guantes')}</div>
      <div class="pj-center">
        <div class="pj-portrait">${portraitHTML}</div>
        <div class="pj-weapons">${slotTile('arma')}${slotTile('arma2')}</div>
      </div>
      <div class="pj-col">${slotTile('amuleto')}${slotTile('botas')}</div>
    </div>
    ${soulSlotsSource.length ? `<div class="pj-stones-row"><span>Piedras de alma</span>${stoneTiles}</div>` : ''}
    <div class="pj-attrs">${attrsHTML}</div>
    ${bagMeterHTML}`; // el "Detalle del equipo" se quitó (2026-10-04): cada ranura ya muestra su carta
  // Lo que lleva puesto, con su botón de Desequipar (2026-10-07, pedido
  // explícito: tocar la ranura del retrato ya lo quitaba, pero nada lo decía).
  const wornSlots = EQUIP_SLOTS.filter(slot=> targetEquip[slot]);
  const wornHTML = wornSlots.length ? `<div class="worn-box"><div class="section-label inv-section-label">Equipado en ${targetRow ? targetRow.name : 'tu personaje'}</div>
    ${wornSlots.map(slot=>{ const it = targetEquip[slot], r = RARITIES[it.rarity||'comun'];
      return `<div class="worn-row" style="--rc:${r.color}">${itemArtTileHTML(it, 38)}<div><b style="color:${r.color}">${it.name}</b><small>${slotLabel(slot)} · ${r.name}</small></div><button class="inv-btn danger" data-unequip="${slot}">Desequipar</button></div>`;
    }).join('')}</div>` : '';
  const tabs = [['mochila','🎒 Mochila'],['pociones','🧪 Pociones'],['piedras','💎 Piedras']].concat(targetRow ? [] : [['caidos','🐾 Caídos']]);
  if(!tabs.some(t=>t[0]===invTab)) invTab = 'mochila';
  const tabBody = invTab==='pociones' ? potionHTML
    : invTab==='piedras' ? `${soulSlotsHTML}${stoneTierFilterHTML}${stoneBagHTML}${fragmentSection}`
    : invTab==='caidos' ? renderPetSectionHTML()
    : `${wornHTML}${gearFilterHTML}${gearSelectsHTML}${gearHTML}`;
  document.getElementById('main-panel').innerHTML = `
    <div style="display:flex; align-items:center; justify-content:space-between; gap:10px; margin-bottom:6px;">
      <h3 style="color:var(--bronze-light);">Personaje e inventario</h3>
      <button class="reset-btn" id="btn-close-inv">Cerrar</button>
    </div>
    <div class="pj-layout">
      <div class="pj-left">${dollHTML}</div>
      <div class="pj-right">
        <div class="pj-tabs">${tabs.map(([k,l])=>`<button class="${invTab===k?'on':''}" data-invtab="${k}">${l}</button>`).join('')}</div>
        <div class="pj-hint">Equipando a <b>${targetName}</b>. La mochila es una sola para ti y tus aliados.</div>
        <div class="pj-tab-body">${tabBody}</div>
      </div>
    </div>
  `;
  const goTarget = (delta)=>{ equipTarget = targets[(tIdx + delta + targets.length) % targets.length]; renderInventory(); };
  const pjPrev = document.getElementById('pj-prev'), pjNext = document.getElementById('pj-next');
  if(pjPrev) pjPrev.onclick = ()=> goTarget(-1);
  if(pjNext) pjNext.onclick = ()=> goTarget(1);
  document.querySelectorAll('[data-invtab]').forEach(b=>{ b.onclick = ()=>{ invTab = b.dataset.invtab; invSel = null; renderInventory(); }; });
  document.querySelectorAll('[data-bag-sel]').forEach(b=>{ b.onclick = ()=>{ invSel = invSel===b.dataset.bagSel ? null : b.dataset.bagSel; hidePetZoom(); renderInventory(); }; });
  const bagTierSel = document.getElementById('bag-tier-select');
  if(bagTierSel) bagTierSel.onchange = ()=>{ invGearTierFilter = bagTierSel.value; renderInventory(); };
  const bagClassSel = document.getElementById('bag-class-select');
  if(bagClassSel) bagClassSel.onchange = ()=>{ invGearClassFilter = bagClassSel.value; renderInventory(); };
  document.getElementById('btn-close-inv').onclick = ()=>{ invOpen=false; renderAll(); };
  document.querySelectorAll('[data-pet-unequip]').forEach(el=>{
    el.onclick = ()=>{ togglePetEquip(el.dataset.petUnequip); renderSheet(); renderInventory(); save(); };
  });
  document.querySelectorAll('[data-pet-equip-bag]').forEach(el=>{
    el.onclick = ()=>{
      const ok = togglePetEquip(el.dataset.petEquipBag);
      if(ok){ renderSheet(); renderInventory(); save(); }
    };
  });
  wirePetZoomEvents(document.getElementById('main-panel'));
  const targetSelect = document.getElementById('equip-target-select');
  if(targetSelect) targetSelect.onchange = ()=>{ equipTarget = targetSelect.value; renderInventory(); };
  document.querySelectorAll('[data-gearfilter]').forEach(btn=>{
    btn.onclick = ()=>{ invGearFilter = btn.dataset.gearfilter; renderInventory(); };
  });
  document.querySelectorAll('[data-geartierfilter]').forEach(btn=>{
    btn.onclick = ()=>{ invGearTierFilter = btn.dataset.geartierfilter; renderInventory(); };
  });
  document.querySelectorAll('[data-gearclassfilter]').forEach(btn=>{
    btn.onclick = ()=>{ invGearClassFilter = btn.dataset.gearclassfilter; renderInventory(); };
  });
  document.querySelectorAll('[data-stonetierfilter]').forEach(btn=>{
    btn.onclick = ()=>{ invStoneTierFilter = btn.dataset.stonetierfilter; renderInventory(); };
  });
  document.querySelectorAll('[data-equip]').forEach(btn=>{
    btn.onclick = ()=> equipTarget==='player' ? equipItem(btn.dataset.equip) : equipItemOnAlly(btn.dataset.equip, equipTarget);
  });
  document.querySelectorAll('[data-unequip]').forEach(btn=>{
    btn.onclick = ()=> equipTarget==='player' ? unequipItem(btn.dataset.unequip) : unequipAllyItem(equipTarget, btn.dataset.unequip);
  });
  document.querySelectorAll('[data-usepotion]').forEach(btn=>{
    btn.onclick = ()=> usePotionOutOfCombat(btn.dataset.usepotion);
  });
  document.querySelectorAll('[data-socket]').forEach(btn=>{
    btn.onclick = ()=> socketStone(btn.dataset.socket);
  });
  document.querySelectorAll('[data-unsocket]').forEach(btn=>{
    btn.onclick = ()=> unsocketStone(parseInt(btn.dataset.unsocket));
  });
  document.querySelectorAll('[data-socket-ally]').forEach(btn=>{
    btn.onclick = ()=>{
      const [uid, allyId] = btn.dataset.socketAlly.split('|');
      socketStoneOnAlly(uid, allyId);
    };
  });
  document.querySelectorAll('[data-unsocket-ally]').forEach(btn=>{
    btn.onclick = ()=>{
      const [idx, allyId] = btn.dataset.unsocketAlly.split('|');
      unsocketAllyStone(allyId, parseInt(idx));
    };
  });
}

// Tope de la mochila. La base rechaza el guardado ENTERO si inventory pasa de
// 250 objetos (validate_character_update: "inventory inválido o demasiado
// grande"), y el cliente no tenía ningún tope: bug real 2026-10-04, un
// personaje que farmeó horas sin morir ni vender llegó a 251 y desde ahí no se
// guardó nada más (perdió 12 niveles al recargar). Ahora, con la mochila
// llena, se vende solo el objeto de menor valor (el que entra, si es el peor).
// El tope sube a 500 con la migración 0033; si la base aún tiene el de 250
// (SQL sin correr), el primer rechazo baja el tope de esta sesión a 250.
let INVENTORY_CAP = 500;
const INVENTORY_CAP_OLD = 250;
// Qué tan prescindible es un objeto: primero manda el rango (nunca se vende
// uno raro habiendo uno común), después su valor de venta.
const STONE_TIER_ORDER = ['E','F','D','C','B','A','S','SS'];
function inventoryKeepScore(item){
  const rank = item.kind==='soulstone' ? STONE_TIER_ORDER.indexOf(item.tier) : Object.keys(RARITIES).indexOf(item.rarity||'comun');
  return Math.max(0, rank)*100000 + itemSellValue(item);
}
function leastValuableInInventory(){
  return state.char.inventory.filter(i=> i.kind==='equip' || i.kind==='soulstone')
    .reduce((a, b)=> a && inventoryKeepScore(a) <= inventoryKeepScore(b) ? a : b, null);
}
function makeRoomInInventory(incoming){
  if(state.char.inventory.length < INVENTORY_CAP) return true;
  const worst = leastValuableInInventory();
  const inValue = itemSellValue(incoming);
  const stackable = incoming.kind==='potion' || incoming.kind==='fragmento';
  if(!worst || (!stackable && inventoryKeepScore(incoming) <= inventoryKeepScore(worst))){
    state.char.gold += inValue;
    log(`No cabe nada más en la mochila (${INVENTORY_CAP} objetos): <b>${incoming.name||'el objeto'}</b> se vendió solo por ${inValue} de oro. Vende o guarda objetos en el Hogar.`);
    return false;
  }
  const value = itemSellValue(worst);
  state.char.inventory = state.char.inventory.filter(i=> i!==worst);
  state.char.gold += value;
  log(`No cabe nada más en la mochila (${INVENTORY_CAP} objetos): para hacer sitio se vendió <b>${worst.name}</b> por ${value} de oro. Vende o guarda objetos en el Hogar.`);
  return true;
}
function addToInventory(item){
  // Objetos generados antes del retiro del equipo por senda (ej. la
  // recompensa ya guardada de una misión) se convierten al entrar.
  // Se reescribe el MISMO objeto (los llamadores siguen usando su referencia).
  if(item && item.kind==='equip'){
    const fresh = refreshGearFromTemplate(item);
    if(fresh !== item){ Object.keys(item).forEach(k=> delete item[k]); Object.assign(item, fresh); }
  }
  if(item.kind==='potion'){
    const existing = state.char.inventory.find(i=>i.kind==='potion' && i.potionId===item.potionId);
    if(existing) existing.qty += 1;
    else if(makeRoomInInventory(item)) state.char.inventory.push({kind:'potion', potionId:item.potionId, qty:1});
  } else if(item.kind==='fragmento'){
    const existing = state.char.inventory.find(i=>i.kind==='fragmento' && i.fragId===item.fragId);
    if(existing) existing.qty += 1;
    else if(makeRoomInInventory(item)) state.char.inventory.push({kind:'fragmento', fragId:item.fragId, name:item.name, icon:item.icon, qty:1});
  } else if(item.kind==='soulstone'){
    if(!makeRoomInInventory(item)) return;
    state.char.itemCounter = (state.char.itemCounter||0) + 1;
    item.uid = 'it'+state.char.itemCounter;
    state.char.inventory.push(item);
  } else {
    item.kind = 'equip';
    if(!makeRoomInInventory(item)) return;
    state.char.itemCounter = (state.char.itemCounter||0) + 1;
    item.uid = 'it'+state.char.itemCounter;
    state.char.inventory.push(item);
  }
}
// El equipo inicial (grantStarterKit) y el equipo automático de Sacerdote
// (grantAllyAutoGear) se asignan directo a un slot equipado sin pasar por
// addToInventory, así que nunca reciben un uid al crearse. Si más tarde
// vuelven a la mochila (al desequiparlos a mano, al REEMPLAZARLOS por otro
// equipo — el camino más común, no solo "Quitar" — o al perder el
// requisito de nivel) necesitan uno recién ahí, o quedan en la mochila sin
// poder venderse ni guardarse en el Hogar (esos botones dependen de it.uid
// para encontrarlo). Bug real reportado 2026-09-27: "el equipamiento
// inicial no se puede vender" — pasaba sobre todo al reemplazarlo, ya que
// equipItem()/equipItemOnAlly() empujaban el `prior` a la mochila sin
// pasar por este chequeo.
function ensureItemUid(item){
  if(!item.uid){
    state.char.itemCounter = (state.char.itemCounter||0) + 1;
    item.uid = 'it'+state.char.itemCounter;
  }
  return item;
}

// Repara TODO el equipo/piedras del personaje (mochila, Hogar, equipado y el
// de sus aliados): asigna uid a lo que no tiene y REEMPLAZA el uid de
// cualquier objeto que lo repita con otro — sin un uid único, "Guardar en
// Hogar"/"Vender" no encuentran el objeto correcto (o ninguno). Pedido
// explícito 2026-09-28 tras seguir viendo equipo inicial y de Sacerdotes que
// no se podía guardar. También sube itemCounter por encima del uid más alto
// ya usado, para que los objetos nuevos nunca choquen con los existentes.
// Devuelve {changed, allyRows}: allyRows son los aliados cuyo equipo cambió y
// hay que volver a guardar en su propia tabla.
function normalizeItemUids(){
  const all = [];
  const collect = (it, row)=>{ if(it && (it.kind==='equip' || it.kind==='soulstone')) all.push({it, row}); };
  (state.char.inventory||[]).forEach(it=>collect(it, null));
  ((state.char.stash||{}).items||[]).forEach(it=>collect(it, null));
  EQUIP_SLOTS.forEach(slot=> collect((state.char.equip||{})[slot], null));
  (state.char.soulSlots||[]).forEach(it=>collect(it, null));
  (state.char.allies||[]).forEach(a=>{
    Object.values(a.equip||{}).forEach(it=>collect(it, a));
    (a.soul_slots||[]).forEach(it=>collect(it, a));
  });
  let max = 0;
  all.forEach(({it})=>{ const m = /^it(\d+)$/.exec(it.uid||''); if(m) max = Math.max(max, +m[1]); });
  if((state.char.itemCounter||0) < max) state.char.itemCounter = max;
  const seen = new Set();
  const allyRows = new Set();
  let changed = false;
  all.forEach(({it, row})=>{
    if(!it.uid || seen.has(it.uid)){
      delete it.uid;
      ensureItemUid(it);
      changed = true;
      if(row) allyRows.add(row);
    }
    seen.add(it.uid);
  });
  return {changed, allyRows};
}

// Mago y Sacerdote comparten el Arma 1 (MAGO_ARMA1 en WEAPON_CATALOG) — un
// arma con styleId 'mago' en el slot 'arma' debe poder equiparse en
// cualquiera de los dos, y viceversa (pedido explícito 2026-09-27: al
// quitarse el drop aleatorio de armas de Sacerdote, un aliado Sacerdote se
// quedó sin ninguna forma de conseguir un Arma 1 de Rango B en adelante,
// porque toda Arma 1 de Mago que cae tiene styleId 'mago' y el chequeo de
// senda la rechazaba). El Arma 2 (Foco arcano vs. Grimorio) sigue siendo
// exclusiva de cada uno — la excepción es solo para el slot 'arma'.
// 2026-10-02: la excepción anterior se quitó — Mago (Habilidad) y Sacerdote
// (Espíritu) ya no comparten Arma 1, cada uno tiene la suya. Un arma de Mago
// que un aliado Sacerdote ya tuviera EQUIPADA se queda donde está (no se
// revalida al cargar), solo deja de poder equiparse una nueva.
function weaponStyleCompatible(itemStyleId, wearerStyleId, slot){
  if(!itemStyleId) return true;
  return itemStyleId === wearerStyleId;
}
function equipItem(uid){
  const idx = state.char.inventory.findIndex(i=>i.kind==='equip' && i.uid===uid);
  if(idx<0) return;
  const item = state.char.inventory[idx];
  if(!weaponStyleCompatible(item.styleId, state.char.style, item.slot)){
    log(`<b>${item.name}</b> es un arma de ${SHOP_ROLE_LABELS[item.styleId]||item.styleId} — tu senda no puede usarla.`);
    return;
  }
  if(!meetsGearEquipLevel(item, state.char.level)){
    log(`<b>${item.name}</b> requiere nivel ${gearEquipMinLevel(item.rarity)} para equiparse.`);
    return;
  }
  const prior = state.char.equip[item.slot];
  state.char.equip[item.slot] = item;
  state.char.inventory.splice(idx,1);
  if(prior) state.char.inventory.push(ensureItemUid(prior));
  log(`Equipas <b>${item.name}</b>${prior ? ` (guardas ${prior.name} en la mochila)` : ''}.`);
  renderSheet();
  if(invOpen) renderInventory();
  save();
}

// Bug reportado 2026-10-03 ("cuando desequipas, el objeto desaparece"): el
// objeto sí volvía a la mochila, pero quedaba oculto si había un filtro
// (ranura, rango o senda/conjunto) que no lo incluía, o si estaba abierta
// otra pestaña. Al quitar algo se muestra la Mochila y se sueltan los
// filtros que lo esconderían.
function revealInBag(item){
  invTab = 'mochila';
  invSel = item.uid || null; // queda seleccionado en la cuadrícula
  if(invGearFilter!=='todos' && invGearFilter!==item.slot) invGearFilter = 'todos';
  if(invGearTierFilter!=='todos' && invGearTierFilter!==(item.rarity||'comun')) invGearTierFilter = 'todos';
  if(invGearClassFilter!=='todos' && !(invGearClassFilter.startsWith('set:') ? item.setId===invGearClassFilter.slice(4) : item.styleId===invGearClassFilter)) invGearClassFilter = 'todos';
}
function unequipItem(slot){
  const item = state.char.equip[slot];
  if(!item) return;
  state.char.equip[slot] = null;
  state.char.inventory.push(ensureItemUid(item));
  revealInBag(item);
  log(`Desequipas <b>${item.name}</b>.`);
  renderSheet();
  if(invOpen) renderInventory();
  save();
}

async function saveAllyEquip(row){
  const { error } = await supabase.from('character_allies').update({equip: row.equip||{}}).eq('id', row.id);
  if(error) console.error('No se pudo guardar el equipo del aliado:', error.message);
  return !error;
}
// Bug reportado 2026-10-03 ("al desequipar de un aliado, el objeto
// desaparece"): el equipo del aliado vive en character_allies y la mochila en
// characters, y se guardaban por separado — el aliado al instante y sin
// control de sesión, la mochila 1.5 s después. Si ese segundo guardado no
// llegaba (cuenta abierta en otro dispositivo, recarga inmediata, rechazo del
// servidor), el objeto ya no estaba en el aliado y nunca llegó a la mochila.
// Ahora se guarda en orden, primero el lado que RECIBE el objeto: si el
// segundo paso falla, a lo sumo el objeto queda en los dos lados, nunca en
// ninguno. Y si esta sesión ya fue reemplazada, no se escribe nada.
async function persistAllyEquipChange(row, toBag){
  if(!(await checkSessionStillActive())) return;
  if(saveTimer) clearTimeout(saveTimer);
  if(toBag){
    if(await flushSave()) await saveAllyEquip(row);
  } else {
    if(await saveAllyEquip(row)) await flushSave();
    else log(`<b style="color:var(--blood-light)">⚠ No se pudo guardar el equipo de ${row.name}.</b> Recarga antes de seguir para no perder el objeto.`);
  }
}
function equipItemOnAlly(uid, allyId){
  const row = (state.char.allies||[]).find(a=>a.id===allyId);
  if(!row) return;
  const idx = state.char.inventory.findIndex(i=>i.kind==='equip' && i.uid===uid);
  if(idx<0) return;
  const item = state.char.inventory[idx];
  // Misma restricción que el jugador (equipItem): un arma comprada para un
  // rol no la puede llevar un aliado de otro rol. El equipo suelto de
  // combate/cofres nunca lleva styleId, así que sigue siendo universal.
  // (Mago y Sacerdote ya no comparten Arma 1 desde el 2026-10-02.)
  if(!weaponStyleCompatible(item.styleId, ALLY_ROLE_TO_WEAPON_STYLE[row.role], item.slot)){
    log(`<b>${item.name}</b> es un arma de ${SHOP_ROLE_LABELS[item.styleId]||item.styleId} — ${row.name} (${row.role}) no puede usarla.`);
    return;
  }
  if(!meetsGearEquipLevel(item, row.level, row.role==='sacerdote')){
    log(`<b>${item.name}</b> requiere nivel ${gearEquipMinLevel(item.rarity)} — ${row.name} todavía no lo alcanza.`);
    return;
  }
  if(!row.equip) row.equip = {};
  const prior = row.equip[item.slot];
  row.equip[item.slot] = item;
  state.char.inventory.splice(idx,1);
  if(prior) state.char.inventory.push(ensureItemUid(prior));
  log(`Equipas <b>${item.name}</b> en <b>${row.name}</b>${prior ? ` (guardas ${prior.name} en la mochila)` : ''}.`);
  if(invOpen) renderInventory();
  saveLocalLog();
  persistAllyEquipChange(row, false);
}
function unequipAllyItem(allyId, slot){
  const row = (state.char.allies||[]).find(a=>a.id===allyId);
  if(!row || !row.equip) return;
  const item = row.equip[slot];
  if(!item) return;
  row.equip[slot] = null;
  state.char.inventory.push(ensureItemUid(item));
  revealInBag(item);
  log(`Desequipas <b>${item.name}</b> de <b>${row.name}</b>.`);
  if(invOpen) renderInventory();
  saveLocalLog();
  persistAllyEquipChange(row, true);
}

function applyPotionEffect(potionId){
  const item = state.char.inventory.find(i=>i.kind==='potion' && i.potionId===potionId);
  if(!item || item.qty<=0){ log('No tienes esa poción.'); return false; }
  const tpl = POTION_TEMPLATES[potionId];
  const d = derived();
  if(tpl.effect.heal==='hp'){
    const healMult = (combat && combat.active) ? healMultiplierFor(combat.playerStatuses) : 1;
    const amt = Math.round(d.maxHP*tpl.effect.amount*healMult);
    const before = state.char.curHP;
    state.char.curHP = Math.min(d.maxHP, state.char.curHP+amt);
    log(`Bebes <b>${tpl.name}</b>. Recuperas ${state.char.curHP-before} de vida.`);
  } else if(tpl.effect.heal==='sta'){
    const amt = Math.round(d.maxSta*tpl.effect.amount);
    const before = state.char.curSta;
    state.char.curSta = Math.min(d.maxSta, state.char.curSta+amt);
    log(`Bebes <b>${tpl.name}</b>. Recuperas ${state.char.curSta-before} de MP.`);
  } else if(tpl.effect.heal==='spi'){
    const amt = Math.round(d.maxSpi*tpl.effect.amount);
    const before = state.char.curSpi;
    state.char.curSpi = Math.min(d.maxSpi, state.char.curSpi+amt);
    log(`Bebes <b>${tpl.name}</b>. Recuperas ${state.char.curSpi-before} de espíritu.`);
  } else if(tpl.effect.cure){
    if(combat && combat.active) combat.playerStatuses.length = 0;
    log(`Bebes <b>${tpl.name}</b>. Tus efectos negativos desaparecen.`);
  }
  item.qty -= 1;
  if(item.qty<=0) state.char.inventory = state.char.inventory.filter(i=>i!==item);
  return true;
}

function usePotionOutOfCombat(potionId){
  if(applyPotionEffect(potionId)){
    renderSheet();
    if(invOpen) renderInventory();
    save();
  }
}

async function usePotionInCombat(potionId){
  if(!combat || combat.over) return;
  if(applyPotionEffect(potionId)){
    await endPlayerTurn();
  }
}

/* ============================================================
   RENDER: CITY
   ============================================================ */
// ============================================================
// CIUDAD — menú lateral, bienvenida, mapa y primeras visitas
// (2026-10-02, maqueta "prototype-2d/maqueta-ui.html" aprobada por ariochbu)
// ============================================================
let cityView = null; // 'welcome' | 'map' | 'laberinto' | 'ficha'
function charKey(k){ return `ds:${k}:${state && state.char ? state.char.id : 'x'}`; }
function lsGet(k){ try{ return localStorage.getItem(k); }catch(e){ return null; } }
function lsSet(k,v){ try{ localStorage.setItem(k,v); }catch(e){} }
function closeAllPanels(){
  invOpen = false; homeOpen = false; shopOpen = false; rankingOpen = false; adminOpen = false;
  missionsOpen = false; tabernaOpen = false; ofrendaOpen = false; checkinOpen = false; optionsOpen = false;
}
// Lugares de la ciudad: clave del menú, panel que abre y su introducción de
// primera visita (viñetas provisionales hasta que haya ilustraciones).
const CITY_PLACES = {
  shop:    {name:'Tienda', ic:'⚒️', open:()=>{ shopOpen = true; }, img:'tienda', d:[24.4,62.7], m:[19.4,36.8], keeper:'Gerd el herrero',
            intro:['“¿Nuevo? Se nota por cómo agarras esa espada.”','“Vendo armas, armaduras y pociones. Compro lo que traigas de abajo.”','“Vuelve con oro… o con Sellos del Laberinto.”']},
  home:    {name:'Hogar', ic:'🏠', open:()=>{ homeOpen = true; }, img:'hogar', d:[30.4,79.0], m:[18.6,58.0], keeper:'Tu casera',
            intro:['“Tu cuarto está arriba. Guarda aquí lo que no quieras perder.”','“Lo que dejes en el Hogar no se pierde aunque caigas en el laberinto.”']},
  taberna: {name:'Taberna', ic:'🍺', open:()=>{ tabernaOpen = true; }, img:'taberna', d:[29.6,34.5], m:[23.6,21.3], keeper:'Bruno el tabernero',
            intro:['“¡Otro valiente que viene a morir al laberinto!”','“Aquí se contratan espadas… si tienes fama y oro.”','“Cada aliado cobra su salario al salir del laberinto. No lo olvides.”']},
  missions:{name:'Gremio', ic:'📜', open:()=>{ missionsOpen = true; }, img:'gremio', d:[51.4,32.7], m:[54.4,21.1], keeper:'La maestra del Gremio',
            intro:['“El Gremio paga por trabajo bien hecho.”','“Cada 12 horas hay contratos nuevos en el tablón.”','“Cúmplelos y cobra oro, experiencia y Sellos del Laberinto.”']},
  ofrenda: {name:'Árbol de ofrendas', ic:'🌳', open:()=>{ ofrendaOpen = true; }, img:'arbol', d:[79.6,65.7], m:[74.4,75.3], keeper:'Yggdrasil',
            intro:['Las raíces del pequeño árbol brillan al acercarte…','Ofrécele oro o Sellos y te devolverá a uno de los Caídos del Laberinto.']},
  checkin: {name:'Check-in diario', ic:'📅', open:()=>{ checkinOpen = true; }, img:'campanario', d:[81.2,40.5], m:[79.6,58.9], keeper:'El campanero',
            intro:['“Cada día que vuelvas a la ciudad, el árbol te regala ofrendas.”','“El día 1 de cada mes empieza un calendario nuevo.”']},
  ranking: {name:'Ranking', ic:'🏆', open:()=>{ rankingOpen = true; }, img:'ranking', d:[50.8,71.4], m:[22.0,74.3], keeper:'El pregonero',
            intro:['“¡Escuchad! Aquí se graban los nombres de los que más hondo bajaron.”']},
};
function navBadges(){
  const missionsReady = (state.missions||[]).filter(m=>m.status==='completed').length;
  const pulls = (state.char.pets && state.char.pets.pendingFreePulls) || 0;
  return {missions: missionsReady ? '!' : '', ofrenda: pulls ? String(pulls) : '', checkin: checkinAvailable() ? '!' : ''};
}
function activeNavKey(){
  if(invOpen) return 'inv';
  if(homeOpen) return 'home'; if(shopOpen) return 'shop'; if(tabernaOpen) return 'taberna';
  if(missionsOpen) return 'missions'; if(ofrendaOpen) return 'ofrenda'; if(checkinOpen) return 'checkin';
  if(rankingOpen) return 'ranking'; if(adminOpen) return 'admin'; if(optionsOpen) return 'options';
  ensureCityView();
  return cityView;
}
function ensureCityView(){ if(!cityView) cityView = lsGet(charKey('welcome')) ? 'map' : 'welcome'; }
function renderSideNav(){
  const el = document.getElementById('sheet');
  const d = derived(), r = race(), st = style();
  const active = activeNavKey(), badges = navBadges();
  const hpPct = clamp(state.char.curHP/d.maxHP*100,0,100), mpPct = clamp(state.char.curSta/d.maxSta*100,0,100);
  const xpNeeded = xpNeededForLevel(state.char.level), xpPct = clamp(state.char.xp/xpNeeded*100,0,100);
  const tavernLocked = !tavernUnlocked();
  const item = (key, ic, name, opts={})=>{
    const right = opts.locked ? `<span class="sn-lock" title="${opts.lockWhy||''}">🔒</span>`
      : opts.badge ? `<span class="sn-badge${opts.badge==='!'?' bang':''}">${opts.badge}</span>` : '';
    return `<div class="sn-item ${active===key?'on':''} ${opts.locked?'locked':''}" data-sn="${key}" ${opts.locked?`title="${opts.lockWhy||''}"`:''}><span class="sn-ic">${ic}</span><span class="sn-txt">${name}</span>${right}</div>`;
  };
  const hdrShown = (id)=>{ const b = document.getElementById(id); return !!b && b.style.display !== 'none'; };
  const muted = /🔇/.test((document.getElementById('btn-music-toggle')||{}).textContent||'');
  el.innerHTML = `
    <div class="sn-brand"><b>Dungeon &amp; Stone</b><span id="sn-clock" title="Hora de Ecuador (UTC-5)">${(document.getElementById('clock-time')||{}).textContent||''}</span></div>
    <div class="sn-me">
      <div class="sn-ava"><img src="${playerSpriteFor(state.char.style, state.char.race)||''}" alt=""><span class="sn-lvl">${state.char.level}</span></div>
      <div class="sn-who">
        <div class="sn-name">${state.char.nickname}${renownBadge(myTitleN())}${myMythicBadge()}</div>
        <div class="sn-sub">${r.name} · ${st.name}</div>
        <div class="sn-cur"><span title="Oro">⛁ ${state.char.gold}</span><span title="Sellos del Laberinto">🔷 ${state.char.missionCurrency||0}</span></div>
        <div class="sn-bar hp" title="Vida ${state.char.curHP}/${d.maxHP}"><i style="width:${hpPct}%"></i></div>
        <div class="sn-bar mp" title="MP ${state.char.curSta}/${d.maxSta}"><i style="width:${mpPct}%"></i></div>
        <div class="sn-bar xp" title="Experiencia ${state.char.xp}/${xpNeeded}"><i style="width:${xpPct}%"></i></div>
      </div>
    </div>
    <div class="sn-nav">
    <div class="sn-sec"><h5>Inicio</h5>
      ${item('welcome','✨','Bienvenida')}
      ${item('map','🗺️','Mapa de la ciudad')}
    </div>
    <div class="sn-sec"><h5>Ciudad</h5>
      ${item('shop','⚒️','Tienda')}
      ${item('home','🏠','Hogar')}
      ${item('taberna','🍺','Taberna', tavernLocked ? {locked:true, lockWhy: state.char.level < ALLY_MIN_LEVEL ? `Requiere nivel ${ALLY_MIN_LEVEL}${BETA_ALLY_UNLOCKS?' y derrotar al Ogro':''}` : 'Derrota al Ogro (nivel 10)'} : {})}
      ${item('missions','📜','Gremio',{badge:badges.missions})}
      ${item('ofrenda','🌳','Árbol de ofrendas',{badge:badges.ofrenda})}
      ${item('checkin','📅','Check-in diario',{badge:badges.checkin})}
    </div>
    <div class="sn-sec"><h5>Laberinto</h5>
      ${item('laberinto','🕳️','Entrar al laberinto')}
      ${item('ficha','🧝','Ficha del personaje')}
      ${item('inv','🎒','Personaje e inventario')}
    </div>
    <div class="sn-sec"><h5>Progreso</h5>
      ${item('ranking','🏆','Ranking')}
      ${item('cronicas','📖','Crónicas')}
      ${state.char.role==='admin' ? item('admin','🛠️','Panel admin') : ''}
    </div>
    <div class="sn-sec"><h5>Cuenta</h5>
      ${item('tutorial','❓','¿Cómo jugar?')}
      ${item('options','⚙️','Opciones')}
      ${item('hdr:btn-music-toggle', muted?'🔇':'🔊', muted?'Música: silenciada':'Música: activada')}
      ${hdrShown('btn-switch-char') ? item('hdr:btn-switch-char','👥','Cambiar de personaje') : ''}
    </div>
    </div>`;
  el.querySelectorAll('.sn-item').forEach(it=>{ it.onclick = ()=>{
    // "hdr:<id>": acciones de cuenta que siguen cableadas en la barra de arriba (oculta en la ciudad).
    if(it.dataset.sn.startsWith('hdr:')){
      document.getElementById(it.dataset.sn.slice(4)).click();
      if(it.dataset.sn==='hdr:btn-music-toggle') renderSideNav();
      return;
    }
    cityNavigate(it.dataset.sn);
  }; });
}
function cityNavigate(key){
  if(!state || (combat && combat.active)) return;
  if(key==='tutorial'){ showTutorial(); return; }
  if(key==='taberna' && !tavernUnlocked()){
    showOverlay('Taberna cerrada', state.char.level < ALLY_MIN_LEVEL
      ? `La Taberna abre a partir del nivel ${ALLY_MIN_LEVEL}${BETA_ALLY_UNLOCKS?' y tras derrotar al Ogro':''}.`
      : 'Nadie en la Taberna se arriesga con un desconocido. Derrota al Ogro (nivel 10) y los mercenarios empezarán a escucharte.', ()=>{});
    return;
  }
  closeAllPanels();
  if(key==='inv') invOpen = true;
  else if(key==='options') optionsOpen = true;
  else if(key==='admin'){ if(state.char.role==='admin') adminOpen = true; }
  else if(CITY_PLACES[key]){ CITY_PLACES[key].open(); cityView = 'map'; }
  else cityView = key;
  if(key==='welcome') welcomeStep = 0;
  if(key==='welcome') lsSet(charKey('welcome'),'1');
  renderAll();
  window.scrollTo({top:0, behavior:'smooth'});
  if(CITY_PLACES[key]) maybeShowPlaceIntro(key);
}
function maybeShowPlaceIntro(key){
  const p = CITY_PLACES[key];
  if(!p || lsGet(charKey('intro-'+key))) return;
  lsSet(charKey('intro-'+key), '1');
  let i = 0;
  const div = document.createElement('div');
  div.className = 'overlay-msg';
  const draw = ()=>{
    div.innerHTML = `<div class="overlay-card intro-card">
      <h2>${p.ic} ${p.name}</h2>
      <div class="intro-comic">${p.intro.map((t,k)=>`<div class="intro-panel ip${k%3} ${k<=i?'shown':''}"><span class="intro-cap">${t}</span></div>`).join('')}</div>
      <div class="intro-foot"><span>${p.keeper}</span><span style="display:flex; gap:8px;">
        <button class="reset-btn" data-intro="skip">Saltar</button>
        <button class="btn-main" data-intro="next">${i<p.intro.length-1?'Continuar ›':'Entrar'}</button></span></div>
    </div>`;
    div.querySelector('[data-intro="skip"]').onclick = ()=> div.remove();
    div.querySelector('[data-intro="next"]').onclick = ()=>{ if(i<p.intro.length-1){ i++; draw(); } else div.remove(); };
  };
  draw();
  document.body.appendChild(div);
}
function renderCity(){
  ensureCityView();
  if(cityView==='welcome') return renderCityWelcome();
  if(cityView==='laberinto') return renderCityDungeonEntry();
  if(cityView==='ficha') return renderFicha();
  if(cityView==='cronicas') return renderCronicas();
  return renderCityMap();
}
// Bienvenida narrada (2026-10-02, pedido explícito): un cronista cuenta el
// origen del laberinto (inspirado en la novela, texto propio) y te pide
// llegar al último piso. Escenas con arte provisional (degradados + sprites
// del juego) hasta que haya ilustraciones propias.
const WELCOME_STORY = [
  {scene:'cursed', text:'Siéntate, forastero. Antes de bajar, debes saber dónde estás… y por qué esta ciudad sigue en pie.'},
  {scene:'cursed', text:'Hace siglos, una bruja maldijo el mundo. El aire se volvió veneno, los ríos se pudrieron y los reinos cayeron uno tras otro, en silencio.'},
  {scene:'barrier', text:'Solo esta ciudad resistió. Sus magos alzaron una barrera que aún hoy nos protege… pero fuera de ella no crece nada. Ni trigo, ni esperanza.'},
  {scene:'portal', text:'Cuando el hambre llegó a las puertas del palacio, la familia real abrió un portal hacia otra dimensión. Del otro lado había riqueza: piedras cargadas de magia, criaturas, tesoros.'},
  {scene:'labyrinth', text:'Ese portal se convirtió en el Laberinto. Los que bajan por él se llaman exploradores: viven de lo que traen de abajo… y muchos no vuelven.'},
  {scene:'explorers', text:'Bosques de goblins, nidos de arañas, bestias, reflejos que roban tu rostro, una isla de traidores, un mar sin fondo… Cada década, un guardián más terrible que el anterior.'},
  {scene:'deep', text:'Dicen que en el último piso está el corazón de la maldición. Nadie ha llegado. Nadie ha vuelto para contarlo.'},
  {scene:'ask', text:'Pero tú… tú tienes algo distinto en la mirada. Baja, hazte fuerte, y llega donde nadie ha llegado. La ciudad entera te lo pide.'},
];
const WELCOME_SCENES = {
  cursed:'linear-gradient(180deg,#2a3a1a 0%,#1a2410 50%,#0c1006 100%)',
  barrier:'radial-gradient(ellipse at 50% 85%,rgba(150,110,255,0.55),transparent 55%),linear-gradient(180deg,#1b1530,#0d0a18)',
  portal:'radial-gradient(circle at 50% 55%,#ffd76a 0%,#c47b1a 18%,#3a2410 36%,#120a05 60%)',
  labyrinth:'linear-gradient(180deg,#1a1410,#0b0806)',
  explorers:'linear-gradient(180deg,#2a1a10,#0d0805)',
  deep:'radial-gradient(ellipse at 50% 70%,rgba(40,110,170,0.6),transparent 60%),linear-gradient(180deg,#06121e,#020509)',
  ask:'radial-gradient(ellipse at 50% 40%,rgba(255,190,90,0.35),transparent 60%),linear-gradient(180deg,#2a1a10,#0d0805)',
};
let welcomeStep = 0;
function welcomeSceneArt(scene){
  const hd = id => `src/assets/enemigos/${id}.png?v=6`;
  if(scene==='portal') return `<div class="ws-portal"></div>`;
  if(scene==='barrier') return `<div class="ws-dome"></div><div class="ws-city">🏰</div>`;
  if(scene==='cursed') return `<div class="ws-fog"></div><div class="ws-city dead">🏚️🏚️🏚️</div>`;
  if(scene==='labyrinth') return `<div class="ws-stairs">🕳️</div>`;
  if(scene==='explorers') return `<div class="ws-row">${['goblin_guerrero','viuda_alfa','rey_manada','duelista_veterano','triton_guerrero'].map(id=>`<img src="${hd(id)}" alt="">`).join('')}</div>`;
  if(scene==='deep') return `<img class="ws-boss" src="${hd('storm_gush')}" alt="">`;
  if(scene==='ask') return `<img class="ws-hero" src="${playerSpriteFor(state.char.style, state.char.race)||''}" alt="">`;
  return '';
}
// Las 8 ilustraciones se precargan al abrir la bienvenida: antes, al pasar de
// escena, se veía por un instante el arte provisional (degradado + emoji)
// mientras cargaba la imagen (reportado 2026-10-04).
const welcomeArtReady = new Set();
let welcomeArtPreloaded = false;
function preloadWelcomeArt(){
  if(welcomeArtPreloaded) return;
  welcomeArtPreloaded = true;
  WELCOME_STORY.forEach((_,i)=>{ const im = new Image(); im.onload = ()=> welcomeArtReady.add(i); im.src = `src/assets/bienvenida/escena_${i+1}.jpg?v=1`; });
}
function renderCityWelcome(){
  preloadWelcomeArt();
  lsSet(charKey('welcome'),'1');
  const step = Math.max(0, Math.min(WELCOME_STORY.length-1, welcomeStep));
  const cur = WELCOME_STORY[step];
  const last = step === WELCOME_STORY.length-1;
  document.getElementById('main-panel').innerHTML = `
    <div class="city-welcome">
      <h2 class="cw-title">La Última Ciudad</h2>
      <div class="ws-scene ${welcomeArtReady.has(step)?'has-art':''}" style="background:${welcomeArtReady.has(step) ? '#0b0907' : WELCOME_SCENES[cur.scene]}">
        <img class="ws-illus" src="src/assets/bienvenida/escena_${step+1}.jpg?v=1" alt="" onload="this.parentElement.classList.add('has-art')" onerror="this.remove()">
        ${welcomeSceneArt(cur.scene)}
      </div>
      <div class="ws-dialog">
        <div class="ws-narrator"><div class="ws-portrait"><img src="src/assets/bienvenida/cronista.jpg?v=1" alt="" onerror="this.replaceWith('📜')"></div><b>El Cronista</b></div>
        <p class="ws-text">${cur.text}</p>
        <div class="ws-foot">
          <div class="ws-dots">${WELCOME_STORY.map((_,i)=>`<i class="${i===step?'on':(i<step?'done':'')}"></i>`).join('')}</div>
          <div class="ws-btns">
            ${step>0?'<button class="reset-btn" id="ws-prev">‹ Atrás</button>':''}
            ${last ? '' : '<button class="reset-btn" id="ws-skip">Saltar historia</button>'}
            ${last ? '' : '<button class="btn-main" id="ws-next">Continuar ›</button>'}
          </div>
        </div>
      </div>
      ${last ? `<div class="cw-actions" style="margin-top:14px;">
        <button class="btn-main" id="cw-map">Recorrer la ciudad 🗺️</button>
        <button class="reset-btn" id="cw-lab">Bajar al laberinto</button>
        <button class="reset-btn" id="cw-tut">¿Cómo jugar?</button>
      </div>` : ''}
      <p class="cw-record">Tu récord: ${describeRecord()}.</p>
    </div>`;
  const go = (d)=>{ welcomeStep = step + d; renderCityWelcome(); };
  const prev = document.getElementById('ws-prev'), next = document.getElementById('ws-next'), skip = document.getElementById('ws-skip');
  if(prev) prev.onclick = ()=> go(-1);
  if(next) next.onclick = ()=> go(1);
  if(skip) skip.onclick = ()=>{ welcomeStep = WELCOME_STORY.length-1; renderCityWelcome(); };
  const m = document.getElementById('cw-map'), l = document.getElementById('cw-lab'), t = document.getElementById('cw-tut');
  if(m) m.onclick = ()=>{ welcomeStep = 0; cityNavigate('map'); };
  if(l) l.onclick = ()=>{ welcomeStep = 0; cityNavigate('laberinto'); };
  if(t) t.onclick = showTutorial;
}
// Mapa ilustrado (2026-10-02, arte de ariochbu): fondo con 7 parcelas y la
// plataforma central del portal; cada edificio es un PNG aparte para poder
// mostrarlo bloqueado/en gris y con avisos. En celular se usa la versión
// vertical del fondo con sus propias posiciones (d = escritorio, m = celular).
const CITY_PORTAL_POS = {d:[42.8,51.7], m:[40.0,46.7]};
let cityMapMobile = null;
function renderCityMap(){
  const mobile = window.matchMedia('(max-width:640px)').matches;
  cityMapMobile = mobile;
  const L = mobile ? 'm' : 'd';
  const badges = navBadges();
  const tavernLocked = !tavernUnlocked();
  const pins = Object.entries(CITY_PLACES).map(([key,p])=>{
    const locked = key==='taberna' && tavernLocked;
    const b = badges[key];
    const [x,y] = p[L];
    return `<div class="cm-pin ${locked?'locked':''}" data-cm="${key}" style="left:${x}%; top:${y}%;" title="${p.name}${locked?' (bloqueada)':''}">
      <img class="cm-bld-img" src="src/assets/ciudad/${p.img}.png?v=1" alt="${p.name}">
      ${b?`<span class="cm-mark ${b==='!'?'':'num'}">${b}</span>`:''}
      <div class="cm-tag">${p.name}${locked?' 🔒':''}</div></div>`;
  }).join('');
  const [px,py] = CITY_PORTAL_POS[L];
  document.getElementById('main-panel').innerHTML = `
    <div class="city-map ${mobile?'mobile':''}" style="background-image:url(src/assets/ciudad/${mobile?'mapa_movil':'mapa'}.jpg?v=1)">
      <div class="cm-portal-img" id="cm-portal" style="left:${px}%; top:${py}%;" title="Entrar al laberinto">
        <div class="cm-tag cm-portal-tag">⚔ Laberinto</div>
        <img src="src/assets/ciudad/portal.png?v=1" alt="Laberinto">
      </div>
      ${pins}
      <div class="cm-hint">Toca un edificio o usa el menú.</div>
    </div>`;
  document.querySelectorAll('.cm-pin').forEach(pin=>{ pin.onclick = ()=> cityNavigate(pin.dataset.cm); });
  document.getElementById('cm-portal').onclick = ()=> cityNavigate('laberinto');
}
// Si se cruza el corte celular/escritorio con el mapa abierto, se redibuja.
window.addEventListener('resize', ()=>{
  if(!state || cityView!=='map' || !document.querySelector('.city-map')) return;
  const mobile = window.matchMedia('(max-width:640px)').matches;
  if(mobile !== cityMapMobile) renderCityMap();
});
// Nombres de cada década para las puertas de la entrada.
const DECADE_GATE_NAMES = {1:'Bosque Goblin', 11:'Nido de Arañas', 21:'Tierra de Bestias', 31:'Salón del Usurpador', 41:'Isla Paraíso', 51:'El Mar', 61:'La Grieta', 71:'Bosque Muerto'};
function renderCityDungeonEntry(){
  // Entrada al laberinto (rediseño 2026-10-04, pedido explícito: "algo más
  // real y que dé miedo"): boca oscura con niebla, cada checkpoint es una
  // puerta, y el aviso de lo que se pierde al morir va bien visible.
  const gates = checkpointLevelsUnlocked();
  document.getElementById('main-panel').innerHTML = `
    <div class="lb-entry">
      <img class="lb-art" src="src/assets/escenas/laberinto.jpg?v=1" alt="" onerror="this.remove()">
      <div class="lb-fog"></div><div class="lb-fog f2"></div>
      <div class="lb-inner">
        <h2>El Laberinto</h2>
        <p class="lb-whisper">Algo respira ahí abajo.</p>
        <p class="lb-record">Tu récord: <b>${describeRecord()}</b></p>
        <div class="lb-gates">
          ${gates.map(lvl=>`<button class="checkpoint-btn lb-gate ${lvl===state.char.checkpointLevel?'current':''}" data-level="${lvl}">
            <span class="lb-gate-arch"></span><b>${lvl}</b><small>${DECADE_GATE_NAMES[lvl] || 'Nivel '+lvl}</small></button>`).join('')}
        </div>
        <p class="lb-hint">${gates.length>1 ? 'Elige por qué puerta bajar. Se abre una nueva cada vez que derrotas al jefe de una década.' : 'Solo hay una puerta abierta: nivel 1, piso 1.'}</p>
      </div>
    </div>
    <div class="lb-warn">
      <b>☠ Si mueres dentro</b> pierdes el equipo suelto de tu mochila y el <b>${DEFEAT_GOLD_LOSS_PCT}%</b> de tu oro. Lo que llevas equipado y lo guardado en el Hogar está a salvo.
      <span>Si te retiras tras vencer a un guardián, conservas todo.</span>
    </div>
  `;
  const enterDungeonAt = (startLevel)=>{
    showOverlay(
      'Antes de entrar',
      `Una vez dentro no podrás retirarte hasta vencer al guardián del nivel o caer en el intento. Si mueres, pierdes el equipo suelto que llevas en la mochila y el ${DEFEAT_GOLD_LOSS_PCT}% de tu oro — lo que ya tienes equipado y lo que guardaste en el Hogar está a salvo.`,
      ()=>{
        stopLoginAudio();
        const d = derived();
        state.char.curHP = d.maxHP; state.char.curSta = d.maxSta; state.char.curSpi = d.maxSpi;
        state.dungeon = generateDungeon(startLevel);
        cityView = 'map'; // al volver a la ciudad se ve el mapa
        playDungeonAudio(startLevel);
        // La "Descansar" de la ciudad se quitó por redundante (2026-09-25,
        // pedido explícito): entrar ya curaba al jugador a full, así que en
        // vez de un botón aparte, entrar ahora también cura a todo el
        // equipo de aliados de una — mismo bloque que antes solo disparaba
        // la hoguera dentro del laberinto (ver rama 'descanso' en enterNode).
        state.dungeon.allyHP = {}; state.dungeon.allyMP = {}; state.dungeon.allySpirit = {};
        (state.char.allies||[]).forEach(row=>{
          state.dungeon.allyHP[row.id] = allyMaxHP(row);
          state.dungeon.allyMP[row.id] = allyMaxMP(row);
          state.dungeon.allySpirit[row.id] = allyMaxSpirit(row);
        });
        log(startLevel>1
          ? `Entras al laberinto desde tu checkpoint, nivel ${startLevel}. El aire cambia; algo respira ahí dentro.`
          : 'Entras al laberinto desde el nivel 1. El aire cambia; algo respira ahí dentro.');
        renderAll(); save();
      }
    );
  };
  document.querySelectorAll('.checkpoint-btn').forEach(btn=>{
    btn.onclick = ()=> enterDungeonAt(parseInt(btn.dataset.level, 10));
  });
}

/* ============================================================
   RENDER: OTORGAR OFRENDA — gacha de mascotas "Caídos del Laberinto"
   ============================================================ */
function showPetRates(){
  showOverlay('Cómo funciona la ofrenda', `
    <p style="margin-top:0;">Si sale un Caído del Laberinto que ya tienes, no se pierde: se suma a tu colección de ese Caído (verás su cantidad junto al nombre).</p>
  `, ()=>{});
}
function isRarePetResult(r){ return ['epico','legendario','mitico'].includes(r.tpl.rarity); }

// ============================================================
// CAÍDO MÍTICO (pedido explícito 2026-10-07). Tres cosas cuando alguien lo invoca:
//  1. Revelado propio a pantalla completa, distinto del destello de los
//     Épicos/Legendarios. Usa src/assets/ofrenda/mitico_<id>.jpg si existe
//     (arte especial, apaisado o vertical); si no, la ilustración del Caído.
//  2. Aviso a TODOS los jugadores (tabla mythic_summons, migración 0038): cada
//     cliente la consulta al entrar y cada 2 minutos.
//  3. Distintivo "Elegido del Emperador" junto al nombre: solo se luce, no da
//     nada. No es un título de Fama (esos van en escalera y dan beneficios):
//     se muestra además del que lleves. Lo tiene quien posea un Mítico.
// ============================================================
const MYTHIC_TITLE = 'Elegido del Emperador';
const MYTHIC_PET_IDS = PET_CATALOG.filter(p=> p.rarity==='mitico').map(p=> p.id);
function ownsMythic(owned){ return MYTHIC_PET_IDS.some(id=> ((owned||{})[id]||0) > 0); }
function mythicBadge(has){
  return has ? ` <span class="mythic-badge" title="Invocó a un Caído del Laberinto Mítico">⚜ ${MYTHIC_TITLE}</span>` : '';
}
function myMythicBadge(){ return mythicBadge(!!(state && state.char && state.char.pets && ownsMythic(state.char.pets.owned))); }
function showMythicReveal(r){
  if(document.querySelector('.mythic-ov')) return;
  const tpl = r.tpl, ov = document.createElement('div');
  ov.className = 'mythic-ov';
  ov.innerHTML = `<div class="mythic-rays"></div><div class="mythic-ring"></div>
    <div class="mythic-stage">
      <div class="mythic-kicker">Caído del Laberinto</div>
      <div class="mythic-rank">MÍTICO</div>
      <div class="mythic-art"><img src="src/assets/ofrenda/mitico_${r.id}.jpg?v=1" alt="" onerror="this.onerror=null; this.src='${petArtPath(r.id)}'"></div>
      <h2>${tpl.name}</h2>
      <p>${r.isDup ? 'El Emperador vuelve a responder a tu ofrenda.' : `El árbol tiembla. Desde hoy eres <b>${MYTHIC_TITLE}</b>.`}</p>
      <button class="btn-main">Continuar</button>
    </div>${Array.from({length:26}, (_, i)=>`<i class="mythic-ember" style="--x:${(i*37)%100}%; --d:${(i%7)*0.45}s; --s:${3 + (i%5)}s"></i>`).join('')}`;
  document.body.appendChild(ov);
  ov.querySelector('button').onclick = ()=>{ ov.classList.add('out'); setTimeout(()=> ov.remove(), 450); renderAll(); };
}
// Avisa al resto: una fila por personaje y Caído (la base no deja repetir ni
// anunciar uno que no se tiene). Si la tabla aún no existe, no pasa nada.
function announceMythicSummon(petId){
  if(simMode || !currentUser || !state.char || !state.char.id) return;
  supabase.from('mythic_summons').insert({character_id: state.char.id, user_id: currentUser.id, nickname: state.char.nickname, pet_id: petId})
    .then(({error})=>{ if(error && !/duplicate|does not exist|schema cache/i.test(error.message||'')) console.warn('Aviso de Mítico no enviado:', error.message); });
}
let mythicPollTimer = null;
async function pollMythicSummons(){
  if(!currentUser) return;
  const key = 'ds_mythic_seen', dayAgo = new Date(Date.now() - 24*3600*1000).toISOString();
  let since = dayAgo;
  try{ const v = localStorage.getItem(key); if(v && v > dayAgo) since = v; }catch(e){}
  const { data, error } = await supabase.from('mythic_summons').select('nickname, pet_id, user_id, created_at').gt('created_at', since).order('created_at').limit(5);
  if(error || !data || !data.length) return;
  try{ localStorage.setItem(key, data[data.length-1].created_at); }catch(e){}
  data.filter(row=> row.user_id !== currentUser.id).forEach((row, i)=> setTimeout(()=> showMythicBanner(row), i*7500));
}
function showMythicBanner(row){
  const tpl = petTpl(row.pet_id);
  if(!tpl) return;
  const el = document.createElement('div');
  el.className = 'mythic-banner';
  el.innerHTML = `<img src="${petArtPath(row.pet_id)}" alt=""><div><small>⚜ Invocación mítica ⚜</small><b></b><span>ha invocado a <em>${tpl.name}</em></span></div>`;
  el.querySelector('b').textContent = row.nickname; // textContent: el apodo lo escribe un jugador
  document.body.appendChild(el);
  el.onclick = ()=> el.remove();
  setTimeout(()=>{ if(el.parentNode) el.remove(); }, 7000);
}
function startMythicPolling(){
  if(mythicPollTimer) return;
  setTimeout(pollMythicSummons, 4000);
  mythicPollTimer = setInterval(pollMythicSummons, 120000);
}
// Revelado de la ofrenda al estilo MIR4 (2026-10-03, pedido explícito: "que
// no aparezcan de manera brusca... si tienen x100 lanzamientos se irán
// abriendo de 10 en 10"). Las cartas se reparten boca abajo de a una, en
// TANDAS de 10 (la tirada x10+1 va entera en una sola tanda de 11), y se
// voltean con su giro: al tocarlas, o en cadena con "Voltear todo". Al
// terminar una tanda aparece el botón para repartir la siguiente.
// - Boca abajo todas idénticas en color (nunca delatan el rango exacto).
// - Las Épico+ quedan bloqueadas hasta voltear el resto de SU tanda.
// - El DOM de la tanda se arma UNA vez y los giros solo cambian clases: antes
//   cada giro re-renderizaba todo y la carta aparecía ya volteada, sin animar.
const OFRENDA_PAGE_SIZE = 10;
let ofrendaPullResults = null;
let ofrendaPage = 0;
let ofrendaFlipTimers = [];
function ofrendaPages(){
  const n = ofrendaPullResults ? ofrendaPullResults.length : 0;
  const pages = [];
  for(let i=0; i<n; i+=OFRENDA_PAGE_SIZE) pages.push([i, Math.min(n, i+OFRENDA_PAGE_SIZE)]);
  // Una carta suelta al final (x10 +1 regalo = 11) se suma a la tanda anterior.
  if(pages.length>1 && pages[pages.length-1][1]-pages[pages.length-1][0]===1){ const last = pages.pop(); pages[pages.length-1][1] = last[1]; }
  return pages;
}
function ofrendaPageIdxs(){
  const pg = ofrendaPages()[ofrendaPage];
  return pg ? Array.from({length:pg[1]-pg[0]}, (_,i)=>pg[0]+i) : [];
}
function petFlipCardHTML(r, idx, order){
  const tpl = r.tpl;
  const big = isRarePetResult(r);
  const rc = PET_RARITIES[tpl.rarity];
  return `<div class="pet-flip-card deal ${big?'big':''} ${r.flipped?'flipped':''}" data-flip-idx="${idx}" style="--i:${order}; --rc:${rc.color}" title="Voltear">
    <div class="pet-flip-inner">
      <div class="pet-flip-back"><img class="pet-back-art" src="src/assets/ofrenda/reverso.jpg?v=1" alt="" onload="this.parentElement.classList.add('has-art')" onerror="this.remove()"><span>🎴</span></div>
      <div class="pet-flip-front" style="box-shadow:0 0 0 2px ${rc.color}bb, 0 0 ${big?22:12}px ${rc.color}99; --rc:${rc.color}">
        <img src="${petArtPath(r.id)}" alt="">
        ${petHasCleanArt(r.id) ? `<div class="pet-flip-name" style="color:${rc.color}">${tpl.name}</div>` : ''}
        ${r.isDup ? '<div class="pet-dup-badge">Duplicado</div>' : '<div class="pet-new-badge">¡Nuevo!</div>'}
      </div>
    </div>
  </div>`;
}
// Estado de bloqueo y botones de la tanda actual, sin tocar las cartas.
function updateOfrendaControls(){
  const container = document.getElementById('ofrenda-results');
  if(!container || !ofrendaPullResults) return;
  const idxs = ofrendaPageIdxs();
  const allNonRareFlipped = idxs.every(i=> isRarePetResult(ofrendaPullResults[i]) || ofrendaPullResults[i].flipped);
  idxs.forEach(i=>{
    const r = ofrendaPullResults[i];
    const el = container.querySelector(`[data-flip-idx="${i}"]`);
    if(!el) return;
    const locked = isRarePetResult(r) && !r.flipped && !allNonRareFlipped;
    el.classList.toggle('locked', locked);
    el.title = r.flipped ? '' : (locked ? 'Voltea las demás primero' : 'Voltear');
    const back = el.querySelector('.pet-flip-back span');
    if(back) back.textContent = locked ? '🔒' : '🎴';
  });
  const pages = ofrendaPages();
  const pageDone = idxs.every(i=>ofrendaPullResults[i].flipped);
  const left = ofrendaPullResults.length - (pages[ofrendaPage] ? pages[ofrendaPage][1] : 0);
  const ctr = container.querySelector('.pet-reveal-controls');
  if(!ctr) return;
  ctr.innerHTML = !pageDone
    ? `<button class="btn-main" id="btn-flip-all">Voltear todo</button>${pages.length>1 ? `<button class="reset-btn" id="btn-reveal-skip">Ver todas de una vez</button>` : ''}`
    : (left>0 ? `<button class="btn-main" id="btn-next-page">Siguiente tanda (quedan ${left})</button>` : (pages.length>1 ? `<span class="pet-reveal-done">Ofrenda completa: ${ofrendaPullResults.length} Caídos.</span>` : ''));
  const flipAllBtn = document.getElementById('btn-flip-all');
  if(flipAllBtn) flipAllBtn.onclick = flipAllOfrendaCards;
  const nextBtn = document.getElementById('btn-next-page');
  if(nextBtn) nextBtn.onclick = ()=>{ ofrendaPage++; renderOfrendaPage(); };
  const skipBtn = document.getElementById('btn-reveal-skip');
  if(skipBtn) skipBtn.onclick = ()=>{
    const myth = ofrendaPullResults.find(r=> !r.flipped && r.tpl.rarity==='mitico');
    ofrendaPullResults.forEach(r=> r.flipped = true); renderOfrendaPage(true);
    if(myth) showMythicReveal(myth);
  };
}
// Arma (reparte) la tanda actual. showAll: todas las cartas juntas, ya
// volteadas (el "Ver todas de una vez" de las ofrendas grandes).
function renderOfrendaPage(showAll){
  ofrendaFlipTimers.forEach(clearTimeout); ofrendaFlipTimers = [];
  const container = document.getElementById('ofrenda-results');
  if(!container) return;
  if(!ofrendaPullResults || !ofrendaPullResults.length){ container.innerHTML = ''; return; }
  const pages = ofrendaPages();
  if(showAll) ofrendaPage = pages.length-1;
  const idxs = showAll ? ofrendaPullResults.map((_,i)=>i) : ofrendaPageIdxs();
  container.innerHTML = `
    ${pages.length>1 && !showAll ? `<div class="pet-reveal-step">Tanda ${ofrendaPage+1} de ${pages.length}</div>` : ''}
    <div class="pet-reveal-grid">${idxs.map((i,k)=>petFlipCardHTML(ofrendaPullResults[i], i, showAll ? Math.min(k,12) : k)).join('')}</div>
    <div class="pet-reveal-controls"></div>`;
  container.querySelectorAll('[data-flip-idx]').forEach(el=>{
    const i = parseInt(el.dataset.flipIdx, 10);
    el.onclick = ()=> flipOfrendaCard(i);
    if(ofrendaPullResults[i].flipped) armFlippedCard(el, ofrendaPullResults[i]);
  });
  updateOfrendaControls();
  container.scrollIntoView({block:'nearest', behavior:'smooth'});
}
function refreshOfrendaResultsDOM(){ ofrendaPage = 0; renderOfrendaPage(); }
// Una carta ya volteada: habilita su zoom (antes de voltearla no, para no
// delatar qué es al pasar el cursor).
function armFlippedCard(el, r){
  const front = el.querySelector('.pet-flip-front');
  if(front && !front.dataset.petZoom){ front.dataset.petZoom = r.id; wirePetZoomEvents(el); }
}
function flipOfrendaCard(idx){
  const r = ofrendaPullResults && ofrendaPullResults[idx];
  if(!r || r.flipped) return;
  const idxs = ofrendaPageIdxs();
  if(!idxs.includes(idx)) return;
  const allNonRareFlipped = idxs.every(i=> isRarePetResult(ofrendaPullResults[i]) || ofrendaPullResults[i].flipped);
  if(isRarePetResult(r) && !allNonRareFlipped) return; // bloqueada todavía
  r.flipped = true;
  const el = document.querySelector(`#ofrenda-results [data-flip-idx="${idx}"]`);
  if(el){
    el.classList.remove('locked');
    el.classList.add('flipped');
    if(isRarePetResult(r)) el.classList.add('burst');
    armFlippedCard(el, r);
  }
  if(r.tpl.rarity==='mitico') setTimeout(()=> showMythicReveal(r), 650);
  updateOfrendaControls();
}
// "Voltear todo": las comunes/raras/únicas de la tanda en cadena, y tras una
// pausa las Épico+, de a una y más despacio.
function flipAllOfrendaCards(){
  if(!ofrendaPullResults) return;
  const btn = document.getElementById('btn-flip-all');
  if(btn) btn.disabled = true;
  const idxs = ofrendaPageIdxs().filter(i=>!ofrendaPullResults[i].flipped);
  const nonRare = idxs.filter(i=>!isRarePetResult(ofrendaPullResults[i]));
  const rare = idxs.filter(i=>isRarePetResult(ofrendaPullResults[i]));
  let t = 0;
  nonRare.forEach(i=>{ ofrendaFlipTimers.push(setTimeout(()=>flipOfrendaCard(i), t)); t += 110; });
  t += rare.length ? 450 : 0;
  rare.forEach(i=>{ ofrendaFlipTimers.push(setTimeout(()=>flipOfrendaCard(i), t)); t += 420; });
}
// Cinemática de invocación (2026-10-03, pedido explícito): al otorgar una
// ofrenda se oscurece la pantalla y el Ygdrasil se ilumina; cuando la tirada
// ya está resuelta, la luz toma el color del MEJOR rango de la tanda (pista
// antes de voltear las cartas) y con Épico+ además salen rayos. Se salta con
// un toque. La ilustración es src/assets/ofrenda/invocacion.jpg (horizontal)
// e invocacion_movil.jpg (vertical); mientras no existan, usa la del árbol.
// Devuelve los resultados de la tirada cuando termina (o null si falló).
function playOfrendaCinematic(pullPromise){
  return new Promise(resolve=>{
    const reduce = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    const div = document.createElement('div');
    div.className = 'of-cine';
    const sparks = Array.from({length:18}, (_,i)=>`<i style="--x:${(4+(i*53)%92)}%; --s:${3+(i%4)*2}px; --d:${2.2+(i%5)*0.5}s; --dl:${-((i*0.37)%3).toFixed(2)}s"></i>`).join('');
    div.innerHTML = `
      <picture>
        <source media="(orientation:portrait)" srcset="src/assets/ofrenda/invocacion_movil.jpg?v=1">
        <img class="of-cine-art" src="src/assets/ofrenda/invocacion.jpg?v=1" alt="">
      </picture>
      <div class="of-cine-glow"></div><div class="of-cine-rays"></div><div class="of-cine-beam"></div>
      <div class="of-cine-sparks">${sparks}</div><div class="of-cine-flash"></div>
      <div class="of-cine-hint">Toca para saltar</div>`;
    const art = div.querySelector('.of-cine-art');
    art.onerror = ()=>{ art.onerror = null; div.querySelectorAll('source').forEach(s=>s.remove()); art.src = 'src/assets/ofrenda/ygdrasil.jpg'; };
    document.body.appendChild(div);
    const t0 = performance.now();
    let results = null, ready = false, done = false, skipAsked = false;
    const finish = ()=>{
      if(done) return;
      done = true;
      div.classList.add('out');
      setTimeout(()=> div.remove(), 380);
      resolve(results);
    };
    const reveal = ()=>{
      if(done) return;
      const best = results.reduce((b,r)=> Math.max(b, PET_RARITY_ORDER.indexOf(r.tpl.rarity)), 0);
      div.style.setProperty('--oc', PET_RARITIES[PET_RARITY_ORDER[best]].color);
      div.classList.add('reveal');
      if(results.some(isRarePetResult)) div.classList.add('big');
      setTimeout(finish, reduce ? 500 : 1700);
    };
    pullPromise.then(r=>{
      results = r && r.length ? r : null;
      ready = true;
      if(!results || skipAsked) return finish();
      setTimeout(reveal, Math.max(0, (reduce ? 150 : 1300) - (performance.now() - t0)));
    }).catch(()=>{ ready = true; finish(); });
    div.onclick = ()=>{ if(ready) finish(); else skipAsked = true; };
  });
}
// Colección: total, barra de progreso y cuántos se tienen de cada rango.
function ofrendaCollectionHTML(){
  const have = PET_CATALOG.filter(p=>ownedPetCount(p.id)>0);
  const chips = PET_RARITY_ORDER.map(rk=>{
    const all = PET_CATALOG.filter(p=>p.rarity===rk);
    const n = have.filter(p=>p.rarity===rk).length;
    return `<span class="of-col-chip ${n===all.length?'full':''}" style="--rc:${PET_RARITIES[rk].color}"><i></i>${PET_RARITIES[rk].name} <b>${n}/${all.length}</b></span>`;
  }).join('');
  return `<div class="of-col-head"><span>Colección de Caídos</span><b>${have.length} / ${PET_CATALOG.length}</b></div>
    <div class="of-col-bar"><i style="width:${(have.length/PET_CATALOG.length*100).toFixed(1)}%"></i></div>
    <div class="of-col-chips">${chips}<span class="of-col-eq">${equippedPetIds().length}/${maxPetSlots()} equipados</span></div>`;
}
function updateOfrendaCollection(){
  const el = document.getElementById('of-collection');
  if(el) el.innerHTML = ofrendaCollectionHTML();
}
// Pantalla de Ofrenda (rediseño 2026-10-03, pedido explícito: "hacerlo
// visualmente más agradable"): cabecera con la ilustración del árbol de la
// invocación, colección con barra de progreso, y cada ofrenda como una
// tarjeta con su arte, precio y lo que falta si no alcanza. Las ilustraciones
// de las tarjetas (src/assets/ofrenda/oferta_<oro|sellos>_<x1|x10>.jpg) y el
// reverso de carta (reverso.jpg) son opcionales: sin ellas se ve el emoji.
function renderOfrenda(){
  ensurePets();
  ofrendaPullResults = null;
  const offerHTML = (id, cur, kind)=>{
    const k = GACHA_KINDS[kind];
    const cost = cur==='oro' ? k.gold : k.sellos;
    const gift = k.count - parseInt(kind.slice(1), 10);
    return `<button class="of-offer ${cur} ${kind!=='x1'?'x10':''}" id="${id}">
      ${gift>0 ? `<span class="of-offer-badge">+${gift} de regalo</span>` : ''}
      <span class="of-offer-art"><span class="of-offer-emoji">${kind==='x1'?'🎴':kind==='x10'?'🎴🎴':'🎴🎴🎴'}</span><img src="src/assets/ofrenda/oferta_${cur}_${kind}.jpg?v=1" alt="" onerror="this.remove()"></span>
      <span class="of-offer-name">Ofrenda ${kind}</span>
      <span class="of-offer-sub">${k.count===1?'1 Caído':k.count+' Caídos'}</span>
      <span class="of-offer-price">${cur==='oro'?'⛁':'🎖️'} ${cost.toLocaleString('es')}</span>
      <span class="of-offer-miss"></span>
    </button>`;
  };
  document.getElementById('main-panel').innerHTML = `
    <div class="of-hero">
      <img class="of-hero-art" src="src/assets/ofrenda/invocacion.jpg?v=1" alt="" onerror="this.onerror=null; this.src='src/assets/ofrenda/ygdrasil.jpg'">
      <div class="of-hero-glow"></div>
      <div class="of-hero-sparks">${Array.from({length:10}, (_,i)=>`<i style="--x:${8+(i*37)%84}%; --d:${3+(i%4)*0.8}s; --dl:${-(i*0.6).toFixed(1)}s"></i>`).join('')}</div>
      <button class="reset-btn of-hero-close" id="btn-close-ofrenda">Cerrar</button>
      <div class="of-hero-txt">
        <h3>Otorgar ofrenda</h3>
        <p>El Ygdrasil crece en el corazón de la ciudad. Ofrécele oro o Sellos del Laberinto y te devolverá un Caído para tu colección.</p>
      </div>
    </div>
    <div class="of-collection" id="of-collection">${ofrendaCollectionHTML()}</div>
    <div id="ofrenda-results"></div>
    <div id="of-free"></div>
    <div class="of-group">
      <div class="of-group-head"><span>Con oro</span><b id="of-bal-oro"></b></div>
      <div class="of-offers three">${offerHTML('btn-pull-x1-gold','oro','x1')}${offerHTML('btn-pull-x10-gold','oro','x10')}${offerHTML('btn-pull-x100-gold','oro','x100')}</div>
    </div>
    <div class="of-group">
      <div class="of-group-head"><span>Con Sellos del Laberinto</span><b id="of-bal-sellos"></b></div>
      <div class="of-offers three">${offerHTML('btn-pull-x1-sellos','sellos','x1')}${offerHTML('btn-pull-x10-sellos','sellos','x10')}${offerHTML('btn-pull-x100-sellos','sellos','x100')}</div>
    </div>
    <div class="of-links">
      <button class="reset-btn" id="btn-buy-pulls">💎 Recargar para más tiradas</button>
      <button class="reset-btn" id="btn-pet-rates">Cómo funciona</button>
    </div>
  `;
  document.getElementById('btn-close-ofrenda').onclick = ()=>{ ofrendaOpen=false; renderAll(); };
  document.getElementById('btn-pet-rates').onclick = showPetRates;
  document.getElementById('btn-buy-pulls').onclick = ()=>{
    showOverlay('Recargar tiradas', `
      <p style="margin-top:0;">¿Quieres tiradas extra sin gastar oro ni Sellos? Contacta al administrador por Discord y coordina tu compra — te acredita las ofrendas directo en tu cuenta, listas para reclamar aquí mismo.</p>
      <p style="color:var(--bronze-light);">Discord: <b>xariochix5266</b></p>
    `, ()=>{});
  };
  const allPullBtns = ()=> ['btn-pull-x1-gold','btn-pull-x10-gold','btn-pull-x100-gold','btn-pull-x1-sellos','btn-pull-x10-sellos','btn-pull-x100-sellos'].map(id=>document.getElementById(id))
    .concat([...document.querySelectorAll('#of-free button')]);
  // Ofrendas gratis pendientes (check-in y regalos): se reclaman de a 1, 10 o
  // 100, igual que las pagadas (pedido explícito 2026-10-03: antes solo había
  // "Reclamar todas" y obligaba a abrirlas todas juntas). x10 da exactamente
  // 10 — el "+1 de regalo" es solo de las ofrendas pagadas.
  const renderFree = ()=>{
    const box = document.getElementById('of-free');
    if(!box) return;
    const pending = state.char.pets.pendingFreePulls||0;
    if(pending<=0){ box.innerHTML = ''; return; }
    box.innerHTML = `<div class="of-group">
      <div class="of-group-head"><span>Ofrendas gratis</span><b>🎁 ${pending}</b></div>
      <div class="of-offers three">${[1,10,100].map(n=>`
        <button class="of-offer gratis ${n>1?'x10':''}" data-free="${n}" ${pending<n?'disabled':''}>
          <span class="of-offer-art"><span class="of-offer-emoji">${n===1?'🎁':n===10?'🎁🎁':'🎁🎁🎁'}</span><img src="src/assets/ofrenda/oferta_gratis_x${n}.jpg?v=1" alt="" onerror="this.remove()"></span>
          <span class="of-offer-name">Reclamar x${n}</span>
          <span class="of-offer-sub">${n===1?'1 Caído':n+' Caídos'}</span>
          <span class="of-offer-price">Gratis</span>
          <span class="of-offer-miss">${pending<n?`Tienes ${pending}`:''}</span>
        </button>`).join('')}</div>
      ${![1,10,100].includes(pending) ? `<button class="reset-btn of-free-all" data-free="${pending}">Reclamar las ${pending} de una vez</button>` : ''}
      <div class="of-free-note">Del check-in diario y de regalos del equipo.</div>
    </div>`;
    box.querySelectorAll('[data-free]').forEach(b=>{ b.onclick = ()=> claimFree(parseInt(b.dataset.free, 10)); });
  };
  const claimFree = (n)=>{
    const pending = state.char.pets.pendingFreePulls||0;
    if(!(n>0) || pending<n) return;
    allPullBtns().forEach(b=>b.disabled = true);
    document.getElementById('ofrenda-results').innerHTML = '';
    (async ()=>{
      state.char.pets.pendingFreePulls = pending - n;
      const results = await playOfrendaCinematic(grantFreePetPulls(n));
      ofrendaPullResults = results ? results.map(r=>Object.assign({flipped:false}, r)) : null;
      refreshOfrendaResultsDOM();
      refreshBtnStates();
      updateOfrendaCollection();
    })();
  };
  const refreshBtnStates = ()=>{
    const gold = state.char.gold, sellos = state.char.missionCurrency||0;
    Object.entries(GACHA_KINDS).flatMap(([kind, k])=> [[`btn-pull-${kind}-gold`, gold, k.gold, 'de oro'], [`btn-pull-${kind}-sellos`, sellos, k.sellos, 'Sellos']]).forEach(([id, have, cost, unit])=>{
      const btn = document.getElementById(id);
      btn.disabled = have < cost;
      btn.querySelector('.of-offer-miss').textContent = have < cost ? `Te faltan ${(cost-have).toLocaleString('es')} ${unit}` : '';
    });
    document.getElementById('of-bal-oro').textContent = `⛁ ${gold.toLocaleString('es')}`;
    document.getElementById('of-bal-sellos').textContent = `🎖️ ${sellos.toLocaleString('es')}`;
    renderFree();
  };
  refreshBtnStates();
  const doPull = (kind, payWith)=>{
    const cost = payWith==='sellos' ? GACHA_KINDS[kind].sellos : GACHA_KINDS[kind].gold;
    const have = payWith==='sellos' ? (state.char.missionCurrency||0) : state.char.gold;
    if(have < cost) return;
    allPullBtns().forEach(b=>b.disabled = true);
    document.getElementById('ofrenda-results').innerHTML = '';
    (async ()=>{
      const results = await playOfrendaCinematic(pullGacha(kind, payWith));
      ofrendaPullResults = results ? results.map(r=>Object.assign({flipped:false}, r)) : null;
      refreshOfrendaResultsDOM();
      renderSheet();
      refreshBtnStates();
      updateOfrendaCollection();
    })();
  };
  ofrendaRefreshFree = renderFree;
  if(Date.now() - lastGiftClaimAt > 5000) claimGiftPulls(); // regalos recién enviados
  document.getElementById('btn-pull-x1-gold').onclick = ()=>doPull('x1','gold');
  document.getElementById('btn-pull-x10-gold').onclick = ()=>doPull('x10','gold');
  document.getElementById('btn-pull-x100-gold').onclick = ()=>doPull('x100','gold');
  document.getElementById('btn-pull-x100-sellos').onclick = ()=>doPull('x100','sellos');
  document.getElementById('btn-pull-x1-sellos').onclick = ()=>doPull('x1','sellos');
  document.getElementById('btn-pull-x10-sellos').onclick = ()=>doPull('x10','sellos');
}

/* ============================================================
   RENDER: CHECK-IN DIARIO
   ============================================================ */
function renderCheckin(){
  ensureCheckin();
  const available = checkinAvailable();
  const previewDay = checkinPreviewDay();
  const cycleClaimedDay = checkinCycleClaimedDay();
  const gridHTML = Array.from({length:30}, (_,i)=>i+1).map(day=>{
    const isClaimed = day <= cycleClaimedDay;
    const isNext = available && day===previewDay;
    const cls = isNext ? 'next' : (isClaimed ? 'claimed' : 'locked');
    // Camino de 30 pasos hacia el árbol (rediseño 2026-10-04): cada día es una
    // piedra; los hitos de cada 10 días son más grandes.
    return `<div class="ck-step ${cls} ${day%10===0?'big':''}" title="Día ${day}: ${day} ofrenda(s) gratis">
      <span class="ck-num">${isClaimed ? '✓' : day}</span>
      <span class="ck-gift">🎁${day}</span>
    </div>`;
  }).join('');
  const totalClaimed = Array.from({length:cycleClaimedDay}, (_,i)=>i+1).reduce((a,b)=>a+b, 0);
  document.getElementById('main-panel').innerHTML = `
    <div class="sc-head">
      <h3>📅 Check-in diario</h3>
      <button class="reset-btn" id="btn-close-checkin">Cerrar</button>
    </div>
    <div class="ck-today ${available?'ready':''}">
      <div class="ck-today-txt">
        <b>${available ? `Día ${previewDay} disponible` : `Día ${state.char.checkin.day} reclamado`}</b>
        <span>${available ? `Hoy el árbol te regala ${previewDay} ofrenda(s).` : 'Vuelve mañana desde las 00:01.'}</span>
      </div>
      <button class="btn-main" id="btn-claim-checkin" ${available?'':'disabled'}>${available?`Reclamar 🎁 x${previewDay}`:'Ya reclamado hoy'}</button>
    </div>
    <div class="ck-prog"><i style="width:${(cycleClaimedDay/30*100).toFixed(1)}%"></i></div>
    <div class="ck-prog-txt"><span>${cycleClaimedDay} / 30 días este mes</span><span>${totalClaimed} ofrendas reclamadas</span></div>
    <div class="ck-path">${gridHTML}<div class="ck-tree" title="El árbol de ofrendas">🌳</div></div>
    <p class="sc-note" style="margin-top:10px;">El día N te da N ofrendas gratis. Si faltas un día no pierdes tu progreso, solo se pausa; el camino se reinicia el día 1 de cada mes. Las ofrendas se acumulan en 🌳 Otorgar ofrenda.</p>
  `;
  document.getElementById('btn-close-checkin').onclick = ()=>{ checkinOpen=false; renderAll(); };
  const claimBtn = document.getElementById('btn-claim-checkin');
  if(available){
    claimBtn.onclick = async ()=>{
      await claimCheckin();
      renderCheckin();
    };
  }
}

/* ============================================================
   OPCIONES — volumen de música + atajos de teclado en combate
   ============================================================ */
function renderOptions(){
  const vol = getMusicVolume();
  const muted = getLoginAudioMuted();
  const binds = getKeybinds();
  const rowsHTML = KEYBIND_ACTIONS.map(a=>`
    <div class="inv-item-row" data-keybind-row="${a.id}">
      <div style="min-width:0; flex:1;"><b>${a.label}</b></div>
      <div style="display:flex; align-items:center; gap:8px; flex-shrink:0;">
        <span class="slot-tag" id="keybind-current-${a.id}">${binds[a.id].map(k=>k.toUpperCase()).join(' / ')}</span>
        <button class="inv-btn" data-rebind="${a.id}">Cambiar</button>
      </div>
    </div>`).join('');
  document.getElementById('main-panel').innerHTML = `
    <div style="display:flex; align-items:center; justify-content:space-between; gap:10px; margin-bottom:4px;">
      <h3 style="color:var(--bronze-light);">⚙️ Opciones</h3>
      <button class="reset-btn" id="btn-close-options">Cerrar</button>
    </div>
    <div class="section-label" style="margin-top:4px;">Volumen de música</div>
    <div style="display:flex; align-items:center; gap:10px; margin:8px 0;">
      <span>${muted ? '🔇' : '🔊'}</span>
      <input type="range" id="opt-volume-slider" min="0" max="100" value="${vol}" style="flex:1;" ${muted?'disabled':''}>
      <span id="opt-volume-value" style="min-width:3em; text-align:right;">${vol}%</span>
    </div>
    <button class="inv-btn" id="opt-mute-toggle">${muted ? 'Quitar silencio' : 'Silenciar'}</button>

    <div class="section-label" style="margin-top:16px;">Atajos de teclado en combate</div>
    <p style="color:var(--text-dim); font-size:0.82em; margin-top:0;">Solo funcionan durante un combate activo. "Cambiar" reemplaza ambas teclas por defecto de esa acción por la que presiones a continuación.</p>
    ${rowsHTML}
    <button class="reset-btn" id="opt-reset-keybinds" style="margin-top:10px;">Restablecer atajos por defecto</button>

    <div class="section-label" style="margin-top:18px;">Cuenta</div>
    <div class="opt-account">
      <button class="reset-btn" id="opt-switch-char">👥 Cambiar de personaje</button>
      <button class="reset-btn" id="opt-logout">🚪 Cerrar sesión</button>
      <button class="reset-btn danger-btn" id="opt-delete-char">🗑️ Borrar personaje</button>
    </div>
  `;
  // Acciones de cuenta: siguen cableadas en la barra de arriba (oculta); acá
  // solo se pulsan. Antes estaban sueltas en esa barra y en el menú lateral.
  [['opt-switch-char', 'btn-switch-char'], ['opt-logout', 'btn-slots'], ['opt-delete-char', 'btn-reset']].forEach(([mine, hdr])=>{
    const b = document.getElementById(mine), h = document.getElementById(hdr);
    if(!h || h.style.display === 'none') b.remove(); else b.onclick = ()=> h.click();
  });
  document.getElementById('btn-close-options').onclick = ()=>{ optionsOpen=false; renderAll(); };
  const slider = document.getElementById('opt-volume-slider');
  const valueLabel = document.getElementById('opt-volume-value');
  slider.oninput = ()=>{
    const v = parseInt(slider.value, 10);
    valueLabel.textContent = v + '%';
    setMusicVolume(v);
  };
  document.getElementById('opt-mute-toggle').onclick = ()=>{
    toggleLoginAudioMuted();
    renderOptions();
  };
  document.getElementById('opt-reset-keybinds').onclick = ()=>{
    resetKeybinds();
    renderOptions();
  };
  document.querySelectorAll('[data-rebind]').forEach(btn=>{
    btn.onclick = ()=>{
      const actionId = btn.dataset.rebind;
      btn.textContent = 'Presiona una tecla… (Esc cancela)';
      btn.disabled = true;
      document.querySelectorAll('[data-rebind]').forEach(b=>{ if(b!==btn) b.disabled = true; });
      const capture = (e)=>{
        e.preventDefault();
        document.removeEventListener('keydown', capture, true);
        if(e.key !== 'Escape'){
          setKeybind(actionId, e.key.length===1 ? e.key : e.key.toLowerCase());
        }
        renderOptions();
      };
      document.addEventListener('keydown', capture, true);
    };
  });
}

/* ============================================================
   MISIONES — Gremio
   ============================================================ */
// Rangos de misión permitidos por piso más profundo desbloqueado
// (max_level_unlocked) — DEBE ser un espejo exacto de
// public.mission_allowed_ranks() en Supabase (migración 0007), que es quien
// de verdad decide qué rango acepta insertar el servidor.
//
// BUG CORREGIDO (2026-09-24, reportado por ariochbu vía captura del Gremio
// con "Rango de misión E no permitido para tu progreso actual"): el esquema
// viejo (missionBandForFloor + MISSION_BAND_RANKS, band -2/-1/0) generaba el
// tablón desplazándose entre 5 "bandas" propias de 2 rangos cada una, sin
// relación con las listas reales del servidor (que no son parejas: 2, 4, 4,
// 3, 2 rangos por tramo, y algunas YA NO incluyen los rangos más bajos de la
// banda anterior — p.ej. piso 41-60 permite D/C/B/A pero no E/F). Un
// personaje que subía de piso 40 a 41 seguía recibiendo misiones "fáciles"
// de rango E/F (porque el esquema viejo sí las permitía ahí), el insert
// completo fallaba del lado del servidor, y el tablón quedaba sin poder
// cargar nunca más (ni con Reintentar: cada intento repetía el mismo
// rango prohibido). Ahora los rangos se generan leyendo siempre de la
// lista de permitidos real para ese piso, así que nunca se le puede pedir
// al servidor un rango que ya rechaza.
function missionAllowedRanks(floor){
  if(floor<=20) return ['E','F'];
  if(floor<=40) return ['E','F','D','C'];
  if(floor<=60) return ['D','C','B','A'];
  if(floor<=80) return ['B','A','S'];
  return ['S','SS'];
}
// Ampliado de 3 a 8 tipos - con solo 3, un tablón de 10 caía casi siempre en
// las mismas 2-3 misiones repetidas sin variedad real perceptible.
const MISSION_OBJECTIVE_TYPES = ['kill_elites','clear_floors','defeat_guardian','win_battles','open_chests','rest_bonfires','find_equipment','find_soul_stones'];
const MISSION_OBJECTIVE_LABEL = {
  kill_elites:'élite(s) derrotado(s)',
  clear_floors:'piso(s) del laberinto avanzado(s)',
  defeat_guardian:'guardián(es) de nivel derrotado(s)',
  win_battles:'combate(s) ganado(s) en el laberinto',
  open_chests:'cofre(s) del laberinto abierto(s)',
  rest_bonfires:'hoguera(s) de descanso usada(s)',
  find_equipment:'objeto(s) de equipo encontrado(s)',
  find_soul_stones:'piedra(s) de alma encontrada(s)'
};
const MISSION_OBJECTIVE_TARGET = {
  kill_elites:      {E:1, F:1, D:2, C:2, B:2, A:3, S:3, SS:4},
  clear_floors:     {E:3, F:3, D:4, C:4, B:5, A:5, S:6, SS:8},
  defeat_guardian:  {E:1, F:1, D:1, C:1, B:1, A:1, S:1, SS:1},
  win_battles:      {E:3, F:4, D:5, C:6, B:8, A:10,S:12,SS:15},
  open_chests:      {E:1, F:2, D:2, C:3, B:3, A:4, S:5, SS:6},
  rest_bonfires:    {E:1, F:1, D:2, C:2, B:3, A:3, S:4, SS:5},
  find_equipment:   {E:1, F:2, D:2, C:3, B:4, A:5, S:6, SS:8},
  find_soul_stones: {E:1, F:2, D:2, C:3, B:4, A:5, S:6, SS:8}
};
const MISSION_RANK_REWARD = {
  E:{gold:20, xp:15, currency:3},   F:{gold:35, xp:25, currency:3},
  D:{gold:60, xp:45, currency:6},   C:{gold:90, xp:65, currency:6},
  B:{gold:140,xp:100,currency:12},  A:{gold:200,xp:150,currency:12},
  S:{gold:320,xp:240,currency:24},  SS:{gold:480,xp:360,currency:48}
};

// Las misiones nunca entregan objeto/piedra de rango S o SS de forma
// garantizada — esos rangos se quedan solo en la probabilidad de drop de
// élites ya definida. Y, por ahora, solo la banda 0 (piso 1-20) tiene
// objetos/piedras reales implementados; en bandas más altas (inalcanzables
// hasta liberar los 100 niveles) la misión da Sellos de más en su lugar.
// La rareza que puede tocar ahora depende del piso más profundo que ya
// alcanzaste de verdad (state.char.maxLevelUnlocked — los rangos altos
// siguen gateados por GEAR_TIER_MIN_LEVEL/STONE_TIER_MIN_LEVEL, ver
// comentario ahí: 2026-09-25, fix explícito, antes gateaba por nivel de
// PERSONAJE, que puede desincronizarse del piso real si grindeas nivel sin
// avanzar piso), no de un nivel de referencia por banda.
// Las piedras de alma ya no pueden venir de una misión - solo las entrega un
// jefe de década o (a futuro) un jefe de Rift, a pedido explícito. El rango
// de objeto que sí puede tocar sigue limitado a A (ver refresh_and_insert_missions/
// reroll_mission en Supabase, que ya rechazan tier S/SS del lado del servidor).
function makeMissionItemReward(){
  return generateLoot(rnd(1,4), state.char.maxLevelUnlocked||1);
}

function generateMissionBatch(maxFloor){
  const allowed = missionAllowedRanks(maxFloor);
  const last = allowed.length-1;
  const idxs = [];
  for(let i=0;i<2;i++) idxs.push(0);                 // fácil: el rango más bajo permitido ahora mismo
  for(let i=0;i<6;i++) idxs.push(Math.min(1,last));  // núcleo: un escalón arriba si existe
  for(let i=0;i<2;i++) idxs.push(last);              // reto: el rango más alto permitido ahora mismo
  return idxs.map((allowedIdx, pos)=>{
    const rank = allowed[allowedIdx];
    const objectiveType = pick(MISSION_OBJECTIVE_TYPES);
    const reward = MISSION_RANK_REWARD[rank];
    return {
      rank,
      objective_type: objectiveType,
      objective_target: MISSION_OBJECTIVE_TARGET[objectiveType][rank],
      reward_gold: reward.gold,
      reward_xp: reward.xp,
      reward_currency: reward.currency,
      reward_item: pos===9 ? makeMissionItemReward() : null // solo 1 de las 10 trae objeto/piedra fija
    };
  });
}

// Genera UNA misión candidata para un refresco individual — usa la misma
// distribución de bandas que el tablón completo (20% fácil, 60% núcleo, 20%
// reto), pero nunca trae objeto/piedra fija: el "1 de 10 con recompensa fija"
// se decide solo al armar el tablón completo, no en cada refresco suelto.
function generateSingleMission(maxFloor){
  const allowed = missionAllowedRanks(maxFloor);
  const last = allowed.length-1;
  const roll = Math.random();
  const idx = roll < 0.2 ? 0 : roll < 0.8 ? Math.min(1,last) : last;
  const rank = allowed[idx];
  const objectiveType = pick(MISSION_OBJECTIVE_TYPES);
  const reward = MISSION_RANK_REWARD[rank];
  return {
    rank,
    objective_type: objectiveType,
    objective_target: MISSION_OBJECTIVE_TARGET[objectiveType][rank],
    reward_gold: reward.gold,
    reward_xp: reward.xp,
    reward_currency: reward.currency,
    reward_item: null
  };
}

function currentMissionCycleId(){
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth()+1).padStart(2,'0');
  const d = String(now.getUTCDate()).padStart(2,'0');
  return `${y}${m}${d}${now.getUTCHours()<12 ? 'A' : 'B'}`;
}
function missionRerollsRemaining(){
  if(!state.char.missionRerollCycle || state.char.missionRerollCycle !== currentMissionCycleId()) return 3;
  return Math.max(0, 3 - (state.char.missionRerollCount||0));
}

async function rerollMission(missionId){
  const candidate = generateSingleMission(state.char.maxLevelUnlocked);
  const { data, error } = await supabase.rpc('reroll_mission', {p_mission_id: missionId, p_new_mission: candidate});
  if(error){ log('No se pudo refrescar la misión: '+error.message); renderAll(); return; }
  const idx = (state.missions||[]).findIndex(x=>x.id===missionId);
  if(idx>=0) state.missions[idx] = data.mission;
  state.char.missionRerollCycle = currentMissionCycleId();
  state.char.missionRerollCount = 3 - data.remaining;
  log(`Refrescas una misión del Gremio. Te quedan ${data.remaining} refresco(s) en este tablón.`);
  renderAll();
}

async function loadMissions(){
  if(!state || !state.char) return {rows:[], error:null};
  const batch = generateMissionBatch(state.char.maxLevelUnlocked);
  const { data, error } = await supabase.rpc('refresh_and_insert_missions', {p_character_id: state.char.id, p_missions: batch});
  if(error){ console.error('No se pudo cargar el tablón de misiones:', error.message); return {rows:[], error: error.message}; }
  return {rows: data || [], error: null};
}

async function refreshMissionsState(){
  const result = await loadMissions();
  state.missions = result.rows;
  state.missionsError = result.error;
}

async function advanceMissionsFor(objectiveType, amount){
  if(!state || !state.missions) return;
  const targets = state.missions.filter(m=>m.status==='active' && m.objective_type===objectiveType);
  for(const m of targets){
    const { data, error } = await supabase.rpc('advance_mission', {p_mission_id: m.id, p_amount: amount});
    if(error){ console.error('No se pudo avanzar la misión:', error.message); continue; }
    const idx = state.missions.findIndex(x=>x.id===m.id);
    if(idx>=0) state.missions[idx] = data;
    if(data.status==='completed') log(`Una misión del Gremio está lista para reclamar: ${MISSION_OBJECTIVE_LABEL[data.objective_type]}.`);
  }
}

async function claimMissionReward(missionId){
  // claim_mission devuelve oro/XP/Sellos DEL SERVIDOR y el cliente los
  // adopta tal cual: si había un gasto o ganancia todavía sin guardar (ej.
  // una compra con Sellos en la Tienda hace <1.5s), se perdía o se
  // "devolvía". Bug encontrado 2026-10-02 revisando los Sellos — se guarda
  // primero para que el servidor esté al día.
  if(!(await checkSessionStillActive())) return;
  if(pendingSave) await flushSave();
  const { data, error } = await supabase.rpc('claim_mission', {p_mission_id: missionId});
  if(error){ log('No se pudo reclamar la misión: '+error.message); return; }
  const m = (state.missions||[]).find(x=>x.id===missionId);
  state.char.gold = data.gold;
  state.char.xp = data.xp;
  state.char.missionCurrency = data.mission_currency;
  if(m){
    m.status = 'claimed';
    if(m.reward_item) addToInventory(m.reward_item);
  }
  log('Reclamas la recompensa de una misión del Gremio.');
  applyCharLevelUps();
  renderAll();
  save();
}

function renderMissions(){
  const rows = state.missions || [];
  const rerollsLeft = missionRerollsRemaining();
  const rowsHTML = rows.length ? rows.map(m=>{
    const c = SOUL_TIER_COLORS[m.rank] || 'var(--text)';
    const pct = clamp(m.progress/m.objective_target*100, 0, 100);
    const itemText = m.reward_item ? ` · + ${m.reward_item.name}` : '';
    const canClaim = m.status==='completed';
    const claimed = m.status==='claimed';
    const canReroll = m.status==='active' && rerollsLeft>0;
    // Cada misión es una hoja clavada en el tablón (rediseño 2026-10-04).
    return `<div class="gm-sheet ${canClaim?'done':''} ${claimed?'claimed':''}" style="--rc:${c}; --tilt:${((m.id||'').charCodeAt(0)%5-2)*0.5}deg">
      <i class="gm-pin"></i>
      <div class="gm-rank">${m.rank}</div>
      <div class="gm-goal"><b>${m.objective_target}</b> ${MISSION_OBJECTIVE_LABEL[m.objective_type]}</div>
      <div class="gm-bar"><i style="width:${pct}%"></i></div>
      <div class="gm-prog">${m.progress} / ${m.objective_target}</div>
      <div class="gm-reward">⛁ ${m.reward_gold} · ✦ ${m.reward_xp} xp · 🎖️ ${m.reward_currency}${itemText}</div>
      <div class="gm-btns">
        ${claimed ? '<span class="gm-stamp">Cobrada</span>' : `<button class="inv-btn" data-claim="${m.id}" ${canClaim?'':'disabled'}>Reclamar</button>`}
        ${m.status==='active' ? `<button class="inv-btn gm-reroll" data-reroll="${m.id}" ${canReroll?'':'disabled'} title="Cambiar esta misión por otra">↻</button>` : ''}
      </div>
    </div>`;
  }).join('') : (state.missionsError
    ? `<p class="inv-empty-msg">No se pudo cargar el tablón: ${state.missionsError}</p><button class="inv-btn" id="btn-retry-missions">Reintentar</button>`
    : `<p class="inv-empty-msg">Cargando el tablón de misiones…</p>`);

  const ready = rows.filter(m=>m.status==='completed').length;
  document.getElementById('main-panel').innerHTML = `
    <div class="rk-hero gm-hero">
      <img class="rk-hero-art" src="src/assets/escenas/gremio.jpg?v=1" alt="" onerror="this.remove()">
      <button class="reset-btn rk-close" id="btn-close-missions">Cerrar</button>
      <div class="rk-hero-txt"><h3>Gremio — Tablón de misiones</h3>
        <p>🎖️ <b>${(state.char.missionCurrency||0).toLocaleString('es')}</b> Sellos · cambios de misión: <b>${rerollsLeft}/3</b> · el tablón se renueva cada 12 horas</p></div>
    </div>
    <div class="sc-talk"><b>La maestra del Gremio</b>${ready ? `“Tienes ${ready} contrato(s) cumplido(s). Ven a cobrar.”` : '“Elige una hoja del tablón. Si alguna no te convence, la cambio por otra.”'}</div>
    ${rows.length ? `<div class="gm-board">${rowsHTML}</div>` : rowsHTML}
  `;
  document.getElementById('btn-close-missions').onclick = ()=>{ missionsOpen=false; renderAll(); };
  document.querySelectorAll('[data-claim]').forEach(btn=>{
    btn.onclick = ()=> claimMissionReward(btn.dataset.claim);
  });
  document.querySelectorAll('[data-reroll]').forEach(btn=>{
    btn.onclick = ()=> rerollMission(btn.dataset.reroll);
  });
  const retryBtn = document.getElementById('btn-retry-missions');
  if(retryBtn) retryBtn.onclick = ()=>{ state.missionsError = undefined; renderMissions(); };
  if(!rows.length && state.missionsError===undefined) refreshMissionsState().then(()=>{ if(missionsOpen) renderMissions(); });
}

/* ============================================================
   TABERNA
   ============================================================ */
async function loadAllies(){
  if(!state || !state.char) return [];
  const { data, error } = await supabase.from('character_allies').select('*').eq('character_id', state.char.id).order('created_at');
  if(error){ console.error('No se pudieron cargar los aliados:', error.message); return []; }
  // Mismo refresco de equipo/piedras que el personaje (ver refreshGearFromTemplate/
  // refreshStoneFromTemplate) — un aliado con equipo Rango A dropeado antes del
  // 2026-09-24 también debe quedar con los números vigentes.
  return (data || []).map(row=>{
    row.equip = refreshEquipObject(row.equip || {});
    row.soul_slots = (row.soul_slots || []).map(refreshStoneFromTemplate);
    return row;
  });
}
async function refreshAlliesState(){
  state.char.allies = await loadAllies();
  // Requisito de nivel para equipar (pedido explícito 2026-09-27,
  // retroactivo): cada aliado usa SU PROPIO nivel, no el del jugador — ver
  // stripUnmetLevelEquip/stripUnmetLevelStones.
  for(const row of state.char.allies){
    const strippedGear = stripUnmetLevelEquip(row.equip||(row.equip={}), row.level, row.name, row.role==='sacerdote');
    const strippedStones = stripUnmetLevelStones(row.soul_slots, row.level, row.name);
    if(strippedGear) await saveAllyEquip(row);
    if(strippedStones) await saveAllySoulSlots(row);
    if(strippedGear || strippedStones){
      save();
      if(invOpen) renderInventory();
    }
  }
  // Los aliados recién cargados pueden traer equipo sin uid o con uid repetido.
  const norm = normalizeItemUids();
  if(norm.changed){
    for(const row of norm.allyRows) await saveAllyEquip(row);
    save();
    if(invOpen) renderInventory();
  }
  // Recompensas de equipo de TODOS los Sacerdotes (Delyth, Seraphina y
  // cualquiera que se agregue, la regla es por rol): si por cualquier motivo
  // (guardado perdido, jugador que ya había pasado el hito antes de que
  // existiera el aliado) todavía no tienen el escalón que les corresponde por
  // su nivel o por haber vencido al jefe del piso 30, se les otorga al cargar.
  const tierOrder = ['none','raro','rango_b','rango_a','legendario'];
  for(const row of state.char.allies){
    if(row.role!=='sacerdote') continue;
    // Pedido explícito 2026-10-02: el Arma 1 de Mago es SOLO para Mago. Un
    // Sacerdote que todavía la tenga equipada (de cuando se compartían) la
    // devuelve a la mochila; abajo recibe la suya si ya pasó algún hito.
    if(row.equip && row.equip.arma && row.equip.arma.styleId==='mago'){
      const removed = row.equip.arma;
      row.equip.arma = null;
      state.char.inventory.push(ensureItemUid(removed));
      log(`<b>${row.name}</b> devuelve <b>${removed.name}</b> a la mochila: las armas de Mago ya solo las puede usar un Mago.`);
      await saveAllyEquip(row);
      save();
    }
    const cur = tierOrder.indexOf(row.auto_gear_tier || 'none');
    let want = 0;
    if(row.level>=AUTO_GEAR_LEVEL.rango_b) want = 2; else if(row.level>=AUTO_GEAR_LEVEL.raro) want = 1;
    if((state.char.checkpointLevel||1) > 30) want = Math.max(want, 3);
    // Storm Gush vencido (6 jefes de década): set Tier S. También repone el
    // de quienes lo ganaron antes de la migración 0035 y lo perdieron al recargar.
    if((state.char.bossesBeaten||0) >= 6 || (state.char.checkpointLevel||1) > 60) want = 4;
    if(want > cur) await grantAllyAutoGear(row, tierOrder[want]);
    // Retroactivo (2026-10-02): Sacerdotes que ya pasaron hitos antes de que
    // el Arma 1 formara parte de la recompensa.
    else if(cur>0 && grantSacerdoteArma1(row, tierOrder[cur])){
      log(`<b>${row.name}</b> recibe su arma de Sacerdote ${AUTO_GEAR_TIER_LABEL[tierOrder[cur]]}: <b>${row.equip.arma.name}</b>.`);
      await saveAllyAutoGear(row);
      save();
    }
  }
}

// Cada aliado sube de nivel igual que el personaje (misma curva de
// xpNeededForLevel), pero por su cuenta: recibe el xpGain COMPLETO de cada
// victoria, sin dividirlo entre el equipo - salvo que haya caído en ESE
// combate (hp<=0 en combat.allies), en cuyo caso no gana nada: no peleó.
async function advanceAllyXp(xpGain){
  const allies = state.char.allies;
  if(!allies || !allies.length) return;
  for(const row of allies){
    const combatAlly = combat && combat.allies ? combat.allies.find(a=>a.id===row.id) : null;
    if(combatAlly && combatAlly.hp<=0) continue;
    row.xp = (row.xp||0) + xpGain;
    let needed = xpNeededForLevel(row.level);
    let leveled = false;
    while(row.level < CHAR_LEVEL_CAP && row.xp >= needed){
      row.xp -= needed;
      row.level += 1;
      leveled = true;
      needed = xpNeededForLevel(row.level);
    }
    if(row.level >= CHAR_LEVEL_CAP) row.xp = 0;
    if(leveled) log(`<b>${row.name}</b> sube a nivel ${row.level}.`);
    const { error } = await supabase.from('character_allies').update({level: row.level, xp: row.xp}).eq('id', row.id);
    if(error) console.error('No se pudo guardar el progreso del aliado:', error.message);
    if(leveled) await checkAllyAutoGearByLevel(row);
  }
}

async function hireAlly(templateId){
  const tpl = ALLY_ROSTER.find(t=>t.templateId===templateId);
  if(!tpl) return;
  const cost = allyHireCost(tpl, state.char.level);
  const { data, error } = await supabase.rpc('hire_ally', {
    p_character_id: state.char.id, p_template_id: tpl.templateId, p_role: tpl.role, p_name: tpl.name, p_cost: cost
  });
  if(error){ log('No se pudo reclutar: '+error.message); renderTaberna(); return; }
  state.char.gold -= cost;
  state.char.allies = [...(state.char.allies||[]), data];
  log(`Reclutas a <b>${tpl.name}</b> por ${cost} de oro.`);
  renderAll();
  showAllyRecruitReveal(tpl);
}
// Revelación animada al reclutar (pedido explícito 2026-09-28: "añadir algo
// mas animado al momento de reclutarlo"). Retrato real del aliado (ver
// src/assets/aliados/, mismas tarjetas horizontales que renderTaberna) + su
// bio como "mini-historia" — ambos ya existían en ALLY_ROSTER, solo faltaba
// un momento propio para mostrarlos en vez de una línea más en la Crónica.
function showAllyRecruitReveal(tpl){
  const div = document.createElement('div');
  div.className = 'overlay-msg ally-reveal-backdrop';
  div.innerHTML = `
    <div class="overlay-card ally-reveal-card">
      <div class="ally-reveal-portrait-wrap">
        <img class="ally-reveal-portrait" src="src/assets/aliados/${tpl.templateId}.jpg" alt=""
          onerror="this.parentElement.innerHTML='<span class=\\'ally-reveal-portrait-fallback\\'>${tpl.icon}</span>'">
      </div>
      <div class="ally-reveal-body">
        <div class="ally-reveal-kicker">¡Nuevo aliado reclutado!</div>
        <h2>${tpl.icon} ${tpl.name}</h2>
        <p class="ally-reveal-bio">${tpl.bio}</p>
        <div class="ally-reveal-skill"><b>${tpl.skillName}</b> — ${tpl.skillDesc}</div>
        <button class="btn-main" id="ov-close">¡Bienvenido al grupo!</button>
      </div>
    </div>`;
  document.body.appendChild(div);
  div.querySelector('#ov-close').onclick = ()=> div.remove();
}
// Pedido explícito 2026-09-27: despedir a un aliado (o que deserte por
// impago) ya no lo veta para siempre — siempre se puede volver a reclutar
// más adelante (a nivel 1, ver hireAlly), sin importar en qué términos se fue.
async function dismissAlly(allyId){
  const { error } = await supabase.rpc('dismiss_ally', {p_ally_id: allyId});
  if(error){ log('No se pudo despedir al aliado: '+error.message); return; }
  state.char.allies = (state.char.allies||[]).filter(a=>a.id!==allyId);
  log('Despides a un aliado. Podrás volver a reclutarlo más adelante.');
  renderAll();
}

// Mantenimiento recurrente: cada aliado cobra un salario cada vez que sales
// del laberinto (retirada voluntaria tras un guardián, o expulsión por
// derrota) - no se cobra por entrar ni mientras estás dentro. La satisfacción
// solo se mueve por esto: sube (poco) si le pagas, baja (bastante, y cada vez
// más) si no te alcanza el oro. Si cae a 15% o menos, el aliado deserta y
// abandona el grupo (pedido explícito 2026-09-27: ya no queda vetado para
// siempre, se puede volver a reclutar más adelante igual que si lo despides).
const ALLY_SATISFACTION_DEFAULT = 50;
const ALLY_WAGE_SATISFACTION_GAIN = 2;
const ALLY_WAGE_SATISFACTION_LOSS_BASE = 7;
const ALLY_WAGE_SATISFACTION_LOSS_MAX = 10;
const ALLY_DESERTION_THRESHOLD = 15;
function allyWage(row){
  const tpl = ALLY_ROSTER.find(t=>t.templateId===row.template_id);
  if(!tpl) return 0;
  return Math.round((tpl.baseCost*0.08 + (row.level||1)*3) * (1 - titlePerks().wage));
}
function desertAlly(row, reason){
  state.char.allies = (state.char.allies||[]).filter(a=>a.id!==row.id);
  log(`<b>${row.name}</b> ${reason} y abandona tu grupo. Podrás volver a reclutarlo más adelante.`);
  supabase.rpc('dismiss_ally', {p_ally_id: row.id}).then(({error})=>{
    if(error) console.error('No se pudo procesar la deserción del aliado:', error.message);
  });
}
function payAlliesOnExit(){
  const allies = state.char.allies || [];
  allies.forEach(row=>{
    if(row.satisfaction===undefined || row.satisfaction===null) row.satisfaction = ALLY_SATISFACTION_DEFAULT;
    if(row.missed_payments===undefined || row.missed_payments===null) row.missed_payments = 0;
    const wage = allyWage(row);
    if(state.char.gold >= wage){
      state.char.gold -= wage;
      row.missed_payments = 0;
      row.satisfaction = Math.min(100, row.satisfaction + ALLY_WAGE_SATISFACTION_GAIN);
      log(`Pagas ${wage} de oro a <b>${row.name}</b> por el laberinto. Su satisfacción sube a ${row.satisfaction}%.`);
    } else {
      row.missed_payments += 1;
      const loss = Math.min(ALLY_WAGE_SATISFACTION_LOSS_MAX, ALLY_WAGE_SATISFACTION_LOSS_BASE + (row.missed_payments-1));
      row.satisfaction = Math.max(0, row.satisfaction - loss);
      log(`No te alcanza el oro para pagarle a <b>${row.name}</b>. Su satisfacción baja a ${row.satisfaction}%.`);
    }
    if(row.satisfaction <= ALLY_DESERTION_THRESHOLD){
      desertAlly(row, 'ya no confía en ti');
      return;
    }
    supabase.from('character_allies').update({satisfaction: row.satisfaction, missed_payments: row.missed_payments}).eq('id', row.id).then(({error})=>{
      if(error) console.error('No se pudo guardar la satisfacción del aliado:', error.message);
    });
  });
}

// Puntos y asientos de la Taberna: medidos sobre taberna.jpg (d) y
// taberna_movil.jpg (m). El equipo se dibuja con la ilustración de cada
// aliado SENTADO (src/assets/escenas/aliados/<id>.webp, recortada de un fondo
// magenta; decisión de ariochbu 2026-10-04 tras descartar los sprites de
// combate: "la taberna se ve horrible"). Cada figura se apoya en el borde de
// la mesa: las de cintura para arriba se muestran enteras, y las de cuerpo
// entero (TABERNA_FULL_BODY) se agrandan y se cortan a la cintura para que
// todas queden con la cabeza del mismo tamaño y la mesa les tape las piernas.
const TABERNA_SPOTS = [
  {key:'reclutar', label:'Reclutar',  ic:'🍺', d:[11,44], m:[50,24]},
  {key:'mesa',     label:'Tu equipo', ic:'🪑', d:[60,84], m:[50,79]},
];
// [x, y] = centro horizontal y borde inferior de la figura, en % de la imagen:
// los cuatro van en fila en el banco, detrás de la mesa grande.
const TABERNA_SEATS = [
  {d:[41,69], m:[15,70.5]},
  {d:[54,69], m:[38.5,70.5]},
  {d:[67,69], m:[61.5,70.5]},
  {d:[80,69], m:[85,70.5]},
];
const TABERNA_FULL_BODY = new Set([]); // las diez ya vienen de cintura para arriba
let tabernaPosterIdx = 0; // panfleto que se está viendo al reclutar
let tabernaSection = null; // null = la escena; 'reclutar' | 'mesa' | 'ally:<id>'
function renderTaberna(){
  const panel = document.getElementById('main-panel');
  if(!tavernUnlocked()){
    const why = state.char.level < ALLY_MIN_LEVEL
      ? `La Taberna abre sus puertas a partir del nivel ${ALLY_MIN_LEVEL}${BETA_ALLY_UNLOCKS?' y tras derrotar al Ogro':''}. Vuelve cuando tu personaje sea más experimentado.`
      : 'Nadie en la Taberna se arriesga con un desconocido. Derrota al <b>Ogro</b> (nivel 10) y los mercenarios empezarán a escucharte.';
    panel.innerHTML = `
      <div style="display:flex; align-items:center; justify-content:space-between; gap:10px; margin-bottom:4px;">
        <h3 style="color:var(--bronze-light);">Taberna</h3>
        <button class="reset-btn" id="btn-close-taberna">Cerrar</button>
      </div>
      <p class="inv-empty-msg">${why}</p>
    `;
    document.getElementById('btn-close-taberna').onclick = ()=>{ tabernaOpen=false; renderAll(); };
    return;
  }

  const allies = state.char.allies || [];
  const hiredCardHTML = (a)=>{
    const tpl = ALLY_ROSTER.find(t=>t.templateId===a.template_id) || {};
    const needed = xpNeededForLevel(a.level);
    const xpPct = a.level>=CHAR_LEVEL_CAP ? 100 : clamp((a.xp||0)/needed*100, 0, 100);
    const xpText = a.level>=CHAR_LEVEL_CAP ? 'Nivel máximo' : `${a.xp||0} / ${needed} exp`;
    const satisfaction = a.satisfaction===undefined || a.satisfaction===null ? ALLY_SATISFACTION_DEFAULT : a.satisfaction;
    const satColor = satisfaction>=70 ? 'var(--good)' : satisfaction>=40 ? 'var(--bronze-light)' : 'var(--blood-light)';
    // Elección de arma2 pendiente (progresión automática de equipo del
    // Sacerdote, ver grantAllyAutoGear) — se pregunta una sola vez, la
    // primera vez que se desbloquea algo; después se reaplica sola.
    const autoGearPromptHTML = a.auto_gear_pending ? (()=>{
      const tier = a.auto_gear_tier || 'raro';
      const names = Object.keys((WEAPON_CATALOG.sacerdote||{}).arma2||{});
      const optionsHTML = names.map(name=>{
        const preview = makeWeaponItem('arma2', 'sacerdote', tier, name);
        return `<button class="inv-btn" data-auto-gear-arma2="${a.id}|${name}" style="text-align:left;">
          <b>${name}</b><br><span style="font-size:0.85em;">${preview ? itemBonusText(preview) : ''}</span>
        </button>`;
      }).join('');
      return `<div class="inv-item-bonus" style="margin-top:6px; color:var(--bronze-light); border:1px solid var(--bronze); border-radius:8px; padding:8px;">
        <b>¡Equipo ${AUTO_GEAR_TIER_LABEL[tier]} desbloqueado!</b> Elige el arma2 de ${a.name} (queda fija para los próximos rangos):
        <div style="display:flex; flex-direction:column; gap:6px; margin-top:6px;">${optionsHTML}</div>
      </div>`;
    })() : '';
    return `<div class="ally-card">
      <div class="ally-card-portrait">
        <img src="src/assets/aliados/${a.template_id}.jpg" alt=""
          onerror="this.parentElement.insertAdjacentHTML('afterbegin', '<span class=\\'ally-card-portrait-fallback\\'>${tpl.icon||'⚔️'}</span>'); this.remove();">
        <span class="ally-card-role-badge">${tpl.icon||'⚔️'} ${a.role}</span>
      </div>
      <div class="ally-card-body">
        <h4>${a.name}</h4>
        <div class="ally-card-meta">
          <span class="slot-tag">Nivel ${a.level}</span>
          <span class="slot-tag" style="border-color:${satColor}; color:${satColor};">Satisfacción ${satisfaction}%</span>
        </div>
        <p class="ally-card-bio">${tpl.bio||''}</p>
        ${tpl.skillName ? `<div class="ally-card-skill"><b>${tpl.skillName}</b> — ${tpl.skillDesc}</div>` : ''}
        <div class="bar-track" style="margin-top:2px;"><div class="bar-fill xp" style="width:${xpPct}%"></div></div>
        <div style="font-size:0.7em; color:var(--text-dim);">${xpText}</div>
        <div style="font-size:0.7em; color:var(--text-dim);">Paga ${allyWage(a)} de oro al salir del laberinto.</div>
        ${autoGearPromptHTML}
        <button class="inv-btn danger" data-dismiss="${a.id}">Despedir</button>
      </div>
    </div>`;
  };

  const rosterHTML = ALLY_ROSTER.map(tpl=>{
    const already = allies.some(a=>a.template_id===tpl.templateId);
    const cost = allyHireCost(tpl, state.char.level);
    const full = allies.length >= allyCap();
    const disabled = already || full || state.char.gold < cost;
    let btnLabel = `Reclutar (${cost} oro)`;
    if(already) btnLabel = 'Ya reclutado';
    return `<div class="ally-card${already?' recruited':''}">
      <div class="ally-card-portrait">
        <img src="src/assets/aliados/${tpl.templateId}.jpg" alt=""
          onerror="this.parentElement.insertAdjacentHTML('afterbegin', '<span class=\\'ally-card-portrait-fallback\\'>${tpl.icon}</span>'); this.remove();">
        <span class="ally-card-role-badge">${tpl.icon} ${tpl.role}</span>
        ${already ? `<span class="ally-card-owned-badge">En tu equipo</span>` : ''}
      </div>
      <div class="ally-card-body">
        <h4>${tpl.name}</h4>
        <p class="ally-card-bio">${tpl.bio}</p>
        <div class="ally-card-skill"><b>${tpl.skillName}</b> — ${tpl.skillDesc}</div>
        <button class="inv-btn" data-hire="${tpl.templateId}" ${disabled?'disabled':''}>${btnLabel}</button>
      </div>
    </div>`;
  }).join('');

  // La Taberna es una escena — pedido explícito 2026-10-04: la tabernera te
  // avisa que hay aliados que quieren unirse (reclutar), tu equipo está
  // sentado a la mesa (tocar la mesa = satisfacción de todos; tocar a un
  // aliado = "¿pasa algo?" y ahí la opción de despedir, con confirmación).
  // Los aliados reales se dibujan con su sprite sobre las sillas vacías.
  const famaHTML = BETA_ALLY_UNLOCKS ? `<p class="renown-note">Tu fama: <b>${renownTitle(titleFromChoice(null, myTitleBosses(), !!state.char.firstRetornado))||'Desconocido'}</b>. Cada jefe de década que derrotes te da un cupo más (máximo ${MAX_ALLIES}).</p>` : '';
  if(tabernaSection && tabernaSection.startsWith('ally:') && !allies.some(a=>a.id===tabernaSection.slice(5))) tabernaSection = null;
  if(!tabernaSection){
    const pendingGear = allies.some(a=>a.auto_gear_pending);
    panel.innerHTML = sceneHTML({
      id:'taberna', title:'Taberna', closeId:'btn-close-taberna',
      img:'src/assets/escenas/taberna.jpg?v=2', imgMobile:'src/assets/escenas/taberna_movil.jpg?v=2',
      ratio:'1376/605', ratioMobile:'768/1376', spots:TABERNA_SPOTS,
      keeper:'Shaza la tabernera', line: allies.length < allyCap()
        ? '“Hay aliados que quieren pertenecer a tu equipo. Acércate a la barra.”'
        : '“Tu mesa está completa. Si quieres a alguien más, tendrás que despedir a uno.”',
      aside:`Equipo ${allies.length}/${allyCap()} · ⛁ ${state.char.gold.toLocaleString('es')}`,
      extra:(mobile)=> allies.slice(0, TABERNA_SEATS.length).map((a,i)=>{
        const seat = TABERNA_SEATS[i]; const [x,y] = mobile ? seat.m : seat.d;
        return `<button class="sc-ally ${TABERNA_FULL_BODY.has(a.template_id)?'full':''}" data-sc-ally="${a.id}" style="left:${x}%; top:${y}%;" title="${a.name}">
          <span class="sc-ally-name">${a.name.split(' ')[0]}${a.auto_gear_pending?' ❗':''}</span>
          <span class="sc-ally-fig"><img src="src/assets/escenas/aliados/${a.template_id}.webp?v=2" alt="" onerror="this.remove()"></span></button>`;
      }).join('')
    });
    wireScene((key)=>{ tabernaSection = key; renderTaberna(); });
    document.querySelectorAll('[data-sc-ally]').forEach(b=>{ b.onclick = ()=>{ tabernaSection = 'ally:'+b.dataset.scAlly; renderTaberna(); }; });
    if(pendingGear) log('Un aliado tiene equipo nuevo por elegir: tócalo en la mesa de la Taberna.');
  } else {
    const allyOpen = tabernaSection.startsWith('ally:') ? allies.find(a=>a.id===tabernaSection.slice(5)) : null;
    const satOf = (a)=> a.satisfaction===undefined || a.satisfaction===null ? ALLY_SATISFACTION_DEFAULT : a.satisfaction;
    const satColor = (v)=> v>=70 ? 'var(--good)' : v>=40 ? 'var(--bronze-light)' : 'var(--blood-light)';
    const teamHTML = allies.length ? allies.map(a=>{
      const v = satOf(a);
      return `<button class="tv-row" data-sc-ally="${a.id}">
        <span class="tv-row-fig">${ALLY_TEMPLATE_SPRITES[a.template_id] ? `<img src="${ALLY_TEMPLATE_SPRITES[a.template_id]}" alt="">` : ''}</span>
        <span class="tv-row-txt"><b>${a.name}</b><small>${a.role} · Nivel ${a.level} · cobra ${allyWage(a)} de oro</small>
          <span class="bar-track"><span class="bar-fill" style="display:block; height:100%; width:${v}%; background:${satColor(v)};"></span></span></span>
        <span class="tv-row-sat" style="color:${satColor(v)}">${v}%</span>
      </button>`;
    }).join('') : `<p class="inv-empty-msg">Todavía no has reclutado a nadie. Habla con la tabernera.</p>`;
    // Reclutar (pedido explícito 2026-10-04): la tabernera dice "estos aliados
    // están buscando equipo" y los muestra como panfletos tipo cartel de
    // "se busca", de a uno, pasando con flechas (o deslizando en celular). Cada
    // panfleto lleva el mismo detalle de siempre: rol, historia, habilidad y
    // costo. Solo salen los que aún no están en tu equipo.
    const seekers = ALLY_ROSTER.filter(tpl=> !allies.some(a=>a.template_id===tpl.templateId));
    if(tabernaPosterIdx >= seekers.length) tabernaPosterIdx = 0;
    const full = allies.length >= allyCap();
    const posterHTML = (tpl)=>{
      const cost = allyHireCost(tpl, state.char.level);
      const short = state.char.gold < cost;
      return `<div class="wp-poster">
        <i class="wp-nail"></i>
        <div class="wp-head">Busca equipo</div>
        <div class="wp-photo"><img src="src/assets/aliados/${tpl.templateId}.jpg" alt="" onerror="this.replaceWith('${tpl.icon}')"><span class="wp-role">${tpl.icon} ${tpl.role}</span></div>
        <div class="wp-name">${tpl.name}</div>
        <p class="wp-bio">${tpl.bio}</p>
        <div class="wp-skill"><b>${tpl.skillName}</b>${tpl.skillDesc}</div>
        <div class="wp-meta"><span>${tpl.frontline ? 'Primera línea: recibe los golpes' : 'Retaguardia: ataca desde atrás'}</span></div>
        <div class="wp-price"><small>Contrato</small>⛁ ${cost.toLocaleString('es')}</div>
        <button class="btn-main" data-hire="${tpl.templateId}" ${(full || short)?'disabled':''}>${full ? 'Equipo completo' : short ? `Te faltan ${(cost-state.char.gold).toLocaleString('es')} de oro` : 'Reclutar'}</button>
      </div>`;
    };
    const recruitHTML = seekers.length ? `
      <div class="sc-talk" style="margin:0 0 10px;"><b>Shaza la tabernera</b>${full ? '“Estos buscan equipo, pero tu mesa ya está llena.”' : '“Estos aliados están buscando equipo. Mira sus panfletos.”'}</div>
      ${famaHTML}
      <div class="wp-carousel" id="wp-carousel">
        <button class="wp-arrow" id="wp-prev" title="Anterior" ${seekers.length<2?'disabled':''}>‹</button>
        ${posterHTML(seekers[tabernaPosterIdx])}
        <button class="wp-arrow" id="wp-next" title="Siguiente" ${seekers.length<2?'disabled':''}>›</button>
      </div>
      <div class="wp-dots">${seekers.map((_,i)=>`<i class="${i===tabernaPosterIdx?'on':''}" data-wp-dot="${i}"></i>`).join('')}</div>
      <p class="sc-note" style="text-align:center; margin-top:8px;">Hasta ${allyCap()} aliados a la vez. Pelean junto a ti automáticamente y cobran su salario al salir del laberinto. Un aliado despedido puede volver a reclutarse, a nivel 1.</p>`
      : `<p class="inv-empty-msg">Nadie más busca equipo por ahora.</p>`;
    const body = tabernaSection==='reclutar'
      ? recruitHTML
      : tabernaSection==='mesa'
      ? `<p class="sc-note">Satisfacción de tu equipo. Si no puedes pagarles varias veces seguidas, pierden la confianza y se van. Toca a uno para hablarle.</p>${teamHTML}`
      : `<div class="sc-talk" style="margin:0 0 10px;"><b>${allyOpen.name}</b>“¿Pasa algo?”</div>
         <div class="ally-card-row tv-single">${allies.filter(a=>a===allyOpen).map(a=>hiredCardHTML(a)).join('')}</div>`;
    const title = tabernaSection==='reclutar' ? '🍺 Reclutar' : tabernaSection==='mesa' ? '🪑 Tu equipo' : `💬 ${allyOpen.name}`;
    panel.innerHTML = `
      <div class="sc-head">
        <button class="reset-btn" id="sc-back">‹ La taberna</button>
        <h3>${title}</h3>
        <span class="sc-aside">⛁ ${state.char.gold.toLocaleString('es')}</span>
        <button class="reset-btn" id="btn-close-taberna">Cerrar</button>
      </div>
      <div class="sc-section">${body}</div>`;
    document.getElementById('sc-back').onclick = ()=>{ tabernaSection = null; renderTaberna(); };
    document.querySelectorAll('[data-sc-ally]').forEach(b=>{ b.onclick = ()=>{ tabernaSection = 'ally:'+b.dataset.scAlly; renderTaberna(); }; });
    if(tabernaSection==='reclutar' && seekers.length>1){
      const go = (d)=>{ tabernaPosterIdx = (tabernaPosterIdx + d + seekers.length) % seekers.length; renderTaberna(); };
      document.getElementById('wp-prev').onclick = ()=> go(-1);
      document.getElementById('wp-next').onclick = ()=> go(1);
      document.querySelectorAll('[data-wp-dot]').forEach(dot=>{ dot.onclick = ()=>{ tabernaPosterIdx = parseInt(dot.dataset.wpDot, 10); renderTaberna(); }; });
      // deslizar en celular
      const car = document.getElementById('wp-carousel');
      let x0 = null;
      car.addEventListener('touchstart', (e)=>{ x0 = e.touches[0].clientX; }, {passive:true});
      car.addEventListener('touchend', (e)=>{ if(x0===null) return; const dx = e.changedTouches[0].clientX - x0; x0 = null; if(Math.abs(dx) > 45) go(dx<0 ? 1 : -1); });
    }
  }
  document.getElementById('btn-close-taberna').onclick = ()=>{ tabernaOpen=false; tabernaSection = null; renderAll(); };
  document.querySelectorAll('[data-hire]').forEach(btn=>{
    btn.onclick = ()=> hireAlly(btn.dataset.hire);
  });
  document.querySelectorAll('[data-dismiss]').forEach(btn=>{
    btn.onclick = ()=>{
      const a = allies.find(x=>x.id===btn.dataset.dismiss);
      if(!a) return;
      if(!confirm(`¿Despedir a ${a.name}? Perderá su nivel: si lo vuelves a reclutar empieza en nivel 1. El equipo y las piedras que lleva vuelven contigo solo si se los quitas antes.`)) return;
      tabernaSection = null;
      dismissAlly(a.id);
    };
  });
  document.querySelectorAll('[data-auto-gear-arma2]').forEach(btn=>{
    btn.onclick = ()=>{
      const [allyId, name] = btn.dataset.autoGearArma2.split('|');
      chooseAllyAutoGearArma2(allyId, name);
    };
  });
}

/* ============================================================
   RENDER: RANKING
   ============================================================ */
// Ranking (rediseño 2026-10-04, pedido explícito: "muy mejorable, adicional
// hacer un ranking de Caídos del Laberinto con el número de 1/100"). Dos
// tablones: Laberinto (récord más hondo) y Caídos (colección). Los 3 primeros
// van en podio. El de Caídos lee la vista leaderboard_caidos_top10 (migración
// 0030); si aún no existe, lo dice en vez de quedar vacío.
let rankingTab = 'laberinto';
async function renderRanking(){
  const panel = document.getElementById('main-panel');
  const myCaidos = PET_CATALOG.filter(pt=>ownedPetCount(pt.id)>0).length;
  panel.innerHTML = `
    <div class="rk-hero">
      <img class="rk-hero-art" src="src/assets/escenas/ranking.jpg?v=1" alt="" onerror="this.remove()">
      <button class="reset-btn rk-close" id="btn-close-ranking">Cerrar</button>
      <div class="rk-hero-txt"><h3>Salón de los Nombres</h3><p>Aquí se graban los que más hondo bajaron y los que más Caídos reunieron.</p></div>
    </div>
    <div class="rk-tabs">
      <button class="${rankingTab==='laberinto'?'on':''}" data-rk="laberinto">⚔️ Laberinto</button>
      <button class="${rankingTab==='caidos'?'on':''}" data-rk="caidos">🌳 Caídos</button>
    </div>
    <div class="rk-mine">${rankingTab==='laberinto'
      ? `Tu récord: <b>${describeRecord()}</b>`
      : `Tu colección: <b>${myCaidos} / ${PET_CATALOG.length}</b> Caídos`}</div>
    <div id="ranking-list"><p class="inv-empty-msg">Cargando ranking…</p></div>
  `;
  document.getElementById('btn-close-ranking').onclick = ()=>{ rankingOpen=false; renderAll(); };
  panel.querySelectorAll('[data-rk]').forEach(b=>{ b.onclick = ()=>{ rankingTab = b.dataset.rk; renderRanking(); }; });

  const tab = rankingTab;
  const { data, error } = await supabase.from(tab==='caidos' ? 'leaderboard_caidos_top10' : 'leaderboard_top10').select('*');
  const list = document.getElementById('ranking-list');
  if(!list || rankingTab!==tab) return; // el jugador salió o cambió de tablón antes de que llegara la respuesta
  if(error){
    list.innerHTML = `<p class="inv-empty-msg">${tab==='caidos' ? 'El tablón de Caídos todavía no está disponible (falta correr la migración 0030).' : 'No se pudo cargar el ranking global.'}</p>`;
    return;
  }
  if(!data || !data.length){
    list.innerHTML = `<p class="inv-empty-msg">Nadie ha registrado un récord todavía. ¡Sé el primero!</p>`;
    return;
  }
  const score = (row)=> tab==='caidos' ? `<b>${row.caidos} / ${PET_CATALOG.length}</b><small>Caídos reunidos</small>` : `<b>Nivel ${row.record_level}</b><small>Piso ${row.record_floor_idx}${row.record_turns ? ` · guardián en ${row.record_turns} turno${row.record_turns===1?'':'s'}` : ''}</small>`;
  const face = (row)=>{
    const src = row.style && row.race ? playerSpriteFor(row.style, row.race) : null;
    return src ? `<img src="${src}" alt="">` : `<em>${(row.nickname||'?').charAt(0).toUpperCase()}</em>`;
  };
  const isMine = (row)=> row.nickname.toLowerCase() === state.char.nickname.toLowerCase();
  const fame = (row)=> (row.record_level ? renownBadge(titleFromChoice(row.title_choice, decadeBossesBeaten(1, row.record_level, row.bosses_beaten), !!row.first_retornado)) : '') + mythicBadge(!!row.has_mythic);
  const podium = data.slice(0,3).map((row,i)=>`
    <div class="rk-pod p${i+1} ${isMine(row)?'mine':''}">
      <div class="rk-medal">${['🥇','🥈','🥉'][i]}</div>
      <div class="rk-face">${face(row)}</div>
      <div class="rk-name">${row.nickname}${isMine(row)?' (tú)':''}</div>
      <div class="rk-fame">${fame(row)}</div>
      <div class="rk-score">${score(row)}</div>
    </div>`).join('');
  const rest = data.slice(3).map((row,i)=>`
    <div class="rk-row ${isMine(row)?'mine':''}">
      <span class="rk-pos">${i+4}</span>
      <span class="rk-face sm">${face(row)}</span>
      <span class="rk-row-name">${row.nickname}${fame(row)}${isMine(row)?' (tú)':''}</span>
      <span class="rk-row-score">${score(row)}</span>
    </div>`).join('');
  list.innerHTML = `<div class="rk-podium">${podium}</div>${rest}`;
}

/* ============================================================
   RENDER: ADMIN
   Solo visible para cuentas con role='admin' (ver profiles.role en la
   base de datos). Las políticas RLS del lado del servidor son la
   protección real; esta pantalla es solo la interfaz para usarlas.
   ============================================================ */
async function renderAdmin(){
  const panel = document.getElementById('main-panel');
  panel.innerHTML = `
    <div style="display:flex; align-items:center; justify-content:space-between; gap:10px; margin-bottom:4px;">
      <h3 style="color:var(--bronze-light);">Panel admin</h3>
      <button class="reset-btn" id="btn-close-admin">Cerrar</button>
    </div>
    <p style="color:var(--text-dim); font-size:0.85em; margin-top:0;">Gestiona cuentas de jugadores. Los cambios de rol y de baneo quedan protegidos por la base de datos: solo una cuenta admin puede aplicarlos.</p>
    <p id="admin-msg" style="color:var(--blood-light); font-size:0.85em; min-height:1.2em;"></p>

    <div class="section-label" style="margin-top:0;">Actividad sospechosa</div>
    <p style="color:var(--text-dim); font-size:0.82em; margin:0 0 8px;">Jefes de década o guardianes de piso (nivel 11+) derrotados en 4 turnos propios o menos — a ese ritmo no se puede ganar de forma legítima. Es una señal para revisar, no una prueba: el turno lo cuenta el propio cliente, así que confirmá antes de suspender.</p>
    <div class="admin-toolbar">
      <label><input type="checkbox" id="flag-only-decade" ${adminPrefs.onlyDecade?'checked':''}> Solo jefes de década</label>
      <label>Turnos máx. <select id="flag-max-turns">${[4,3,2,1].map(n=>`<option value="${n}" ${adminPrefs.maxTurns===n?'selected':''}>${n}</option>`).join('')}</select></label>
      <button class="inv-btn danger" id="flag-clear-visible">Descartar todo lo visible</button>
    </div>
    <div id="flagged-kills-list"><p class="inv-empty-msg">Cargando alertas…</p></div>

    <div class="section-label">Cuentas</div>
    <div class="admin-toolbar">
      <input type="search" id="admin-search" placeholder="Buscar cuenta o personaje…" value="${(adminPrefs.search||'').replace(/"/g,'&quot;')}">
      <button class="inv-btn" id="admin-collapse-all">Plegar todo</button>
    </div>
    <div id="admin-list"><p class="inv-empty-msg">Cargando cuentas…</p></div>
  `;
  document.getElementById('flag-only-decade').onchange = (e)=>{ adminPrefs.onlyDecade = e.target.checked; saveAdminPrefs(); loadFlaggedKills(); };
  document.getElementById('flag-max-turns').onchange = (e)=>{ adminPrefs.maxTurns = parseInt(e.target.value,10); saveAdminPrefs(); loadFlaggedKills(); };
  document.getElementById('flag-clear-visible').onclick = async ()=>{
    const ids = (lastFlagsShown||[]).map(f=>f.id);
    if(!ids.length) return;
    if(!confirm(`¿Descartar las ${ids.length} alerta(s) visibles? Se borran de la base.`)) return;
    await deleteFlags(ids);
  };
  let searchTimer = null;
  document.getElementById('admin-search').oninput = (e)=>{
    adminPrefs.search = e.target.value; saveAdminPrefs();
    clearTimeout(searchTimer); searchTimer = setTimeout(loadAdminList, 250);
  };
  document.getElementById('admin-collapse-all').onclick = ()=>{ adminOpenAccounts.clear(); loadAdminList(); };
  document.getElementById('btn-close-admin').onclick = ()=>{ adminOpen=false; renderAll(); };
  await Promise.all([loadAdminList(), loadFlaggedKills()]);
}

// Preferencias del panel admin (por navegador): filtros de alertas y
// búsqueda de cuentas. Las cuentas abiertas se recuerdan mientras dure la
// sesión para que no se plieguen solas tras cada acción.
const adminPrefs = (()=>{ try{ return Object.assign({onlyDecade:false, maxTurns:4, search:''}, JSON.parse(localStorage.getItem('dsAdminPrefs')||'{}')); }catch(e){ return {onlyDecade:false, maxTurns:4, search:''}; } })();
function saveAdminPrefs(){ try{ localStorage.setItem('dsAdminPrefs', JSON.stringify(adminPrefs)); }catch(e){} }
const adminOpenAccounts = new Set();
const adminOpenFlagGroups = new Set();
let lastFlagsShown = [];
async function deleteFlags(ids){
  const msg = document.getElementById('admin-msg');
  const { error } = await supabase.from('flagged_boss_kills').delete().in('id', ids);
  if(msg) msg.textContent = error ? ('No se pudo descartar: ' + error.message + ' (¿corriste la migración 0029?)') : '';
  await loadFlaggedKills();
}

// Alertas agrupadas por personaje (2026-10-02, pedido explícito: con el
// aumento de daño la lista crecía sin parar). Filtros: solo jefes de
// década y un tope de turnos; cada grupo/alerta se puede descartar.
async function loadFlaggedKills(){
  const el = document.getElementById('flagged-kills-list');
  if(!el) return;
  let q = supabase.from('flagged_boss_kills').select('*').lte('turns', adminPrefs.maxTurns||4).order('created_at', {ascending:false}).limit(300);
  if(adminPrefs.onlyDecade) q = q.eq('kind','jefe_decada');
  const { data, error } = await q;
  if(error){ el.innerHTML = `<p class="inv-empty-msg">No se pudo cargar (¿corriste la migración 0017?): ${error.message}</p>`; return; }
  lastFlagsShown = data || [];
  if(!lastFlagsShown.length){ el.innerHTML = `<p class="inv-empty-msg">Sin alertas con estos filtros.</p>`; return; }
  const groups = new Map();
  lastFlagsShown.forEach(f=>{ if(!groups.has(f.character_id)) groups.set(f.character_id, []); groups.get(f.character_id).push(f); });
  el.innerHTML = [...groups.entries()].map(([cid, fs])=>{
    const decade = fs.filter(f=>f.kind==='jefe_decada').length;
    const minTurns = Math.min(...fs.map(f=>f.turns));
    const last = new Date(fs[0].created_at).toLocaleString();
    return `<details class="admin-acc" data-flag-group="${cid}" ${adminOpenFlagGroups.has(cid)?'open':''}>
      <summary>
        <span><b>${fs[0].nickname}</b> <span class="slot-tag" style="border-color:var(--blood-light); color:var(--blood-light);">${fs.length} alerta(s)</span>
        ${decade?`<span class="slot-tag">${decade} jefe(s) de década</span>`:''}
        <span class="inv-item-bonus neutral" style="display:inline;">mín. ${minTurns} turno(s) · última ${last}</span></span>
      </summary>
      <div style="display:flex; gap:8px; flex-wrap:wrap; margin:6px 0 6px 18px;">
        <button class="inv-btn" data-flag-dismiss-group="${cid}">Descartar todas</button>
        <button class="inv-btn danger" data-flag-ban="${fs[0].user_id}">Suspender cuenta</button>
      </div>
      ${fs.map(f=>`<div class="inv-item-row" style="margin-left:18px;">
        <div class="inv-item-bonus neutral">${f.kind==='jefe_decada'?'<b>Jefe de década</b>':'Guardián de piso'} · Nivel ${f.dungeon_level} en ${f.turns} turno(s) · ${new Date(f.created_at).toLocaleString()}</div>
        <button class="inv-btn" data-flag-dismiss="${f.id}" title="Descartar esta alerta">✕</button>
      </div>`).join('')}
    </details>`;
  }).join('');
  const msg = document.getElementById('admin-msg');
  el.querySelectorAll('details[data-flag-group]').forEach(d=>{
    d.addEventListener('toggle', ()=>{ if(d.open) adminOpenFlagGroups.add(d.dataset.flagGroup); else adminOpenFlagGroups.delete(d.dataset.flagGroup); });
  });
  el.querySelectorAll('[data-flag-dismiss]').forEach(btn=>{
    btn.onclick = async ()=>{ btn.disabled = true; await deleteFlags([btn.dataset.flagDismiss]); };
  });
  el.querySelectorAll('[data-flag-dismiss-group]').forEach(btn=>{
    btn.onclick = async ()=>{ btn.disabled = true; await deleteFlags(groups.get(btn.dataset.flagDismissGroup).map(f=>f.id)); };
  });
  el.querySelectorAll('[data-flag-ban]').forEach(btn=>{
    btn.onclick = async ()=>{
      if(!confirm('¿Suspender esta cuenta?')) return;
      btn.disabled = true;
      const { error: banError } = await supabase.from('profiles').update({ is_banned: true }).eq('id', btn.dataset.flagBan);
      if(msg) msg.textContent = banError ? 'No se pudo suspender: ' + banError.message : '';
      await Promise.all([loadAdminList(), loadFlaggedKills()]);
    };
  });
}

// Pendientes = las del árbol (pets) + regaladas aún sin cobrar (gift_pulls).
function pendingPullsOf(c){ return ((c.pets&&c.pets.pendingFreePulls)||0) + (c.gift_pulls||0); }
async function loadAdminList(){
  const list = document.getElementById('admin-list');
  const msg = document.getElementById('admin-msg');
  const [profilesRes, charsRes] = await Promise.all([
    supabase.from('profiles').select('id, username, is_banned, created_at').order('created_at', { ascending: false }).limit(100),
    supabase.from('characters').select('id, user_id, nickname, role, hidden_from_leaderboard, level, record_level, record_floor_idx, pets, dungeon, gift_pulls').order('slot_number')
      .then(r=> r.error ? supabase.from('characters').select('id, user_id, nickname, role, hidden_from_leaderboard, level, record_level, record_floor_idx, pets, dungeon').order('slot_number') : r)
  ]);
  const { data, error } = profilesRes;
  if(!list) return; // el jugador cerró el panel antes de que llegara la respuesta
  if(error || charsRes.error){
    list.innerHTML = `<p class="inv-empty-msg">No se pudo cargar la lista de cuentas.</p>`;
    return;
  }
  const chars = charsRes.data || [];
  const charsByUser = new Map();
  chars.forEach(c=>{
    if(!charsByUser.has(c.user_id)) charsByUser.set(c.user_id, []);
    charsByUser.get(c.user_id).push(c);
  });

  const term = (adminPrefs.search||'').trim().toLowerCase();
  const visible = !term ? data : data.filter(p=> (p.username||'').toLowerCase().includes(term) || (charsByUser.get(p.id)||[]).some(c=>(c.nickname||'').toLowerCase().includes(term)));
  list.innerHTML = visible.map(p=>{
    const isSelf = p.id === currentUser.id;
    const bannedLabel = p.is_banned ? 'Suspendida' : 'Activa';
    const created = new Date(p.created_at).toLocaleDateString();
    const myChars = charsByUser.get(p.id) || [];
    const charsHTML = myChars.length ? myChars.map(c=>{
      const isLoaded = c.id === state.char.id;
      return `<div class="inv-item-row" style="margin-left:18px;">
        <div>
          <b>${c.nickname}</b> <span class="slot-tag">${c.role}</span>${c.hidden_from_leaderboard ? ' <span class="slot-tag">Oculto del ranking</span>' : ''}
          <div class="inv-item-bonus neutral">Nivel ${c.level} · Récord: Nivel ${c.record_level} · Piso ${c.record_floor_idx}</div>
        </div>
        <div style="display:flex; gap:8px; flex-shrink:0; flex-wrap:wrap;">
          <button class="inv-btn" data-toggle-role="${c.id}" ${isLoaded?'disabled title="No puedes quitarte el rol admin al personaje con el que jugaste esta sesión"':''}>${c.role==='admin'?'Quitar admin':'Hacer admin'}</button>
          <button class="inv-btn" data-toggle-ranking="${c.id}">${c.hidden_from_leaderboard?'Mostrar en ranking':'Ocultar del ranking'}</button>
          <button class="inv-btn" data-grant-pulls="${c.id}" title="Ofrendas gratis pendientes: ${pendingPullsOf(c)}">🎁 Dar tiradas</button>
          <button class="inv-btn" data-return-city="${c.id}" ${c.dungeon?'':'disabled title="No está dentro del laberinto ahora mismo"'}>🏙️ Devolver a la ciudad</button>
          <button class="inv-btn danger" data-delete-char="${c.id}">Eliminar personaje</button>
        </div>
      </div>`;
    }).join('') : `<p class="inv-empty-msg" style="margin-left:18px;">Sin personajes.</p>`;
    // Plegable (2026-10-02): los personajes solo se muestran al abrir la
    // cuenta; con búsqueda activa se abren solas las que coinciden.
    const open = adminOpenAccounts.has(p.id) || (term && myChars.some(c=>(c.nickname||'').toLowerCase().includes(term)));
    const names = myChars.map(c=>`${c.nickname} (${c.level})`).join(', ');
    return `<details class="inv-slot admin-acc" data-acc="${p.id}" ${open?'open':''}>
      <summary>
        <span><b>${p.username}</b> <span class="slot-tag" style="${p.is_banned?'color:var(--blood-light); border-color:rgba(178,68,68,0.4);':'color:var(--good);'}">${bannedLabel}</span>
        <span class="inv-item-bonus neutral" style="display:inline;">Creada: ${created} · ${myChars.length} personaje(s)${names?': '+names:''}</span></span>
        <button class="inv-btn ${p.is_banned?'':'danger'}" data-toggle-ban="${p.id}" ${isSelf?'disabled title="No puedes suspender tu propia cuenta"':''}>${p.is_banned?'Reactivar':'Suspender'}</button>
      </summary>
      ${charsHTML}
    </details>`;
  }).join('') || `<p class="inv-empty-msg">${term?'Ninguna cuenta coincide con la búsqueda.':'No hay cuentas registradas.'}</p>`;
  list.querySelectorAll('details[data-acc]').forEach(d=>{
    d.addEventListener('toggle', ()=>{ if(d.open) adminOpenAccounts.add(d.dataset.acc); else adminOpenAccounts.delete(d.dataset.acc); });
  });

  list.querySelectorAll('[data-toggle-ban]').forEach(btn=>{
    btn.onclick = async (ev)=>{
      ev.preventDefault();
      const id = btn.dataset.toggleBan;
      const target = data.find(p=>p.id===id);
      btn.disabled = true;
      const { error } = await supabase.from('profiles').update({ is_banned: !target.is_banned }).eq('id', id);
      if(error) msg.textContent = 'No se pudo actualizar: ' + error.message;
      else msg.textContent = '';
      await loadAdminList();
    };
  });
  list.querySelectorAll('[data-toggle-role]').forEach(btn=>{
    btn.onclick = async ()=>{
      const id = btn.dataset.toggleRole;
      const target = chars.find(c=>c.id===id);
      const newRole = target.role === 'admin' ? 'player' : 'admin';
      btn.disabled = true;
      const { error } = await supabase.from('characters').update({ role: newRole }).eq('id', id);
      if(error) msg.textContent = 'No se pudo actualizar: ' + error.message;
      else msg.textContent = '';
      await loadAdminList();
    };
  });
  list.querySelectorAll('[data-toggle-ranking]').forEach(btn=>{
    btn.onclick = async ()=>{
      const id = btn.dataset.toggleRanking;
      const target = chars.find(c=>c.id===id);
      btn.disabled = true;
      const { error } = await supabase.from('characters').update({ hidden_from_leaderboard: !target.hidden_from_leaderboard }).eq('id', id);
      if(error) msg.textContent = 'No se pudo actualizar: ' + error.message;
      else msg.textContent = '';
      await loadAdminList();
    };
  });
  // Otorgar tiradas gratis (2026-09-25, pedido explícito: pagos por
  // criptomonedas se acreditan a mano acá, fuera de la Tienda) — se suman a
  // pets.pendingFreePulls del PERSONAJE elegido (no del admin), el mismo
  // campo que usa el check-in diario; el jugador las reclama él mismo frente
  // al árbol la próxima vez que entre, con la animación normal.
  list.querySelectorAll('[data-grant-pulls]').forEach(btn=>{
    btn.onclick = async ()=>{
      const id = btn.dataset.grantPulls;
      const target = chars.find(c=>c.id===id);
      const typed = prompt(`¿Cuántas ofrendas gratis le das a "${target.nickname}"? (Pendientes actuales: ${pendingPullsOf(target)})`, '1');
      if(typed === null) return;
      const n = parseInt(typed, 10);
      if(!Number.isFinite(n) || n<=0){ msg.textContent = 'Ingresa un número mayor a 0.'; return; }
      btn.disabled = true;
      // Vía RPC a gift_pulls (0029): el jugador las cobra solo, aunque esté
      // conectado en este momento (antes su propio guardado las pisaba).
      // Solo se da por enviado tras RELEER el personaje y comprobar que sus
      // pendientes subieron en n (pedido explícito 2026-10-03: hubo regalos que
      // el servidor rechazaba y el panel no dejaba claro que habían fallado).
      // Se compara la suma árbol + regaladas, que no cambia si el jugador las
      // cobra justo en ese momento.
      const readPending = async ()=>{
        const { data, error } = await supabase.from('characters').select('pets, gift_pulls').eq('id', id).single();
        return error || !data ? null : pendingPullsOf(data);
      };
      const before = await readPending();
      const { error } = await supabase.rpc('admin_grant_pulls', { p_char: id, p_n: n });
      const after = error ? null : await readPending();
      const ok = !error && before !== null && after !== null && after >= before + n;
      let okText = '';
      if(ok) okText = `✔ Enviado con éxito: ${n} ofrenda(s) gratis para ${target.nickname} (pendientes: ${before} → ${after}). Le llegan en menos de 1 minuto si está conectado, o al entrar.`;
      else if(error) msg.textContent = `✖ Ocurrió un error: no se enviaron las ofrendas a ${target.nickname} (${error.message}${/admin_grant_pulls/.test(error.message) ? ' — falta correr la migración 0029' : ''}).`;
      else msg.textContent = `✖ Ocurrió un error: el envío a ${target.nickname} no dio fallo, pero no se pudo confirmar que se contabilizara (pendientes antes: ${before===null?'?':before}, ahora: ${after===null?'?':after}). Revisa antes de volver a enviar.`;
      if(ok){ // en verde; los errores quedan en el rojo normal del panel
        const sp = document.createElement('span');
        sp.style.color = 'var(--good)'; sp.textContent = okText;
        msg.textContent = ''; msg.appendChild(sp);
      }
      await loadAdminList();
      // El mensaje vive arriba del panel: con la lista larga quedaba fuera de
      // pantalla y un fallo pasaba por "enviado" (2026-10-03).
      msg.scrollIntoView({block:'center'});
    };
  });
  // Devolver a la ciudad (pedido explícito 2026-09-27, para no tener que
  // correr SQL a mano cada vez que alguien queda atrapado en un piso sin
  // contenido real, como pasó con el checkpoint 61): limpia dungeon por
  // completo, exactamente lo mismo que ya le pedí a ariochbu correr en el
  // caso de Trinity, ahora como botón. Si el personaje que tiene la sesión
  // abierta ahora mismo es el afectado, no se refresca solo — recién se
  // nota la próxima vez que cargue (no hay forma de "empujarle" el estado
  // a su cliente desde acá).
  list.querySelectorAll('[data-return-city]').forEach(btn=>{
    btn.onclick = async ()=>{
      const id = btn.dataset.returnCity;
      const target = chars.find(c=>c.id===id);
      if(!confirm(`¿Devolver a "${target.nickname}" a la ciudad? Sale del laberinto de inmediato (como si se hubiera retirado), sin perder equipo ni oro.`)) return;
      btn.disabled = true;
      const { error } = await supabase.from('characters').update({ dungeon: null }).eq('id', id);
      if(error) msg.textContent = 'No se pudo devolver a la ciudad: ' + error.message;
      else msg.textContent = `${target.nickname} vuelve a la ciudad.`;
      await loadAdminList();
      msg.scrollIntoView({block:'center'});
    };
  });
  list.querySelectorAll('[data-delete-char]').forEach(btn=>{
    btn.onclick = async ()=>{
      const id = btn.dataset.deleteChar;
      const target = chars.find(c=>c.id===id);
      if(!confirm(`¿Eliminar el personaje "${target.nickname}"? Esta acción no se puede deshacer.`)) return;
      const typed = prompt(`Para confirmar, escribe exactamente el nombre del personaje "${target.nickname}":`);
      if(typed === null) return;
      if(typed.trim().toLowerCase() !== target.nickname.toLowerCase()){
        msg.textContent = 'El nombre no coincide. No se eliminó nada.';
        return;
      }
      btn.disabled = true;
      const { error } = await supabase.from('characters').delete().eq('id', id);
      if(error) msg.textContent = 'No se pudo eliminar: ' + error.message;
      else msg.textContent = '';
      await loadAdminList();
    };
  });
}

/* ============================================================
   RENDER: TIENDA (SHOP)
   ============================================================ */
const SHOP_ROLE_LABELS = {pesada:'Guerrero', doblefilo:'Asesino', tirador:'Arquero', mago:'Mago', sacerdote:'Sacerdote', paladin:'Paladín', hechicero:'Hechicero'};
let shopWeaponRole = null; // null = usa tu propia senda por defecto
let shopGoldTierFilter = 'todos'; // filtro de rareza de la tienda de oro (comun/poco_comun/raro)
let shopSelloTierFilter = 'todos'; // filtro de rango de la tienda de Sellos (rango_b/rango_a)
let shopSetFilter = 'jack'; // conjunto que se muestra en la Tienda de Sellos (2026-10-02)
const shopPotionQty = {}; // potionId -> cantidad elegida en el desplegable (x1/x10/x100), default 1
// Cada arma con nombre propio ahora tiene su propio bono/especial por rango
// (ver WEAPON_CATALOG), así que la tienda ya no puede mostrar "una fila por
// slot" con un bono genérico — lista cada nombre como su propia fila,
// generando un objeto de vista previa con makeWeaponItem() para reutilizar
// exactamente el mismo texto que vería el jugador si la comprara.
function weaponShopRows(slot, rank, rankTag, dataAttr, price){
  const cat = WEAPON_CATALOG[shopWeaponRole];
  if(!cat || !cat[slot]) return '';
  return Object.keys(cat[slot]).map(name=>{
    const preview = makeWeaponItem(slot, shopWeaponRole, rank, name);
    if(!preview) return '';
    return `<div class="inv-item-row" style="${rarityRowStyle(preview)}">
      ${itemRowCompact(preview)}
      <button class="inv-btn" data-${dataAttr}="${slot}|${name}" ${state.char.gold<price?'disabled':''}>Comprar (${price} oro)</button>
    </div>`;
  }).join('');
}

// ============================================================
// ESCENAS CON PUNTOS (2026-10-04) — pieza reutilizable para los lugares de la
// ciudad: una ilustración de fondo (horizontal en escritorio, vertical en
// celular), puntos que se tocan (coordenadas en % sobre CADA imagen: d =
// escritorio, m = celular) y una línea del personaje que atiende. sceneHTML
// arma el marcado y wireScene engancha los puntos.
// ============================================================
function sceneHTML(cfg){
  const mobile = window.matchMedia('(max-width:640px)').matches;
  const spots = cfg.spots.map(sp=>{
    const [x,y] = mobile ? sp.m : sp.d;
    return `<button class="sc-spot ${sp.locked?'locked':''}" data-sc-spot="${sp.key}" style="left:${x}%; top:${y}%;" title="${sp.label}">
      <i></i><span>${sp.ic} ${sp.label}${sp.locked?' 🔒':''}</span></button>`;
  }).join('');
  return `<div class="sc-scene ${mobile?'mobile':''}" style="aspect-ratio:${mobile ? cfg.ratioMobile : cfg.ratio};">
      <img class="sc-art" src="${mobile ? cfg.imgMobile : cfg.img}" alt="" ${cfg.imgFallback ? `onerror="this.onerror=null; this.src='${mobile ? cfg.imgFallbackMobile : cfg.imgFallback}'"` : ''}>
      <div class="sc-top"><h3>${cfg.title}</h3>${cfg.aside ? `<span class="sc-aside">${cfg.aside}</span>` : ''}<button class="reset-btn" id="${cfg.closeId}">Cerrar</button></div>
      ${cfg.extra ? cfg.extra(mobile) : ''}
      ${spots}
    </div>
    ${cfg.line ? `<div class="sc-talk"><b>${cfg.keeper}</b>${cfg.line}</div>` : ''}`;
}
function wireScene(onSpot){
  document.querySelectorAll('[data-sc-spot]').forEach(b=>{ b.onclick = ()=> onSpot(b.dataset.scSpot); });
}
// Puntos de la forja: posiciones medidas sobre tienda.jpg (d) y tienda_movil.jpg (m).
const SHOP_SPOTS = [
  {key:'armas',     label:'Armas',           ic:'⚔️', d:[16,30], m:[35,13]},
  {key:'armaduras', label:'Armaduras',       ic:'🛡️', d:[77,27], m:[76,57]},
  {key:'forja',     label:'Forja Legendaria', ic:'🔥', d:[50,57], m:[52,43]},
  {key:'sellos',    label:'Vitrina de Sellos', ic:'🎖️', d:[19,72], m:[19,60]},
  {key:'pociones',  label:'Pociones',        ic:'🧪', d:[93,52], m:[44,76]},
  {key:'vender',    label:'Vender',          ic:'💰', d:[76,80], m:[64,89]},
];
let shopSection = null; // null = la escena de la forja; si no, la sección abierta
function renderShop(){
  if(!shopWeaponRole) shopWeaponRole = state.char.style;
  const styleId = shopWeaponRole;
  const armaPrice = shopWeaponPrice(false);
  const arma2Price = shopWeaponPrice(true);

  const roleSelectorHTML = `
    <select id="shop-role-select" class="auth-input" style="max-width:260px; margin-bottom:8px;">
      ${Object.keys(WEAPON_CATALOG).map(id=>`<option value="${id}" ${styleId===id?'selected':''}>${SHOP_ROLE_LABELS[id]||id}${id===state.char.style?' (tu senda)':''}</option>`).join('')}
    </select>
    <p style="color:var(--text-dim); font-size:0.8em; margin:0 0 8px;">El arma se guarda en tu mochila compartida — luego decides tú a quién equipársela desde el Inventario.</p>`;

  const weaponHTML = weaponShopRows('arma', 'comun', '', 'buy-weapon', armaPrice)
    + weaponShopRows('arma2', 'comun', '', 'buy-weapon', arma2Price);

  const raroTag = `<span class="slot-tag" style="border-color:${RARITIES.raro.color}; color:${RARITIES.raro.color};">Raro</span>`;
  const weaponRaroHTML = weaponShopRows('arma', 'raro', raroTag, 'buy-weapon-raro', shopWeaponPriceRaro(false))
    + weaponShopRows('arma2', 'raro', raroTag, 'buy-weapon-raro', shopWeaponPriceRaro(true));

  const gearShopRow = (slot, rank, rankTag, dataAttr, price)=>{
    const preview = makeGearItem(slot, styleId, rank);
    if(!preview) return '';
    return `<div class="inv-item-row" style="${rarityRowStyle(preview)}">
      ${itemRowCompact(preview)}
      <button class="inv-btn" data-${dataAttr}="${slot}" ${state.char.gold<price?'disabled':''}>Comprar (${price} oro)</button>
    </div>`;
  };
  const gearHTML = SHOP_GEAR_SLOTS.map(slot=> gearShopRow(slot, 'comun', '', 'buy-gear', shopGearPrice(slot))).join('');

  const pocoComunTag = ` <span class="slot-tag" style="border-color:${RARITIES.poco_comun.color}; color:${RARITIES.poco_comun.color};">Poco común</span>`;
  const pocoComunHTML = SHOP_GEAR_SLOTS.map(slot=> gearShopRow(slot, 'poco_comun', pocoComunTag, 'buy-gear-poco', shopGearPricePocoComun(slot))).join('');

  const raroTagGear = ` <span class="slot-tag" style="border-color:${RARITIES.raro.color}; color:${RARITIES.raro.color};">Raro</span>`;
  const raroHTML = SHOP_GEAR_SLOTS.map(slot=> gearShopRow(slot, 'raro', raroTagGear, 'buy-gear-raro', shopGearPriceRaro(slot))).join('');

  // Separado por rango Y por armas/equipo (2026-09-25, pedido explícito:
  // "la misma separacion de armas / equipamiento y tier") — antes venía todo
  // mezclado en una sola lista larga por slot.
  const selloRarityBlock = (rarity)=>{
    const price = selloShopPrice(rarity);
    const disabled = (state.char.missionCurrency||0) < price;
    const cat = WEAPON_CATALOG[shopWeaponRole];
    const weaponRows = (cat && cat.arma) ? Object.keys(cat.arma).map(name=>{
      const preview = makeWeaponItem('arma', shopWeaponRole, rarity, name);
      if(!preview) return '';
      return `<div class="inv-item-row" style="${rarityRowStyle(preview)}">
        ${itemRowCompact(preview)}
        <button class="inv-btn" data-buy-sello="arma|${rarity}|${name}" ${disabled?'disabled':''}>Comprar (${price} Sellos)</button>
      </div>`;
    }).join('') : '';
    const gearRows = SELLO_SHOP_SLOTS.filter(s=>s!=='arma').map(slot=>{
      const preview = makeGearItem(slot, shopWeaponRole, rarity);
      if(!preview) return '';
      return `<div class="inv-item-row" style="${rarityRowStyle(preview)}">
        ${itemRowCompact(preview)}
        <button class="inv-btn" data-buy-sello="${slot}|${rarity}" ${disabled?'disabled':''}>Comprar (${price} Sellos)</button>
      </div>`;
    }).join('');
    const setRows = SET_SLOTS.map(slot=>{
      const preview = makeSetItem(shopSetFilter, slot, rarity);
      if(!preview) return '';
      return `<div class="inv-item-row" style="${rarityRowStyle(preview)}">
        ${itemRowCompact(preview)}
        <button class="inv-btn" data-buy-sello-set="${shopSetFilter}|${slot}|${rarity}" ${disabled?'disabled':''}>Comprar (${price} Sellos)</button>
      </div>`;
    }).join('');
    return {weaponRows, gearRows, setRows};
  };
  const selloRangoB = selloRarityBlock('rango_b');
  const selloRangoA = selloRarityBlock('rango_a');
  const selloTierBlockHTML = (key, rows)=>{
    if((shopSelloTierFilter!=='todos' && shopSelloTierFilter!==key)) return '';
    const label = RARITIES[key].name;
    return `<div class="section-label" style="margin-top:6px; font-size:0.85em; color:${RARITIES[key].color};">Armas — ${label}</div>
      ${rows.weaponRows || '<p class="inv-empty-msg">No hay armas disponibles para tu senda.</p>'}
      <div class="section-label" style="margin-top:6px; font-size:0.85em; color:${RARITIES[key].color};">Equipo — ${label}</div>
      ${rows.gearRows}
      <div class="section-label" style="margin-top:6px; font-size:0.85em; color:${RARITIES[key].color};">Conjunto ${SET_CATALOG[shopSetFilter].name} — ${label}</div>
      ${rows.setRows}`;
  };
  const setInfo = SET_BONUSES[shopSetFilter];
  const setSelectHTML = `
    <select id="shop-set-select" class="auth-input" style="max-width:260px; margin-bottom:4px;">
      ${SET_IDS.map(id=>`<option value="${id}" ${shopSetFilter===id?'selected':''}>Conjunto: ${SET_CATALOG[id].name} (${SET_CATALOG[id].affinity})</option>`).join('')}
    </select>
    <p style="color:var(--text-dim); font-size:0.8em; margin:0 0 8px;">Cualquier senda puede usar piezas de conjunto; piezas de rangos distintos cuentan igual. ${[2,3,5].map(k=>`<b>${k} piezas — ${setInfo[k].name}:</b> ${setInfo[k].text}`).join(' ')}</p>`;
  const selloHTML = `
    <select id="shop-sello-tier-select" class="auth-input" style="max-width:220px; margin-bottom:8px;">
      <option value="todos" ${shopSelloTierFilter==='todos'?'selected':''}>Todos los rangos</option>
      <option value="rango_b" ${shopSelloTierFilter==='rango_b'?'selected':''}>${RARITIES.rango_b.name}</option>
      <option value="rango_a" ${shopSelloTierFilter==='rango_a'?'selected':''}>${RARITIES.rango_a.name}</option>
    </select>
    ${setSelectHTML}
    ${selloTierBlockHTML('rango_b', selloRangoB)}
    ${selloTierBlockHTML('rango_a', selloRangoA)}
  `;

  // Forja Legendaria (Tier S) — armas + piedras de alma de rango S, pagadas
  // con Sellos + fragmentos de jefe de década (ver TIER_S_RECIPE). Solo
  // visible/comprable desde piso 40+ (tierSUnlocked()).
  const tierSCostHTML = `<p style="color:var(--text-dim); font-size:0.82em; margin:0 0 8px;">
    Cada objeto Tier S cuesta <b style="color:var(--bronze-light);">${TIER_S_RECIPE.sellos} Sellos</b> +
    ${Object.entries(TIER_S_RECIPE.fragments).map(([fragId,need])=>{
      const frag = Object.values(DECADE_BOSS_FRAGMENTS).find(f=>f.id===fragId);
      const have = fragmentQty(fragId);
      const ok = have>=need;
      return `<span style="color:${ok?'var(--good)':'var(--blood-light)'};">${frag.icon} ${have}/${need}</span>`;
    }).join(' · ')}.
  </p>`;
  const tierSWeaponHTML = ['arma','arma2'].map(slot=>{
    const cat = WEAPON_CATALOG[shopWeaponRole];
    if(!cat || !cat[slot]) return '';
    return Object.keys(cat[slot]).map(name=>{
      const preview = makeWeaponItem(slot, shopWeaponRole, 'legendario', name);
      if(!preview) return '';
      const disabled = !hasTierSMaterials();
      return `<div class="inv-item-row" style="${rarityRowStyle(preview)}">
        ${itemRowCompact(preview)}
        <button class="inv-btn" data-buy-tiers-weapon="${slot}|${name}" ${disabled?'disabled':''}>Forjar</button>
      </div>`;
    }).join('');
  }).join('') || '<p class="inv-empty-msg">No hay armas Tier S para tu senda de combate.</p>';
  const tierSStoneHTML = Object.keys(SOUL_FAMILIES).map(famId=>{
    const tpl = Object.values(SOUL_STONES).find(s=>s.family===famId && s.tier==='S');
    if(!tpl) return '';
    const disabled = !hasTierSMaterials();
    return `<div class="inv-item-row">
      ${itemRowCompact(tpl)}
      <button class="inv-btn" data-buy-tiers-stone="${famId}" ${disabled?'disabled':''}>Forjar</button>
    </div>`;
  }).join('');
  const tierSHTML = tierSUnlocked()
    ? tierSCostHTML + `<div class="section-label" style="margin-top:6px; font-size:0.85em;">Armas</div>` + tierSWeaponHTML + `<div class="section-label" style="margin-top:6px; font-size:0.85em;">Piedras del alma</div>` + tierSStoneHTML
    : `<p class="inv-empty-msg">La Forja Legendaria abre al llegar al piso ${TIER_S_MIN_FLOOR} del laberinto (hoy: piso ${state.char.maxLevelUnlocked||1}).</p>`;

  const potionHTML = Object.values(POTION_TEMPLATES).filter(t=>SHOP_POTION_PRICES[t.id]).map(t=>{
    const price = SHOP_POTION_PRICES[t.id];
    const qty = shopPotionQty[t.id] || 1;
    const total = price*qty;
    return `<div class="inv-item-row">
      ${potionRowWithArt(t.id, `<b>${t.name}</b>`)}
      <select class="auth-input shop-qty-select" data-potion-qty="${t.id}" style="max-width:80px;">
        ${[1,10,100].map(n=>`<option value="${n}" ${qty===n?'selected':''}>x${n}</option>`).join('')}
      </select>
      <button class="inv-btn" data-buy-potion="${t.id}" ${state.char.gold<total?'disabled':''}>Comprar (${total.toLocaleString('es')} oro)</button>
    </div>`;
  }).join('');

  const sellGear = state.char.inventory.filter(i=>i.kind==='equip');
  const sellPotions = state.char.inventory.filter(i=>i.kind==='potion');
  const sellStones = state.char.inventory.filter(i=>i.kind==='soulstone');
  const sellRows = [
    ...sellGear.map(it=>`<div class="inv-item-row" style="${rarityRowStyle(it)}">
      ${itemRowCompact(it)}
      <button class="inv-btn" data-sell="${it.uid}">Vender (${itemSellValue(it)} oro)</button>
    </div>`),
    ...sellPotions.map(it=>`<div class="inv-item-row">
      ${potionRowWithArt(it.potionId, `<b>${POTION_TEMPLATES[it.potionId].name}</b> <span class="slot-tag">x${it.qty}</span>`)}
      <button class="inv-btn" data-sell-potion="${it.potionId}">Vender 1 (${itemSellValue(it)} oro)</button>
    </div>`),
    ...sellStones.map(it=>{
      const c = SOUL_TIER_COLORS[it.tier] || 'var(--text)';
      return `<div class="inv-item-row">
        ${itemRowWithArt(it, `<b style="color:${c};">${it.name}</b> <span class="slot-tag" style="border-color:${c}; color:${c};">${it.tier}</span>`)}
        <button class="inv-btn" data-sell="${it.uid}">Vender (${itemSellValue(it)} oro)</button>
      </div>`;
    })
  ].join('');

  // La Tienda es una escena (la forja) con puntos que se tocan — pedido
  // explícito 2026-10-04: "un herrero de fondo forjando un arma y enanos
  // atendiendo... como si se escogiera en el mapa de la ciudad". Cada punto
  // abre SOLO su sección; arriba de la sección hay atajos al resto.
  const goldTierSelectHTML = `
    <select id="shop-gold-tier-select" class="auth-input" style="max-width:220px; margin-bottom:8px;">
      <option value="todos" ${shopGoldTierFilter==='todos'?'selected':''}>Todos los rangos</option>
      <option value="comun" ${shopGoldTierFilter==='comun'?'selected':''}>Común</option>
      <option value="poco_comun" ${shopGoldTierFilter==='poco_comun'?'selected':''}>Poco Común</option>
      <option value="raro" ${shopGoldTierFilter==='raro'?'selected':''}>Raro</option>
    </select>`;
  const showTier = (k)=> shopGoldTierFilter==='todos' || shopGoldTierFilter===k;
  const noWeapons = '<p class="inv-empty-msg">No hay armas disponibles para esa senda.</p>';
  const sectionBody = {
    armas: ()=> `${roleSelectorHTML}${goldTierSelectHTML}
      ${showTier('comun') ? `<div class="section-label">Armas — Común</div>${weaponHTML || noWeapons}` : ''}
      ${showTier('raro') ? `<div class="section-label">Armas — Raro</div>${weaponRaroHTML || noWeapons}` : ''}
      ${shopGoldTierFilter==='poco_comun' ? '<p class="inv-empty-msg">No hay armas de rango Poco Común: pasan de Común a Raro.</p>' : ''}`,
    armaduras: ()=> `${goldTierSelectHTML}
      ${showTier('comun') ? `<div class="section-label">Equipo — Común</div>${gearHTML}` : ''}
      ${showTier('poco_comun') ? `<div class="section-label">Equipo — Poco Común</div>${pocoComunHTML}` : ''}
      ${showTier('raro') ? `<div class="section-label">Equipo — Raro</div>${raroHTML}` : ''}`,
    sellos: ()=> `<p class="sc-note">Sellos del Laberinto: <b>🎖️ ${(state.char.missionCurrency||0).toLocaleString('es')}</b></p>${roleSelectorHTML}${selloHTML}`,
    forja: ()=> `${roleSelectorHTML}${tierSHTML}`,
    pociones: ()=> potionHTML,
    vender: ()=> `<p class="sc-note">Te pagan el 50% de su valor.</p>${sellRows || '<p class="inv-empty-msg">No tienes nada que vender por ahora.</p>'}`
  };
  if(shopSection && !sectionBody[shopSection]) shopSection = null;
  if(!shopSection){
    document.getElementById('main-panel').innerHTML = sceneHTML({
      id:'shop', title:'Tienda', closeId:'btn-close-shop', img:'src/assets/escenas/tienda.jpg?v=1', imgMobile:'src/assets/escenas/tienda_movil.jpg?v=1',
      ratio:'1376/768', ratioMobile:'768/1376', spots:SHOP_SPOTS,
      keeper:'Gerd el herrero', line:'“Armas, armaduras, pociones… Toca lo que quieras ver.”',
      aside:`⛁ ${state.char.gold.toLocaleString('es')} · 🎖️ ${(state.char.missionCurrency||0).toLocaleString('es')}`
    });
    wireScene((key)=>{ shopSection = key; renderShop(); });
  } else {
    const spot = SHOP_SPOTS.find(sp=>sp.key===shopSection);
    document.getElementById('main-panel').innerHTML = `
      <div class="sc-head">
        <button class="reset-btn" id="sc-back">‹ La forja</button>
        <h3>${spot.ic} ${spot.label}</h3>
        <span class="sc-aside">⛁ ${state.char.gold.toLocaleString('es')}</span>
        <button class="reset-btn" id="btn-close-shop">Cerrar</button>
      </div>
      <div class="inv-filter-bar sc-tabs">${SHOP_SPOTS.map(sp=>`<button class="nav-btn ${sp.key===shopSection?'active':''}" data-sc-tab="${sp.key}">${sp.ic} ${sp.label}</button>`).join('')}</div>
      <div class="sc-section">${sectionBody[shopSection]()}</div>`;
    document.getElementById('sc-back').onclick = ()=>{ shopSection = null; renderShop(); };
    document.querySelectorAll('[data-sc-tab]').forEach(t=>{ t.onclick = ()=>{ shopSection = t.dataset.scTab; renderShop(); }; });
  }

  document.getElementById('btn-close-shop').onclick = ()=>{ shopOpen=false; shopSection = null; renderAll(); };
  document.querySelectorAll('[data-buy-weapon]').forEach(btn=>{
    btn.onclick = ()=>{
      const [slot, name] = btn.dataset.buyWeapon.split('|');
      buyWeapon(slot, shopWeaponRole, name);
    };
  });
  const shopRoleSelect = document.getElementById('shop-role-select');
  if(shopRoleSelect) shopRoleSelect.onchange = ()=>{ shopWeaponRole = shopRoleSelect.value; renderShop(); };
  const shopGoldTierSelect = document.getElementById('shop-gold-tier-select');
  if(shopGoldTierSelect) shopGoldTierSelect.onchange = ()=>{ shopGoldTierFilter = shopGoldTierSelect.value; renderShop(); };
  const shopSelloTierSelect = document.getElementById('shop-sello-tier-select');
  if(shopSelloTierSelect) shopSelloTierSelect.onchange = ()=>{ shopSelloTierFilter = shopSelloTierSelect.value; renderShop(); };
  document.querySelectorAll('[data-buy-gear]').forEach(btn=>{
    btn.onclick = ()=> buyGear(btn.dataset.buyGear);
  });
  document.querySelectorAll('[data-buy-gear-poco]').forEach(btn=>{
    btn.onclick = ()=> buyGearPocoComun(btn.dataset.buyGearPoco);
  });
  document.querySelectorAll('[data-buy-weapon-raro]').forEach(btn=>{
    btn.onclick = ()=>{
      const [slot, name] = btn.dataset.buyWeaponRaro.split('|');
      buyWeaponRaro(slot, shopWeaponRole, name);
    };
  });
  document.querySelectorAll('[data-buy-gear-raro]').forEach(btn=>{
    btn.onclick = ()=> buyGearRaro(btn.dataset.buyGearRaro);
  });
  const shopSetSelect = document.getElementById('shop-set-select');
  if(shopSetSelect) shopSetSelect.onchange = ()=>{ shopSetFilter = shopSetSelect.value; renderShop(); };
  document.querySelectorAll('[data-buy-sello-set]').forEach(btn=>{
    btn.onclick = ()=>{
      const [setId, slot, rarity] = btn.dataset.buySelloSet.split('|');
      buySelloSetPiece(setId, slot, rarity);
    };
  });
  document.querySelectorAll('[data-buy-sello]').forEach(btn=>{
    btn.onclick = ()=>{
      const [slot, rarity, name] = btn.dataset.buySello.split('|');
      buySelloGear(slot, rarity, name);
    };
  });
  document.querySelectorAll('[data-buy-tiers-weapon]').forEach(btn=>{
    btn.onclick = ()=>{
      const [slot, name] = btn.dataset.buyTiersWeapon.split('|');
      buyTierSWeapon(slot, name);
    };
  });
  document.querySelectorAll('[data-buy-tiers-stone]').forEach(btn=>{
    btn.onclick = ()=> buyTierSStone(btn.dataset.buyTiersStone);
  });
  document.querySelectorAll('[data-buy-potion]').forEach(btn=>{
    btn.onclick = ()=> buyPotion(btn.dataset.buyPotion, shopPotionQty[btn.dataset.buyPotion]||1);
  });
  document.querySelectorAll('[data-potion-qty]').forEach(sel=>{
    sel.onchange = ()=>{ shopPotionQty[sel.dataset.potionQty] = parseInt(sel.value,10); renderShop(); };
  });
  document.querySelectorAll('[data-sell]').forEach(btn=>{
    btn.onclick = ()=> sellEquipOrStone(btn.dataset.sell);
  });
  document.querySelectorAll('[data-sell-potion]').forEach(btn=>{
    btn.onclick = ()=> sellPotionStack(btn.dataset.sellPotion);
  });
}

/* ============================================================
   RENDER: HOGAR (HOME STASH)
   ============================================================ */
// El Hogar es una escena (tu cuarto) con tres puntos — pedido explícito
// 2026-10-04: "un cuarto con un armario o cofre donde se guarde el inventario,
// la armería donde se guarden las armas y una caja fuerte donde se guarde el
// oro". Armería = armas (arma / arma 2); Armario = el resto del equipo y las
// pociones; Caja fuerte = oro. Posiciones medidas sobre hogar.jpg (d) y
// hogar_movil.jpg (m).
const HOME_SPOTS = [
  {key:'armeria', label:'Armería',      ic:'⚔️', d:[11,42], m:[36,14]},
  {key:'armario', label:'Armario',      ic:'🧥', d:[51,40], m:[46,44]},
  {key:'oro',     label:'Caja fuerte',  ic:'💰', d:[89,44], m:[48,83]},
];
let homeSection = null; // null = la escena del cuarto
const isWeaponSlot = (it)=> it.slot==='arma' || it.slot==='arma2';
function renderHome(){
  const stash = state.char.stash || (state.char.stash = {gold:0, items:[]});
  if(homeSection && !HOME_SPOTS.some(sp=>sp.key===homeSection)) homeSection = null;
  if(!homeSection){
    document.getElementById('main-panel').innerHTML = sceneHTML({
      id:'home', title:'Hogar', closeId:'btn-close-home', img:'src/assets/escenas/hogar.jpg?v=1', imgMobile:'src/assets/escenas/hogar_movil.jpg?v=1',
      ratio:'1376/581', ratioMobile:'768/1376', spots:HOME_SPOTS,
      keeper:'Tu casera', line:'“Lo que guardes aquí no se pierde aunque caigas en el laberinto.”',
      aside:`Guardado ${stash.items.length}/${STASH_ITEM_CAP} · ⛁ ${stash.gold.toLocaleString('es')}`
    });
    wireScene((key)=>{ homeSection = key; renderHome(); });
    document.getElementById('btn-close-home').onclick = ()=>{ homeOpen=false; homeSection = null; renderAll(); };
    return;
  }
  // En la Armería solo se ven las armas; en el Armario, el resto del equipo.
  const inSection = (it)=> homeSection==='armeria' ? isWeaponSlot(it) : !isWeaponSlot(it);
  const gearItems = state.char.inventory.filter(i=>i.kind==='equip' && inSection(i));
  const potionItems = state.char.inventory.filter(i=>i.kind==='potion');
  const stashGear = stash.items.filter(i=>i.kind==='equip' && inSection(i));
  const stashPotions = stash.items.filter(i=>i.kind==='potion');
  const stashFull = stash.items.length >= STASH_ITEM_CAP;
  const stashRoom = Math.max(0, STASH_ITEM_CAP - stash.items.length);

  // Filtros por slot/rango (pedido explícito 2026-09-27, "ponle filtro al
  // guardado, asi como la tienda") — mismo patrón de chips que ya usa
  // renderInventory() (gearFilterHTML/gearTierFilterHTML), pero con su
  // propio estado independiente porque acá son DOS listas (mochila y Hogar)
  // en la misma pantalla, no una.
  const bagSlotsPresent = EQUIP_SLOTS.filter(slot=> gearItems.some(it=>it.slot===slot));
  if(homeBagGearFilter!=='todos' && !bagSlotsPresent.includes(homeBagGearFilter)) homeBagGearFilter = 'todos';
  const bagFilterHTML = gearItems.length ? `<div class="inv-filter-bar">
    <button class="nav-btn ${homeBagGearFilter==='todos'?'active':''}" data-homebaggearfilter="todos">Todos</button>
    ${bagSlotsPresent.map(slot=>`<button class="nav-btn ${homeBagGearFilter===slot?'active':''}" data-homebaggearfilter="${slot}">${slotLabel(slot)}</button>`).join('')}
  </div>` : '';
  const bagTiersPresent = Object.keys(RARITIES).filter(rk=> gearItems.some(it=>(it.rarity||'comun')===rk));
  if(homeBagGearTierFilter!=='todos' && !bagTiersPresent.includes(homeBagGearTierFilter)) homeBagGearTierFilter = 'todos';
  const bagTierFilterHTML = bagTiersPresent.length>1 ? `<div class="inv-filter-bar">
    <button class="nav-btn ${homeBagGearTierFilter==='todos'?'active':''}" data-homebaggeartierfilter="todos">Todos los rangos</button>
    ${bagTiersPresent.map(rk=>`<button class="nav-btn ${homeBagGearTierFilter===rk?'active':''}" data-homebaggeartierfilter="${rk}" style="${homeBagGearTierFilter===rk?`border-color:${RARITIES[rk].color}; color:${RARITIES[rk].color};`:''}">${RARITIES[rk].name}</button>`).join('')}
  </div>` : '';
  const bagGearFiltered = gearItems.filter(it=> (homeBagGearFilter==='todos'||it.slot===homeBagGearFilter) && (homeBagGearTierFilter==='todos'||(it.rarity||'comun')===homeBagGearTierFilter));
  const bagGearHTML = gearItems.length ? (bagGearFiltered.length ? bagGearFiltered.map(it=>`
    <div class="inv-item-row" style="${rarityRowStyle(it)}">
      ${itemRowCompact(it)}
      <button class="inv-btn" data-stash-gear="${it.uid}" ${stashFull?'disabled':''}>Guardar en Hogar</button>
    </div>`).join('') : `<p class="inv-empty-msg">No hay equipo con ese filtro.</p>`) : `<p class="inv-empty-msg">No llevas equipo suelto contigo.</p>`;

  const bagPotionHTML = potionItems.length ? potionItems.map(it=>{
    const tpl = POTION_TEMPLATES[it.potionId];
    return `<div class="inv-item-row">
      ${potionRowWithArt(it.potionId, `<b>${tpl.name}</b> <span class="slot-tag">x${it.qty}</span>`)}
      <button class="inv-btn" data-stash-potion="${it.potionId}" ${stashFull?'disabled':''}>Guardar 1</button>
    </div>`;
  }).join('') : `<p class="inv-empty-msg">No llevas pociones contigo.</p>`;

  const stashSlotsPresent = EQUIP_SLOTS.filter(slot=> stashGear.some(it=>it.slot===slot));
  if(homeStashGearFilter!=='todos' && !stashSlotsPresent.includes(homeStashGearFilter)) homeStashGearFilter = 'todos';
  const stashFilterHTML = stashGear.length ? `<div class="inv-filter-bar">
    <button class="nav-btn ${homeStashGearFilter==='todos'?'active':''}" data-homestashgearfilter="todos">Todos</button>
    ${stashSlotsPresent.map(slot=>`<button class="nav-btn ${homeStashGearFilter===slot?'active':''}" data-homestashgearfilter="${slot}">${slotLabel(slot)}</button>`).join('')}
  </div>` : '';
  const stashTiersPresent = Object.keys(RARITIES).filter(rk=> stashGear.some(it=>(it.rarity||'comun')===rk));
  if(homeStashGearTierFilter!=='todos' && !stashTiersPresent.includes(homeStashGearTierFilter)) homeStashGearTierFilter = 'todos';
  const stashTierFilterHTML = stashTiersPresent.length>1 ? `<div class="inv-filter-bar">
    <button class="nav-btn ${homeStashGearTierFilter==='todos'?'active':''}" data-homestashgeartierfilter="todos">Todos los rangos</button>
    ${stashTiersPresent.map(rk=>`<button class="nav-btn ${homeStashGearTierFilter===rk?'active':''}" data-homestashgeartierfilter="${rk}" style="${homeStashGearTierFilter===rk?`border-color:${RARITIES[rk].color}; color:${RARITIES[rk].color};`:''}">${RARITIES[rk].name}</button>`).join('')}
  </div>` : '';
  const stashGearFiltered = stashGear.filter(it=> (homeStashGearFilter==='todos'||it.slot===homeStashGearFilter) && (homeStashGearTierFilter==='todos'||(it.rarity||'comun')===homeStashGearTierFilter));
  const stashGearHTML = stashGear.length ? (stashGearFiltered.length ? stashGearFiltered.map(it=>`
    <div class="inv-item-row" style="${rarityRowStyle(it)}">
      ${itemRowCompact(it)}
      <button class="inv-btn" data-retrieve-gear="${it.uid}">Retirar</button>
    </div>`).join('') : `<p class="inv-empty-msg">No hay equipo con ese filtro.</p>`) : `<p class="inv-empty-msg">El Hogar no guarda equipo todavía.</p>`;

  const stashPotionHTML = stashPotions.length ? stashPotions.map(it=>{
    const tpl = POTION_TEMPLATES[it.potionId];
    return `<div class="inv-item-row">
      ${potionRowWithArt(it.potionId, `<b>${tpl.name}</b> <span class="slot-tag">x${it.qty}</span>`)}
      <button class="inv-btn" data-retrieve-potion="${it.potionId}">Retirar 1</button>
    </div>`;
  }).join('') : `<p class="inv-empty-msg">El Hogar no guarda pociones todavía.</p>`;

  const spot = HOME_SPOTS.find(sp=>sp.key===homeSection);
  const goldHTML = `
    <div class="equip-row"><span>Contigo</span><b>${state.char.gold.toLocaleString('es')}</b></div>
    <div class="equip-row"><span>En la caja fuerte</span><b>${stash.gold.toLocaleString('es')}</b></div>
    <div style="display:flex; gap:8px; margin-top:8px; flex-wrap:wrap;">
      <button class="inv-btn" id="btn-stash-gold-all" ${state.char.gold<=0?'disabled':''}>Guardar todo mi oro</button>
      <button class="inv-btn" id="btn-retrieve-gold-all" ${stash.gold<=0?'disabled':''}>Retirar todo el oro</button>
    </div>
    <div style="display:flex; gap:8px; margin-top:8px; flex-wrap:wrap; align-items:center;">
      <input type="number" id="home-gold-amount" class="auth-input" placeholder="Cantidad" min="1" step="1" style="max-width:140px; margin:0;">
      <button class="inv-btn" id="btn-stash-gold-amount">Guardar cantidad</button>
      <button class="inv-btn" id="btn-retrieve-gold-amount">Retirar cantidad</button>
    </div>`;
  const what = homeSection==='armeria' ? 'armas' : 'equipo';
  const itemsHTML = `
    <p class="sc-note">El Hogar guarda hasta ${STASH_ITEM_CAP} objetos en total (<b>${stash.items.length}/${STASH_ITEM_CAP}</b>).</p>
    <div class="section-label" style="display:flex; align-items:center; justify-content:space-between; gap:8px; flex-wrap:wrap;">
      <span>En tu mochila</span>
      <button class="inv-btn" id="btn-stash-gear-all" ${(!gearItems.length || stashFull)?'disabled':''}>Guardar todo (${what})</button>
    </div>
    ${bagFilterHTML}${bagTierFilterHTML}${bagGearHTML}
    ${homeSection==='armario' ? bagPotionHTML : ''}
    <div class="section-label">Guardado aquí</div>
    ${stashFilterHTML}${stashTierFilterHTML}${stashGearHTML}
    ${homeSection==='armario' ? stashPotionHTML : ''}`;
  document.getElementById('main-panel').innerHTML = `
    <div class="sc-head">
      <button class="reset-btn" id="sc-back">‹ Tu cuarto</button>
      <h3>${spot.ic} ${spot.label}</h3>
      <button class="reset-btn" id="btn-close-home">Cerrar</button>
    </div>
    <div class="inv-filter-bar sc-tabs">${HOME_SPOTS.map(sp=>`<button class="nav-btn ${sp.key===homeSection?'active':''}" data-sc-tab="${sp.key}">${sp.ic} ${sp.label}</button>`).join('')}</div>
    <div class="sc-section">${homeSection==='oro' ? goldHTML : itemsHTML}</div>`;
  document.getElementById('sc-back').onclick = ()=>{ homeSection = null; renderHome(); };
  document.querySelectorAll('[data-sc-tab]').forEach(t=>{ t.onclick = ()=>{ homeSection = t.dataset.scTab; renderHome(); }; });

  document.getElementById('btn-close-home').onclick = ()=>{ homeOpen=false; homeSection = null; renderAll(); };
  const stashAllBtn = document.getElementById('btn-stash-gold-all');
  if(stashAllBtn) stashAllBtn.onclick = ()=>{
    stash.gold += state.char.gold; state.char.gold = 0;
    log('Depositas todo tu oro en el Hogar.');
    renderAll(); save();
  };
  const retrieveAllBtn = document.getElementById('btn-retrieve-gold-all');
  if(retrieveAllBtn) retrieveAllBtn.onclick = ()=>{
    state.char.gold += stash.gold; stash.gold = 0;
    log('Retiras todo el oro guardado en el Hogar.');
    renderAll(); save();
  };
  // Depositar/retirar una CANTIDAD elegida de oro (pedido explícito
  // 2026-09-28: "sacar 1000, o solo 3000") — hasta ahora solo existían los
  // botones de todo-o-nada de arriba.
  const goldAmountInput = document.getElementById('home-gold-amount');
  const readGoldAmount = ()=>{
    const n = Math.floor(Number(goldAmountInput ? goldAmountInput.value : NaN));
    if(!Number.isFinite(n) || n<=0){ log('Ingresa una cantidad de oro válida.'); return null; }
    return n;
  };
  const btnStashAmount = document.getElementById('btn-stash-gold-amount');
  if(btnStashAmount) btnStashAmount.onclick = ()=>{
    const n = readGoldAmount();
    if(n===null) return;
    if(n > state.char.gold){ log('No tienes esa cantidad de oro contigo.'); return; }
    state.char.gold -= n; stash.gold += n;
    log(`Depositas ${n.toLocaleString('es')} de oro en el Hogar.`);
    renderAll(); save();
  };
  const btnRetrieveAmount = document.getElementById('btn-retrieve-gold-amount');
  if(btnRetrieveAmount) btnRetrieveAmount.onclick = ()=>{
    const n = readGoldAmount();
    if(n===null) return;
    if(n > stash.gold){ log('El Hogar no tiene guardada esa cantidad de oro.'); return; }
    stash.gold -= n; state.char.gold += n;
    log(`Retiras ${n.toLocaleString('es')} de oro del Hogar.`);
    renderAll(); save();
  };
  const stashGearAllBtn = document.getElementById('btn-stash-gear-all');
  if(stashGearAllBtn) stashGearAllBtn.onclick = ()=>{
    const room = Math.max(0, STASH_ITEM_CAP - stash.items.length);
    const toMove = gearItems.slice(0, room);
    toMove.forEach(it=>{
      const idx = state.char.inventory.indexOf(it);
      if(idx>=0) state.char.inventory.splice(idx,1);
      stash.items.push(it);
    });
    const leftover = gearItems.length - toMove.length;
    if(toMove.length) log(`Guardas ${toMove.length} objeto(s) de equipo en el Hogar.${leftover>0?` El Hogar está lleno (${STASH_ITEM_CAP}/${STASH_ITEM_CAP}) — quedan ${leftover} en tu mochila.`:''}`);
    renderAll(); save();
  };
  document.querySelectorAll('[data-stash-gear]').forEach(btn=>{
    btn.onclick = ()=>{
      if(stash.items.length >= STASH_ITEM_CAP){ log('El Hogar está lleno.'); return; }
      const idx = state.char.inventory.findIndex(i=>i.kind==='equip' && i.uid===btn.dataset.stashGear);
      if(idx<0) return;
      const it = state.char.inventory.splice(idx,1)[0];
      stash.items.push(it);
      log(`Guardas <b>${it.name}</b> en el Hogar.`);
      renderAll(); save();
    };
  });
  document.querySelectorAll('[data-retrieve-gear]').forEach(btn=>{
    btn.onclick = ()=>{
      const idx = stash.items.findIndex(i=>i.kind==='equip' && i.uid===btn.dataset.retrieveGear);
      if(idx<0) return;
      const it = stash.items.splice(idx,1)[0];
      state.char.inventory.push(it);
      log(`Retiras <b>${it.name}</b> del Hogar.`);
      renderAll(); save();
    };
  });
  document.querySelectorAll('[data-homebaggearfilter]').forEach(btn=>{
    btn.onclick = ()=>{ homeBagGearFilter = btn.dataset.homebaggearfilter; renderHome(); };
  });
  document.querySelectorAll('[data-homebaggeartierfilter]').forEach(btn=>{
    btn.onclick = ()=>{ homeBagGearTierFilter = btn.dataset.homebaggeartierfilter; renderHome(); };
  });
  document.querySelectorAll('[data-homestashgearfilter]').forEach(btn=>{
    btn.onclick = ()=>{ homeStashGearFilter = btn.dataset.homestashgearfilter; renderHome(); };
  });
  document.querySelectorAll('[data-homestashgeartierfilter]').forEach(btn=>{
    btn.onclick = ()=>{ homeStashGearTierFilter = btn.dataset.homestashgeartierfilter; renderHome(); };
  });
  document.querySelectorAll('[data-stash-potion]').forEach(btn=>{
    btn.onclick = ()=>{
      const pid = btn.dataset.stashPotion;
      const it = state.char.inventory.find(i=>i.kind==='potion' && i.potionId===pid);
      if(!it) return;
      it.qty -= 1;
      if(it.qty<=0) state.char.inventory = state.char.inventory.filter(i=>i!==it);
      const stashIt = stash.items.find(i=>i.kind==='potion' && i.potionId===pid);
      if(stashIt) stashIt.qty += 1; else stash.items.push({kind:'potion', potionId:pid, qty:1});
      log('Guardas una poción en el Hogar.');
      renderAll(); save();
    };
  });
  document.querySelectorAll('[data-retrieve-potion]').forEach(btn=>{
    btn.onclick = ()=>{
      const pid = btn.dataset.retrievePotion;
      const it = stash.items.find(i=>i.kind==='potion' && i.potionId===pid);
      if(!it) return;
      it.qty -= 1;
      if(it.qty<=0) stash.items = stash.items.filter(i=>i!==it);
      const bagIt = state.char.inventory.find(i=>i.kind==='potion' && i.potionId===pid);
      if(bagIt) bagIt.qty += 1; else state.char.inventory.push({kind:'potion', potionId:pid, qty:1});
      log('Retiras una poción del Hogar.');
      renderAll(); save();
    };
  });
}

/* ============================================================
   RENDER: DUNGEON MAP
   ============================================================ */
// La entrada y el piso del guardián tienen un solo nodo (todas las sendas
// convergen ahí), así que se puede llegar a ellos desde cualquier senda. Entre
// pisos con varias sendas, solo se puede avanzar a la misma senda o a una
// adyacente (senda superior -> superior o media, nunca a la inferior, y
// simétrico desde la inferior).
function isNodeReachable(dg, fi, ni){
  if(fi !== dg.atFloor+1) return false;
  if(dg.floors[dg.floors.length-1][0].done) return false;
  const fromNodes = dg.floors[dg.atFloor];
  const toNodes = dg.floors[fi];
  if(fromNodes.length === 1 || toNodes.length === 1) return true;
  return Math.abs(ni - dg.atNode) <= 1;
}

function renderMap(){
  const dg = state.dungeon;
  const curNode = dg.floors[dg.atFloor][dg.atNode];
  // Recuperación automática: si el nodo donde estás parado es de combate y
  // todavía no se resolvió (combat.node.done nunca se marcó) pero ya no hay
  // combate activo, es que se interrumpió a medio pelear (recarga de
  // página, conexión perdida) - se retoma la pelea sola en vez de dejarte
  // sin ninguna acción disponible. No es una salida: sigue siendo
  // obligatorio ganar o perder para poder avanzar o volver a casa.
  if(!combat && ['combate','elite','jefe'].includes(curNode.type) && !curNode.done){
    enterNode(dg.atFloor, dg.atNode);
    return;
  }
  const th = visualThreat(dg.level, state.char.level);
  // Laberinto por salas (2026-10-04): el mapa de nodos con íconos pasó a ser
  // una vista sobre el fondo de la década, con cada sala como un recuadro y el
  // personaje caminando hasta la que se elige (ver labyrinthMap.js). Las
  // reglas no cambian: mismas salas, misma isNodeReachable, mismo enterNode.
  document.getElementById('main-panel').innerHTML = `<h3 style="color:var(--bronze-light); margin-bottom:6px;">El laberinto — Nivel ${dg.level}</h3>
  <p style="color:var(--text-dim); font-size:0.85em; margin-top:0;">Toca una sala iluminada para avanzar; arrastra para mirar el resto. Amenaza: ⚠ ${th} · ${dg.floors.length} pisos.</p>
  <div id="labyrinth-mount"></div>
  <div class="map-legend">
    <span>⚔ Normal</span><span>☠ Élite</span><span>♛ Guardián</span><span>💰 Tesoro</span><span>🔥 Descanso</span><span>? Sin explorar</span>
  </div>`;
  mountLabyrinth(document.getElementById('labyrinth-mount'), dg, {
    level: dg.level, race: state.char.race, style: state.char.style,
    isReachable: (f, n)=> isNodeReachable(dg, f, n),
    onEnter: (f, n)=> enterNode(f, n),
    previewIds: (node, f)=> roomPreviewIds(node.type, dg, f),
    spriteUrl: (id)=> ENEMY_SPRITES[id] || null,
  });
}
// Qué monstruos se muestran dentro de una sala del laberinto. Es solo una
// vista previa representativa de la década: el grupo real se sortea al entrar
// (buildEncounterGroup). El guardián y el jefe de década sí son los reales.
function roomPreviewIds(nodeType, dg, f){
  const level = dg.level, bestiary = DECADE_BESTIARY[decadeIndexForLevel(level)];
  const at = (list, k)=> list && list.length ? list[k % list.length] : null;
  if(nodeType === 'jefe'){
    if(level % 10 === 0) return [bestiary.decadeBoss.id];
    const bossF = dg.floors.length - 1;
    const g = (bestiary.guardianByFloor && bestiary.guardianByFloor[bossF % 10]) || at(bestiary.guardians, level) || at(bestiary.elite, 0);
    return g ? [g.id] : [];
  }
  if(nodeType === 'elite'){ const e = at(bestiary.elite, f + level); return e ? [e.id] : []; }
  if(nodeType === 'combate'){
    const a1 = at(bestiary.regular, f*3 + level), a2 = at(bestiary.regular, f*3 + level + 2);
    return [a1, a2].filter(Boolean).map(t=> t.id);
  }
  return [];
}

// Arma el grupo de enemigos de un nodo de combate (extraído de enterNode,
// 2026-10-02, para que el simulador de balance use la misma lógica).
function buildEncounterGroup(nodeType, f, level){
  const bestiary = DECADE_BESTIARY[decadeIndexForLevel(level)];
  const isDecadeFinal = level % 10 === 0;
  const paraiso = isParaisoDecade(level);
  // Isla Paraíso (década 4, pisos 41-49) no tiene plantillas de guardián
  // propias — pero el piso igual necesita un cierre que se sienta como
  // tal (pedido explícito, 2026-09-18): en vez de un combate reforzado
  // cualquiera, el "jefe" de estos niveles siempre es un grupo fijo de 5
  // mobs regulares + 1 élite, para que la dificultad sea clara y pareja.
  const paraisoGuardianFloor = nodeType==='jefe' && paraiso && !isDecadeFinal;
  let templates, count;
  if(nodeType==='jefe'){
    if(isDecadeFinal){
      templates = [bestiary.decadeBoss];
      count = 1;
    } else if(paraisoGuardianFloor){
      templates = null; count = 0; // se arma a mano más abajo
    } else if(bestiary.guardianByFloor && bestiary.guardianByFloor[f%10]){
      // Guardián único y determinista por piso (2026-09-25, "Década 2 -
      // Arañas" en adelante) — en vez de sortear entre un pool compartido
      // de 2, cada piso 11-19 tiene su propio mini-jefe fijo.
      templates = [bestiary.guardianByFloor[f%10]];
      count = 1;
    } else {
      templates = bestiary.guardians;
      count = 1;
    }
  } else if(nodeType==='elite'){
    templates = bestiary.elite;
    // 2026-09-16, pedido explícito ("me olvidé de pedirlo, jaja"): más
    // élites juntos a medida que avanzan las décadas — igual criterio que
    // ya se usa para los mobs regulares. Década 1-2 (Bosque Goblin/Arañas,
    // decadeIndex 0-1) = 1, década 3-4 (Bestias-Riakis/Usurpador,
    // decadeIndex 2-3) = 2, década 5-6 (Isla Paraíso/El Mar, decadeIndex
    // 4-5) = 3. Se repite la misma plantilla de élite (cada década solo
    // tiene una definida en el bestiario), igual que ya hace pick() con
    // los regulares.
    const decIdx = decadeIndexForLevel(level);
    count = decIdx<=1 ? 1 : decIdx<=3 ? 2 : 3;
  } else {
    templates = bestiary.regular;
    // 2026-09-16, pedido explícito: el laberinto se sentía muy fácil salvo
    // por élites/guardianes — los combates normales ahora traen más
    // enemigos a la vez a medida que se avanza (nunca más que el tope de
    // 6 que ya usa invocar()).
    count = level>=40 ? rnd(5,6) : level>=20 ? rnd(3,4) : rnd(1,2);
  }
  const group = [];
  if(paraisoGuardianFloor){
    for(let i=0;i<5;i++) group.push(makeEnemy(pick(bestiary.regular), f, level));
    group.push(makeEnemy(bestiary.elite[0], f, level));
  } else {
    for(let i=0;i<count;i++) group.push(makeEnemy(pick(templates), f, level));
  }
  if(nodeType==='jefe' && isDecadeFinal && paraiso){
    // el jefe de Isla Paraíso llega escoltado por dos élites en el frente
    // mientras él se queda atrás.
    group.push(makeEnemy(bestiary.elite[0], f, level));
    group.push(makeEnemy(bestiary.elite[0], f, level));
  }
  // Acompañante de élite (2026-09-25, "Década 2 - Arañas" en adelante): si
  // la década define un pool de acompañantes, cada élite spawneada trae 1
  // acompañante propio (sorteado por peso), enlazados por companionRef en
  // ambas direcciones para la pasiva "mientras viva el acompañante"
  // (Reina del Nido) y "fortalece a su acompañante" (Orden de la Colmena).
  // Respeta el tope de 6 combatientes por bando enemigo (mismo tope que
  // usa 'invocar').
  if(nodeType==='elite' && bestiary.eliteCompanions){
    group.slice().forEach(elite=>{
      if(!elite.tpl.elite || group.length>=6) return;
      const companionTpl = pickWeighted(bestiary.eliteCompanions);
      const companion = makeEnemy(companionTpl, f, level);
      group.push(companion);
      elite.companionRef = companion;
      companion.companionRef = elite;
    });
  }
  // los de línea frontal (tanques/melee) van al slot 0, el que reciben los
  // ataques 'front'; a distancia/soporte se acomodan detrás.
  group.sort((a,b)=> (b.tpl.frontline?1:0) - (a.tpl.frontline?1:0));
  return group;
}

function enterNode(f,n){
  const dg = state.dungeon;
  const advancedFloor = f > dg.atFloor;
  dg.atFloor = f; dg.atNode = n;
  updateRecord(dg.level, f);
  dg.visited[f+'-'+n] = true;
  const node = dg.floors[f][n];
  save();
  if(advancedFloor) advanceMissionsFor('clear_floors', 1);

  if(node.type==='combate' || node.type==='elite' || node.type==='jefe'){
    const group = buildEncounterGroup(node.type, f, dg.level);
    startCombat(group, node);
  } else if(node.type==='tesoro'){
    // El oro de los cofres escalaba con `f` (el piso LOCAL dentro de esta
    // entrada al laberinto, 0-8 según numFloorsForLevel/MAX_FLOORS) en vez
    // de con el piso real (dg.level, 1-60) — por eso un cofre en el piso 51
    // pagaba casi lo mismo que uno en el piso 1 (pedido explícito
    // 2026-09-26: "piso 51+ dando solo 30 de oro"). El oro de combate
    // (ver rewardMult en handleVictory) ya escalaba bien con dg.level; los
    // cofres ahora usan el mismo +8% por piso real.
    const rewardMult = 1 + (dg.level-1)*0.08;
    const gold = Math.round((rnd(8,18) + f*3) * rewardMult * (1 + titlePerks().gold));
    state.char.gold += gold;
    let msg = `Encuentras un cofre. +${gold} de oro.`;
    if(chance(0.6)){
      // El rango del botín (ver GEAR_TIER_MIN_LEVEL) gatea por el piso REAL
      // en el que estás peleando ahora mismo (dg.level) — no por
      // maxLevelUnlocked (bug real 2026-09-27: un personaje que ya había
      // llegado al piso 20+ antes podía volver a grindear el piso 6 y
      // seguir sacando Rango A ahí, porque maxLevelUnlocked nunca baja).
      const item = generateLoot(f, dg.level||1);
      if(item){
        addToInventory(item);
        msg += item.kind==='potion'
          ? ` También hallas: <b>${POTION_TEMPLATES[item.potionId].name}</b> (guardada en la mochila).`
          : ` También hallas: <b>${item.name}</b> (guardado en la mochila).`;
        if(item.kind==='equip'){
          advanceMissionsFor('find_equipment', 1);
          if(['rango_a','legendario','ss'].includes(item.rarity)) flashRareDrop(item, RARITIES[item.rarity].name);
        }
      }
    }
    // Los cofres también pueden dar una piedra de alma — a diferencia del
    // jefe de década, acá NO está asegurada (pedido explícito): es una
    // tirada más contra la misma tabla plana (con el mismo escalado por
    // piso), independiente del oro/objeto de arriba.
    const stoneDrop = rollStoneDropForLevel(dg.level||1, null);
    if(stoneDrop){
      addToInventory(stoneDrop);
      msg += ` También encuentras una piedra de alma: <b style="color:${SOUL_TIER_COLORS[stoneDrop.tier]};">${stoneDrop.name}</b>.`;
      advanceMissionsFor('find_soul_stones', 1);
      if(['A','S','SS'].includes(stoneDrop.tier)) flashRareDrop(stoneDrop, stoneDrop.tier);
    }
    log(msg);
    node.done = true;
    advanceMissionsFor('open_chests', 1);
    renderAll();
  } else if(node.type==='descanso'){
    const d = derived();
    state.char.curHP = d.maxHP;
    state.char.curSta = d.maxSta;
    state.char.curSpi = d.maxSpi;
    // La hoguera restaura TODO a full de forma automática: vida, MP y
    // espíritu del jugador, y también la vida, MP y espíritu que cada aliado
    // arrastra entre combates del mismo nivel (state.dungeon.allyHP/allyMP/
    // allySpirit, ver syncAllyHPToDungeon) — antes solo tocaba al jugador y
    // encima solo curaba MP/espíritu a medias.
    if(!state.dungeon.allyHP) state.dungeon.allyHP = {};
    if(!state.dungeon.allyMP) state.dungeon.allyMP = {};
    if(!state.dungeon.allySpirit) state.dungeon.allySpirit = {};
    (state.char.allies||[]).forEach(row=>{
      state.dungeon.allyHP[row.id] = allyMaxHP(row);
      state.dungeon.allyMP[row.id] = allyMaxMP(row);
      state.dungeon.allySpirit[row.id] = allyMaxSpirit(row);
    });
    log('Una hoguera olvidada. Vida, MP y espíritu restaurados por completo, para ti y para todo tu equipo.');
    node.done = true;
    advanceMissionsFor('rest_bonfires', 1);
    renderAll();
  }
}

/* ============================================================
   LOOT
   ============================================================ */
// Tabla plana de drop: el juego es de grindeo — cada rango tiene su propia
// probabilidad fija de base (reemplaza la vieja tabla por banda), aunque el
// piso actual del laberinto la inclina un poco hacia los rangos altos y le
// recorta los bajos pasado cierto punto (ver scaleLootTableForDungeon más
// abajo). Se revisa de más raro a más común, cada uno un chance()
// independiente; el primero que acierte gana. Si ninguno acierta, no cae
// nada esta vez (grind real: la mayoría de combates no sueltan equipo).
// Letra -> rango de equipo. El equipo no tiene un escalón para F: pasa
// directo de Común (E) a Poco Común (D), a pedido explícito.
// Legendario/SS (equipo y piedras) todavía no están habilitados para caer —
// el contenido, las fórmulas y los niveles mínimos ya existen, listos para
// cuando se activen. Cambiar a true los habilita sin tocar nada más.
const LEGENDARY_TIERS_ENABLED = false;
const FLAT_GEAR_TABLE = [
  {rarity:'ss',         chance:0.00001},  // SS  0.001%
  {rarity:'legendario', chance:0.00005},  // S   0.005%
  {rarity:'rango_a',    chance:0.01},     // A   1%
  {rarity:'rango_b',    chance:0.01},     // B   1% (bajado de 2%)
  {rarity:'raro',       chance:0.02},     // C   2% (bajado de 3%)
  {rarity:'poco_comun', chance:0.10},     // F   10% (fusionado en Común, ver E)
  {rarity:'comun',      chance:0.20}      // E   20%
].filter(e => LEGENDARY_TIERS_ENABLED || !['ss','legendario'].includes(e.rarity));
const FLAT_STONE_TABLE = [
  {tier:'SS', chance:0.00001},
  {tier:'S',  chance:0.00005},
  {tier:'A',  chance:0.01},
  {tier:'B',  chance:0.01},   // bajado de 2%
  {tier:'C',  chance:0.02},   // bajado de 3%
  {tier:'D',  chance:0.05},
  {tier:'F',  chance:0.10},
  {tier:'E',  chance:0.20}
].filter(e => LEGENDARY_TIERS_ENABLED || !['S','SS'].includes(e.tier));
// Piso más profundo (state.char.maxLevelUnlocked) que ya debiste alcanzar de
// verdad para que un rango pueda caer — Épico y superior necesitan haber
// avanzado de verdad; C/B piden haber pasado la primera década (piso 11+);
// todo lo demás (E-D) no tiene tope. El jefe de década del piso 10 es la
// única excepción a C/B (ver bypassTiers en handleVictory): es el primer
// vistazo a esos rangos, incluso para quien llega ahí todavía por debajo
// del piso 11.
// 2026-09-24, pedido explícito: Rango A baja a piso 20 (antes 21) para que
// coincida con el cierre de década correspondiente. legendario/ss (Tier S/SS)
// se dejan re-calibrados por si algún día se habilita también su drop al
// azar (ver LEGENDARY_TIERS_ENABLED) — hoy Tier S se consigue solo con la
// Forja Legendaria (ver TIER_S_RECIPE/buyTierSWeapon/buyTierSStone), que
// tiene su propio candado de piso 40+ independiente de esta tabla.
// 2026-09-25, fix explícito (ariochbu preguntó si esto ya gateaba por piso):
// SÍ gateaba, pero contra state.char.level (nivel de personaje) en vez del
// piso real — ambos suelen ir parejos pero pueden desincronizarse (grindear
// nivel sin avanzar piso, o al revés), así que un rango A podía caer antes
// de pisar el piso 20 de verdad. Se cambió a state.char.maxLevelUnlocked.
// 2026-09-27, bug real reportado (ariochbu dropeó Rango A en el piso 6):
// maxLevelUnlocked es un techo que NUNCA baja, así que un personaje que ya
// había llegado al piso 20+ alguna vez podía volver a grindear un piso bajo
// y seguir sacando Rango A ahí — justo el mismo problema de fondo que el
// fix de arriba quiso evitar, con otra variable. El gate correcto es el piso
// REAL en el que se está peleando AHORA MISMO: los call-sites de combate/
// cofre (handleVictory/enterNode) ahora pasan state.dungeon.level en vez de
// maxLevelUnlocked. La única excepción real es makeMissionItemReward(): una
// misión no tiene "el piso de ahora" (se completa desde el Gremio, no desde
// un piso concreto), así que ese sigue usando maxLevelUnlocked a propósito.
const GEAR_TIER_MIN_LEVEL = {rango_a:20, legendario:40, ss:50, rango_b:11, raro:11};
const STONE_TIER_MIN_LEVEL = {A:20, S:40, SS:50, B:11, C:11};
// Requisito de NIVEL PARA EQUIPAR (pedido explícito 2026-09-27) — distinto y
// aparte del gate de arriba, que es sobre qué rango puede CAER según el piso
// del laberinto. Este es sobre qué rango puede USARSE según el nivel de
// quien se lo pone (el propio nivel del personaje, o el del aliado si es a
// un aliado — cada uno el suyo, nunca el del otro). Aplica por igual a
// equipo general, armas y piedras de alma. Rango B pide nivel 20, Rango A
// pide 40, Tier S (y SS, que no tiene techo propio por encima de 60) pide
// 60 — el propio tope de personaje/aliado. Se hace cumplir en el momento de
// equipar (equipItem/equipItemOnAlly/socketStone/socketStoneOnAlly, ver más
// abajo) y retroactivamente contra lo que ya estaba puesto antes de este
// cambio (ver migrateState() y refreshAlliesState()): lo que ya no cumple
// se desequipa solo, de vuelta a la mochila (las piedras NO se destruyen en
// este caso — esa regla de "se pierden para siempre" es solo para cuando el
// jugador elige retirarlas a mano, no para esta migración automática).
const GEAR_EQUIP_MIN_LEVEL = {rango_b:20, rango_a:40, legendario:60, ss:60};
const STONE_EQUIP_MIN_LEVEL = {B:20, A:40, S:60, SS:60};
function gearEquipMinLevel(rarity){ return GEAR_EQUIP_MIN_LEVEL[rarity]||0; }
function stoneEquipMinLevel(tier){ return STONE_EQUIP_MIN_LEVEL[tier]||0; }
// El equipo automático de Sacerdote (armadura/casco/botas/guantes/amuleto y
// arma2 con styleId 'sacerdote', ver grantAllyAutoGear) se otorga "sin
// importar su propio nivel" (jefe de la década 30 = Épico, década 60 = Tier
// S), así que el requisito de nivel para equipar no le aplica — antes el
// aliado lo recibía y en la siguiente carga stripUnmetLevelEquip() lo mandaba
// de vuelta a la mochila por no llegar al nivel 40/60. Ese equipo no se
// consigue de ninguna otra forma, así que reconocerlo por styleId alcanza y
// también cubre el que ya estaba guardado antes de este arreglo.
// autoGear: Arma 1 que el hito le otorga al Sacerdote (2026-10-02) — igual
// que el resto de su equipo automático, no exige el nivel de rango.
function isSacerdoteAutoGear(item){ return !!item && (!!item.autoGear || (item.styleId==='sacerdote' && item.slot!=='arma')); }
// forSacerdoteAlly: el equipo automático del Sacerdote solo está exento del
// nivel cuando lo lleva un aliado Sacerdote — desde que es Voluntad
// Inquebrantable (sin senda) cualquiera podría equiparlo, y no debe servir
// para saltarse el nivel en el jugador u otros aliados.
function meetsGearEquipLevel(item, level, forSacerdoteAlly){ return (forSacerdoteAlly && isSacerdoteAutoGear(item)) || (level||1) >= gearEquipMinLevel(item.rarity); }
function meetsStoneEquipLevel(stone, level){ return (level||1) >= stoneEquipMinLevel(stone.tier); }
// Migración retroactiva del requisito de nivel de arriba (pedido explícito
// 2026-09-27, "inclusive las que ya están en juego"): cualquier equipo/arma/
// piedra que ya estaba puesto ANTES de esta regla y ya no cumple el nivel
// mínimo se desequipa solo, de vuelta a la mochila — nunca se destruye (a
// diferencia de cuando el jugador retira una piedra a mano). Se llama una
// vez al cargar el personaje (migrateState, sobre state.char) y una vez por
// cada aliado al refrescarlos (refreshAlliesState, sobre cada row).
function stripUnmetLevelEquip(equipObj, level, ownerName, forSacerdoteAlly){
  let changed = false;
  EQUIP_SLOTS.forEach(slot=>{
    const it = equipObj[slot];
    if(it && !meetsGearEquipLevel(it, level, forSacerdoteAlly)){
      equipObj[slot] = null;
      state.char.inventory.push(ensureItemUid(it));
      changed = true;
      const who = ownerName ? ` (${ownerName} no alcanza el nivel ${gearEquipMinLevel(it.rarity)})` : ` (nivel ${gearEquipMinLevel(it.rarity)} requerido)`;
      log(`<b>${it.name}</b> vuelve a la mochila${who}.`);
    }
  });
  return changed;
}
function stripUnmetLevelStones(slotsArray, level, ownerName){
  let changed = false;
  (slotsArray||[]).forEach((st, i)=>{
    if(st && !meetsStoneEquipLevel(st, level)){
      slotsArray[i] = null;
      state.char.inventory.push(ensureItemUid(st));
      changed = true;
      const who = ownerName ? ` (${ownerName} no alcanza el nivel ${stoneEquipMinLevel(st.tier)})` : ` (nivel ${stoneEquipMinLevel(st.tier)} requerido)`;
      log(`<b>${st.name}</b> vuelve a la mochila${who}.`);
    }
  });
  return changed;
}
// A partir de qué nivel del laberinto ("piso") los rangos más bajos (E/F en
// piedras, Común/Poco común en equipo) dejan de poder caer del todo — pedido
// explícito, 2026-09-18: de ahí en adelante lo peor que puede tocar ya es un
// escalón mejor que basura pura.
const HIGH_FLOOR_LOOT_CUTOFF = 40;
const LOW_LOOT_TIERS = new Set(['E','F','comun','poco_comun']);
// Mientras más profundo el piso actual, un poco más de peso relativo ganan
// los rangos altos frente a los bajos dentro de la misma tabla plana de
// arriba — no cambia CUÁLES rangos existen (eso ya lo hace el filtro de
// arriba + STONE/GEAR_TIER_MIN_LEVEL), solo inclina la balanza entre los que
// sí pueden caer. boost va de 0 (piso 1) a 1 (piso 60); +15% de peso por
// escalón de rareza de distancia al más común, multiplicado por boost.
function scaleLootTableForDungeon(table){
  const level = (state.dungeon && state.dungeon.level) || 1;
  const filtered = level < HIGH_FLOOR_LOOT_CUTOFF
    ? table
    : table.filter(e => !LOW_LOOT_TIERS.has(e.rarity || e.tier));
  const boost = Math.min(1, level/60);
  const n = filtered.length;
  return filtered.map((e,i)=> ({...e, chance: e.chance * (1 + boost*(n-1-i)*0.15)}));
}
// Contador de pity: combates sin un drop de rango A o mejor. Pity suave desde
// PITY_SOFT (la chance de ese rango sube gradualmente en cada intento
// fallido); pity duro en PITY_HARD (el siguiente combate lo garantiza). Se
// resetea a 0 en cuanto cae algo de ese rango o mejor. Solo cuenta combates,
// no cofres ni tiradas sueltas dentro de un mismo combate.
const PITY_SOFT = 200, PITY_HARD = 400;
const GEAR_PITY_TIERS = new Set(['rango_a']); // legendario/ss se suman aquí si alguna vez tienen su propio pity
const STONE_PITY_TIERS = new Set(['A','S','SS']);
function pityBoostedChance(counter, baseChance){
  if(!counter || counter < PITY_SOFT) return baseChance;
  if(counter >= PITY_HARD) return 1;
  return baseChance + (1-baseChance) * ((counter-PITY_SOFT)/(PITY_HARD-PITY_SOFT));
}
function rollFlatRarity(table, minLevelMap, level, bypassTiers, pityCounter, pityTiers){
  for(const entry of table){
    const key = entry.rarity || entry.tier;
    const minLvl = minLevelMap[key];
    if(minLvl && !(bypassTiers && bypassTiers.has(key)) && (level||1) < minLvl) continue; // todavía no calificas para este rango, prueba el siguiente (más común)
    const useChance = (pityTiers && pityTiers.has(key)) ? pityBoostedChance(pityCounter, entry.chance) : entry.chance;
    if(chance(useChance)) return key;
  }
  return null;
}
// Solo las 4 sendas que el propio jugador puede usar entran al pool de botín
// al azar — Sacerdote es exclusivo de aliados de Taberna, así que antes
// "desperdiciaba" 1 de cada 5 tiradas en un arma que el jugador nunca podía
// equiparse. Ariochbu reportó que el Guerrero parecía dropear más que el
// resto: revisando el código, pick() ya era uniforme entre las 5 sendas —
// no encontré un sesgo real hacia Guerrero específicamente — pero excluir
// Sacerdote de este pool sí deja las 4 sendas jugables exactamente parejas
// (25% cada una), que es la garantía explícita que se pidió.
// 2026-10-02: se suman Paladín y Hechicero — ya son sendas jugables y hasta
// ahora su equipo nunca caía en el laberinto (solo se podía comprar).
const WEAPON_STYLE_IDS = ['pesada','doblefilo','tirador','mago','paladin','hechicero'];
function generateEquipOfRarity(rarity, floorIdx){
  const slot = pick(['arma','armadura','amuleto','casco','botas','guantes']);
  // El botín (arma Y equipo general) ahora sale del mismo catálogo fijo por
  // rango que la tienda — ya no escala con el piso ni tira un stat al azar,
  // para que un cofre nunca pueda dar más (ni distinto) de lo que ese rango
  // ya da en cualquier otro lado (pedido explícito: "los cofres solo pueden
  // dar equipamiento de los que vamos a dar, no pueden dar stats mas
  // altos"). Sacerdote queda fuera del pool aleatorio (ver WEAPON_STYLE_IDS
  // más abajo): un jugador nunca puede equiparse esa senda.
  const styleId = pick(WEAPON_STYLE_IDS);
  if(slot==='arma') return makeWeaponItem('arma', styleId, rarity);
  // Conjuntos (2026-10-02, "drop como los anteriores equipamientos"): una
  // parte del equipo general que cae es una pieza de conjunto al azar.
  // Bug de reparto (2026-10-04, reportado por ariochbu): solo el 40% del equipo
  // general sorteaba conjunto y el otro 60% era SIEMPRE Voluntad Inquebrantable
  // (makeGearItem), así que Voluntad salía el 65% de las veces y cada uno de
  // los otros siete el 5%. Ahora los ocho conjuntos tienen la misma probabilidad.
  return makeSetItem(pick(SET_IDS), slot, rarity);
}
const SET_DROP_SHARE = 0.4;
// Tira contra la tabla plana de equipo para el nivel de personaje dado — usada
// tanto por cofres/misiones (generateLoot) como por cada victoria en combate.
// Puede devolver null: no todo combate suelta algo, así es el grindeo.
function rollGearDropForLevel(level, floorIdx, bypassTiers){
  const rarity = rollFlatRarity(scaleLootTableForDungeon(FLAT_GEAR_TABLE), GEAR_TIER_MIN_LEVEL, level, bypassTiers, state.char.pityGear||0, GEAR_PITY_TIERS);
  if(!rarity) return null;
  return generateEquipOfRarity(rarity, floorIdx);
}
function rollStoneDropForLevel(level, bypassTiers){
  const tier = rollFlatRarity(scaleLootTableForDungeon(FLAT_STONE_TABLE), STONE_TIER_MIN_LEVEL, level, bypassTiers, state.char.pityStone||0, STONE_PITY_TIERS);
  if(!tier) return null;
  const pool = Object.values(SOUL_STONES).filter(s=>s.tier===tier);
  const tpl = pick(pool);
  return makeSoulStoneItem(tpl);
}
// Piedra de alma garantizada — el jefe de década (ver stonesAllowedThisFight
// en handleVictory) siempre suelta una, respetando las mismas proporciones
// entre rangos que cualquier otra tirada: simplemente se reintenta la misma
// tabla hasta que salga alguna, nunca "nada" (a diferencia de un cofre o un
// mob normal, que sí pueden no soltar ninguna). Termina siempre porque D
// (piedras) no tiene nivel mínimo ni queda excluido por HIGH_FLOOR_LOOT_CUTOFF.
function rollGuaranteedStoneDropForLevel(level, bypassTiers){
  let stone = null;
  while(!stone) stone = rollStoneDropForLevel(level, bypassTiers);
  return stone;
}
function generateLoot(floorIdx, level){
  if(chance(0.4)){
    return {kind:'potion', potionId: pick(Object.keys(POTION_TEMPLATES))};
  }
  return rollGearDropForLevel(level||1, floorIdx);
}

/* ============================================================
   ENEMY FACTORY
   ============================================================ */
// Ajuste de vida/ataque de cada JEFE DE DÉCADA (pedido explícito 2026-10-02:
// "un jefe de década no debe ser un jefe más", meta 60-70% de victorias).
// Calibrado con simulaciones de combate: jugador al nivel del jefe, equipo
// de su conjunto afín (Raro en nivel 10, Rango B en 20-30, Rango A en 40+),
// piedras de alma del rango equivalente en todos sus espacios, 3 pociones
// de vida y 4 aliados del mismo nivel y rango de equipo.
// Con ese grupo la media de victorias queda en ~60-70% en los jefes 10-50
// y ~50% en Storm Gush (60), con las clases niveladas por CLASS_CURVE.
// Meta pedida para las décadas futuras (con equipo Rango A; el S/SS y la
// estrategia del jugador lo suben): 70 → 40%, 80 → 30%, 90 → 20%, 100 → 10%. El Custodio (50) partía muy por debajo de la
// curva y se cura, así que se le sube más el ataque que la vida para no
// alargar el combate.
const DECADE_BOSS_TUNING = {
  10: {hp:1.01, atk:1.02},
  20: {hp:1.68, atk:1.28},
  30: {hp:1.49, atk:1.20},
  40: {hp:1.32, atk:1.16},
  50: {hp:1.42, atk:1.45},  // 2026-10-04: Custodio ~61% con la referencia nueva (rango A + piedras A + Caídos épicos)
  60: {hp:1.85, atk:2.05},  // 2026-10-04: Storm Gush ~50% con esa referencia (antes 94%: se había calibrado sin Caídos)  // 2026-10-08, primera calibración (16 combates por senda, 4 sendas, misma
  // referencia a nivel 70/80): meta 40% y 30%.
  70: {hp:1.90, atk:2.10},  // El Sin Forma (~35% con 4 sendas; 1.8/2.0 daba 56% con las seis)
  80: {hp:1.75, atk:1.90},  // El Corazón Marchito (1.6/1.75 daba 48% con las seis sendas; 1.9/2.1, 11% con cuatro)
};
// BETA (con BETA_ALLY_UNLOCKS): en las décadas 0-3 el jugador lleva menos
// aliados (0 hasta el Ogro, 1 hasta la Matriarca, 2 hasta Riakis, 3 hasta
// el Usurpador), así que jefes y enemigos de esos tramos se ajustan para
// que la dificultad sea equivalente a la de la alfa con 4 aliados.
// Calibrado con simulaciones (mismo método que DECADE_BOSS_TUNING).
const BETA_DECADE_BOSS_TUNING = {
  // 2026-10-04: medido con la referencia de cada tramo (ver CLASS_CURVE_BETA);
  // media de las seis sendas entre paréntesis.
  10: {hp:0.24, atk:0.50},  // Ogro en solitario, equipo raro (68%)
  // 2026-10-08, pedido explícito ("casi imposible de pasar"): antes hp 0.89 /
  // atk 0.96. Con 1 aliado, equipo Raro, piedras C y Caídos raros ganaba el 3%
  // de las veces; ahora ~34% (y ~97% con equipo Rango B). No tenía ninguna
  // "anticuración": era puro daño y vida.
  20: {hp:0.80, atk:0.80},  // Matriarca con 1 aliado
  30: {hp:1.05, atk:1.00},  // Riakis con 2 aliados, rango B (69%)
  40: {hp:0.87, atk:0.82},  // Usurpador con 3 aliados, rango B (65%)
};
// Enemigos que NO son jefe de década, por índice de década (1 = pisos 11-19...).
// Medido: con 2-3 aliados los combates normales/élite/guardián rinden igual
// que con 4; solo los guardianes de la década 1 (1 aliado) necesitaban ajuste.
// 2026-10-04: por tipo. Pisos despejados enteros con la referencia del tramo:
// 5-9 ≈ 85-99%, 15-19 ≈ 97-100%, 25-29 ≈ 86%, 35-39 ≈ 86-89%.
const BETA_ENEMY_SCALE = {
  0: {guardian:{hp:0.60, atk:0.70}},   // en solitario el guardián del 8-9 era un muro (14% de pisos despejados)
  1: {regular:{hp:1.08, atk:1.16}, elite:{hp:1.08, atk:1.16}, guardian:{hp:1.08, atk:1.16}},
  3: {regular:{hp:1.30, atk:1.50}, elite:{hp:1.30, atk:1.50}, guardian:{hp:1.20, atk:1.35}},
};
// Normales, élites y guardianes por década (índice 4 = pisos 41-50, 5 = 51-60).
// Calibrado con el simulador de balance (simLevels) contra la misma referencia
// que los jefes: rango A + piedras A + Caídos épicos + 4 aliados.
const DECADE_ENEMY_TUNING = {
  // Perfiles elegidos por ariochbu el 2026-10-04, medidos como "% de veces que
  // la referencia completa un nivel entero":
  //   1-20  actual (sin ajuste)
  //   21-29 moderado (~90%): antes ~100%. Referencia: rango B + piedras B + Caídos únicos.
  //   31-39 moderado (~90%): antes ~100%. Misma referencia.
  //   41-49 duro: SIN ajuste — ya promediaba ~78% (82 / 89 / 63), que es el perfil duro.
  //   51-59 duro (~75%): antes 100%. Referencia: rango A + piedras A + Caídos épicos.
  2: {regular:{hp:1.3, atk:1.5}, elite:{hp:1.2, atk:1.4}, guardian:{hp:1.1,  atk:1.15}},
  3: {regular:{hp:1.4, atk:1.8}, elite:{hp:1.3, atk:1.6}, guardian:{hp:1.2,  atk:1.3}},
  5: {regular:{hp:1.8, atk:2.6}, elite:{hp:1.7, atk:2.4}, guardian:{hp:1.5,  atk:1.75}},  // 61-69 y 71-79 (2026-10-08, primera pasada con pocas muestras): perfil duro,
  // ~70-80% de niveles completados con la referencia (rango A + piedras A +
  // Caídos épicos + 4 aliados, personaje al nivel del piso). Con x2.2/3.3 salía ~96-100%.
  6: {regular:{hp:2.5, atk:3.8}, elite:{hp:2.5, atk:3.8}, guardian:{hp:1.9,  atk:2.4}},
  7: {regular:{hp:2.8, atk:4.3}, elite:{hp:2.8, atk:4.3}, guardian:{hp:2.1,  atk:2.65}},
};
function makeEnemy(tpl, floorIdx, level){
  const lvlMult = levelMult(level||1);
  const floorMult = 1 + floorIdx * floorDifficultyStep(level||1);
  let hp, atk;
  if(tpl.boss){
    // guardian: level 1 baseline ~300 HP, then +14% compounding per level.
    // El guardián de nivel 1 se pidió más accesible: 200 HP fijos y menor defensa física.
    // A partir del nivel 11 cada jefe de década usa su propio tpl.hp/tpl.atk
    // (antes se ignoraban y todo jefe caía en el mismo 300*lvlMult/26*lvlMult
    // plano, sin importar su diseño — el Tótem y el resto del sistema de
    // jefes de década llevaban ese bug desde que se agregó el bestiario).
    if(level===1){
      hp = 200;
      atk = Math.round(26 * lvlMult);
    } else {
      hp = Math.round(300 * tpl.hp * lvlMult);
      atk = Math.round(26 * tpl.atk * lvlMult);
    }
    // Jefe de década: ajuste propio de vida/ataque (ver DECADE_BOSS_TUNING).
    const tune = (BETA_BALANCE && BETA_DECADE_BOSS_TUNING[level]) || DECADE_BOSS_TUNING[level];
    if(tune && level % 10 === 0 && DECADE_BESTIARY[decadeIndexForLevel(level)].decadeBoss === tpl){
      hp = Math.round(hp * tune.hp);
      atk = Math.round(atk * tune.atk);
    }
  } else if(tpl.elite){
    // elite: 2026-09-16, pedido explícito — base sube de 100-110 a 125-135,
    // y su curva de vida ya no usa lvlMult (crecía muy lento a nivel alto)
    // sino eliteHPMult, calibrada para nivel 20/40/60 = 1000/2000/3000.
    // El ataque usa monsterAtkMult (ver arriba, pedido explícito 2026-09-18)
    // en vez de lvlMult — mismo motivo que el mob regular de abajo.
    hp = Math.round(rnd(125,135) * tpl.hp * floorMult * eliteHPMult(level||1));
    atk = Math.round(16 * tpl.atk * floorMult * monsterAtkMult(level||1));
  } else {
    // regular mob: 2026-09-16, pedido explícito — además del piso de 40-50 a
    // 55-65, la curva de vida usa regularHPMult (no lvlMult) para llegar a
    // ~500-600 en nivel 20, ~1200-1300 en 40, ~1700-1800 en 60. El ataque usa
    // monsterAtkMult (ver arriba, pedido explícito 2026-09-18: el piso 41 en
    // adelante deleteaba al equipo completo desde el primer combate — 5-6
    // mobs regulares por pelea, cada uno pegando ~22% de la vida de un
    // Asesino con lvlMult puro, es letal si dos o tres enfocan al mismo
    // objetivo en un mismo round).
    hp = Math.round(rnd(55,65) * tpl.hp * floorMult * regularHPMult(level||1));
    atk = Math.round(9 * tpl.atk * floorMult * monsterAtkMult(level||1));
  }
  if(BETA_BALANCE){
    const dIdx = decadeIndexForLevel(level||1);
    const isDecadeBoss = (level||1) % 10 === 0 && DECADE_BESTIARY[dIdx].decadeBoss === tpl;
    const scAll = !isDecadeBoss && BETA_ENEMY_SCALE[dIdx];
    // por tipo (regular/elite/guardian) o un único {hp, atk} para todos
    const sc = scAll && (scAll[tpl.boss ? 'guardian' : tpl.elite ? 'elite' : 'regular'] || (scAll.hp ? scAll : null));
    if(sc){ hp = Math.max(1, Math.round(hp*sc.hp)); atk = Math.max(1, Math.round(atk*sc.atk)); }
  }
  // Ajuste por década de los enemigos que NO son jefe de década (ver
  // DECADE_ENEMY_TUNING): normales, élites y guardianes, cada uno por separado.
  {
    const dIdx = decadeIndexForLevel(level||1);
    const isDecadeBoss = (level||1) % 10 === 0 && DECADE_BESTIARY[dIdx].decadeBoss === tpl;
    // En la beta las décadas 0-3 se juegan con menos aliados y tienen su propia escala (BETA_ENEMY_SCALE).
    const t = !isDecadeBoss && !(BETA_BALANCE && dIdx <= 3) && DECADE_ENEMY_TUNING[dIdx] && DECADE_ENEMY_TUNING[dIdx][tpl.boss ? 'guardian' : tpl.elite ? 'elite' : 'regular'];
    if(t){ hp = Math.max(1, Math.round(hp*t.hp)); atk = Math.max(1, Math.round(atk*t.atk)); }
  }
  const res = Object.assign({}, tpl.res);
  if(tpl.boss && level===1) res.fisico = 5; // defensa física reducida solo para el guardián de nivel 1
  // Resistencias por piso (2026-09-16, pedido explícito, "así como la
  // evasión"): cada piso dentro de la misma década suma un poco a TODAS las
  // resistencias del enemigo (física y elementales por igual) — un goblin
  // del piso 9 resiste algo más que uno del piso 1, aunque sea la misma
  // especie. Valor propio (no vino especificado), fácil de retocar.
  const RES_PER_FLOOR = 0.8;
  Object.keys(res).forEach(k=> res[k] += floorIdx*RES_PER_FLOOR);
  // Esquivar (2026-09-16, pedido explícito junto con Precisión en el
  // equipo): los enemigos ahora también pueden esquivar un golpe. Base por
  // tier (propia, no vino especificada) + un poco más por cada piso dentro
  // de la década (igual criterio que las resistencias de arriba) — la
  // brecha de nivel entre jugador y monstruo se suma aparte, en combate
  // (ver levelGapEvasionBonus/monsterEffectiveLevel), no acá.
  const EVASION_PER_FLOOR = 0.003;
  const evasion = (tpl.boss ? 0.10 : tpl.elite ? 0.08 : 0.05) + floorIdx*EVASION_PER_FLOOR;
  // Precisión y Crítico de monstruo (pedido explícito 2026-09-28: "la
  // precisión, evasión y probabilidad de crítico también deben ser
  // aplicados a los monstruos... así mismo como stat del laberinto, por
  // piso"). Mismo criterio que Evasión arriba (base por categoría + un poco
  // más por piso dentro de la década). Precisión contrarresta la evasión del
  // jugador/aliado (ver frontlineTarget/enemyAct). Crítico es una mecánica
  // nueva de verdad — antes NINGÚN enemigo critaba — así que arranca a un
  // ritmo más sobrio que el del jugador (mitad o menos) para no sentirse
  // injusto; se sube después si en la práctica queda floja.
  const PRECISION_PER_FLOOR = 0.002;
  const precision = (tpl.boss ? 0.08 : tpl.elite ? 0.06 : 0.03) + floorIdx*PRECISION_PER_FLOOR;
  // Crítico de monstruo (ajuste 2026-09-28, pedido explícito): un mob o
  // élite normal se queda como "mala suerte" — chico, sube poco con el piso
  // dentro de la década. Un guardián o jefe de década (tpl.boss) en cambio
  // debe sentirse en la estrategia real de la pelea, no como azar — por eso
  // su crítico escala con el NIVEL del laberinto (1-LEVEL_CAP), no con el
  // floorIdx de 1-10 dentro de la entrada actual: así el guardián del piso
  // 10 ya pega fuerte (~13%) pero el que cierra la última década (hoy Storm
  // Gush, piso 60) es el que de verdad obliga a jugar alrededor del
  // crítico (~30%). LEVEL_CAP (no un 60 fijo) para que esto se reacomode
  // solo cuando el laberinto crezca a 100 pisos.
  const CRIT_PER_FLOOR = 0.001;
  const BOSS_CRIT_BASE = 0.10, BOSS_CRIT_MAX_BONUS = 0.20;
  const critChance = tpl.boss
    ? BOSS_CRIT_BASE + (level/LEVEL_CAP)*BOSS_CRIT_MAX_BONUS
    : (tpl.elite ? 0.035 : 0.02) + floorIdx*CRIT_PER_FLOOR;
  return {
    tpl, name:tpl.name, icon:tpl.icon,
    maxHP:hp, hp:hp, atk:atk, res, evasion, precision, critChance,
    // Jefes y guardianes resisten el control mental (2026-10-02): sin esto,
    // Miedo/Confusión del Hechicero los dejaban perdiendo turno tras turno.
    mentalResist: tpl.mentalResist!=null ? tpl.mentalResist : (tpl.boss ? 0.5 : 0),
    statuses:[], defending:false, cooldowns:{}
  };
}

/* ============================================================
   COMBAT
   ============================================================ */
// LEY DEL CAOS (La Grieta, pisos 61-70 — diseño de ariochbu: "el caos cambia
// las reglas, pero nunca las oculta"). Cada combate de esa década recibe una
// ley al azar que afecta a TODOS por igual, dura el combate entero y se
// anuncia al empezar; queda a la vista como un estado en cada combatiente.
const CHAOS_LAWS = [
  {name:'Ley: Gravedad Reducida', text:'todos esquivan más (+10% de evasión)', status:{evasionDelta:10}},
  {name:'Ley: Eco Violento', text:'todos golpean más fuerte (+15% de daño)', status:{dmgMult:1.15}},
  {name:'Ley: Piel de Vidrio', text:'todos reciben más daño (+15%)', status:{incomingDmgReduction:-0.15}},
  {name:'Ley: Sangre Espesa', text:'todos resisten más (−12% de daño recibido)', status:{incomingDmgReduction:0.12}},
];
function applyChaosLaw(){
  const lvl = (state.dungeon && state.dungeon.level) || 1;
  if(lvl < 61 || lvl > 70 || !combat) return;
  const law = pick(CHAOS_LAWS);
  const st = ()=> Object.assign({name: law.name, duration:99, chaosLaw:true}, law.status);
  combat.playerStatuses.push(st());
  (combat.allies||[]).forEach(a=> a.statuses.push(st()));
  combat.enemies.forEach(e=> e.statuses.push(st()));
  combat.chaosLaw = law;
  STATUS_INFO[law.name] = {buff: !(law.status.incomingDmgReduction < 0), desc: `Ley del Caos de este combate: ${law.text}. Afecta a todos por igual.`};
  log(`⚠ <b>${law.name.replace('Ley: ', 'Ley del Caos — ')}</b>: ${law.text}.`);
}
// Estados genéricos sobre el jugador y sus aliados: dmgMult (p. ej. una Ley
// del Caos) y los que escalan por carga (Corrupción). Furioso/Inspirado
// tienen su propia lógica y no pasan por acá.
function statusStackDealtMult(statuses){
  let m = 1;
  (statuses||[]).forEach(st=>{
    if(st.perStackDmg) m *= 1 + st.perStackDmg*(st.stacks||1);
    if(st.dmgMult && st.name!=='Furioso' && st.name!=='Inspirado') m *= st.dmgMult;
  });
  return m;
}
function statusStackTakenMult(statuses){
  let m = 1;
  (statuses||[]).forEach(st=>{ if(st.perStackTaken) m *= 1 + st.perStackTaken*(st.stacks||1); });
  return m;
}
function startCombat(enemyGroup, node){
  // makeCombatAlly recupera la vida con la que cada aliado terminó su último
  // combate en este mismo nivel (ver syncAllyHPToDungeon) - un aliado
  // derribado sigue fuera de combate hasta avanzar de nivel, no revive aquí.
  const allies = (state.char.allies||[]).map(makeCombatAlly);
  combat = {
    active:true,
    node,
    enemies:enemyGroup, // slot 0 = front
    allies,
    hostileAllies:[], // ids de aliados que te han atacado esta pelea — solo esos se pueden golpear de vuelta
    // Arquero y Mago pelean a distancia — por defecto empiezan en
    // Retaguardia, igual que cualquier aliado no-frontline (ver
    // makeCombatAlly: pos = tpl.frontline ? 'frente' : 'retaguardia').
    // Guerrero y Paladín empiezan en el Frente. Pedido explícito
    // 2026-09-26. El jugador puede reposicionarse manualmente en cualquier
    // momento con "Reposicionarse", esto solo cambia el punto de partida.
    // El Asesino arranca en la Retaguardia (2026-10-02, pedido explícito):
    // ataca desde atrás sin exponerse; el Paladín sigue en el Frente.
    playerPos: (isRangedStyle() || state.char.style==='doblefilo') ? 'retaguardia' : 'frente',
    playerStatuses:[],
    playerDefending:false,
    turnLog:[],
    turnCount:0, // cuántos turnos propios ya jugaste en ESTA pelea - ver endPlayerTurn() y la alerta de posible trampa en handleVictory()
    lastActor:null, // quién actuó justo antes del último render - dispara la animación en battleStage.js
    lastAction:null, // {label, effects:[{targetKind:'enemy'|'ally'|'player', key, amount, kind:'dmg'|'heal'}]} de ese mismo actor
    pendingSkill:null, // skillId esperando click de objetivo en el canvas - ver syncBattleStage()
    pendingTargetFilter:null, // 'front'|null — restringe el click al conjunto elegible del momento: línea frontal si sigue viva, o toda la retaguardia si ya no queda nadie al frente (ver playerFrontTargetIndices/useSkillFromMenu/onTarget)
    openSubmenu:null, // 'habilidades'|'mochila'|null — qué submenú quedó abierto entre renders (ver renderCombat); solo se cierra con "Volver" o al terminar el combate
    // Marca qué pasivas de Tier S ya se activaron en ESTE combate — todas las
    // pasivas de Tier S (armas y equipo) valen 1 vez por combate y 4 turnos
    // de duración cuando aplican un buff/debuff temporal (pedido explícito
    // 2026-09-24). Claves libres tipo 'martillo_s' o 'botas_s:player' — ver
    // TIER_S_PROC_EFFECTS y hasTierSProc().
    tierSFired: new Set(),
    // Escudo del jugador (2026-09-25, pedido explícito): absorbe daño antes
    // que la vida, se muestra en morado por encima de la barra de vida (ver
    // renderSheet/renderCombat/battleStage.js). No se acumula entre
    // combates — arranca en 0 en cada pelea nueva, igual que playerDefending.
    playerShield: 0,
    over:false
  };
  invOpen = false;
  const allyText = allies.length ? ` A tu lado: ${allies.map(a=>a.name).join(', ')}.` : '';
  log(`¡Emboscada! Te enfrentas a: ${enemyGroup.map(e=>e.name).join(', ')}.${allyText}`);
  applyChaosLaw();
  if(node.type==='jefe' && state.dungeon.level % 10 === 0){ stopDungeonAudio(); playBossAudio(); }
  renderAll();
}

function livingAllies(){ return (combat.allies||[]).filter(a=>a.hp>0); }
// A quién apuntan los enemigos: si hay un aliado en el frente con vida, lo
// intercepta a él (como un tanque real). Si no hay tanque y el jugador está
// en Retaguardia, cae en cualquier otro aliado vivo (aunque sea de
// retaguardia) antes que en el jugador — la Retaguardia lo saca de ser
// blanco directo salvo que de verdad no quede nadie más vivo al lado.
function frontlineTarget(){
  // Pisos 1-60 (pedido explícito 2026-09-28): IA propia de los enemigos —
  // acaban SÍ o SÍ con toda la línea frontal antes de tocar la retaguardia.
  // El jugador cuenta como un combatiente más: si está en el Frente, es un
  // blanco más de esa fila (igual que un aliado de frente); si está en la
  // Retaguardia, solo se vuelve blanco cuando no queda nadie al frente.
  // Sombra Cazadora y Brann con Muralla Viviente activa siguen atrayendo la
  // atención por encima del resto de la fila (su texto ya lo prometía).
  if(state.dungeon && (state.dungeon.level||1) <= 60){
    const allies = livingAllies();
    const front = allies.filter(a=>a.pos==='frente').map(a=>({kind:'ally', ally:a}));
    if(combat.playerPos==='frente') front.push({kind:'player'});
    const pool = front.length ? front : allies.map(a=>({kind:'ally', ally:a})).concat([{kind:'player'}]);
    const taunter = pool.find(t=> t.kind==='ally' && (t.ally.isShadow || hasStatus(t.ally.statuses,'Bastión')));
    return taunter || pick(pool);
  }
  const tank = livingAllies().find(a=>a.pos==='frente');
  if(tank) return {kind:'ally', ally:tank};
  if(combat.playerPos==='retaguardia'){
    const others = livingAllies();
    if(others.length) return {kind:'ally', ally: pick(others)};
  }
  return {kind:'player'};
}
function dealDamageToAlly(ally, amount){
  if(amount<=0) return;
  // Corrupción y Leyes del Caos sobre el aliado (los estados con nombre propio
  // — Bastión, Égida… — ya se aplicaron antes de llegar acá).
  let extra = statusStackTakenMult(ally.statuses);
  (ally.statuses||[]).forEach(st=>{ if(st.chaosLaw && st.incomingDmgReduction) extra *= (1 - st.incomingDmgReduction); });
  if(extra !== 1) amount = Math.max(1, Math.round(amount*extra));
  let shieldBroke = false;
  if(ally.shield>0){
    const absorbed = Math.min(ally.shield, amount);
    ally.shield -= absorbed;
    amount -= absorbed;
    shieldBroke = ally.shield<=0;
  }
  if(amount>0) ally.hp = Math.max(0, ally.hp - amount);
  checkAllyFuriaContenidaTrigger(ally);
  if(shieldBroke && ally.hp>0) tryRenewShield(false, ally);
  checkUltimoBastion(false, ally);
}
// Furia Contenida engarzada en un aliado — mismo criterio que la del
// jugador (ver checkFuriaContenidaTrigger), pero leyendo ally.specials
// (piedras + equipo ya aplanados, ver makeCombatAlly) y con su propia
// bandera "1 vez por combate" por id de aliado.
function checkAllyFuriaContenidaTrigger(ally){
  if(!combat) return;
  const fireKey = 'furia_contenida:'+ally.id;
  if(combat.tierSFired.has(fireKey)) return;
  const sp = (ally.specials||[]).find(s=>s.type==='furia_v2');
  if(!sp || ally.maxHP<=0 || (ally.hp/ally.maxHP) >= sp.threshold) return;
  combat.tierSFired.add(fireKey);
  const existing = hasStatus(ally.statuses,'Furioso');
  if(existing) existing.duration = sp.duration;
  else ally.statuses.push({name:'Furioso', duration:sp.duration, dmgMult:1+sp.dmgBonus, incomingDmgReduction:sp.dmgReduction||0});
  const reducTxt = sp.dmgReduction ? ` y -${Math.round(sp.dmgReduction*100)}% de daño recibido` : '';
  log(`<b>${ally.name}</b> se llena de furia: +${Math.round(sp.dmgBonus*100)}% de daño${reducTxt} durante ${sp.duration} turnos.`);
}
function isAllyHostile(allyId){ return (combat.hostileAllies||[]).includes(allyId); }
// Reservado para cuando exista una traición real (el aliado ataca por su
// propia cuenta) — un golpe causado por un efecto de estado como Confusión
// es un accidente, no cuenta como hostil, y no llama a esta función.
function markAllyHostile(allyId){
  if(!combat.hostileAllies) combat.hostileAllies = [];
  if(!combat.hostileAllies.includes(allyId)) combat.hostileAllies.push(allyId);
}

// Estadísticas de combate del aliado, derivadas de su nivel — v1 no tiene
// equipo ni piedras de alma propias todavía, solo la curva base por rol.
const ALLY_EQUIP_SLOTS = ['arma','arma2','armadura','amuleto','casco','botas','guantes'];
// Piedras de alma de aliado — pedido explícito 2026-09-24: hasta
// ALLY_SOUL_SLOTS_MAX cada uno (fijo, no escala con nivel como el del
// jugador), SIN restricción de familia por rol ("no pongas limitante, cada
// persona es libre de seguir la senda de su aliado"). Se persisten en
// character_allies.soul_slots (ver migración 0009_ally_soul_slots.sql — hay
// que correrla en Supabase antes de que esto funcione en producción).
const ALLY_SOUL_SLOTS_MAX = 2;
function allySocketedStones(row){ return (row.soul_slots||[]).filter(Boolean); }
// Vida máxima de un aliado a partir de su fila (nivel + equipo + piedras) -
// extraído de makeCombatAlly() para que la hoguera de descanso (que cura a
// todo el equipo sin que haya combate de por medio) calcule el mismo
// número, en vez de reimplementar la fórmula por separado y arriesgarse a
// que diverjan.
function allyMaxHP(row){
  const tpl = ALLY_ROSTER.find(t=>t.templateId===row.template_id);
  const lvl = row.level || 1;
  // Mismo criterio nuevo que el jugador (HP_BASE/HP_PER_LEVEL, ver
  // derived()): el aliado sube de vida por NIVEL y por su rol, con un
  // plus si es de frontline (encaja golpes por el resto del equipo).
  const hpPerLevel = HP_PER_LEVEL[ALLY_ROLE_TO_WEAPON_STYLE[tpl.role]] || 35;
  let maxHP = Math.round(HP_BASE + lvl*hpPerLevel + (tpl.frontline ? lvl*8 : 0));
  const equip = row.equip || {};
  ALLY_EQUIP_SLOTS.forEach(slot=>{
    const it = equip[slot];
    if(it && it.bonus && it.bonus.stat==='maxhp') maxHP += it.bonus.value*8;
  });
  maxHP += equipModsSum(equip, 'maxhp_flat'); // Casco (nuevo): HP real, sin el ×8 de arriba
  maxHP += equipModsSum(equip, 'vig') * 3; // Vigor de piezas de conjunto: mismo +3 HP/punto que el jugador
  allySocketedStones(row).forEach(s=>{ if(s.bonus && s.bonus.stat==='maxhp') maxHP += s.bonus.value*8; }); // Vitalidad
  return maxHP;
}
// MP y Espíritu de un aliado: mismo pool de nivel para los dos, más lo que
// sume el Amuleto/Accesorio (mp_flat/espiritu_flat, ver SET_CATALOG) y una
// piedra de Sabiduría engarzada (su bonus.stat==='maxsta' se reusa acá como
// MP, ya que el aliado no tiene un pool de "estamina" separado del MP).
function allyMaxMP(row){
  const fromStones = allySocketedStones(row).filter(s=>s.bonus&&s.bonus.stat==='maxsta').reduce((sum,s)=>sum+s.bonus.value,0);
  return Math.round(30 + (row.level||1)*5) + equipModsSum(row.equip||{}, 'mp_flat') + fromStones;
}
function allyMaxSpirit(row){ return Math.round(30 + (row.level||1)*5) + equipModsSum(row.equip||{}, 'espiritu_flat'); }
// Costo de habilidad de aliado: guerrero/arquero/asesino/mago gastan MP
// (estamina), sacerdote gasta espíritu — igual que el jugador (el Mago pasó
// a MP el 2026-10-02, junto con su cambio a Habilidad). Sin recurso
// suficiente, el aliado hace un ataque básico en vez de su habilidad ese
// turno (no se resetea el enfriamiento, así que lo intenta de nuevo apenas
// se regenere).
const ALLY_SKILL_COST = 20;
const ALLY_SKILL_POOL = {guerrero:'mp', arquero:'mp', asesino:'mp', mago:'mp', sacerdote:'spirit'};
function makeCombatAlly(row){
  const tpl = ALLY_ROSTER.find(t=>t.templateId===row.template_id);
  const lvl = row.level || 1;
  const maxHP = allyMaxHP(row);
  let atk = Math.round(6 + lvl*1.7);
  const res = {fisico:0, fuego:0, hielo:0, veneno:0, aturdimiento:0};
  const equip = row.equip || {};
  const applyStatBonus = (it)=>{
    if(!it || !it.bonus) return;
    if(it.bonus.stat==='maxhp' || it.bonus.stat==='maxsta') return; // ya sumados en allyMaxHP()/allyMaxMP()
    else if(it.bonus.stat) atk += it.bonus.value; // fis/esp/hab: bono plano al ataque, más simple que el modelo de stats del jugador
    else if(it.bonus.res) res[it.bonus.res] = (res[it.bonus.res]||0) + it.bonus.value;
  };
  ALLY_EQUIP_SLOTS.forEach(slot=> applyStatBonus(equip[slot]));
  allySocketedStones(row).forEach(applyStatBonus);
  // Piezas de conjunto: sus stats de daño (fis/hab/esp) suman al ataque igual
  // que bonus.stat, y su RF a la resistencia física.
  atk += equipModsSum(equip,'fis') + equipModsSum(equip,'hab') + equipModsSum(equip,'esp');
  res.fisico = (res.fisico||0) + equipModsSum(equip,'res_fisica');
  // Si este aliado ya peleó en el nivel actual, arranca donde quedó (herido o
  // derribado) en vez de con la vida completa - ver syncAllyHPToDungeon().
  let hp = maxHP;
  const savedHP = state.dungeon && state.dungeon.allyHP ? state.dungeon.allyHP[row.id] : undefined;
  if(savedHP !== undefined) hp = Math.max(0, Math.min(maxHP, savedHP));
  const maxMP = allyMaxMP(row);
  const maxSpirit = allyMaxSpirit(row);
  let mp = maxMP, spirit = maxSpirit;
  const savedMP = state.dungeon && state.dungeon.allyMP ? state.dungeon.allyMP[row.id] : undefined;
  if(savedMP !== undefined) mp = Math.max(0, Math.min(maxMP, savedMP));
  const savedSpirit = state.dungeon && state.dungeon.allySpirit ? state.dungeon.allySpirit[row.id] : undefined;
  if(savedSpirit !== undefined) spirit = Math.max(0, Math.min(maxSpirit, savedSpirit));
  // Specials del arma/arma2 equipadas + piedras de alma engarzadas — mismo
  // formato que el jugador (ver specialsFromEquip/itemSpecialsArr), leídos
  // una sola vez acá para no recalcularlos cada turno de combate.
  const specials = specialsFromEquip(equip).concat(allySocketedStones(row).flatMap(s=>itemSpecialsArr(s)));
  // Fortaleza mental / Resistencia a efectos de estado del Amuleto/Botas —
  // ver applyStatus(), que las lee de acá cuando el objetivo es un aliado.
  const mentalResist = clamp(equipModsSum(equip,'fortaleza_mental')/100, 0, FORTALEZA_MENTAL_CAP);
  const statusResist = clamp(equipModsSum(equip,'resistencia_estado')/100, 0, 0.9);
  return {
    id: row.id, templateId: row.template_id, name: row.name, icon: tpl.icon, role: tpl.role,
    frontline: tpl.frontline, level: lvl,
    // pos es dinámico (a diferencia de frontline, que es fijo por rol): un
    // aliado en peligro puede replegarse a la Retaguardia en pleno combate
    // (ver allyMaybeSelfPreserve) y ya no ser el objetivo prioritario.
    pos: tpl.frontline ? 'frente' : 'retaguardia',
    maxHP, hp, maxMP, mp, maxSpirit, spirit, atk, statuses:[], shield:0, skillCooldown: 1, // 1: no usan su habilidad en el primer turno
    res, specials, mentalResist, statusResist
  };
}
const ALLY_SKILL_COOLDOWN = 3; // cada cuántos turnos propios repite su habilidad

// Resistencia efectiva de un objetivo contra un elemento dado, tomando en
// cuenta la Bendición Sagrada de Delyth (baja TODAS sus resistencias
// mientras dura) — centralizado aquí para que tanto el jugador como los
// aliados se beneficien de la misma forma al golpear a un enemigo bendecido.
function effectiveEnemyRes(enemy, resKey){
  const base = (enemy.res && enemy.res[resKey]) || 0;
  const blessed = hasStatus(enemy.statuses, 'Bendecido');
  // Ruina (Vara de la Ruina del Hechicero, 2026-10-02): resta puntos planos a
  // todas las resistencias mientras dura — se suma a la Bendición Sagrada.
  const ruina = hasStatus(enemy.statuses, 'Ruina');
  // Maleficio A/S/SS (piedra del jugador): cada estado negativo distinto del
  // enemigo le resta puntos a todas sus resistencias (máx. 3 estados).
  let maleficio = 0;
  if(state && state.char && enemy.tpl){
    const mal = stoneSpecials('maleficio_res').sort((a,b)=>b.perStatus-a.perStatus)[0];
    if(mal) maleficio = mal.perStatus * Math.min(3, negativeStatusCount(enemy));
  }
  return base - (blessed ? 20 : 0) - (ruina ? (ruina.resPenalty||0) : 0) - maleficio;
}
// Mermado (armas de Paladín/Hechicero/Sacerdote, 2026-10-02): el enemigo pega
// un X% más flojo. Es un estado aparte de Debilitado (fijo -15%) para que no
// se pisen entre sí; si se reaplica, se queda con la reducción y la duración
// más altas de las dos (applyStatus solo refrescaría la duración y podría
// dejar pegada una reducción menor).
function applyMermado(target, reduction, duration){
  if(!target || !Array.isArray(target.statuses) || !(reduction>0)) return;
  const st = hasStatus(target.statuses, 'Mermado');
  if(st){ st.dmgReduction = Math.max(st.dmgReduction||0, reduction); st.duration = Math.max(st.duration||0, duration); }
  else target.statuses.push({name:'Mermado', duration, dmgReduction:reduction});
}
function enemyMermadoMult(enemy){
  const st = hasStatus(enemy.statuses||[], 'Mermado');
  return st ? (1 - (st.dmgReduction||0)) : 1;
}
// "Enemigo debilitado" en los textos de las armas = tiene Debilitado o Mermado.
function isEnemyWeakened(target){
  return !!(target && (hasStatus(target.statuses||[],'Debilitado') || hasStatus(target.statuses||[],'Mermado')));
}
// Cuántos estados NEGATIVOS distintos carga un objetivo (Vara de la Ruina,
// Orbe de las Almas...). Solo cuentan los que STATUS_INFO marca como
// debuff — los autobuffs propios de los enemigos (Caparazón, Seda
// Protectora...) no están en esa tabla y no cuentan.
function negativeStatusCount(target){
  const names = new Set();
  ((target && target.statuses) || []).forEach(st=>{
    const info = STATUS_INFO[st.name];
    if(info && !info.buff) names.add(st.name);
  });
  return names.size;
}
function gainPlayerMP(amount, sourceName){
  if(!(amount>0)) return;
  const d = derived();
  const before = state.char.curSta;
  state.char.curSta = Math.min(d.maxSta, state.char.curSta + amount);
  if(state.char.curSta>before) log(`<b>${sourceName}</b> te devuelve ${state.char.curSta-before} de MP.`);
}
function gainPlayerSpirit(amount, sourceName){
  if(!(amount>0)) return;
  const d = derived();
  const before = state.char.curSpi;
  state.char.curSpi = Math.min(d.maxSpi, state.char.curSpi + amount);
  if(state.char.curSpi>before) log(`<b>${sourceName}</b> te devuelve ${state.char.curSpi-before} de Espíritu.`);
}
// Nombre del objeto equipado que trae un special dado (solo para el log).
function equipNameWithSpecial(type){
  const it = EQUIP_SLOTS.map(slot=>state.char.equip[slot]).find(it=> it && itemSpecialsArr(it).some(sp=>sp.type===type));
  return it ? it.name : 'Tu equipo';
}
// Reducción de daño recibido por ESTADOS propios del jugador, aparte de
// Furioso (que ya se lee por separado). Bug corregido 2026-10-02: Muro de Fe
// (Paladín) aplica 'Fe Inquebrantable' con incomingDmgReduction, pero solo se
// leía Furioso — Muro de Fe no reducía absolutamente nada. Acá también se
// consume la guardia del Escudo de la Vigilia Tier S (ver enemyAct).
function playerStatusIncomingMult(){
  let m = 1;
  (combat.playerStatuses||[]).forEach(st=>{ if(st.name!=='Furioso' && st.incomingDmgReduction) m *= (1 - st.incomingDmgReduction); });
  m *= statusStackTakenMult(combat.playerStatuses);
  m *= setProtectorMult((combat.playerShield||0)>0, specialsFromEquip(state.char.equip));
  stoneSpecials('reduccion_dano').forEach(sp=>{ m *= (1 - sp.value); }); // Baluarte
  if(combat.vigiliaGuardPending){
    m *= (1 - combat.vigiliaGuardPending);
    combat.vigiliaGuardPending = 0;
    log('Tu guardia de Vigilia amortigua el golpe.');
  }
  return m;
}
// Vara de la Salvaguarda Tier S (aliado Sacerdote): al romperse un escudo de
// alguien de tu grupo (tú o un aliado), probabilidad de reponer uno nuevo.
function tryRenewShield(isPlayer, ally){
  if(!combat || combat.over) return;
  const src = livingAllies().find(a=>a.role==='sacerdote' && (a.specials||[]).some(sp=>sp.type==='escudo_renovado'));
  if(!src) return;
  const sp = src.specials.find(sp=>sp.type==='escudo_renovado');
  if(!chance(sp.chance)) return;
  const maxHP = isPlayer ? derived().maxHP : ally.maxHP;
  const amt = Math.max(1, Math.round(maxHP*sp.pct));
  grantShield(isPlayer, ally, amt);
  log(`<b>${src.name}</b> repone el escudo de ${isPlayer ? 'ti' : ally.name}: absorbe ${amt} de daño.`);
}
// Specials de las piedras engarzadas del JUGADOR de un tipo dado.
function stoneSpecials(type){
  return socketedStones().flatMap(s=>itemSpecialsArr(s)).filter(sp=>sp.type===type);
}
// Vitalidad A/S/SS: al recibir daño, probabilidad de curar 10% (máx. 1 vez
// por turno del jugador).
function checkVitalidadHeal(){
  if(!combat || combat.over || state.char.curHP<=0) return;
  const sp = stoneSpecials('autocuracion').sort((a,b)=>b.chance-a.chance)[0];
  if(!sp || combat.vitalidadTurn===combat.turnCount || !chance(sp.chance)) return;
  combat.vitalidadTurn = combat.turnCount;
  const d = derived();
  const before = state.char.curHP;
  state.char.curHP = Math.min(d.maxHP, state.char.curHP + Math.round(d.maxHP*sp.pct));
  if(state.char.curHP>before) log(`<b>Piedra de Vitalidad</b>: recuperas ${state.char.curHP-before} de vida.`);
}
// Baluarte A/S/SS: al recibir un golpe crítico, escudo (1 vez por combate).
function checkBaluarteOnCrit(){
  if(!combat || combat.over || combat.tierSFired.has('baluarte_escudo')) return;
  const sp = stoneSpecials('baluarte_escudo').sort((a,b)=>b.shieldPct-a.shieldPct)[0];
  if(!sp) return;
  combat.tierSFired.add('baluarte_escudo');
  const amt = Math.round(derived().maxHP*sp.shieldPct);
  grantShield(true, null, amt);
  log(`<b>Piedra de Baluarte</b>: el golpe crítico levanta un escudo de ${amt}.`);
}

// --- Bonos de conjunto en combate (2026-10-02) ---
function playerSetSp(type){ return specialsFromEquip(state.char.equip).find(sp=>sp.type===type); }
// Escudo que NO se acumula: si ya hay uno igual o mayor no hace nada (evita
// que Gracia 3 piezas apile un escudo nuevo en cada golpe/curación).
function grantShieldUpTo(isPlayer, ally, amount){
  const cur = isPlayer ? (combat.playerShield||0) : (ally.shield||0);
  if(amount>cur) grantShield(isPlayer, ally, amount-cur);
}
// Bastión Sagrado 5 piezas: el protegido por un escudo gana Égida.
function applyEgidaSet(isPlayer, ally, reduction){
  const list = isPlayer ? combat.playerStatuses : ally.statuses;
  const dur = isPlayer ? 3 : 2; // +1 en el jugador por el descuento de su propio turno (ver buff_self)
  const ex = hasStatus(list,'Égida');
  if(ex){ ex.duration = Math.max(ex.duration, dur); ex.incomingDmgReduction = Math.max(ex.incomingDmgReduction||0, reduction); }
  else list.push({name:'Égida', duration:dur, incomingDmgReduction:reduction});
}
// Bastión Sagrado 3 piezas: quien tiene escudo recibe menos daño, si el
// portador del conjunto es él mismo o un Sacerdote aliado vivo.
function setProtectorMult(hasShield, ownSpecials){
  if(!hasShield) return 1;
  let sp = (ownSpecials||[]).find(x=>x.type==='set_protector');
  if(!sp){
    const priest = livingAllies().find(a=>a.role==='sacerdote' && (a.specials||[]).some(x=>x.type==='set_protector'));
    if(priest) sp = priest.specials.find(x=>x.type==='set_protector');
  }
  return sp ? (1 - sp.value) : 1;
}
// Guardián Eterno 5 piezas: Último Bastión, 1 vez por combate y portador.
function checkUltimoBastion(isPlayer, ally){
  if(!combat || combat.over) return;
  const specials = isPlayer ? specialsFromEquip(state.char.equip) : (ally.specials||[]);
  const sp = specials.find(x=>x.type==='set_ultimo_bastion');
  if(!sp) return;
  const key = 'ultimo_bastion:' + (isPlayer ? 'player' : ally.id);
  if(combat.tierSFired.has(key)) return;
  const hp = isPlayer ? state.char.curHP : ally.hp;
  const maxHP = isPlayer ? derived().maxHP : ally.maxHP;
  if(hp<=0 || hp/maxHP >= 0.3) return;
  combat.tierSFired.add(key);
  grantShield(isPlayer, ally, Math.round(maxHP*sp.shieldPct));
  const list = isPlayer ? combat.playerStatuses : ally.statuses;
  const ex = hasStatus(list,'Último Bastión');
  const turns = (sp.turns||2) + (isPlayer ? 1 : 0); // +1 en el jugador por el descuento de su propio turno
  if(ex) ex.duration = turns; else list.push({name:'Último Bastión', duration:turns, incomingDmgReduction:sp.reduction});
  log(`<b>Último Bastión</b>: ${isPlayer ? 'te alzas' : ally.name+' se alza'} tras una barrera de ${Math.round(maxHP*sp.shieldPct)} y -${Math.round(sp.reduction*100)}% de daño recibido.`);
}
// Gracia Celestial 3 y 5 piezas, comunes a jugador y Sacerdote aliado.
// healer: null = jugador. Devuelve el multiplicador para ESTA curación.
function graciaHealMult(healerSpecials, holder){
  const sp = (healerSpecials||[]).find(x=>x.type==='set_milagro');
  if(!sp || !holder.milagroNext) return 1;
  holder.milagroNext = false;
  return 1 + sp.bonus;
}
function graciaAfterHeal(healerSpecials, holder, healerName, gainSpirit, shieldTarget){
  const g3 = (healerSpecials||[]).find(x=>x.type==='set_gracia_escudo');
  if(g3) grantShieldUpTo(shieldTarget.isPlayer, shieldTarget.ally, Math.round(shieldTarget.maxHP*g3.pct));
  const g5 = (healerSpecials||[]).find(x=>x.type==='set_milagro');
  if(g5){
    holder.milagroCount = (holder.milagroCount||0) + 1;
    if(holder.milagroCount >= g5.every){
      holder.milagroCount = 0;
      holder.milagroNext = true;
      gainSpirit(g5.spirit);
      log(`<b>Milagro</b>: ${healerName} recupera ${g5.spirit} de Espíritu y su próxima curación será +${Math.round(g5.bonus*100)}%.`);
    }
  }
}

// Vara de la Salvaguarda (aliado Sacerdote, 2026-10-02): multiplicador de
// potencia de todo escudo que coloque ese aliado, y Espíritu al colocarlo.
function allyShieldMult(ally){
  return 1 + (ally.specials||[]).filter(sp=>sp.type==='aumento_escudo').reduce((sum,sp)=>sum+sp.value,0);
}
function allyOnShieldPlaced(ally, isPlayerTarget, targetAlly){
  const bd = (ally.specials||[]).find(sp=>sp.type==='set_bastion_divino');
  if(bd) applyEgidaSet(!!isPlayerTarget, targetAlly, bd.reduction);
  (ally.specials||[]).filter(sp=>sp.type==='espiritu_al_escudar').forEach(sp=>{
    if(chance(sp.chance)){
      const before = ally.spirit;
      ally.spirit = Math.min(ally.maxSpirit, ally.spirit + sp.amount);
      if(ally.spirit>before) log(`<b>${ally.name}</b> recupera ${ally.spirit-before} de Espíritu al escudar.`);
    }
  });
}
// Cetro de Penitencia (aliado Sacerdote, 2026-10-02): al curar, el enemigo
// del frente puede quedar Mermado. En Tier S, curar a alguien por debajo del
// 35% de vida lo garantiza, con enfriamiento propio en turnos del aliado.
function allyOnHealPenitencia(ally, healedPctBefore){
  const fi = frontEnemyIndex();
  if(fi<0) return;
  const enemy = combat.enemies[fi];
  const urg = (ally.specials||[]).find(sp=>sp.type==='penitencia_urgente');
  if(urg && healedPctBefore<0.35 && !(ally.penitenciaCd>0)){
    applyMermado(enemy, urg.reduction, 2);
    ally.penitenciaCd = urg.cooldown;
    log(`<b>${ally.name}</b> clama penitencia: ${enemy.name} queda Mermado (-${Math.round(urg.reduction*100)}% de daño) durante 2 turnos.`);
    return;
  }
  const pm = (ally.specials||[]).filter(sp=>sp.type==='penitencia_merma').sort((a,b)=>b.reduction-a.reduction)[0];
  if(pm && chance(pm.chance)){
    applyMermado(enemy, pm.reduction, 2);
    log(`<b>${ally.name}</b> impone penitencia: ${enemy.name} queda Mermado (-${Math.round(pm.reduction*100)}% de daño) durante 2 turnos.`);
  }
}

// Corrosión (ataque en área de Custodio de la Isla): baja la resistencia
// física de quien la carga y reduce a la mitad la curación que reciba,
// durante 2 turnos. corrosionResPenalty() es la contraparte "defensiva" de
// effectiveEnemyRes() de arriba — ahí bajamos la resistencia del enemigo
// cuando lo golpeamos, aquí bajamos la del jugador/aliado cuando lo golpean.
const CORROSION_RES_PENALTY = 15;
const CORROSION_HEAL_MULT = 0.5;
function corrosionResPenalty(statuses){ return hasStatus(statuses, 'Corrosion') ? CORROSION_RES_PENALTY : 0; }
// Bonificación de Frente (2026-09-25, pedido explícito): quien ocupa el
// puesto de tanque —el jugador con playerPos==='frente', o un aliado
// frontline con pos==='frente' (hoy solo Aldric)— recibe un -10% de daño
// plano adicional, siempre, se suma multiplicativamente con cualquier otra
// reducción (Armadura/Maza/Furioso/Bendición/Tier S, etc.) — no la
// reemplaza. No aplica a Retaguardia.
const FRONTLINE_DAMAGE_REDUCTION = 0.10;
// Crítico de enemigo (pedido explícito 2026-09-28) — antes NINGÚN enemigo
// criteaba. Multiplicador conservador a propósito (el jugador usa 1.5x+
// bono): mejor que arranque sobrio y lo subamos si en la práctica se siente
// flojo, a que se sienta injusto recibir golpes variables sin ningún stat
// del jugador que lo contrarreste todavía.
const ENEMY_CRIT_MULT = 1.3;
function healMultiplierFor(statuses){
  const c = hasStatus(statuses, 'Corrosion');
  return c ? c.healMult : 1;
}

function hasStatus(list, name){ return list.find(s=>s.name===name); }
function removeStatus(list, name){
  const idx = list.findIndex(s=>s.name===name);
  if(idx>=0) list.splice(idx,1);
}

// Índices de los enemigos vivos que de verdad ocupan el frente (tpl.frontline)
// — antes frontEnemyIndex() ignoraba esto por completo y devolvía "el
// primero vivo del array", que en la práctica coincidía casi siempre porque
// el grupo se ordena con los frontline primero (ver enterNode) — pero si el
// único frontline vivo no era el índice 0 (por ejemplo, murió el primero),
// esto lo encontraba igual. Ahora también sirve para saber si hay más de
// uno vivo al mismo tiempo, y así ofrecerle al jugador elegir cuál atacar.
function livingFrontlineEnemyIndices(){
  const idxs = [];
  combat.enemies.forEach((e,i)=>{ if(e.hp>0 && e.tpl && e.tpl.frontline) idxs.push(i); });
  return idxs;
}
// Señuelos vivos (Clon de Sombra, Réplica, Duplicado): cubren el frente.
function livingDecoyIndices(){
  const idxs = [];
  combat.enemies.forEach((e,i)=>{ if(e.hp>0 && e.tpl && e.tpl.decoy) idxs.push(i); });
  return idxs;
}
// Un ataque a distancia contra un enemigo con señuelos vivos tiene 50% de
// ser interceptado por uno de ellos (mitigación pedida 2026-10-02).
function decoyIntercept(t){
  if(!t || !t.tpl || t.tpl.decoy || !combat.enemies.includes(t)) return t;
  const decoys = livingDecoyIndices();
  if(!decoys.length || !chance(0.5)) return t;
  const d = combat.enemies[decoys[Math.floor(Math.random()*decoys.length)]];
  log(`¡<b>${d.name}</b> se interpone y recibe el golpe dirigido a ${t.name}!`);
  return d;
}
function frontEnemyIndex(){
  const decoyIdxs = livingDecoyIndices();
  if(decoyIdxs.length) return decoyIdxs[0];
  const frontIdxs = livingFrontlineEnemyIndices();
  if(frontIdxs.length) return frontIdxs[0];
  for(let i=0;i<combat.enemies.length;i++) if(combat.enemies[i].hp>0) return i;
  return -1;
}
// Objetivos que el JUGADOR puede elegir con una habilidad targetMode:'front'
// (pedido explícito 2026-09-25): mientras quede al menos un enemigo de línea
// frontal vivo, la retaguardia sigue bloqueada y solo se puede elegir entre
// los del frente (igual que antes). En cuanto se derrota a toda la línea
// frontal, se desbloquea la elección entre lo que quede vivo — que en ese
// punto es pura retaguardia — en vez de auto-elegir sin dejar escoger.
function playerFrontTargetIndices(){
  // Mientras haya señuelos vivos, son lo único alcanzable cuerpo a cuerpo.
  const decoys = livingDecoyIndices();
  if(decoys.length) return decoys;
  const front = livingFrontlineEnemyIndices();
  if(front.length) return front;
  const idxs = [];
  combat.enemies.forEach((e,i)=>{ if(e.hp>0) idxs.push(i); });
  return idxs;
}
// El Arquero y el Mago atacan a distancia: su ataque básico (única habilidad
// compartida con targetMode:'front') no debe respetar el bloqueo de línea
// frontal — tienen el mismo alcance total que sus habilidades propias
// (disparo_certero/bola_fuego, ya targetMode:'any') sin importar si la línea
// frontal enemiga sigue viva. Pedido explícito 2026-09-25.
function isRangedStyle(){
  return state.char.style==='tirador' || state.char.style==='mago' || state.char.style==='hechicero';
}
function resolvedTargetMode(skill){
  if(skill.targetMode==='front' && isRangedStyle()) return 'any';
  return skill.targetMode;
}
// IA de objetivo por aliado (2026-09-25, pedido explícito): un aliado de
// Frente (frontline:true, hoy solo Aldric) sigue peleando cuerpo a cuerpo —
// solo puede alcanzar al enemigo del frente, igual que antes. Un aliado de
// Retaguardia (arquero/asesino/mago) puede alcanzar a CUALQUIER enemigo
// vivo, así que en vez de limitarse al frente por comodidad, apunta al que
// tenga menos vida restante (rematar) — así remata objetivos casi muertos
// en vez de repartir daño parejo entre todos.
function allyTargetEnemyIndex(ally){
  if(ally.frontline) return frontEnemyIndex();
  const living = livingEnemies();
  if(!living.length) return -1;
  const weakest = living.reduce((a,b)=> b.hp<a.hp ? b : a);
  return combat.enemies.indexOf(weakest);
}
function livingEnemies(){ return combat.enemies.filter(e=>e.hp>0); }

function computeCritEvasion(){
  const d = derived();
  let ev = d.evasionBase;
  // Brecha de nivel: un monstruo de más nivel que el jugador también es más
  // difícil de esquivar (mismo número que usa el jugador para esquivarlo A
  // ÉL, restado en vez de sumado — ver levelGapEvasionBonus).
  ev -= levelGapEvasionBonus(monsterEffectiveLevel(), state.char.level);
  const furioso = hasStatus(combat.playerStatuses,'Furioso');
  if(furioso) ev += furioso.evasionDelta/100;
  (combat.playerStatuses||[]).forEach(st=>{ if(st.name!=='Furioso' && st.evasionDelta) ev += st.evasionDelta/100; });
  if(combat.playerDefending) ev = Math.max(ev, 0.5);
  // Ralentizado: -20% de evasión plana mientras dure (corregido 2026-09-26:
  // el texto y el tooltip siempre dijeron -20%, el código aplicaba -15%).
  if(hasStatus(combat.playerStatuses,'Ralentizado')) ev -= 0.20;
  if(hasStatus(combat.playerStatuses,'Paralisis')) ev = 0; // indefenso: la Parálisis anula toda evasión, incluso defendiendo
  return {crit:d.critChance, evasion:clamp(ev,0.02,0.6)};
}

// Bono de evasión por estado en un ENEMIGO (2026-09-25, décadas 21+: varias
// habilidades tipo "Paso Sombrío"/"Tras Picado" suben la evasión propia unos
// turnos) — antes evasionDelta solo se leía del lado del jugador (Furioso);
// los enemigos tenían la evasión fija de makeEnemy() sin forma de variar.
function enemyStatusEvasionBonus(statuses){
  let bonus = 0;
  (statuses||[]).forEach(st=>{ if(st.evasionDelta) bonus += st.evasionDelta/100; });
  return bonus;
}
// v1: los aliados no tienen Habilidad ni equipo propio todavía, solo una
// base plana — la Parálisis igual los anula por completo, como al jugador.
function computeAllyEvasion(ally){
  if(hasStatus(ally.statuses,'Paralisis')) return 0;
  const evasionFlat = (ally.specials||[]).filter(sp=>sp.type==='evasion_flat').reduce((sum,sp)=>sum+sp.value,0);
  let ev = 0.06 + evasionFlat - levelGapEvasionBonus(monsterEffectiveLevel(), state.char.level);
  if(hasStatus(ally.statuses,'Ralentizado')) ev -= 0.20;
  return clamp(ev, 0.02, 0.6);
}

// probabilidad combinada de aturdir al golpear, sumando todas las fuentes
// equipadas (arma(s) + piedras de alma engarzadas) que tengan ese proc.
function totalStunChance(){
  const chances = ['arma','arma2'].map(slot=>state.char.equip[slot])
    .filter(it=>it && it.special && it.special.type==='aturdir')
    .map(it=>it.special.chance)
    .concat(socketedStones().filter(s=>s.special && s.special.type==='aturdir').map(s=>s.special.chance))
    .concat(specialsFromPets().filter(sp=>sp.type==='aturdir').map(sp=>sp.chance));
  if(!chances.length) return 0;
  let noStun = 1;
  chances.forEach(c=> noStun *= (1-c));
  return 1-noStun;
}
// Resumen "absolutamente todo" de estadísticas de combate (2026-09-25,
// pedido explícito) — junta specialsFromEquip (arma+equipo+piedras+
// mascotas, ya con las mascotas inyectadas ahí mismo) en un solo objeto
// plano de totales, para que la Hoja de personaje pueda mostrar cada bono
// real que el jugador ya tiene activo, no solo crítico/evasión/aturdir.
// Cada campo es 0 si nadie lo aporta — renderSheet() solo pinta los que
// sean >0 para no llenar la pantalla de chips en cero.
function combatStatsSummary(){
  const specials = specialsFromEquip(state.char.equip);
  const sumBy = (type, field)=> specials.filter(sp=>sp.type===type).reduce((s,sp)=>s+(sp[field]||0), 0);
  return {
    aumentoDano: sumBy('aumento_dano','value'),
    criticoDano: derived().critDmgBonus,
    reduccionDano: sumBy('reduccion_dano','value'),
    bloqueo: blockChance(specials),
    retroceso: sumBy('retroceso','chance'),
    robovida: sumBy('robovida','percent'),
    succionHechizo: sumBy('succion_hechizo','percent'),
    penetracionFisica: sumBy('penetracion_armadura','value'),
    penetracionMagica: sumBy('penetracion_magica','value'),
    segundoAtaque: Math.min(SEGUNDO_ATAQUE_CAP, sumBy('segundo_ataque_basico','chance')),
    dobleEncantamiento: sumBy('doble_encantamiento','chance'),
    razaBonuses: specials.filter(sp=>sp.type==='aumento_dano_raza'),
    posicionBonuses: specials.filter(sp=>sp.type==='aumento_dano_posicion')
  };
}
const RAZA_TAG_LABEL = {goblin:'Goblins', arana:'Arañas', bestia:'Bestias', humano:'Humanos', criatura_marina:'Criaturas Marinas'};
const POSICION_TAG_LABEL = {frontline:'línea frontal', retaguardia:'retaguardia'};

// Miedo/Confusión son "alteraciones mentales" (pedido explícito) — las
// resiste Fortaleza mental (Accesorio). El resto de efectos con chance
// propia (Ceguera, Parálisis) los resiste Resistencia a efectos de estado
// (Botas). Solo reduce estados que ya pasan por el chance propio de
// applyStatus — los que un weapon-special pre-rolla antes de llamar acá
// (Sangrado, Silencio, Aturdido retardado, etc.) no pasan por este filtro.
const MENTAL_STATUSES = new Set(['Miedo','Confusion']);
// Busca un special marcado con tierSProc==id (ver TIER_S_PASSIVE_EFFECTS) en
// un array de specials ya aplanado (equipo del jugador o ally.specials).
function hasTierSProc(specialsArr, id){ return (specialsArr||[]).some(sp=>sp.tierSProc===id); }
// Dispara el buff/debuff de una pasiva "de firma" de Tier S — pedido
// explícito 2026-09-24: todas estas pasivas valen 1 vez por combate y
// otorgan su efecto por 4 turnos (statusDef.duration se fuerza siempre a 4
// acá, no hace falta pasarlo). isPlayer=true aplica sobre el propio
// jugador (target se ignora); si no, aplica sobre `target` (un enemigo o
// un aliado). Devuelve false sin hacer nada si ese proc ya se usó este
// combate — así cada llamada solo necesita comprobar el resultado.
// Sombra Cazadora A/S/SS (2026-09-25, pedido explícito): invoca una sombra
// que se planta al Frente y se lleva el agro de inmediato. Reglas acordadas:
// - Respeta el tope de 6 combatientes por bando propio (jugador + hasta 4
//   aliados + esta sombra).
// - Máximo una sombra viva a la vez (si ya hay una, no se re-tira el dado).
// - Se activa como mucho 1 vez por combate (recomendación propia frente a
//   un cooldown en turnos: la probabilidad ya es baja de por sí —1/5/10%—
//   y "1 vez por combate" es más simple de leer que contar 10 turnos).
// Se llama al empezar cada turno propio del jugador (ver playerUseSkill).
function trySummonShadow(){
  if(!combat || combat.over) return;
  const stone = socketedStones().find(s=> itemSpecialsArr(s).some(sp=>sp.type==='sombra_summon'));
  if(!stone) return;
  if(combat.tierSFired.has('sombra_summon')) return;
  if((combat.allies||[]).some(a=>a.isShadow && a.hp>0)) return;
  if(1 + (combat.allies||[]).length >= 6) return;
  const sp = itemSpecialsArr(stone).find(s=>s.type==='sombra_summon');
  if(!chance(sp.chance)) return;
  combat.tierSFired.add('sombra_summon');
  const d = derived();
  const shadowMaxHP = Math.max(1, Math.round(d.maxHP*0.5));
  const shadow = {
    id:'shadow_'+Date.now(), templateId:'sombra_cazadora', name:'Sombra Cazadora', icon:'🌑', role:'sombra',
    frontline:true, pos:'frente', level: state.char.level,
    maxHP: shadowMaxHP, hp: shadowMaxHP, maxMP:0, mp:0, maxSpirit:0, spirit:0, atk:0,
    statuses:[], shield:0, skillCooldown:999, specials:[], isShadow:true,
    res:{fisico:10, fuego:10, hielo:10, veneno:10, aturdimiento:10},
  };
  combat.allies = combat.allies||[];
  combat.allies.unshift(shadow); // primero en la lista = prioridad de "tanque" en frontlineTarget()
  log(`<b>${stone.name}</b> invoca una <b>Sombra Cazadora</b>: se planta al Frente y atrae toda la atención enemiga.`);
}
function fireTierSBuff(procId, isPlayer, target, statusDef){
  if(!combat || combat.tierSFired.has(procId)) return false;
  combat.tierSFired.add(procId);
  applyStatus(isPlayer ? null : target, Object.assign({}, statusDef, {duration:4}), isPlayer);
  return true;
}
// Devuelve true si el estado quedó aplicado (o refrescado), false si se
// resistió — las armas del Hechicero reaccionan a "aplicar un estado".
function applyStatus(target, statusDef, isPlayer){
  if(!statusDef) return false;
  if(statusDef.chance!==undefined){
    let effChance = statusDef.chance;
    const isMental = MENTAL_STATUSES.has(statusDef.name);
    // Quién sería el "portador" que resiste esta alteración, si es que la
    // recibe él mismo (jugador o un aliado) — un enemigo objetivo de una
    // habilidad del jugador (Marcado, Quemadura, etc.) no cuenta.
    const isAllyTarget = !isPlayer && target && !target.tpl && Array.isArray(target.statuses);
    const wearerSpecials = isPlayer ? specialsFromEquip(state.char.equip) : (isAllyTarget ? (target.specials||[]) : null);
    if(isPlayer){
      const d = derived();
      effChance *= isMental ? (1-d.fortalezaMental) : (1-d.resistenciaEstado);
      // Voluntad Inquebrantable 3 y 5 piezas (2026-10-02).
      if(isMental && combat){
        const volSt = hasStatus(combat.playerStatuses,'Voluntad');
        if(volSt) effChance *= (1-(volSt.value||0));
        const inq = specialsFromEquip(state.char.equip).find(sp=>sp.type==='set_inquebrantable');
        if(inq && chance(inq.chance)){
          state.char.curHP = Math.min(d.maxHP, state.char.curHP + Math.round(d.maxHP*inq.pct));
          state.char.curSta = Math.min(d.maxSta, state.char.curSta + Math.round(d.maxSta*inq.pct));
          log(`<b>Inquebrantable</b>: resistes ${statusDef.name==='Confusion'?'la Confusión':'el Miedo'} y recuperas algo de vida y MP.`);
          return false;
        }
      }
    } else if(target && target.tpl && (target.mentalResist || target.statusResist)){
      effChance *= isMental ? (1-(target.mentalResist||0)) : (1-(target.statusResist||0));
    }
    // Amuleto Tier S ('amuleto_s'): +10% de resistencia adicional a
    // cualquier alteración de estado negativa, mental o física.
    if(wearerSpecials && hasTierSProc(wearerSpecials,'amuleto_s')) effChance *= 0.9;
    // Botas Tier S ('botas_s'): la primera alteración de estado negativa que
    // reciba el portador en todo el combate tiene 50% de resistirse por
    // completo — una vez por combate y por portador (ver combat.tierSFired).
    if(wearerSpecials && hasTierSProc(wearerSpecials,'botas_s') && combat){
      const fireKey = 'botas_s:' + (isPlayer ? 'player' : target.id);
      if(!combat.tierSFired.has(fireKey)){
        combat.tierSFired.add(fireKey);
        if(chance(0.5)) return false;
      }
    }
    if(target && target.tpl && target.tpl.firstMentalResist && isMental && !target.firstMentalUsed){
      target.firstMentalUsed = true;
      if(chance(0.5)){ log(`${target.name} refleja la alteración mental: no le afecta.`); return false; }
    }
    if(!chance(effChance)) return false;
  }
  const list = isPlayer ? combat.playerStatuses : target.statuses;
  if(isPlayer && MENTAL_STATUSES.has(statusDef.name) && combat){
    const vol = specialsFromEquip(state.char.equip).find(sp=>sp.type==='set_voluntad');
    if(vol){
      const ex = hasStatus(list,'Voluntad');
      if(ex) ex.duration = 4; else list.push({name:'Voluntad', duration:4, value:vol.value});
    }
  }
  const existing = list.find(s=>s.name===statusDef.name);
  if(existing && statusDef.stack){
    existing.stacks = Math.min(statusDef.maxStack||3, (existing.stacks||1)+1);
    existing.duration = statusDef.duration;
  } else if(existing){
    existing.duration = statusDef.duration;
  } else {
    // Object.assign conserva campos extra del statusDef (ej. procChance de
    // Ceguera/Miedo/Confusión) — antes se perdían porque solo se guardaban
    // name/duration/stacks.
    list.push(Object.assign({}, statusDef, {stacks: statusDef.stack?1:undefined}));
  }
  return true;
}

// Descripción breve de cada estado (para el tooltip al pasar el puntero o
// tocar la etiqueta) y si es un buff (verde) o un debuff (rojo) — casi todo
// en el juego es un debuff; Furioso y Fortalecido son los únicos buffs reales.
const STATUS_INFO = {
  Tambaleo:     {buff:false, desc:'Tambalea: el próximo Machacar hace mucho más daño y lo aturde.'},
  Aturdido:     {buff:false, desc:'Pierde su próximo turno por completo.'},
  Furioso:      {buff:true,  desc:'+30% daño físico y -20% daño recibido, a cambio de -10% evasión.'},
  Inspirado:    {buff:true,  desc:'+daño gracias al Grito de guerra de tu compañero.'},
  Sangrado:     {buff:false, desc:'Sufre daño cada turno según el Físico de quien lo causó. Se acumula hasta x3.'},
  Veneno:       {buff:false, desc:'Sufre daño de veneno cada turno según la Habilidad de quien lo causó. Se acumula hasta x3.'},
  Marcado:      {buff:false, desc:'Recibe +20% de todo el daño mientras dura.'},
  Quemadura:    {buff:false, desc:'Sufre daño de fuego por turno.'},
  Ralentizado:  {buff:false, desc:'-20% evasión y actúa después que el resto.'},
  Bendecido:    {buff:false, desc:'Sus resistencias caen -20 en todos los elementos mientras dura.'},
  'Bendición':  {buff:true,  desc:'+resistencias y -daño recibido mientras dura (Grimorio de plegarias Tier S).'},
  Fortalecido:  {buff:true,  desc:'Se fortalece con cada turno que pasa: sus estadísticas suben por carga.'},
  Corrosion:    {buff:false, desc:'-15% resistencia física y solo recibe la mitad de cualquier curación.'},
  Debilitado:   {buff:false, desc:'Su daño cae un 15%.'},
  Voluntad:     {buff:true,  desc:'+Fortaleza mental (conjunto Voluntad Inquebrantable).'},
  'Último Bastión': {buff:true, desc:'-daño recibido (conjunto Guardián Eterno).'},
  Empapado:     {buff:false, desc:'-10% de evasión mientras dura (Storm Gush).'},
  Lluvia:       {buff:true,  desc:'Storm Gush: +15% de daño y regeneración mientras dura.'},
  'Cristalización': {buff:true, desc:'El Usurpador recibe -60% de daño mientras dura.'},
  'Forma Robada': {buff:true, desc:'El Usurpador imita tu forma: +15% de daño.'},
  'Caos Desatado': {buff:true, desc:'Riakis: +20% de daño y +10% de evasión.'},
  'Sacerdote de la Tormenta': {buff:true, desc:'Inmune al daño mientras dura.'},
  Mermado:      {buff:false, desc:'Su daño cae un poco mientras dura (armas de Paladín, Hechicero o Sacerdote).'},
  Ruina:        {buff:false, desc:'Pierde puntos en todas sus resistencias mientras dura (Vara de la Ruina).'},
  Paralisis:    {buff:false, desc:'Evasión a 0: no puede esquivar nada, ni defendiéndose.'},
  Ceguera:      {buff:false, desc:'Probabilidad de que sus golpes fallen por completo.'},
  Miedo:        {buff:false, desc:'Probabilidad de perder el turno por pánico.'},
  Confusion:    {buff:false, desc:'Probabilidad de golpear al azar — puede alcanzar a un aliado o a sí mismo.'},
  Silencio:     {buff:false, desc:'Su próximo turno solo puede usar ataques básicos, sin habilidades especiales.'},
  'Bastión':    {buff:true,  desc:'-20% de daño recibido (Muralla Viviente de Brann el Bastión).'},
  'Égida':      {buff:true,  desc:'-10% de daño recibido mientras dure (Égida Sagrada de Seraphina).'},
  'Frenesí':    {buff:true,  desc:'Matriarca escarlata: +20% de daño hasta el final del combate.'},
  'Corrupción': {buff:false, desc:'Bosque muerto: por cada carga haces +3% de daño y recibes +4%. Se acumula hasta x10 y dura todo el combate.'},
  'Furia del Ogro': {buff:true, desc:'Ogro: +15% de daño hasta el final del combate.'}
};
// Muchos enemigos se ponen bonificaciones propias con nombre único (Furia de
// Colmena, Coraza de Coral, Furia de la Marea…) que no tienen ficha arriba.
// Antes salían en rojo, como si fueran un perjuicio, y con "Sin descripción":
// parecía que no hacían nada (reporte 2026-10-07: el Frenesí de la Matriarca).
// Acá se les arma la ficha a partir de lo que el estado hace de verdad, y
// queda guardada en STATUS_INFO para el resto del combate.
function statusEffectText(st){
  const parts = [], pct = v=> Math.round(Math.abs(v)*100);
  if(st.dmgMult && st.dmgMult !== 1) parts.push(`${st.dmgMult > 1 ? '+' : '-'}${pct(st.dmgMult - 1)}% de daño`);
  if(st.incomingDmgReduction > 0) parts.push(st.incomingDmgReduction >= 1 ? 'inmune al daño' : `-${pct(st.incomingDmgReduction)}% de daño recibido`);
  if(st.regenPct) parts.push(`recupera ${+(st.regenPct*100).toFixed(1)}% de su vida cada turno`);
  if(st.evasionDelta) parts.push(`${st.evasionDelta > 0 ? '+' : ''}${st.evasionDelta}% de evasión`);
  if(st.resBonus) parts.push(`${st.resBonus > 0 ? '+' : ''}${st.resBonus}% de resistencias`);
  if(st.incomingDmgReduction < 0 && !parts.some(x=> /recibido/.test(x))) parts.push(`+${pct(st.incomingDmgReduction)}% de daño recibido`);
  return parts.join(', ');
}
function statusInfoFor(st){
  if(!st) return null;
  if(STATUS_INFO[st.name]) return STATUS_INFO[st.name];
  const text = statusEffectText(st);
  if(!text) return null;
  const good = (st.dmgMult||1) > 1 || st.incomingDmgReduction > 0 || st.regenPct > 0 || st.evasionDelta > 0 || st.resBonus > 0;
  const bad = (st.dmgMult||1) < 1 || st.evasionDelta < 0 || st.resBonus < 0;
  STATUS_INFO[st.name] = {buff: good && !bad, desc: text.charAt(0).toUpperCase() + text.slice(1) + '.'};
  return STATUS_INFO[st.name];
}
// Los estados "para todo el combate" se guardan con duración 99 y van bajando
// (97, 96…): se muestran como ∞.
const STATUS_PERMANENT_TURNS = 50;
function statusChipHTML(st){
  const info = statusInfoFor(st);
  const cls = 'status-chip ' + (info && info.buff ? 'buff' : 'debuff');
  const desc = (info ? info.desc : '').replace(/"/g,'&quot;');
  const stacksTxt = st.stacks ? (' x'+st.stacks) : '';
  return `<span class="${cls}" title="${desc}" data-status-desc="${desc}">${st.name}${stacksTxt} (${st.duration >= STATUS_PERMANENT_TURNS ? '∞' : st.duration})</span>`;
}
function renderStatusChips(list){
  return (list||[]).map(statusChipHTML).join('');
}
function hideStatusTooltip(){
  const el = document.getElementById('status-tooltip');
  if(el) el.remove();
}
function showStatusTooltip(chipEl, desc){
  hideStatusTooltip();
  if(!desc) return;
  const rect = chipEl.getBoundingClientRect();
  const tip = document.createElement('div');
  tip.className = 'status-tooltip';
  tip.id = 'status-tooltip';
  tip.textContent = desc;
  document.body.appendChild(tip);
  const top = rect.bottom + window.scrollY + 4;
  let left = rect.left + window.scrollX;
  const maxLeft = window.innerWidth - tip.offsetWidth - 8;
  if(left > maxLeft) left = Math.max(8, maxLeft);
  tip.style.top = top+'px';
  tip.style.left = left+'px';
}
document.addEventListener('click', (e)=>{
  const chip = e.target.closest && e.target.closest('.status-chip');
  if(chip && chip.dataset.statusDesc){
    e.stopPropagation();
    showStatusTooltip(chip, chip.dataset.statusDesc);
  } else {
    hideStatusTooltip();
  }
});

// Junta los specials de un item, sea el nuevo formato en array (armas del
// catálogo, puede traer 2 a la vez desde rango A) o el viejo campo singular
// (piedras de alma, sin tocar — para no alterar su comportamiento ya vivo).
function itemSpecialsArr(it){ return it.specials || (it.special ? [it.special] : []); }
// Todos los specials de las armas equipadas (arma + arma2) de un personaje —
// usado tanto para el jugador (state.char.equip) como, en la versión de
// aliado, para el array ya aplanado que guarda cada ally.specials.
// Suma el valor de una clave de item.mods (estadísticas del equipo general
// que no encajan en el molde bonus.stat/bonus.res de siempre: maxhp_flat,
// precision, res_magica, resistencia_estado, fortaleza_mental, mp_flat,
// espiritu_flat — ver SET_CATALOG) a través de TODO el equipo.
function equipModsSum(equip, key){
  let total = 0;
  EQUIP_SLOTS.forEach(slot=>{
    const it = equip && equip[slot];
    if(it && it.mods && it.mods[key]!==undefined) total += it.mods[key];
  });
  return total + setBonusMod(equip, key); // bonos de conjunto con stats planos (ej. Voluntad 2 piezas)
}
// Todo el equipo (armas Y equipo general: armadura/casco/botas/guantes,
// ahora que ese equipo también trae specials — antes solo miraba arma/arma2).
function specialsFromEquip(equip){
  const out = [];
  EQUIP_SLOTS.forEach(slot=>{
    const it = equip && equip[slot];
    if(it) itemSpecialsArr(it).forEach(sp=> out.push(sp));
  });
  // Bonos de conjunto activos (2/3/5 piezas) — cuentan como specials más.
  setBonusSpecials(equip).forEach(sp=> out.push(sp));
  // Mascotas equipadas (ver PET_CATALOG/specialsFromPets): solo aplican al
  // jugador, nunca a un aliado — specialsFromEquip(equip) SIEMPRE se llama
  // con state.char.equip para el jugador (los aliados usan su propio
  // ally.specials aparte), así que esta comparación es un guardia seguro.
  if(equip === state.char.equip) specialsFromPets().forEach(sp=> out.push(sp));
  return out;
}
function blockChance(specialsArr){
  return Math.min(0.6, (specialsArr||[]).filter(sp=>sp.type==='bloqueo').reduce((sum,sp)=>sum+sp.chance,0));
}

function applyEquippedSpecials(target, dmgDealt, skill){
  const sources = [];
  EQUIP_SLOTS.forEach(slot=>{
    const it = state.char.equip[slot];
    if(it) itemSpecialsArr(it).forEach(sp=> sources.push({it, sp}));
  });
  socketedStones().forEach(s=> itemSpecialsArr(s).forEach(sp=> sources.push({it:s, sp})));
  equippedPets().forEach(p=> p.bonuses.forEach(sp=>{ if(sp.type) sources.push({it:{name:p.name}, sp}); }));
  // Regla de procs (pedido explícito 2026-10-02, tras ver a un Arquero
  // curarse entero con una sola Lluvia de flechas):
  // - Sangrado del equipo: SOLO con el ataque básico. El Asesino es la
  //   excepción: a él le aplica también con sus habilidades.
  // - Robo de vida: SOLO con el ataque básico, para todas las sendas (el
  //   Asesino incluido — pedido explícito 2026-10-02).
  // - Succión de hechizo: lo contrario, SOLO con habilidades (nunca básico).
  // Única "Succión de vida" de algunos Caídos (effect.kind 'robovida'):
  // estaba en el catálogo pero nunca tuvo código — se suma como robo de vida.
  petUniqueEffects().forEach(({name, unique})=>{
    if(unique.effect && unique.effect.kind==='robovida') sources.push({it:{name}, sp:{type:'robovida', percent:unique.effect.percent}});
    // Igual con la única "Succión de hechizo"/"Absorción Arcana" (tampoco tenía código).
    if(unique.effect && unique.effect.kind==='succion_hechizo') sources.push({it:{name}, sp:{type:'succion_hechizo', percent:unique.effect.percent}});
  });
  const isBasicHit = !!skill && skill.id==='ataque_basico';
  const procOnThisHit = isBasicHit || state.char.style==='doblefilo';
  sources.forEach(({it, sp})=>{
    if(sp.type==='sangrado' && !procOnThisHit) return;
    if(sp.type==='robovida' && !isBasicHit) return;
    if(sp.type==='succion_hechizo' && isBasicHit) return;
    if(sp.type==='aturdir'){
      // Piedras de alma únicamente (formato viejo) — inmediato, sin cambios.
      if(chance(sp.chance)){
        applyStatus(target, {name:'Aturdido', duration:1}, false);
        log(`<b>${it.name}</b> aturde a ${target.name}.`);
      }
    } else if(sp.type==='retroceso'){
      // Inmediato: se aplica ya mismo, así que el enemigo pierde la acción
      // que le tocaba este mismo ciclo de turno (ver processEnemyTurns).
      if(target.tpl && target.tpl.immuneRetroceso) return;
      if(chance(sp.chance)){
        applyStatus(target, {name:'Aturdido', duration:1}, false);
        log(`<b>${it.name}</b> aplica Retroceso a ${target.name}.`);
      }
    } else if(sp.type==='aturdir_retardado'){
      // Retardado: no aplica el estado ahora — solo marca la bandera, que
      // processEnemyTurns convierte en Aturdido real recién al final de ESTE
      // ciclo, para que afecte el turno del enemigo del ciclo SIGUIENTE.
      if(chance(sp.chance)){
        target.pendingStun = true;
        log(`<b>${it.name}</b> deja tambaleando a ${target.name} — quedará aturdido su próximo turno.`);
        // Martillo de guerra Tier S ('martillo_s'): si aturde, +15% de daño
        // propio durante 4 turnos, 1 vez por combate.
        if(sp.tierSProc && fireTierSBuff(sp.tierSProc, true, null, {name:'Furioso', dmgMult:1.15})){
          log(`<b>${it.name}</b> te llena de ímpetu: +15% de daño durante 4 turnos.`);
        }
      }
    } else if(sp.type==='sangrado'){
      const bleedSetBonus = specialsFromEquip(state.char.equip).filter(x=>x.type==='set_sangrado_bonus').reduce((sum,x)=>sum+x.value,0);
      if(chance(sp.chance + bleedSetBonus)){
        applyStatus(target, {name:'Sangrado', duration:sp.duration||2, stack:true, maxStack:3}, false);
        log(`<b>${it.name}</b> abre una herida en ${target.name}, que empieza a sangrar.`);
        // Daga curva/gemela Tier S ('daga_s'): con 3+ cargas de Sangrado en
        // el objetivo tras este golpe, +12% de daño propio 4 turnos, 1 vez
        // por combate.
        if(sp.tierSProc){
          const st = hasStatus(target.statuses,'Sangrado');
          if(st && (st.stacks||1)>=3 && fireTierSBuff(sp.tierSProc, true, null, {name:'Furioso', dmgMult:1.12})){
            log(`<b>${it.name}</b> huele la sangre: +12% de daño durante 4 turnos.`);
          }
        }
      }
    } else if(sp.type==='silencio'){
      if(chance(sp.chance)){
        applyStatus(target, {name:'Silencio', duration:1}, false);
        log(`<b>${it.name}</b> silencia a ${target.name}: su próximo turno solo podrá usar ataques básicos.`);
      }
    } else if(sp.type==='robovida' || sp.type==='succion_hechizo'){
      const heal = Math.max(1, Math.round(dmgDealt*sp.percent));
      const d = derived();
      const before = state.char.curHP;
      state.char.curHP = Math.min(d.maxHP, state.char.curHP+heal);
      if(state.char.curHP>before) log(`<b>${it.name}</b> te devuelve ${state.char.curHP-before} de vida.`);
    } else if(sp.type==='elemental_proc' && skill){
      if(skill.dmgType==='fuego' && chance(sp.chance)){
        applyStatus(target, {name:'Quemadura', duration:3}, false);
        log(`<b>${it.name}</b> prende fuego a ${target.name}.`);
      } else if(skill.dmgType==='hielo' && chance(sp.chance)){
        applyStatus(target, {name:'Ralentizado', duration:2}, false);
        log(`<b>${it.name}</b> congela a ${target.name}.`);
      } else if(skill.dmgType && chance(sp.chance)){
        // 2026-10-02 (pedido explícito): Instinto ya no hace sangrar — el
        // resto de habilidades (físicas, arcanas, de veneno) envenenan, y el
        // Veneno escala con Habilidad, el mismo stat que da la piedra.
        applyStatus(target, {name:'Veneno', duration:3, stack:true, maxStack:3}, false);
        log(`<b>${it.name}</b> envenena a ${target.name}.`);
      }
    } else if(sp.type==='debilitar_enemigo'){
      // Maza de combate Tier S ('maza_s'): además de su retroceso normal,
      // 10% de probabilidad propia de bajarle el ataque al enemigo un 15%
      // durante 4 turnos (reusa el estado Debilitado, que ya reduce el daño
      // propio del que lo porta — ver enemyAct).
      if(chance(sp.chance) && fireTierSBuff(sp.tierSProc, false, target, {name:'Debilitado'})){
        log(`<b>${it.name}</b> quiebra la guardia de ${target.name}: -15% de su ataque durante 4 turnos.`);
      }
    } else if(sp.type==='mp_refund_on_apply' && skill){
      // Vara arcana Tier S ('vara_s'): al aplicar Quemadura o Ralentizado
      // (es decir, al golpear con Bola de fuego/Lanza de hielo), 5% de
      // probabilidad de recuperar el MP máximo completo (era Espíritu hasta
      // el 2026-10-02, cuando el Mago pasó a pagar con MP).
      if((skill.dmgType==='fuego' || skill.dmgType==='hielo') && chance(sp.chance)){
        const d = derived();
        state.char.curSta = d.maxSta;
        log(`<b>${it.name}</b> te devuelve todo tu MP.`);
      }
    } else if(sp.type==='proc_chance' && sp.tierSProc){
      // Guantes Tier S ('guantes_s'): probabilidad genérica de potenciar la
      // siguiente habilidad — el bono real se lee en playerUseSkill (ver
      // hasStatus(combat.playerStatuses,'Furioso')), acá solo se dispara.
      if(chance(sp.chance) && fireTierSBuff(sp.tierSProc, true, null, {name:'Furioso', dmgMult:1.25})){
        log(`<b>${it.name}</b> resplandece: +25% de daño durante 4 turnos.`);
      }
    }
  });
}

// Armas del Hechicero (2026-10-02): reacciones a "aplicar un estado negativo"
// con una habilidad propia (solo si de verdad entró — ver el valor de
// retorno de applyStatus).
function onPlayerAppliedStatus(target, statusName){
  const info = STATUS_INFO[statusName];
  if(!info || info.buff) return;
  const st = hasStatus(target.statuses, statusName);
  const sps = specialsFromEquip(state.char.equip);
  // Libro de las Maldiciones: +1 turno (probabilidad), y en Tier S el
  // primero del combate es garantizado. Nunca suman 2 turnos a la vez.
  if(st){
    let extend = false;
    if(sps.some(sp=>sp.type==='primer_estado_garantizado') && !combat.tierSFired.has('libro_s')){
      combat.tierSFired.add('libro_s');
      extend = true;
    }
    const extChance = sps.filter(sp=>sp.type==='estado_extra_turno').reduce((m,sp)=>Math.max(m,sp.chance),0);
    if(!extend && extChance>0 && chance(extChance)) extend = true;
    if(extend){
      st.duration += 1;
      log(`<b>${equipNameWithSpecial('estado_extra_turno')}</b> prolonga ${statusName} sobre ${target.name} un turno más.`);
    }
  }
  const merma = sps.filter(sp=>sp.type==='estado_merma').reduce((m,sp)=>Math.max(m,sp.reduction),0);
  if(merma>0) applyMermado(target, merma, 2);
  const ruina = sps.filter(sp=>sp.type==='ruina_resistencias').sort((a,b)=>b.resPenalty-a.resPenalty)[0];
  if(ruina && chance(ruina.chance)){
    const existing = hasStatus(target.statuses,'Ruina');
    if(existing){ existing.resPenalty = Math.max(existing.resPenalty||0, ruina.resPenalty); existing.duration = Math.max(existing.duration||0, 2); }
    else target.statuses.push({name:'Ruina', duration:2, resPenalty:ruina.resPenalty});
    log(`<b>${equipNameWithSpecial('ruina_resistencias')}</b> resquebraja las defensas de ${target.name}: -${ruina.resPenalty} a todas sus resistencias durante 2 turnos.`);
  }
  sps.filter(sp=>sp.type==='mp_al_aplicar_estado').forEach(sp=>{ if(chance(sp.chance)) gainPlayerMP(sp.amount, equipNameWithSpecial('mp_al_aplicar_estado')); });
}

// Costo real de una habilidad para el jugador. Cetro del Devorador Tier S
// (Hechicero, 2026-10-02): la primera habilidad de CONTROL de cada combate
// cuesta menos MP (se marca como usada al pagar, ver playerUseSkill).
const CONTROL_SKILLS = new Set(['grito_de_panico','mirada_de_locura']);
function controlDiscountFor(skillId){
  if(!CONTROL_SKILLS.has(skillId) || !combat || combat.tierSFired.has('control_descuento')) return 0;
  return specialsFromEquip(state.char.equip).filter(sp=>sp.type==='control_descuento').reduce((sum,sp)=>sum+sp.amount,0);
}
function effectiveSkillCost(skillId, skill){
  if(!skill || !skill.cost) return 0;
  let v = Math.max(0, skill.cost.valor - controlDiscountFor(skillId));
  if(skill.cost.tipo==='espiritu' && combat && combat.espHalfNext) v = Math.ceil(v/2); // Piedra de Voluntad A+
  return v;
}

const SEGUNDO_ATAQUE_CAP = 0.5;
// Probabilidad de segundo ataque que excede el tope -> % de daño extra del básico.
function segundoAtaqueExcess(){
  const total = specialsFromEquip(state.char.equip).filter(sp=>sp.type==='segundo_ataque_basico').reduce((sum,sp)=>sum+sp.chance, 0);
  return Math.max(0, total - SEGUNDO_ATAQUE_CAP);
}

// isRepeat: true solo para la repetición gratuita de doble encantamiento
// (Foco arcano) o segundo ataque básico (Arco corto/Carcaj épicos) — la
// acción original ya pasó por Miedo/Confusión/costo, así que la repetición
// se salta todo eso y va directo a resolver el golpe otra vez.
async function playerUseSkill(skillId, targetIdx, isRepeat){
  if(!combat || combat.over) return;
  const skill = SKILLS[skillId];
  const d = derived();
  if(!isRepeat) trySummonShadow();

  if(skill.ultimate && !isRepeat){
    const usesLeft = ULTIMATE_MAX_USES - (state.dungeon.ultimateUses||0);
    if(usesLeft<=0){ log(`Ya usaste ${skill.name} las ${ULTIMATE_MAX_USES} veces permitidas en esta entrada al laberinto.`); return; }
    if((state.dungeon.ultimateCooldown||0) > 0){ log(`${skill.name} todavía se está enfriando (${state.dungeon.ultimateCooldown} turno(s) más).`); return; }
  }

  if(!isRepeat){
    const miedo = hasStatus(combat.playerStatuses,'Miedo');
    if(miedo && chance(miedo.procChance||0.4)){
      log('El Miedo te paraliza. Pierdes el turno.');
      await endPlayerTurn();
      return;
    }
  }

  // resource check
  if(skill.cost && !isRepeat){
    const pool = skill.cost.tipo==='estamina' ? state.char.curSta : state.char.curSpi;
    if(pool < effectiveSkillCost(skillId, skill)){ log('No tienes recursos suficientes para eso.'); return; }
  }
  if(skill.requiresPos && combat.playerPos !== skill.requiresPos && !skill.penaltyIfFrente){
    log(`Necesitas estar en ${skill.requiresPos==='frente'?'el Frente':'la Retaguardia'} para usar ${skill.name}.`);
    return;
  }

  // utility skills
  if(skill.utility==='defend'){
    combat.playerDefending = true;
    log('Te preparas para recibir el próximo golpe.');
    await endPlayerTurn(); return;
  }
  if(skill.utility==='reposition'){
    combat.playerPos = combat.playerPos==='frente' ? 'retaguardia' : 'frente';
    log(`Te mueves a ${combat.playerPos==='frente'?'el Frente':'la Retaguardia'}.`);
    await endPlayerTurn(); return;
  }
  // Escudo del Juramento (Paladín) — reusa el mismo pozo de escudo genérico
  // (combat.playerShield/grantShield) que ya usan las piedras de Sabiduría y
  // el Grimorio Tier S de Sacerdote, ahora como una habilidad propia del
  // jugador en vez de solo un proc pasivo.
  if(skill.utility==='shield_self'){
    const pct = skillId==='escudo_del_juramento' ? skillBonus('escudo_del_juramento','shieldPct', skill.shieldPct) : skill.shieldPct;
    const shieldMult = 1 + specialsFromEquip(state.char.equip).filter(sp=>sp.type==='aumento_escudo').reduce((sum,sp)=>sum+sp.value,0);
    const amount = Math.round(d.maxHP*pct*shieldMult);
    grantShield(true, null, amount);
    log(`Usas ${skill.name}: ganas un escudo de ${amount}.`);
    const bd = playerSetSp('set_bastion_divino');
    if(bd){ applyEgidaSet(true, null, bd.reduction); log(`<b>Bastión Divino</b>: tu escudo te envuelve en Égida (-${Math.round(bd.reduction*100)}% de daño recibido).`); }
    await endPlayerTurn(); return;
  }

  // spend cost
  if(skill.cost && !isRepeat){
    const discount = controlDiscountFor(skillId);
    const paid = effectiveSkillCost(skillId, skill);
    if(skill.cost.tipo==='estamina') state.char.curSta -= paid;
    else state.char.curSpi -= paid;
    if(skill.cost.tipo==='espiritu'){
      if(combat.espHalfNext){ combat.espHalfNext = false; log(`<b>Piedra de Voluntad</b>: ${skill.name} te costó la mitad de Espíritu.`); }
      else {
        const vol = stoneSpecials('esp_mitad_siguiente').sort((a,b)=>b.chance-a.chance)[0];
        if(vol && chance(vol.chance)){ combat.espHalfNext = true; log('<b>Piedra de Voluntad</b>: tu siguiente habilidad de Espíritu costará la mitad.'); }
      }
    }
    if(discount>0){
      combat.tierSFired.add('control_descuento');
      log(`<b>${equipNameWithSpecial('control_descuento')}</b> abarata tu primer control del combate: ${skill.name} cuesta ${paid} de MP.`);
    }
    checkPetResourceRecovery();
    // Sabiduría/Voluntad (piedras) y Vara arcana (arma de Mago):
    // probabilidad de recuperar parte de lo gastado — mismo mecanismo,
    // ahora también leído de las armas equipadas, no solo de las piedras.
    const refundSources = socketedStones().concat(EQUIP_SLOTS.map(slot=>state.char.equip[slot]).filter(Boolean));
    refundSources.forEach(it=>{
      itemSpecialsArr(it).forEach(sp=>{
        if(sp.type==='mp_refund' && skill.cost.tipo==='estamina' && chance(sp.chance)){
          const d0 = derived();
          const refund = Math.max(1, Math.round(skill.cost.valor*sp.amount));
          state.char.curSta = Math.min(d0.maxSta, state.char.curSta+refund);
          log(`<b>${it.name}</b> te devuelve ${refund} de MP.`);
        }
        // Escudo de maná — el "efecto avanzado" de Sabiduría A+ que hasta
        // ahora estaba solo prometido en el texto (pedido explícito
        // 2026-09-26, tras dropear una Sabiduría A y no ver ningún escudo).
        // Mismo gatillo que mp_refund (usar una habilidad que cuesta MP):
        // genera un escudo que absorbe daño físico Y mágico por igual
        // (combat.playerShield ya es agnóstico al tipo de daño, ver
        // dealDamageToPlayer), tamaño = % del MP máximo.
        if(sp.type==='mana_shield' && skill.cost.tipo==='estamina' && chance(sp.chance)){
          const d0 = derived();
          const shieldAmt = Math.round(d0.maxSta * sp.shieldPct);
          grantShield(true, null, shieldAmt);
          log(`<b>${it.name}</b> genera un escudo de maná que absorbe ${shieldAmt} de daño.`);
        }
        if(sp.type==='esp_refund' && skill.cost.tipo==='espiritu' && chance(sp.chance)){
          const d0 = derived();
          const refund = Math.max(1, Math.round(skill.cost.valor*sp.amount));
          state.char.curSpi = Math.min(d0.maxSpi, state.char.curSpi+refund);
          log(`<b>${it.name}</b> te devuelve ${refund} de espíritu.`);
        }
      });
    });
  }
  if(skill.ultimate){
    state.dungeon.ultimateUses = (state.dungeon.ultimateUses||0) + 1;
    state.dungeon.ultimateCooldown = ULTIMATE_COOLDOWN_TURNS;
  }

  // resolve target(s)
  let targets = [];
  const resolvedMode = resolvedTargetMode(skill);
  if(resolvedMode==='front'){
    // Si hay 2+ objetivos elegibles a la vez (ver playerFrontTargetIndices:
    // línea frontal si sigue viva, o toda la retaguardia si ya no queda
    // nadie al frente), el jugador ya eligió cuál por click (ver
    // useSkillFromMenu/onTarget) y llega acá con targetIdx puesto — se
    // valida que siga siendo un objetivo elegible antes de usarlo, por si
    // murió/cambió entre el click y la resolución. Con un solo objetivo
    // elegible, targetIdx llega null y se sigue auto-eligiendo como antes.
    let fi = -1;
    const idxs = playerFrontTargetIndices();
    if(targetIdx!=null && idxs.includes(targetIdx) && combat.enemies[targetIdx] && combat.enemies[targetIdx].hp>0){
      fi = targetIdx;
    } else {
      fi = idxs.length ? idxs[0] : -1;
    }
    if(fi<0){ log('No hay ningún enemigo al frente.'); return; }
    targets = [combat.enemies[fi]];
  } else if(resolvedMode==='any'){
    let t;
    if(typeof targetIdx==='string' && targetIdx.startsWith('ally:')){
      const allyIdx = parseInt(targetIdx.slice(5));
      const allyTarget = (combat.allies||[])[allyIdx];
      if(!allyTarget || allyTarget.hp<=0 || !isAllyHostile(allyTarget.id)){ log('Objetivo inválido.'); return; }
      t = allyTarget;
    } else {
      t = combat.enemies[targetIdx];
      if(!t || t.hp<=0){ log('Objetivo inválido.'); return; }
      if(!skill.utility) t = decoyIntercept(t);
    }
    targets = [t];
  } else if(skill.targetMode==='all' && skillId==='lluvia_flechas'){
    targets = playerFrontTargetIndices().map(i=>combat.enemies[i]);
  } else if(skill.targetMode==='all'){
    targets = livingEnemies();
  } else if(skill.targetMode==='self'){
    targets = [];
  }

  if(skill.utility==='mark'){
    let applyDef = skill.applies;
    if(skillId==='marca_cazador') applyDef = Object.assign({}, skill.applies, {duration: skillBonus('marca_cazador','duration', skill.applies.duration)});
    targets.forEach(t=> applyStatus(t, applyDef, false));
    log(`Marcas a ${targets.map(t=>t.name).join(', ')}.`);
    await endPlayerTurn(); return;
  }
  if(skill.utility==='buff_self'){
    // refresh the existing buff instead of stacking a duplicate entry (duplicates used to
    // pile up if you recast before the first one expired, showing two chips and quietly
    // extending the effect since only the first match is ever read)
    // +1 de duración: el turno en que se lanza termina con el descuento normal de
    // processEnemyTurns antes de que el jugador llegue a usarlo, así que sin este ajuste
    // un buff de "2 turnos" solo alcanzaba para un ataque bufado en vez de dos.
    const effectiveDuration = skill.applySelf.duration + 1;
    // Muro de Fe (Paladín): su reducción de daño sube en nivel 30, igual
    // criterio que el resto de los buff_self con mejora de hito.
    const applySelfDef = skillId==='muro_de_fe'
      ? Object.assign({}, skill.applySelf, {incomingDmgReduction: skillBonus('muro_de_fe','reductionPct', skill.applySelf.incomingDmgReduction)})
      : skill.applySelf;
    const existingBuff = hasStatus(combat.playerStatuses, skill.applySelf.name);
    if(existingBuff) existingBuff.duration = effectiveDuration;
    else combat.playerStatuses.push(Object.assign({}, applySelfDef, {duration: effectiveDuration}));
    log(`Usas ${skill.name}. Te sientes más fuerte.`);
    // Maza del Guardián (Paladín, 2026-10-02): probabilidad de que Muro de
    // Fe dure 1 turno más y, en Tier S, Espíritu al usarlo.
    if(skillId==='muro_de_fe'){
      const muroSps = specialsFromEquip(state.char.equip);
      const extChance = muroSps.filter(sp=>sp.type==='muro_fe_extend').reduce((m,sp)=>Math.max(m,sp.chance),0);
      const muroBuff = hasStatus(combat.playerStatuses, skill.applySelf.name);
      if(muroBuff && extChance>0 && chance(extChance)){
        muroBuff.duration += 1;
        log(`<b>${equipNameWithSpecial('muro_fe_extend')}</b> sostiene tu Muro de Fe un turno más.`);
      }
      gainPlayerSpirit(muroSps.filter(sp=>sp.type==='muro_fe_espiritu').reduce((sum,sp)=>sum+sp.amount,0), equipNameWithSpecial('muro_fe_espiritu'));
    }
    // Nivel 30: Grito de guerra también cura y anima al equipo (pedido
    // explícito) - vive acá en vez de como campos genéricos de SKILLS
    // porque es el único buff_self con efectos secundarios; si otra
    // habilidad llega a necesitar lo mismo, generalizar entonces.
    if(skillId==='grito_guerra' && state.char.level>=LEVEL_30_MILESTONE){
      const healPct = skillBonus('grito_guerra','healPct',0);
      if(healPct>0){
        const heal = Math.round(d.maxHP*healPct);
        const before = state.char.curHP;
        state.char.curHP = Math.min(d.maxHP, state.char.curHP+heal);
        if(state.char.curHP>before) log(`Te curas ${state.char.curHP-before} de vida.`);
      }
      const allyDmgMult = skillBonus('grito_guerra','allyDmgMult',1);
      if(allyDmgMult>1 && livingAllies().length){
        const allyBuffDuration = 2+1; // mismo +1 que el buff propio, ver comentario arriba
        livingAllies().forEach(ally=>{
          const existing = hasStatus(ally.statuses,'Inspirado');
          if(existing) existing.duration = allyBuffDuration;
          else ally.statuses.push({name:'Inspirado', duration:allyBuffDuration, dmgMult:allyDmgMult});
        });
        log(`Tu grito inspira a tu equipo: +${Math.round((allyDmgMult-1)*100)}% de daño durante 2 turnos.`);
      }
    }
    await endPlayerTurn(); return;
  }

  const confusion = !isRepeat && hasStatus(combat.playerStatuses,'Confusion');
  if(confusion && chance(confusion.procChance||0.35)){
    const selfDmg = Math.max(1, Math.round(skillBaseDamage() * skill.mult));
    log(`La Confusión te hace atacar a ciegas... ¡y te golpeas a ti mismo!`);
    dealDamageToPlayer(selfDmg);
    await endPlayerTurn();
    return;
  }

  const {crit} = computeCritEvasion();
  const furioso = hasStatus(combat.playerStatuses,'Furioso');
  const raceObj = race();
  const ceguera = hasStatus(combat.playerStatuses,'Ceguera');
  const monsterLevel = monsterEffectiveLevel();
  const outgoingLevelDiffMult = levelDiffDamageMult(state.char.level, monsterLevel);
  const turnEffects = []; // para animar el golpe del jugador (ver playBattleAnim más abajo)
  // Soberano Elemental 5 piezas (Cataclismo): cargas por habilidad elemental.
  let cataclismoBoost = 0;
  const cataSp = playerSetSp('set_cataclismo');
  if(cataSp && !isRepeat && targets.length && ['fuego','hielo','mixto'].includes(skill.dmgType)){
    if((combat.cataclismo||0) >= cataSp.charges){
      cataclismoBoost = cataSp.value; combat.cataclismo = 0;
      log(`<b>Cataclismo</b>: tus cargas elementales estallan (+${Math.round(cataSp.value*100)}% de daño).`);
    } else combat.cataclismo = (combat.cataclismo||0) + 1;
  }
  // Artemisa 5 piezas (Luna Llena): se consume en el próximo básico propio.
  const lunaLlenaSp = (!isRepeat && skillId==='ataque_basico' && combat.lunaLlena) ? playerSetSp('set_luna_llena') : null;
  if(lunaLlenaSp) combat.lunaLlena = false;
  const splashHits = []; // [{dmg, exclude}] salpicaduras de Artemisa, se resuelven tras el bucle

  targets.forEach(target=>{
    if(ceguera && chance(ceguera.procChance||0.32)){
      log(`La Ceguera hace que tu golpe hacia ${target.name} no encuentre nada.`);
      return;
    }
    // Esquivar del enemigo (equipo general: Precisión, ver SET_CATALOG) —
    // solo enemigos de verdad tienen tpl/evasion; un aliado hostil como
    // objetivo no esquiva por esta vía. Parálisis en el ENEMIGO (pedido
    // explícito 2026-09-28, kit del Hechicero): mismo trato espejo que ya
    // recibe el jugador con su propia Parálisis — evasión a 0, no puede
    // esquivar nada.
    if(target.tpl){
      const dodgeChance = hasStatus(target.statuses,'Paralisis') ? 0 : clamp((target.evasion||0) + enemyStatusEvasionBonus(target.statuses) + levelGapEvasionBonus(monsterLevel, state.char.level) - d.precision, 0.02, 0.85);
      if(chance(dodgeChance)){
        log(`${target.name} esquiva tu ataque.`);
        return;
      }
    }
    // evasion of enemy (simple: small base)
    let base = skillBaseDamage() * skill.mult * (skill.hits||1);

    // race passives affecting outgoing
    if(raceObj.id==='draconido' && skill.dmgType==='fuego') base *= 1.15;
    if(raceObj.id==='barbaro' && state.char.curHP/d.maxHP < 0.3) base *= 1.2;
    // Rework del Arquero (2026-09-16): su ataque básico pasa a ser su golpe
    // más fuerte, por encima incluso de Disparo certero — pedido explícito,
    // "+60%" es mi elección (no vino con un número exacto), fácil de ajustar
    // acá si en la práctica queda muy arriba o muy abajo del resto del kit.
    if(state.char.style==='tirador' && skillId==='ataque_basico') base *= 1.6;
    if(furioso) base *= (furioso.dmgMult||1);
    base *= statusStackDealtMult(combat.playerStatuses.filter(st=> st!==furioso));
    if(hasStatus(combat.playerStatuses,'Debilitado')) base *= 0.85; // te drenaron la fuerza: -15% de daño mientras dure
    // Furia Contenida ya no vive acá (era un multiplicador pasivo por golpe,
    // sin límite de usos) — ver el REWORK 2026-09-24 en SOUL_STONES.furia_*
    // y checkFuriaContenidaTrigger(), enganchado en dealDamageToPlayer().
    // Bastón rúnico / Arco largo / Martillo de guerra épico: bono de daño
    // plano del arma equipada, siempre activo (no es una probabilidad).
    const equipSpecialsForDmg = specialsFromEquip(state.char.equip);
    equipSpecialsForDmg.forEach(sp=>{
      if(sp.type==='aumento_dano') base *= (1+sp.value);
      // Daño por raza/posición de mascota (Caídos del Laberinto, ver
      // ENEMY_RACE_TAG/DECADE_RACE_TAG y target.tpl.frontline, que ya
      // existe en TODO enemigo de la bestiaria).
      if(sp.type==='aumento_dano_raza' && target.tpl && ENEMY_RACE_TAG[target.tpl.id]===sp.raza) base *= (1+sp.value);
      if(sp.type==='aumento_dano_posicion' && target.tpl){
        const isFrontline = !!target.tpl.frontline;
        if((sp.posicion==='frontline') === isFrontline) base *= (1+sp.value);
      }
    });
    // Armas de Paladín/Hechicero (2026-10-02). Se mide ANTES de los combos
    // de abajo, que pueden consumir estados del objetivo.
    const targetNegStatuses = negativeStatusCount(target);
    const targetWasWeakened = isEnemyWeakened(target);
    const targetBleed = hasStatus(target.statuses||[],'Sangrado');
    const targetBleedStacks = targetBleed ? (targetBleed.stacks||1) : 0;
    equipSpecialsForDmg.forEach(sp=>{
      if(sp.type==='aumento_dano_habilidad' && skillId!=='ataque_basico') base *= (1+sp.value);
      if(sp.type==='dano_vs_debilitado' && targetWasWeakened) base *= (1+sp.value);
      if(sp.type==='dano_vs_estado' && targetNegStatuses>0) base *= (1+sp.value);
      if(sp.type==='dano_vs_multiestado' && targetNegStatuses>=2) base *= (1+sp.value);
      if(sp.type==='dano_por_estado' && targetNegStatuses>0) base *= (1+sp.value*Math.min(targetNegStatuses, sp.max||3));
      // Conjuntos (2026-10-02)
      if(sp.type==='aumento_dano_basico' && skillId==='ataque_basico') base *= (1+sp.value);
      if(sp.type==='set_dano_por_sangrado' && targetBleedStacks>0) base *= (1+sp.value*Math.min(3, targetBleedStacks));
      if(sp.type==='set_ultima_victima' && target.hp/target.maxHP < 0.3) base *= (1+sp.value);
      if(sp.type==='set_dano_elemental' && ['fuego','hielo','mixto'].includes(skill.dmgType)) base *= (1+sp.value);
      if(sp.type==='set_choque_termico' && ((skill.dmgType==='fuego' && hasStatus(target.statuses,'Ralentizado')) || (skill.dmgType==='hielo' && hasStatus(target.statuses,'Quemadura')))) base *= (1+sp.value);
    });
    if(cataclismoBoost) base *= (1+cataclismoBoost);
    if(skillId==='ataque_basico'){ const segExtra = segundoAtaqueExcess(); if(segExtra>0) base *= (1+segExtra); }
    if(lunaLlenaSp) base *= (1+lunaLlenaSp.bonus);
    // Cuchillo largo/gemelo Tier S ('cuchillo_s'): objetivo por debajo del
    // 25% de vida, +20% de daño — condición continua, se evalúa en cada
    // golpe, no consume el "1 vez por combate".
    if(target.hp/target.maxHP < 0.25 && equipSpecialsForDmg.some(sp=>sp.tierSProc==='cuchillo_s')){
      base *= 1.2;
    }
    // Arco largo Tier S ('arcolargo_s'): objetivo por encima del 70% de
    // vida, +15% de daño — mismo criterio continuo que arriba.
    if(target.hp/target.maxHP > 0.7 && equipSpecialsForDmg.some(sp=>sp.tierSProc==='arcolargo_s')){
      base *= 1.15;
    }
    // Bastón rúnico Tier S ('baston_s'): la primera habilidad elemental
    // (no física) de todo el combate hace +15% de daño — 1 vez por combate.
    if(skill.dmgType && skill.dmgType!=='fisico' && equipSpecialsForDmg.some(sp=>sp.tierSProc==='baston_s') && !combat.tierSFired.has('baston_s')){
      combat.tierSFired.add('baston_s');
      base *= 1.15;
    }
    // Grimorio de plegarias épico (aliado Sacerdote): el enemigo bendecido
    // recibe más daño de todo el equipo mientras dure, tú incluido.
    const blessedDebuff = hasStatus(target.statuses,'Bendecido');
    if(blessedDebuff && blessedDebuff.incomingDmgMult) base *= blessedDebuff.incomingDmgMult;

    // combo: consumes specific status for bonus (machacar, y la ultimate furia_titan)
    let comboText = '';
    if(skill.consumes){
      const st = hasStatus(target.statuses, skill.consumes.name);
      if(st){
        const bonusMult = skillId==='machacar' ? skillBonus('machacar','comboBonusMult', skill.consumes.bonusMult) : skill.consumes.bonusMult;
        base *= bonusMult;
        removeStatus(target.statuses, skill.consumes.name);
        applyStatus(target, skill.consumes.applies, false);
        comboText = ` ¡Combo! ${skill.consumes.name} consumido: ${target.name} queda Aturdido.`;
      }
    }
    if(skill.scalesWithStack){
      const st = hasStatus(target.statuses, skill.scalesWithStack.name);
      const perStack = skillId==='danza_cuchillas' ? skillBonus('danza_cuchillas','perStackMult', skill.scalesWithStack.perStackMult) : skill.scalesWithStack.perStackMult;
      if(st) base *= (1 + (st.stacks||1)*perStack);
    }
    if(skill.consumesStackBonus){
      const st = hasStatus(target.statuses, skill.consumesStackBonus.name);
      if(st){
        const perStackMult = skillId==='golpe_gracia' ? skillBonus('golpe_gracia','perStackMult', skill.consumesStackBonus.perStackMult) : skill.consumesStackBonus.perStackMult;
        base *= (1 + (st.stacks||1)*perStackMult);
        comboText = ` ¡Ejecución! Consumes ${st.stacks} carga(s) de ${st.name}.`;
        removeStatus(target.statuses, skill.consumesStackBonus.name);
      }
    }
    if(skill.bonusVsMarked && hasStatus(target.statuses,'Marcado')){
      base *= (1 + (skillId==='lluvia_flechas' ? skillBonus('lluvia_flechas','bonusVsMarked', skill.bonusVsMarked) : skill.bonusVsMarked));
    }
    if(skill.consumesEither){
      let used = false;
      for(const opt of skill.consumesEither){
        const st = hasStatus(target.statuses, opt.name);
        if(st && !used){
          const bonusMult = skillId==='explosion_arcana' ? skillBonus('explosion_arcana','bonusMult', opt.bonusMult) : opt.bonusMult;
          base *= (1+bonusMult);
          removeStatus(target.statuses, opt.name);
          comboText = ` ¡Combo elemental! ${opt.name} detonado.`;
          used = true;
        }
      }
      if(!used){
        const penalty = skillId==='explosion_arcana' ? skillBonus('explosion_arcana','penaltyIfNone', skill.penaltyIfNone||0) : (skill.penaltyIfNone||0);
        base *= (1-penalty);
      }
    }
    // marked passive (all incoming dmg +20%)
    if(hasStatus(target.statuses,'Marcado')) base *= 1.2;
    // Pasiva "mientras viva el acompañante" (2026-09-25, Matriarca Telaraña
    // "Reina del Nido"): reduce el daño que RECIBE este enemigo mientras su
    // compañero siga con vida — desaparece apenas el jugador lo derrota.
    if(target.tpl && target.tpl.passiveWhileCompanionAlive && target.companionRef && target.companionRef.hp>0){
      base *= (1 - target.tpl.passiveWhileCompanionAlive.reduccion);
    }
    // Autobuffs defensivos del enemigo (Seda Protectora, Caparazón
    // Endurecido, etc. — ver utility:'self_buff' en resolveNewStyleEnemyMove).
    (target.statuses||[]).forEach(st=>{ if(st.incomingDmgReduction) base *= (1 - st.incomingDmgReduction); });
    base *= enemyPassiveTakenMult(target);

    // Foco arcano Tier S ('foco_s'): cuando la habilidad consumió un estado
    // (cualquiera de los combos de arriba dejó comboText), +10% de daño más
    // — condición continua, se evalúa en cada golpe que sí combea.
    if(comboText && equipSpecialsForDmg.some(sp=>sp.tierSProc==='foco_s')){
      base *= 1.1;
    }

    let isCrit = skill.guaranteedCrit ? true : chance(crit);
    if(combat.critNext && !isRepeat){ isCrit = true; combat.critNextUsed = true; }
    if(isCrit) base *= (1.5 + d.critDmgBonus);

    let ignore = skillId==='disparo_certero' ? skillBonus('disparo_certero','ignoreResist', skill.ignoreResist) : (skill.ignoreResist||0);
    // Carcaj Tier S ('carcaj_s'): el flag lo deja armado playerUseSkill justo
    // antes de relanzar el segundo ataque básico (ver más abajo) — se
    // consume acá mismo así que solo afecta a ESE golpe repetido.
    if(combat.pendingIgnoreBoost){ ignore = Math.max(ignore, 0.5); combat.pendingIgnoreBoost = false; }
    let resKey = skill.dmgType==='arcano'? null : skill.dmgType;
    // Cataclismo elemental (ultimate del Mago): "fuego y hielo combinados" se
    // resuelve golpeando la resistencia más baja de las dos por objetivo, en
    // vez de tener un dmgType fijo - por eso su SKILLS.dmgType es 'mixto', un
    // marcador que no coincide con ninguna resistencia real por sí solo.
    if(skillId==='cataclismo_elemental'){
      resKey = effectiveEnemyRes(target,'fuego') <= effectiveEnemyRes(target,'hielo') ? 'fuego' : 'hielo';
    }
    let resVal = resKey ? effectiveEnemyRes(target, resKey)*(1-ignore) : 0;
    // Arco largo/Carcaj y guantes de Guerrero/Arquero: penetración de
    // ARMADURA FÍSICA, solo contra golpes físicos. Guantes de Asesino/Mago/
    // Sacerdote: penetración de RESISTENCIA MÁGICA, solo contra golpes que
    // no sean físicos (fuego/hielo/veneno/arcano). Ambas restan puntos fijos,
    // siempre activas (no son un proc).
    specialsFromEquip(state.char.equip).forEach(sp=>{
      if(sp.type==='penetracion_armadura' && resKey==='fisico') resVal -= sp.value*100;
      if(sp.type==='penetracion_magica' && resKey && resKey!=='fisico') resVal -= sp.value*100;
    });
    // Penetración por nivel (2026-09-16): además de la del equipo, todo golpe
    // penetra un poco más a medida que subes de nivel, sin importar el tipo.
    if(resKey) resVal -= d.penetracionNivel*100;
    let dmg = base*(1-resVal/100)*outgoingLevelDiffMult;
    if(hasStatus(target.statuses,'Paralisis')) dmg *= 1.25; // indefenso: mismo trato que recibe el jugador
    if(skill.penaltyIfFrente && combat.playerPos==='frente') dmg *= (1-skill.penaltyIfFrente);
    dmg = Math.max(1, Math.round(dmg));
    if(target.defending) dmg = Math.round(dmg*0.5);
    target.hp = Math.max(0, target.hp - dmg);
    // Reflejo de daño (2026-09-25, pedido explícito, "Espejo Viviente" y
    // similares): "100 de daño con 20% de reflejo = 20 de daño reflectado" —
    // plano, sin resistencia ni escudo del lado del enemigo, sobre el golpe
    // ya calculado.
    if(target.tpl && target.tpl.reflectPct){
      const reflected = Math.max(1, Math.round(dmg*target.tpl.reflectPct));
      dealDamageToPlayer(reflected);
      log(`${target.name} refleja ${reflected} de daño de vuelta.`);
    }
    turnEffects.push(target.tpl
      ? {targetKind:'enemy', key: combat.enemies.indexOf(target), amount:dmg, kind:'dmg'}
      : {targetKind:'ally', key: target.id, amount:dmg, kind:'dmg'});
    if(skill.selfHealPctOfDmg){
      let healPct = skillId==='golpe_consagrado' ? skillBonus('golpe_consagrado','healPct', skill.selfHealPctOfDmg) : skill.selfHealPctOfDmg;
      // Sello de la Sentencia épico+: Golpe Consagrado cura más contra un
      // enemigo debilitado (puntos porcentuales sumados al % base).
      if(skillId==='golpe_consagrado' && targetWasWeakened){
        healPct += equipSpecialsForDmg.filter(sp=>sp.type==='cura_vs_debilitado').reduce((sum,sp)=>sum+sp.value,0);
      }
      // aumento_curacion (Manos de Gracia, conjunto Gracia Celestial) y
      // Milagro (Gracia 5 piezas) también afectan a la autocuración.
      const playerHealSps = specialsFromEquip(state.char.equip);
      // Gracia (3 y 5 piezas) cuenta UNA curación por uso de habilidad, no una
      // por enemigo golpeado (Juicio Divino golpea a todos).
      const firstHealOfCast = target===targets[0];
      const healMult = (1 + playerHealSps.filter(sp=>sp.type==='aumento_curacion').reduce((sum,sp)=>sum+sp.value,0)) * (firstHealOfCast ? graciaHealMult(playerHealSps, combat) : 1);
      const selfHeal = Math.max(1, Math.round(dmg*healPct*healMult));
      const beforeHeal = state.char.curHP;
      state.char.curHP = Math.min(d.maxHP, state.char.curHP+selfHeal);
      if(state.char.curHP>beforeHeal) log(`Recuperas ${state.char.curHP-beforeHeal} de vida.`);
      if(firstHealOfCast) graciaAfterHeal(playerHealSps, combat, 'Tú', amt=>gainPlayerSpirit(amt, 'Milagro'), {isPlayer:true, ally:null, maxHP:d.maxHP});
    }

    log(`Usas <b>${skill.name}</b> sobre ${target.name}: ${dmg} de daño${isCrit?' (¡crítico!)':''}.${comboText}`);

    // Artemisa 3 piezas: el ataque duplicado salpica a otro enemigo.
    if(isRepeat && skillId==='ataque_basico'){
      const fe = playerSetSp('set_flecha_expansiva');
      if(fe) splashHits.push({dmg: Math.max(1, Math.round(dmg*fe.pct)), exclude: target, single:true, label:'Flecha Expansiva'});
    }
    if(lunaLlenaSp) splashHits.push({dmg: Math.max(1, Math.round(dmg*lunaLlenaSp.splash)), exclude: target, single:false, label:'Lluvia de Artemisa'});

    // Efectos al golpear de las armas de Paladín/Hechicero (2026-10-02).
    if(skillId==='golpe_consagrado'){
      if(targetWasWeakened) gainPlayerSpirit(equipSpecialsForDmg.filter(sp=>sp.type==='espiritu_vs_debilitado').reduce((sum,sp)=>sum+sp.amount,0), equipNameWithSpecial('espiritu_vs_debilitado'));
      const heraldo = equipSpecialsForDmg.filter(sp=>sp.type==='heraldo_merma').sort((a,b)=>b.reduction-a.reduction)[0];
      if(heraldo && target.hp>0 && chance(heraldo.chance)){
        applyMermado(target, heraldo.reduction, 2);
        log(`<b>${equipNameWithSpecial('heraldo_merma')}</b> sentencia a ${target.name}: -${Math.round(heraldo.reduction*100)}% de su daño durante 2 turnos.`);
      }
    }
    if(skillId==='juicio_divino' && target.hp>0){
      const juicio = equipSpecialsForDmg.filter(sp=>sp.type==='juicio_merma').sort((a,b)=>b.reduction-a.reduction)[0];
      if(juicio){
        applyMermado(target, juicio.reduction, 2);
        log(`El Juicio deja Mermado a ${target.name}: -${Math.round(juicio.reduction*100)}% de su daño durante 2 turnos.`);
      }
    }
    if(targetNegStatuses>=2){
      equipSpecialsForDmg.filter(sp=>sp.type==='mp_vs_multiestado').forEach(sp=>{ if(chance(sp.chance)) gainPlayerMP(sp.amount, equipNameWithSpecial('mp_vs_multiestado')); });
      if(skillId==='grito_del_abismo') gainPlayerMP(equipSpecialsForDmg.filter(sp=>sp.type==='abismo_mp').reduce((sum,sp)=>sum+sp.amount,0), equipNameWithSpecial('abismo_mp'));
    }
    if(target.hp<=0 && targetNegStatuses>0){
      gainPlayerMP(equipSpecialsForDmg.filter(sp=>sp.type==='mp_al_rematar').reduce((sum,sp)=>sum+sp.amount,0), equipNameWithSpecial('mp_al_rematar'));
    }

    if(skill.applies){
      let applyDef = skill.applies;
      if(skillId==='golpe_bruto') applyDef = Object.assign({}, skill.applies, {chance: skillBonus('golpe_bruto','tambaleoChance', skill.applies.chance)});
      else if(skillId==='corte_rapido') applyDef = Object.assign({}, skill.applies, {
        maxStack: skillBonus('corte_rapido','maxStack', skill.applies.maxStack),
        duration: skillBonus('corte_rapido','duration', skill.applies.duration)
      });
      else if(skillId==='grito_de_panico') applyDef = Object.assign({}, skill.applies, {chance: skillBonus('grito_de_panico','applyChance', skill.applies.chance)});
      else if(skillId==='mirada_de_locura') applyDef = Object.assign({}, skill.applies, {chance: skillBonus('mirada_de_locura','applyChance', skill.applies.chance)});
      else if(skillId==='bola_fuego') applyDef = Object.assign({}, skill.applies, {chance: skillBonus('bola_fuego','applyChance', skill.applies.chance)});
      else if(skillId==='lanza_hielo') applyDef = Object.assign({}, skill.applies, {duration: skillBonus('lanza_hielo','duration', skill.applies.duration)});
      else if(skillId==='toque_venenoso') applyDef = Object.assign({}, skill.applies, {maxStack: skillBonus('toque_venenoso','maxStack', skill.applies.maxStack)});
      // Conjuntos (2026-10-02): probabilidad extra de aplicar estados.
      if(applyDef.chance!==undefined && applyDef.chance<1){
        const sps = specialsFromEquip(state.char.equip);
        let bonus = sps.concat(stoneSpecials('prob_estados')).filter(sp=>sp.type==='prob_estados').reduce((sum,sp)=>sum+sp.value,0);
        if(applyDef.name==='Sangrado') bonus += sps.filter(sp=>sp.type==='set_sangrado_bonus').reduce((sum,sp)=>sum+sp.value,0);
        if(MENTAL_STATUSES.has(applyDef.name)){
          const mq = sps.find(sp=>sp.type==='set_mente_quebrada');
          if(mq && targetNegStatuses>0) bonus += mq.value;
          const et = sps.find(sp=>sp.type==='set_eclipse_total');
          if(et && targetNegStatuses>=2) bonus += et.value;
        }
        if(bonus>0) applyDef = Object.assign({}, applyDef, {chance: Math.min(1, applyDef.chance + bonus)});
      }
      if(target.hp>0 && applyStatus(target, applyDef, false)){
        onPlayerAppliedStatus(target, applyDef.name);
        const et = playerSetSp('set_eclipse_total');
        if(et && targetNegStatuses>=2) applyMermado(target, et.reduction, 2);
      }
    }
    applyEquippedSpecials(target, dmg, skill);
    // Riposte (Duelista Veterano, Isla Paraíso): contraataque tras un golpe físico.
    const rip = target.tpl && target.tpl.riposte;
    if(rip && target.hp>0 && skill.dmgType==='fisico' && chance(rip.chance)){
      const resV = totalRes('fisico');
      const counter = Math.max(1, Math.round(target.atk*rip.mult*(1-resV/100)));
      dealDamageToPlayer(counter);
      log(`${target.name} contraataca (Riposte): ${counter} de daño.`);
    }
  });
  if(combat.critNextUsed){ combat.critNext = false; combat.critNextUsed = false; }
  splashHits.forEach(sh=>{
    const pool = livingEnemies().filter(e=>e!==sh.exclude);
    const hit = sh.single ? (pool.length ? [pick(pool)] : []) : pool;
    hit.forEach(e=>{ e.hp = Math.max(0, e.hp - sh.dmg); turnEffects.push({targetKind:'enemy', key: combat.enemies.indexOf(e), amount:sh.dmg, kind:'dmg'}); });
    if(hit.length) log(`<b>${sh.label}</b> alcanza a ${hit.map(e=>e.name).join(', ')}: ${sh.dmg} de daño.`);
  });

  // Foco arcano (Mago) / Arco corto y Carcaj de cuero épicos (Arquero): una
  // sola repetición gratuita del mismo golpe, sin volver a cobrar el costo.
  // Nunca aplica a un ultimate (evita una segunda ejecución gratis de algo
  // ya limitado por usos/enfriamiento) ni encadena una segunda repetición.
  //
  // Bug real reportado 2026-09-28 ("sigue pasando que no finaliza la
  // batalla", Mago): si el primer golpe mataba al último enemigo (o al
  // objetivo elegido), la repetición llegaba a playerUseSkill() con un
  // objetivo muerto, respondía "Objetivo inválido." / "No hay ningún objetivo
  // disponible." y salía con un return SIN llamar a endPlayerTurn() — el
  // caller también hacía return, así que nadie revisaba checkCombatEnd() y el
  // combate quedaba abierto con todos los enemigos en 0 de vida. Ahora (1) la
  // repetición solo se intenta si queda algo a quien pegarle, re-apuntando al
  // enemigo más débil si el objetivo original murió, y (2) si aun así la
  // repetición no llega a terminar el turno, se termina acá.
  if(!isRepeat && !skill.ultimate){
    const myCombat = combat;
    let repTarget = targetIdx, canRepeat;
    if(typeof targetIdx==='string'){
      const al = (combat.allies||[])[parseInt(targetIdx.slice(5))];
      canRepeat = !!al && al.hp>0;
    } else if(resolvedMode==='any'){
      const t = combat.enemies[targetIdx];
      if(!t || t.hp<=0) repTarget = autoPickEnemyIndex();
      canRepeat = repTarget>=0;
    } else if(resolvedMode==='self'){
      canRepeat = true;
    } else {
      canRepeat = livingEnemies().length>0;
    }
    const repeatAndClose = async ()=>{
      const tc = combat.turnCount;
      await playerUseSkill(skillId, repTarget, true);
      if(combat && combat===myCombat && !combat.over && combat.turnCount===tc) await endPlayerTurn();
    };
    // Incluye la Piedra de Instinto A+ (doble lanzamiento, mismo mecanismo).
    const equipSpecials = specialsFromEquip(state.char.equip).concat(stoneSpecials('doble_encantamiento'));
    if(canRepeat && skill.cost && equipSpecials.some(sp=>sp.type==='doble_encantamiento' && chance(sp.chance))){
      log(`Tu arma realiza un <b>doble encantamiento</b>: ${skill.name} se relanza sin costo.`);
      await repeatAndClose();
      return;
    }
    if(canRepeat && skillId==='ataque_basico'){
      // Tope de segundo ataque (pedido explícito 2026-10-02): las fuentes se
      // SUMAN (arma, carcaj, Artemisa, Caídos) y la probabilidad final nunca
      // pasa de SEGUNDO_ATAQUE_CAP; lo que exceda se convierte en daño
      // adicional del ataque básico (ver segundoAtaqueExcess). Se tira una
      // sola vez; la fuente "ganadora" (para efectos de Tier S como el del
      // Arco corto o el Carcaj) se elige en proporción a su probabilidad.
      const segSources = equipSpecials.filter(sp=>sp.type==='segundo_ataque_basico');
      const segTotal = segSources.reduce((sum,sp)=>sum+sp.chance, 0);
      let segundoAtaque = null;
      if(segSources.length && chance(Math.min(SEGUNDO_ATAQUE_CAP, segTotal))){
        let r = Math.random()*segTotal;
        segundoAtaque = segSources.find(sp=>(r -= sp.chance) < 0) || segSources[0];
      }
      if(segundoAtaque){
        log('Realizas un segundo ataque básico.');
        // Carcaj Tier S ('carcaj_s'): 10% de que ESTE segundo ataque ignore
        // 50% de resistencia física — se arma acá, se consume una sola vez
        // en el cálculo de daño de abajo (ver combat.pendingIgnoreBoost).
        if(segundoAtaque.tierSProc==='carcaj_s' && chance(0.1)) combat.pendingIgnoreBoost = true;
        await repeatAndClose();
        // Bug 2026-10-02: la carga de Luna Llena (Artemisa 5) y la cura del
        // Arco corto S se aplicaban aunque el segundo ataque terminara el
        // combate — "cargada" se anunciaba y se perdía. Ahora solo si el
        // MISMO combate sigue abierto.
        const stillFighting = combat && combat===myCombat && !combat.over;
        if(stillFighting && playerSetSp('set_luna_llena') && !combat.lunaLlena){ combat.lunaLlena = true; log('<b>Luna Llena</b> cargada: tu próximo ataque básico será más fuerte y alcanzará a todos.'); }
        // Arco corto Tier S ('arcocorto_s'): cada segundo ataque cura un 3%
        // de tu vida máxima.
        if(stillFighting && segundoAtaque.tierSProc==='arcocorto_s'){
          const d0 = derived();
          const before = state.char.curHP;
          state.char.curHP = Math.min(d0.maxHP, state.char.curHP + Math.round(d0.maxHP*0.03));
          if(state.char.curHP>before) log(`Tu Arco corto te devuelve ${state.char.curHP-before} de vida.`);
        }
        return;
      }
    }
  }

  if(getCombatSpeed()===1 && targets.length){
    combat.lastActor = {kind:'player'};
    combat.lastAction = {label: skill.name, effects: turnEffects};
    renderCombat();
    await withAnimTimeout(playBattleAnim(combat.lastActor, combat.lastAction));
    combat.lastActor = null; combat.lastAction = null;
  }

  await endPlayerTurn();
}

async function endPlayerTurn(){
  // myCombat: mismo candado que resolveAllyTurns/processEnemyTurns (ver esos
  // comentarios) — si el combate ya terminó y empezó uno nuevo durante los
  // await de abajo, esta llamada no debe seguir resolviendo turnos sobre el
  // combate nuevo como si fuera el que la disparó.
  const myCombat = combat;
  combat.turnCount = (combat.turnCount||0) + 1;
  if(state.dungeon && state.dungeon.ultimateCooldown>0) state.dungeon.ultimateCooldown--;
  checkCombatEnd();
  if(!combat || combat.over) return;
  await resolveAllyTurns();
  if(combat !== myCombat) return;
  checkCombatEnd();
  if(!combat || combat.over) return;
  await processEnemyTurns();
}

// IA de aliados v1: sin habilidades propias todavía, solo un golpe básico al
// enemigo del frente — salvo el Sacerdote, que prioriza curar a quien esté
// más bajo de vida (tú o otro aliado) antes de atacar.
// Autopreservación de aliados: antes de su acción normal por rol, un aliado
// gravemente herido intenta beber de la mochila COMPARTIDA (la misma que
// usas tú) — la poción de vida más fuerte disponible, o un Antídoto si
// carga algún efecto negativo. Si no le queda ninguna poción útil y sigue
// en peligro, se repliega a la Retaguardia en vez de atacar: deja de
// proteger el Frente, pero ya no es el objetivo prioritario de los
// enemigos. No es "aprendizaje" en el sentido literal — es una decisión que
// se reevalúa cada turno según la situación real del combate, no una IA que
// mejora con el tiempo. Los aliados todavía no tienen su propio MP/espíritu
// (solo enfriamiento de turnos para su habilidad, ver ALLY_SKILL_COOLDOWN),
// así que no hay nada que un tónico de MP/espíritu les restaure todavía.
const ALLY_SELF_PRESERVE_HP_PCT = 0.35;
const ALLY_RETURN_TO_FRONT_HP_PCT = 0.6;
function findUsablePotion(potionId){
  return state.char.inventory.find(i=>i.kind==='potion' && i.potionId===potionId && i.qty>0) || null;
}
function consumeInventoryPotion(item){
  item.qty -= 1;
  if(item.qty<=0) state.char.inventory = state.char.inventory.filter(i=>i!==item);
}
function allyMaybeSelfPreserve(ally){
  const hpPct = ally.hp/ally.maxHP;

  // Ya a salvo: si es el rol de tanque y se había replegado, vuelve al Frente.
  if(ally.frontline && ally.pos==='retaguardia' && hpPct >= ALLY_RETURN_TO_FRONT_HP_PCT){
    ally.pos = 'frente';
    log(`<b>${ally.name}</b> se recupera lo suficiente y vuelve al Frente.`);
    combat.lastAction = {label:'Vuelve al Frente', effects:[]};
    return true;
  }

  if(hpPct <= ALLY_SELF_PRESERVE_HP_PCT){
    const potion = findUsablePotion('vida_mayor') || findUsablePotion('vida_menor');
    if(potion){
      const tpl = POTION_TEMPLATES[potion.potionId];
      const heal = Math.round(ally.maxHP * tpl.effect.amount);
      const before = ally.hp;
      ally.hp = Math.min(ally.maxHP, ally.hp + heal);
      consumeInventoryPotion(potion);
      log(`<b>${ally.name}</b> está en peligro y bebe ${tpl.name} de la mochila. Recupera ${ally.hp-before} de vida.`);
      combat.lastAction = {label:tpl.name, effects:[{targetKind:'ally', key:ally.id, amount:ally.hp-before, kind:'heal'}]};
      return true;
    }
  }

  if(ally.statuses.length > 0){
    const antidoto = findUsablePotion('antidoto');
    if(antidoto){
      ally.statuses.length = 0;
      consumeInventoryPotion(antidoto);
      log(`<b>${ally.name}</b> bebe un Antídoto de la mochila. Sus efectos negativos desaparecen.`);
      combat.lastAction = {label:'Antídoto', effects:[]};
      return true;
    }
  }

  if(hpPct <= ALLY_SELF_PRESERVE_HP_PCT && ally.pos==='frente'){
    ally.pos = 'retaguardia';
    log(`<b>${ally.name}</b> está en peligro y no le quedan pociones — se repliega a la Retaguardia.`);
    combat.lastAction = {label:'Se repliega', effects:[]};
    return true;
  }

  return false;
}

// Velocidad de combate: antes todo el turno (aliados + enemigos) se
// resolvía de golpe y solo se pintaba el resultado final, así que no se
// llegaba a apreciar que los aliados/enemigos estuvieran "jugando" - pedido
// explícito de bajar el ritmo por defecto (x1) a algo perceptible, dejando
// x2 (el comportamiento de siempre, sin pausas) como opción del jugador.
// Se guarda en localStorage, no en el personaje - es una preferencia de
// pantalla, no de progreso.
function sleep(ms){ return new Promise(resolve=> setTimeout(resolve, ms)); }
// Red de seguridad para playBattleAnim() (bug real 2026-09-27, "el combate
// no se acaba si estás en Retaguardia, sobre todo con Mago"): esa animación
// se resuelve con requestAnimationFrame (battleStage.js), y los navegadores
// PAUSAN rAF por completo mientras la pestaña/ventana no está visible (p.ej.
// el jugador cambia de pestaña o de app un instante justo al rematar al
// último enemigo). Como endPlayerTurn()/resolveAllyTurns()/processEnemyTurns()
// esperan esa animación con await antes de poder llamar a checkCombatEnd(),
// un rAF pausado dejaba el turno colgado indefinidamente - turnBusy seguía
// en true y el combate parecía "no terminar nunca" hasta que el jugador
// volvía a la pestaña (rAF se reanuda solo) y por fin se procesaba el golpe
// que ya había matado al último enemigo. No es específico de Retaguardia ni
// de Mago - pasa con cualquier golpe animado en cualquier clase - pero
// coincide más seguido con Mago porque sus habilidades a distancia son las
// que más gente deja correr con la pestaña en segundo plano. La animación en
// sí es solo cosmética: nunca debe poder bloquear el avance real del turno
// por más de este tope.
const ANIM_TIMEOUT_MS = 1500;
function withAnimTimeout(promise){ return Promise.race([promise, sleep(ANIM_TIMEOUT_MS)]); }
const COMBAT_SPEED_DELAY_MS = {1: 650, 2: 0};
function getCombatSpeed(){
  if(simMode) return 2;
  try{
    const v = parseInt(localStorage.getItem('dsCombatSpeed'), 10);
    return (v===1 || v===2) ? v : 1;
  }catch(e){ return 1; }
}
function setCombatSpeed(speed){
  try{ localStorage.setItem('dsCombatSpeed', String(speed)); }catch(e){}
}
// Apuntado ON (manual, por defecto) = el jugador elige el objetivo con click
// tal como ya funciona hoy (ver playerFrontTargetIndices/useSkillFromMenu/
// onTarget). Apuntado OFF = vuelve al comportamiento automático de antes:
// cada ataque/habilidad se resuelve solo, sin pedir click — 'front' cae en
// el primer objetivo elegible de siempre (frente si vive, si no cualquiera
// vivo) y 'any' apunta automáticamente al enemigo con menos vida (mismo
// criterio que ya usa la IA de aliados a distancia, ver allyTargetEnemyIndex).
// Pedido explícito 2026-09-26, junto al toggle de velocidad x1/x2.
function getManualAim(){
  try{ return localStorage.getItem('dsManualAim') !== '0'; }catch(e){ return true; }
}
function setManualAim(on){
  try{ localStorage.setItem('dsManualAim', on ? '1' : '0'); }catch(e){}
}
function autoPickEnemyIndex(){
  const living = livingEnemies();
  if(!living.length) return -1;
  const weakest = living.reduce((a,b)=> b.hp<a.hp ? b : a);
  return combat.enemies.indexOf(weakest);
}

// Atajos de teclado en combate (pedido explícito 2026-09-26), configurables
// desde ⚙️ Opciones (ver renderOptions). Cada acción trae 2 teclas por
// defecto (ej. Habilidad 1 = Q o 1); al reasignarla a mano queda en una sola
// tecla (más simple de reasignar que mantener listas de 2).
const KEYBIND_ACTIONS = [
  {id:'basico', label:'Ataque básico', default:['f']},
  {id:'habilidades', label:'Abrir/cerrar Habilidades', default:['h']},
  {id:'skill1', label:'Habilidad 1', default:['q','1']},
  {id:'skill2', label:'Habilidad 2', default:['w','2']},
  {id:'skill3', label:'Habilidad 3', default:['e','3']},
  {id:'ultimate', label:'Ultimate (nivel 60+)', default:['r','4']},
];
function getKeybinds(){
  let saved = {};
  try{ saved = JSON.parse(localStorage.getItem('dsKeybinds')||'{}'); }catch(e){ saved = {}; }
  const out = {};
  KEYBIND_ACTIONS.forEach(a=>{ out[a.id] = Array.isArray(saved[a.id]) && saved[a.id].length ? saved[a.id] : a.default; });
  return out;
}
function setKeybind(actionId, key){
  const binds = {};
  KEYBIND_ACTIONS.forEach(a=>{ binds[a.id] = getKeybinds()[a.id]; });
  binds[actionId] = [key.toLowerCase()];
  try{ localStorage.setItem('dsKeybinds', JSON.stringify(binds)); }catch(e){}
}
function resetKeybinds(){
  try{ localStorage.removeItem('dsKeybinds'); }catch(e){}
}
// Un solo listener global (no uno por render de renderCombat) — lee el
// estado vigente de combat/style/keybinds en el momento de la tecla, igual
// que ya hace el click del canvas con combat.pendingSkill.
document.addEventListener('keydown', (e)=>{
  if(e.ctrlKey || e.metaKey || e.altKey) return;
  const activeTag = document.activeElement && document.activeElement.tagName;
  if(activeTag==='INPUT' || activeTag==='TEXTAREA') return;
  if(!combat || !combat.active || combat.over || combat.turnBusy) return;
  const key = e.key.toLowerCase();
  const binds = getKeybinds();
  const matches = (actionId)=> binds[actionId].includes(key);
  if(matches('basico')){
    e.preventDefault(); useSkillFromMenu('ataque_basico');
  } else if(matches('habilidades')){
    e.preventDefault();
    combat.openSubmenu = combat.openSubmenu==='habilidades' ? null : 'habilidades';
    renderCombat();
  } else if(matches('skill1')){
    e.preventDefault(); useSkillFromMenu(style().skills[0]);
  } else if(matches('skill2')){
    e.preventDefault(); useSkillFromMenu(style().skills[1]);
  } else if(matches('skill3')){
    e.preventDefault(); useSkillFromMenu(style().skills[2]);
  } else if(matches('ultimate')){
    e.preventDefault();
    if(state.char.level < LEVEL_60_MILESTONE){ log('Tu Ultimate se desbloquea en el nivel 60.'); return; }
    useSkillFromMenu(ULTIMATE_BY_STYLE[state.char.style]);
  }
});

async function resolveAllyTurns(){
  // myCombat ancla esta llamada al combate que la disparó: a velocidad x1
  // cada aliado espera stepDelay (ver playBattleAnim) antes del siguiente,
  // y si el combate termina y ya arrancó uno nuevo mientras ese await seguía
  // pendiente, "combat" (variable mutable de módulo) ya apunta al combate
  // NUEVO — sin este candado, los aliados que le faltaba actuar le seguían
  // pegando en silencio al primer enemigo del combate siguiente (sin log
  // propio de la acción, con el menú ya libre porque turnBusy es del combate
  // viejo): el bug reportado de "ataco una vez y ya puedo atacar de nuevo,
  // nadie más se mueve" — en realidad sí se movían, pero en la pelea de al lado.
  const myCombat = combat;
  const stepDelay = COMBAT_SPEED_DELAY_MS[getCombatSpeed()] || 0;
  for(const ally of livingAllies()){
    if(combat !== myCombat) return;
    combat.lastActor = {kind:'ally', id: ally.id};
    combat.lastAction = null;
    resolveOneAllyTurn(ally);
    if(!combat || combat.over) break;
    if(stepDelay>0){ renderCombat(); await withAnimTimeout(playBattleAnim(combat.lastActor, combat.lastAction)); combat.lastActor = null; combat.lastAction = null; }
    if(combat !== myCombat) return;
  }
}

function resolveOneAllyTurn(ally){
    if(!combat || combat.over || ally.hp<=0) return;
    if(ally.skillCooldown===undefined) ally.skillCooldown = 0;
    ally.skillCooldown = Math.max(0, ally.skillCooldown-1);

    const miedo = hasStatus(ally.statuses,'Miedo');
    if(miedo && chance(miedo.procChance||0.4)){
      log(`<b>${ally.name}</b> está paralizado de miedo y pierde su turno.`);
      combat.lastAction = {label:'Paralizado de miedo', effects:[]};
      return;
    }

    const confusion = hasStatus(ally.statuses,'Confusion');
    if(confusion && chance(confusion.procChance||0.35)){
      const otherAllies = livingAllies().filter(a=>a!==ally);
      const hitPlayer = chance(1/(otherAllies.length+1));
      const dmg = Math.max(1, Math.round(ally.atk));
      if(hitPlayer){
        // No cuenta como hostil: fue la Confusión, no el aliado por su
        // cuenta — un accidente no es traición. "Hostil" queda reservado
        // para cuando el aliado te ataque sin un efecto de estado de por medio.
        log(`<b>${ally.name}</b> está confundido y te golpea a ti por error.`);
        dealDamageToPlayer(dmg);
        combat.lastAction = {label:'Confundido', effects:[{targetKind:'player', amount:dmg, kind:'dmg'}]};
      } else {
        const victim = pick(otherAllies);
        log(`<b>${ally.name}</b> está confundido y golpea a <b>${victim.name}</b> por error.`);
        dealDamageToAlly(victim, dmg);
        combat.lastAction = {label:'Confundido', effects:[{targetKind:'ally', key:victim.id, amount:dmg, kind:'dmg'}]};
      }
      return;
    }

    if(allyMaybeSelfPreserve(ally)) return;

    // Brann el Bastión (Muralla Viviente, pedido explícito 2026-09-26): a
    // diferencia del resto de guerreros, su habilidad es puramente
    // defensiva — no ataca ese turno. Mismo pool/costo que cualquier otro
    // guerrero (MP, ALLY_SKILL_COST), mismo cooldown de 3 turnos.
    if(ally.templateId==='brann' && ally.skillCooldown<=0 && ally.mp>=ALLY_SKILL_COST){
      ally.skillCooldown = ALLY_SKILL_COOLDOWN;
      ally.mp -= ALLY_SKILL_COST;
      const heal = Math.round(ally.maxHP*0.10);
      const before = ally.hp;
      ally.hp = Math.min(ally.maxHP, ally.hp+heal);
      const existing = hasStatus(ally.statuses,'Bastión');
      if(existing) existing.duration = 3; else ally.statuses.push({name:'Bastión', duration:3, incomingDmgReduction:0.20});
      log(`<b>${ally.name}</b> alza una Muralla Viviente: recupera ${ally.hp-before} de vida y reduce el daño que recibe un 20% durante 3 turnos.`);
      combat.lastAction = {label:'Muralla Viviente', effects:[{targetKind:'ally', key:ally.id, amount:ally.hp-before, kind:'heal'}]};
      return;
    }

    if(ally.role==='sacerdote' && ally.templateId==='seraphina'){
      // Égida Sagrada (pedido explícito 2026-09-26, ajustado 2026-09-27): los
      // sacerdotes NO usan cooldown de turnos — se dispara todos los turnos
      // que tenga espíritu, igual que Delyth. En su lugar, el escudo tiene su
      // propio candado natural: no se puede volver a colocar sobre alguien
      // que todavía tiene un escudo activo (de cualquier fuente, no solo el
      // suyo) — así nunca desperdicia el turno sobre quien ya está cubierto,
      // y prioriza al más débil ENTRE los que de verdad lo necesitan. El
      // debilitamiento al enemigo del frente no depende de esto: se repite
      // cada turno igual (Debilitado no se acumula, solo refresca duración).
      const hasSpirit = ally.spirit>=ALLY_SKILL_COST;
      if(hasSpirit){
        const shieldable = livingAllies().filter(a=>a!==ally && !(a.shield>0));
        const weakest = shieldable.length ? shieldable.sort((a,b)=>(a.hp/a.maxHP)-(b.hp/b.maxHP))[0] : null;
        const fiDebuff = frontEnemyIndex();
        if(weakest || fiDebuff>=0){
          ally.spirit -= ALLY_SKILL_COST;
          if(weakest){
            const shieldAmt = Math.round(weakest.maxHP*0.20*allyShieldMult(ally));
            grantShield(false, weakest, shieldAmt);
            allyOnShieldPlaced(ally, false, weakest);
            const existing = hasStatus(weakest.statuses,'Égida');
            if(existing) existing.duration = 3; else weakest.statuses.push({name:'Égida', duration:3, incomingDmgReduction:0.10});
            log(`<b>${ally.name}</b> protege a <b>${weakest.name}</b> con un escudo de ${shieldAmt} y -10% de daño recibido durante 3 turnos.`);
          }
          if(fiDebuff>=0){
            const target = combat.enemies[fiDebuff];
            applyStatus(target, {name:'Debilitado', duration:2}, false);
            log(`<b>${ally.name}</b> debilita a ${target.name}: -15% de su daño durante 2 turnos.`);
          }
          combat.lastAction = {label:'Égida Sagrada', effects:[]};
          return;
        }
      }
    } else if(ally.role==='sacerdote'){
      if(ally.penitenciaCd>0) ally.penitenciaCd--;
      const d = derived();
      const playerPct = state.char.curHP / d.maxHP;
      const others = livingAllies().filter(a=>a!==ally);
      const mostInjured = others.sort((a,b)=>(a.hp/a.maxHP)-(b.hp/b.maxHP))[0];
      const allyPct = mostInjured ? mostInjured.hp/mostInjured.maxHP : 1;
      const hasSpirit = ally.spirit>=ALLY_SKILL_COST;
      // Tomo sagrado: aumento de curación plano sobre el % base de Bendición.
      const healBonus = 1 + (ally.specials||[]).filter(sp=>sp.type==='aumento_curacion').reduce((s,sp)=>s+sp.value,0);
      // Tomo sagrado épico: el aliado curado recibe +daño 2 turnos (reusa Inspirado).
      const healDmgBuff = (ally.specials||[]).find(sp=>sp.type==='dano_aliado_curado');
      // Tomo sagrado Tier S: escudo si cura a alguien por debajo del 40% de vida.
      const healShieldSp = (ally.specials||[]).find(sp=>sp.type==='escudo_en_curacion');
      if(playerPct < 0.5 && playerPct <= allyPct && hasSpirit){
        ally.spirit -= ALLY_SKILL_COST;
        const heal = Math.round(d.maxHP*0.15*healBonus*graciaHealMult(ally.specials, ally)*healMultiplierFor(combat.playerStatuses));
        const before = state.char.curHP;
        state.char.curHP = Math.min(d.maxHP, state.char.curHP+heal);
        log(`<b>${ally.name}</b> te cura ${state.char.curHP-before} de vida.`);
        graciaAfterHeal(ally.specials, ally, ally.name, amt=>{ ally.spirit = Math.min(ally.maxSpirit, ally.spirit+amt); }, {isPlayer:true, ally:null, maxHP:d.maxHP});
        if(healDmgBuff){
          const existing = hasStatus(combat.playerStatuses,'Inspirado');
          if(existing) existing.duration = 2; else combat.playerStatuses.push({name:'Inspirado', duration:2, dmgMult:1+healDmgBuff.value});
        }
        if(healShieldSp && playerPct<0.4 && chance(healShieldSp.chance)){
          const shieldAmt = Math.round(d.maxHP*healShieldSp.shieldPct*allyShieldMult(ally));
          grantShield(true, null, shieldAmt);
          allyOnShieldPlaced(ally, true, null);
          log(`<b>${ally.name}</b> te protege con un escudo de ${shieldAmt}.`);
        }
        allyOnHealPenitencia(ally, playerPct);
        combat.lastAction = {label:'Bendición curativa', effects:[{targetKind:'player', amount:state.char.curHP-before, kind:'heal'}]};
        return;
      }
      if(mostInjured && allyPct < 0.5 && hasSpirit){
        ally.spirit -= ALLY_SKILL_COST;
        const heal = Math.round(mostInjured.maxHP*0.15*healBonus*graciaHealMult(ally.specials, ally)*healMultiplierFor(mostInjured.statuses));
        const before = mostInjured.hp;
        mostInjured.hp = Math.min(mostInjured.maxHP, mostInjured.hp+heal);
        log(`<b>${ally.name}</b> cura a <b>${mostInjured.name}</b> ${mostInjured.hp-before} de vida.`);
        graciaAfterHeal(ally.specials, ally, ally.name, amt=>{ ally.spirit = Math.min(ally.maxSpirit, ally.spirit+amt); }, {isPlayer:false, ally:mostInjured, maxHP:mostInjured.maxHP});
        if(healDmgBuff){
          const existing = hasStatus(mostInjured.statuses,'Inspirado');
          if(existing) existing.duration = 2; else mostInjured.statuses.push({name:'Inspirado', duration:2, dmgMult:1+healDmgBuff.value});
        }
        if(healShieldSp && allyPct<0.4 && chance(healShieldSp.chance)){
          const shieldAmt = Math.round(mostInjured.maxHP*healShieldSp.shieldPct*allyShieldMult(ally));
          grantShield(false, mostInjured, shieldAmt);
          allyOnShieldPlaced(ally, false, mostInjured);
          log(`<b>${ally.name}</b> protege a <b>${mostInjured.name}</b> con un escudo de ${shieldAmt}.`);
        }
        allyOnHealPenitencia(ally, allyPct);
        combat.lastAction = {label:'Bendición curativa', effects:[{targetKind:'ally', key:mostInjured.id, amount:mostInjured.hp-before, kind:'heal'}]};
        return;
      }
      // Nadie necesita curación (o no le queda espíritu para curar): Bendición
      // Sagrada — baja todas las resistencias del enemigo del frente, para
      // que tanto tus golpes como los del resto del equipo rindan más contra
      // objetivos muy resistentes (el hueco que Riakis necesita para caer).
      // Sin cooldown (pedido explícito 2026-09-27, los sacerdotes no usan
      // enfriamiento): se repite cada turno que le sobre espíritu y nadie
      // necesite curarse — Bendecido no se acumula, solo refresca duración.
      if(hasSpirit){
        const fiBless = frontEnemyIndex();
        if(fiBless>=0){
          const target = combat.enemies[fiBless];
          ally.spirit -= ALLY_SKILL_COST;
          // Grimorio de plegarias: duración base 2, Poco Común+ la sube a 3,
          // Tier S (legendario) trae su propio duration:4 explícito.
          const grimorioDurSp = (ally.specials||[]).filter(sp=>sp.type==='bendecido_dur').sort((a,b)=>(b.duration||3)-(a.duration||3))[0];
          const grimorioDebuff = (ally.specials||[]).find(sp=>sp.type==='dano_recibido_debuff');
          const blessDef = {name:'Bendecido', duration: grimorioDurSp ? (grimorioDurSp.duration||3) : 2};
          if(grimorioDebuff) blessDef.incomingDmgMult = 1+grimorioDebuff.value;
          applyStatus(target, blessDef, false);
          // Grimorio de plegarias Tier S ('grimorio_s'): al bendecir a un
          // enemigo, el propio aliado se envuelve en "Bendición" — el
          // contrario de "Bendecido" (ese debilita al enemigo; este
          // fortalece a quien lo lanza) — 4 turnos, 1 vez por combate.
          const selfBuffSp = (ally.specials||[]).find(sp=>sp.type==='bendicion_propia');
          if(selfBuffSp && fireTierSBuff(selfBuffSp.tierSProc, false, ally, {name:'Bendición', resBonus:selfBuffSp.resBonus, incomingDmgReduction:selfBuffSp.dmgReduction})){
            log(`<b>${ally.name}</b> se envuelve en su propia Bendición: +${selfBuffSp.resBonus}% de resistencias y -${Math.round(selfBuffSp.dmgReduction*100)}% de daño recibido durante 4 turnos.`);
          }
          log(`<b>${ally.name}</b> pronuncia una Bendición Sagrada sobre ${target.name}: sus resistencias caen.`);
          combat.lastAction = {label:'Bendición Sagrada', effects:[]};
          return;
        }
      }
    }
    const fi = allyTargetEnemyIndex(ally);
    if(fi<0) return;
    const enemyTarget = combat.enemies[fi];

    const ceguera = hasStatus(ally.statuses,'Ceguera');
    if(ceguera && chance(ceguera.procChance||0.32)){
      log(`<b>${ally.name}</b> falla su golpe por la Ceguera.`);
      combat.lastAction = {label:'Ceguera (falla)', effects:[]};
      return;
    }
    // Esquivar del enemigo: los aliados no tienen Precisión propia todavía
    // (el equipo general de un aliado no aporta ese stat), así que aquí se
    // tira contra la evasión cruda del objetivo, sin contrarresto.
    if(chance((enemyTarget.evasion||0) + enemyStatusEvasionBonus(enemyTarget.statuses))){
      log(`${enemyTarget.name} esquiva el golpe de <b>${ally.name}</b>.`);
      combat.lastAction = {label:'¡Esquivado!', effects:[]};
      return;
    }

    let dmg = ally.atk;
    if(hasStatus(ally.statuses,'Debilitado')) dmg *= 0.85;
    const inspirado = hasStatus(ally.statuses,'Inspirado');
    if(inspirado) dmg *= (inspirado.dmgMult||1);
    // Furioso: Grito de guerra del jugador NO llega a los aliados, pero
    // Furia Contenida engarzada en el propio aliado sí lo usa (ver
    // checkAllyFuriaContenidaTrigger) — mismo nombre de estado que el del
    // jugador, mismo campo dmgMult.
    const allyFurioso = hasStatus(ally.statuses,'Furioso');
    if(allyFurioso) dmg *= (allyFurioso.dmgMult||1);
    dmg *= statusStackDealtMult((ally.statuses||[]).filter(st=> st!==allyFurioso));
    (ally.specials||[]).forEach(sp=>{ if(sp.type==='aumento_dano') dmg *= (1+sp.value); });
    const blessedDebuff = hasStatus(enemyTarget.statuses,'Bendecido');
    if(blessedDebuff && blessedDebuff.incomingDmgMult) dmg *= blessedDebuff.incomingDmgMult;
    // Bug corregido 2026-10-02: estos tres solo se aplicaban a los golpes del
    // JUGADOR — contra los aliados, los autobuffs defensivos del enemigo
    // (Caparazón, Seda Protectora...) no reducían nada, y Marcado/Parálisis
    // no daban el daño extra que prometen ("recibe +20% de TODO el daño").
    if(hasStatus(enemyTarget.statuses,'Marcado')) dmg *= 1.2;
    (enemyTarget.statuses||[]).forEach(st=>{ if(st.incomingDmgReduction) dmg *= (1 - st.incomingDmgReduction); });
    dmg *= enemyPassiveTakenMult(enemyTarget);
    if(hasStatus(enemyTarget.statuses,'Paralisis')) dmg *= 1.25;
    let resKey = 'fisico';
    let skillText = null;
    let skillName = null;

    // stunProc/postHitEffects: efectos de la habilidad que no son el golpe en
    // sí (aturdir, Sangrado, Ralentizado, buff de equipo) — se resuelven
    // DESPUÉS de aplicar el daño, más abajo, para no interferir con el
    // cálculo de dmg de arriba.
    let stunProc = 0;
    let postHitEffects = null;
    if(ally.skillCooldown<=0 && ally.role!=='sacerdote' && ally[ALLY_SKILL_POOL[ally.role]]>=ALLY_SKILL_COST){
      ally.skillCooldown = ALLY_SKILL_COOLDOWN;
      ally[ALLY_SKILL_POOL[ally.role]] -= ALLY_SKILL_COST;
      if(ally.templateId==='aldric'){ dmg *= 1.6; stunProc = 0.12; skillText = 'descarga un Golpe Pesado sobre'; skillName = 'Golpe Pesado'; }
      else if(ally.templateId==='neira'){ dmg *= 1.0; skillText = 'clava un Disparo Certero (ignora parte de la resistencia) en'; skillName = 'Disparo Certero'; }
      else if(ally.templateId==='lyra'){
        dmg *= 1.0;
        skillText = 'dispara al mando de la retaguardia contra';
        skillName = 'Mando de Retaguardia';
        // Ella + el resto de aliados de retaguardia (no el jugador, no el
        // frente): +10% de daño 3 turnos — mismo status 'Inspirado' que ya
        // usa el resto del juego para "+% de daño temporal".
        postHitEffects = ()=>{
          const buffed = livingAllies().filter(a=>a.pos==='retaguardia');
          buffed.forEach(a=>{
            const existing = hasStatus(a.statuses,'Inspirado');
            if(existing) existing.duration = 3; else a.statuses.push({name:'Inspirado', duration:3, dmgMult:1.10});
          });
          log(`<b>${ally.name}</b> da la orden: la retaguardia recibe +10% de daño durante 3 turnos.`);
        };
      }
      else if(ally.templateId==='vex'){
        const missingPct = 1 - (enemyTarget.hp/enemyTarget.maxHP);
        dmg *= 1 + missingPct*0.6;
        skillText = 'aprovecha un Golpe Sombrío contra';
        skillName = 'Golpe Sombrío';
      }
      else if(ally.templateId==='kael'){
        skillText = 'abre un Tajo Sangriento en';
        skillName = 'Tajo Sangriento';
        postHitEffects = ()=>{
          applyStatus(enemyTarget, {name:'Sangrado', duration:3, stack:true, maxStack:3}, false);
          if(chance(0.30)) applyStatus(enemyTarget, {name:'Sangrado', duration:3, stack:true, maxStack:3}, false);
        };
      }
      else if(ally.templateId==='fennwick'){ resKey = 'fuego'; dmg *= 1.15; skillText = 'lanza una Bola de Fuego a'; skillName = 'Bola de Fuego'; }
      else if(ally.templateId==='eira'){
        resKey = 'hielo'; dmg *= 1.15;
        skillText = 'exhala un Aliento Glacial sobre';
        skillName = 'Aliento Glacial';
        postHitEffects = ()=>{ if(chance(0.25)) applyStatus(enemyTarget, {name:'Ralentizado', duration:2}, false); };
      }
    }

    let resVal = ally.templateId==='neira' && skillText ? effectiveEnemyRes(enemyTarget, resKey)*0.6 : effectiveEnemyRes(enemyTarget, resKey);
    (ally.specials||[]).forEach(sp=>{
      if(sp.type==='penetracion_armadura' && resKey==='fisico') resVal -= sp.value*100;
      if(sp.type==='penetracion_magica' && resKey!=='fisico') resVal -= sp.value*100;
    });
    // Mismo trato de brecha de nivel que el jugador — un aliado usa el
    // nivel DE SU DUEÑO como referencia, no tiene el suyo propio para esto.
    dmg = Math.max(1, Math.round(dmg*(1-resVal/100)*levelDiffDamageMult(state.char.level, monsterEffectiveLevel())));
    enemyTarget.hp = Math.max(0, enemyTarget.hp - dmg);
    log(skillText
      ? `<b>${ally.name}</b> ${skillText} ${enemyTarget.name}: ${dmg} de daño.`
      : `<b>${ally.name}</b> ataca a ${enemyTarget.name}: ${dmg} de daño.`);
    if(enemyTarget.tpl && enemyTarget.tpl.reflectPct){
      const reflected = Math.max(1, Math.round(dmg*enemyTarget.tpl.reflectPct));
      dealDamageToAlly(ally, reflected);
      log(`${enemyTarget.name} refleja ${reflected} de daño de vuelta a <b>${ally.name}</b>.`);
    }
    applyAllySpecials(ally, enemyTarget, dmg, !!skillText);
    // Golpe Pesado de Aldric (pedido explícito 2026-09-26): 12% de
    // probabilidad de aturdir al golpear, además del +60% de daño de siempre.
    if(stunProc>0 && enemyTarget.hp>0 && chance(stunProc)){
      applyStatus(enemyTarget, {name:'Aturdido', duration:1}, false);
      log(`<b>${ally.name}</b> deja aturdido a ${enemyTarget.name}.`);
    }
    if(postHitEffects && enemyTarget.hp>0) postHitEffects();
    combat.lastAction = {label: skillName || 'Ataque', effects:[{targetKind:'enemy', key:fi, amount:dmg, kind:'dmg'}]};
}

// Equivalente de applyEquippedSpecials() para aliados — mismos tipos de
// special, pero curando ally.hp en vez de state.char.curHP. Los mecanismos
// que solo tienen sentido para el jugador (esp_refund, doble_encantamiento,
// segundo ataque básico) no están acá: los aliados no tienen un kit de
// habilidades propio con costo variable, así que no aplican.
// isSkill: el golpe fue la habilidad del aliado (no su ataque básico) —
// misma regla de procs que el jugador (ver applyEquippedSpecials), con la
// excepción del Asesino solo para Sangrado (Robo de vida: siempre solo básico).
function applyAllySpecials(ally, target, dmgDealt, isSkill){
  const procOnThisHit = !isSkill || ally.role==='asesino';
  (ally.specials||[]).forEach(sp=>{
    if(sp.type==='sangrado' && !procOnThisHit) return;
    if(sp.type==='robovida' && isSkill) return;
    if(sp.type==='succion_hechizo' && !isSkill) return;
    if(sp.type==='retroceso'){
      if(chance(sp.chance)){
        applyStatus(target, {name:'Aturdido', duration:1}, false);
        log(`<b>${ally.name}</b> aplica Retroceso a ${target.name}.`);
      }
    } else if(sp.type==='aturdir_retardado'){
      if(chance(sp.chance)){
        target.pendingStun = true;
        log(`<b>${ally.name}</b> deja tambaleando a ${target.name} — quedará aturdido su próximo turno.`);
      }
    } else if(sp.type==='sangrado'){
      if(chance(sp.chance)){
        applyStatus(target, {name:'Sangrado', duration:2, stack:true, maxStack:3}, false);
        log(`<b>${ally.name}</b> abre una herida en ${target.name}, que empieza a sangrar.`);
      }
    } else if(sp.type==='silencio'){
      if(chance(sp.chance)){
        applyStatus(target, {name:'Silencio', duration:1}, false);
        log(`<b>${ally.name}</b> silencia a ${target.name}.`);
      }
    } else if(sp.type==='robovida' || sp.type==='succion_hechizo'){
      const heal = Math.max(1, Math.round(dmgDealt*sp.percent));
      const before = ally.hp;
      ally.hp = Math.min(ally.maxHP, ally.hp+heal);
      if(ally.hp>before) log(`<b>${ally.name}</b> recupera ${ally.hp-before} de vida.`);
    }
  });
}

// Daño por turno y por carga de los estados que tu grupo pone a un enemigo,
// como fracción del daño base (antes 0.08 y 0.06).
const DOT_ENEMY = { Sangrado: 0.18, Veneno: 0.13 };
function tickStatuses(list, ownerName, target){
  // target = the enemy object being ticked, or null/undefined for the player.
  // Applies damage-over-time and reports whether the owner is stunned this turn.
  // Does NOT decrement durations — that happens exactly once, centrally, at the
  // end of processEnemyTurns (previously this also decremented AND a second
  // block decremented again, so every status lost 2 turns of duration per cycle).
  let skip = false;
  // Sangrado y Veneno puestos por tu grupo sobre un ENEMIGO pegan casi el
  // doble desde 2026-10-07 (pedido explícito: estaban muy por debajo del
  // resto; con 3 cargas apenas igualaban una Quemadura). Los que sufren tú y
  // tus aliados no cambian: los jefes están calibrados con esos números.
  const onEnemy = !!(target && combat.enemies.includes(target));
  list.forEach(st=>{
    if(st.name==='Sangrado'){
      // Pedido explícito 2026-10-01: Sangrado escala con Físico (no con el
      // stat de escalado de la senda) — así una herida sangrante pesa igual
      // sin importar quién la tenga, en vez de seguir el daño mágico de un
      // Mago/Hechicero.
      const dmg = Math.max(1, Math.round(baseDamageFromStat(derived().fis)*(onEnemy ? DOT_ENEMY.Sangrado : 0.08)*(st.stacks||1)));
      if(target){ target.hp = Math.max(0, target.hp-dmg); log(`${ownerName} sangra por ${dmg}.`); }
      else { dealDamageToPlayer(dmg); log(`Sangras por ${dmg}.`); }
    }
    if(st.name==='Veneno'){
      // Pedido explícito 2026-10-01: Veneno escala con Habilidad, mismo
      // criterio que Sangrado/Físico de arriba.
      const dmg = Math.max(1, Math.round(baseDamageFromStat(derived().hab)*(onEnemy ? DOT_ENEMY.Veneno : 0.06)*(st.stacks||1)));
      if(target){ target.hp = Math.max(0, target.hp-dmg); log(`${ownerName} sufre el veneno por ${dmg}.`); }
      else { dealDamageToPlayer(dmg); log(`El veneno te quita ${dmg} de vida.`); }
    }
    if(st.name==='Quemadura'){
      const dmg = Math.max(1, Math.round(skillBaseDamage()*0.22));
      if(target){ target.hp = Math.max(0, target.hp-dmg); log(`${ownerName} arde por ${dmg}.`); }
      else { dealDamageToPlayer(dmg); log(`Ardes por ${dmg}.`); }
    }
    if(st.name==='Aturdido') skip = true;
  });
  return skip;
}

function decrementStatuses(list){
  for(let i=list.length-1;i>=0;i--){
    list[i].duration -= 1;
    if(list[i].duration<=0) list.splice(i,1);
  }
}

async function processEnemyTurns(){
  // myCombat: mismo candado que resolveAllyTurns (ver ese comentario) — sin
  // esto, un enemigo que todavía no le tocaba actuar (esperando stepDelay a
  // velocidad x1) le pegaba en silencio al jugador/aliados del combate
  // siguiente si el combate viejo terminaba mientras ese await seguía pendiente.
  const myCombat = combat;
  combat.playerDefending = false;

  // apply DOT and determine stun per enemy (does not decrement durations yet)
  const stunFlags = new Map();
  combat.enemies.forEach(enemy=>{
    if(enemy.hp<=0) return;
    stunFlags.set(enemy, tickStatuses(enemy.statuses, enemy.name, enemy));
  });
  // Regeneración de enemigos: estados con regenPct (ej. Lluvia de Storm Gush)
  // y aura de la Sacerdotisa de las Mareas (auraRegenPct, a todo su grupo).
  const auraRegen = combat.enemies.filter(e=>e.hp>0 && e.tpl && e.tpl.auraRegenPct).reduce((m,e)=>Math.max(m, e.tpl.auraRegenPct), 0);
  combat.enemies.forEach(enemy=>{
    if(enemy.hp<=0 || enemy.hp>=enemy.maxHP || (enemy.tpl && enemy.tpl.decoy)) return;
    const pct = (enemy.statuses||[]).reduce((sum,st)=>sum+(st.regenPct||0), 0) + auraRegen;
    if(pct>0){
      const before = enemy.hp;
      enemy.hp = Math.min(enemy.maxHP, enemy.hp + Math.max(1, Math.round(enemy.maxHP*pct)));
      if(enemy.hp>before) log(`${enemy.name} se regenera ${enemy.hp-before} de vida.`);
    }
  });

  checkCombatEnd();
  if(!combat || combat.over) return;

  const stepDelay = COMBAT_SPEED_DELAY_MS[getCombatSpeed()] || 0;
  for(const enemy of livingEnemies()){
    if(!combat || combat.over || combat!==myCombat) break;
    if(enemy.hp<=0) continue;
    combat.lastActor = {kind:'enemy', idx: combat.enemies.indexOf(enemy)};
    combat.lastAction = null;
    if(enemy.tpl && enemy.tpl.decoy) continue; // los señuelos no actúan
    if(stunFlags.get(enemy)){ log(`${enemy.name} está aturdido y pierde su turno.`); combat.lastAction = {label:'Aturdido', effects:[]}; }
    else enemyAct(enemy);
    if(stepDelay>0){ renderCombat(); await withAnimTimeout(playBattleAnim(combat.lastActor, combat.lastAction)); combat.lastActor = null; combat.lastAction = null; }
    if(combat !== myCombat) return;
  }
  if(!combat || combat.over || combat!==myCombat) return;

  // decrement every status exactly once per turn cycle (enemies + player + aliados)
  // (player DOT — Sangrado/Quemadura — needs to actually tick before we decrement it away;
  // this call was missing entirely before, so a player bitten by a spider never actually bled)
  tickStatuses(combat.playerStatuses, null, null);
  livingAllies().forEach(ally=> tickStatuses(ally.statuses, ally.name, ally));
  combat.enemies.forEach(enemy=> decrementStatuses(enemy.statuses));
  decrementStatuses(combat.playerStatuses);
  (combat.allies||[]).forEach(ally=> decrementStatuses(ally.statuses));

  // Regeneración de MP/Espíritu del jugador cada ciclo de turno — antes era
  // un flat +5 sin tocar ningún stat ("regeneración de mp, actualmente no
  // está creado, habrá que hacerlo" — en realidad sí existía, solo no
  // escalaba con nada; pedido explícito 2026-09-28 corregido acá: MP ahora
  // escala con Habilidad y Espíritu con Espíritu, cada recurso con su propia
  // fuente, igual que ya hacen sus respectivos máximos). Los aliados (v1,
  // sin stats propios todavía) se quedan con el flat +5 de siempre.
  const d = derived();
  const HAB_MP_REGEN_RATE = 0.08, ESP_SPI_REGEN_RATE = 0.08;
  state.char.curSta = Math.min(d.maxSta, state.char.curSta + Math.round(5 + d.hab*HAB_MP_REGEN_RATE));
  state.char.curSpi = Math.min(d.maxSpi, state.char.curSpi + Math.round(5 + d.esp*ESP_SPI_REGEN_RATE));
  livingAllies().forEach(a=>{
    a.mp = Math.min(a.maxMP, a.mp+5);
    a.spirit = Math.min(a.maxSpirit, a.spirit+5);
  });
  // Piedra de Vigor (2026-10-02): regeneración de vida por turno, jugador y
  // aliados (una sola piedra cuenta: la de mayor %). Desde A se duplica por
  // debajo del 50% de vida.
  const vigorRegen = (specials, hp, maxHP)=>{
    const sp = (specials||[]).filter(x=>x.type==='regen_vida').sort((a,b)=>b.pct-a.pct)[0];
    if(!sp || hp<=0) return 0;
    const pct = sp.pct * (sp.lowHpDouble && hp/maxHP < 0.5 ? 2 : 1);
    return Math.max(1, Math.round(maxHP*pct));
  };
  const playerRegen = vigorRegen(stoneSpecials('regen_vida'), state.char.curHP, d.maxHP);
  if(playerRegen>0 && state.char.curHP < d.maxHP){
    const before = state.char.curHP;
    state.char.curHP = Math.min(d.maxHP, state.char.curHP + playerRegen);
    log(`<b>Piedra de Vigor</b>: regeneras ${state.char.curHP-before} de vida.`);
  }
  livingAllies().forEach(a=>{
    const r = vigorRegen(a.specials, a.hp, a.maxHP);
    if(r>0 && a.hp < a.maxHP) a.hp = Math.min(a.maxHP, a.hp + r);
  });

  // Aturdir (retardado, ver applyEquippedSpecials): la bandera marcada este
  // ciclo recién se convierte en el estado Aturdido real acá, al final —
  // así stunFlags de ESTE ciclo (calculado arriba, al principio) nunca lo ve,
  // y sí lo verá el próximo ciclo. Es la diferencia con Retroceso, que aplica
  // Aturdido de inmediato y por eso sí afecta el ciclo en curso.
  combat.enemies.forEach(e=>{
    if(e.pendingStun){ applyStatus(e, {name:'Aturdido', duration:1}, false); e.pendingStun = false; }
  });

  checkCombatEnd();
  renderAll();
  save();
}

const SUMMON_TEMPLATE = {id:'criatura_menor', name:'Criatura menor invocada', icon:'👾', hp:0.3, atk:0.5, res:{fisico:0,fuego:0,hielo:0,veneno:0,aturdimiento:0}, moves:['pegar']};

// Nombres cortos para la burbuja de acción sobre la tarjeta del enemigo —
// el texto narrado de más arriba (`text`) es demasiado largo para eso.
const MOVE_LABELS = {robar:'Robo', morder:'Mordisco', picar:'Picadura', debilitar:'Debilitar', aplastar:'Golpe brutal', paralizar:'Parálisis', cegar:'Cegar', atemorizar:'Atemorizar', confundir:'Confundir', maldicion_venenosa:'Maldición venenosa', curar_aliado:'Cura a un aliado'};

function enemyAct(enemy){
  if(!enemy.cooldowns) enemy.cooldowns = {};
  Object.keys(enemy.cooldowns).forEach(k=> enemy.cooldowns[k] = Math.max(0, enemy.cooldowns[k]-1));

  // Miedo y Confusión en el ENEMIGO (pedido explícito 2026-09-28, kit del
  // Hechicero): mismo trato espejo que ya recibe el jugador con sus propios
  // Miedo/Confusión (ver playerUseSkill) — antes estos dos estados solo
  // afligían al jugador, nunca a un enemigo, así que aplicárselos a uno no
  // tenía ningún efecto real. Se tira ACÁ, antes de elegir objetivo/bifurcar
  // entre el sistema viejo y el nuevo de IA, para cubrir ambos por igual.
  const enemyMiedo = hasStatus(enemy.statuses,'Miedo');
  if(enemyMiedo && chance(enemyMiedo.procChance||0.4)){
    log(`${enemy.name} está paralizado por el Miedo y pierde su turno.`);
    combat.lastAction = {label:'Miedo (pierde turno)', effects:[]};
    return;
  }
  const enemyConfusion = hasStatus(enemy.statuses,'Confusion');
  if(enemyConfusion && chance(enemyConfusion.procChance||0.35)){
    log(`${enemy.name} ataca a ciegas por la Confusión y no golpea nada.`);
    combat.lastAction = {label:'Confusión (falla)', effects:[]};
    return;
  }

  const target = frontlineTarget();
  // La Precisión del enemigo contrarresta la evasión de quien lo recibe —
  // mismo criterio en espejo que ya usa el jugador contra la evasión de un
  // enemigo (ver d.precision en playerUseSkill), ahora también del otro
  // lado (pedido explícito 2026-09-28).
  const rawEvasion = target.kind==='ally' ? computeAllyEvasion(target.ally) : computeCritEvasion().evasion;
  const evasion = Math.max(0.02, rawEvasion - (enemy.precision||0));
  // Sistema nuevo: se elige la habilidad ANTES de la esquiva — las de
  // utilidad (fases de jefe, invocaciones, buffs, curas) no apuntan al
  // jugador, así que no se pueden esquivar ni bloquear (antes un personaje
  // muy evasivo impedía que los jefes activaran sus fases).
  let utilityMove = false;
  if(enemy.tpl && enemy.tpl.abilities){
    // Furias de fase (instant:true — Frenesí de la Matriarca, Furia del Ogro,
    // Caos Desatado, Furia de la Marea): se activan al cumplirse su condición
    // SIN gastar el turno. Antes el jefe "entraba en frenesí" y ese turno no
    // hacía nada más: desde fuera parecía que el estado no servía (2026-10-07).
    if(!enemy.usedOnce) enemy.usedOnce = new Set();
    const rageCtx = newStyleCtx(enemy, target);
    Object.entries(enemy.tpl.abilities).forEach(([id, ab])=>{
      if(!ab.instant || ab.utility!=='self_buff' || enemy.usedOnce.has(id) || (ab.condition && !ab.condition(rageCtx))) return;
      enemy.usedOnce.add(id);
      const ex = hasStatus(enemy.statuses, ab.selfBuff.name);
      if(ex) Object.assign(ex, ab.selfBuff); else enemy.statuses.push(Object.assign({}, ab.selfBuff));
      log(`<b>${enemy.name}</b> entra en <b>${ab.label}</b>: ${statusEffectText(ab.selfBuff)} ${ab.selfBuff.duration >= STATUS_PERMANENT_TURNS ? 'hasta el final del combate' : `durante ${ab.selfBuff.duration} turnos`}.`);
    });
    enemy.pendingAbilityId = pickNewStyleAbilityId(enemy, newStyleCtx(enemy, target));
    const ab = enemy.tpl.abilities[enemy.pendingAbilityId];
    utilityMove = !!(ab && ab.utility);
  }
  if(!utilityMove && chance(evasion)){
    delete enemy.pendingAbilityId;
    log(`${enemy.name} ataca a ${target.kind==='ally' ? target.ally.name : 'ti'}, ¡pero esquiva!`);
    // Celeridad A/S/SS: tras esquivar, el siguiente golpe propio es crítico.
    if(target.kind==='player'){
      const cel = stoneSpecials('celeridad_contraataque').sort((a,b)=>a.cooldown-b.cooldown)[0];
      if(cel && !combat.critNext && (combat.turnCount||0) >= (combat.celeridadReadyAt||0)){
        combat.critNext = true;
        combat.celeridadReadyAt = (combat.turnCount||0) + cel.cooldown;
        log('<b>Celeridad</b>: tu siguiente golpe será crítico.');
      }
    }
    combat.lastAction = {label:'¡Esquivado!', effects:[]};
    return;
  }
  // Bloqueo (Guerrero: Espadón pesado y Escudo de hierro): una segunda capa
  // de "el golpe no llega", igual de incondicional que la esquiva de arriba.
  const defenderSpecials = target.kind==='ally' ? (target.ally.specials||[]) : specialsFromEquip(state.char.equip);
  let bChance = blockChance(defenderSpecials);
  // Escudo de hierro Tier S ('defend_bloqueo_bonus'): +10% de bloqueo extra
  // mientras el jugador se está Defendiendo este turno.
  if(target.kind==='player' && combat.playerDefending){
    defenderSpecials.forEach(sp=>{ if(sp.type==='defend_bloqueo_bonus') bChance += sp.value; });
  }
  if(!utilityMove && bChance>0 && chance(bChance)){
    delete enemy.pendingAbilityId;
    log(`${enemy.name} ataca a ${target.kind==='ally' ? target.ally.name : 'ti'}, ¡pero el escudo bloquea el golpe por completo!`);
    combat.lastAction = {label:'¡Bloqueado!', effects:[]};
    // Espadón pesado Tier S ('espadon_s'): 30% de devolver el 50% del
    // ataque bruto del enemigo como daño (aproximación al "daño bloqueado":
    // el golpe se anuló entero, así que no hay un número de daño ya
    // calculado para devolver una fracción exacta de él).
    if(defenderSpecials.some(sp=>sp.tierSProc==='espadon_s') && chance(0.3)){
      const reflected = Math.max(1, Math.round(enemy.atk*0.5));
      enemy.hp = Math.max(0, enemy.hp-reflected);
      log(`El filo de tu Espadón devuelve ${reflected} de daño a ${enemy.name}.`);
    }
    // Escudo de la Vigilia (Paladín, 2026-10-02): curación al bloquear y,
    // en Tier S, guardia para el siguiente golpe tras el primer bloqueo.
    if(target.kind==='player'){
      const healPct = defenderSpecials.filter(sp=>sp.type==='cura_al_bloquear').reduce((sum,sp)=>sum+sp.pct,0);
      if(healPct>0){
        const d0 = derived();
        const before = state.char.curHP;
        state.char.curHP = Math.min(d0.maxHP, state.char.curHP + Math.round(d0.maxHP*healPct));
        if(state.char.curHP>before) log(`Tu escudo te devuelve ${state.char.curHP-before} de vida al bloquear.`);
      }
      const vig = defenderSpecials.find(sp=>sp.type==='vigilia_guardia');
      if(vig && !combat.tierSFired.has('vigilia_s')){
        combat.tierSFired.add('vigilia_s');
        combat.vigiliaGuardPending = vig.reduction;
        log(`Tu Vigilia se alza: el próximo golpe que recibas hará -${Math.round(vig.reduction*100)}% de daño.`);
      }
    }
    return;
  }

  // Crítico de enemigo (pedido explícito 2026-09-28) — se tira UNA vez acá,
  // antes de bifurcar entre el sistema viejo (de abajo) y el nuevo
  // (resolveNewStyleEnemyMove), para no duplicar el roll en los dos lugares
  // donde se calcula el daño final. ENEMY_CRIT_MULT más sobrio que el 1.5x+
  // del jugador: es una mecánica nueva de verdad, arranca conservadora.
  const enemyCrit = chance(enemy.critChance||0);

  // Sistema nuevo, data-driven (2026-09-25, "Década 2 - Arañas" y en
  // adelante): un tpl con `abilities`+`aiPriority` en vez de `moves` (lista
  // de strings sueltas resueltas por un if-chain) resuelve su turno acá y
  // nunca llega al sistema viejo de abajo — décadas ya lanzadas (Bosque
  // Goblin, Bestias, Usurpador, Isla Paraíso, El Mar) siguen 100% con el
  // sistema viejo, sin ningún cambio de comportamiento.
  if(enemy.tpl.abilities){ resolveNewStyleEnemyMove(enemy, target, enemyCrit); return; }

  const available = enemy.tpl.moves.filter(m=> !(m==='invocar' && enemy.cooldowns.invocar>0));
  let move = pick(available.length ? available : enemy.tpl.moves);
  // Silencio (Asesino, Cuchillo largo/gemelo A): fuerza un ataque básico
  // liso este turno, sin importar qué movimiento especial le tocaba.
  if(hasStatus(enemy.statuses,'Silencio')) move = null;

  // movimientos de soporte: no hacen daño directo, resuelven su efecto y terminan el turno del enemigo ahí.
  const enemyIdx = combat.enemies.indexOf(enemy);
  if(move==='curar'){
    const heal = Math.max(1, Math.round(enemy.maxHP*0.12));
    const before = enemy.hp;
    enemy.hp = Math.min(enemy.maxHP, enemy.hp+heal);
    log(`${enemy.name} se cura ${enemy.hp-before} de vida.`);
    combat.lastAction = {label:'Se cura', effects:[{targetKind:'enemy', key:enemyIdx, amount:enemy.hp-before, kind:'heal'}]};
    return;
  }
  // Sanador de grupo (2026-09-16, pedido explícito: "los goblins chamanes
  // también deberían tener capacidad de curar" — antes 'curar' solo existía
  // como auto-curación de jefe, nunca curaba a OTRO enemigo). Cura al
  // compañero vivo más herido; si pelea solo, se cura a sí mismo en su lugar
  // para que el turno no se desperdicie.
  if(move==='curar_aliado'){
    const others = livingEnemies().filter(e=>e!==enemy);
    const target = others.sort((a,b)=>(a.hp/a.maxHP)-(b.hp/b.maxHP))[0];
    if(!target){
      const heal = Math.max(1, Math.round(enemy.maxHP*0.12));
      const before = enemy.hp;
      enemy.hp = Math.min(enemy.maxHP, enemy.hp+heal);
      log(`${enemy.name} se cura ${enemy.hp-before} de vida.`);
      combat.lastAction = {label:'Se cura', effects:[{targetKind:'enemy', key:enemyIdx, amount:enemy.hp-before, kind:'heal'}]};
      return;
    }
    const heal = Math.max(1, Math.round(target.maxHP*0.15));
    const before = target.hp;
    target.hp = Math.min(target.maxHP, target.hp+heal);
    const targetIdx = combat.enemies.indexOf(target);
    log(`${enemy.name} canaliza magia curativa sobre ${target.name}: recupera ${target.hp-before} de vida.`);
    combat.lastAction = {label:'Cura a un aliado', effects:[{targetKind:'enemy', key:targetIdx, amount:target.hp-before, kind:'heal'}]};
    return;
  }
  if(move==='buff_pasivo'){
    const buff = hasStatus(enemy.statuses,'Fortalecido');
    if(buff) buff.stacks = (buff.stacks||1)+1;
    else enemy.statuses.push({name:'Fortalecido', duration:99, stacks:1, stack:true});
    log(`${enemy.name} se fortalece con cada turno que pasa.`);
    combat.lastAction = {label:'Se fortalece', effects:[]};
    return;
  }
  if(move==='invocar'){
    enemy.cooldowns.invocar = 4;
    const toSummon = Math.min(2, 6 - combat.enemies.length);
    for(let i=0;i<toSummon;i++){
      // Invocadas: no dan EXP/oro ni botín (solo cuentan los enemigos con
      // los que empezó el combate — ver rewardEnemyCount en handleVictory).
      const minion = makeEnemy(SUMMON_TEMPLATE, state.dungeon.atFloor, state.dungeon.level);
      minion.summoned = true; minion.summoner = enemy;
      combat.enemies.push(minion);
    }
    if(toSummon>0) log(`${enemy.name} invoca ${toSummon>1?'dos criaturas menores':'una criatura menor'}.`);
    combat.lastAction = {label:'Invoca', effects:[]};
    return;
  }
  // El ataque en área de verdad pega a todo el grupo (jugador + cada aliado
  // vivo), no solo a quien esté al frente — antes el texto lo decía pero el
  // código igual apuntaba a un solo objetivo. Además contagia Corrosión:
  // baja la resistencia física y reduce a la mitad la curación que reciban
  // durante 2 turnos.
  if(move==='area_debil'){
    const dmg = Math.max(1, Math.round(enemy.atk*0.5));
    const corrosion = {name:'Corrosion', duration:2, resPenalty:CORROSION_RES_PENALTY, healMult:CORROSION_HEAL_MULT};
    const pResVal = totalRes('fisico') - corrosionResPenalty(combat.playerStatuses);
    const pDmg = Math.max(1, Math.round(dmg*(1-pResVal/100)));
    dealDamageToPlayer(pDmg);
    applyStatus(null, corrosion, true);
    log(`${enemy.name} golpea a todo tu grupo por igual: ${pDmg} de daño a ti.`);
    const areaEffects = [{targetKind:'player', amount:pDmg, kind:'dmg'}];
    livingAllies().forEach(ally=>{
      const aResVal = ((ally.res && ally.res.fisico)||0) - corrosionResPenalty(ally.statuses);
      const aDmg = Math.max(1, Math.round(dmg*(1-aResVal/100)));
      dealDamageToAlly(ally, aDmg);
      applyStatus(ally, corrosion, false);
      log(`${enemy.name} golpea a todo tu grupo por igual: ${aDmg} de daño a ${ally.name}.`);
      areaEffects.push({targetKind:'ally', key:ally.id, amount:aDmg, kind:'dmg'});
      if(ally.hp<=0) log(`<b>${ally.name}</b> cae en combate y queda fuera de acción hasta que avances al siguiente nivel del laberinto.`);
    });
    log(`Una <b>Corrosión</b> se extiende sobre el grupo: -${CORROSION_RES_PENALTY} de resistencia física y curación reducida a la mitad durante 2 turnos.`);
    combat.lastAction = {label:'Golpe en área', effects:areaEffects};
    return;
  }

  const d = derived();
  let dmg = enemy.atk;
  const fortalecido = hasStatus(enemy.statuses,'Fortalecido');
  if(fortalecido) dmg = Math.round(dmg * (1 + (fortalecido.stacks||1)*0.04));
  // Maza de combate Tier S ('maza_s' en applyEquippedSpecials): un enemigo
  // Debilitado pega un 15% más flojo — mismo criterio que ya usa el
  // Debilitado que sufren el jugador/aliados.
  if(hasStatus(enemy.statuses,'Debilitado')) dmg = Math.round(dmg*0.85);
  dmg = Math.round(dmg*enemyMermadoMult(enemy));
  // Lectura genérica de cualquier estado propio con dmgMult (2026-09-25) —
  // cubre autobuffs temporales como "Orden de la Colmena" (Matriarca
  // Telaraña fortalece a su acompañante) sin tener que hardcodear cada
  // nombre de estado nuevo, uno por uno, en este if-chain.
  enemy.statuses.forEach(st=>{ if(st.dmgMult) dmg = Math.round(dmg*st.dmgMult); });
  let text = 'ataca';
  const moveLabel = MOVE_LABELS[move] || 'Ataque';
  // Los aliados ahora son "un personaje más": los mismos movimientos que
  // afligen al jugador afligen a quien esté en el frente, sea quien sea.
  const onPlayer = target.kind==='player';
  const applyToTarget = (statusDef)=> onPlayer ? applyStatus(null, statusDef, true) : applyStatus(target.ally, statusDef, false);
  if(move==='robar'){ text='intenta robar tu oro'; dmg = Math.round(dmg*0.6); }
  if(move==='morder'){ text='muerde y desgarra, dejando una herida sangrante'; applyToTarget({name:'Sangrado', duration:2, stack:true, maxStack:3}); }
  if(move==='picar'){ text='clava un aguijón cargado de veneno'; applyToTarget({name:'Veneno', duration:2, stack:true, maxStack:3}); }
  if(move==='debilitar'){ text='drena tu fuerza'; applyToTarget({name:'Debilitado', duration:2}); dmg = Math.round(dmg*0.6); }
  if(move==='aplastar'){ text='golpea con fuerza brutal'; dmg = Math.round(dmg*1.4); }
  if(move==='paralizar'){ text='muerde y paraliza'; applyToTarget({name:'Paralisis', duration:2, chance:0.5}); }
  if(move==='cegar'){ text='arroja algo a tus ojos'; applyToTarget({name:'Ceguera', duration:2, chance:0.5, procChance:0.32}); }
  if(move==='atemorizar'){ text='ruge y siembra el terror'; applyToTarget({name:'Miedo', duration:2, chance:0.5, procChance:0.4}); dmg = Math.round(dmg*0.7); }
  if(move==='confundir'){ text='distorsiona tu percepción'; applyToTarget({name:'Confusion', duration:2, chance:0.5, procChance:0.35}); dmg = Math.round(dmg*0.7); }
  if(move==='maldicion_venenosa'){ text='lanza una maldición venenosa'; dmg = Math.round(dmg*1.15); }

  // Enemigos "mago" (2026-09-16, pedido explícito): su golpe usa daño
  // elemental de verdad — resistencia mágica + la resistencia elemental
  // específica del objetivo, en vez de la física de siempre. Antes NINGÚN
  // enemigo hacía esto (todo ataque, sin importar el move, pegaba contra
  // totalRes('fisico')).
  const ELEMENTAL_MOVES = {maldicion_venenosa:'veneno'};
  const elementalType = ELEMENTAL_MOVES[move];

  let finalDmg;
  if(onPlayer){
    // resistance vs player
    let resVal = elementalType
      ? totalRes(elementalType) + d.resMagica
      : totalRes('fisico') - corrosionResPenalty(combat.playerStatuses);
    finalDmg = dmg*(1-resVal/100);
    if(enemyCrit) finalDmg *= ENEMY_CRIT_MULT;
    if(state.char.race==='enano') finalDmg -= 2;
    if(combat.playerDefending) finalDmg *= 0.5;
    if(combat.playerPos==='frente') finalDmg *= (1-FRONTLINE_DAMAGE_REDUCTION);
    const furiosoBuff = hasStatus(combat.playerStatuses,'Furioso');
    if(furiosoBuff && furiosoBuff.incomingDmgReduction) finalDmg *= (1 - furiosoBuff.incomingDmgReduction);
    finalDmg *= playerStatusIncomingMult(); // Muro de Fe y otros buffs defensivos propios
    if(hasStatus(combat.playerStatuses,'Paralisis')) finalDmg *= 1.25; // indefenso: sin evasión y más daño recibido
    // Maza de combate / Espadón pesado épicos: reducción de daño recibido pasiva.
    const playerEquipSpecials = specialsFromEquip(state.char.equip);
    playerEquipSpecials.forEach(sp=>{
      if(sp.type==='reduccion_dano') finalDmg *= (1-sp.value);
    });
    // Vigor (pedido explícito 2026-09-28): reducción de daño recibido propia
    // del stat, física y mágica por igual — se suma multiplicativamente a la
    // de equipo de arriba, no la reemplaza.
    finalDmg *= (1 - d.reduccionVigor);
    // Casco Tier S ('casco_s'): por debajo del 50% de vida, -5% de daño
    // recibido adicional — continuo, no consume el "1 vez por combate".
    if(hasTierSProc(playerEquipSpecials,'casco_s') && d.maxHP>0 && (state.char.curHP/d.maxHP) < 0.5){
      finalDmg *= 0.95;
    }
    // Armadura Tier S ('armadura_s'): el primer golpe que recibís en todo el
    // combate hace -10% de daño — 1 vez por combate (ver combat.tierSFired).
    if(hasTierSProc(playerEquipSpecials,'armadura_s') && !combat.tierSFired.has('armadura_s:player')){
      combat.tierSFired.add('armadura_s:player');
      finalDmg *= 0.9;
    }
    // Brecha de nivel: un monstruo de más nivel pega más fuerte, uno de
    // menos nivel pega más flojo — dirección invertida a la del jugador
    // atacando (ver levelDiffDamageMult en playerUseSkill).
    finalDmg *= levelDiffDamageMult(monsterEffectiveLevel(), state.char.level);
    finalDmg = Math.max(1, Math.round(finalDmg));
    dealDamageToPlayer(finalDmg);
    log(`${enemy.name} ${text}: ${finalDmg} de daño${enemyCrit?' (¡crítico!)':''}.`);
    if(enemyCrit) checkBaluarteOnCrit();
    combat.lastAction = {label:moveLabel, effects:[{targetKind:'player', amount:finalDmg, kind:'dmg'}]};
  } else {
    const ally = target.ally;
    const allyResKey = elementalType || 'fisico';
    const allyBendicion = hasStatus(ally.statuses,'Bendición');
    let allyDmg = dmg*(1-(((ally.res && ally.res[allyResKey])||0) + (allyBendicion?allyBendicion.resBonus||0:0) - (elementalType?0:corrosionResPenalty(ally.statuses)))/100);
    if(enemyCrit) allyDmg *= ENEMY_CRIT_MULT;
    if(hasStatus(ally.statuses,'Paralisis')) allyDmg *= 1.25; // indefenso: igual que al jugador
    if(ally.pos==='frente') allyDmg *= (1-FRONTLINE_DAMAGE_REDUCTION);
    (ally.specials||[]).forEach(sp=>{ if(sp.type==='reduccion_dano') allyDmg *= (1-sp.value); });
    const allyFuriosoDef = hasStatus(ally.statuses,'Furioso');
    if(allyFuriosoDef && allyFuriosoDef.incomingDmgReduction) allyDmg *= (1 - allyFuriosoDef.incomingDmgReduction);
    if(allyBendicion && allyBendicion.incomingDmgReduction) allyDmg *= (1 - allyBendicion.incomingDmgReduction);
    // Muralla Viviente (Brann) / Égida Sagrada (Seraphina) — mismo patrón
    // que Furioso/Bendición de arriba (pedido explícito 2026-09-26).
    const allyBastion = hasStatus(ally.statuses,'Bastión');
    if(allyBastion && allyBastion.incomingDmgReduction) allyDmg *= (1 - allyBastion.incomingDmgReduction);
    const allyEgida = hasStatus(ally.statuses,'Égida');
    if(allyEgida && allyEgida.incomingDmgReduction) allyDmg *= (1 - allyEgida.incomingDmgReduction);
    allyDmg *= setProtectorMult((ally.shield||0)>0, ally.specials);
    const allyUltimo = hasStatus(ally.statuses,'Último Bastión');
    if(allyUltimo) allyDmg *= (1 - allyUltimo.incomingDmgReduction);
    // Casco/Armadura Tier S del aliado — mismo criterio que el jugador.
    if(hasTierSProc(ally.specials,'casco_s') && ally.maxHP>0 && (ally.hp/ally.maxHP) < 0.5){
      allyDmg *= 0.95;
    }
    if(hasTierSProc(ally.specials,'armadura_s') && !combat.tierSFired.has('armadura_s:'+ally.id)){
      combat.tierSFired.add('armadura_s:'+ally.id);
      allyDmg *= 0.9;
    }
    allyDmg *= levelDiffDamageMult(monsterEffectiveLevel(), state.char.level);
    finalDmg = Math.max(1, Math.round(allyDmg));
    dealDamageToAlly(ally, finalDmg);
    log(`${enemy.name} ${text} a ${ally.name}: ${finalDmg} de daño${enemyCrit?' (¡crítico!)':''}.`);
    if(ally.hp<=0) log(`<b>${ally.name}</b> cae en combate y queda fuera de acción hasta que avances al siguiente nivel del laberinto.`);
    combat.lastAction = {label:moveLabel, effects:[{targetKind:'ally', key:ally.id, amount:finalDmg, kind:'dmg'}]};
  }

  // Vitalidad / Escudo de hierro épico: devuelve un % del daño físico
  // recibido a quien lo infligió — piedra engarzada (solo si golpeó al
  // jugador) o especial de equipo (jugador o aliado, según a quién le pegó).
  if(onPlayer){
    socketedStones().forEach(s=>{
      if(s.special && s.special.type==='reflect'){
        const reflected = Math.max(1, Math.round(finalDmg*s.special.pct));
        enemy.hp = Math.max(0, enemy.hp-reflected);
        log(`<b>${s.name}</b> devuelve ${reflected} de daño a ${enemy.name}.`);
      }
    });
  }
  const reflectSources = onPlayer ? specialsFromEquip(state.char.equip) : (target.ally.specials||[]);
  reflectSources.filter(sp=>sp.type==='reflect').forEach(sp=>{
    const reflected = Math.max(1, Math.round(finalDmg*sp.pct));
    enemy.hp = Math.max(0, enemy.hp-reflected);
    log(`${sp.text||'Tu equipo'} devuelve ${reflected} de daño a ${enemy.name}.`);
  });
}

// ============================================================
// SISTEMA NUEVO DE IA DE ENEMIGOS (2026-09-25, "Década 2 - Arañas" en
// adelante) — data-driven en vez del if-chain de strings sueltas de arriba.
// Un tpl usa este sistema con dos campos nuevos en vez de `moves`:
//   abilities: { idHabilidad: {label, mult, cooldown, condition(ctx),
//     applies, selfBuff, bonusVsStatus, utility:'buff_companion',
//     buffCompanion}, ... }
//   aiPriority: ['idA','idB',...,'basico'] — se prueba en orden; la última
//     entrada DEBE ser siempre usable (sin cooldown ni condition) para que
//     nunca se quede sin nada que hacer.
// ctx que recibe cada `condition`: {selfHpPct, targetHpPct, targetStatuses,
// targetStatusCount(name)}.
// enemy.cooldowns ya se decrementa genéricamente al principio de
// enemyAct() (Object.keys(enemy.cooldowns).forEach...), así que acá solo
// hace falta leerlo y, al usar una habilidad con cooldown, volver a armarlo.
// ============================================================
// ============================================================
// Extensiones del motor de enemigos (2026-10-02, pedido explícito: fases de
// jefes de década, señuelos/invocaciones y refuerzos de grupo):
// - tpl.phases: [{below, msg}] avisos de cambio de fase por % de vida.
// - ability.oncePerCombat: la habilidad solo se usa una vez por combate.
// - utility 'summon': invoca unidades (ability.summon = {tpl, count, maxAlive,
//   hpPct|oneHp, atkPct}). Las invocadas llevan summoned=true y summoner; si
//   su tpl tiene decoy:true son SEÑUELOS: no actúan, están al Frente y
//   absorben los golpes dirigidos al frente.
// - utility 'buff_allies': refuerza a TODO el grupo enemigo vivo, el que lo
//   lanza incluido (antes "Aullido de Dominio" y similares solo se
//   autobuffeaban). ability.buffAllies = estado; Fortalecido suma cargas.
// - utility 'self_heal': cura un % de su vida (ability.healPct), opcionalmente
//   solo si tiene cierto estado (requiresStatus).
// - ability.debuffTarget: estado extra que una habilidad de soporte le pone a
//   su objetivo (jugador/aliado).
// - Pasivas de tpl: passiveReduction, reductionWithAllies {min, value},
//   reductionWhileSummonsAlive, passiveDmgMult, dmgMultWhileSummonsAlive,
//   immuneRetroceso, riposte {chance, mult}, onDeathSpawn {tpl, chance},
//   auraRegenPct (cura a todo su grupo cada turno mientras vive).
// - Estados enemigos con regenPct: curan ese % de vida por turno.
// ============================================================
function enemySummonsAlive(enemy){
  return combat.enemies.some(e=>e.summoner===enemy && e.hp>0);
}
function enemyOtherAlliesAlive(enemy){
  return combat.enemies.filter(e=>e!==enemy && e.hp>0 && !(e.tpl && e.tpl.decoy)).length;
}
// Multiplicador de daño RECIBIDO por un enemigo según sus pasivas.
function enemyPassiveTakenMult(target){
  const t = target && target.tpl;
  if(!t) return 1;
  let m = 1;
  if(t.passiveReduction) m *= (1 - t.passiveReduction);
  if(t.reductionWithAllies && enemyOtherAlliesAlive(target) >= t.reductionWithAllies.min) m *= (1 - t.reductionWithAllies.value);
  if(t.reductionWhileSummonsAlive && enemySummonsAlive(target)) m *= (1 - t.reductionWhileSummonsAlive);
  return m;
}
// Multiplicador de daño INFLIGIDO por un enemigo según sus pasivas.
function enemyPassiveDealtMult(enemy){
  const t = enemy.tpl;
  let m = 1;
  if(t.passiveDmgMult) m *= t.passiveDmgMult;
  if(t.dmgMultWhileSummonsAlive && enemySummonsAlive(enemy)) m *= t.dmgMultWhileSummonsAlive;
  return m;
}
// Refuerzo de grupo enemigo: a todos los vivos (el que lo lanza incluido), o
// con single:true a UN compañero al azar (o a sí mismo si está solo).
function applyEnemyGroupBuff(caster, b){
  let group = combat.enemies.filter(e=>e.hp>0 && !(e.tpl && e.tpl.decoy));
  if(b.single){ const others = group.filter(e=>e!==caster); group = [others.length ? pick(others) : caster]; }
  group.forEach(e=>{
    const ex = hasStatus(e.statuses, b.name);
    if(b.name==='Fortalecido'){
      if(ex){ ex.stacks = Math.min(b.maxStacks||8, (ex.stacks||0) + (b.stacks||1)); ex.duration = Math.max(ex.duration||0, b.duration); }
      else e.statuses.push({name:'Fortalecido', duration:b.duration, stacks:b.stacks||1, stack:true});
    } else {
      const clean = Object.assign({}, b); delete clean.single; delete clean.maxStacks;
      if(ex) Object.assign(ex, clean); else e.statuses.push(clean);
    }
  });
  return group.length;
}
function summonEnemies(caster, spec){
  const alive = combat.enemies.filter(e=>e.summoner===caster && e.hp>0).length;
  const room = Math.min(spec.count||1, (spec.maxAlive||spec.count||1) - alive, 6 - livingEnemies().length);
  const out = [];
  for(let i=0;i<room;i++){
    const e = makeEnemy(spec.tpl, state.dungeon.atFloor, state.dungeon.level);
    if(spec.oneHp){ e.maxHP = 1; e.hp = 1; }
    else if(spec.hpPct){ e.maxHP = Math.max(1, Math.round(caster.maxHP*spec.hpPct)); e.hp = e.maxHP; }
    if(spec.atkPct) e.atk = Math.max(1, Math.round(caster.atk*spec.atkPct));
    e.summoned = true;
    e.summoner = caster;
    combat.enemies.push(e);
    out.push(e);
  }
  return out;
}
// Muertes con efecto (Garvel: 30% de dejar un Garvel pequeño). Se llama
// desde checkCombatEnd, antes de decidir si el combate terminó.
function processEnemyDeaths(){
  combat.enemies.forEach(e=>{
    if(e.hp>0 || e.deathProcessed) return;
    e.deathProcessed = true;
    const sp = e.tpl && e.tpl.onDeathSpawn;
    if(sp && !e.summoned && livingEnemies().length < 6 && chance(sp.chance)){
      const child = makeEnemy(sp.tpl, state.dungeon.atFloor, state.dungeon.level);
      child.summoned = true;
      combat.enemies.push(child);
      log(`Del cuerpo de ${e.name} surge un <b>${child.name}</b>.`);
    }
  });
}

function newStyleCtx(enemy, target){
  const onPlayer = target.kind==='player';
  const targetStatuses = onPlayer ? combat.playerStatuses : target.ally.statuses;
  const targetHp = onPlayer ? state.char.curHP : target.ally.hp;
  const targetMaxHp = onPlayer ? derived().maxHP : target.ally.maxHP;
  return {
    selfHpPct: enemy.maxHP>0 ? enemy.hp/enemy.maxHP : 1,
    targetHpPct: targetMaxHp>0 ? targetHp/targetMaxHp : 1,
    targetStatuses,
    targetStatusCount(name){ const st=targetStatuses.find(s=>s.name===name); return st?(st.stacks||1):0; },
  };
}

// Elige (sin efectos secundarios) la habilidad que usará un enemigo del
// sistema nuevo según aiPriority, cooldowns, oncePerCombat y condiciones.
function pickNewStyleAbilityId(enemy, ctx){
  const tpl = enemy.tpl;
  const priority = tpl.aiPriority || Object.keys(tpl.abilities);
  for(const id of priority){
    const ab = tpl.abilities[id];
    if(!ab) continue;
    if(enemy.cooldowns[id] > 0) continue;
    if(ab.oncePerCombat && enemy.usedOnce && enemy.usedOnce.has(id)) continue;
    if(ab.condition && !ab.condition(ctx)) continue;
    // Invocación sin espacio (ya tiene el máximo de copias/señuelos vivos):
    // se salta para no desperdiciar el turno.
    if(ab.utility==='summon' && ab.summon){
      const alive = combat.enemies.filter(e=>e.summoner===enemy && e.hp>0).length;
      if(alive >= (ab.summon.maxAlive||ab.summon.count||1) || livingEnemies().length >= 6) continue;
    }
    return id;
  }
  return priority[priority.length-1];
}

function resolveNewStyleEnemyMove(enemy, target, enemyCrit){
  const tpl = enemy.tpl;
  const onPlayer = target.kind==='player';
  const d = derived();
  const targetStatuses = onPlayer ? combat.playerStatuses : target.ally.statuses;
  const targetHp = onPlayer ? state.char.curHP : target.ally.hp;
  const targetMaxHp = onPlayer ? d.maxHP : target.ally.maxHP;

  // Pasiva de umbral de vida propia, 1 vez por combate (ej. "<50% HP: +10%
  // ATQ 2 turnos" de varios guardianes) — no consume el turno/la acción.
  if(tpl.hpThresholdBuff && !enemy.hpThresholdBuffUsed && enemy.maxHP>0 && (enemy.hp/enemy.maxHP) < tpl.hpThresholdBuff.threshold){
    enemy.hpThresholdBuffUsed = true;
    const existing = hasStatus(enemy.statuses, tpl.hpThresholdBuff.buff.name);
    if(existing) Object.assign(existing, tpl.hpThresholdBuff.buff);
    else enemy.statuses.push(Object.assign({}, tpl.hpThresholdBuff.buff));
    const thText = statusEffectText(tpl.hpThresholdBuff.buff);
    log(`${enemy.name} reacciona al quedar herido: ${tpl.hpThresholdBuff.buff.name}${thText ? ` (${thText})` : ''}.`);
  }

  const ctx = newStyleCtx(enemy, target);

  // Avisos de fase (jefes de década).
  (tpl.phases||[]).forEach((ph, i)=>{
    if(!enemy.phasesShown) enemy.phasesShown = new Set();
    if(ctx.selfHpPct < ph.below && !enemy.phasesShown.has(i)){
      enemy.phasesShown.add(i);
      log(`<b>${enemy.name}</b> ${ph.msg}`);
    }
  });
  if(!enemy.usedOnce) enemy.usedOnce = new Set();
  // enemyAct ya pudo haber elegido la habilidad (para saber si es esquivable).
  const chosenId = enemy.pendingAbilityId || pickNewStyleAbilityId(enemy, ctx);
  delete enemy.pendingAbilityId;
  const ability = tpl.abilities[chosenId];
  if(ability.cooldown) enemy.cooldowns[chosenId] = ability.cooldown;
  if(ability.oncePerCombat) enemy.usedOnce.add(chosenId);
  const applyDebuffTarget = ()=>{
    if(!ability.debuffTarget) return;
    if(onPlayer) applyStatus(null, Object.assign({}, ability.debuffTarget), true);
    else applyStatus(target.ally, Object.assign({}, ability.debuffTarget), false);
  };

  if(ability.utility==='summon'){
    const made = summonEnemies(enemy, ability.summon);
    if(made.length && ability.selfBuff){
      const ex = hasStatus(enemy.statuses, ability.selfBuff.name);
      if(ex) Object.assign(ex, ability.selfBuff); else enemy.statuses.push(Object.assign({}, ability.selfBuff));
    }
    if(made.length) log(`${enemy.name} usa ${ability.label}: aparece${made.length>1?'n':''} ${made.length>1?made.length+' ':''}<b>${made[0].name}</b>${made.length>1?'':''}.`);
    else log(`${enemy.name} usa ${ability.label}, pero no hay espacio para más.`);
    combat.lastAction = {label:ability.label, effects:[]};
    return;
  }
  if(ability.utility==='buff_allies'){
    const n = applyEnemyGroupBuff(enemy, ability.buffAllies);
    log(`${enemy.name} usa ${ability.label}: ${n>1?'su grupo se fortalece':(ability.buffAllies.single?'refuerza a un compañero':'se fortalece')}.`);
    combat.lastAction = {label:ability.label, effects:[]};
    return;
  }
  if(ability.utility==='self_heal'){
    if(!ability.requiresStatus || hasStatus(enemy.statuses, ability.requiresStatus)){
      const before = enemy.hp;
      enemy.hp = Math.min(enemy.maxHP, enemy.hp + Math.round(enemy.maxHP*(ability.healPct||0.08)));
      log(`${enemy.name} usa ${ability.label}: recupera ${enemy.hp-before} de vida.`);
    } else log(`${enemy.name} usa ${ability.label}.`);
    applyDebuffTarget();
    combat.lastAction = {label:ability.label, effects:[]};
    return;
  }

  // Movimiento de soporte puro (no hace daño): se autobuffea (defensa,
  // ej. "Seda Protectora"/"Caparazón Endurecido") y termina el turno ahí.
  if(ability.utility==='self_buff'){
    const buff = ability.selfBuff;
    const existing = hasStatus(enemy.statuses, buff.name);
    if(existing) Object.assign(existing, buff);
    else enemy.statuses.push(Object.assign({}, buff));
    const buffText = statusEffectText(buff);
    log(`${enemy.name} usa ${ability.label}${buffText ? `: ${buffText} ${buff.duration >= STATUS_PERMANENT_TURNS ? 'hasta el final del combate' : `durante ${buff.duration} turnos`}` : ''}.`);
    applyDebuffTarget();
    combat.lastAction = {label:ability.label, effects:[]};
    return;
  }
  // Movimiento de soporte puro (no hace daño): fortalece a su acompañante
  // vivo (ej. "Orden de la Colmena" de la Matriarca Telaraña) y termina el
  // turno ahí, igual que 'curar'/'buff_pasivo' del sistema viejo.
  if(ability.utility==='buff_companion'){
    if(enemy.companionRef && enemy.companionRef.hp>0){
      const existing = hasStatus(enemy.companionRef.statuses, ability.buffCompanion.name);
      if(existing) existing.duration = ability.buffCompanion.duration;
      else enemy.companionRef.statuses.push(Object.assign({}, ability.buffCompanion));
      log(`${enemy.name} usa ${ability.label}: fortalece a ${enemy.companionRef.name}.`);
    } else {
      log(`${enemy.name} usa ${ability.label}, pero no tiene compañero al que fortalecer.`);
    }
    combat.lastAction = {label:ability.label, effects:[]};
    return;
  }
  // Movimiento de soporte puro (no hace daño): cura al aliado vivo más
  // herido del propio bando (2026-09-25, pedido explícito, "Médico de
  // Campaña"/"Sacerdotisa de las Mareas") — a diferencia de buff_companion,
  // no depende de un companionRef fijo: busca entre TODOS los enemigos vivos
  // del combate, así sirve sin importar cómo se armó el grupo.
  if(ability.utility==='heal_ally'){
    const candidates = combat.enemies.filter(e=>e!==enemy && e.hp>0 && e.hp<e.maxHP);
    if(candidates.length){
      const woundedTarget = candidates.reduce((a,b)=> (b.hp/b.maxHP) < (a.hp/a.maxHP) ? b : a);
      const healAmt = Math.max(1, Math.round(woundedTarget.maxHP * (ability.healPct||0.10)));
      const before = woundedTarget.hp;
      woundedTarget.hp = Math.min(woundedTarget.maxHP, woundedTarget.hp + healAmt);
      log(`${enemy.name} usa ${ability.label}: cura a ${woundedTarget.name} por ${woundedTarget.hp-before}.`);
    } else {
      log(`${enemy.name} usa ${ability.label}, pero nadie necesita curación.`);
    }
    combat.lastAction = {label:ability.label, effects:[]};
    return;
  }

  // Golpe en área (2026-10-02, Custodio de la Isla): pega a todo el grupo
  // (jugador + aliados vivos) con la resistencia física de cada uno, y puede
  // aplicar un estado a cada golpeado (ej. Corrosión).
  if(ability.utility==='aoe'){
    let base = enemy.atk * (ability.mult!=null ? ability.mult : 0.5);
    const fz = hasStatus(enemy.statuses,'Fortalecido');
    if(fz) base *= (1 + (fz.stacks||1)*0.04);
    if(hasStatus(enemy.statuses,'Debilitado')) base *= 0.85;
    base *= enemyMermadoMult(enemy);
    enemy.statuses.forEach(st=>{ if(st.dmgMult) base *= st.dmgMult; });
    base *= enemyPassiveDealtMult(enemy);
    const effects = [];
    const pRes = totalRes('fisico') - corrosionResPenalty(combat.playerStatuses);
    const pDmg = Math.max(1, Math.round(base*(1-pRes/100)));
    dealDamageToPlayer(pDmg);
    effects.push({targetKind:'player', amount:pDmg, kind:'dmg'});
    if(ability.applies) applyStatus(null, Object.assign({}, ability.applies), true);
    livingAllies().forEach(ally=>{
      const aRes = ((ally.res && ally.res.fisico)||0) - corrosionResPenalty(ally.statuses);
      const aDmg = Math.max(1, Math.round(base*(1-aRes/100)));
      dealDamageToAlly(ally, aDmg);
      if(ability.applies) applyStatus(ally, Object.assign({}, ability.applies), false);
      effects.push({targetKind:'ally', key:ally.id, amount:aDmg, kind:'dmg'});
      if(ally.hp<=0) log(`<b>${ally.name}</b> cae en combate y queda fuera de acción hasta que avances al siguiente nivel del laberinto.`);
    });
    log(`${enemy.name} usa ${ability.label}: golpea a todo tu grupo (${pDmg} de daño a ti).`);
    combat.lastAction = {label:ability.label, effects};
    return;
  }

  let dmg = enemy.atk * (ability.mult!=null ? ability.mult : 1);
  const fortalecido = hasStatus(enemy.statuses,'Fortalecido');
  if(fortalecido) dmg = Math.round(dmg * (1 + (fortalecido.stacks||1)*0.04));
  if(hasStatus(enemy.statuses,'Debilitado')) dmg = Math.round(dmg*0.85);
  dmg = Math.round(dmg*enemyMermadoMult(enemy));
  enemy.statuses.forEach(st=>{ if(st.dmgMult) dmg = Math.round(dmg*st.dmgMult); });
  dmg = Math.round(dmg*enemyPassiveDealtMult(enemy));
  if(tpl.bonusVsOwnStatus && ctx.targetStatusCount(tpl.bonusVsOwnStatus.name) >= tpl.bonusVsOwnStatus.minStacks){
    dmg = Math.round(dmg*tpl.bonusVsOwnStatus.mult);
  }
  if(ability.bonusVsTargetStatus && ctx.targetStatusCount(ability.bonusVsTargetStatus.name) >= (ability.bonusVsTargetStatus.minStacks||1)){
    dmg = Math.round(dmg*ability.bonusVsTargetStatus.mult);
  }
  // "+X% si el objetivo está por debajo del Y% de vida" (PDFs de décadas
  // 3 y 4 — auditoría 2026-10-02: antes solo existía como condición de uso
  // y el +X% se perdía).
  if(ability.bonusVsLowHp && ctx.targetHpPct < ability.bonusVsLowHp.below){
    dmg = Math.round(dmg*ability.bonusVsLowHp.mult);
  }
  // Marcado sobre el jugador/aliado (Sello de Presa, Marca de Presa, Marca
  // Mortal): antes no tenía ningún efecto — el +daño de Marcado solo se leía
  // cuando el marcado era un enemigo.
  const marked = ctx.targetStatuses.find(st=>st.name==='Marcado');
  if(marked) dmg = Math.round(dmg*(marked.incomingDmgMult||1.2));

  let finalDmg;
  if(onPlayer){
    let resVal = totalRes('fisico') - corrosionResPenalty(combat.playerStatuses);
    if(ability.ignoreResist && resVal>0) resVal *= (1-ability.ignoreResist); // Flecha Perforante (Década 6)
    finalDmg = dmg*(1-resVal/100);
    if(enemyCrit) finalDmg *= ENEMY_CRIT_MULT;
    if(state.char.race==='enano') finalDmg -= 2;
    if(combat.playerDefending) finalDmg *= 0.5;
    if(combat.playerPos==='frente') finalDmg *= (1-FRONTLINE_DAMAGE_REDUCTION);
    const furiosoBuff = hasStatus(combat.playerStatuses,'Furioso');
    if(furiosoBuff && furiosoBuff.incomingDmgReduction) finalDmg *= (1 - furiosoBuff.incomingDmgReduction);
    finalDmg *= playerStatusIncomingMult();
    if(hasStatus(combat.playerStatuses,'Paralisis')) finalDmg *= 1.25;
    const playerEquipSpecials = specialsFromEquip(state.char.equip);
    playerEquipSpecials.forEach(sp=>{ if(sp.type==='reduccion_dano') finalDmg *= (1-sp.value); });
    finalDmg *= (1 - d.reduccionVigor); // Vigor — ver mismo comentario en enemyAct()
    if(hasTierSProc(playerEquipSpecials,'casco_s') && d.maxHP>0 && (state.char.curHP/d.maxHP) < 0.5) finalDmg *= 0.95;
    if(hasTierSProc(playerEquipSpecials,'armadura_s') && !combat.tierSFired.has('armadura_s:player')){
      combat.tierSFired.add('armadura_s:player'); finalDmg *= 0.9;
    }
    finalDmg *= levelDiffDamageMult(monsterEffectiveLevel(), state.char.level);
    finalDmg = Math.max(1, Math.round(finalDmg));
    dealDamageToPlayer(finalDmg);
    if(enemyCrit) checkBaluarteOnCrit();
    if(ability.applies) applyStatus(null, Object.assign({}, ability.applies), true);
    // Robo de MP (2026-09-25, pedido explícito: "quitar un % del MP al que
    // se atacó") — % de tu MP ACTUAL, no del máximo, para que nunca deje en
    // negativo ni castigue más a quien ya viene gastado.
    if(ability.mpDrain){
      const drained = Math.round(state.char.curSta * ability.mpDrain);
      if(drained>0){
        state.char.curSta = Math.max(0, state.char.curSta - drained);
        log(`${enemy.name} drena ${drained} de tu MP.`);
      }
    }
    log(`${enemy.name} usa ${ability.label}: ${finalDmg} de daño${enemyCrit?' (¡crítico!)':''}.`);
    combat.lastAction = {label:ability.label, effects:[{targetKind:'player', amount:finalDmg, kind:'dmg'}]};
  } else {
    const ally = target.ally;
    const allyBendicion = hasStatus(ally.statuses,'Bendición');
    let resVal = ((ally.res && ally.res.fisico)||0) + (allyBendicion?allyBendicion.resBonus||0:0) - corrosionResPenalty(ally.statuses);
    if(ability.ignoreResist && resVal>0) resVal *= (1-ability.ignoreResist);
    let allyDmg = dmg*(1-resVal/100);
    if(enemyCrit) allyDmg *= ENEMY_CRIT_MULT;
    if(hasStatus(ally.statuses,'Paralisis')) allyDmg *= 1.25;
    if(ally.pos==='frente') allyDmg *= (1-FRONTLINE_DAMAGE_REDUCTION);
    (ally.specials||[]).forEach(sp=>{ if(sp.type==='reduccion_dano') allyDmg *= (1-sp.value); });
    const allyFuriosoDef = hasStatus(ally.statuses,'Furioso');
    if(allyFuriosoDef && allyFuriosoDef.incomingDmgReduction) allyDmg *= (1 - allyFuriosoDef.incomingDmgReduction);
    if(allyBendicion && allyBendicion.incomingDmgReduction) allyDmg *= (1 - allyBendicion.incomingDmgReduction);
    // Muralla Viviente (Brann) / Égida Sagrada (Seraphina) — mismo patrón
    // que Furioso/Bendición de arriba (pedido explícito 2026-09-26).
    const allyBastion = hasStatus(ally.statuses,'Bastión');
    if(allyBastion && allyBastion.incomingDmgReduction) allyDmg *= (1 - allyBastion.incomingDmgReduction);
    const allyEgida = hasStatus(ally.statuses,'Égida');
    if(allyEgida && allyEgida.incomingDmgReduction) allyDmg *= (1 - allyEgida.incomingDmgReduction);
    allyDmg *= setProtectorMult((ally.shield||0)>0, ally.specials);
    const allyUltimo = hasStatus(ally.statuses,'Último Bastión');
    if(allyUltimo) allyDmg *= (1 - allyUltimo.incomingDmgReduction);
    if(hasTierSProc(ally.specials,'casco_s') && ally.maxHP>0 && (ally.hp/ally.maxHP) < 0.5) allyDmg *= 0.95;
    if(hasTierSProc(ally.specials,'armadura_s') && !combat.tierSFired.has('armadura_s:'+ally.id)){
      combat.tierSFired.add('armadura_s:'+ally.id); allyDmg *= 0.9;
    }
    allyDmg *= levelDiffDamageMult(monsterEffectiveLevel(), state.char.level);
    finalDmg = Math.max(1, Math.round(allyDmg));
    dealDamageToAlly(ally, finalDmg);
    if(ability.applies) applyStatus(ally, Object.assign({}, ability.applies), false);
    if(ability.mpDrain){
      const drained = Math.round((ally.mp||0) * ability.mpDrain);
      if(drained>0){
        ally.mp = Math.max(0, ally.mp - drained);
        log(`${enemy.name} drena ${drained} de MP a <b>${ally.name}</b>.`);
      }
    }
    log(`${enemy.name} usa ${ability.label} sobre ${ally.name}: ${finalDmg} de daño${enemyCrit?' (¡crítico!)':''}.`);
    if(ally.hp<=0) log(`<b>${ally.name}</b> cae en combate y queda fuera de acción hasta que avances al siguiente nivel del laberinto.`);
    combat.lastAction = {label:ability.label, effects:[{targetKind:'ally', key:ally.id, amount:finalDmg, kind:'dmg'}]};
  }

  if(ability.selfBuff){
    const existing = hasStatus(enemy.statuses, ability.selfBuff.name);
    if(existing) existing.duration = ability.selfBuff.duration;
    else enemy.statuses.push(Object.assign({}, ability.selfBuff));
  }
  if(ability.buffAllies) applyEnemyGroupBuff(enemy, ability.buffAllies); // ej. Aullido del Rey: golpe + refuerzo
}

// Guarda la vida, MP y espíritu con la que terminó cada aliado en
// state.dungeon.allyHP/allyMP/allySpirit, para que la siguiente pelea del
// mismo nivel arranque donde quedó (un aliado derribado o sin MP sigue así)
// en vez de reaparecer con todo full. Se limpia solo cuando se genera un
// state.dungeon nuevo (entrar al laberinto o avanzar de nivel), momento en
// el que todos vuelven a full HP/MP/Espíritu.
function syncAllyHPToDungeon(){
  if(!state.dungeon) return;
  if(!state.dungeon.allyHP) state.dungeon.allyHP = {};
  if(!state.dungeon.allyMP) state.dungeon.allyMP = {};
  if(!state.dungeon.allySpirit) state.dungeon.allySpirit = {};
  (combat.allies||[]).forEach(a=>{
    state.dungeon.allyHP[a.id] = a.hp;
    state.dungeon.allyMP[a.id] = a.mp;
    state.dungeon.allySpirit[a.id] = a.spirit;
  });
}

// ============================================================
// SIMULADOR DE BALANCE (solo en localhost). Arma un personaje de referencia y
// pelea de verdad contra un encuentro, con el motor real de combate y sin
// tocar la base ni la pantalla. Sirve para calibrar DECADE_BOSS_TUNING.
//   await __sim({style:'tirador', level:60, dungeonLevel:60, n:100})
// Referencia (pedido de ariochbu, 2026-10-04): equipo rango A del conjunto afín
// a la senda, piedras de alma A en todos los espacios, Caídos épicos en todas
// las ranuras, 3 pociones de vida mayor y 4 aliados del mismo nivel con equipo
// rango A.
// ============================================================
const SIM_SET = {pesada:'guardian', paladin:'bastion', tirador:'artemisa', doblefilo:'jack', mago:'soberano', hechicero:'eclipse'};
const SIM_ALLIES = [['aldric','guerrero','pesada'], ['delyth','sacerdote',null], ['neira','arquero','tirador'], ['fennwick','mago','mago']];
function simBuildState(cfg){
  const level = cfg.level, rank = cfg.gear || 'rango_a';
  const equip = {arma:null, arma2:null, armadura:null, amuleto:null, casco:null, botas:null, guantes:null};
  if(rank !== 'none'){
    SET_SLOTS.forEach(slot=>{ equip[slot] = makeSetItem(SIM_SET[cfg.style], slot, rank); });
    equip.arma = makeWeaponItem('arma', cfg.style, rank); equip.arma2 = makeWeaponItem('arma2', cfg.style, rank);
  }
  const stonePool = Object.values(SOUL_STONES).filter(t=> t.tier === (cfg.stoneTier || 'A'));
  const families = [...new Set(stonePool.map(t=> t.family))].sort(()=> Math.random() - 0.5);
  const soulSlots = cfg.stoneTier === 'none' ? [] : families.slice(0, maxSoulSlots(level)).map(f=> makeSoulStoneItem(stonePool.find(t=> t.family === f)));
  const petPool = PET_CATALOG.filter(t=> t.rarity === (cfg.petRarity || 'epico')).sort(()=> Math.random() - 0.5);
  const allies = SIM_ALLIES.slice(0, cfg.allies == null ? 4 : cfg.allies).map(([id, role, wstyle], i)=>{
    const tpl = ALLY_ROSTER.find(t=> t.templateId === id);
    const eq = {};
    if(rank !== 'none'){
      SET_SLOTS.forEach(slot=>{ eq[slot] = makeSetItem('voluntad', slot, rank); });
      if(wstyle){ eq.arma = makeWeaponItem('arma', wstyle, rank); eq.arma2 = makeWeaponItem('arma2', wstyle, rank); }
    }
    return {id:'sim' + i, template_id:id, name:tpl.name, role, level, xp:0, equip:eq, soul_slots:[], satisfaction:100};
  });
  const st = {char:{
    id:'sim', slotNumber:1, nickname:'Sim', role:'player', race: cfg.race || 'humano', style: cfg.style,
    level, xp:0, gold:0, missionCurrency:0, curHP:1, curSta:1, curSpi:1,
    equip, inventory:[{kind:'potion', potionId:'vida_mayor', qty: cfg.potions == null ? 3 : cfg.potions}], itemCounter:0,
    maxLevelUnlocked: cfg.dungeonLevel, checkpointLevel: cfg.dungeonLevel, record:{level:cfg.dungeonLevel, floorIdx:0},
    stash:{gold:0, items:[]}, soulSlots, pityGear:0, pityStone:0,
    pets:{owned:{}, equipped:[], pendingFreePulls:0}, checkin:{day:0, lastClaimDate:null}, allies,
    titleChoice:0, titleColumn:true, bossesBeaten:0, bossesColumn:true,
  }, dungeon:{level: cfg.dungeonLevel, floors:[[{type: cfg.node || 'jefe', done:false}]], atFloor:0, atNode:0, visited:{}, allyHP:{}, allyMP:{}, allySpirit:{}}, log:[]};
  return {st, petPool};
}
async function simOneFight(cfg){
  const {st, petPool} = simBuildState(cfg);
  state = st;
  if(cfg.petRarity !== 'none') petPool.slice(0, maxPetSlots()).forEach(t=>{ state.char.pets.owned[t.id] = 1; state.char.pets.equipped.push(t.id); });
  ensureSoulSlots();
  const d0 = derived();
  state.char.curHP = d0.maxHP; state.char.curSta = d0.maxSta; state.char.curSpi = d0.maxSpi;
  simOutcome = null; combat = null;
  const node = state.dungeon.floors[0][0], f = numFloorsForLevel(cfg.dungeonLevel) - 1;
  startCombat(buildEncounterGroup(node.type, f, cfg.dungeonLevel), node);
  const skillIds = style().skills.concat(state.char.level >= LEVEL_60_MILESTONE ? [ULTIMATE_BY_STYLE[state.char.style]] : []);
  let guard = 0;
  while(combat && !combat.over && !simOutcome && guard++ < 400){
    const tc = combat.turnCount, d = derived();
    const potion = state.char.inventory.find(i=> i.kind === 'potion' && i.potionId === 'vida_mayor' && i.qty > 0);
    if(potion && state.char.curHP / d.maxHP < 0.35){ await usePotionInCombat('vida_mayor'); }
    else {
      // la habilidad de daño más fuerte que se pueda pagar y usar desde donde está
      const ok = (id)=>{
        const sk = SKILLS[id]; if(!sk || !sk.mult) return false;
        if(sk.ultimate && ((ULTIMATE_MAX_USES - (state.dungeon.ultimateUses||0)) <= 0 || (state.dungeon.ultimateCooldown||0) > 0)) return false;
        if(sk.cost && (sk.cost.tipo === 'estamina' ? state.char.curSta : state.char.curSpi) < effectiveSkillCost(id, sk)) return false;
        if(sk.requiresPos && combat.playerPos !== sk.requiresPos && !sk.penaltyIfFrente) return false;
        return true;
      };
      const best = skillIds.filter(ok).sort((a, b)=> (SKILLS[b].mult||0) - (SKILLS[a].mult||0))[0] || 'ataque_basico';
      const idx = resolvedTargetMode(SKILLS[best]) === 'any' ? autoPickEnemyIndex() : null;
      await playerUseSkill(best, idx);
      // si por lo que sea no consumió el turno, ataque básico para no quedar en bucle
      if(combat && !combat.over && !simOutcome && combat.turnCount === tc) await playerUseSkill('ataque_basico', resolvedTargetMode(SKILLS.ataque_basico) === 'any' ? autoPickEnemyIndex() : null);
      if(combat && !combat.over && !simOutcome && combat.turnCount === tc){ combat.turnCount++; await endPlayerTurn(); }
    }
    checkCombatEnd();
  }
  return {win: simOutcome === 'win', turns: combat ? combat.turnCount : 0, hp: d0.maxHP, boss: combat && combat.enemies[0] ? {name: combat.enemies[0].name, maxHP: combat.enemies[0].maxHP, atk: combat.enemies[0].atk} : null};
}
// Juega un combate ya iniciado hasta que termina (misma política que simOneFight).
async function simFightLoop(){
  const skillIds = style().skills.concat(state.char.level >= LEVEL_60_MILESTONE ? [ULTIMATE_BY_STYLE[state.char.style]] : []);
  let guard = 0;
  simOutcome = null;
  while(combat && !combat.over && !simOutcome && guard++ < 400){
    const tc = combat.turnCount, d = derived();
    const potion = state.char.inventory.find(i=> i.kind === 'potion' && i.potionId === 'vida_mayor' && i.qty > 0);
    if(potion && state.char.curHP / d.maxHP < 0.35){ await usePotionInCombat('vida_mayor'); }
    else {
      const ok = (id)=>{
        const sk = SKILLS[id]; if(!sk || !sk.mult) return false;
        if(sk.ultimate && ((ULTIMATE_MAX_USES - (state.dungeon.ultimateUses||0)) <= 0 || (state.dungeon.ultimateCooldown||0) > 0)) return false;
        if(sk.cost && (sk.cost.tipo === 'estamina' ? state.char.curSta : state.char.curSpi) < effectiveSkillCost(id, sk)) return false;
        if(sk.requiresPos && combat.playerPos !== sk.requiresPos && !sk.penaltyIfFrente) return false;
        return true;
      };
      const best = skillIds.filter(ok).sort((a, b)=> (SKILLS[b].mult||0) - (SKILLS[a].mult||0))[0] || 'ataque_basico';
      await playerUseSkill(best, resolvedTargetMode(SKILLS[best]) === 'any' ? autoPickEnemyIndex() : null);
      if(combat && !combat.over && !simOutcome && combat.turnCount === tc) await playerUseSkill('ataque_basico', resolvedTargetMode(SKILLS.ataque_basico) === 'any' ? autoPickEnemyIndex() : null);
      if(combat && !combat.over && !simOutcome && combat.turnCount === tc){ combat.turnCount++; await endPlayerTurn(); }
    }
    checkCombatEnd();
  }
  return simOutcome === 'win';
}
// Recorre UN nivel entero del laberinto (todas sus salas hasta el guardián),
// arrastrando vida, MP, pociones y bajas de aliados de sala en sala, como en
// el juego. Ruta: descanso si va herido, si no evita la élite cuando puede.
async function simLevelOnce(cfg){
  const {st, petPool} = simBuildState(cfg);
  state = st;
  if(cfg.petRarity !== 'none') petPool.slice(0, maxPetSlots()).forEach(t=>{ state.char.pets.owned[t.id] = 1; state.char.pets.equipped.push(t.id); });
  ensureSoulSlots();
  const d0 = derived();
  state.char.curHP = d0.maxHP; state.char.curSta = d0.maxSta; state.char.curSpi = d0.maxSpi;
  const dg = Object.assign(generateDungeon(cfg.dungeonLevel), {allyHP:{}, allyMP:{}, allySpirit:{}});
  state.dungeon = dg; combat = null;
  const tally = {combate:[0,0], elite:[0,0], jefe:[0,0]};
  for(let f = 1; f < dg.floors.length; f++){
    const options = dg.floors[f].map((node, n)=> ({node, n})).filter(o=> isNodeReachable(dg, f, o.n));
    const hurt = state.char.curHP / derived().maxHP < 0.6;
    const rank = (t)=> t === 'descanso' ? (hurt ? 0 : 2) : t === 'tesoro' ? 1 : t === 'combate' ? 3 : t === 'elite' ? 4 : 5;
    const pick = options.sort((a, b)=> rank(a.node.type) - rank(b.node.type))[0];
    dg.atFloor = f; dg.atNode = pick.n; dg.visited[f + '-' + pick.n] = true;
    const type = pick.node.type;
    if(type === 'descanso'){
      const d = derived();
      state.char.curHP = d.maxHP; state.char.curSta = d.maxSta; state.char.curSpi = d.maxSpi;
      dg.allyHP = {}; dg.allyMP = {}; dg.allySpirit = {};
      continue;
    }
    if(type === 'tesoro') continue;
    startCombat(buildEncounterGroup(type, f, cfg.dungeonLevel), pick.node);
    const won = await simFightLoop();
    tally[type][0]++; if(won) tally[type][1]++;
    if(!won) return {cleared:false, diedAt:type, tally};
    syncAllyHPToDungeon(); pick.node.done = true; combat = null;
  }
  return {cleared:true, diedAt:null, tally};
}
async function simLevels(cfg){
  const saved = {state, combat, beta: BETA_BALANCE};
  simMode = true; BETA_BALANCE = cfg.beta !== false;
  try{
    const n = cfg.n || 20; let cleared = 0; const died = {combate:0, elite:0, jefe:0}, fights = {combate:[0,0], elite:[0,0], jefe:[0,0]};
    for(let i = 0; i < n; i++){
      const r = await simLevelOnce(cfg);
      if(r.cleared) cleared++; else died[r.diedAt]++;
      Object.keys(fights).forEach(k=>{ fights[k][0] += r.tally[k][0]; fights[k][1] += r.tally[k][1]; });
    }
    const pct = (a)=> a[0] ? Math.round(a[1]/a[0]*100) : null;
    return {style: cfg.style, dungeonLevel: cfg.dungeonLevel, n, clear: Math.round(cleared/n*100), muereEn: died, ganaCombate: pct(fights.combate), ganaElite: pct(fights.elite), ganaGuardian: pct(fights.jefe)};
  } finally { simMode = false; BETA_BALANCE = saved.beta; state = saved.state; combat = saved.combat; }
}
async function simRun(cfg){
  const saved = {state, combat, beta: BETA_BALANCE};
  simMode = true; BETA_BALANCE = cfg.beta !== false;
  try{
    const n = cfg.n || 50; let wins = 0, turns = 0, last = null;
    for(let i = 0; i < n; i++){ last = await simOneFight(cfg); if(last.win) wins++; turns += last.turns; }
    return {style: cfg.style, level: cfg.level, dungeonLevel: cfg.dungeonLevel, n, winRate: Math.round(wins/n*100), avgTurns: +(turns/n).toFixed(1), playerHP: last.hp, boss: last.boss};
  } finally { simMode = false; BETA_BALANCE = saved.beta; state = saved.state; combat = saved.combat; }
}
if(/^(localhost|127\.0\.0\.1)$/.test(location.hostname)){
  window.__sim = simRun; window.__simLevel = simLevels;
  window.__historia = (level)=> showStoryScenes(level, ()=>{});
  // Vista de prueba sin iniciar sesión: arma un personaje de mentira (no guarda
  // nada: save() falla sin sesión) y abre una pantalla. __vista('cronicas','bestiario'),
  // __vista('inv','caidos'), __vista('flash').
  window.__vista = (view, tab)=>{
    const {st, petPool} = simBuildState({style:'pesada', level:30, dungeonLevel:22});
    state = st; state.log = state.log || [];
    petPool.slice(0, 6).forEach((t, i)=>{ state.char.pets.owned[t.id] = 1; if(i < 2) state.char.pets.equipped.push(t.id); });
    state.char.bossesBeaten = 1; state.char.bestiary = ['larva_fase','la_costura','quimera_disonante','sin_forma','raiz_desenterrada','madre_micelio','tarantula_cazadora','viuda_alfa','reina_telaranha','loba_acantilado','alfa_manada'];
    showScreen('screen-game');
    if(view === 'cronicas'){ cronTab = tab || 'historia'; renderCronicas(); }
    else if(view === 'inv'){ invOpen = true; invTab = tab || 'mochila'; renderInventory(); }
    else if(view === 'mitico'){ const t = petTpl(MYTHIC_PET_IDS[0]); showMythicReveal({id:t.id, tpl:t, isDup:false}); }
    else if(view === 'aviso'){ showMythicBanner({nickname:'Trinity', pet_id: MYTHIC_PET_IDS[0]}); document.getElementById('main-panel').innerHTML = `<div class="sn-name">Sim${renownBadge(4)}${mythicBadge(true)}</div>`; }
    else if(view === 'flash'){ combat = combat || {}; document.getElementById('main-panel').innerHTML = '<div id="battle-stage-mount" style="height:300px;background:#222"></div>'; const pt = equippedPets()[0]; petFlashFromLog(`<b>${pt.name}</b> se activa (Prueba): recuperas 120 de vida.`); }
  };
  window.__simDot = DOT_ENEMY;
  window.__bestiary = DECADE_BESTIARY; // para probar ajustes de un enemigo en las simulaciones sin tocar el código // para comparar el daño por turno de Sangrado/Veneno en las simulaciones
  window.__creation = (step, st, r)=>{ crStep = step || 2; if(st) selStyle = st; if(r) selRace = r; showScreen('screen-create'); renderCreation(); };
  window.__simTuneBeta = (level, hp, atk)=>{ BETA_DECADE_BOSS_TUNING[level] = {hp, atk}; return BETA_DECADE_BOSS_TUNING[level]; };
  window.__simScaleBeta = (dec, kind, hp, atk)=>{ BETA_ENEMY_SCALE[dec] = Object.assign(BETA_ENEMY_SCALE[dec] && !BETA_ENEMY_SCALE[dec].hp ? BETA_ENEMY_SCALE[dec] : {}, {[kind]: {hp, atk}}); return BETA_ENEMY_SCALE; };
  window.__simCurveBeta = (styleId, idx, hp, dmg)=>{ CLASS_CURVE_BETA[styleId].hp[idx] = hp; CLASS_CURVE_BETA[styleId].dmg[idx] = dmg; return CLASS_CURVE_BETA[styleId]; };
  // multiplicadores temporales de vida/ataque para mobs que no son jefe de década, por década (índice 4 = 41-50, 5 = 51-60)
  window.__simScale = (dec, kind, hp, atk)=>{ DECADE_ENEMY_TUNING[dec] = Object.assign(DECADE_ENEMY_TUNING[dec] || {}, {[kind]: {hp, atk}}); return DECADE_ENEMY_TUNING; };
  // ajuste temporal de un jefe de década para probar valores sin editar el archivo
  window.__simTune = (level, hp, atk)=>{ DECADE_BOSS_TUNING[level] = {hp, atk}; return DECADE_BOSS_TUNING[level]; };
  // ídem para la curva de una senda en un punto de nivel (índice 5 = nivel 50, 6 = nivel 60)
  window.__simCurve = (styleId, idx, hp, dmg)=>{ CLASS_CURVE[styleId].hp[idx] = hp; CLASS_CURVE[styleId].dmg[idx] = dmg; return CLASS_CURVE[styleId]; };
}
function checkCombatEnd(){
  if(!combat || combat.over) return;
  if(state.char.curHP<=0){
    combat.over = true;
    syncAllyHPToDungeon();
    if(simMode){ simOutcome = 'loss'; return; }
    log('Caes al suelo. La oscuridad del laberinto te envuelve...');
    handleDefeat();
    return;
  }
  processEnemyDeaths();
  if(livingEnemies().length===0){
    combat.over = true;
    if(simMode){ simOutcome = 'win'; return; }
    syncAllyHPToDungeon();
    handleVictory();
  }
}

// Fragmentos de jefe de década — un tipo de material por década (piso que
// cierra esa década), usados como ingrediente de la Forja Legendaria (ver
// TIER_S_RECIPE). No se venden ni se compran con oro/Sellos, solo caen del
// jefe de década correspondiente.
// Sube de nivel al personaje si su xp ya alcanza, sin importar de dónde
// vino esa xp (victoria en combate, misión del Gremio reclamada, etc.) —
// antes solo handleVictory() lo hacía, así que reclamar una misión que
// completaba la xp necesaria dejaba la xp acumulada sin aplicar hasta el
// próximo combate. Pedido explícito 2026-09-27.
function applyCharLevelUps(){
  let leveled = false;
  // curva pedida: nivel 1→2 necesita 5 exp, 2→3 necesita 10, 3→4 necesita 20 (se duplica cada nivel).
  // Tope de nivel de personaje: 60.
  let xpNeeded = xpNeededForLevel(state.char.level);
  while(state.char.level < CHAR_LEVEL_CAP && state.char.xp >= xpNeeded){
    state.char.xp -= xpNeeded;
    state.char.level += 1;
    leveled = true;
    xpNeeded = xpNeededForLevel(state.char.level);
  }
  if(state.char.level >= CHAR_LEVEL_CAP) state.char.xp = 0;
  if(leveled){
    const d = derived();
    state.char.curHP = d.maxHP; state.char.curSta = d.maxSta; state.char.curSpi = d.maxSpi;
    log(`¡Subes a nivel ${state.char.level}! Tus estadísticas aumentan y te recuperas por completo.`);
    flashLevelUp(state.char.level);
  }
  return leveled;
}

const DECADE_BOSS_FRAGMENTS = {
  10: {id:'ogro', name:'Fragmento del Ogro', icon:'👺'},
  20: {id:'matriarca_escarlata', name:'Fragmento de la Matriarca Escarlata', icon:'🕷️'},
  30: {id:'riakis', name:'Fragmento de Riakis', icon:'👁️'},
  40: {id:'usurpador', name:'Fragmento del Usurpador', icon:'🎭'},
  50: {id:'custodio_isla', name:'Fragmento del Custodio de la Isla', icon:'🏝️'},
  60: {id:'storm_gush', name:'Fragmento de Storm Gush', icon:'🔱'},
};
function handleVictory(){
  stopBossAudio();
  const isBoss = combat.node.type==='jefe';
  const isElite = combat.node.type==='elite';
  const level = state.dungeon.level || 1;
  const rewardMult = 1 + (level-1)*0.08; // los niveles más duros pagan algo mejor (solo aplica al oro)
  const perKillXP = isBoss ? guardianXP(level) : isElite ? eliteXP(level) : mobXP(level);
  // Las invocaciones/señuelos no cuentan para la recompensa (2026-10-02).
  const rewardEnemyCount = Math.max(1, combat.enemies.filter(e=>!e.summoned).length);
  const xpGain = Math.max(1, Math.round(perKillXP * xpGroupMultiplier(rewardEnemyCount) * (race().id==='humano'?1.1:1) * xpGapMultiplier() * earlyXpBoost(level) * XP_GLOBAL_BOOST));
  const goldGain = Math.round((rnd(6,14)*rewardEnemyCount + (isBoss?60:isElite?20:0)) * rewardMult * (1 + titlePerks().gold));
  const myXpGain = Math.max(1, Math.round(xpGain * (1 + titlePerks().xp))); // el bono del título es solo del jugador
  state.char.xp += myXpGain;
  state.char.gold += goldGain;
  log(`Victoria. +${myXpGain} experiencia, +${goldGain} de oro.`);
  combat.node.done = true;

  // La experiencia no se reparte: cada aliado recibe el mismo xpGain completo
  // que tú, no una fracción — así todos evolucionan al mismo ritmo que el equipo.
  advanceAllyXp(xpGain);

  recordBestiaryKills(combat.enemies);
  advanceMissionsFor('win_battles', 1);
  if(isElite) advanceMissionsFor('kill_elites', 1);
  if(isBoss) advanceMissionsFor('defeat_guardian', 1);

  // Botín: tabla plana de drop (FLAT_GEAR_TABLE/FLAT_STONE_TABLE), la misma
  // para cualquier enemigo — el juego es de grindeo, así que cada enemigo
  // derrotado tira su propia chance de soltar equipo. Un jefe de década
  // (nivel múltiplo de 10) tira el doble de veces. Las piedras de alma están
  // limitadas a una sola por batalla (sin importar cuántos enemigos o tiradas
  // haya) para que no caigan dos de golpe en un mismo combate.
  const isDecadeFinal = isBoss && level % 10 === 0;

  // Alerta de posible trampa (pedido explícito): a este ritmo es imposible
  // ganarle a un jefe de década, o a un guardián de piso de nivel 11 en
  // adelante, en 4 turnos propios o menos - los guardianes de los niveles
  // 1-9 quedan afuera a propósito porque esos sí son legítimamente tan
  // fáciles. Solo se REGISTRA para que lo revise un admin desde el panel
  // (loadFlaggedKills) - nunca banea sola: el turno se cuenta 100% del lado
  // del cliente (combat.turnCount en endPlayerTurn), así que alguien que
  // además de editar el HP del jefe también falsee este número se escapa
  // igual - esto agarra al que solo tocó el HP y no pensó en el contador.
  if(isBoss){
    // Desempate del ranking (pedido explícito 2026-10-07): entre dos personajes
    // en el mismo nivel va primero quien venció a su último guardián en menos
    // turnos. Se guarda el mejor intento contra el guardián más profundo.
    const turnsUsed = (combat.turnCount || 0) + 1;
    if(level > (state.char.recordTurnsLevel||0) || (level === state.char.recordTurnsLevel && turnsUsed < (state.char.recordTurns||Infinity))){
      state.char.recordTurnsLevel = level; state.char.recordTurns = turnsUsed;
    }
    const turnsThisFight = combat.turnCount || 0;
    const guardianTooDeepToRush = !isDecadeFinal && level >= 11;
    if(turnsThisFight <= 4 && (isDecadeFinal || guardianTooDeepToRush)){
      supabase.from('flagged_boss_kills').insert({
        character_id: state.char.id, user_id: currentUser.id, nickname: state.char.nickname,
        kind: isDecadeFinal ? 'jefe_decada' : 'guardian_piso',
        dungeon_level: level, turns: turnsThisFight
      }).then(({error})=>{
        if(error) console.error('No se pudo registrar la alerta de posible trampa:', error.message);
      });
    }
  }

  // Grietas (Capítulo IV, El Consejo del Laberinto) todavía no están
  // construidas - cuando existan, el jefe de una Grieta debe activar esto
  // también. Por ahora solo el jefe de década cuenta.
  const isRiftBoss = false;
  const stonesAllowedThisFight = isDecadeFinal || isRiftBoss;
  const rollCount = rewardEnemyCount * (isDecadeFinal ? 2 : 1);
  // El jefe de década del piso 10 es la única excepción al piso mínimo de
  // Raro/Único (C/B): es el primer vistazo real a esos rangos, incluso para
  // un personaje que llega ahí todavía por debajo del nivel 11.
  const bypassTiers = (isDecadeFinal && level===10) ? new Set(['raro','rango_b','C','B']) : null;
  let lootText = '';
  let gotRareGear = false;
  let gotRareStone = false;
  for(let i=0;i<rollCount;i++){
    // Rango gateado por el piso REAL de este combate (level = state.dungeon.level),
    // no por maxLevelUnlocked — bug real 2026-09-27 (ver el comentario igual
    // en el cofre, más arriba): maxLevelUnlocked nunca baja, así que grindear
    // un piso bajo con un personaje que ya pasó por pisos altos antes seguía
    // soltando Rango A donde no debería.
    const gearDrop = rollGearDropForLevel(level, state.dungeon.atFloor, bypassTiers);
    if(gearDrop){
      addToInventory(gearDrop);
      const line = `También obtienes: <b>${itemNameHTML(gearDrop)}</b> (guardado en la mochila).`;
      log(line);
      lootText += ' ' + line;
      advanceMissionsFor('find_equipment', 1);
      if(['rango_a','legendario','ss'].includes(gearDrop.rarity)){
        gotRareGear = true;
        flashRareDrop(gearDrop, RARITIES[gearDrop.rarity].name);
      }
    }
  }
  // Piedras de alma: solo caen del jefe de década o de un futuro jefe de
  // Rift - ningún otro combate (mob, élite, o guardián que no cierra década)
  // las tira, a pedido explícito. Ahí siempre cae una (drop asegurado,
  // pedido explícito 2026-09-18): a diferencia de un cofre, un jefe de
  // década ya nunca sale de la pelea con las manos vacías de piedras.
  if(stonesAllowedThisFight){
    const stoneDrop = rollGuaranteedStoneDropForLevel(level, bypassTiers);
    addToInventory(stoneDrop);
    const line = `También encuentras una piedra de alma: <b style="color:${SOUL_TIER_COLORS[stoneDrop.tier]};">${stoneDrop.name}</b>.`;
    log(line);
    lootText += ' ' + line;
    advanceMissionsFor('find_soul_stones', 1);
    if(['A','S','SS'].includes(stoneDrop.tier)){
      gotRareStone = true;
      flashRareDrop(stoneDrop, stoneDrop.tier);
    }
  }
  // Fragmentos de jefe de década — material de la Forja Legendaria (Tier S,
  // ver TIER_S_RECIPE/buyTierSWeapon/buyTierSStone). Uno garantizado por
  // cada jefe de década derrotado (pisos 10/20/30/40/50/60), pedido
  // explícito 2026-09-24: "comprado con sellos + los fragmentos del piso
  // 10, 20, 30... hasta el 60".
  if(isDecadeFinal && DECADE_BOSS_FRAGMENTS[level]){
    const frag = DECADE_BOSS_FRAGMENTS[level];
    addToInventory({kind:'fragmento', fragId:frag.id, name:frag.name, icon:frag.icon});
    const line = `También obtienes: <b>${frag.icon} ${frag.name}</b>.`;
    log(line);
    lootText += ' ' + line;
  }
  state.char.pityGear = gotRareGear ? 0 : (state.char.pityGear||0) + 1;
  // El contador de pity de piedras solo cuenta intentos reales (peleas donde
  // sí se pudo tirar una piedra) - de lo contrario cada mob normal diluiría
  // el umbral sin haber tenido ninguna chance real de soltar una.
  if(stonesAllowedThisFight) state.char.pityStone = gotRareStone ? 0 : (state.char.pityStone||0) + 1;

  applyCharLevelUps();

  if(isBoss){
    const clearedLevel = level;
    const wasFrontier = clearedLevel === maxLevelUnlocked();
    if(wasFrontier) state.char.maxLevelUnlocked = Math.min(LEVEL_CAP, clearedLevel+1);
    // Checkpoints: solo los jefes de década (piso 10, 20, 30...) habilitan un
    // punto de entrada nuevo, en el piso siguiente (11, 21, 31...). Si mueres
    // en el 15, tu próxima entrada igual arranca en el 11 - no hay checkpoint
    // a mitad de década, solo al cerrarla. Tope en LEVEL_CAP (bug real
    // 2026-09-26): derrotar a Storm Gush (piso 60, la última década
    // implementada) escribía un checkpoint "61" sin bestiario real detrás —
    // quien lo usaba quedaba atrapado en un bucle. Mismo Math.min que ya usa
    // maxLevelUnlocked justo arriba.
    if(isDecadeFinal){
      state.char.checkpointLevel = Math.min(LEVEL_CAP, Math.max(state.char.checkpointLevel||1, clearedLevel+1));
      noteDecadeBossBeaten(clearedLevel);
      // "El primer retornado": lo concede la base al guardar el jefe del piso
      // 100 (trigger de la migración 0032), así que se relee tras el guardado.
      if(clearedLevel===100 && state.char.bossesColumn){
        flushSave().then(()=> supabase.from('characters').select('first_retornado').eq('id', state.char.id).single())
          .then(r=>{ if(r && r.data && r.data.first_retornado){ state.char.firstRetornado = true; log('Eres el primero en volver del fondo del laberinto: recibes el título <b>El primer retornado</b>.'); renderAll(); } })
          .catch(()=>{});
      }
    }
    // Jefe de la década 30: el Sacerdote desbloquea su equipo Épico (A)
    // completo, sin importar su propio nivel — a diferencia de Raro/Único,
    // que sí dependen del nivel del aliado (ver checkAllyAutoGearByLevel).
    if(isDecadeFinal && clearedLevel===30){
      (state.char.allies||[]).filter(a=>a.role==='sacerdote' && (a.auto_gear_tier||'none')!=='rango_a' && (a.auto_gear_tier||'none')!=='legendario')
        .forEach(a=> grantAllyAutoGear(a,'rango_a'));
    }
    // Jefe de la década 60 (Storm Gush): el Sacerdote desbloquea su set
    // Tier S completo — pedido explícito 2026-09-24, mismo criterio que el
    // Épico de arriba (no depende de su propio nivel de aliado).
    if(isDecadeFinal && clearedLevel===60){
      (state.char.allies||[]).filter(a=>a.role==='sacerdote' && (a.auto_gear_tier||'none')!=='legendario')
        .forEach(a=> grantAllyAutoGear(a,'legendario'));
    }
    log(`Derrotas al guardián del nivel ${clearedLevel}.`);

    const canContinue = clearedLevel < LEVEL_CAP;
    const bodyText = (canContinue
      ? `Has vencido al guardián del nivel ${clearedLevel}. Puedes seguir adentrándote al nivel ${clearedLevel+1}, o retirarte a la ciudad conservando todo tu botín.`
      : `Has vencido al guardián del nivel ${clearedLevel}, el último conocido del laberinto. Retírate a la ciudad conservando todo tu botín.`) + lootText;
    const buttons = [];
    if(canContinue){
      buttons.push({label:`Continuar al nivel ${clearedLevel+1}`, primary:true, onClick:()=>{
        combat = null;
        // Los usos/enfriamiento de la ultimate son "por entrada al laberinto",
        // no por nivel - se llevan al nuevo state.dungeon en vez de resetear
        // acá (sí se resetean al entrar fresco desde la ciudad, porque ese
        // generateDungeon(1) nunca pasa por este bloque).
        const prevUltimateUses = state.dungeon.ultimateUses || 0;
        const prevUltimateCooldown = state.dungeon.ultimateCooldown || 0;
        state.dungeon = generateDungeon(clearedLevel+1);
        state.dungeon.ultimateUses = prevUltimateUses;
        state.dungeon.ultimateCooldown = prevUltimateCooldown;
        updateRecord(clearedLevel+1, 0);
        const d = derived();
        state.char.curHP = d.maxHP; state.char.curSta = d.maxSta; state.char.curSpi = d.maxSpi;
        playDungeonAudio(clearedLevel+1);
        log(`Avanzas al nivel ${clearedLevel+1} del laberinto.`);
        renderAll(); save();
      }});
    }
    buttons.push({label:'Retirarse a la ciudad', primary:!canContinue, onClick:()=>{
      const tax = Math.round(state.char.gold*0.1 * (1 - titlePerks().tax));
      state.char.gold -= tax;
      log(`Regresas a la ciudad conservando tu botín. Se te cobran ${tax} de oro en impuestos.`);
      combat = null;
      state.dungeon = null;
      payAlliesOnExit();
      stopDungeonAudio();
      playLoginAudio();
      renderAll(); save();
    }});
    const storyLevel = pendingStoryLevel; pendingStoryLevel = 0;
    if(storyLevel && STORY_SCENES[storyLevel]) showStoryScenes(storyLevel, ()=> showChoiceOverlay('Guardián derrotado', bodyText, buttons));
    else showChoiceOverlay('Guardián derrotado', bodyText, buttons);
    // flushSave() inmediato, no el save() debounced de siempre (bug real
    // reportado 2026-09-27, "SHOSHIROHOSHINA venció al guardián del piso 40
    // pero nunca se le desbloqueó el checkpoint 41, y su nivel volvió a
    // bajar de 34 a 27 al reingresar"): checkpointLevel y level suben acá
    // mismo, arriba, pero con el save() de siempre esa escritura quedaba
    // pendiente 1.5s en el timer — si el jugador cerraba la pestaña/la app
    // pasaba a segundo plano (el navegador puede descargarla, sobre todo en
    // móvil) antes de que el timer disparara, todo ese progreso se perdía
    // por completo y el personaje volvía a la última versión SÍ guardada.
    // Mismo motivo que pullGacha()/grantFreePetPulls(): un logro de este
    // peso (cierre de década) no puede depender de un temporizador.
    flushSave();
    return;
  }

  combat = null;
  renderAll();
  save();
}

// Antes se perdía la mitad del oro al caer - subido a un castigo más serio
// (petición del 2026-09-14) para que la economía de aliados y el gasto en
// pociones durante una corrida difícil pesen de verdad.
const DEFEAT_GOLD_LOSS_PCT = 60;
// Bug corregido 2026-10-02: la derrota se aplicaba recién al pulsar
// "Continuar". Si el jugador recargaba en esa pantalla, volvía al combate con
// 0 de vida (combate recuperado) y podía tomarse una poción para "revivir"
// sin perder nada. Ahora la derrota se aplica y se guarda AL INSTANTE; el
// aviso solo informa.
function handleDefeat(){
  stopBossAudio();
  const lostItems = state.char.inventory.filter(i=>i.kind==='equip').length;
  state.char.inventory = state.char.inventory.filter(i=>i.kind!=='equip');
  state.char.gold = Math.round(state.char.gold*(1-DEFEAT_GOLD_LOSS_PCT/100));
  const d = derived();
  state.char.curHP = Math.round(d.maxHP*0.5);
  state.char.curSta = d.maxSta; state.char.curSpi = d.maxSpi;
  state.dungeon = null;
  payAlliesOnExit();
  flushSave();
  showOverlay('Caído en el laberinto', `Tu cuerpo cede y el laberinto te expulsa antes del final. Pierdes el equipo suelto que llevabas en la mochila y el ${DEFEAT_GOLD_LOSS_PCT}% de tu oro. Lo que hayas guardado en el Hogar sigue a salvo.`, ()=>{
    combat = null;
    stopDungeonAudio();
    playLoginAudio();
    if(lostItems>0) log(`Pierdes ${lostItems} objeto(s) de equipo que llevabas en la mochila.`);
    renderAll();
    save();
  });
}

function showOverlay(title, text, onClose){
  const div = document.createElement('div');
  div.className = 'overlay-msg';
  div.innerHTML = `<div class="overlay-card"><h2>${title}</h2><p>${text}</p><button class="btn-main" id="ov-close">Continuar</button></div>`;
  document.body.appendChild(div);
  div.querySelector('#ov-close').onclick = ()=>{
    div.remove();
    onClose();
  };
}

function showChoiceOverlay(title, text, buttons){
  const div = document.createElement('div');
  div.className = 'overlay-msg';
  const btnHTML = buttons.map((b,i)=>`<button class="btn-main${b.primary?'':' secondary-choice'}" data-ov-btn="${i}">${b.label}</button>`).join('');
  div.innerHTML = `<div class="overlay-card"><h2>${title}</h2><p>${text}</p><div style="display:flex; flex-wrap:wrap; gap:10px; justify-content:center;">${btnHTML}</div></div>`;
  document.body.appendChild(div);
  buttons.forEach((b,i)=>{
    div.querySelector(`[data-ov-btn="${i}"]`).onclick = ()=>{
      div.remove();
      b.onClick();
    };
  });
}

/* ============================================================
   TUTORIAL — omitible, se puede volver a abrir desde "¿Cómo jugar?"
   ============================================================ */
const TUTORIAL_SLIDES = [
  {title:'Bienvenido a Dungeon & Stone', body:'Un tutorial rápido de las pantallas y mecánicas principales. Puedes saltarlo cuando quieras, y volver a verlo después desde el botón "¿Cómo jugar?" en la ciudad.'},
  {title:'La ciudad', body:'Tu base entre expediciones. Desde aquí descansas, entras al laberinto, y accedes al Hogar, la Tienda, el Ranking, el Gremio y la Taberna.'},
  {title:'Descansar', body:'Restaura toda tu vida, MP y espíritu antes de partir. Gratis y sin límite de usos en la ciudad.'},
  {title:'Entrar al laberinto', body:'Avanzas piso a piso por sendas: solo puedes moverte a la senda igual o adyacente a la tuya, nunca saltar de un extremo al otro. Cada piso tiene combates, cofres, descansos y de vez en cuando un élite.'},
  {title:'El Hogar', body:'Guarda equipo, pociones y oro. Nada de lo que dejes aquí se pierde si mueres en el laberinto — solo se pierde lo que llevas encima.'},
  {title:'El Gremio', body:'Un tablón de 10 misiones que se refresca cada 12 horas. Complétalas para ganar oro, experiencia y Sellos del Laberinto, canjeables por equipo Único y Épico. Si una misión no te gusta, puedes refrescarla hasta 3 veces por tablón.'},
  {title:'La Taberna', body:'Desde nivel 10, recluta aliados — guerrero, arquero, asesino, mago o sacerdote — pagando oro. Pelean junto a ti de forma automática: el que tiene rol de tanque ocupa el Frente y absorbe los golpes por ti. Los sacerdotes solo existen como aliados, nunca como senda de combate propia: cuidan a quien pelea, no bajan a pelear ellos mismos.'},
  {title:'Mantener a tus aliados', body:'Cada aliado te cobra un salario cada vez que sales del laberinto. Pagarlo sube un poco su satisfacción; no poder pagarlo la baja bastante, cada vez más si se repite. Si su satisfacción cae demasiado, deserta y lo pierdes para siempre — no vuelve a estar disponible, ni siquiera despidiéndolo tú antes.'},
  {title:'Otorgar ofrenda', body:'El Ygdrasil de la ciudad entrega Caídos del Laberinto a cambio de oro, Sellos o una recarga. Cada uno se equipa en un espacio pasivo y aporta su propio don mientras lo lleves — no combaten por su cuenta ni ocupan un puesto de Frente o Retaguardia.'},
  {title:'Ranking', body:'Tu récord personal (el piso más profundo que has alcanzado) y el top 10 de todos los jugadores.'},
  {title:'Combate por turnos', body:'Cada turno eliges una habilidad o acción. Frente y Retaguardia son tus dos posiciones: la mayoría de golpes físicos fuertes exigen estar en el Frente; la Retaguardia favorece las habilidades a distancia.'},
  {title:'MP y Espíritu', body:'El MP (lo alimenta Habilidad) paga casi todas las habilidades de ataque: Guerrero, Asesino, Arquero, Mago y Hechicero. El Espíritu (lo alimenta Espíritu) paga las del Paladín y las de utilidad como Grito de guerra o Marca del cazador. Reposicionarte cambia entre Frente y Retaguardia, y ocupa tu turno.'},
  {title:'Frente y Retaguardia, con aliados', body:'Cuando tengas un aliado tanque en el Frente, los enemigos no podrán llegar hasta tu Retaguardia sin pasar por él primero — igual que tú no puedes golpear al enemigo de atrás sin resolver primero al de adelante. Posicionarte bien pesará tanto como golpear fuerte.'},
  {title:'Defenderse', body:'Te da al menos 50% de probabilidad de esquivar el próximo golpe, y si aun así te alcanzan, el daño se reduce a la mitad. Es una opción real cuando la pelea se pone difícil, no solo un último recurso.'},
  {title:'Kit de habilidades', body:'Al nivel 30, las 3 habilidades de tu senda se vuelven más fuertes. Al nivel 60 desbloqueas una 4ta habilidad, tu ultimate — mucho más poderosa, pero limitada a 3 usos por cada entrada al laberinto y con 5 turnos de enfriamiento tras usarla.'},
  {title:'Buena suerte, viajero', body:'Eso es todo. El laberinto tiene 60 pisos conocidos, y cada década esconde algo distinto. A partir de aquí, el resto lo descubres jugando.'}
];
let tutorialStep = 0;
function showTutorial(){
  tutorialStep = 0;
  if(document.getElementById('tutorial-overlay')) return;
  const div = document.createElement('div');
  div.className = 'overlay-msg';
  div.id = 'tutorial-overlay';
  document.body.appendChild(div);
  renderTutorialStep();
}
function renderTutorialStep(){
  const div = document.getElementById('tutorial-overlay');
  if(!div) return;
  const slide = TUTORIAL_SLIDES[tutorialStep];
  const isLast = tutorialStep === TUTORIAL_SLIDES.length-1;
  const dots = TUTORIAL_SLIDES.map((_,i)=>
    `<span style="width:6px; height:6px; border-radius:50%; display:inline-block; margin:0 3px; background:${i===tutorialStep?'var(--bronze-light)':'var(--border)'};"></span>`
  ).join('');
  div.innerHTML = `<div class="overlay-card">
    <h2>${slide.title}</h2>
    <p>${slide.body}</p>
    <div style="margin:12px 0;">${dots}</div>
    <div style="display:flex; flex-wrap:wrap; gap:10px; justify-content:center;">
      <button class="btn-main secondary-choice" id="tut-skip">Saltar</button>
      ${tutorialStep>0 ? `<button class="btn-main secondary-choice" id="tut-prev">Anterior</button>` : ''}
      <button class="btn-main" id="tut-next">${isLast ? 'Comenzar' : 'Siguiente'}</button>
    </div>
  </div>`;
  document.getElementById('tut-skip').onclick = closeTutorial;
  const prevBtn = document.getElementById('tut-prev');
  if(prevBtn) prevBtn.onclick = ()=>{ tutorialStep -= 1; renderTutorialStep(); };
  document.getElementById('tut-next').onclick = ()=>{
    if(isLast) closeTutorial();
    else { tutorialStep += 1; renderTutorialStep(); }
  };
}
function closeTutorial(){
  const div = document.getElementById('tutorial-overlay');
  if(div) div.remove();
  try{ localStorage.setItem('dsTutorialSeen','1'); }catch(e){}
}

/* ============================================================
   RENDER: COMBAT
   ============================================================ */
// Evita que dos acciones se resuelvan superpuestas mientras la secuencia
// animada de un turno (aliados y enemigos actuando uno por uno) sigue en
// curso - los botones ya quedan disabled en renderCombat mientras
// combat.turnBusy es true, esto es el candado real detrás de eso.
async function guardedPlayerUseSkill(skillId, targetIdx){
  if(!combat || combat.turnBusy) return;
  combat.turnBusy = true;
  combat.lastActor = null; combat.lastAction = null;
  try{ await playerUseSkill(skillId, targetIdx); }
  finally{
    // El último render real fue el de renderAll() al final de
    // processEnemyTurns, con turnBusy todavía en true (recién se libera
    // acá) - sin este re-render los botones se quedaban disabled para
    // siempre tras el primer turno, aunque combat.turnBusy ya fuera false.
    if(combat){ combat.turnBusy = false; if(!combat.over) renderCombat(); }
  }
}
async function guardedUsePotionInCombat(potionId){
  if(!combat || combat.turnBusy) return;
  combat.turnBusy = true;
  combat.lastActor = null; combat.lastAction = null;
  try{ await usePotionInCombat(potionId); }
  finally{
    if(combat){ combat.turnBusy = false; if(!combat.over) renderCombat(); }
  }
}
// Nivel de módulo (no un closure de renderCombat) a propósito: tanto el
// click de los botones del menú de combate como los atajos de teclado
// (ver wireGlobalCombatShortcuts) necesitan poder llamar exactamente a la
// misma lógica de "usar esta habilidad respetando Apuntado ON/OFF". El
// objetivo pendiente vive en combat.pendingSkill (no en una variable local)
// para que el click en el canvas de battleStage.js -que se registra una
// sola vez, no en cada render- pueda leer el valor vigente en el momento
// del click.
function useSkillFromMenu(sid){
  const sk = SKILLS[sid];
  const tMode = resolvedTargetMode(sk);
  combat.pendingSkill = null;
  combat.pendingTargetFilter = null;
  if(!getManualAim()){
    // Apuntado OFF: se resuelve solo, nunca pide click. 'front'/'all'/
    // 'self' ya se auto-resuelven al pasar targetIdx=null (ver
    // playerUseSkill); 'any' necesita un objetivo elegido a mano.
    if(tMode==='any'){
      const idx = autoPickEnemyIndex();
      if(idx<0){ log('No hay ningún objetivo disponible.'); return; }
      guardedPlayerUseSkill(sid, idx);
    } else {
      guardedPlayerUseSkill(sid, null);
    }
    return;
  }
  if(tMode==='any'){
    combat.pendingSkill = sid;
    log(`Elige un objetivo para ${sk.name}.`);
  } else if(tMode==='front' && playerFrontTargetIndices().length>1){
    // Dos o más objetivos elegibles a la vez (línea frontal si sigue viva,
    // o toda la retaguardia si ya no queda nadie al frente): se pide el
    // mismo click de objetivo que 'any', pero restringido a ese conjunto
    // (ver pendingTargetFilter, leído en onTarget más abajo).
    combat.pendingSkill = sid;
    combat.pendingTargetFilter = 'front';
    log(`Elige a cuál enemigo atacar con ${sk.name}.`);
  } else {
    guardedPlayerUseSkill(sid, null);
  }
}

function renderCombat(){
  if(simMode) return;
  // Tras una derrota el laberinto ya se cerró (handleDefeat) pero el combate
  // sigue en pantalla hasta pulsar "Continuar": no hay nada que redibujar.
  if(!state || !state.dungeon || !combat) return;
  const d = derived();
  const s = style();
  const skillIds = s.skills.concat(state.char.level>=LEVEL_60_MILESTONE ? [ULTIMATE_BY_STYLE[s.id]] : []);

  // La visualización de enemigos/aliados/jugador ahora la dibuja
  // battleStage.js sobre un <canvas> (sprite si existe, ícono si no, en la
  // misma escena) en vez de tarjetas HTML — ver syncBattleStage() más abajo.
  // combat.lastActor/combat.lastAction se siguen usando para animar (ver
  // resolveAllyTurns/processEnemyTurns/playerUseSkill), solo que ya no
  // arman HTML acá.
  const playerStatusChips = renderStatusChips(combat.playerStatuses);

  // Metadata compartida por el botón de arriba (Habilidades) y por cada
  // ítem del submenú — mismo cálculo de costo/deshabilitado que antes,
  // solo que ahora también lo usa el botón superior para saber si mostrar
  // el submenú deshabilitado (sin habilidades usables) o no.
  function skillMeta(sid){
    const sk = SKILLS[sid];
    let disabled = !!combat.turnBusy;
    if(sk.cost){
      const pool = sk.cost.tipo==='estamina'?state.char.curSta:state.char.curSpi;
      if(pool < effectiveSkillCost(sk.id, sk)) disabled = true;
    }
    if(sk.requiresPos && combat.playerPos!==sk.requiresPos && !sk.penaltyIfFrente) disabled = true;
    let costText = sk.cost ? `${sk.cost.valor} ${COST_LABELS[sk.cost.tipo] || sk.cost.tipo}` : 'Gratis';
    if(sk.ultimate){
      const usesLeft = ULTIMATE_MAX_USES - (state.dungeon.ultimateUses||0);
      const cooldown = state.dungeon.ultimateCooldown||0;
      if(usesLeft<=0 || cooldown>0) disabled = true;
      costText = cooldown>0 ? `Enfriando (${cooldown} turno${cooldown===1?'':'s'})` : `${usesLeft}/${ULTIMATE_MAX_USES} usos`;
    }
    return {sk, disabled, costText};
  }

  const skillSubmenuHTML = skillIds.map(sid=>{
    const {sk, disabled, costText} = skillMeta(sid);
    const descText = typeof sk.desc==='function' ? sk.desc() : sk.desc;
    return `<div class="submenu-item ${disabled?'disabled':''} ${sk.ultimate?'ultimate-btn':''}" data-skill="${sid}">
      <span class="item-name">${sk.ultimate?'⚡ ':''}${sk.name} — ${costText}${sk.requiresPos?(' · requiere '+ (sk.requiresPos==='frente'?'Frente':'Retaguardia')):''}</span>
      <span>${descText}</span>
    </div>`;
  }).join('');

  const potionItems = state.char.inventory.filter(i=>i.kind==='potion');
  const potionSubmenuHTML = potionItems.length ? potionItems.map(it=>{
    const tpl = POTION_TEMPLATES[it.potionId];
    return `<div class="submenu-item ${combat.turnBusy?'disabled':''}" data-potion="${it.potionId}">
      <span class="item-name"><img src="src/assets/pociones/arte/${it.potionId}.jpg?v=1" alt="" style="width:18px; height:18px; object-fit:cover; border-radius:3px; vertical-align:-4px; margin-right:3px;" onerror="this.replaceWith('${tpl.icon} ')">${tpl.name} x${it.qty}</span>
      <span>${tpl.desc}</span>
    </div>`;
  }).join('') : `<p class="inv-empty-msg">No tienes pociones para usar.</p>`;

  const combatSpeed = getCombatSpeed();
  const manualAim = getManualAim();
  const playerShieldAmt = combat.playerShield||0;
  const hpScale = d.maxHP + playerShieldAmt;
  const hpPct = Math.max(0, state.char.curHP/hpScale*100);
  const shieldPct = Math.max(0, playerShieldAmt/hpScale*100);
  const hpNumLabel = playerShieldAmt>0 ? `${state.char.curHP} (${playerShieldAmt}) / ${d.maxHP}` : `${state.char.curHP} / ${d.maxHP}`;
  const stPct = Math.max(0, state.char.curSta/d.maxSta*100);
  const spPct = Math.max(0, state.char.curSpi/d.maxSpi*100);
  // El "objetivo" que se muestra es el mismo que recibiría un golpe básico
  // ahora mismo: el enemigo de línea frontal vivo, o si no hay ninguno, el
  // primero que quede — no es necesariamente a quién le pegaste último.
  const targetEnemy = (combat.enemies||[]).find(e=>e.hp>0 && e.tpl && e.tpl.frontline)
    || (combat.enemies||[]).find(e=>e.hp>0);
  // Íconos SVG del panel — puerto exacto de phud-icon en prototype-2d/combat.html.
  const PHUD_ICON_HP = `<svg viewBox="0 0 16 16" width="12" height="12"><path fill="currentColor" d="M8 14C8 14 2 9.6 2 5.9 2 3.7 3.8 2 5.9 2 7 2 8 2.7 8 2.7S9 2 10.1 2C12.2 2 14 3.7 14 5.9 14 9.6 8 14 8 14Z"/></svg>`;
  const PHUD_ICON_MP = `<svg viewBox="0 0 16 16" width="12" height="12"><path fill="currentColor" d="M8 1C8 1 3 7.3 3 10.3 3 12.7 5.2 14.6 8 14.6S13 12.7 13 10.3C13 7.3 8 1 8 1Z"/></svg>`;
  const PHUD_ICON_SPI = `<svg viewBox="0 0 16 16" width="12" height="12"><path fill="currentColor" d="M8 1 9.6 6.4 15 8 9.6 9.6 8 15 6.4 9.6 1 8 6.4 6.4Z"/></svg>`;
  const playerSprite = playerSpriteFor(state.char.style, state.char.race);
  const enemySprite = targetEnemy && targetEnemy.tpl ? enemySpriteFor(targetEnemy) : null;
  const enemyHUD = targetEnemy ? `
    <div class="phud enemy">
      <div class="phud-portrait">${enemySprite ? `<img src="${enemySprite}" alt="">` : `<span class="phud-emoji">${targetEnemy.icon}</span>`}</div>
      <div class="phud-body">
        <div class="phud-name">${targetEnemy.name}</div>
        <div class="phud-row">
          <span class="phud-icon hp">${PHUD_ICON_HP}</span>
          <div class="phud-bar">
            <div class="phud-fill hp ${(targetEnemy.hp/targetEnemy.maxHP)<0.3?'low':''}" style="width:${Math.max(0,targetEnemy.hp/targetEnemy.maxHP*100)}%"></div>
            <span class="phud-num">${Math.max(0,targetEnemy.hp)} / ${targetEnemy.maxHP}</span>
          </div>
        </div>
        ${targetEnemy.statuses && targetEnemy.statuses.length ? `<div class="phud-statuses">${renderStatusChips(targetEnemy.statuses)}</div>` : ''}
      </div>
    </div>` : '';
  document.getElementById('main-panel').innerHTML = `
    <div style="display:flex; align-items:center; justify-content:space-between; gap:10px; margin-bottom:10px;">
      <h3 style="color:var(--bronze-light); margin:0;">Combate</h3>
      <div style="display:flex; align-items:center; gap:8px;">
        <div class="pos-toggle" id="combat-aim-toggle" style="margin:0;" title="Apuntado ON: eliges tú el objetivo con click. Apuntado OFF: se ataca solo, como antes.">
          <span class="pos-pill ${manualAim?'active':''}" data-aim="1">🎯 ON</span>
          <span class="pos-pill ${!manualAim?'active':''}" data-aim="0">🎯 OFF</span>
        </div>
        <div class="pos-toggle" id="combat-speed-toggle" style="margin:0;" title="Qué tan rápido se resuelven los turnos de aliados y enemigos">
          <span class="pos-pill ${combatSpeed===1?'active':''}" data-speed="1">x1</span>
          <span class="pos-pill ${combatSpeed===2?'active':''}" data-speed="2">x2</span>
        </div>
      </div>
    </div>
    <div class="pos-toggle" style="margin-bottom:2px;">
      <span class="pos-pill ${combat.playerPos==='frente'?'active':''}">Frente</span>
      <span class="pos-pill ${combat.playerPos==='retaguardia'?'active':''}">Retaguardia</span>
    </div>
    <div class="pos-hint" style="font-size:0.7em; color:var(--text-dim); margin:2px 0 8px;">Frente: exige la mayoría de habilidades físicas de golpe. Retaguardia: mejor para habilidades a distancia.</div>
    <div class="phud-wrap">
      <div class="phud">
        <div class="phud-portrait">${playerSprite ? `<img src="${playerSprite}" alt="">` : `<span class="phud-emoji">${race().icon}</span>`}</div>
        <div class="phud-body">
          <div class="phud-name">${state.char.nickname || s.name} — ${s.name}</div>
          <div class="phud-row">
            <span class="phud-icon hp">${PHUD_ICON_HP}</span>
            <div class="phud-bar">
              <div class="phud-fill hp ${hpPct<30?'low':''}" style="width:${hpPct}%"></div>
              ${playerShieldAmt>0?`<div class="phud-fill shield" style="width:${shieldPct}%; left:${hpPct}%;"></div>`:''}
              <span class="phud-num">${hpNumLabel}</span>
            </div>
          </div>
          <div class="phud-row">
            <span class="phud-icon st">${PHUD_ICON_MP}</span>
            <div class="phud-bar">
              <div class="phud-fill st" style="width:${stPct}%"></div>
              <span class="phud-num">${state.char.curSta} / ${d.maxSta}</span>
            </div>
          </div>
          <div class="phud-row">
            <span class="phud-icon sp">${PHUD_ICON_SPI}</span>
            <div class="phud-bar">
              <div class="phud-fill sp" style="width:${spPct}%"></div>
              <span class="phud-num">${state.char.curSpi} / ${d.maxSpi}</span>
            </div>
          </div>
          ${playerStatusChips ? `<div class="phud-statuses">${playerStatusChips}</div>` : ''}
        </div>
      </div>
      ${enemyHUD}
    </div>
    ${equippedPets().length ? `
    <div class="combat-pets-strip" title="Caídos del Laberinto equipados: solo aportan sus bonificaciones pasivas, no pelean ni ocupan un puesto en la escena.">
      <span class="combat-pets-label">Caídos del Laberinto</span>
      ${equippedPets().map(p=>`<div class="combat-pet-chip" data-pet-zoom="${p.id}" style="box-shadow:0 0 0 2px ${PET_RARITIES[p.rarity].color}bb inset;"><img src="${petArtPath(p.id)}" alt="${p.name}" title="${p.name}" loading="lazy"></div>`).join('')}
    </div>` : ''}
    <div id="battle-stage-mount" style="margin-bottom:6px;"></div>

    <div class="battle-menu" id="battle-menu">
      <div class="battle-menu-grid" id="battle-menu-grid" style="${combat.openSubmenu?'display:none;':''}">
        <button class="menu-btn" id="menu-basico" ${combat.turnBusy?'disabled':''}>⚔ Básico</button>
        <button class="menu-btn" id="menu-habilidades" ${combat.turnBusy?'disabled':''}>💥 Habilidades</button>
        <button class="menu-btn" id="menu-mochila" ${combat.turnBusy?'disabled':''}>🎒 Mochila</button>
        <button class="menu-btn" id="menu-defensa" ${combat.turnBusy?'disabled':''}>🛡 Defensa</button>
        <button class="menu-btn wide" id="menu-reposicionar" ${combat.turnBusy?'disabled':''}>↔ Reposicionarse (${combat.playerPos==='frente'?'a Retaguardia':'al Frente'})</button>
      </div>
      <div class="battle-submenu" id="battle-submenu" style="display:${combat.openSubmenu?'flex':'none'};">
        <div class="submenu-list" id="battle-submenu-list">${combat.openSubmenu==='habilidades' ? skillSubmenuHTML : combat.openSubmenu==='mochila' ? potionSubmenuHTML : ''}</div>
        <button class="menu-btn" id="menu-back">← Volver</button>
      </div>
    </div>
  `;

  const grid = document.getElementById('battle-menu-grid');
  const submenu = document.getElementById('battle-submenu');
  wirePetZoomEvents(document.getElementById('main-panel'));
  document.getElementById('menu-basico').onclick = ()=> useSkillFromMenu('ataque_basico');
  document.getElementById('menu-defensa').onclick = ()=> useSkillFromMenu('defender');
  document.getElementById('menu-reposicionar').onclick = ()=> useSkillFromMenu('reposicionar');
  // El submenú abierto (Habilidades/Mochila) queda guardado en
  // combat.openSubmenu para que sobreviva a los re-renders que dispara cada
  // paso del turno (resolveAllyTurns/processEnemyTurns llaman a
  // renderCombat() en cada paso) — antes cada uno de esos renders volvía a
  // armar el menú desde cero con el submenú cerrado, así que usar una
  // habilidad te devolvía al menú principal a cada rato. Ahora solo se
  // cierra con "Volver" o cuando termina el combate (combat pasa a null).
  const wireSkillSubmenuItems = ()=>{
    document.querySelectorAll('#battle-submenu-list .submenu-item[data-skill]').forEach(el=>{
      el.onclick = ()=>{ useSkillFromMenu(el.dataset.skill); };
    });
  };
  const wirePotionSubmenuItems = ()=>{
    document.querySelectorAll('#battle-submenu-list .submenu-item[data-potion]').forEach(el=>{
      el.onclick = ()=>{ combat.pendingSkill = null; guardedUsePotionInCombat(el.dataset.potion); };
    });
  };
  document.getElementById('menu-habilidades').onclick = ()=>{
    combat.openSubmenu = 'habilidades';
    document.getElementById('battle-submenu-list').innerHTML = skillSubmenuHTML;
    wireSkillSubmenuItems();
    grid.style.display = 'none'; submenu.style.display = 'flex';
  };
  document.getElementById('menu-mochila').onclick = ()=>{
    combat.openSubmenu = 'mochila';
    document.getElementById('battle-submenu-list').innerHTML = potionSubmenuHTML;
    wirePotionSubmenuItems();
    grid.style.display = 'none'; submenu.style.display = 'flex';
  };
  document.getElementById('menu-back').onclick = ()=>{
    combat.openSubmenu = null;
    submenu.style.display = 'none'; grid.style.display = 'grid';
  };
  if(combat.openSubmenu==='habilidades') wireSkillSubmenuItems();
  else if(combat.openSubmenu==='mochila') wirePotionSubmenuItems();
  document.querySelectorAll('#combat-speed-toggle [data-speed]').forEach(el=>{
    el.onclick = ()=>{
      setCombatSpeed(parseInt(el.dataset.speed,10));
      renderCombat();
    };
  });
  document.querySelectorAll('#combat-aim-toggle [data-aim]').forEach(el=>{
    el.onclick = ()=>{
      setManualAim(el.dataset.aim==='1');
      // Apagar Apuntado a mitad de una elección pendiente no debe dejar el
      // click del canvas esperando un objetivo que ya nadie va a pedir.
      combat.pendingSkill = null;
      combat.pendingTargetFilter = null;
      renderCombat();
    };
  });

  // fichas automáticas para los estados sin descripción propia (ver statusInfoFor)
  [combat.playerStatuses, ...(combat.allies||[]).map(a=> a.statuses), ...(combat.enemies||[]).map(e=> e.statuses)]
    .forEach(list=> (list||[]).forEach(statusInfoFor));
  const playerInfo = {
    name: state.char.nickname || s.name, icon: race().icon, style: state.char.style, race: state.char.race,
    hp: state.char.curHP, maxHP: d.maxHP, mp: state.char.curSta, maxMP: d.maxSta,
    spirit: state.char.curSpi, maxSpirit: d.maxSpi, statuses: combat.playerStatuses||[],
    shield: combat.playerShield||0,
    pos: combat.playerPos, bgTheme: DECADE_BG_THEME[decadeIndexForLevel(state.dungeon.level)], bgDecade: decadeIndexForLevel(state.dungeon.level),
    buffNames: Object.keys(STATUS_INFO).filter(k=> STATUS_INFO[k].buff), statusInfo: STATUS_INFO,
  };
  syncBattleStage(document.getElementById('battle-stage-mount'), combat, playerInfo, {
    isAllyHostile,
    onTarget: (idx)=>{
      if(!combat.pendingSkill) return;
      if(combat.pendingTargetFilter==='front' && !playerFrontTargetIndices().includes(idx)) return; // click fuera del conjunto elegible, se ignora
      const sid = combat.pendingSkill;
      combat.pendingSkill = null;
      combat.pendingTargetFilter = null;
      guardedPlayerUseSkill(sid, idx);
    },
  });
}

/* ============================================================
   CREATION SCREEN
   ============================================================ */
// Asistente de creación (2026-10-02, maqueta aprobada): primero la raza,
// luego la clase (se ve el sprite de ESA raza con ESA clase) y por último el
// nombre. Mismo chequeo de nombre y misma creación en el servidor de antes.
let selRace = 'barbaro', selStyle = 'pesada', crStep = 1, crName = '';
const CR_STAT_NAMES = {fis:'Físico', esp:'Espíritu', hab:'Habilidad', agi:'Agilidad', vig:'Vigor'};
const CR_RES_NAMES = {fisico:'Físico', fuego:'Fuego', hielo:'Hielo', veneno:'Veneno', aturdimiento:'Aturdimiento'};
const CR_REAR_STYLES = new Set(['tirador','mago','hechicero','doblefilo']);
// Creación de personaje (pedido explícito 2026-10-05): se muestra la versión
// chibi animada, la misma que se ve en combate (src/assets/chibi/<senda>_<raza>.png),
// en vez de la ilustración. Reposo en bucle y un ataque cada pocos segundos.
// Si esa combinación no tiene tira chibi se queda la ilustración.
let creationChibiIndex = null;
async function mountCreationChibi(hero, styleId, raceId){
  const key = styleId + '_' + raceId, img0 = hero.querySelector('.cr-sprite');
  try{
    if(!creationChibiIndex) creationChibiIndex = await fetch('src/assets/chibi/index.json?v=5').then(r=> r.json());
    const meta = creationChibiIndex[key];
    if(!meta || !img0 || !img0.isConnected) return;
    const sheet = new Image();
    await new Promise((res, rej)=>{ sheet.onload = res; sheet.onerror = rej; sheet.src = `src/assets/chibi/${key}.png?v=5`; });
    if(!img0.isConnected) return;
    const cv = document.createElement('canvas');
    cv.className = 'cr-sprite cr-chibi';
    cv.width = meta.cw; cv.height = meta.ch;
    img0.replaceWith(cv);
    const ctx = cv.getContext('2d');
    const idleN = meta.frames[0], atkN = meta.frames[1], cycle = 3.4, atkDur = atkN/12;
    const t0 = performance.now();
    const tick = ()=>{
      if(!cv.isConnected) return;
      const t = ((performance.now() - t0)/1000) % cycle, atkAt = cycle - atkDur;
      const row = t >= atkAt ? 1 : 0;
      const frame = row ? Math.min(atkN - 1, Math.floor((t - atkAt)*12)) : Math.floor(t*6) % idleN;
      ctx.clearRect(0, 0, cv.width, cv.height);
      ctx.drawImage(sheet, frame*meta.cw, row*meta.ch, meta.cw, meta.ch, 0, 0, meta.cw, meta.ch);
      requestAnimationFrame(tick);
    };
    tick();
  }catch(e){ /* sin tira chibi: queda la ilustración */ }
}
function renderCreation(){
  const stepper = document.getElementById('cr-stepper');
  stepper.innerHTML = ['Raza','Clase','Nombre'].map((t,i)=>`<span class="${i+1===crStep?'on':(i+1<crStep?'done':'')}">${i+1} · ${t}</span>`).join('');
  const title = document.getElementById('cr-title'), em = document.getElementById('cr-emblems');
  const hero = document.getElementById('cr-hero'), info = document.getElementById('cr-info');
  if(crStep===1){
    title.textContent = 'Elige tu raza';
    em.innerHTML = Object.values(RACES).map(r=>`<button class="cr-emblem ${r.id===selRace?'on':''}" data-race="${r.id}" title="${r.name}"><img src="src/assets/razas/${r.id}.png" alt=""><span>${r.name}</span></button>`).join('');
    const r = RACES[selRace];
    hero.innerHTML = `<img class="cr-race-art" src="src/assets/razas/${r.id}.png" alt="${r.name}">`;
    info.innerHTML = `<h2>${r.icon} ${r.name}</h2>
      <div class="cr-sub">Raza · Pasiva: ${r.passive}</div>
      <p class="cr-desc">“${r.desc}”</p>
      <div class="cr-bars">${Object.entries(r.stats).map(([k,v])=>`<span>${CR_STAT_NAMES[k]}</span><div class="cr-bar"><i style="width:${Math.min(100,v*11)}%"></i></div><b>${v}</b>`).join('')}</div>
      <div class="cr-chips">${Object.entries(r.res).filter(([,v])=>v).map(([k,v])=>`<span class="cr-chip ${v>0?'pos':'neg'}">${CR_RES_NAMES[k]} ${v>0?'+':''}${v}%</span>`).join('')}</div>
      <div class="cr-passive"><b>${r.passive}:</b> ${r.passiveDesc}</div>
      <div class="cr-proscons"><div><b class="pro">A favor</b>${r.pros}</div><div><b class="con">En contra</b>${r.cons}</div></div>
      <div class="cr-cta"><span></span><button class="btn-main" id="cr-next">Elegir ${r.name} →</button></div>`;
    em.querySelectorAll('.cr-emblem').forEach(b=> b.onclick = ()=>{ selRace = b.dataset.race; renderCreation(); });
  } else if(crStep===2){
    title.textContent = 'Elige tu clase';
    em.innerHTML = Object.values(STYLES).map(st=>`<button class="cr-emblem ${st.id===selStyle?'on':''}" data-style="${st.id}" title="${st.name}"><img src="src/assets/clases/${st.id}.png" alt=""><span>${st.name}</span></button>`).join('');
    const st = STYLES[selStyle], r = RACES[selRace];
    const pos = CR_REAR_STYLES.has(st.id) ? 'Retaguardia' : 'Frente';
    hero.innerHTML = `<img class="cr-class-bg" src="src/assets/clases/${st.id}.png" alt=""><img class="cr-sprite" src="${playerSpriteFor(st.id, r.id)||''}" alt="${st.name}">`;
    mountCreationChibi(hero, st.id, r.id);
    info.innerHTML = `<h2>${st.icon} ${st.name} <small>${r.name}</small></h2>
      <div class="cr-sub">Atributo principal: ${CR_STAT_NAMES[st.scaleStat]||st.scaleStat} · Posición: ${pos}</div>
      <p class="cr-desc">“${st.desc}”</p>
      <div class="cr-skills">${st.skills.map((id,k)=>`<div class="cr-skill"><span>${k+1}</span>${SKILLS[id] ? SKILLS[id].name : id}</div>`).join('')}</div>
      <div class="cr-passive">Así se verá tu <b>${st.name.toLowerCase()} ${r.name.toLowerCase()}</b> en combate.</div>
      <div class="cr-cta"><button class="reset-btn" id="cr-back">← Raza</button><button class="btn-main" id="cr-next">Elegir ${st.name} →</button></div>`;
    em.querySelectorAll('.cr-emblem').forEach(b=> b.onclick = ()=>{ selStyle = b.dataset.style; renderCreation(); });
  } else {
    title.textContent = 'Tu nombre en el laberinto';
    em.innerHTML = '';
    const st = STYLES[selStyle], r = RACES[selRace];
    hero.innerHTML = `<img class="cr-sprite" src="${playerSpriteFor(st.id, r.id)||''}" alt="">`;
    mountCreationChibi(hero, st.id, r.id);
    info.innerHTML = `<h2 id="cr-name-title">${crName || 'Sin nombre'}</h2>
      <div class="cr-sub">${r.name} · ${st.name}</div>
      <p style="color:var(--text-dim); font-size:0.88em; margin:6px 0 0;">Es el nombre que verán los demás jugadores en el ranking. Único en todo el juego, y no se puede cambiar después.</p>
      <div class="cr-name"><input id="char-nickname" class="auth-input" type="text" maxlength="20" placeholder="Nombre del personaje" value="${crName.replace(/"/g,'&quot;')}"><button id="cr-dice" title="Nombre al azar">🎲</button></div>
      <p id="char-nickname-msg" style="color:var(--blood-light); font-size:0.85em; min-height:1.2em; margin:0;"></p>
      <div class="cr-chips"><span class="cr-chip">Pasiva: ${r.passive}</span><span class="cr-chip">${CR_STAT_NAMES[st.scaleStat]||''}</span><span class="cr-chip">${CR_REAR_STYLES.has(st.id)?'Retaguardia':'Frente'}</span></div>
      <div class="cr-cta"><button class="reset-btn" id="cr-back">← Clase</button><button class="btn-main" id="btn-begin" ${crName.trim().length>=3?'':'disabled'}>Comenzar aventura ⚔</button></div>`;
    const inp = document.getElementById('char-nickname');
    inp.oninput = ()=>{ crName = inp.value; document.getElementById('cr-name-title').textContent = crName.trim() || 'Sin nombre'; document.getElementById('btn-begin').disabled = crName.trim().length < 3; };
    document.getElementById('cr-dice').onclick = ()=>{
      const a = ['Kael','Brann','Ysolde','Torg','Mira','Orrin','Sable','Hilde','Ragn','Ulric','Neva','Darro','Ilse','Vorn'];
      const b = ['Rojo','Piedrafría','Ceniza','Rompeyelmos','Muda','Sangreviva','Hierro','Tormenta','Lobo','Sombra'];
      crName = a[Math.random()*a.length|0] + b[Math.random()*b.length|0];
      renderCreation();
    };
    document.getElementById('btn-begin').onclick = beginCharacter;
    setTimeout(()=>inp.focus(), 0);
  }
  const next = document.getElementById('cr-next'), back = document.getElementById('cr-back');
  if(next) next.onclick = ()=>{ crStep++; renderCreation(); window.scrollTo({top:0}); };
  if(back) back.onclick = ()=>{ crStep--; renderCreation(); };
}
async function beginCharacter(){
  const btn = document.getElementById('btn-begin');
  const msg = document.getElementById('char-nickname-msg');
  const nickname = (crName||'').trim();
  msg.textContent = '';
  if(nickname.length < 3){ msg.textContent = 'El nombre debe tener al menos 3 letras.'; return; }
  btn.disabled = true;
  try{
    const available = await characterNicknameAvailable(nickname);
    if(!available){
      msg.textContent = 'Ese nombre de personaje ya está en uso.';
      btn.disabled = false;
      return;
    }
    const row = await createCharacterOnServer(selRace, selStyle, nickname);
    state = rowToState(row);
    cityView = null;
    grantStarterKit();
    const d = derived();
    state.char.curHP = d.maxHP; state.char.curSta = d.maxSta; state.char.curSpi = d.maxSpi;
    log(`Despiertas como ${RACES[selRace].name.toLowerCase()}, senda del ${STYLES[selStyle].name.toLowerCase()}. Dungeon & Stone comienza.`);
    document.getElementById('btn-switch-char').style.display = 'inline-block';
    showScreen('screen-game');
    renderAll();
    save();
  }catch(e){
    msg.textContent = 'No se pudo crear el personaje: ' + (e && e.message ? e.message : e);
    btn.disabled = false;
  }
}

const musicToggleBtn = document.getElementById('btn-music-toggle');
if(musicToggleBtn) musicToggleBtn.onclick = toggleLoginAudioMuted;

document.getElementById('btn-inventory').onclick = ()=>{
  if(!state) return;
  if(combat && combat.active){ log('No puedes abrir el inventario en combate. Usa tus pociones desde el panel de combate.'); return; }
  homeOpen = false;
  shopOpen = false;
  rankingOpen = false;
  adminOpen = false;
  ofrendaOpen = false;
  checkinOpen = false;
  optionsOpen = false;
  invOpen = !invOpen;
  renderAll();
};

document.getElementById('btn-options').onclick = ()=>{
  if(!state) return;
  if(combat && combat.active){ log('No puedes abrir Opciones en combate.'); return; }
  invOpen = false;
  homeOpen = false;
  shopOpen = false;
  rankingOpen = false;
  adminOpen = false;
  ofrendaOpen = false;
  checkinOpen = false;
  optionsOpen = !optionsOpen;
  renderAll();
};

document.querySelectorAll('#city-nav .nav-btn').forEach(btn=>{
  btn.onclick = ()=>{
    if(!state) return;
    if(combat && combat.active) return;
    const key = btn.dataset.nav;
    invOpen = false; homeOpen = false; shopOpen = false; rankingOpen = false; adminOpen = false; missionsOpen = false; tabernaOpen = false; ofrendaOpen = false; checkinOpen = false;
    if(key==='home') homeOpen = true;
    else if(key==='shop') shopOpen = true;
    else if(key==='taberna') tabernaOpen = true;
    else if(key==='missions') missionsOpen = true;
    else if(key==='ofrenda') ofrendaOpen = true;
    else if(key==='checkin') checkinOpen = true;
    else if(key==='ranking') rankingOpen = true;
    else if(key==='admin'){ if(state.char.role==='admin') adminOpen = true; }
    renderAll();
  };
});

document.getElementById('btn-slots').onclick = async ()=>{
  if(combat && combat.active){ log('No puedes cerrar sesión durante el combate.'); return; }
  if(pendingSave) await flushSave();
  await auth.signOut();
  // showAuthScreen() se dispara solo desde el listener de onAuthStateChange (evento SIGNED_OUT)
};

document.getElementById('btn-switch-char').onclick = async ()=>{
  if(combat && combat.active){ log('No puedes cambiar de personaje durante el combate.'); return; }
  if(pendingSave) await flushSave();
  state = null; combat = null; invOpen = false; homeOpen = false; shopOpen = false; rankingOpen = false; adminOpen = false;
  await enterGame();
};

document.getElementById('btn-reset').onclick = async ()=>{
  if(!confirm(`¿Borrar a "${state.char.nickname}"? Perderás todo su progreso. Esta acción no se puede deshacer.`)) return;
  await deleteCharacterById(state.char.id);
  state = null; combat = null; invOpen = false; homeOpen = false; shopOpen = false; rankingOpen = false; adminOpen = false;
  await enterGame();
};

/* ============================================================
   RENDER: LOGIN / REGISTRO
   ============================================================ */
// Música de login: suena desde la pantalla de inicio de sesión y sigue de
// largo (a los jugadores les gustó) a través de usuario/selección de
// personaje/ciudad — se detiene recién cuando entras de verdad al laberinto
// (btn-enter-dungeon) o si cargas un personaje que ya tenía una corrida
// activa. El navegador suele bloquear audio con sonido sin una interacción
// previa del usuario — si play() falla por eso, queda un listener de un solo
// uso en el primer click/tecla de la página para reintentarlo (mismo patrón
// reutilizado por el tema de jefe de década, más abajo).
let loginAudio = null;
function getLoginAudioMuted(){
  try{ return localStorage.getItem('dsLoginAudioMuted')==='1'; }catch(e){ return false; }
}
function setLoginAudioMuted(muted){
  try{ localStorage.setItem('dsLoginAudioMuted', muted?'1':'0'); }catch(e){}
}
// Volumen de música (0-100, pedido explícito 2026-09-26: mover esto a una
// pantalla de Opciones) — separado del mute de siempre, que sigue
// funcionando igual (mute = volumen "de emergencia" a 0 sin perder el
// número guardado). Se aplica en vivo a login/boss theme sin recargar.
function getMusicVolume(){
  try{
    const v = parseInt(localStorage.getItem('dsMusicVolume'), 10);
    return (Number.isFinite(v) && v>=0 && v<=100) ? v : 50;
  }catch(e){ return 50; }
}
function setMusicVolume(v){
  v = Math.max(0, Math.min(100, Math.round(v)));
  try{ localStorage.setItem('dsMusicVolume', String(v)); }catch(e){}
  if(loginAudio) loginAudio.volume = v/100;
  if(bossAudio) bossAudio.volume = v/100;
  if(dungeonAudio) dungeonAudio.volume = v/100;
}
function playAudioWithRetry(a){
  a.play().catch(()=>{});
  // Reintenta en cada click/tecla (no solo el primero) hasta confirmar que
  // de verdad quedó sonando — un solo reintento fallido (frecuente en
  // móviles, más estrictos con el autoplay) dejaba la música muda el resto
  // de la sesión sin ningún otro intento.
  const retry = ()=>{
    if(!a.paused){ document.removeEventListener('click', retry); document.removeEventListener('keydown', retry); return; }
    a.play().catch(()=>{});
  };
  document.addEventListener('click', retry);
  document.addEventListener('keydown', retry);
}
// El atributo loop nativo no siempre repite de forma confiable en archivos
// .mp4 exportados de WhatsApp (metadata de duración imprecisa) — antes la
// música simplemente se detenía sola al terminar la pista una vez. Con loop
// además de un respaldo explícito en 'ended' que la reinicia a mano, cubre
// ambos casos.
function makeLoopingAudio(src){
  const a = new Audio(src);
  a.loop = true;
  a.volume = getMusicVolume()/100;
  a._trackSrc = src;
  a.addEventListener('ended', ()=>{ a.currentTime = 0; a.play().catch(()=>{}); });
  return a;
}
function ensureLoginAudio(){
  if(!loginAudio) loginAudio = makeLoopingAudio('./src/assets/audio/login-theme.mp4');
  loginAudio.muted = getLoginAudioMuted();
  return loginAudio;
}
function playLoginAudio(){ playAudioWithRetry(ensureLoginAudio()); }
function stopLoginAudio(){
  if(loginAudio) loginAudio.pause();
}
function toggleLoginAudioMuted(){
  const muted = !getLoginAudioMuted();
  setLoginAudioMuted(muted);
  if(loginAudio) loginAudio.muted = muted;
  if(bossAudio) bossAudio.muted = muted;
  if(dungeonAudio) dungeonAudio.muted = muted;
  const label = muted ? '🔇 Música' : '🔊 Música';
  const authBtn = document.getElementById('auth-audio-toggle');
  if(authBtn) authBtn.textContent = label;
  const headerBtn = document.getElementById('btn-music-toggle');
  if(headerBtn) headerBtn.textContent = label;
}

// Música de jefe de década: suena solo en el combate contra el jefe de un
// piso múltiplo de 10 (10, 20, 30...), se detiene al resolverse el combate
// (victoria o derrota). Comparte la misma preferencia de silencio que la
// música de login — un solo interruptor para toda la música del juego.
let bossAudio = null;
function ensureBossAudio(){
  if(!bossAudio) bossAudio = makeLoopingAudio('./src/assets/audio/boss-theme.mp4');
  bossAudio.muted = getLoginAudioMuted();
  return bossAudio;
}
function playBossAudio(){ playAudioWithRetry(ensureBossAudio()); }
function stopBossAudio(){
  if(bossAudio) bossAudio.pause();
}

// Música de exploración del laberinto: una pista por cada década de pisos
// (1-10, 11-20, ... 51-60), sonando mientras exploras y en los combates
// normales de esos pisos — se detiene sola al entrar a un combate de jefe de
// década (playBossAudio la reemplaza) y retoma al resolverse ese combate o
// al avanzar de piso. Los pisos 61-100 todavía no tienen pista propia (esa
// parte del laberinto no está habilitada todavía, pedido explícito de no
// rellenarla con una repetida) — dungeonTrackFor() devuelve null ahí y
// simplemente no suena nada hasta que se suban esas pistas.
const DUNGEON_MUSIC_RANGES = [
  {max:10, src:'./src/assets/audio/dungeon-1-10.mp4'},
  {max:20, src:'./src/assets/audio/dungeon-11-20.mp4'},
  {max:30, src:'./src/assets/audio/dungeon-21-30.mp4'},
  {max:40, src:'./src/assets/audio/dungeon-31-40.mp4'},
  {max:50, src:'./src/assets/audio/dungeon-41-50.mp4'},
  {max:60, src:'./src/assets/audio/dungeon-51-60.mp4'},
  // 61-80 aún sin pista propia: reusan las de un tramo anterior de ambiente parecido.
  {max:70, src:'./src/assets/audio/dungeon-31-40.mp4'},
  {max:80, src:'./src/assets/audio/dungeon-11-20.mp4'},
];
function dungeonTrackFor(level){
  const range = DUNGEON_MUSIC_RANGES.find(r=>level<=r.max);
  return range ? range.src : null;
}
let dungeonAudio = null;
function ensureDungeonAudio(level){
  const src = dungeonTrackFor(level);
  if(dungeonAudio && dungeonAudio._trackSrc !== src){
    dungeonAudio.pause();
    dungeonAudio = null;
  }
  if(!dungeonAudio && src){ dungeonAudio = makeLoopingAudio(src); }
  if(dungeonAudio) dungeonAudio.muted = getLoginAudioMuted();
  return dungeonAudio;
}
function playDungeonAudio(level){
  const a = ensureDungeonAudio(level);
  if(a) playAudioWithRetry(a);
}
function stopDungeonAudio(){
  if(dungeonAudio) dungeonAudio.pause();
}

function renderAuthScreen(message){
  const wrap = document.getElementById('auth-box');
  let mode = 'login';
  wrap.innerHTML = `
    <div class="pick-card" style="max-width:380px; margin:0 auto; text-align:left;">
      <div style="display:flex; justify-content:flex-end; margin-bottom:10px;">
        <button class="reset-btn" id="auth-audio-toggle" style="padding:4px 10px; font-size:0.8em;">${getLoginAudioMuted() ? '🔇 Música' : '🔊 Música'}</button>
      </div>
      <div style="display:flex; gap:8px; margin-bottom:14px;">
        <button class="inv-btn" id="auth-tab-login" style="flex:1;">Iniciar sesión</button>
        <button class="inv-btn" id="auth-tab-register" style="flex:1;">Crear cuenta</button>
      </div>
      <div id="auth-form"></div>
      <div style="margin:14px 0; text-align:center; color:var(--text-dim); font-size:0.8em;">— o —</div>
      <button class="btn-main secondary-choice" id="auth-google" style="width:100%;">Continuar con Google</button>
      <p id="auth-msg" style="color:var(--blood-light); font-size:0.85em; min-height:1.2em; margin-top:12px;">${message||''}</p>
    </div>
  `;
  document.getElementById('auth-audio-toggle').onclick = toggleLoginAudioMuted;
  function renderForm(){
    const form = document.getElementById('auth-form');
    form.innerHTML = `
      <input id="auth-email" class="auth-input" type="email" placeholder="Email" autocomplete="email">
      <input id="auth-password" class="auth-input" type="password" placeholder="${mode==='register' ? 'Contraseña (mínimo 6 caracteres)' : 'Contraseña'}" autocomplete="${mode==='register'?'new-password':'current-password'}">
      <button class="btn-main" id="auth-submit" style="width:100%; margin-top:6px;">${mode==='register' ? 'Crear cuenta' : 'Entrar'}</button>
    `;
    document.getElementById('auth-submit').onclick = handleSubmit;
  }
  async function handleSubmit(){
    const msg = document.getElementById('auth-msg');
    const submitBtn = document.getElementById('auth-submit');
    const email = document.getElementById('auth-email').value.trim();
    const password = document.getElementById('auth-password').value;
    msg.style.color = 'var(--blood-light)';
    msg.textContent = '';
    if(!email || !password){ msg.textContent = 'Completa email y contraseña.'; return; }
    submitBtn.disabled = true;
    try{
      if(mode==='login'){
        await auth.signInWithEmail(email, password);
      } else {
        if(password.length < 6) throw new Error('La contraseña debe tener al menos 6 caracteres.');
        const result = await auth.signUpWithEmail(email, password);
        if(!result.session){
          msg.style.color = 'var(--good)';
          msg.textContent = 'Cuenta creada. Revisa tu correo para confirmarla y luego inicia sesión.';
          submitBtn.disabled = false;
          return;
        }
      }
      // cargar perfil/username/personaje lo dispara el listener de onAuthStateChange
    }catch(e){
      msg.textContent = e && e.message ? e.message : 'Ocurrió un error.';
      submitBtn.disabled = false;
    }
  }
  document.getElementById('auth-tab-login').onclick = ()=>{ mode='login'; renderForm(); };
  document.getElementById('auth-tab-register').onclick = ()=>{ mode='register'; renderForm(); };
  document.getElementById('auth-google').onclick = async ()=>{
    try{ await auth.signInWithGoogle(); }
    catch(e){ document.getElementById('auth-msg').textContent = e && e.message ? e.message : 'No se pudo continuar con Google.'; }
  };
  renderForm();
}

function renderUsernameScreen(){
  const wrap = document.getElementById('username-box');
  wrap.innerHTML = `
    <div class="pick-card" style="max-width:380px; margin:0 auto; text-align:left;">
      <p style="color:var(--text-dim); font-size:0.85em; margin-top:0;">Elige el nombre de usuario que verán los demás jugadores en el ranking. Solo letras, números y guion bajo.</p>
      <input id="username-input" class="auth-input" type="text" placeholder="Nombre de usuario">
      <button class="btn-main" id="username-submit" style="width:100%; margin-top:6px;">Confirmar</button>
      <p id="username-msg" style="color:var(--blood-light); font-size:0.85em; min-height:1.2em; margin-top:10px;"></p>
    </div>
  `;
  document.getElementById('username-submit').onclick = async ()=>{
    const msg = document.getElementById('username-msg');
    const btn = document.getElementById('username-submit');
    const username = document.getElementById('username-input').value.trim();
    msg.textContent = '';
    btn.disabled = true;
    try{
      if(!username) throw new Error('Escribe un nombre de usuario.');
      const available = await auth.checkUsernameAvailable(username);
      if(!available) throw new Error('Ese nombre de usuario ya está en uso.');
      currentProfile = await auth.setUsername(username);
      await enterGame();
    }catch(e){
      msg.textContent = e && e.message ? e.message : 'No se pudo guardar el nombre de usuario.';
      btn.disabled = false;
    }
  };
}

/* ============================================================
   RENDER: SELECCIÓN DE PERSONAJE (hasta 6 por cuenta)
   ============================================================ */
function renderCharacterSelect(rows){
  const box = document.getElementById('select-box');
  const rowsHTML = rows.map(row=>{
    const r = RACES[row.race], s = STYLES[row.style];
    return `<div class="inv-item-row">
      <div style="display:flex; align-items:center; gap:10px; min-width:0; flex:1;">
        <div class="sheet-emblem" style="width:40px; height:40px; font-size:1.3em;"><img src="src/assets/razas/${r.id}.png" alt="" onerror="this.replaceWith('${r.icon}')"></div>
        <div style="min-width:0; flex:1;">
          <b>${row.nickname}</b>${renownBadge(titleFromChoice(row.title_choice, decadeBossesBeaten(row.checkpoint_level, row.record_level, row.bosses_beaten), !!row.first_retornado))}${mythicBadge(ownsMythic(row.pets && row.pets.owned))} <span class="slot-tag">${r.name} · ${s.name}</span>${row.role==='admin' ? ' <span class="slot-tag">admin</span>' : ''}
          <div class="inv-item-bonus neutral">Nivel ${row.level} · Récord: Nivel ${row.record_level} · Piso ${row.record_floor_idx}</div>
        </div>
      </div>
      <div style="display:flex; gap:8px; flex-shrink:0;">
        <button class="inv-btn" data-play="${row.id}">Jugar</button>
        <button class="inv-btn danger" data-delete="${row.id}">Eliminar</button>
      </div>
    </div>`;
  }).join('');
  const canCreateMore = rows.length < 6;
  box.innerHTML = `
    <div style="max-width:640px; margin:0 auto;">
      ${rowsHTML}
      ${canCreateMore
        ? `<div class="begin-row"><button class="btn-main" id="btn-new-character">Crear personaje nuevo (${rows.length}/6)</button></div>`
        : `<p class="inv-empty-msg" style="text-align:center;">Ya tienes el máximo de 6 personajes.</p>`}
    </div>
  `;
  box.querySelectorAll('[data-play]').forEach(btn=>{
    btn.onclick = ()=>{
      const row = rows.find(r=>r.id===btn.dataset.play);
      enterCharacter(row);
    };
  });
  box.querySelectorAll('[data-delete]').forEach(btn=>{
    btn.onclick = async ()=>{
      const row = rows.find(r=>r.id===btn.dataset.delete);
      if(!confirm(`¿Eliminar a "${row.nickname}"? Perderás todo su progreso. Esta acción no se puede deshacer.`)) return;
      btn.disabled = true;
      await deleteCharacterById(row.id);
      await enterGame();
    };
  });
  if(canCreateMore){
    document.getElementById('btn-new-character').onclick = ()=> goToCreation(true);
  }
}

async function enterCharacter(row){
  // Nunca arrastrar el combate de otro personaje (2026-10-02).
  combat = null;
  state = rowToState(row);
  cityView = null;
  migrateState();
  // si ya tenía una corrida activa entra directo al laberinto (con la
  // música del piso donde se quedó, no la de ciudad); si no, aterriza en la
  // ciudad y la música debe sonar ahí también
  if(state.dungeon){ stopLoginAudio(); playDungeonAudio(state.dungeon.level||1); } else playLoginAudio();
  document.getElementById('btn-switch-char').style.display = 'inline-block';
  showScreen('screen-game');
  refreshMissionsState();
  // Bug real reportado 2026-09-28 ("se recarga a mitad de combate y vuelve
  // sin los aliados"): con una corrida activa, este primer renderAll() de
  // abajo puede caer en renderMap() -> recuperación automática de un combate
  // interrumpido (ver ese comentario en renderMap) -> enterNode() ->
  // startCombat(), que arma combat.allies leyendo state.char.allies EN ESE
  // MISMO INSTANTE. state.char.allies no lo pone rowToState (llega vacío/
  // undefined) — lo llena refreshAlliesState(), que es async. Antes se
  // llamaba DESPUÉS de renderAll() sin esperarlo, así que el combate
  // recuperado siempre arrancaba sin aliados, aunque sí los tuvieras. Sin
  // corrida activa no hace falta esperar (nada en la Ciudad depende de
  // allies para el primer pintado) — no vale la pena atrasarlo por gusto.
  if(state.dungeon) await refreshAlliesState(); else refreshAlliesState();
  // Partidas guardadas en plena pantalla de derrota (antes del arreglo de
  // handleDefeat): dentro del laberinto con 0 de vida → se aplica la derrota.
  if(state.dungeon && state.char.curHP<=0){ combat = null; handleDefeat(); }
  renderAll();
  claimGiftPulls();
  let tutorialSeen = false;
  try{ tutorialSeen = localStorage.getItem('dsTutorialSeen')==='1'; }catch(e){}
  if(!tutorialSeen) showTutorial();
}

// canGoBack=false solo en el caso forzado (cuenta sin ningún personaje
// todavía, ver enterGame): ahí "volver" no tiene a dónde ir. Cuando se llega
// clickeando "Crear personaje nuevo" desde la selección (ya existe al menos
// 1 personaje) sí se muestra el botón — pedido explícito 2026-09-25 tras un
// clic accidental en "Crear personaje" que solo se podía resolver cerrando
// sesión.
function goToCreation(canGoBack){
  document.getElementById('btn-switch-char').style.display = 'none';
  document.getElementById('btn-reset').style.display = 'none';
  document.getElementById('gold-badge').style.display = 'none';
  document.getElementById('tier-badge').style.display = 'none';
  document.getElementById('btn-inventory').style.display = 'none';
  document.getElementById('header-sub').textContent = 'El juego que nadie ha superado';
  selRace = 'barbaro'; selStyle = 'pesada'; crStep = 1; crName = '';
  renderCreation();
  document.getElementById('create-back-row').style.display = canGoBack ? 'block' : 'none';
  document.getElementById('btn-cancel-creation').onclick = ()=> enterGame();
  showScreen('screen-create');
}

/* ============================================================
   BOOT — sesión de Supabase → perfil → selección de personaje
   ============================================================ */
// Reloj de servidor, hora de Ecuador — diseñado en "El Consejo del
// Laberinto" (Capítulo II) para eventualmente marcar una ventana nocturna
// (04:00-10:00 UTC / 23:00-05:00 hora de Ecuador). A pedido explícito, el
// reloj todavía NO muestra ni menciona nada del ciclo (ni ícono de luna/sol
// ni texto) hasta que el contenido real de la noche (enemigos y debuffs
// propios) esté implementado — NOCTURNO_START_UTC/isNocturno() quedan listos
// para cuando llegue esa entrega, pero nada los usa por ahora.
const NOCTURNO_START_UTC = 4, NOCTURNO_END_UTC = 10;
const ECUADOR_UTC_OFFSET = -5; // UTC-5 todo el año, Ecuador no usa horario de verano
function isNocturno(date){
  const h = (date||new Date()).getUTCHours();
  return h >= NOCTURNO_START_UTC && h < NOCTURNO_END_UTC;
}
function updateClockBadge(){
  const badge = document.getElementById('clock-badge');
  if(!badge || badge.style.display==='none') return;
  const now = new Date();
  const ecuadorHour = ((now.getUTCHours() + ECUADOR_UTC_OFFSET) % 24 + 24) % 24;
  const hh = String(ecuadorHour).padStart(2,'0');
  const mm = String(now.getUTCMinutes()).padStart(2,'0');
  document.getElementById('clock-time').textContent = `${hh}:${mm}`;
  const snClock = document.getElementById('sn-clock');
  if(snClock) snClock.textContent = `${hh}:${mm}`;
}

// hide(id): getElementById + set display, sin reventar si el header todavía
// no terminó de montarse — boot() puede llamar a esto antes de que el navegador
// termine de asentar el DOM inicial (el listener de Supabase re-renderiza
// igual apenas confirma la sesión, así que perder ese primer intento es
// inofensivo, pero no debería lanzar un error sin capturar).
function hide(id){ const el=document.getElementById(id); if(el) el.style.display='none'; }
function resetHeaderForLoggedOut(){
  hide('clock-badge'); hide('gold-badge'); hide('tier-badge'); hide('btn-music-toggle'); hide('btn-options');
  hide('btn-inventory'); hide('btn-switch-char'); hide('btn-slots'); hide('btn-reset');
  hide('city-nav');
  const sub = document.getElementById('header-sub');
  if(sub) sub.textContent = 'El juego que nadie ha superado';
}

function showAuthScreen(message){
  state = null; combat = null;
  invOpen = false; homeOpen = false; shopOpen = false; rankingOpen = false; adminOpen = false;
  currentUser = null; currentProfile = null; BETA_ALLY_UNLOCKS = false;
  resetHeaderForLoggedOut();
  stopBossAudio();
  stopDungeonAudio();
  renderAuthScreen(message);
  showScreen('screen-auth');
  playLoginAudio();
}

async function enterGame(){
  if(sessionKicked) return;
  // Reclamar la sesión ANTES de cargar personajes: así la otra pestaña/
  // dispositivo queda reemplazada desde este momento.
  await claimSession();
  document.getElementById('btn-slots').style.display = 'inline-block';
  const rows = await loadCharacterRows();
  if(!rows.length){
    goToCreation();
    return;
  }
  document.getElementById('btn-switch-char').style.display = 'none';
  document.getElementById('btn-reset').style.display = 'none';
  document.getElementById('gold-badge').style.display = 'none';
  document.getElementById('tier-badge').style.display = 'none';
  document.getElementById('btn-inventory').style.display = 'none';
  document.getElementById('header-sub').textContent = `Cuenta: ${currentProfile.username}`;
  renderCharacterSelect(rows);
  showScreen('screen-select');
}

async function onAuthed(user){
  currentUser = user;
  const profile = await fetchProfile(user.id);
  if(!profile){
    await auth.signOut();
    return;
  }
  BETA_ALLY_UNLOCKS = !!profile.created_at && Date.parse(profile.created_at) >= BETA_ACCOUNTS_FROM;
  if(profile.is_banned){
    await auth.signOut();
    showAuthScreen('Tu cuenta está suspendida.');
    return;
  }
  if(!profile.username_set){
    currentProfile = profile;
    document.getElementById('btn-slots').style.display = 'inline-block';
    renderUsernameScreen();
    showScreen('screen-username');
    return;
  }
  currentProfile = profile;
  startMythicPolling();
  await enterGame();
}

async function boot(){
  renderCreation();
  const session = await auth.getSession();
  if(session && session.user){
    await onAuthed(session.user);
  } else {
    showAuthScreen();
  }
  auth.onAuthStateChange((event, session)=>{
    if(event === 'SIGNED_IN' && session && session.user){
      if(!currentUser || currentUser.id !== session.user.id) onAuthed(session.user);
    } else if(event === 'SIGNED_OUT'){
      showAuthScreen();
    }
  });
}
boot();

setInterval(updateClockBadge, 30000);
