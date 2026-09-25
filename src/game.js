"use strict";

import { supabase } from './supabaseClient.js';
import * as auth from './auth.js';
import { syncBattleStage, playBattleAnim } from './battleStage.js?v=65';
import { CLASS_SPRITES, ENEMY_SPRITES } from './battleSprites.js?v=65';

/* ============================================================
   DATA
   ============================================================ */

const RACES = {
  barbaro: {
    id:'barbaro', name:'Bárbaro', icon:'🪓',
    desc:'Carne y furia. El más fuerte y el más despreciado fuera del combate.',
    stats:{fis:8, esp:3, hab:5},
    res:{fisico:15, fuego:-10, hielo:0, veneno:0, aturdimiento:20},
    passive:'Furia de sangre', passiveDesc:'Por debajo del 30% de vida, tu daño físico aumenta un 20%.'
  },
  enano: {
    id:'enano', name:'Enano', icon:'⛏️',
    desc:'Robusto y terco. Resiste lo que otros no soportarían.',
    stats:{fis:7, esp:4, hab:4},
    res:{fisico:10, fuego:0, hielo:10, veneno:25, aturdimiento:5},
    passive:'Piel de piedra', passiveDesc:'Reduce todo daño físico recibido en una cantidad plana adicional.'
  },
  hada: {
    id:'hada', name:'Hada', icon:'🦋',
    desc:'Frágil pero certera. Vive de no ser tocada.',
    stats:{fis:3, esp:9, hab:6},
    res:{fisico:-10, fuego:15, hielo:15, veneno:5, aturdimiento:0},
    passive:'Gracia', passiveDesc:'+15% de probabilidad de esquivar cualquier ataque.'
  },
  humano: {
    id:'humano', name:'Humano', icon:'🗡️',
    desc:'Sin extremos, sin techo. Aprende más rápido que el resto.',
    stats:{fis:5, esp:5, hab:6},
    res:{fisico:5, fuego:5, hielo:5, veneno:5, aturdimiento:5},
    passive:'Adaptable', passiveDesc:'Ganas un 10% más de experiencia de cada victoria.'
  },
  draconido: {
    id:'draconido', name:'Dracónido', icon:'🐉',
    desc:'Sangre de bestia antigua. Poderoso, pero torpe con el hielo.',
    stats:{fis:7, esp:7, hab:3},
    res:{fisico:0, fuego:30, hielo:-15, veneno:0, aturdimiento:10},
    passive:'Sangre ancestral', passiveDesc:'Tus habilidades de fuego infligen un 15% adicional de daño.'
  },
  bestia: {
    id:'bestia', name:'Hombre bestia', icon:'🐺',
    desc:'Instinto puro. Golpea primero, golpea fuerte, golpea rápido.',
    stats:{fis:6, esp:2, hab:9},
    res:{fisico:5, fuego:0, hielo:0, veneno:-10, aturdimiento:15},
    passive:'Instinto cazador', passiveDesc:'+15% de probabilidad de golpe crítico.'
  }
};

const STYLES = {
  pesada: {
    id:'pesada', name:'Guerrero', icon:'🔨', scaleStat:'fis',
    desc:'Mazos y hachas. Rompe la guardia y remata al aturdido.',
    skills:['golpe_bruto','machacar','grito_guerra']
  },
  doblefilo: {
    id:'doblefilo', name:'Asesino', icon:'🔪', scaleStat:'fishab',
    desc:'Dagas gemelas. Desangra a tu presa y luego termina el trabajo.',
    skills:['corte_rapido','danza_cuchillas','golpe_gracia']
  },
  tirador: {
    id:'tirador', name:'Arquero', icon:'🏹', scaleStat:'fis',
    desc:'Distancia y precisión. Marca, retrocede, dispara.',
    skills:['disparo_certero','marca_cazador','lluvia_flechas']
  },
  mago: {
    id:'mago', name:'Mago', icon:'🔥', scaleStat:'esp',
    desc:'Fuego y hielo. Siembra el elemento y detónalo después.',
    skills:['bola_fuego','lanza_hielo','explosion_arcana']
  }
};

/* ============================================================
   TABERNA — aliados reclutables (v1: solo Gremio, sin traición ni
   mantenimiento recurrente todavía; nivel 10 de personaje requerido)
   ============================================================ */
const ALLY_ROSTER = [
  {templateId:'aldric', role:'guerrero', name:'Aldric de la Muralla', icon:'🛡️', bio:'Escudero retirado que aún no aprende a rendirse. Se planta al frente y no se mueve.', skillName:'Golpe Pesado', skillDesc:'Cada pocos turnos, un golpe con 60% más de daño.', baseCost:195, costPerLevel:13, frontline:true},
  {templateId:'neira', role:'arquero', name:'Neira la Certera', icon:'🏹', bio:'Cazadora de las tierras altas. Nunca falla dos veces al mismo blanco.', skillName:'Disparo Certero', skillDesc:'Cada pocos turnos, un disparo que ignora buena parte de la resistencia del objetivo.', baseCost:220, costPerLevel:14, frontline:false},
  {templateId:'vex', role:'asesino', name:'Vex', icon:'🗡️', bio:'No cuenta su pasado. Solo dice que llegó tarde a la venganza que buscaba.', skillName:'Golpe Sombrío', skillDesc:'Cada pocos turnos, más daño mientras más herido esté el objetivo.', baseCost:245, costPerLevel:16, frontline:false},
  {templateId:'fennwick', role:'mago', name:'Fennwick', icon:'🔮', bio:'Aprendiz expulsado del Círculo Roto por "experimentar de más".', skillName:'Bola de Fuego', skillDesc:'Cada pocos turnos, daño de fuego en vez de físico — útil contra enemigos resistentes al golpe.', baseCost:285, costPerLevel:18, frontline:false},
  {templateId:'delyth', role:'sacerdote', name:'Hermana Delyth', icon:'✨', bio:'La última de su orden. Cura a cualquiera que se lo pida, sin preguntar por qué pelea.', skillName:'Bendición Sagrada', skillDesc:'Cuando nadie necesita curación, baja todas las resistencias del enemigo del frente por unos turnos.', baseCost:310, costPerLevel:20, frontline:false}
];
const ALLY_MIN_LEVEL = 10;
const MAX_ALLIES = 4;
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
  explosion_arcana: {bonusMult: 0.75, penaltyIfNone: 0.20}   // era 0.60 / 0.30
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
const ULTIMATE_BY_STYLE = {pesada:'furia_titan', doblefilo:'vals_sangre', tirador:'disparo_cazador_final', mago:'cataclismo_elemental'};
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
    requiresPos:'frente', applies:{name:'Sangrado', chance:0.85, duration:3, stack:true, maxStack:3},
    desc: ()=> `Daño físico. Apila Sangrado (hasta x${skillBonus('corte_rapido','maxStack',3)}) durante ${skillBonus('corte_rapido','duration',3)} turnos.`,
    targetMode:'front'
  },
  danza_cuchillas: {
    id:'danza_cuchillas', name:'Danza de cuchillas', cost:{tipo:'estamina', valor:22}, dmgType:'fisico', mult:0.5, hits:2,
    requiresPos:'frente', scalesWithStack:{name:'Sangrado', perStackMult:0.15},
    desc:'Golpea dos veces. +15% de daño por cada carga de Sangrado en el objetivo.', targetMode:'front'
  },
  golpe_gracia: {
    id:'golpe_gracia', name:'Golpe de gracia', cost:{tipo:'estamina', valor:18}, dmgType:'fisico', mult:0.9,
    requiresPos:'frente', consumesStackBonus:{name:'Sangrado', perStackMult:0.25},
    desc: ()=> `Consume el Sangrado del objetivo: +${Math.round(skillBonus('golpe_gracia','perStackMult',0.25)*100)}% daño por carga consumida.`,
    targetMode:'front'
  },

  disparo_certero: {
    id:'disparo_certero', name:'Disparo certero', cost:{tipo:'estamina', valor:10}, dmgType:'fisico', mult:0.8,
    ignoreResist:0.5, penaltyIfFrente:0.2,
    desc:'Ignora 50% de la resistencia física. Menos preciso desde el Frente.', targetMode:'any'
  },
  marca_cazador: {
    id:'marca_cazador', name:'Marca del cazador', cost:{tipo:'espiritu', valor:20}, utility:'mark',
    applies:{name:'Marcado', chance:1, duration:3},
    desc: ()=> `No hace daño. El objetivo recibe +20% de todo el daño durante ${skillBonus('marca_cazador','duration',3)} turnos.`,
    targetMode:'any'
  },
  lluvia_flechas: {
    id:'lluvia_flechas', name:'Lluvia de flechas', cost:{tipo:'estamina', valor:20}, dmgType:'fisico', mult:0.55, aoe:true,
    bonusVsMarked:0.25,
    desc:'Daño a todos los enemigos vivos. +25% contra los Marcados.', targetMode:'all'
  },

  bola_fuego: {
    id:'bola_fuego', name:'Bola de fuego', cost:{tipo:'espiritu', valor:15}, dmgType:'fuego', mult:0.9,
    applies:{name:'Quemadura', chance:0.8, duration:3},
    desc:'Daño de fuego. Aplica Quemadura (daño por turno).', targetMode:'any'
  },
  lanza_hielo: {
    id:'lanza_hielo', name:'Lanza de hielo', cost:{tipo:'espiritu', valor:15}, dmgType:'hielo', mult:0.8,
    applies:{name:'Ralentizado', chance:0.8, duration:2},
    desc:'Daño de hielo. Aplica Ralentizado (-20% evasión, actúa después).', targetMode:'any'
  },
  explosion_arcana: {
    id:'explosion_arcana', name:'Explosión arcana', cost:{tipo:'espiritu', valor:25}, dmgType:'arcano', mult:0.75,
    consumesEither:[{name:'Quemadura', bonusMult:0.6},{name:'Ralentizado', bonusMult:0.6}], penaltyIfNone:0.3,
    desc: ()=> `Consume Quemadura o Ralentizado del objetivo para +${Math.round(skillBonus('explosion_arcana','bonusMult',0.6)*100)}% de daño.`,
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
    requiresPos:'frente', targetMode:'all',
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
const DECADE_BG_THEME = ['forest','forest','cave','cult','sea','sea'];

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
    decadeBoss: {id:'ogro', name:'Ogro', icon:'👺', role:'melee', hp:4.2, atk:1.9, res:{fisico:25,fuego:0,hielo:0,veneno:10,aturdimiento:35}, moves:['pegar','aplastar','debilitar'], boss:true, frontline:true}
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
      6: {id:'arana_caparazon', name:'Araña de Caparazón', icon:'🕷️', hp:3.50, atk:1.15, res:{fisico:35,fuego:0,hielo:10,veneno:20,aturdimiento:30}, boss:true, frontline:true,
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
          sello_presa:{label:'Sello de Presa', mult:0.85, applies:{name:'Marcado', chance:1, duration:3}, cooldown:4},
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
      abilities:{
        mordida_final:{label:'Mordida', mult:1.00},
        paralisis_matriarca:{label:'Parálisis', mult:0.90, applies:{name:'Paralisis', chance:0.30, duration:1}, cooldown:3},
        // Fase 2 (<60% HP): presión de Veneno.
        veneno_matriarca:{label:'Veneno Corrosivo', mult:0.85, applies:{name:'Veneno', chance:0.50, duration:3, stack:true, maxStack:3}, cooldown:3, condition:(ctx)=>ctx.selfHpPct<0.6},
        // Fase 3 (<30% HP): cadencia agresiva.
        golpe_brutal_final:{label:'Golpe Brutal', mult:1.40, cooldown:4, condition:(ctx)=>ctx.selfHpPct<0.3},
      },
      aiPriority:['golpe_brutal_final','veneno_matriarca','paralisis_matriarca','mordida_final']}
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
          golpe_brutal_oso:{label:'Golpe Brutal', mult:1.35, cooldown:4, condition:(ctx)=>ctx.targetStatusCount('Sangrado')>=1},
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
          corte_garganta:{label:'Corte de Garganta', mult:0.85, applies:{name:'Sangrado', chance:0.30, duration:3, stack:true, maxStack:3}, cooldown:3, condition:(ctx)=>ctx.targetHpPct<0.5},
          atemorizar_lince:{label:'Atemorizar', mult:0.60, applies:{name:'Miedo', chance:0.20, duration:2}, cooldown:5},
        },
        aiPriority:['corte_garganta','atemorizar_lince','zarpazo_lince']},
    ],
    elite: [
      {id:'alfa_manada', name:'Alfa de la Manada', icon:'🐺', hp:1.85, atk:1.28, res:{fisico:15,fuego:0,hielo:5,veneno:0,aturdimiento:5}, elite:true, frontline:true,
        abilities:{
          mordida_alfa:{label:'Mordida Alfa', mult:1.05, applies:{name:'Sangrado', chance:0.15, duration:2, stack:true, maxStack:3}},
          desgarro_alfa:{label:'Desgarro Alfa', mult:1.05, applies:{name:'Sangrado', chance:0.35, duration:3, stack:true, maxStack:3}, cooldown:3},
          frenesi_manada:{label:'Frenesí de Manada', mult:1.30, cooldown:4, condition:(ctx)=>ctx.targetStatusCount('Sangrado')>=1},
          aullido_dominio:{label:'Aullido de Dominio', mult:0.50, cooldown:5, selfBuff:{name:'Fortalecido', duration:2, stacks:5}},
        },
        aiPriority:['aullido_dominio','desgarro_alfa','frenesi_manada','mordida_alfa']},
      {id:'tigre_carmesi', name:'Tigre Carmesí', icon:'🐅', hp:1.75, atk:1.32, res:{fisico:10,fuego:0,hielo:0,veneno:5,aturdimiento:5}, elite:true, frontline:true,
        abilities:{
          garra_carmesi:{label:'Garra Carmesí', mult:1.05, applies:{name:'Sangrado', chance:0.20, duration:2, stack:true, maxStack:3}},
          presa_sanguinaria:{label:'Presa Sanguinaria', mult:0.95, applies:{name:'Sangrado', chance:0.35, duration:3, stack:true, maxStack:3}, cooldown:3},
          salto_mortal_tigre:{label:'Salto Mortal', mult:1.35, cooldown:4, condition:(ctx)=>ctx.targetHpPct<0.5},
        },
        bonusVsOwnStatus:{name:'Sangrado', minStacks:1, mult:1.15},
        aiPriority:['presa_sanguinaria','salto_mortal_tigre','garra_carmesi']},
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
          aullido_rey:{label:'Aullido del Rey', mult:0.60, applies:{name:'Miedo', chance:0.15, duration:2}, cooldown:5, selfBuff:{name:'Fortalecido', duration:2, stacks:3}},
          desgarro_real:{label:'Desgarro Real', mult:1.25, applies:{name:'Sangrado', chance:0.35, duration:3, stack:true, maxStack:3}, cooldown:3},
          frenesi_alfa:{label:'Frenesí del Alfa', mult:1.30, cooldown:4, condition:(ctx)=>ctx.targetHpPct<0.4},
        },
        aiPriority:['aullido_rey','desgarro_real','frenesi_alfa','mordida_real']},
    },
    // Riakis: su "escudo de corrupción" resiste casi todo el daño mundano
    // (físico/veneno/aturdimiento) pero es vulnerable a fuego/hielo — el hueco
    // que un Canalizador puede explotar hoy. Intacto por pedido explícito del
    // PDF ("Riakis no se reequilibra").
    decadeBoss: {id:'riakis', name:'Señor del Caos Riakis', icon:'👁️', hp:5.0, atk:1.6, res:{fisico:55,fuego:-25,hielo:-25,veneno:40,aturdimiento:30}, moves:['pegar','cegar','atemorizar'], boss:true, frontline:true}
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
          replica:{label:'Réplica', utility:'self_buff', selfBuff:{name:'Réplica', duration:3, incomingDmgReduction:0.20}, cooldown:5},
        },
        aiPriority:['replica','reflejo_perfecto_e','golpe_copiado']},
    ],
    guardians: [],
    // Guardián único y determinista por piso (31 a 39).
    guardianByFloor: {
      1: {id:'reflejo_perfecto_g', name:'Reflejo Perfecto', icon:'🪞', hp:2.70, atk:1.20, res:{fisico:10,fuego:5,hielo:5,veneno:5,aturdimiento:10}, boss:true, frontline:true,
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
          clon_sombra:{label:'Clon de Sombra', utility:'self_buff', selfBuff:{name:'Clon de Sombra', duration:3, evasionDelta:10}, cooldown:5},
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
      7: {id:'maestro_reflejo', name:'Maestro del Reflejo', icon:'🪞', hp:3.20, atk:1.28, res:{fisico:10,fuego:5,hielo:5,veneno:5,aturdimiento:10}, boss:true,
        abilities:{
          fragmento_g37:{label:'Fragmento', mult:1.05},
          confusion_g37:{label:'Confusión', mult:0.75, applies:{name:'Confusion', chance:0.28, duration:2}, cooldown:4},
          reflexion:{label:'Reflexión', utility:'self_buff', selfBuff:{name:'Reflexión', duration:3, incomingDmgReduction:0.15}, cooldown:5},
        },
        aiPriority:['reflexion','confusion_g37','fragmento_g37']},
      8: {id:'maestro_rostros', name:'Maestro de Rostros', icon:'🎭', hp:3.35, atk:1.35, res:{fisico:10,fuego:5,hielo:5,veneno:5,aturdimiento:10}, boss:true, frontline:true,
        abilities:{
          golpe_g38:{label:'Golpe', mult:1.05},
          rostro_falso_g38:{label:'Rostro Falso', mult:0.75, applies:{name:'Confusion', chance:0.30, duration:2}, cooldown:4},
          golpe_copiado_g38:{label:'Golpe Copiado', mult:1.20, cooldown:3, condition:(ctx)=>ctx.targetStatusCount('Confusion')>=1, bonusVsTargetStatus:{name:'Confusion', mult:1.25}},
        },
        aiPriority:['rostro_falso_g38','golpe_copiado_g38','golpe_g38']},
      9: {id:'usurpador_fragmentado', name:'Usurpador Fragmentado', icon:'🎭', hp:3.50, atk:1.40, res:{fisico:15,fuego:10,hielo:10,veneno:10,aturdimiento:15}, boss:true, frontline:true,
        abilities:{
          ataque_g39:{label:'Ataque', mult:1.10},
          confusion_profunda:{label:'Confusión Profunda', mult:0.80, applies:{name:'Confusion', chance:0.30, duration:2}, cooldown:4},
          golpe_brutal_g39:{label:'Golpe Brutal', mult:1.35, cooldown:3, condition:(ctx)=>ctx.targetStatusCount('Confusion')>=1, bonusVsTargetStatus:{name:'Confusion', mult:1.20}},
        },
        hpThresholdBuff:{threshold:0.4, buff:{name:'Fragmentación', duration:99, dmgMult:1.15}},
        aiPriority:['confusion_profunda','golpe_brutal_g39','ataque_g39']},
    },
    decadeBoss: {id:'usurpador', name:'El Usurpador Sin Nombre', icon:'🎭', hp:4.8, atk:1.8, res:{fisico:20,fuego:10,hielo:10,veneno:10,aturdimiento:20}, moves:['pegar','confundir','aplastar'], boss:true, frontline:true}
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
          ataque_oportunista:{label:'Ataque Oportunista', mult:0.80, cooldown:3, condition:(ctx)=>ctx.targetHpPct<0.5},
          robar_er:{label:'Robar', mult:0.65, cooldown:4, selfBuff:{name:'Tras Robar', duration:1, evasionDelta:10}},
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
          disparo_preciso:{label:'Disparo Preciso', mult:0.90, cooldown:3, condition:(ctx)=>ctx.targetHpPct<0.5},
          marca_presa:{label:'Marca de Presa', mult:0.70, cooldown:4},
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
          corte_ejecutor:{label:'Corte Ejecutor', mult:1.15, cooldown:4, condition:(ctx)=>ctx.targetHpPct<0.4},
        },
        aiPriority:['corte_ejecutor','paso_sombrio','doble_daga']},
      {id:'medico_campana', name:'Médico de Campaña', icon:'⚕️', hp:0.75, atk:0.80, res:{fisico:-5,fuego:5,hielo:5,veneno:10,aturdimiento:5},
        abilities:{
          baston:{label:'Bastón', mult:0.80},
          curacion_mc:{label:'Curación', utility:'heal_ally', healPct:0.10, cooldown:4, condition:(ctx)=>combat.enemies.some(e=>e.hp>0 && e.hp<e.maxHP)},
          adrenalina:{label:'Adrenalina', utility:'self_buff', selfBuff:{name:'Adrenalina', duration:2, dmgMult:1.10}, cooldown:5},
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
          marca_mortal:{label:'Marca Mortal', mult:0.75, cooldown:4},
          disparo_ejecutor:{label:'Disparo Ejecutor', mult:1.30, cooldown:4, condition:(ctx)=>ctx.targetHpPct<0.4},
        },
        aiPriority:['disparo_ejecutor','marca_mortal','disparo_cv']},
      {id:'duelista_veterano', name:'Duelista Veterano', icon:'🤺', hp:1.80, atk:1.32, res:{fisico:5,fuego:0,hielo:0,veneno:0,aturdimiento:5}, elite:true, frontline:true,
        abilities:{
          estocada_dv:{label:'Estocada', mult:1.05},
          corte_preciso:{label:'Corte Preciso', mult:1.00, applies:{name:'Sangrado', chance:0.25, duration:3, stack:true, maxStack:3}, cooldown:3},
        },
        aiPriority:['corte_preciso','estocada_dv']},
      {id:'capitan_mercenario', name:'Capitán Mercenario', icon:'🎖️', hp:2.00, atk:1.30, res:{fisico:10,fuego:0,hielo:0,veneno:0,aturdimiento:10}, elite:true, frontline:true,
        abilities:{
          espadazo:{label:'Espadazo', mult:1.05},
          orden_ataque:{label:'Orden de Ataque', mult:0.60, cooldown:5, selfBuff:{name:'Fortalecido', duration:2, stacks:4}},
          guarda_alta:{label:'Guarda Alta', utility:'self_buff', selfBuff:{name:'Guarda Alta', duration:2, incomingDmgReduction:0.15}, cooldown:5},
          golpe_mando:{label:'Golpe de Mando', mult:1.20, cooldown:3},
        },
        aiPriority:['orden_ataque','guarda_alta','golpe_mando','espadazo']},
      {id:'asesino_elite_isla', name:'Asesino de Élite', icon:'🗡️', hp:1.70, atk:1.40, res:{fisico:0,fuego:0,hielo:0,veneno:5,aturdimiento:5}, elite:true,
        abilities:{
          doble_corte:{label:'Doble Corte', mult:1.00},
          paso_letal:{label:'Paso Letal', mult:0.60, cooldown:4, selfBuff:{name:'Paso Letal', duration:1, evasionDelta:15}},
          corte_mortal:{label:'Corte Mortal', mult:1.20, cooldown:4, condition:(ctx)=>ctx.targetHpPct<0.4},
          silencio_ae:{label:'Silencio', mult:0.70, applies:{name:'Silencio', chance:0.15, duration:1}, cooldown:5},
        },
        aiPriority:['corte_mortal','silencio_ae','paso_letal','doble_corte']},
    ],
    guardians: [], // sin plantilla propia de guardián — el piso 41-49 usa 5 regulares + 1 élite (ver enterNode)
    // El jefe de década llega escoltado (ver enterNode) y no busca hacer daño
    // directo: cura, se bufa solo y llama refuerzos. Débil en poder bruto
    // frente al Usurpador, pero nunca solo. Intacto por pedido explícito.
    decadeBoss: {id:'custodio_isla', name:'Custodio de la Isla', icon:'🏝️', hp:3.2, atk:1.2, res:{fisico:15,fuego:10,hielo:10,veneno:10,aturdimiento:15}, moves:['curar','buff_pasivo','invocar','area_debil'], boss:true, frontline:false}
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
          corriente_inversa:{label:'Corriente Inversa', mult:0.60, cooldown:4},
        },
        aiPriority:['debilitar_th','corriente_inversa','descarga_acuatica']},
      {id:'cangrejo_gigante', name:'Cangrejo Gigante', icon:'🦀', hp:1.30, atk:1.05, res:{fisico:20,fuego:0,hielo:-5,veneno:0,aturdimiento:10}, frontline:true,
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
      {id:'naga_arquero', name:'Naga Arquero', icon:'🏹', hp:0.80, atk:1.10, res:{fisico:0,fuego:0,hielo:-5,veneno:5,aturdimiento:0},
        abilities:{
          flecha_marina:{label:'Flecha Marina', mult:1.00},
          flecha_perforante:{label:'Flecha Perforante', mult:0.85, cooldown:3},
          flecha_entumecedora:{label:'Flecha Entumecedora', mult:0.65, applies:{name:'Ralentizado', chance:0.20, duration:2}, cooldown:4},
        },
        aiPriority:['flecha_entumecedora','flecha_perforante','flecha_marina']},
      {id:'garvel', name:'Garvel', icon:'🦠', hp:0.75, atk:0.90, res:{fisico:-10,fuego:0,hielo:-5,veneno:15,aturdimiento:0},
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
      {id:'naga_capitan', name:'Naga Capitán', icon:'🏹', hp:1.90, atk:1.35, res:{fisico:5,fuego:0,hielo:-10,veneno:5,aturdimiento:5}, elite:true,
        abilities:{
          ataque_nc:{label:'Ataque', mult:1.00},
          flecha_perforante_nc:{label:'Flecha Perforante', mult:0.90, cooldown:3},
          orden_ataque_nc:{label:'Orden de Ataque', mult:0.60, cooldown:5, selfBuff:{name:'Fortalecido', duration:2, stacks:4}},
        },
        aiPriority:['orden_ataque_nc','flecha_perforante_nc','ataque_nc']},
      {id:'sacerdotisa_mareas', name:'Sacerdotisa de las Mareas', icon:'🌊', hp:1.70, atk:1.15, res:{fisico:0,fuego:5,hielo:-5,veneno:10,aturdimiento:5}, elite:true,
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
      1: {id:'campeon_triton', name:'Campeón Tritón', icon:'🔱', hp:2.70, atk:1.25, res:{fisico:10,fuego:5,hielo:-10,veneno:5,aturdimiento:5}, boss:true, frontline:true,
        abilities:{
          tridente_g51:{label:'Tridente', mult:1.05},
          estocada_g51:{label:'Estocada', mult:1.20, cooldown:3},
          golpe_brutal_g51:{label:'Golpe Brutal', mult:1.35, applies:{name:'Ralentizado', chance:0.20, duration:2}, cooldown:4},
        },
        aiPriority:['golpe_brutal_g51','estocada_g51','tridente_g51']},
      2: {id:'naga_maestro', name:'Naga Maestro', icon:'🏹', hp:2.65, atk:1.35, res:{fisico:0,fuego:0,hielo:-10,veneno:5,aturdimiento:5}, boss:true,
        abilities:{
          flecha_g52:{label:'Flecha', mult:1.05},
          perforante_g52:{label:'Perforante', mult:0.95, cooldown:3},
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
      5: {id:'gran_cangrejo_abisal', name:'Gran Cangrejo Abisal', icon:'🦀', hp:3.50, atk:1.20, res:{fisico:30,fuego:0,hielo:-5,veneno:5,aturdimiento:15}, boss:true, frontline:true,
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
          tormenta_menor:{label:'Tormenta Menor', mult:0.60, cooldown:5, selfBuff:{name:'Tormenta Menor', duration:2, dmgMult:1.15}},
        },
        aiPriority:['tormenta_menor','rayo_marino','tridente_g59']},
    },
    decadeBoss: {id:'storm_gush', name:'Storm Gush, Tetrasea el Señor de las Lágrimas', icon:'🔱', hp:5.4, atk:1.85, res:{fisico:25,fuego:5,hielo:-15,veneno:10,aturdimiento:20}, moves:['pegar','aplastar','debilitar'], boss:true, frontline:true}
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
  poco_comun: {id:'poco_comun', name:'Poco Común', color:'#46c168', weight:80,    dupGold:1000},
  raro:       {id:'raro',       name:'Raro',        color:'#3b8fe0', weight:15,    dupGold:4000},
  unico:      {id:'unico',      name:'Único',       color:'#9350dd', weight:4,     dupGold:15000},
  epico:      {id:'epico',      name:'Épico',       color:'#d6409f', weight:0.9,   dupGold:60000},
  legendario: {id:'legendario', name:'Legendario',  color:'#e0b23f', weight:0.099, dupGold:300000},
  mitico:     {id:'mitico',     name:'Mítico',      color:'#e0393f', weight:0.001, dupGold:2000000}
};
const PET_RARITY_ORDER = ['poco_comun','raro','unico','epico','legendario','mitico'];
function petArtPath(id){ return `src/assets/mascotas/mascota_${String(id).padStart(3,'0')}.png`; }
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
const DECADE_RACE_TAG = ['goblin','arana','bestia',null,'humano','criatura_marina'];
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
function isPetEquipped(id){ return equippedPetIds().includes(Number(id)); }
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
// tenías esa mascota exacta) se convierte en oro según su rango en vez de
// acumularse (confirmado explícito) — por eso `owned` guarda presencia
// (0/1), no un contador.
const GACHA_COST_X1 = 10000;
const GACHA_COST_X10 = 100000; // entrega 11 tiradas
const GACHA_COST_SELLOS_X1 = 100;
const GACHA_COST_SELLOS_X10 = 1000; // entrega 11 tiradas
function rollPetId(){
  const rarity = pickWeighted(PET_RARITY_ORDER.map(r=>({tpl:r, weight:PET_RARITIES[r].weight})));
  const pool = PET_CATALOG.filter(p=>p.rarity===rarity);
  return pick(pool).id;
}
// Núcleo compartido: tira `count` mascotas y resuelve duplicados en oro —
// usado tanto por una tirada pagada (pullGacha) como por una tirada gratis
// (grantFreePetPulls, ver el check-in diario) sin duplicar la lógica.
function doPetPulls(count){
  ensurePets();
  const results = [];
  for(let i=0;i<count;i++){
    const id = rollPetId();
    const tpl = petTpl(id);
    const isDup = !!state.char.pets.owned[id];
    let goldRefund = 0;
    if(isDup){
      goldRefund = PET_RARITIES[tpl.rarity].dupGold;
      state.char.gold += goldRefund;
    } else {
      state.char.pets.owned[id] = 1;
    }
    results.push({id, tpl, isDup, goldRefund});
  }
  return results;
}
function pullGacha(kind, payWith){
  ensurePets();
  payWith = payWith==='sellos' ? 'sellos' : 'gold';
  const count = kind==='x10' ? 11 : 1;
  let cost, costLabel;
  if(payWith==='sellos'){
    cost = kind==='x10' ? GACHA_COST_SELLOS_X10 : GACHA_COST_SELLOS_X1;
    if((state.char.missionCurrency||0) < cost) return null;
    state.char.missionCurrency -= cost;
    costLabel = `${cost.toLocaleString('es')} Sellos del Laberinto`;
  } else {
    cost = kind==='x10' ? GACHA_COST_X10 : GACHA_COST_X1;
    if(state.char.gold < cost) return null;
    state.char.gold -= cost;
    costLabel = `${cost.toLocaleString('es')} de oro`;
  }
  const results = doPetPulls(count);
  const rareCount = results.filter(r=>['epico','legendario','mitico'].includes(r.tpl.rarity)).length;
  log(`Otorgas una ofrenda al árbol (${count===11?'x10 +1':'x1'}, -${costLabel}): consigues ${count} Caído(s) del Laberinto${rareCount?`, ¡${rareCount} de rango Épico o superior!`:''}.`);
  renderSheet();
  save();
  return results;
}
// Tiradas de regalo (check-in diario y otorgadas por admin, ver más abajo)
// — mismo motor de doPetPulls, sin cobrar nada. resuelve YA MISMO (revela
// las mascotas); las que llegan como "pendientes" (ver pets.pendingFreePulls)
// se resuelven recién cuando el jugador las reclama a mano en la Ofrenda.
function grantFreePetPulls(count){
  ensurePets();
  const results = doPetPulls(count);
  const rareCount = results.filter(r=>['epico','legendario','mitico'].includes(r.tpl.rarity)).length;
  log(`El árbol te concede ${count} ofrenda(s) gratis: consigues ${count} Caído(s) del Laberinto${rareCount?`, ¡${rareCount} de rango Épico o superior!`:''}.`);
  renderSheet();
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
function claimCheckin(){
  ensureCheckin();
  if(!checkinAvailable()) return null;
  const day = checkinPreviewDay();
  state.char.checkin.day = day;
  state.char.checkin.lastClaimDate = ecuadorDateStr();
  state.char.pets.pendingFreePulls = (state.char.pets.pendingFreePulls||0) + day;
  log(`Check-in diario (día ${day}/30 de este mes): se suman ${day} ofrenda(s) gratis pendientes en el árbol (total acumulado: ${state.char.pets.pendingFreePulls}).`);
  renderSheet();
  save();
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

// Arma 1 de Mago y Sacerdote es EL MISMO pool (Vara arcana / Bastón rúnico)
// con los mismos números — se define una sola vez y ambas sendas la comparten,
// para que nunca puedan divergir por accidente.
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
    wTier('poco_comun', 18, [{type:'esp_refund', chance:0.05, amount:0.5, text:'de recuperar la mitad del espíritu gastado'}]),
    wTier('raro', 22, [{type:'esp_refund', chance:0.08, amount:0.5, text:'de recuperar la mitad del espíritu gastado'}]),
    wTier('rango_b', 26, [{type:'esp_refund', chance:0.12, amount:0.5, text:'de recuperar la mitad del espíritu gastado'}]),
    wTier('rango_a', 30, [{type:'esp_refund', chance:0.15, amount:0.5, text:'de recuperar la mitad del espíritu gastado'}]),
    wTier('legendario', 43, [{type:'esp_refund', chance:0.20, amount:0.5, text:'de recuperar la mitad del espíritu gastado'}, {type:'esp_refund_on_apply', chance:0.05, tierSProc:'vara_s', text:'de recuperar todo tu Espíritu al aplicar Quemadura o Ralentizado'}]),
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
  doblefilo: {
    stat:'hab',
    arma: {
      'Daga curva': [
        wTier('comun', 10),
        wTier('poco_comun', 14, [{type:'sangrado', chance:0.12, text:'de aplicar sangrado 2 turnos'}]),
        wTier('raro', 19, [{type:'sangrado', chance:0.15, text:'de aplicar sangrado 2 turnos'}]),
        wTier('rango_b', 24, [{type:'sangrado', chance:0.20, text:'de aplicar sangrado 2 turnos'}]),
        wTier('rango_a', 29, [{type:'sangrado', chance:0.20, text:'de aplicar sangrado 2 turnos'}, {type:'succion_hechizo', percent:0.10, text:'succión de hechizo'}]),
        wTier('legendario', 39, [{type:'sangrado', chance:0.25, duration:4, text:'de aplicar sangrado 4 turnos', tierSProc:'daga_s'}, {type:'succion_hechizo', percent:0.15, text:'succión de hechizo'}]),
      ],
      'Cuchillo largo': [
        wTier('comun', 10),
        wTier('poco_comun', 17, [{type:'sangrado', chance:0.05, text:'de aplicar sangrado 2 turnos'}]),
        wTier('raro', 22, [{type:'sangrado', chance:0.08, text:'de aplicar sangrado 2 turnos'}]),
        wTier('rango_b', 29, [{type:'sangrado', chance:0.12, text:'de aplicar sangrado 2 turnos'}]),
        wTier('rango_a', 34, [{type:'sangrado', chance:0.12, text:'de aplicar sangrado 2 turnos'}, {type:'silencio', chance:0.10, text:'de aplicar silencio al enemigo'}]),
        wTier('legendario', 44, [{type:'sangrado', chance:0.15, duration:4, text:'de aplicar sangrado 4 turnos'}, {type:'silencio', chance:0.15, text:'de aplicar silencio al enemigo'}, {type:'tier_s_passive', tierSProc:'cuchillo_s', text:'objetivos por debajo del 25% de vida reciben +20% de daño'}]),
      ],
    },
    arma2: {
      'Daga gemela': [
        wTier('comun', 10),
        wTier('poco_comun', 14, [{type:'sangrado', chance:0.12, text:'de aplicar sangrado 2 turnos'}]),
        wTier('raro', 19, [{type:'sangrado', chance:0.15, text:'de aplicar sangrado 2 turnos'}]),
        wTier('rango_b', 24, [{type:'sangrado', chance:0.20, text:'de aplicar sangrado 2 turnos'}]),
        wTier('rango_a', 29, [{type:'sangrado', chance:0.20, text:'de aplicar sangrado 2 turnos'}, {type:'succion_hechizo', percent:0.10, text:'succión de hechizo'}]),
        wTier('legendario', 39, [{type:'sangrado', chance:0.25, duration:4, text:'de aplicar sangrado 4 turnos', tierSProc:'daga_s'}, {type:'succion_hechizo', percent:0.15, text:'succión de hechizo'}]),
      ],
      'Cuchillo gemelo': [
        wTier('comun', 10),
        wTier('poco_comun', 17, [{type:'sangrado', chance:0.05, text:'de aplicar sangrado 2 turnos'}]),
        wTier('raro', 22, [{type:'sangrado', chance:0.08, text:'de aplicar sangrado 2 turnos'}]),
        wTier('rango_b', 29, [{type:'sangrado', chance:0.12, text:'de aplicar sangrado 2 turnos'}]),
        wTier('rango_a', 34, [{type:'sangrado', chance:0.12, text:'de aplicar sangrado 2 turnos'}, {type:'silencio', chance:0.10, text:'de aplicar silencio al enemigo'}]),
        wTier('legendario', 44, [{type:'sangrado', chance:0.15, duration:4, text:'de aplicar sangrado 4 turnos'}, {type:'silencio', chance:0.15, text:'de aplicar silencio al enemigo'}, {type:'tier_s_passive', tierSProc:'cuchillo_s', text:'objetivos por debajo del 25% de vida reciben +20% de daño'}]),
      ],
    },
  },
  tirador: {
    stat:'fis',
    arma: {
      'Arco corto': [
        wTier('comun', 10),
        wTier('poco_comun', 16, [{type:'robovida', percent:0.10, text:'de robo de vida'}]),
        wTier('raro', 20, [{type:'robovida', percent:0.12, text:'de robo de vida'}]),
        wTier('rango_b', 25, [{type:'robovida', percent:0.15, text:'de robo de vida'}]),
        wTier('rango_a', 30, [{type:'robovida', percent:0.15, text:'de robo de vida'}, {type:'segundo_ataque_basico', chance:0.10, text:'de realizar un segundo ataque básico'}]),
        wTier('legendario', 40, [{type:'robovida', percent:0.20, text:'de robo de vida'}, {type:'segundo_ataque_basico', chance:0.10, tierSProc:'arcocorto_s', text:'de realizar un segundo ataque básico que además cura 3% de tu vida máxima'}]),
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
        wTier('poco_comun', 14, [{type:'robovida', percent:0.10, text:'de robo de vida'}]),
        wTier('raro', 18, [{type:'robovida', percent:0.12, text:'de robo de vida'}]),
        wTier('rango_b', 22, [{type:'robovida', percent:0.15, text:'de robo de vida'}]),
        wTier('rango_a', 26, [{type:'robovida', percent:0.15, text:'de robo de vida'}, {type:'segundo_ataque_basico', chance:0.10, text:'de realizar un segundo ataque básico'}]),
        wTier('legendario', 40, [{type:'robovida', percent:0.20, text:'de robo de vida'}, {type:'segundo_ataque_basico', chance:0.10, tierSProc:'carcaj_s', text:'de realizar un segundo ataque básico con 10% de probabilidad de ignorar 50% de resistencia física'}]),
      ],
    },
  },
  mago: {
    stat:'esp',
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
  // los aliados de ese rol tengan su propia arma. Comparte el arma 1 con el
  // Mago (MAGO_ARMA1), pero su arma 2 es propia (grimorio/tomo).
  sacerdote: {
    stat:'esp',
    arma: MAGO_ARMA1,
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
};
const OFFHAND_LABELS = {pesada:'Escudo', doblefilo:'Arma 2', tirador:'Carcaj', mago:'Foco', sacerdote:'Grimorio'};
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
  const chosenName = (name && cat[slot][name]) ? name : pick(names);
  const entry = weaponEntry(styleId, slot, chosenName, rank);
  if(!entry) return null;
  const item = {kind:'equip', slot, name:chosenName, bonus:{stat:cat.stat, value:entry.value}, rarity:rank, styleId};
  if(entry.specials && entry.specials.length) item.specials = entry.specials.map(s=>Object.assign({}, s));
  if(entry.mods) item.mods = Object.assign({}, entry.mods);
  return item;
}

// ============================================================
// CATÁLOGO DE EQUIPO GENERAL — recalibración 2026-09-16 (pedido explícito).
// Igual que las armas: cada senda tiene su propio nombre por rango para
// casco/armadura/botas/guantes/amuleto ("Accesorio" en pantalla — el slot
// interno sigue llamándose 'amuleto', ver slotLabel(), mismo criterio que el
// renombre Arma pesada -> Guerrero: solo cambia la etiqueta, no la clave).
// Los NÚMEROS de casco/armadura/botas/amuleto son los mismos para las 5
// sendas (solo el nombre cambia); guantes es la única pieza que de verdad
// varía en stat: Físico para Guerrero/Arquero (pesada/tirador), Habilidad
// para Asesino/Mago/Sacerdote (doblefilo/mago/sacerdote).
// ============================================================
// 2026-09-24: se agrega 'legendario' (Tier S) como 6to escalón — su nombre
// de material en GEAR_NAMES es "de vacío" en las 5 sendas (el material que
// sigue después de piedra/bronce/plata/oro/platino, sin atarlo a la lore de
// un único jefe ya que Tier S se puede desbloquear con fragmentos de
// cualquier década — ver TIER_S_RECIPE). Hoy este rango NO se vende en la
// Tienda/Gremio para equipo general (solo armas y piedras, pedido explícito
// 2026-09-24) — vive acá sobre todo para que el set del aliado Sacerdote
// pueda llegar a Tier S al vencer a Storm Gush (ver el hook en
// handleVictory, isDecadeFinal && clearedLevel===60).
const GEAR_RANK_ORDER = ['comun','poco_comun','raro','rango_b','rango_a','legendario'];
const GEAR_NAMES = {
  pesada: {
    casco:['Casco de piedra','Casco de bronce','Casco de plata','Casco de oro','Casco de platino','Casco de vacío'],
    armadura:['Placa de piedra','Placa de bronce','Placa de plata','Placa de oro','Placa de platino','Placa de vacío'],
    botas:['Grevas de piedra','Grevas de bronce','Grevas de plata','Grevas de oro','Grevas de platino','Grevas de vacío'],
    guantes:['Manoplas de piedra','Manoplas de bronce','Manoplas de plata','Manoplas de oro','Manoplas de platino','Manoplas de vacío'],
    amuleto:['Talismán roto','Talismán','Talismán imbuido con magia','Talismán de sangre','Talismán despertado','Talismán del vacío'],
  },
  doblefilo: {
    casco:['Máscara de piedra','Máscara de bronce','Máscara de plata','Máscara de oro','Máscara de platino','Máscara de vacío'],
    armadura:['Manto de piedra','Manto de bronce','Manto de plata','Manto de oro','Manto de platino','Manto de vacío'],
    botas:['Zapatillas de piedra','Zapatillas de bronce','Zapatillas de plata','Zapatillas de oro','Zapatillas de platino','Zapatillas de vacío'],
    guantes:['Zarpas de piedra','Zarpas de bronce','Zarpas de plata','Zarpas de oro','Zarpas de platino','Zarpas de vacío'],
    amuleto:['Anillo roto','Anillo','Anillo imbuido con magia','Anillo de sangre','Anillo despertado','Anillo del vacío'],
  },
  tirador: {
    casco:['Capucha de piedra','Capucha de bronce','Capucha de plata','Capucha de oro','Capucha de platino','Capucha de vacío'],
    armadura:['Cota de piedra','Cota de bronce','Cota de plata','Cota de oro','Cota de platino','Cota de vacío'],
    botas:['Botas de piedra','Botas de bronce','Botas de plata','Botas de oro','Botas de platino','Botas de vacío'],
    guantes:['Guantes de piedra','Guantes de bronce','Guantes de plata','Guantes de oro','Guantes de platino','Guantes de vacío'],
    amuleto:['Amuleto roto','Amuleto','Amuleto imbuido con magia','Amuleto de sangre','Amuleto despertado','Amuleto del vacío'],
  },
  mago: {
    casco:['Diadema de piedra','Diadema de bronce','Diadema de plata','Diadema de oro','Diadema de platino','Diadema de vacío'],
    armadura:['Túnica de piedra','Túnica de bronce','Túnica de plata','Túnica de oro','Túnica de platino','Túnica de vacío'],
    botas:['Sandalias de piedra','Sandalias de bronce','Sandalias de plata','Sandalias de oro','Sandalias de platino','Sandalias de vacío'],
    guantes:['Mitones de piedra','Mitones de bronce','Mitones de plata','Mitones de oro','Mitones de platino','Mitones de vacío'],
    amuleto:['Libro roto','Libro','Libro imbuido con magia','Libro de sangre','Libro despertado','Libro del vacío'],
  },
  // Sacerdote comparte los números de Mago (ambos escalan Habilidad) pero
  // con nombres propios — evité repetir "Libro" en el amuleto para que no
  // compita en nombre con el del Mago; le puse "Reliquia" en su lugar.
  sacerdote: {
    casco:['Corona de piedra','Corona de bronce','Corona de plata','Corona de oro','Corona de platino','Corona de vacío'],
    armadura:['Sotana de piedra','Sotana de bronce','Sotana de plata','Sotana de oro','Sotana de platino','Sotana de vacío'],
    botas:['Alpargatas de piedra','Alpargatas de bronce','Alpargatas de plata','Alpargatas de oro','Alpargatas de platino','Alpargatas de vacío'],
    guantes:['Vendas de piedra','Vendas de bronce','Vendas de plata','Vendas de oro','Vendas de platino','Vendas de vacío'],
    amuleto:['Reliquia rota','Reliquia','Reliquia imbuida con fe','Reliquia de sangre','Reliquia despertada','Reliquia del vacío'],
  },
};
// Casco: vida máxima (flat, SIN el ×8 que sí aplica al viejo bonus.stat==
// 'maxhp' de Armadura — ver item.mods en derived()) + Precisión (nueva:
// contrarresta la evasión enemiga) + a rango A, aumento de daño.
// 2026-09-24, pedido explícito: Rango A sube su vida (35->50) y se agrega
// Tier S (legendario) — pasiva propia: por debajo de 50% de vida, +5%
// reducción de daño recibido (ver TIER_S_PASSIVE_EFFECTS/'casco_s').
const CASCO_TIERS = [
  {rank:'comun', mods:{maxhp_flat:15}},
  {rank:'poco_comun', mods:{maxhp_flat:20, precision:5}},
  {rank:'raro', mods:{maxhp_flat:25, precision:10}},
  {rank:'rango_b', mods:{maxhp_flat:30, precision:15}},
  {rank:'rango_a', mods:{maxhp_flat:50, precision:20}, specials:[{type:'aumento_dano', value:0.05, text:'de aumento de daño'}]},
  {rank:'legendario', mods:{maxhp_flat:80, precision:25}, specials:[{type:'aumento_dano', value:0.07, text:'de aumento de daño'}, {type:'tier_s_passive', tierSProc:'casco_s', text:'por debajo del 50% de vida: +5% reducción de daño recibido'}]},
];
// Armadura: resistencia física de siempre (mismo canal que raza/amuleto,
// dmgType 'fisico') + % de reducción de daño recibido + a rango A, bloqueo.
// 2026-09-24: Rango A gana +20 HP (antes no daba nada de vida) y se agrega
// Tier S — pasiva propia: el primer golpe recibido en cada combate, -10%
// de daño (ver 'armadura_s').
const ARMADURA_TIERS = [
  {rank:'comun', bonus:{res:'fisico', value:10}},
  {rank:'poco_comun', bonus:{res:'fisico', value:15}, specials:[{type:'reduccion_dano', value:0.05, text:'de reducción de daño recibido'}]},
  {rank:'raro', bonus:{res:'fisico', value:20}, specials:[{type:'reduccion_dano', value:0.08, text:'de reducción de daño recibido'}]},
  {rank:'rango_b', bonus:{res:'fisico', value:25}, specials:[{type:'reduccion_dano', value:0.12, text:'de reducción de daño recibido'}]},
  {rank:'rango_a', bonus:{res:'fisico', value:30}, mods:{maxhp_flat:20}, specials:[{type:'reduccion_dano', value:0.12, text:'de reducción de daño recibido'},{type:'bloqueo', chance:0.05, text:'de bloquear ataque'}]},
  {rank:'legendario', bonus:{res:'fisico', value:40}, mods:{maxhp_flat:40}, specials:[{type:'reduccion_dano', value:0.16, text:'de reducción de daño recibido'},{type:'bloqueo', chance:0.08, text:'de bloquear ataque'}, {type:'tier_s_passive', tierSProc:'armadura_s', text:'el primer golpe recibido en cada combate hace -10% de daño'}]},
];
// Botas: Resistencia mágica (canal nuevo, ver derived().resMagica — listo
// para cuando el bestiario tenga ataques elementales propios, todavía casi
// ningún enemigo pega distinto de físico) + resistencia a efectos de estado
// "físicos" (Sangrado/Debilitado/Parálisis/Ceguera/Ralentizado/Tambaleo -
// Miedo/Confusión son alteraciones MENTALES, esas las cubre el amuleto) + a
// rango A, evasión.
// 2026-09-24: ariochbu preguntó si Botas también debería ganar vida en Rango
// A junto con Casco/Armadura/Amuleto — decisión: no, se deja Botas sin HP a
// propósito para conservar su identidad de única pieza "mágica/estados" (así
// lo dice el propio punto 9 del documento de diseño: "casco vida/precisión,
// armadura resistencia/reducción, botas magia/estados, amuleto fortaleza
// mental/recursos" — meterle vida a las 4 piezas hace que cualquier pieza dé
// lo mismo y el inventario deja de tener sentido). Tier S sí se agrega, con
// la misma identidad: pasiva propia, resistir la primera alteración de
// estado negativa de cada combate (ver 'botas_s').
const BOTAS_TIERS = [
  {rank:'comun', mods:{res_magica:10}},
  {rank:'poco_comun', mods:{res_magica:15, resistencia_estado:5}},
  {rank:'raro', mods:{res_magica:20, resistencia_estado:8}},
  {rank:'rango_b', mods:{res_magica:25, resistencia_estado:12}},
  {rank:'rango_a', mods:{res_magica:30, resistencia_estado:12}, specials:[{type:'evasion_flat', value:0.05, text:'de evasión'}]},
  {rank:'legendario', mods:{res_magica:40, resistencia_estado:16}, specials:[{type:'evasion_flat', value:0.07, text:'de evasión'}, {type:'tier_s_passive', tierSProc:'botas_s', text:'50% de resistir la primera alteración de estado negativa de cada combate'}]},
];
// Amuleto/Accesorio: % Fortaleza mental (resiste Miedo/Confusión
// específicamente) + MP plano + a rango A, Espíritu plano también.
// 2026-09-24: Rango A gana +15 HP (antes no daba nada de vida) y +15
// Espíritu (antes +5). Tier S agrega +10% de resistencia adicional a
// efectos de control (mentales Y físicos, ver 'amuleto_s').
const AMULETO_TIERS = [
  {rank:'comun', mods:{fortaleza_mental:5}},
  {rank:'poco_comun', mods:{fortaleza_mental:8, mp_flat:5}},
  {rank:'raro', mods:{fortaleza_mental:12, mp_flat:10}},
  {rank:'rango_b', mods:{fortaleza_mental:15, mp_flat:15}},
  {rank:'rango_a', mods:{fortaleza_mental:18, mp_flat:15, espiritu_flat:15, maxhp_flat:15}},
  {rank:'legendario', mods:{fortaleza_mental:22, mp_flat:20, espiritu_flat:20, maxhp_flat:25}, specials:[{type:'tier_s_passive', tierSProc:'amuleto_s', text:'+10% de resistencia adicional a efectos de control'}]},
];
// Guantes: la única pieza donde el stat de verdad cambia por senda. A rango
// A penetra la defensa contraria a su propio daño — física para
// Guerrero/Arquero, mágica para Asesino/Mago/Sacerdote (reusa
// 'penetracion_armadura' de las armas; 'penetracion_magica' es nuevo).
// 2026-09-24: Tier S (legendario) agrega 'proc_next_skill' — 5% de
// probabilidad al golpear de potenciar tu siguiente habilidad (ver
// TIER_S_PROC_EFFECTS/'guantes_s' en applyEquippedSpecials), 1 vez por
// combate.
function guantesTiers(stat, penType, penText){
  return [
    {rank:'comun', bonus:{stat, value:5}},
    {rank:'poco_comun', bonus:{stat, value:8}, specials:[{type:'aumento_dano', value:0.05, text:'de aumento de daño'}]},
    {rank:'raro', bonus:{stat, value:12}, specials:[{type:'aumento_dano', value:0.08, text:'de aumento de daño'}]},
    {rank:'rango_b', bonus:{stat, value:16}, specials:[{type:'aumento_dano', value:0.12, text:'de aumento de daño'}]},
    {rank:'rango_a', bonus:{stat, value:20}, specials:[{type:'aumento_dano', value:0.12, text:'de aumento de daño'},{type:penType, value:0.05, text:penText}]},
    {rank:'legendario', bonus:{stat, value:26}, specials:[{type:'aumento_dano', value:0.15, text:'de aumento de daño'},{type:penType, value:0.08, text:penText}, {type:'proc_chance', chance:0.05, tierSProc:'guantes_s', text:'de potenciar tu siguiente habilidad en +25% de daño durante 4 turnos'}]},
  ];
}
// 2026-09-16: corregido tras revisar qué stat/penetración de verdad usa
// cada senda para hacer daño (ariochbu preguntó "¿Habilidad aumenta el
// daño mágico?" y la respuesta destapó dos desajustes):
// - Mago/Sacerdote escalan su daño con ESPÍRITU, no Habilidad — sus
//   guantes daban Habilidad (útil solo para crítico/evasión/MP, no para
//   pegar más fuerte). Ahora dan Espíritu, como Guerrero/Arquero dan
//   Físico (su propio stat de daño).
// - Asesino sigue dando Habilidad en sus guantes (mismo criterio que ya
//   usa su arma — su fórmula real es un promedio Físico+Habilidad, no se
//   puede repartir un bono entre dos stats) PERO su daño es 100% físico
//   (dmgType 'fisico' en sus 3 habilidades) — su penetración de guantes
//   debía ser de armadura física, no de resistencia mágica (que para
//   Asesino no hacía nada, nunca golpea con resKey!=='fisico').
const GEAR_CLASS_STAT = {pesada:'fis', tirador:'fis', doblefilo:'hab', mago:'esp', sacerdote:'esp'};
const GEAR_PENETRATION = {
  pesada:['penetracion_armadura','de penetración de armadura física'],
  tirador:['penetracion_armadura','de penetración de armadura física'],
  doblefilo:['penetracion_armadura','de penetración de armadura física'],
  mago:['penetracion_magica','de penetración de resistencia mágica'],
  sacerdote:['penetracion_magica','de penetración de resistencia mágica'],
};
const GEAR_CATALOG = {};
Object.keys(GEAR_NAMES).forEach(cls=>{
  const [penType, penText] = GEAR_PENETRATION[cls];
  GEAR_CATALOG[cls] = {
    casco: CASCO_TIERS, armadura: ARMADURA_TIERS, botas: BOTAS_TIERS, amuleto: AMULETO_TIERS,
    guantes: guantesTiers(GEAR_CLASS_STAT[cls], penType, penText),
  };
});
function makeGearItem(slot, styleId, rank){
  const tiers = GEAR_CATALOG[styleId] && GEAR_CATALOG[styleId][slot];
  if(!tiers) return null;
  const idx = GEAR_RANK_ORDER.indexOf(rank);
  const tier = tiers[idx];
  if(idx<0 || !tier) return null;
  const names = GEAR_NAMES[styleId] && GEAR_NAMES[styleId][slot];
  const name = (names && names[idx]) || slotLabel(slot);
  const item = {kind:'equip', slot, name, rarity:rank, styleId};
  if(tier.bonus) item.bonus = Object.assign({}, tier.bonus);
  if(tier.mods) item.mods = Object.assign({}, tier.mods);
  if(tier.specials && tier.specials.length) item.specials = tier.specials.map(s=>Object.assign({}, s));
  return item;
}

function shopWeaponPrice(isOffhand){ return isOffhand ? 40 + state.char.level*4 : 55 + state.char.level*6; }
const SHOP_POTION_PRICES = {vida_menor:12, vida_mayor:30, estamina:12, espiritu:12, antidoto:22};

function dealDamageToPlayer(amount){
  if(amount<=0) return;
  if(combat && combat.playerShield>0){
    const absorbed = Math.min(combat.playerShield, amount);
    combat.playerShield -= absorbed;
    amount -= absorbed;
  }
  if(amount>0){
    const wouldBeLethal = combat && (state.char.curHP - amount) <= 0;
    if(!(wouldBeLethal && checkPetRevive())) state.char.curHP = Math.max(0, state.char.curHP - amount);
  }
  checkPetShieldOnHit();
  checkFuriaContenidaTrigger();
  checkPetTriggers();
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
// nombre y (para guantes) su propio stat — ver GEAR_CATALOG. El precio en
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
function selloShopPrice(rarity){ return rarity==='rango_a' ? 700 : 350; }
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
  // plata/oro/platino, ver GEAR_NAMES) — ese nombre ya deja claro el rango,
  // no hace falta un sufijo "del Gremio" encima.
  return makeGearItem(slot, styleId, rarity);
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
  addToInventory({kind:'soulstone', stoneId:tpl.id, family:tpl.family, name:tpl.name, tier:tpl.tier, icon:tpl.icon, desc:tpl.desc, preview:tpl.preview, bonus:tpl.bonus, special:tpl.special});
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
   jugador, comprada aparte). El arma 2 el jugador la elige una sola vez
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
function makeAutoGearItem(slot, rarity){
  return makeGearItem(slot, 'sacerdote', rarity);
}
async function saveAllyAutoGear(row){
  const { error } = await supabase.from('character_allies').update({
    equip: row.equip||{},
    auto_gear_tier: row.auto_gear_tier||'none',
    auto_gear_pending: !!row.auto_gear_pending,
    auto_gear_arma2_name: row.auto_gear_arma2_name||null
  }).eq('id', row.id);
  if(error) console.error('No se pudo guardar el equipo automático del aliado:', error.message);
}
async function grantAllyAutoGear(row, tier){
  if(!row.equip) row.equip = {};
  ['armadura','casco','botas','guantes','amuleto'].forEach(slot=>{
    const prior = row.equip[slot];
    row.equip[slot] = makeAutoGearItem(slot, tier);
    if(prior) state.char.inventory.push(prior);
  });
  if(row.auto_gear_arma2_name){
    const prior = row.equip.arma2;
    row.equip.arma2 = makeWeaponItem('arma2', 'sacerdote', tier, row.auto_gear_arma2_name);
    if(prior) state.char.inventory.push(prior);
    row.auto_gear_pending = false;
  } else {
    row.auto_gear_pending = true;
  }
  row.auto_gear_tier = tier;
  log(`<b>${row.name}</b> desbloquea su equipo ${AUTO_GEAR_TIER_LABEL[tier]}${row.auto_gear_pending ? ' — elige su arma2 en la Taberna' : ''}.`);
  await saveAllyAutoGear(row);
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
  if(prior) state.char.inventory.push(prior);
  row.auto_gear_pending = false;
  log(`<b>${row.name}</b> equipa <b>${name}</b>.`);
  saveAllyAutoGear(row);
  renderAll();
}

function buyPotion(potionId){
  const price = SHOP_POTION_PRICES[potionId] || 15;
  if(state.char.gold < price){ log('No tienes suficiente oro para eso.'); return; }
  state.char.gold -= price;
  addToInventory({kind:'potion', potionId});
  log(`Compras <b>${POTION_TEMPLATES[potionId].name}</b> por ${price} de oro.`);
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
  // — ver GEAR_CATALOG), cada una suma algo de valor aunque no pasen por bonus.
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

const GUARDIAN_SLOT_STAT = {casco:'hab', guantes:'fis', botas:'hab'}; // themed stat for the new slots
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
  vigor:     {name:'Vigor',           statKey:'fis',    baseE:2,  procBaseAtF:0.02, advBaseAtA:0.05, advLabel:'robo de vida (% del daño causado)'},
  sabiduria: {name:'Sabiduría',       statKey:'maxsta', baseE:8,  procBaseAtF:0.05, advBaseAtA:0.05, advLabel:'probabilidad de escudo de maná'},
  voluntad:  {name:'Voluntad',        statKey:'esp',    baseE:2,  procBaseAtF:0.05, advBaseAtA:0.05, advLabel:'probabilidad de que tu próxima habilidad cueste la mitad de espíritu'},
  instinto:  {name:'Instinto',        statKey:'hab',    baseE:2,  procBaseAtF:0.02, advBaseAtA:0.05, advLabel:'probabilidad de doble lanzamiento (el segundo gratis y sin turno)'},
  vitalidad: {name:'Vitalidad',       statKey:'maxhp',  baseE:1,  procBaseAtF:0.02, advBaseAtA:0.05, advLabel:'probabilidad de curar 10% de tu vida máxima'},
  furia:     {name:'Furia Contenida', statKey:null,     advTable:{A:0.25, S:0.50, SS:1.00}, advLabel:'probabilidad de revivir una vez por laberinto'},
  sombra:    {name:'Sombra Cazadora', statKey:null,     advTable:{A:0.01, S:0.05, SS:0.10}, advLabel:'probabilidad de invocar una sombra que atrae el agro'}
};
function soulStatValue(famId, tier){
  const fam = SOUL_FAMILIES[famId];
  if(!fam || !fam.statKey) return 0;
  return fam.baseE * Math.pow(2, soulTierIdx(tier)); // se duplica por cada categoría que sube
}
function soulProcChance(famId, tier){
  const fam = SOUL_FAMILIES[famId];
  if(!fam || !fam.procBaseAtF) return 0;
  const idx = soulTierIdx(tier);
  if(idx < 1) return 0; // sin proc en rango E
  return fam.procBaseAtF * Math.pow(2, idx-1); // se duplica desde F en adelante
}
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
    desc:'+2 Habilidad permanente.', preview:'Desde F: probabilidad de quemar, congelar/ralentizar o sangrar según la habilidad. Desde A: doble lanzamiento.'},
  instinto_f:  {id:'instinto_f',  family:'instinto',  name:'Piedra del Alma: Instinto (F)',         tier:'F', icon:'🟢', bonus:{stat:'hab', value:4},
    special:{type:'elemental_proc', chance:0.02},
    desc:'+4 Habilidad. 2% de probabilidad de quemar (fuego), congelar/ralentizar (hielo) o sangrar (físico) al enemigo, según la habilidad usada.', preview:'Desde A: probabilidad de lanzar la habilidad dos veces (la segunda gratis, sin gastar turno).'},
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
  // Sabiduría/Voluntad/Instinto/Vitalidad/Furia/Sombra (escudo de maná, mitad
  // de costo, doble lanzamiento, autocuración, revivir, invocar sombra) no
  // tiene código de combate propio todavía — esas piedras se quedan con el
  // efecto de F escalado hasta que se implemente esa mecánica nueva. Vigor sí
  // cambia en A porque el robo de vida ya es un special genérico existente
  // (aplica igual desde un arma o desde una piedra).
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
    desc:'+32 MP máximo. 10% de probabilidad de recuperar el 5% del MP gastado.', preview:'Desde A: probabilidad de escudo de maná (pendiente de implementar).'},
  sabiduria_c: {id:'sabiduria_c', family:'sabiduria', name:'Piedra del Alma: Sabiduría (C)',        tier:'C', icon:'📘', bonus:{stat:'maxsta', value:64},
    special:{type:'mp_refund', chance:0.20, amount:0.05},
    desc:'+64 MP máximo. 20% de probabilidad de recuperar el 5% del MP gastado.', preview:'Desde A: probabilidad de escudo de maná (pendiente de implementar).'},
  sabiduria_b: {id:'sabiduria_b', family:'sabiduria', name:'Piedra del Alma: Sabiduría (B)',        tier:'B', icon:'📘', bonus:{stat:'maxsta', value:96},
    special:{type:'mp_refund', chance:0.40, amount:0.05},
    desc:'+96 MP máximo. 40% de probabilidad de recuperar el 5% del MP gastado.', preview:'Desde A: probabilidad de escudo de maná (pendiente de implementar).'},
  sabiduria_a: {id:'sabiduria_a', family:'sabiduria', name:'Piedra del Alma: Sabiduría (A)',        tier:'A', icon:'📘', bonus:{stat:'maxsta', value:128},
    special:{type:'mp_refund', chance:0.80, amount:0.05},
    desc:'+128 MP máximo. 80% de probabilidad de recuperar el 5% del MP gastado. (El escudo de maná prometido en este rango todavía no está implementado.)'},

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
    desc:'+8 Habilidad. 4% de probabilidad de quemar (fuego), congelar/ralentizar (hielo) o sangrar (físico) al enemigo, según la habilidad usada.', preview:'Desde A: doble lanzamiento (pendiente de implementar).'},
  instinto_c:  {id:'instinto_c',  family:'instinto',  name:'Piedra del Alma: Instinto (C)',         tier:'C', icon:'🟢', bonus:{stat:'hab', value:16},
    special:{type:'elemental_proc', chance:0.08},
    desc:'+16 Habilidad. 8% de probabilidad de quemar (fuego), congelar/ralentizar (hielo) o sangrar (físico) al enemigo, según la habilidad usada.', preview:'Desde A: doble lanzamiento (pendiente de implementar).'},
  instinto_b:  {id:'instinto_b',  family:'instinto',  name:'Piedra del Alma: Instinto (B)',         tier:'B', icon:'🟢', bonus:{stat:'hab', value:24},
    special:{type:'elemental_proc', chance:0.16},
    desc:'+24 Habilidad. 16% de probabilidad de quemar (fuego), congelar/ralentizar (hielo) o sangrar (físico) al enemigo, según la habilidad usada.', preview:'Desde A: doble lanzamiento (pendiente de implementar).'},
  instinto_a:  {id:'instinto_a',  family:'instinto',  name:'Piedra del Alma: Instinto (A)',         tier:'A', icon:'🟢', bonus:{stat:'hab', value:32},
    special:{type:'elemental_proc', chance:0.32},
    desc:'+32 Habilidad. 32% de probabilidad de quemar (fuego), congelar/ralentizar (hielo) o sangrar (físico) al enemigo, según la habilidad usada. (El doble lanzamiento prometido en este rango todavía no está implementado.)'},

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
    special:{type:'mp_refund', chance:1, amount:0.05},
    desc:'+160 MP máximo. Recuperas siempre el 5% del MP gastado.'},
  sabiduria_ss:{id:'sabiduria_ss',family:'sabiduria', name:'Piedra del Alma: Sabiduría (SS)',       tier:'SS', icon:'📘', bonus:{stat:'maxsta', value:200},
    special:{type:'mp_refund', chance:1, amount:0.05},
    desc:'+200 MP máximo. Recuperas siempre el 5% del MP gastado.'},

  voluntad_s:  {id:'voluntad_s',  family:'voluntad',  name:'Piedra del Alma: Voluntad (S)',         tier:'S', icon:'🔷', bonus:{stat:'esp', value:40},
    special:{type:'esp_refund', chance:1, amount:0.05},
    desc:'+40 Espíritu. Recuperas siempre el 5% del espíritu gastado.'},
  voluntad_ss: {id:'voluntad_ss', family:'voluntad',  name:'Piedra del Alma: Voluntad (SS)',        tier:'SS', icon:'🔷', bonus:{stat:'esp', value:50},
    special:{type:'esp_refund', chance:1, amount:0.05},
    desc:'+50 Espíritu. Recuperas siempre el 5% del espíritu gastado.'},

  instinto_s:  {id:'instinto_s',  family:'instinto',  name:'Piedra del Alma: Instinto (S)',         tier:'S', icon:'🟢', bonus:{stat:'hab', value:40},
    special:{type:'elemental_proc', chance:0.64},
    desc:'+40 Habilidad. 64% de probabilidad de quemar (fuego), congelar/ralentizar (hielo) o sangrar (físico) al enemigo, según la habilidad usada.'},
  instinto_ss: {id:'instinto_ss', family:'instinto',  name:'Piedra del Alma: Instinto (SS)',        tier:'SS', icon:'🟢', bonus:{stat:'hab', value:50},
    special:{type:'elemental_proc', chance:1},
    desc:'+50 Habilidad. Siempre quemas, congelas/ralentizas o sangras al enemigo, según la habilidad usada.'},

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

let state = null;
let combat = null; // transient combat state, rebuilt each fight
let invOpen = false; // whether the inventory/equipment panel is showing
let equipTarget = 'player'; // 'player' o el id de un aliado — a quién equipa el Inventario ahora mismo
let invGearFilter = 'todos'; // 'todos' o un EQUIP_SLOTS — qué categoría de la mochila se muestra
let homeOpen = false; // whether the Hogar (home stash) panel is showing
let shopOpen = false; // whether the Tienda (shop) panel is showing
let rankingOpen = false; // whether the Ranking panel is showing
let adminOpen = false; // whether the Admin panel is showing
let missionsOpen = false; // whether the Gremio (missions board) panel is showing
let tabernaOpen = false; // whether the Taberna (allies) panel is showing
let ofrendaOpen = false; // whether the Otorgar Ofrenda (pet gacha) panel is showing
let checkinOpen = false; // whether the check-in diario panel is showing
let currentUser = null; // Supabase auth user
let currentProfile = null; // {id, username, role, is_banned}

function freshState(raceId, styleId){
  return {
    char:{
      race:raceId, style:styleId,
      level:1, xp:0,
      gold:20,
      curHP:null, curSta:null, curSpi:null, // set after derived calc
      equip:{arma:null, arma2:null, armadura:null, amuleto:null, casco:null, botas:null, guantes:null},
      inventory:[], // {kind:'equip', uid, slot, name, bonus} or {kind:'potion', potionId, qty} or {kind:'soulstone', uid, stoneId, ...}
      itemCounter:0,
      maxLevelUnlocked:1, // highest labyrinth level (1-10) unlocked so far
      record:{level:1, floorIdx:0}, // deepest point ever reached (updates on every floor entered, not just guardian kills)
      stash:{gold:0, items:[]}, // Hogar: safe storage, never touched by death penalties
      soulSlots:[], // piedras de alma engarzadas; se desbloquea 1 espacio cada 10 niveles
      pets:{owned:{}, equipped:[], pendingFreePulls:0}, // Caídos del Laberinto — owned:{petId:cantidad}, equipped:[petId,...], pendingFreePulls: tiradas gratis acumuladas sin reclamar (check-in / admin)
      checkin:{day:0, lastClaimDate:null} // check-in diario 1-30, ver CHECKIN_REWARDS
    },
    dungeon:null, // {floors, atFloor, atNode, level, done}
    log:[]
  };
}

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
  state.log.push(msg);
  if(state.log.length > 60) state.log.shift();
  renderLog();
  save();
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
  if(key==='fisico') v += petModSum('defensa_fisica');
  if(state.char.race === 'enano' && key==='fisico'){ /* flat handled in damage calc */ }
  return clamp(v, -60, 80);
}

// Vida máxima (2026-09-16, pedido explícito): Físico deja de alimentar la
// vida — ahora esa estadística solo importa para daño/otras cosas, y la
// "Vida máxima" es un stat propio del equipo (Casco, ver GEAR_CATALOG).
// Lo que SÍ debe subir la vida es el nivel, y con más fuerza que antes: a
// nivel 16 un Asesino no llegaba ni a 230 HP, que se sentía injusto contra
// jefes de ~10 mil HP — la meta que dio ariochbu fue ~700-800 HP a nivel 20
// para Asesino y ~1000-1100 para Guerrero. HP_PER_LEVEL variaría por senda
// (el Guerrero es más resistente por diseño, no por su Físico) — Tirador y
// Mago no vinieron con una meta explícita, los ubiqué por criterio propio
// entre ambos extremos (Tirador cerca de Asesino, Mago el más frágil).
const HP_BASE = 40;
// 2026-09-16, pedido explícito (segunda baja: el laberinto se sentía muy
// fácil con la vida anterior) — Guerrero baja a x20, el resto a x10.
const HP_PER_LEVEL = {pesada:20, tirador:10, doblefilo:10, mago:10, sacerdote:10};
function derived(){
  const fis = baseStat('fis'), esp = baseStat('esp'), hab = baseStat('hab');
  let maxHP = Math.round(HP_BASE + state.char.level * (HP_PER_LEVEL[state.char.style]||40));
  let maxSta = Math.round(20 + fis*3 + hab*2);
  let maxSpi = Math.round(20 + esp*4);
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
  const fortalezaMentalPct = equipModsSum(eq, 'fortaleza_mental');
  // Fortaleza mental (Accesorio) ahora también aporta un poco a Resistencia
  // mágica (pedido explícito: "separarlas, pero que fortaleza mental
  // también aumente un poco resistencia mágica") — a una fracción de lo que
  // aporta Botas, para que Botas siga siendo la fuente principal.
  const FORTALEZA_MENTAL_TO_RES_MAGICA = 0.4;
  const resMagica = clamp(equipModsSum(eq, 'res_magica') + petModSum('res_magica') + fortalezaMentalPct*FORTALEZA_MENTAL_TO_RES_MAGICA, -60, 80);
  const fortalezaMental = clamp(fortalezaMentalPct/100, 0, 0.9);
  const resistenciaEstado = clamp((equipModsSum(eq, 'resistencia_estado') + petModSum('resistencia_estado'))/100, 0, 0.9);
  // Precisión y Penetración: además de lo que dé el equipo, crecen solas
  // con el nivel (pedido explícito) — sin nada de equipo, un nivel 60 ya
  // trae ~9% de Precisión "de fábrica".
  const PRECISION_PER_LEVEL = 0.0015, PENETRACION_PER_LEVEL = 0.001;
  const precision = clamp(equipModsSum(eq, 'precision')/100 + state.char.level*PRECISION_PER_LEVEL, 0, 0.9);
  const penetracionNivel = state.char.level*PENETRACION_PER_LEVEL;
  const petCritProc = specialsFromPets().filter(sp=>sp.type==='prob_critico').reduce((s,sp)=>s+sp.value,0);
  const critChance = clamp(0.05 + hab*0.006 + (race().id==='bestia'?0.15:0) + petCritProc, 0, 0.6);
  const critDmgBonus = specialsFromPets().filter(sp=>sp.type==='critico_dano').reduce((s,sp)=>s+sp.value,0);
  // Esquivar: viene de Habilidad, pero solo la parte "natural" (raza + nivel)
  // pesa completo — la que aporta EQUIPO pesa la mitad (2026-09-16, pedido
  // explícito). El Asesino es la única senda cuya arma1+arma2+guantes vierten
  // TODO su bono en Habilidad (ver GEAR_CLASS_STAT/WEAPON_CATALOG.doblefilo),
  // así que sin este freno llegaba a 40-60% de esquivar ya en nivel 10-20 con
  // buen equipo — se quiere que ese techo se sienta recién por los niveles
  // 35-40, sin perder la esencia de "el Asesino esquiva mucho porque invierte
  // en Habilidad". Las demás sendas casi no cambian: su equipo no alimenta
  // Habilidad, así que su evasión ya era casi toda "natural".
  const habNatural = race().stats.hab + Math.floor((state.char.level-1)*1);
  const habGear = Math.max(0, hab - habNatural);
  const EVASION_GEAR_HAB_WEIGHT = 0.5;
  let evasionBase = 0.04 + habNatural*0.005 + habGear*0.005*EVASION_GEAR_HAB_WEIGHT + (race().id==='hada'?0.15:0);
  socketedStones().forEach(s=>{
    // itemSpecialsArr (no solo s.special) porque Sombra Cazadora A/S/SS ya
    // trae 2 specials a la vez (evasión + invocar sombra, ver
    // trySummonShadow) y usa el formato en array desde el 2026-09-25.
    itemSpecialsArr(s).forEach(sp=>{ if(sp.type==='evasion_flat') evasionBase += sp.value; });
  });
  specialsFromEquip(eq).forEach(sp=>{
    if(sp.type==='evasion_flat') evasionBase += sp.value;
  });
  return {fis,esp,hab,maxHP,maxSta,maxSpi,critChance,critDmgBonus,evasionBase,resMagica,fortalezaMental,resistenciaEstado,precision,penetracionNivel};
}

function scaleStatValue(){
  const d = derived();
  const sc = style().scaleStat;
  if(sc==='fis') return d.fis;
  if(sc==='esp') return d.esp;
  if(sc==='hab') return d.hab;
  if(sc==='fishab') return (d.fis+d.hab)/2;
  return d.fis;
}

function skillBaseDamage(){
  return 8 + scaleStatValue()*2.2 + state.char.level*1.5;
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
}

// El personaje vive en la tabla `characters` de Supabase (1 fila por cuenta).
// La Crónica (log) es solo sabor narrativo, no progreso: se queda en
// localStorage por dispositivo para no generar escrituras de red por cada línea.
function logStorageKey(){ return currentUser ? 'dns_log_'+currentUser.id : null; }
function loadLocalLog(){
  const key = logStorageKey();
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
    dungeon: state.dungeon
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
  return Object.assign({}, stone, {
    name: tpl.name, tier: tpl.tier, icon: tpl.icon, desc: tpl.desc,
    preview: tpl.preview, bonus: tpl.bonus, special: tpl.special
  });
}
// Mismo criterio que refreshStoneFromTemplate, pero para equipo (armas y
// equipo general): un objeto ya dropeado quedó guardado como una copia
// congelada de bonus/mods/specials en el momento de caer, así que un
// rebalanceo posterior (como la subida de vida de Rango A del 2026-09-24)
// nunca llegaba a lo que un jugador ya tenía equipado o en la mochila.
// Se re-deriva del catálogo vigente por identidad (slot+styleId+rarity+
// nombre), preservando uid y cualquier campo propio de la instancia.
function refreshGearFromTemplate(item){
  if(!item || item.kind!=='equip' || !item.styleId || !item.rarity) return item;
  const fresh = (item.slot==='arma' || item.slot==='arma2')
    ? makeWeaponItem(item.slot, item.styleId, item.rarity, item.name)
    : makeGearItem(item.slot, item.styleId, item.rarity);
  if(!fresh) return item; // esa combinación ya no existe en el catálogo - se deja como está, defensivo
  return Object.assign({}, item, {
    name: fresh.name, bonus: fresh.bonus, mods: fresh.mods, specials: fresh.specials
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
      bannedAllyTemplates: row.banned_ally_templates || []
    },
    dungeon: row.dungeon || null,
    log: loadLocalLog()
  };
}

let saveTimer = null;
let pendingSave = false;
const SAVE_DEBOUNCE_MS = 1500;

async function flushSave(){
  if(!state || !currentUser) return;
  pendingSave = false;
  const { error } = await supabase.from('characters').update(characterToRow()).eq('id', state.char.id);
  if(error) console.error('No se pudo guardar la partida:', error.message);
}

async function save(){
  saveLocalLog();
  if(!state || !currentUser) return;
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
  const { data, error } = await supabase.from('profiles').select('id, username, username_set, is_banned').eq('id', userId).maybeSingle();
  if(error){ console.error('No se pudo cargar el perfil:', error.message); return null; }
  return data;
}

/* ============================================================
   DUNGEON LEVELS (1-60)
   ============================================================ */
const LEVEL_CAP = 60;
const CHAR_LEVEL_CAP = 60; // tope de nivel de personaje pedido
function mobXP(level){ return level; }        // mobs normales: 1 en piso 1, 2 en piso 2...
// 2026-09-25, pedido explícito: recalibrados para que el élite y el
// guardián/jefe de década den más en piso 1 (7 y 12 respectivamente, antes
// 2 y 4) — el aumento del 50% general (ver XP_GLOBAL_BOOST más abajo) se
// calcula sobre estos nuevos valores, no sobre los viejos.
function eliteXP(level){ return level+6; }    // élites: antes mob+1, ahora mob+6 (piso 1 = 7)
function guardianXP(level){ return 2*level+10; } // guardianes/jefes de década: antes 2×mob+2, ahora 2×mob+10 (piso 1 = 12)
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
function checkpointLevelsUnlocked(){
  const levels = [];
  for(let lvl=1; lvl<=(state.char.checkpointLevel||1); lvl+=10) levels.push(lvl);
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
  ensureSoulSlots();
  document.getElementById('clock-badge').style.display = 'flex';
  updateClockBadge();
  const musicBtn = document.getElementById('btn-music-toggle');
  musicBtn.style.display = 'inline-block';
  musicBtn.textContent = getLoginAudioMuted() ? '🔇 Música' : '🔊 Música';
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
    navEl.style.display = (inDungeonRun || inCombat) ? 'none' : 'flex';
    const navAdminBtn = document.getElementById('nav-admin-btn');
    if(navAdminBtn) navAdminBtn.style.display = (state.char.role==='admin') ? 'inline-flex' : 'none';
    const activeNavKey = homeOpen?'home' : shopOpen?'shop' : tabernaOpen?'taberna' : missionsOpen?'missions' : rankingOpen?'ranking' : adminOpen?'admin' : 'city';
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
function renderSheet(){
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

  document.getElementById('sheet').innerHTML = `
    <div class="sheet-title">
      <div class="sheet-emblem"><img src="src/assets/razas/${r.id}.png" alt="" onerror="this.replaceWith('${r.icon}')"></div>
      <div>
        <div class="name">${state.char.nickname} · ${r.name} · <img src="src/assets/clases/${s.id}.png" alt="" style="width:1.1em; height:1.1em; object-fit:contain; vertical-align:-2px;" onerror="this.replaceWith('${s.icon} ')"> ${s.name}</div>
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
    </div>

    <div class="section-label">Estadísticas de combate</div>
    <div class="res-list">
      <span class="res-chip pos">Crítico +${Math.round(d.critChance*100)}%</span>
      <span class="res-chip pos">Evasión ${Math.round(d.evasionBase*100)}%</span>
      <span class="res-chip ${stunChance>0?'pos':''}">Aturdir al golpear ${Math.round(stunChance*100)}%</span>
    </div>
    <div class="sheet-hint">Evasión mostrada fuera de combate; en combate varía según el nivel del enemigo y tus efectos activos. Aturdir al golpear depende del arma y las piedras de alma que lleves equipadas.</div>

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
// bonus.stat/bonus.res de siempre (ver GEAR_CATALOG) — cada objeto puede
// traer varias a la vez (ej. Casco: maxhp_flat + precision juntos).
const MOD_LABELS = {maxhp_flat:'Vida máxima', precision:'Precisión', res_magica:'Resistencia mágica', resistencia_estado:'Resistencia a efectos de estado', fortaleza_mental:'Fortaleza mental', mp_flat:'MP', espiritu_flat:'Espíritu'};
const MOD_IS_PERCENT = new Set(['precision','resistencia_estado','fortaleza_mental']);
function itemBonusText(item){
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
  return parts.join(', ') + (parts.length ? '.' : '');
}
// Ícono por tipo de slot (y, en arma/arma2, por senda del arma) — pedido
// explícito 2026-09-25: el inventario era 100% texto, sin nada que distinga
// de un vistazo un casco de unas botas. Aproximado, no hay arte real por
// ítem todavía.
const EQUIP_SLOT_ICONS = {armadura:'🧥', amuleto:'📿', casco:'🪖', botas:'👢', guantes:'🧤'};
const WEAPON_STYLE_ICONS = {pesada:'⚔️', doblefilo:'🗡️', tirador:'🏹', mago:'🪄', sacerdote:'✨'};
const OFFHAND_STYLE_ICONS = {pesada:'🛡️', doblefilo:'🗡️', tirador:'🏹', mago:'🔮', sacerdote:'📖'};
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
  'Grimorio de plegarias':'book', 'Tomo sagrado':'book'
};
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
  'Grimorio de plegarias':'grimorio_de_plegarias', 'Tomo sagrado':'tomo_sagrado'
};
const WEAPON_ART_RARITIES = new Set(['comun','poco_comun','raro','rango_b','rango_a','legendario']);
function weaponArtPath(it){
  const slug = WEAPON_NAME_SLUG[it.name];
  if(!slug || !WEAPON_ART_RARITIES.has(it.rarity)) return null;
  return `src/assets/armas/${slug}_${it.rarity}.png`;
}
// Arte real de equipo general por senda (2026-09-25, pedido explícito:
// "continúa con cascos y armadura", luego "guantes y botas"). A diferencia
// de las armas, el NOMBRE del objeto cambia por rango (Casco de piedra ->
// ... -> Casco de vacío), así que la clave acá es (senda, slot) — no el
// nombre — más el rango. Recortado de los catálogos "Cascos - <clase>.png" /
// "armadura - <clase>.png" / "guantes - <clase>.png" / "botas - <clase>.png"
// en src/assets/equipo/<senda>_<slot>_<rareza>.png. Solo Accesorio (amuleto)
// sigue sin arte propia — cae al SVG genérico de siempre.
const GEAR_ART_SLOTS = new Set(['casco','armadura','guantes','botas','amuleto']);
function gearArtPath(it){
  if(!GEAR_ART_SLOTS.has(it.slot) || !it.styleId || !WEAPON_ART_RARITIES.has(it.rarity)) return null;
  return `src/assets/equipo/${it.styleId}_${it.slot}_${it.rarity}.png`;
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
  return WEAPON_NAME_SHAPE[it.name] || null;
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
['F','E','D','C','B','A','S','SS'].forEach(t=> SOUL_STONE_ART[t] = `src/assets/piedras/${t}.png`);
function itemArtTileHTML(it, px){
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
    inner = `<img src="${artImg}" alt="" style="width:100%; height:100%; object-fit:contain;" onerror="this.replaceWith(Object.assign(document.createElement('span'),{style:'font-size:${Math.round(px*0.55)}px', textContent:'${fallbackIcon}'}))">`;
  } else if(shape){
    inner = `<svg viewBox="0 0 24 24" width="${Math.round(px*0.62)}" height="${Math.round(px*0.62)}" fill="currentColor">${ITEM_ART_SHAPES[shape]}</svg>`;
  } else {
    inner = `<span style="font-size:${Math.round(px*0.55)}px;">${equipIcon(it)}</span>`;
  }
  return `<div class="item-art-tile" style="width:${px}px; height:${px}px; color:${color}; box-shadow:0 0 0 2px ${color}55 inset${glow};">${inner}</div>`;
}
// Envuelve el tile de ícono + el bloque de texto existente (nombre/pill/
// descripción) en una fila flex — el texto no cambia una letra, solo se le
// suma el ícono al lado.
function itemRowWithArt(it, textHTML, px){
  return `<div style="display:flex; align-items:center; gap:10px; min-width:0; flex:1;">${itemArtTileHTML(it, px)}<div style="min-width:0; flex:1;">${textHTML}</div></div>`;
}
// Arte real de pociones (2026-09-25, pedido explícito) — sin rareza, así que
// el tile usa un anillo neutro (bronce) en vez del color por rango. Mismo
// respaldo de emoji si la imagen no existe.
function potionArtTileHTML(potionId, px){
  px = px || 36;
  const tpl = POTION_TEMPLATES[potionId];
  const inner = `<img src="src/assets/pociones/${potionId}.png" alt="" style="width:100%; height:100%; object-fit:contain;" onerror="this.replaceWith(Object.assign(document.createElement('span'),{style:'font-size:${Math.round(px*0.55)}px', textContent:'${tpl.icon}'}))">`;
  return `<div class="item-art-tile" style="width:${px}px; height:${px}px; box-shadow:0 0 0 2px var(--border) inset;">${inner}</div>`;
}
function potionRowWithArt(potionId, textHTML, px){
  return `<div style="display:flex; align-items:center; gap:10px; min-width:0; flex:1;">${potionArtTileHTML(potionId, px)}<div style="min-width:0; flex:1;">${textHTML}</div></div>`;
}
// Halo de color por rareza para toda la fila (no solo el nombre) — mismo
// criterio que pedía distinguir de un vistazo un objeto Rango A/Legendario
// del resto sin tener que leer el pill. El degradado se apaga a los ~110px
// para no teñir el botón de Equipar/Vender del otro extremo de la fila.
function rarityRowStyle(it){
  const r = RARITIES[it.rarity||'comun'];
  return `border-left:3px solid ${r.color}; background:linear-gradient(90deg, ${r.color}1f, ${r.color}00 110px);`;
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
  // en casos viejos, en cuyo caso no se muestra ninguna etiqueta.
  const roleTag = it.styleId ? ` <span class="slot-tag" style="border-color:var(--bronze); color:var(--bronze-light);">${SHOP_ROLE_LABELS[it.styleId]||it.styleId}</span>` : '';
  // Rango A en adelante suma un halo de texto (además del color) — el color
  // solo a veces no basta para que un objeto especial se note al lado del
  // resto de la interfaz, sobre todo en pantallas chicas.
  const glow = ['rango_a','legendario','ss'].includes(it.rarity) ? ` text-shadow:0 0 8px ${r.color}99;` : '';
  return `<b style="color:${r.color};${glow}">${it.name}</b> <span class="slot-tag" style="border-color:${r.color}; color:${r.color};">${r.name}</span>${roleTag}`;
}

// Sector de mascotas dentro del Inventario (2026-09-24, pedido explícito:
// "un sector apartado para ellos... que no consuma tanto espacio visual y
// separaciones por categoria") — solo se muestra lo que ya se ganó (nunca
// pinta los 100 huecos vacíos, eso sí ocuparía muchísimo espacio), en
// miniaturas chicas agrupadas por rango, con un check dorado sobre la
// equipada. Clic en cualquiera togglea equipar/quitar respetando
// maxPetSlots().
function renderPetSectionHTML(){
  ensurePets();
  const slots = maxPetSlots();
  const eqIds = equippedPetIds();
  const groupsHTML = PET_RARITY_ORDER.map(rarity=>{
    const all = PET_CATALOG.filter(p=>p.rarity===rarity);
    const owned = all.filter(p=>ownedPetCount(p.id)>0);
    if(!owned.length) return '';
    const r = PET_RARITIES[rarity];
    const tiles = owned.map(p=>{
      const equipped = eqIds.includes(p.id);
      return `<div class="pet-mini-tile ${equipped?'equipped':''}" data-pet-toggle="${p.id}" title="${p.name}${equipped?' (equipada)':''}" style="box-shadow:0 0 0 2px ${equipped?'var(--bronze-light)':r.color+'88'} inset;">
        <img src="${petArtPath(p.id)}" alt="${p.name}" loading="lazy">
        ${equipped ? '<span class="pet-equipped-badge">✓</span>' : ''}
      </div>`;
    }).join('');
    return `<div class="pet-rarity-row">
      <div class="pet-rarity-label" style="color:${r.color};">${r.name} <span style="opacity:0.7;">(${owned.length}/${all.length})</span></div>
      <div class="pet-mini-grid">${tiles}</div>
    </div>`;
  }).join('');
  return `
    <div class="section-label">Caídos del Laberinto <span style="font-weight:normal; color:var(--text-dim); font-size:0.8em;">(${eqIds.length}/${slots} equipadas)</span></div>
    ${groupsHTML || `<p class="inv-empty-msg">Aún no tienes ninguna. Consigue tu primera en 🌳 Otorgar ofrenda, en la ciudad.</p>`}
  `;
}

function renderInventory(){
  const allies = state.char.allies || [];
  const targetRow = equipTarget!=='player' ? allies.find(a=>a.id===equipTarget) : null;
  if(equipTarget!=='player' && !targetRow) equipTarget = 'player'; // el aliado ya no existe (lo despediste, etc.)
  const targetEquip = targetRow ? (targetRow.equip||{}) : state.char.equip;
  const targetName = targetRow ? targetRow.name : 'ti';

  const targetSelectorHTML = allies.length ? `
    <div class="section-label" style="margin-top:6px;">Equipando a</div>
    <select id="equip-target-select" class="auth-input" style="max-width:260px;">
      <option value="player" ${equipTarget==='player'?'selected':''}>Tú</option>
      ${allies.map(a=>`<option value="${a.id}" ${equipTarget===a.id?'selected':''}>${a.name} (${a.role})</option>`).join('')}
    </select>
  ` : '';

  const equippedHTML = EQUIP_SLOTS.map(slot=>{
    const it = targetEquip[slot];
    const label = slotLabel(slot);
    if(!it){
      return `<div class="inv-slot">
        <div class="inv-slot-label">${label}</div>
        <div class="inv-empty">— vacío —</div>
      </div>`;
    }
    return `<div class="inv-slot">
      <div class="inv-slot-label">${label}</div>
      <div class="inv-item-row" style="margin-bottom:0; ${rarityRowStyle(it)}">
        ${itemRowWithArt(it, `${itemNameHTML(it)}<div class="inv-item-bonus">${itemBonusText(it)}</div>`)}
        <button class="inv-btn danger" data-unequip="${slot}">Quitar</button>
      </div>
    </div>`;
  }).join('');

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
  const gearHTML = gearItems.length ? EQUIP_SLOTS.filter(slot=> invGearFilter==='todos' || slot===invGearFilter).map(slot=>{
    const items = gearItems.filter(it=>it.slot===slot);
    if(!items.length) return '';
    const rows = items.map(it=>`
      <div class="inv-item-row" style="${rarityRowStyle(it)}">
        ${itemRowWithArt(it, `${itemNameHTML(it)}<div class="inv-item-bonus">${itemBonusText(it)}</div>`)}
        <button class="inv-btn" data-equip="${it.uid}">Equipar en ${targetName}</button>
      </div>
    `).join('');
    return `<div class="section-label" style="margin-top:6px; font-size:0.85em;">${slotLabel(slot)}</div>${rows}`;
  }).join('') : `<p class="inv-empty-msg">No llevas equipo suelto en la mochila.</p>`;

  const potionHTML = potionItems.length ? potionItems.map(it=>{
    const tpl = POTION_TEMPLATES[it.potionId];
    return `<div class="inv-item-row">
      ${potionRowWithArt(it.potionId, `<b>${tpl.name}</b> <span class="slot-tag">x${it.qty}</span><div class="inv-item-bonus neutral">${tpl.desc}</div>`)}
      <button class="inv-btn" data-usepotion="${it.potionId}">Usar</button>
    </div>`;
  }).join('') : `<p class="inv-empty-msg">No tienes pociones. Búscalas en cofres del laberinto.</p>`;

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
        ${itemRowWithArt(stone, `<b style="color:${c};">${stone.name}</b> <span class="slot-tag" style="border-color:${c}; color:${c};">${stone.tier}</span><div class="inv-item-bonus">${stone.desc}</div>`)}
        <button class="inv-btn danger" ${unsocketAttr}>Retirar</button>
      </div>
    </div>`;
  }).join('') : soulSlotsEmptyMsg;

  const stoneItems = state.char.inventory.filter(i=>i.kind==='soulstone');
  const stoneBagHTML = stoneItems.length ? stoneItems.map(it=>{
    const c = SOUL_TIER_COLORS[it.tier] || 'var(--text)';
    const sameFamily = soulSlotsSource.find(s=>s && s.family===it.family);
    const noRoom = soulSlotsSource.length===0 || soulSlotsSource.every(s=>s);
    const blocked = sameFamily ? soulTierIdx(it.tier) < soulTierIdx(sameFamily.tier) : noRoom;
    const btnLabel = sameFamily ? 'Reemplazar' : 'Engarzar';
    const socketAttr = isAllyTargetForStones ? `data-socket-ally="${it.uid}|${targetRow.id}"` : `data-socket="${it.uid}"`;
    return `<div class="inv-item-row">
      ${itemRowWithArt(it, `<b style="color:${c};">${it.name}</b> <span class="slot-tag" style="border-color:${c}; color:${c};">${it.tier}</span><div class="inv-item-bonus">${it.desc}</div>`)}
      <button class="inv-btn" ${socketAttr} ${blocked?'disabled':''}>${btnLabel} en ${targetName}</button>
    </div>`;
  }).join('') : `<p class="inv-empty-msg">No tienes piedras de alma. Las dejan caer los guardianes de nivel 4 en adelante.</p>`;

  const fragmentItems = state.char.inventory.filter(i=>i.kind==='fragmento');
  const fragmentHTML = fragmentItems.length ? `<div class="inv-item-row" style="flex-wrap:wrap; gap:8px;">
    ${fragmentItems.map(it=>`<span class="slot-tag" style="border-color:var(--bronze); color:var(--bronze-light);">${it.icon} ${it.name} x${it.qty}</span>`).join('')}
  </div>` : '';
  const fragmentSection = fragmentItems.length ? `
    <div class="section-label">Fragmentos de jefe de década</div>
    <p style="color:var(--text-dim); font-size:0.82em; margin-top:0;">Ingredientes de la Forja Legendaria (Tienda, piso 40+). Uno garantizado por cada jefe de década derrotado.</p>
    ${fragmentHTML}
  ` : '';

  document.getElementById('main-panel').innerHTML = `
    <div style="display:flex; align-items:center; justify-content:space-between; gap:10px; margin-bottom:4px;">
      <h3 style="color:var(--bronze-light);">Inventario y equipamiento</h3>
      <button class="reset-btn" id="btn-close-inv">Cerrar</button>
    </div>
    <p style="color:var(--text-dim); font-size:0.85em; margin-top:0;">Equipa y desequipa a tu gusto entre combates para ajustar tu estrategia. La mochila es una sola para todo el equipo — decides tú quién se queda con cada objeto.</p>
    ${targetSelectorHTML}

    <div class="section-label" style="margin-top:6px;">Equipado (${targetName})</div>
    ${equippedHTML}

    <div class="section-label">Equipo en la mochila</div>
    ${gearFilterHTML}
    ${gearHTML}

    <div class="section-label">Pociones</div>
    ${potionHTML}

    <div class="section-label">Piedras de alma</div>
    ${soulSlotsHTML}
    ${stoneBagHTML}
    ${fragmentSection}
    ${targetRow ? '' : renderPetSectionHTML()}
  `;

  document.getElementById('btn-close-inv').onclick = ()=>{ invOpen=false; renderAll(); };
  document.querySelectorAll('[data-pet-toggle]').forEach(el=>{
    el.onclick = ()=>{ togglePetEquip(el.dataset.petToggle); renderSheet(); renderInventory(); save(); };
  });
  const targetSelect = document.getElementById('equip-target-select');
  if(targetSelect) targetSelect.onchange = ()=>{ equipTarget = targetSelect.value; renderInventory(); };
  document.querySelectorAll('[data-gearfilter]').forEach(btn=>{
    btn.onclick = ()=>{ invGearFilter = btn.dataset.gearfilter; renderInventory(); };
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

function addToInventory(item){
  if(item.kind==='potion'){
    const existing = state.char.inventory.find(i=>i.kind==='potion' && i.potionId===item.potionId);
    if(existing) existing.qty += 1;
    else state.char.inventory.push({kind:'potion', potionId:item.potionId, qty:1});
  } else if(item.kind==='fragmento'){
    const existing = state.char.inventory.find(i=>i.kind==='fragmento' && i.fragId===item.fragId);
    if(existing) existing.qty += 1;
    else state.char.inventory.push({kind:'fragmento', fragId:item.fragId, name:item.name, icon:item.icon, qty:1});
  } else if(item.kind==='soulstone'){
    state.char.itemCounter = (state.char.itemCounter||0) + 1;
    item.uid = 'it'+state.char.itemCounter;
    state.char.inventory.push(item);
  } else {
    state.char.itemCounter = (state.char.itemCounter||0) + 1;
    item.uid = 'it'+state.char.itemCounter;
    item.kind = 'equip';
    state.char.inventory.push(item);
  }
}

function equipItem(uid){
  const idx = state.char.inventory.findIndex(i=>i.kind==='equip' && i.uid===uid);
  if(idx<0) return;
  const item = state.char.inventory[idx];
  if(item.styleId && item.styleId !== state.char.style){
    log(`<b>${item.name}</b> es un arma de ${SHOP_ROLE_LABELS[item.styleId]||item.styleId} — tu senda no puede usarla.`);
    return;
  }
  const prior = state.char.equip[item.slot];
  state.char.equip[item.slot] = item;
  state.char.inventory.splice(idx,1);
  if(prior) state.char.inventory.push(prior);
  log(`Equipas <b>${item.name}</b>${prior ? ` (guardas ${prior.name} en la mochila)` : ''}.`);
  renderSheet();
  if(invOpen) renderInventory();
  save();
}

function unequipItem(slot){
  const item = state.char.equip[slot];
  if(!item) return;
  state.char.equip[slot] = null;
  // El equipo inicial (grantStarterKit) se asigna directo a state.char.equip
  // sin pasar por addToInventory, así que nunca recibió un uid — sin esto,
  // el item quedaba en la mochila pero sin poder venderse ni guardarse en
  // el Hogar (los botones dependen de it.uid para encontrarlo).
  if(!item.uid){
    state.char.itemCounter = (state.char.itemCounter||0) + 1;
    item.uid = 'it'+state.char.itemCounter;
  }
  state.char.inventory.push(item);
  log(`Desequipas <b>${item.name}</b>.`);
  renderSheet();
  if(invOpen) renderInventory();
  save();
}

async function saveAllyEquip(row){
  const { error } = await supabase.from('character_allies').update({equip: row.equip||{}}).eq('id', row.id);
  if(error) console.error('No se pudo guardar el equipo del aliado:', error.message);
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
  if(item.styleId && item.styleId !== ALLY_ROLE_TO_WEAPON_STYLE[row.role]){
    log(`<b>${item.name}</b> es un arma de ${SHOP_ROLE_LABELS[item.styleId]||item.styleId} — ${row.name} (${row.role}) no puede usarla.`);
    return;
  }
  if(!row.equip) row.equip = {};
  const prior = row.equip[item.slot];
  row.equip[item.slot] = item;
  state.char.inventory.splice(idx,1);
  if(prior) state.char.inventory.push(prior);
  log(`Equipas <b>${item.name}</b> en <b>${row.name}</b>${prior ? ` (guardas ${prior.name} en la mochila)` : ''}.`);
  saveAllyEquip(row);
  if(invOpen) renderInventory();
  save();
}
function unequipAllyItem(allyId, slot){
  const row = (state.char.allies||[]).find(a=>a.id===allyId);
  if(!row || !row.equip) return;
  const item = row.equip[slot];
  if(!item) return;
  row.equip[slot] = null;
  if(!item.uid){
    state.char.itemCounter = (state.char.itemCounter||0) + 1;
    item.uid = 'it'+state.char.itemCounter;
  }
  state.char.inventory.push(item);
  log(`Desequipas <b>${item.name}</b> de <b>${row.name}</b>.`);
  saveAllyEquip(row);
  if(invOpen) renderInventory();
  save();
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
function renderCity(){
  const adminCardHTML = (state.char.role === 'admin') ? `
      <div class="action-card">
        <h3>Panel admin</h3>
        <p>Gestiona cuentas de jugadores: banear, restaurar y otorgar rol de administrador.</p>
        <button id="btn-open-admin">Abrir panel admin</button>
      </div>` : '';
  document.getElementById('main-panel').innerHTML = `
    <div class="city-art">
      <div class="icon">🏙️</div>
      <h2>La última ciudad</h2>
      <p>Solo queda una ciudad en pie en todo Dungeon &amp; Stone. El laberinto tiene 60 pisos conocidos, repartidos en décadas con su propia temática; cada uno esconde su propio guardián.</p>
      <p style="color:var(--bronze-light); font-size:0.85em; margin-top:8px;">Nivel de récord: ${describeRecord()}.</p>
      <button class="reset-btn" id="btn-open-tutorial" style="margin-top:10px;">¿Cómo jugar?</button>
    </div>
    <div class="city-actions">
      <div class="action-card">
        <h3>Entrar al laberinto</h3>
        <p>${state.char.checkpointLevel>1
          ? 'Elige desde qué checkpoint entrar — se libera uno nuevo cada vez que derrotas al jefe de una década.'
          : 'Siempre se entra desde el nivel 1, piso 1.'}</p>
        <div class="checkpoint-grid">
          ${checkpointLevelsUnlocked().map(lvl=>`<button class="checkpoint-btn ${lvl===state.char.checkpointLevel?'current':''}" data-level="${lvl}">${lvl}</button>`).join('')}
        </div>
      </div>
      <div class="action-card">
        <h3>Hogar</h3>
        <p>Guarda equipo, pociones y oro a salvo. Nada de lo guardado aquí se pierde si mueres en el laberinto.</p>
        <button id="btn-open-home">Entrar al Hogar</button>
      </div>
      <div class="action-card">
        <h3>Tienda</h3>
        <p>Compra pociones y armas básicas acordes a tu senda de combate.</p>
        <button id="btn-open-shop">Entrar a la tienda</button>
      </div>
      <div class="action-card">
        <h3>Ranking</h3>
        <p>Tu récord personal y los 10 mejores pisos alcanzados entre todos los jugadores.</p>
        <button id="btn-open-ranking">Ver ranking</button>
      </div>${adminCardHTML}
      <div class="action-card">
        <h3>Taberna</h3>
        <p>Recluta aliados para acompañarte en el laberinto (equipo de hasta 5, contándote a ti). Requiere nivel ${ALLY_MIN_LEVEL}.</p>
        <button id="btn-open-taberna">Entrar a la Taberna</button>
      </div>
      <div class="action-card">
        <h3>Gremio</h3>
        <p>Acepta misiones de exploradores a cambio de oro, experiencia y Sellos del Laberinto.</p>
        <button id="btn-open-missions">Ver misiones</button>
      </div>
      <div class="action-card ofrenda-card">
        <h3>🌳 Otorgar ofrenda</h3>
        <p>Un Ygdrasil en miniatura crece en el corazón de la ciudad. Ofrécele oro, Sellos del Laberinto o una recarga y te devolverá un Caído del Laberinto para tu colección.</p>
        <button id="btn-open-ofrenda">Acercarse al árbol</button>
      </div>
      <div class="action-card checkin-card">
        <h3>📅 Check-in diario${checkinAvailable()?' <span class="checkin-badge">¡Disponible!</span>':''}</h3>
        <p>Entra cada día para reclamar ofrendas gratis para el árbol — el día ${checkinPreviewDay()} te daría ${checkinPreviewDay()} tirada${checkinPreviewDay()===1?'':'s'} gratis. Se reinicia el día 1 de cada mes.</p>
        <button id="btn-open-checkin">${checkinAvailable()?'Reclamar recompensa de hoy':'Ver calendario'}</button>
      </div>
    </div>
    <div class="section-label">Antes de partir</div>
    <p style="color:var(--text-dim); font-size:0.85em; margin-top:0;">Revisa tu 🎒 Inventario (arriba) para equipar mejor equipo o comprobar cuántas pociones llevas antes de entrar al laberinto. Si mueres dentro perderás el equipo suelto de tu mochila y el ${DEFEAT_GOLD_LOSS_PCT}% de tu oro; si te retiras tras vencer a un guardián, conservas todo.</p>
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
  document.getElementById('btn-open-home').onclick = ()=>{
    invOpen = false; homeOpen = true; shopOpen = false; rankingOpen = false; adminOpen = false;
    renderAll();
  };
  document.getElementById('btn-open-shop').onclick = ()=>{
    invOpen = false; homeOpen = false; shopOpen = true; rankingOpen = false; adminOpen = false;
    renderAll();
  };
  document.getElementById('btn-open-ranking').onclick = ()=>{
    invOpen = false; homeOpen = false; shopOpen = false; rankingOpen = true; adminOpen = false;
    renderAll();
  };
  const adminBtn = document.getElementById('btn-open-admin');
  if(adminBtn){
    adminBtn.onclick = ()=>{
      invOpen = false; homeOpen = false; shopOpen = false; rankingOpen = false; adminOpen = true;
      renderAll();
    };
  }
  document.getElementById('btn-open-missions').onclick = ()=>{
    invOpen = false; homeOpen = false; shopOpen = false; rankingOpen = false; adminOpen = false; missionsOpen = true;
    renderAll();
  };
  document.getElementById('btn-open-tutorial').onclick = showTutorial;
  document.getElementById('btn-open-taberna').onclick = ()=>{
    invOpen = false; homeOpen = false; shopOpen = false; rankingOpen = false; adminOpen = false; missionsOpen = false; tabernaOpen = true;
    renderAll();
  };
  document.getElementById('btn-open-ofrenda').onclick = ()=>{
    invOpen = false; homeOpen = false; shopOpen = false; rankingOpen = false; adminOpen = false; missionsOpen = false; tabernaOpen = false; ofrendaOpen = true;
    renderAll();
  };
  document.getElementById('btn-open-checkin').onclick = ()=>{
    invOpen = false; homeOpen = false; shopOpen = false; rankingOpen = false; adminOpen = false; missionsOpen = false; tabernaOpen = false; ofrendaOpen = false; checkinOpen = true;
    renderAll();
  };
}

/* ============================================================
   RENDER: OTORGAR OFRENDA — gacha de mascotas "Caídos del Laberinto"
   ============================================================ */
function showPetRates(){
  const rows = PET_RARITY_ORDER.map(r=>{
    const t = PET_RARITIES[r];
    return `<div style="display:flex; justify-content:space-between; gap:10px; padding:4px 0; border-bottom:1px solid var(--border);">
      <span style="color:${t.color}; font-weight:bold;">${t.name}</span>
      <span>${t.weight}%</span>
    </div>`;
  }).join('');
  showOverlay('Tasas de invocación', `
    <p style="margin-top:0;">Cada tirada es independiente — no hay tirada garantizada (sin pity). Si sale un Caído del Laberinto que ya tienes, se convierte automáticamente en oro según su rango en vez de acumularse.</p>
    ${rows}
  `, ()=>{});
}
function petCardHTML(id, opts){
  opts = opts||{};
  const tpl = petTpl(id);
  const r = PET_RARITIES[tpl.rarity];
  return `<div class="pet-reveal-card ${opts.big?'big':''}" style="animation-delay:${opts.delay||0}ms; box-shadow:0 0 0 2px ${r.color}bb, 0 0 ${opts.big?22:12}px ${r.color}99;">
    <img src="${petArtPath(id)}" alt="${tpl.name}" loading="lazy">
    ${opts.dup ? `<div class="pet-dup-badge">Duplicado · +${PET_RARITIES[tpl.rarity].dupGold.toLocaleString('es')} oro</div>` : '<div class="pet-new-badge">¡Nuevo!</div>'}
  </div>`;
}
// x11 (x10 con regalo): todas las de rango Único o menos se revelan juntas
// primero; Épico en adelante se revela después, con más brillo — pedido
// explícito ("cuando sale x11 aparecen todas de manera simultanea, pero
// epico en adelante + se revelan al final"). Puro CSS animation-delay, sin
// timers encadenados.
function renderOfrendaResults(results){
  const container = document.getElementById('ofrenda-results');
  if(!container) return;
  if(!results || !results.length){ container.innerHTML=''; return; }
  const common = results.filter(r=>!['epico','legendario','mitico'].includes(r.tpl.rarity));
  const rare = results.filter(r=>['epico','legendario','mitico'].includes(r.tpl.rarity));
  const commonHTML = common.map((r,i)=>petCardHTML(r.id, {dup:r.isDup, delay:i*100})).join('');
  const rareDelayBase = common.length ? common.length*100 + 600 : 0;
  const rareHTML = rare.map((r,i)=>petCardHTML(r.id, {big:true, dup:r.isDup, delay:rareDelayBase + i*400})).join('');
  container.innerHTML = `<div class="pet-reveal-grid">${commonHTML}${rareHTML}</div>`;
}
function renderOfrenda(){
  ensurePets();
  const ownedCount = Object.keys(state.char.pets.owned).length;
  document.getElementById('main-panel').innerHTML = `
    <div style="display:flex; align-items:center; justify-content:space-between; gap:10px; margin-bottom:4px;">
      <h3 style="color:var(--bronze-light);">🌳 Otorgar ofrenda</h3>
      <button class="reset-btn" id="btn-close-ofrenda">Cerrar</button>
    </div>
    <p style="color:var(--text-dim); font-size:0.85em; margin-top:0;">Un Ygdrasil en miniatura crece en el corazón de la ciudad. Ofrécele oro, Sellos del Laberinto o una recarga y te devolverá un Caído del Laberinto para tu colección.</p>
    <div class="ygdrasil-stage" id="ygdrasil-stage">
      <div class="ygdrasil-glow"></div>
      <div class="ygdrasil-tree">🌳</div>
    </div>
    <p class="ofrenda-collection-line" style="color:var(--bronze-light); font-size:0.85em; text-align:center; margin:6px 0;">Colección: ${ownedCount} / ${PET_CATALOG.length} Caídos del Laberinto reunidos · ${equippedPetIds().length}/${maxPetSlots()} equipadas</p>
    ${state.char.pets.pendingFreePulls>0 ? `
    <div class="ofrenda-pending-box">
      <div>🎁 Tienes <b>${state.char.pets.pendingFreePulls}</b> ofrenda(s) gratis pendientes (check-in diario y/o regalos del equipo).</div>
      <button class="btn-main" id="btn-claim-pending">Reclamar todas</button>
    </div>` : ''}
    <div class="section-label" style="margin-top:4px;">Pagar con oro (⛁ ${state.char.gold.toLocaleString('es')})</div>
    <div class="ofrenda-btn-row">
      <button class="btn-main" id="btn-pull-x1-gold" ${state.char.gold<GACHA_COST_X1?'disabled':''}>Ofrenda x1 — ${GACHA_COST_X1.toLocaleString('es')} oro</button>
      <button class="btn-main" id="btn-pull-x10-gold" ${state.char.gold<GACHA_COST_X10?'disabled':''}>Ofrenda x10 (+1 regalo) — ${GACHA_COST_X10.toLocaleString('es')} oro</button>
    </div>
    <div class="section-label">Pagar con Sellos del Laberinto (🎖️ ${(state.char.missionCurrency||0).toLocaleString('es')})</div>
    <div class="ofrenda-btn-row">
      <button class="btn-main secondary-choice" id="btn-pull-x1-sellos" ${(state.char.missionCurrency||0)<GACHA_COST_SELLOS_X1?'disabled':''}>Ofrenda x1 — ${GACHA_COST_SELLOS_X1.toLocaleString('es')} Sellos</button>
      <button class="btn-main secondary-choice" id="btn-pull-x10-sellos" ${(state.char.missionCurrency||0)<GACHA_COST_SELLOS_X10?'disabled':''}>Ofrenda x10 (+1 regalo) — ${GACHA_COST_SELLOS_X10.toLocaleString('es')} Sellos</button>
    </div>
    <button class="reset-btn" id="btn-buy-pulls" style="margin:6px auto 0; display:block;">💎 Recargar para más tiradas</button>
    <button class="reset-btn" id="btn-pet-rates" style="margin:10px auto 0; display:block;">Ver tasas de invocación</button>
    <div id="ofrenda-results"></div>
  `;
  document.getElementById('btn-close-ofrenda').onclick = ()=>{ ofrendaOpen=false; renderAll(); };
  document.getElementById('btn-pet-rates').onclick = showPetRates;
  document.getElementById('btn-buy-pulls').onclick = ()=>{
    showOverlay('Recargar tiradas', `
      <p style="margin-top:0;">¿Quieres tiradas extra sin gastar oro ni Sellos? Contacta al administrador por Discord y coordina tu compra — te acredita las ofrendas directo en tu cuenta, listas para reclamar aquí mismo.</p>
      <p style="color:var(--bronze-light);">Discord: <b>xariochix5266</b></p>
    `, ()=>{});
  };
  const allPullBtns = ()=> ['btn-pull-x1-gold','btn-pull-x10-gold','btn-pull-x1-sellos','btn-pull-x10-sellos'].map(id=>document.getElementById(id));
  const refreshBtnStates = ()=>{
    document.getElementById('btn-pull-x1-gold').disabled = state.char.gold < GACHA_COST_X1;
    document.getElementById('btn-pull-x10-gold').disabled = state.char.gold < GACHA_COST_X10;
    document.getElementById('btn-pull-x1-sellos').disabled = (state.char.missionCurrency||0) < GACHA_COST_SELLOS_X1;
    document.getElementById('btn-pull-x10-sellos').disabled = (state.char.missionCurrency||0) < GACHA_COST_SELLOS_X10;
  };
  const doPull = (kind, payWith)=>{
    const cost = payWith==='sellos' ? (kind==='x10'?GACHA_COST_SELLOS_X10:GACHA_COST_SELLOS_X1) : (kind==='x10'?GACHA_COST_X10:GACHA_COST_X1);
    const have = payWith==='sellos' ? (state.char.missionCurrency||0) : state.char.gold;
    if(have < cost) return;
    const stage = document.getElementById('ygdrasil-stage');
    stage.classList.add('shining');
    allPullBtns().forEach(b=>b.disabled = true);
    document.getElementById('ofrenda-results').innerHTML = '';
    setTimeout(()=>{
      const results = pullGacha(kind, payWith);
      stage.classList.remove('shining');
      renderOfrendaResults(results);
      renderSheet();
      refreshBtnStates();
      document.querySelector('.ofrenda-collection-line').textContent =
        `Colección: ${Object.keys(state.char.pets.owned).length} / ${PET_CATALOG.length} Caídos del Laberinto reunidos · ${equippedPetIds().length}/${maxPetSlots()} equipadas`;
    }, 900);
  };
  document.getElementById('btn-pull-x1-gold').onclick = ()=>doPull('x1','gold');
  document.getElementById('btn-pull-x10-gold').onclick = ()=>doPull('x10','gold');
  document.getElementById('btn-pull-x1-sellos').onclick = ()=>doPull('x1','sellos');
  document.getElementById('btn-pull-x10-sellos').onclick = ()=>doPull('x10','sellos');
  const claimBtn = document.getElementById('btn-claim-pending');
  if(claimBtn){
    claimBtn.onclick = ()=>{
      const count = state.char.pets.pendingFreePulls;
      if(count<=0) return;
      const stage = document.getElementById('ygdrasil-stage');
      stage.classList.add('shining');
      claimBtn.disabled = true;
      allPullBtns().forEach(b=>b.disabled = true);
      document.getElementById('ofrenda-results').innerHTML = '';
      setTimeout(()=>{
        state.char.pets.pendingFreePulls = 0;
        const results = grantFreePetPulls(count);
        stage.classList.remove('shining');
        renderOfrendaResults(results);
        refreshBtnStates();
        const pendingBox = document.querySelector('.ofrenda-pending-box');
        if(pendingBox) pendingBox.remove();
        document.querySelector('.ofrenda-collection-line').textContent =
          `Colección: ${Object.keys(state.char.pets.owned).length} / ${PET_CATALOG.length} Caídos del Laberinto reunidos · ${equippedPetIds().length}/${maxPetSlots()} equipadas`;
        save();
      }, 900);
    };
  }
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
    return `<div class="checkin-cell ${cls}">
      <div class="checkin-day">Día ${day}</div>
      <div class="checkin-reward">🎁 x${day}</div>
      ${isClaimed?'<div class="checkin-check">✓</div>':''}
    </div>`;
  }).join('');
  document.getElementById('main-panel').innerHTML = `
    <div style="display:flex; align-items:center; justify-content:space-between; gap:10px; margin-bottom:4px;">
      <h3 style="color:var(--bronze-light);">📅 Check-in diario</h3>
      <button class="reset-btn" id="btn-close-checkin">Cerrar</button>
    </div>
    <p style="color:var(--text-dim); font-size:0.85em; margin-top:0;">Entra cada día para reclamar ofrendas gratis para el árbol — el día ${'N'} te da ${'N'} tiradas gratis, acumulables si no las reclamas de inmediato. Si faltas un día no pierdes tu progreso, solo se pausa. El ciclo completo se reinicia el día 1 de cada mes.</p>
    <p style="color:var(--bronze-light); font-size:0.85em;">${available ? `¡Tienes el día <b>${previewDay}</b> disponible!` : `Ya reclamaste hoy (día ${state.char.checkin.day}/30). Vuelve mañana desde las 00:01.`}</p>
    <button class="btn-main" id="btn-claim-checkin" ${available?'':'disabled'} style="margin-bottom:12px;">${available?`Reclamar día ${previewDay} (+${previewDay} ofrendas gratis)`:'Ya reclamado hoy'}</button>
    <div class="checkin-grid">${gridHTML}</div>
    <p style="color:var(--text-dim); font-size:0.78em; margin-top:10px;">Las ofrendas gratis se acumulan en 🌳 Otorgar ofrenda — ábrela y pulsa "Reclamar todas" para revelar tus Caídos del Laberinto.</p>
  `;
  document.getElementById('btn-close-checkin').onclick = ()=>{ checkinOpen=false; renderAll(); };
  const claimBtn = document.getElementById('btn-claim-checkin');
  if(available){
    claimBtn.onclick = ()=>{
      claimCheckin();
      renderCheckin();
    };
  }
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
  const { data, error } = await supabase.rpc('claim_mission', {p_mission_id: missionId});
  if(error){ log('No se pudo reclamar la misión: '+error.message); return; }
  const m = (state.missions||[]).find(x=>x.id===missionId);
  state.char.gold = data.gold;
  state.char.xp = data.xp; // si esto ya alcanza para subir de nivel, el próximo combate lo aplica (mismo bucle de handleVictory)
  state.char.missionCurrency = data.mission_currency;
  if(m){
    m.status = 'claimed';
    if(m.reward_item) addToInventory(m.reward_item);
  }
  log('Reclamas la recompensa de una misión del Gremio.');
  renderAll();
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
    return `<div class="inv-item-row">
      <div>
        <b style="color:${c};">Misión ${m.rank}</b> <span class="slot-tag">${MISSION_OBJECTIVE_LABEL[m.objective_type]}</span>
        <div class="inv-item-bonus neutral">${m.progress}/${m.objective_target} · ${m.reward_gold} oro, ${m.reward_xp} xp, ${m.reward_currency} Sellos${itemText}</div>
        <div class="bar-track" style="margin-top:6px;"><div class="bar-fill xp" style="width:${pct}%"></div></div>
      </div>
      <div style="display:flex; flex-direction:column; gap:6px; flex-shrink:0;">
        <button class="inv-btn" data-claim="${m.id}" ${canClaim?'':'disabled'}>${claimed?'Reclamada':'Reclamar'}</button>
        ${m.status==='active' ? `<button class="inv-btn" data-reroll="${m.id}" ${canReroll?'':'disabled'}>Refrescar</button>` : ''}
      </div>
    </div>`;
  }).join('') : (state.missionsError
    ? `<p class="inv-empty-msg">No se pudo cargar el tablón: ${state.missionsError}</p><button class="inv-btn" id="btn-retry-missions">Reintentar</button>`
    : `<p class="inv-empty-msg">Cargando el tablón de misiones…</p>`);

  document.getElementById('main-panel').innerHTML = `
    <div style="display:flex; align-items:center; justify-content:space-between; gap:10px; margin-bottom:4px;">
      <h3 style="color:var(--bronze-light);">Gremio — Tablón de misiones</h3>
      <button class="reset-btn" id="btn-close-missions">Cerrar</button>
    </div>
    <p style="color:var(--text-dim); font-size:0.85em; margin-top:0;">Sellos del Laberinto: <b style="color:var(--bronze-light);">${state.char.missionCurrency||0}</b>. El tablón entero se refresca cada 12 horas. Refrescos individuales disponibles: <b>${rerollsLeft}/3</b>.</p>
    ${rowsHTML}
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
  if((state.char.bannedAllyTemplates||[]).includes(templateId)){ log(`${tpl.name} ya no quiere saber nada de ti — no puedes volver a reclutarlo.`); return; }
  const cost = allyHireCost(tpl, state.char.level);
  const { data, error } = await supabase.rpc('hire_ally', {
    p_character_id: state.char.id, p_template_id: tpl.templateId, p_role: tpl.role, p_name: tpl.name, p_cost: cost
  });
  if(error){ log('No se pudo reclutar: '+error.message); renderTaberna(); return; }
  state.char.gold -= cost;
  state.char.allies = [...(state.char.allies||[]), data];
  log(`Reclutas a <b>${tpl.name}</b> por ${cost} de oro.`);
  renderAll();
}
async function dismissAlly(allyId){
  const row = (state.char.allies||[]).find(a=>a.id===allyId);
  const { error } = await supabase.rpc('dismiss_ally', {p_ally_id: allyId});
  if(error){ log('No se pudo despedir al aliado: '+error.message); return; }
  state.char.allies = (state.char.allies||[]).filter(a=>a.id!==allyId);
  if(row){
    if(!state.char.bannedAllyTemplates) state.char.bannedAllyTemplates = [];
    if(!state.char.bannedAllyTemplates.includes(row.template_id)) state.char.bannedAllyTemplates.push(row.template_id);
  }
  log('Despides a un aliado. No podrás volver a reclutarlo con este personaje.');
  renderAll();
}

// Mantenimiento recurrente: cada aliado cobra un salario cada vez que sales
// del laberinto (retirada voluntaria tras un guardián, o expulsión por
// derrota) - no se cobra por entrar ni mientras estás dentro. La satisfacción
// solo se mueve por esto: sube (poco) si le pagas, baja (bastante, y cada vez
// más) si no te alcanza el oro. Si cae a 15% o menos, el aliado deserta:
// se va para siempre y nunca vuelve a estar disponible para este personaje
// (mismo destino que despedirlo a propósito - ver dismiss_ally en el
// servidor, que ahora también lo marca en characters.banned_ally_templates).
const ALLY_SATISFACTION_DEFAULT = 50;
const ALLY_WAGE_SATISFACTION_GAIN = 2;
const ALLY_WAGE_SATISFACTION_LOSS_BASE = 7;
const ALLY_WAGE_SATISFACTION_LOSS_MAX = 10;
const ALLY_DESERTION_THRESHOLD = 15;
function allyWage(row){
  const tpl = ALLY_ROSTER.find(t=>t.templateId===row.template_id);
  if(!tpl) return 0;
  return Math.round(tpl.baseCost*0.08 + (row.level||1)*3);
}
function desertAlly(row, reason){
  state.char.allies = (state.char.allies||[]).filter(a=>a.id!==row.id);
  if(!state.char.bannedAllyTemplates) state.char.bannedAllyTemplates = [];
  if(!state.char.bannedAllyTemplates.includes(row.template_id)) state.char.bannedAllyTemplates.push(row.template_id);
  log(`<b>${row.name}</b> ${reason} y abandona tu grupo. No volverá a unirse a ti.`);
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

function renderTaberna(){
  const panel = document.getElementById('main-panel');
  if(state.char.level < ALLY_MIN_LEVEL){
    panel.innerHTML = `
      <div style="display:flex; align-items:center; justify-content:space-between; gap:10px; margin-bottom:4px;">
        <h3 style="color:var(--bronze-light);">Taberna</h3>
        <button class="reset-btn" id="btn-close-taberna">Cerrar</button>
      </div>
      <p class="inv-empty-msg">La Taberna abre sus puertas a partir del nivel ${ALLY_MIN_LEVEL}. Vuelve cuando tu personaje sea más experimentado.</p>
    `;
    document.getElementById('btn-close-taberna').onclick = ()=>{ tabernaOpen=false; renderAll(); };
    return;
  }

  const allies = state.char.allies || [];
  const hiredHTML = allies.length ? allies.map(a=>{
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
    return `<div class="inv-item-row">
      <div>
        <b>${tpl.icon||'⚔️'} ${a.name}</b> <span class="slot-tag">${a.role} · nivel ${a.level}</span> <span class="slot-tag" style="border-color:${satColor}; color:${satColor};">Satisfacción ${satisfaction}%</span>
        <div class="inv-item-bonus neutral">${tpl.bio||''}</div>
        ${tpl.skillName ? `<div class="inv-item-bonus" style="margin-top:2px;"><b>${tpl.skillName}</b> — ${tpl.skillDesc}</div>` : ''}
        <div class="bar-track" style="margin-top:6px;"><div class="bar-fill xp" style="width:${xpPct}%"></div></div>
        <div style="font-size:0.7em; color:var(--text-dim); margin-top:2px;">${xpText}</div>
        <div style="font-size:0.7em; color:var(--text-dim); margin-top:2px;">Paga ${allyWage(a)} de oro cada vez que sales del laberinto. Si no te alcanza el oro, su satisfacción baja.</div>
        ${autoGearPromptHTML}
      </div>
      <button class="inv-btn danger" data-dismiss="${a.id}">Despedir</button>
    </div>`;
  }).join('') : `<p class="inv-empty-msg">Todavía no has reclutado a nadie.</p>`;

  const bannedTemplates = state.char.bannedAllyTemplates || [];
  const rosterHTML = ALLY_ROSTER.map(tpl=>{
    const already = allies.some(a=>a.template_id===tpl.templateId);
    const banned = bannedTemplates.includes(tpl.templateId);
    const cost = allyHireCost(tpl, state.char.level);
    const full = allies.length >= MAX_ALLIES;
    const disabled = already || banned || full || state.char.gold < cost;
    let btnLabel = `Reclutar (${cost} oro)`;
    if(banned) btnLabel = 'Ya no confía en ti';
    else if(already) btnLabel = 'Ya reclutado';
    return `<div class="inv-item-row">
      <div>
        <b>${tpl.icon} ${tpl.name}</b> <span class="slot-tag">${tpl.role}</span>
        <div class="inv-item-bonus neutral">${tpl.bio}</div>
        <div class="inv-item-bonus" style="margin-top:2px;"><b>${tpl.skillName}</b> — ${tpl.skillDesc}</div>
        ${banned ? `<div class="inv-item-bonus" style="color:var(--blood-light); margin-top:2px;">Lo despediste o te traicionó antes — no volverá a unirse a este personaje.</div>` : ''}
      </div>
      <button class="inv-btn" data-hire="${tpl.templateId}" ${disabled?'disabled':''}>${btnLabel}</button>
    </div>`;
  }).join('');

  panel.innerHTML = `
    <div style="display:flex; align-items:center; justify-content:space-between; gap:10px; margin-bottom:4px;">
      <h3 style="color:var(--bronze-light);">Taberna</h3>
      <button class="reset-btn" id="btn-close-taberna">Cerrar</button>
    </div>
    <p style="color:var(--text-dim); font-size:0.85em; margin-top:0;">Hasta ${MAX_ALLIES} aliados a la vez, ${MAX_ALLIES+1} contándote a ti. Pelean junto a ti automáticamente — el que tiene "frontline" ocupa tu lugar en el frente y absorbe los golpes. Cada uno cobra un salario cada vez que sales del laberinto: si no te alcanza el oro para pagarle varias veces seguidas, pierde la confianza en ti y se va para siempre. Un aliado despedido o que deserta no vuelve a estar disponible.</p>

    <div class="section-label">Tu equipo (${allies.length}/${MAX_ALLIES})</div>
    ${hiredHTML}

    <div class="section-label">Disponibles para reclutar</div>
    ${rosterHTML}
  `;
  document.getElementById('btn-close-taberna').onclick = ()=>{ tabernaOpen=false; renderAll(); };
  document.querySelectorAll('[data-hire]').forEach(btn=>{
    btn.onclick = ()=> hireAlly(btn.dataset.hire);
  });
  document.querySelectorAll('[data-dismiss]').forEach(btn=>{
    btn.onclick = ()=> dismissAlly(btn.dataset.dismiss);
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
async function renderRanking(){
  const panel = document.getElementById('main-panel');
  panel.innerHTML = `
    <div style="display:flex; align-items:center; justify-content:space-between; gap:10px; margin-bottom:4px;">
      <h3 style="color:var(--bronze-light);">Ranking</h3>
      <button class="reset-btn" id="btn-close-ranking">Cerrar</button>
    </div>
    <div class="section-label" style="margin-top:6px;">Tu récord personal</div>
    <p style="color:var(--text-dim); font-size:0.9em;">${describeRecord()}</p>
    <div class="section-label">Top 10 global</div>
    <div id="ranking-list"><p class="inv-empty-msg">Cargando ranking…</p></div>
  `;
  document.getElementById('btn-close-ranking').onclick = ()=>{ rankingOpen=false; renderAll(); };

  const { data, error } = await supabase.from('leaderboard_top10').select('*');
  const list = document.getElementById('ranking-list');
  if(!list) return; // el jugador salió de la pantalla antes de que llegara la respuesta
  if(error){
    list.innerHTML = `<p class="inv-empty-msg">No se pudo cargar el ranking global.</p>`;
    return;
  }
  if(!data || !data.length){
    list.innerHTML = `<p class="inv-empty-msg">Nadie ha registrado un récord todavía. ¡Sé el primero!</p>`;
    return;
  }
  list.innerHTML = data.map((row,i)=>{
    const mine = row.nickname.toLowerCase() === state.char.nickname.toLowerCase();
    return `<div class="equip-row" style="${mine?'color:var(--bronze-light);':''}">
      <span>#${i+1} ${row.nickname}${mine ? ' (tú)' : ''}</span>
      <b>Nivel ${row.record_level} · Piso ${row.record_floor_idx}</b>
    </div>`;
  }).join('');
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
    <div id="flagged-kills-list"><p class="inv-empty-msg">Cargando alertas…</p></div>

    <div class="section-label">Cuentas</div>
    <div id="admin-list"><p class="inv-empty-msg">Cargando cuentas…</p></div>
  `;
  document.getElementById('btn-close-admin').onclick = ()=>{ adminOpen=false; renderAll(); };
  await Promise.all([loadAdminList(), loadFlaggedKills()]);
}

async function loadFlaggedKills(){
  const el = document.getElementById('flagged-kills-list');
  if(!el) return;
  const { data, error } = await supabase.from('flagged_boss_kills').select('*').order('created_at', {ascending:false}).limit(50);
  if(error){ el.innerHTML = `<p class="inv-empty-msg">No se pudo cargar (¿corriste la migración 0017?): ${error.message}</p>`; return; }
  if(!data || !data.length){ el.innerHTML = `<p class="inv-empty-msg">Sin alertas por ahora.</p>`; return; }
  el.innerHTML = data.map(f=>{
    const when = new Date(f.created_at).toLocaleString();
    const kindLabel = f.kind==='jefe_decada' ? 'Jefe de década' : 'Guardián de piso';
    return `<div class="inv-item-row">
      <div>
        <b>${f.nickname}</b> <span class="slot-tag" style="border-color:var(--blood-light); color:var(--blood-light);">${kindLabel}</span>
        <div class="inv-item-bonus neutral">Nivel ${f.dungeon_level} derrotado en ${f.turns} turno(s) · ${when}</div>
      </div>
      <button class="inv-btn danger" data-flag-ban="${f.user_id}">Suspender cuenta</button>
    </div>`;
  }).join('');
  const msg = document.getElementById('admin-msg');
  el.querySelectorAll('[data-flag-ban]').forEach(btn=>{
    btn.onclick = async ()=>{
      btn.disabled = true;
      const { error: banError } = await supabase.from('profiles').update({ is_banned: true }).eq('id', btn.dataset.flagBan);
      if(msg) msg.textContent = banError ? 'No se pudo suspender: ' + banError.message : '';
      await Promise.all([loadAdminList(), loadFlaggedKills()]);
    };
  });
}

async function loadAdminList(){
  const list = document.getElementById('admin-list');
  const msg = document.getElementById('admin-msg');
  const [profilesRes, charsRes] = await Promise.all([
    supabase.from('profiles').select('id, username, is_banned, created_at').order('created_at', { ascending: false }).limit(100),
    supabase.from('characters').select('id, user_id, nickname, role, hidden_from_leaderboard, level, record_level, record_floor_idx, pets').order('slot_number')
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

  list.innerHTML = data.map(p=>{
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
          <button class="inv-btn" data-grant-pulls="${c.id}" title="Ofrendas gratis pendientes: ${(c.pets&&c.pets.pendingFreePulls)||0}">🎁 Dar tiradas</button>
          <button class="inv-btn danger" data-delete-char="${c.id}">Eliminar personaje</button>
        </div>
      </div>`;
    }).join('') : `<p class="inv-empty-msg" style="margin-left:18px;">Sin personajes.</p>`;
    return `<div class="inv-slot">
      <div class="inv-item-row" style="background:none; border:none; padding:0; margin-bottom:8px;">
        <div>
          <b>${p.username}</b> <span class="slot-tag" style="${p.is_banned?'color:var(--blood-light); border-color:rgba(178,68,68,0.4);':'color:var(--good);'}">${bannedLabel}</span>
          <div class="inv-item-bonus neutral">Creada: ${created} · ${myChars.length} personaje(s)</div>
        </div>
        <button class="inv-btn ${p.is_banned?'':'danger'}" data-toggle-ban="${p.id}" ${isSelf?'disabled title="No puedes suspender tu propia cuenta"':''}>${p.is_banned?'Reactivar':'Suspender'}</button>
      </div>
      ${charsHTML}
    </div>`;
  }).join('') || `<p class="inv-empty-msg">No hay cuentas registradas.</p>`;

  list.querySelectorAll('[data-toggle-ban]').forEach(btn=>{
    btn.onclick = async ()=>{
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
      const typed = prompt(`¿Cuántas ofrendas gratis le das a "${target.nickname}"? (Pendientes actuales: ${(target.pets&&target.pets.pendingFreePulls)||0})`, '1');
      if(typed === null) return;
      const n = parseInt(typed, 10);
      if(!Number.isFinite(n) || n<=0){ msg.textContent = 'Ingresa un número mayor a 0.'; return; }
      btn.disabled = true;
      const currentPets = target.pets || {owned:{}, equipped:[], pendingFreePulls:0};
      const updatedPets = Object.assign({}, currentPets, {pendingFreePulls: (currentPets.pendingFreePulls||0) + n});
      const { error } = await supabase.from('characters').update({ pets: updatedPets }).eq('id', id);
      if(error) msg.textContent = 'No se pudo otorgar: ' + error.message;
      else msg.textContent = `Le diste ${n} ofrenda(s) gratis a ${target.nickname}.`;
      await loadAdminList();
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
const SHOP_ROLE_LABELS = {pesada:'Guerrero', doblefilo:'Asesino', tirador:'Arquero', mago:'Mago', sacerdote:'Sacerdote'};
let shopWeaponRole = null; // null = usa tu propia senda por defecto
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
      ${itemRowWithArt(preview, `${itemNameHTML(preview)}<div class="inv-item-bonus">${itemBonusText(preview)}</div>`)}
      <button class="inv-btn" data-${dataAttr}="${slot}|${name}" ${state.char.gold<price?'disabled':''}>Comprar (${price} oro)</button>
    </div>`;
  }).join('');
}

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

  const weaponHTML = roleSelectorHTML
    + weaponShopRows('arma', 'comun', '', 'buy-weapon', armaPrice)
    + weaponShopRows('arma2', 'comun', '', 'buy-weapon', arma2Price);

  const raroTag = `<span class="slot-tag" style="border-color:${RARITIES.raro.color}; color:${RARITIES.raro.color};">Raro</span>`;
  const weaponRaroHTML = weaponShopRows('arma', 'raro', raroTag, 'buy-weapon-raro', shopWeaponPriceRaro(false))
    + weaponShopRows('arma2', 'raro', raroTag, 'buy-weapon-raro', shopWeaponPriceRaro(true));

  const gearShopRow = (slot, rank, rankTag, dataAttr, price)=>{
    const preview = makeGearItem(slot, styleId, rank);
    if(!preview) return '';
    return `<div class="inv-item-row" style="${rarityRowStyle(preview)}">
      ${itemRowWithArt(preview, `${itemNameHTML(preview)}<div class="inv-item-bonus">${itemBonusText(preview)}</div>`)}
      <button class="inv-btn" data-${dataAttr}="${slot}" ${state.char.gold<price?'disabled':''}>Comprar (${price} oro)</button>
    </div>`;
  };
  const gearHTML = SHOP_GEAR_SLOTS.map(slot=> gearShopRow(slot, 'comun', '', 'buy-gear', shopGearPrice(slot))).join('');

  const pocoComunTag = ` <span class="slot-tag" style="border-color:${RARITIES.poco_comun.color}; color:${RARITIES.poco_comun.color};">Poco común</span>`;
  const pocoComunHTML = SHOP_GEAR_SLOTS.map(slot=> gearShopRow(slot, 'poco_comun', pocoComunTag, 'buy-gear-poco', shopGearPricePocoComun(slot))).join('');

  const raroTagGear = ` <span class="slot-tag" style="border-color:${RARITIES.raro.color}; color:${RARITIES.raro.color};">Raro</span>`;
  const raroHTML = SHOP_GEAR_SLOTS.map(slot=> gearShopRow(slot, 'raro', raroTagGear, 'buy-gear-raro', shopGearPriceRaro(slot))).join('');

  const selloHTML = SELLO_SHOP_SLOTS.map(slot=>{
    return ['rango_b','rango_a'].map(rarity=>{
      const price = selloShopPrice(rarity);
      const disabled = (state.char.missionCurrency||0) < price;
      if(slot==='arma'){
        const cat = WEAPON_CATALOG[shopWeaponRole];
        if(!cat) return '';
        return Object.keys(cat.arma).map(name=>{
          const preview = makeWeaponItem('arma', shopWeaponRole, rarity, name);
          if(!preview) return '';
          return `<div class="inv-item-row" style="${rarityRowStyle(preview)}">
            ${itemRowWithArt(preview, `${itemNameHTML(preview)}<div class="inv-item-bonus">${itemBonusText(preview)}</div>`)}
            <button class="inv-btn" data-buy-sello="arma|${rarity}|${name}" ${disabled?'disabled':''}>Comprar (${price} Sellos)</button>
          </div>`;
        }).join('');
      }
      const preview = makeGearItem(slot, shopWeaponRole, rarity);
      if(!preview) return '';
      return `<div class="inv-item-row" style="${rarityRowStyle(preview)}">
        ${itemRowWithArt(preview, `${itemNameHTML(preview)}<div class="inv-item-bonus">${itemBonusText(preview)}</div>`)}
        <button class="inv-btn" data-buy-sello="${slot}|${rarity}" ${disabled?'disabled':''}>Comprar (${price} Sellos)</button>
      </div>`;
    }).join('');
  }).join('');

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
        ${itemRowWithArt(preview, `${itemNameHTML(preview)}<div class="inv-item-bonus">${itemBonusText(preview)}</div>`)}
        <button class="inv-btn" data-buy-tiers-weapon="${slot}|${name}" ${disabled?'disabled':''}>Forjar</button>
      </div>`;
    }).join('');
  }).join('') || '<p class="inv-empty-msg">No hay armas Tier S para tu senda de combate.</p>';
  const tierSStoneHTML = Object.keys(SOUL_FAMILIES).map(famId=>{
    const tpl = Object.values(SOUL_STONES).find(s=>s.family===famId && s.tier==='S');
    if(!tpl) return '';
    const disabled = !hasTierSMaterials();
    return `<div class="inv-item-row">
      ${itemRowWithArt(tpl, `<b style="color:${SOUL_TIER_COLORS.S};">${tpl.name}</b> <span class="slot-tag" style="border-color:${SOUL_TIER_COLORS.S}; color:${SOUL_TIER_COLORS.S};">S</span><div class="inv-item-bonus">${tpl.desc}</div>`)}
      <button class="inv-btn" data-buy-tiers-stone="${famId}" ${disabled?'disabled':''}>Forjar</button>
    </div>`;
  }).join('');
  const tierSHTML = tierSUnlocked()
    ? tierSCostHTML + `<div class="section-label" style="margin-top:6px; font-size:0.85em;">Armas</div>` + tierSWeaponHTML + `<div class="section-label" style="margin-top:6px; font-size:0.85em;">Piedras del alma</div>` + tierSStoneHTML
    : `<p class="inv-empty-msg">La Forja Legendaria abre al llegar al piso ${TIER_S_MIN_FLOOR} del laberinto (hoy: piso ${state.char.maxLevelUnlocked||1}).</p>`;

  const potionHTML = Object.values(POTION_TEMPLATES).filter(t=>SHOP_POTION_PRICES[t.id]).map(t=>{
    const price = SHOP_POTION_PRICES[t.id];
    return `<div class="inv-item-row">
      ${potionRowWithArt(t.id, `<b>${t.name}</b><div class="inv-item-bonus neutral">${t.desc}</div>`)}
      <button class="inv-btn" data-buy-potion="${t.id}" ${state.char.gold<price?'disabled':''}>Comprar (${price} oro)</button>
    </div>`;
  }).join('');

  const sellGear = state.char.inventory.filter(i=>i.kind==='equip');
  const sellPotions = state.char.inventory.filter(i=>i.kind==='potion');
  const sellStones = state.char.inventory.filter(i=>i.kind==='soulstone');
  const sellRows = [
    ...sellGear.map(it=>`<div class="inv-item-row" style="${rarityRowStyle(it)}">
      ${itemRowWithArt(it, `${itemNameHTML(it)} <span class="slot-tag">${slotLabel(it.slot)}</span><div class="inv-item-bonus">${itemBonusText(it)}</div>`)}
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

  document.getElementById('main-panel').innerHTML = `
    <div style="display:flex; align-items:center; justify-content:space-between; gap:10px; margin-bottom:4px;">
      <h3 style="color:var(--bronze-light);">Tienda</h3>
      <button class="reset-btn" id="btn-close-shop">Cerrar</button>
    </div>
    <p style="color:var(--text-dim); font-size:0.85em; margin-top:0;">Oro disponible: <b>${state.char.gold}</b>. Elige el rol para el que compras — cada arma solo la puede usar tu personaje o un aliado de ese mismo rol. Cada nombre de arma tiene su propio bono y su propio efecto especial a partir de Poco Común.</p>

    <div class="section-label">Armas de tu senda</div>
    ${weaponHTML || '<p class="inv-empty-msg">No hay armas disponibles para tu senda de combate.</p>'}

    <div class="section-label">Equipo común</div>
    ${gearHTML}

    <div class="section-label">Equipo poco común</div>
    ${pocoComunHTML}

    <div class="section-label">Armas de tu senda — Raro</div>
    ${weaponRaroHTML || '<p class="inv-empty-msg">No hay armas disponibles para tu senda de combate.</p>'}

    <div class="section-label">Equipo raro</div>
    ${raroHTML}

    <div class="section-label">Tienda del Gremio (Sellos del Laberinto: ${state.char.missionCurrency||0})</div>
    ${selloHTML}

    <div class="section-label">Forja Legendaria — Tier S (piso 40+)</div>
    ${tierSHTML}

    <div class="section-label">Pociones</div>
    ${potionHTML}

    <div class="section-label">Vender objetos (50% de su valor)</div>
    ${sellRows || '<p class="inv-empty-msg">No tienes nada que vender por ahora.</p>'}
  `;

  document.getElementById('btn-close-shop').onclick = ()=>{ shopOpen=false; renderAll(); };
  document.querySelectorAll('[data-buy-weapon]').forEach(btn=>{
    btn.onclick = ()=>{
      const [slot, name] = btn.dataset.buyWeapon.split('|');
      buyWeapon(slot, shopWeaponRole, name);
    };
  });
  const shopRoleSelect = document.getElementById('shop-role-select');
  if(shopRoleSelect) shopRoleSelect.onchange = ()=>{ shopWeaponRole = shopRoleSelect.value; renderShop(); };
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
    btn.onclick = ()=> buyPotion(btn.dataset.buyPotion);
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
function renderHome(){
  const stash = state.char.stash || (state.char.stash = {gold:0, items:[]});
  const gearItems = state.char.inventory.filter(i=>i.kind==='equip');
  const potionItems = state.char.inventory.filter(i=>i.kind==='potion');
  const stashGear = stash.items.filter(i=>i.kind==='equip');
  const stashPotions = stash.items.filter(i=>i.kind==='potion');

  const bagGearHTML = gearItems.length ? gearItems.map(it=>`
    <div class="inv-item-row" style="${rarityRowStyle(it)}">
      ${itemRowWithArt(it, `${itemNameHTML(it)} <span class="slot-tag">${slotLabel(it.slot)}</span><div class="inv-item-bonus">${itemBonusText(it)}</div>`)}
      <button class="inv-btn" data-stash-gear="${it.uid}">Guardar en Hogar</button>
    </div>`).join('') : `<p class="inv-empty-msg">No llevas equipo suelto contigo.</p>`;

  const bagPotionHTML = potionItems.length ? potionItems.map(it=>{
    const tpl = POTION_TEMPLATES[it.potionId];
    return `<div class="inv-item-row">
      ${potionRowWithArt(it.potionId, `<b>${tpl.name}</b> <span class="slot-tag">x${it.qty}</span>`)}
      <button class="inv-btn" data-stash-potion="${it.potionId}">Guardar 1</button>
    </div>`;
  }).join('') : `<p class="inv-empty-msg">No llevas pociones contigo.</p>`;

  const stashGearHTML = stashGear.length ? stashGear.map(it=>`
    <div class="inv-item-row" style="${rarityRowStyle(it)}">
      ${itemRowWithArt(it, `${itemNameHTML(it)} <span class="slot-tag">${slotLabel(it.slot)}</span><div class="inv-item-bonus">${itemBonusText(it)}</div>`)}
      <button class="inv-btn" data-retrieve-gear="${it.uid}">Retirar</button>
    </div>`).join('') : `<p class="inv-empty-msg">El Hogar no guarda equipo todavía.</p>`;

  const stashPotionHTML = stashPotions.length ? stashPotions.map(it=>{
    const tpl = POTION_TEMPLATES[it.potionId];
    return `<div class="inv-item-row">
      ${potionRowWithArt(it.potionId, `<b>${tpl.name}</b> <span class="slot-tag">x${it.qty}</span>`)}
      <button class="inv-btn" data-retrieve-potion="${it.potionId}">Retirar 1</button>
    </div>`;
  }).join('') : `<p class="inv-empty-msg">El Hogar no guarda pociones todavía.</p>`;

  document.getElementById('main-panel').innerHTML = `
    <div style="display:flex; align-items:center; justify-content:space-between; gap:10px; margin-bottom:4px;">
      <h3 style="color:var(--bronze-light);">Hogar</h3>
      <button class="reset-btn" id="btn-close-home">Cerrar</button>
    </div>
    <p style="color:var(--text-dim); font-size:0.85em; margin-top:0;">Guarda equipo, pociones y oro a salvo. Nada de lo guardado aquí se pierde si mueres en el laberinto. Guardar habilidades llegará en una futura actualización.</p>

    <div class="section-label" style="margin-top:6px;">Oro</div>
    <div class="equip-row"><span>Contigo</span><b>${state.char.gold}</b></div>
    <div class="equip-row"><span>En el Hogar</span><b>${stash.gold}</b></div>
    <div style="display:flex; gap:8px; margin-top:8px; flex-wrap:wrap;">
      <button class="inv-btn" id="btn-stash-gold-all" ${state.char.gold<=0?'disabled':''}>Guardar todo mi oro</button>
      <button class="inv-btn" id="btn-retrieve-gold-all" ${stash.gold<=0?'disabled':''}>Retirar todo el oro del Hogar</button>
    </div>

    <div class="section-label">Tu mochila</div>
    ${bagGearHTML}
    ${bagPotionHTML}

    <div class="section-label">Guardado en el Hogar</div>
    ${stashGearHTML}
    ${stashPotionHTML}
  `;

  document.getElementById('btn-close-home').onclick = ()=>{ homeOpen=false; renderAll(); };
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
  document.querySelectorAll('[data-stash-gear]').forEach(btn=>{
    btn.onclick = ()=>{
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
  let html = `<h3 style="color:var(--bronze-light); margin-bottom:6px;">El laberinto — Nivel ${dg.level}</h3>
  <p style="color:var(--text-dim); font-size:0.85em; margin-top:0;">Avanza piso a piso hasta el guardián. Elige tu ruta con cuidado. Amenaza: ⚠ ${th} · ${dg.floors.length} pisos.</p>
  <div class="map-wrap"><div class="map-track">`;

  dg.floors.forEach((nodes, fi)=>{
    html += `<div class="floor-col">`;
    if(fi===0) html += `<div class="floor-idx">Entrada</div>`;
    else if(fi===dg.floors.length-1) html += `<div class="floor-idx">Guardián</div>`;
    else html += `<div class="floor-idx">Piso ${fi}</div>`;

    nodes.forEach((node, ni)=>{
      const key = fi+'-'+ni;
      const isCurrent = (fi===dg.atFloor && ni===dg.atNode);
      const isVisited = !!dg.visited[key] && !isCurrent;
      const isReachable = isNodeReachable(dg, fi, ni);
      let cls = 'node';
      if(isCurrent) cls += ' current';
      else if(isVisited) cls += ' visited';
      else if(isReachable) cls += ' reachable';
      else cls += ' locked';
      html += `<div class="${cls}" data-f="${fi}" data-n="${ni}" title="${nodeLabel(node.type)}">${nodeIcon(node.type)}${fi>0?`<div class="connector"></div>`:''}</div>`;
    });
    html += `</div>`;
  });

  html += `</div></div>
  <div class="map-legend">
    <span>🚪 Entrada</span><span>⚔️ Combate</span><span>💰 Tesoro</span><span>🔥 Descanso</span><span>☠️ Élite</span><span>🛡️ Jefe</span>
  </div>`;

  // El mapa se reconstruye entero en cada avance (elegir una senda,
  // recuperación automática de combate interrumpido, etc.) — sin esto,
  // reemplazar el innerHTML de #main-panel reseteaba el scroll horizontal
  // de .map-wrap a 0 cada vez, obligando a desplazarse de nuevo desde el
  // principio a cada rato a medida que las sendas avanzan hacia la derecha.
  const prevWrap = document.querySelector('.map-wrap');
  const prevScrollLeft = prevWrap ? prevWrap.scrollLeft : null;

  document.getElementById('main-panel').innerHTML = html;

  const wrap = document.querySelector('.map-wrap');
  if(wrap){
    if(prevScrollLeft !== null) wrap.scrollLeft = prevScrollLeft;
    const currentNode = wrap.querySelector('.node.current');
    if(currentNode) currentNode.scrollIntoView({inline:'nearest', block:'nearest'});
  }

  document.querySelectorAll('.node.reachable').forEach(el=>{
    el.onclick = ()=>{
      const f = parseInt(el.dataset.f), n = parseInt(el.dataset.n);
      enterNode(f,n);
    };
  });
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
    const bestiary = DECADE_BESTIARY[decadeIndexForLevel(dg.level)];
    const isDecadeFinal = dg.level % 10 === 0;
    const paraiso = isParaisoDecade(dg.level);
    // Isla Paraíso (década 4, pisos 41-49) no tiene plantillas de guardián
    // propias — pero el piso igual necesita un cierre que se sienta como
    // tal (pedido explícito, 2026-09-18): en vez de un combate reforzado
    // cualquiera, el "jefe" de estos niveles siempre es un grupo fijo de 5
    // mobs regulares + 1 élite, para que la dificultad sea clara y pareja.
    const paraisoGuardianFloor = node.type==='jefe' && paraiso && !isDecadeFinal;
    let templates, count;
    if(node.type==='jefe'){
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
    } else if(node.type==='elite'){
      templates = bestiary.elite;
      // 2026-09-16, pedido explícito ("me olvidé de pedirlo, jaja"): más
      // élites juntos a medida que avanzan las décadas — igual criterio que
      // ya se usa para los mobs regulares. Década 1-2 (Bosque Goblin/Arañas,
      // decadeIndex 0-1) = 1, década 3-4 (Bestias-Riakis/Usurpador,
      // decadeIndex 2-3) = 2, década 5-6 (Isla Paraíso/El Mar, decadeIndex
      // 4-5) = 3. Se repite la misma plantilla de élite (cada década solo
      // tiene una definida en el bestiario), igual que ya hace pick() con
      // los regulares.
      const decIdx = decadeIndexForLevel(dg.level);
      count = decIdx<=1 ? 1 : decIdx<=3 ? 2 : 3;
    } else {
      templates = bestiary.regular;
      // 2026-09-16, pedido explícito: el laberinto se sentía muy fácil salvo
      // por élites/guardianes — los combates normales ahora traen más
      // enemigos a la vez a medida que se avanza (nunca más que el tope de
      // 6 que ya usa invocar()).
      count = dg.level>=40 ? rnd(5,6) : dg.level>=20 ? rnd(3,4) : rnd(1,2);
    }
    const group = [];
    if(paraisoGuardianFloor){
      for(let i=0;i<5;i++) group.push(makeEnemy(pick(bestiary.regular), f, dg.level));
      group.push(makeEnemy(bestiary.elite[0], f, dg.level));
    } else {
      for(let i=0;i<count;i++) group.push(makeEnemy(pick(templates), f, dg.level));
    }
    if(node.type==='jefe' && isDecadeFinal && paraiso){
      // el jefe de Isla Paraíso llega escoltado por dos élites en el frente
      // mientras él se queda atrás.
      group.push(makeEnemy(bestiary.elite[0], f, dg.level));
      group.push(makeEnemy(bestiary.elite[0], f, dg.level));
    }
    // Acompañante de élite (2026-09-25, "Década 2 - Arañas" en adelante): si
    // la década define un pool de acompañantes, cada élite spawneada trae 1
    // acompañante propio (sorteado por peso), enlazados por companionRef en
    // ambas direcciones para la pasiva "mientras viva el acompañante"
    // (Reina del Nido) y "fortalece a su acompañante" (Orden de la Colmena).
    // Respeta el tope de 6 combatientes por bando enemigo (mismo tope que
    // usa 'invocar').
    if(node.type==='elite' && bestiary.eliteCompanions){
      group.slice().forEach(elite=>{
        if(!elite.tpl.elite || group.length>=6) return;
        const companionTpl = pickWeighted(bestiary.eliteCompanions);
        const companion = makeEnemy(companionTpl, f, dg.level);
        group.push(companion);
        elite.companionRef = companion;
        companion.companionRef = elite;
      });
    }
    // los de línea frontal (tanques/melee) van al slot 0, el que reciben los
    // ataques 'front'; a distancia/soporte se acomodan detrás.
    group.sort((a,b)=> (b.tpl.frontline?1:0) - (a.tpl.frontline?1:0));
    startCombat(group, node);
  } else if(node.type==='tesoro'){
    const gold = rnd(8,18) + f*3;
    state.char.gold += gold;
    let msg = `Encuentras un cofre. +${gold} de oro.`;
    if(chance(0.6)){
      const item = generateLoot(f, state.char.maxLevelUnlocked||1);
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
    const stoneDrop = rollStoneDropForLevel(state.char.maxLevelUnlocked||1, null);
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
// de pisar el piso 20 de verdad. Todos los call-sites de rollGearDropForLevel/
// rollStoneDropForLevel/rollGuaranteedStoneDropForLevel/generateLoot ahora
// pasan state.char.maxLevelUnlocked (el piso más profundo ya alcanzado,
// mismo campo que usa tierSUnlocked() para la Forja Legendaria) en vez de
// state.char.level.
const GEAR_TIER_MIN_LEVEL = {rango_a:20, legendario:40, ss:50, rango_b:11, raro:11};
const STONE_TIER_MIN_LEVEL = {A:20, S:40, SS:50, B:11, C:11};
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
const WEAPON_STYLE_IDS = ['pesada','doblefilo','tirador','mago'];
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
  return makeGearItem(slot, styleId, rarity);
}
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
  return {kind:'soulstone', stoneId:tpl.id, family:tpl.family, name:tpl.name, tier:tpl.tier, icon:tpl.icon, desc:tpl.desc, preview:tpl.preview, bonus:tpl.bonus, special:tpl.special};
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
// 2026-09-24, pedido explícito: bajar "de manera leve" la dificultad de los
// pisos 41 a 59, sin tocar ningún jefe de década (piso 40 Usurpador, piso 50
// Custodio de la Isla, piso 60 Storm Gush quedan intactos). -8% de HP y ATQ
// es el recorte elegido — perceptible pero no un rework de la curva.
const FLOOR_41_59_NERF_MULT = 0.92;
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
  // Nerf leve 41-59 (ver FLOOR_41_59_NERF_MULT) — se salta el jefe exacto de
  // década (level%10===0), que es tpl.boss también, pero el resto de jefes
  // de piso (guardianes intermedios) SÍ lo reciben igual que mobs/élites.
  const isDecadeBossFight = tpl.boss && (level%10===0);
  if(level>=41 && level<=59 && !isDecadeBossFight){
    hp = Math.round(hp * FLOOR_41_59_NERF_MULT);
    atk = Math.round(atk * FLOOR_41_59_NERF_MULT);
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
  return {
    tpl, name:tpl.name, icon:tpl.icon,
    maxHP:hp, hp:hp, atk:atk, res, evasion,
    statuses:[], defending:false, cooldowns:{}
  };
}

/* ============================================================
   COMBAT
   ============================================================ */
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
    playerPos:'frente',
    playerStatuses:[],
    playerDefending:false,
    turnLog:[],
    turnCount:0, // cuántos turnos propios ya jugaste en ESTA pelea - ver endPlayerTurn() y la alerta de posible trampa en handleVictory()
    lastActor:null, // quién actuó justo antes del último render - dispara la animación en battleStage.js
    lastAction:null, // {label, effects:[{targetKind:'enemy'|'ally'|'player', key, amount, kind:'dmg'|'heal'}]} de ese mismo actor
    pendingSkill:null, // skillId esperando click de objetivo en el canvas - ver syncBattleStage()
    pendingTargetFilter:null, // 'front'|null — restringe el click a solo los enemigos del frente (ver useSkillFromMenu/onTarget)
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
  if(node.type==='jefe' && state.dungeon.level % 10 === 0) playBossAudio();
  renderAll();
}

function livingAllies(){ return (combat.allies||[]).filter(a=>a.hp>0); }
// A quién apuntan los enemigos: si hay un aliado en el frente con vida, lo
// intercepta a él (como un tanque real). Si no hay tanque y el jugador está
// en Retaguardia, cae en cualquier otro aliado vivo (aunque sea de
// retaguardia) antes que en el jugador — la Retaguardia lo saca de ser
// blanco directo salvo que de verdad no quede nadie más vivo al lado.
function frontlineTarget(){
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
  if(ally.shield>0){
    const absorbed = Math.min(ally.shield, amount);
    ally.shield -= absorbed;
    amount -= absorbed;
  }
  if(amount>0) ally.hp = Math.max(0, ally.hp - amount);
  checkAllyFuriaContenidaTrigger(ally);
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
  allySocketedStones(row).forEach(s=>{ if(s.bonus && s.bonus.stat==='maxhp') maxHP += s.bonus.value*8; }); // Vitalidad
  return maxHP;
}
// MP y Espíritu de un aliado: mismo pool de nivel para los dos, más lo que
// sume el Amuleto/Accesorio (mp_flat/espiritu_flat, ver GEAR_CATALOG) y una
// piedra de Sabiduría engarzada (su bonus.stat==='maxsta' se reusa acá como
// MP, ya que el aliado no tiene un pool de "estamina" separado del MP).
function allyMaxMP(row){
  const fromStones = allySocketedStones(row).filter(s=>s.bonus&&s.bonus.stat==='maxsta').reduce((sum,s)=>sum+s.bonus.value,0);
  return Math.round(30 + (row.level||1)*5) + equipModsSum(row.equip||{}, 'mp_flat') + fromStones;
}
function allyMaxSpirit(row){ return Math.round(30 + (row.level||1)*5) + equipModsSum(row.equip||{}, 'espiritu_flat'); }
// Costo de habilidad de aliado: guerrero/arquero/asesino gastan MP (estamina),
// mago/sacerdote gastan espíritu — igual que el jugador. Sin recurso
// suficiente, el aliado hace un ataque básico en vez de su habilidad ese
// turno (no se resetea el enfriamiento, así que lo intenta de nuevo apenas
// se regenere).
const ALLY_SKILL_COST = 20;
const ALLY_SKILL_POOL = {guerrero:'mp', arquero:'mp', asesino:'mp', mago:'spirit', sacerdote:'spirit'};
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
  const mentalResist = clamp(equipModsSum(equip,'fortaleza_mental')/100, 0, 0.9);
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
  return blessed ? base - 20 : base;
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
function frontEnemyIndex(){
  const frontIdxs = livingFrontlineEnemyIndices();
  if(frontIdxs.length) return frontIdxs[0];
  for(let i=0;i<combat.enemies.length;i++) if(combat.enemies[i].hp>0) return i;
  return -1;
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
  if(combat.playerDefending) ev = Math.max(ev, 0.5);
  // Ralentizado (2026-09-25, décadas 21+): -15% de evasión plana mientras
  // dure — antes el estado se aplicaba pero no hacía nada al jugador.
  if(hasStatus(combat.playerStatuses,'Ralentizado')) ev -= 0.15;
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
  if(hasStatus(ally.statuses,'Ralentizado')) ev -= 0.15;
  return clamp(ev, 0.02, 0.6);
}

// probabilidad combinada de aturdir al golpear, sumando todas las fuentes
// equipadas (arma(s) + piedras de alma engarzadas) que tengan ese proc.
function totalStunChance(){
  const sources = ['arma','arma2'].map(slot=>state.char.equip[slot])
    .filter(it=>it && it.special && it.special.type==='aturdir')
    .concat(socketedStones().filter(s=>s.special && s.special.type==='aturdir'));
  if(!sources.length) return 0;
  let noStun = 1;
  sources.forEach(s=> noStun *= (1-s.special.chance));
  return 1-noStun;
}

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
function applyStatus(target, statusDef, isPlayer){
  if(!statusDef) return;
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
        if(chance(0.5)) return;
      }
    }
    if(!chance(effChance)) return;
  }
  const list = isPlayer ? combat.playerStatuses : target.statuses;
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
}

// Descripción breve de cada estado (para el tooltip al pasar el puntero o
// tocar la etiqueta) y si es un buff (verde) o un debuff (rojo) — casi todo
// en el juego es un debuff; Furioso y Fortalecido son los únicos buffs reales.
const STATUS_INFO = {
  Tambaleo:     {buff:false, desc:'Tambalea: el próximo Machacar hace mucho más daño y lo aturde.'},
  Aturdido:     {buff:false, desc:'Pierde su próximo turno por completo.'},
  Furioso:      {buff:true,  desc:'+30% daño físico y -20% daño recibido, a cambio de -10% evasión.'},
  Inspirado:    {buff:true,  desc:'+daño gracias al Grito de guerra de tu compañero.'},
  Sangrado:     {buff:false, desc:'Sufre daño por turno. Se acumula hasta x3.'},
  Veneno:       {buff:false, desc:'Sufre daño de veneno por turno. Se acumula hasta x3.'},
  Marcado:      {buff:false, desc:'Recibe +20% de todo el daño mientras dura.'},
  Quemadura:    {buff:false, desc:'Sufre daño de fuego por turno.'},
  Ralentizado:  {buff:false, desc:'-20% evasión y actúa después que el resto.'},
  Bendecido:    {buff:false, desc:'Sus resistencias caen -20 en todos los elementos mientras dura.'},
  'Bendición':  {buff:true,  desc:'+resistencias y -daño recibido mientras dura (Grimorio de plegarias Tier S).'},
  Fortalecido:  {buff:true,  desc:'Se fortalece con cada turno que pasa: sus estadísticas suben por carga.'},
  Corrosion:    {buff:false, desc:'-15% resistencia física y solo recibe la mitad de cualquier curación.'},
  Debilitado:   {buff:false, desc:'Su daño cae un 15%.'},
  Paralisis:    {buff:false, desc:'Evasión a 0: no puede esquivar nada, ni defendiéndose.'},
  Ceguera:      {buff:false, desc:'Probabilidad de que sus golpes fallen por completo.'},
  Miedo:        {buff:false, desc:'Probabilidad de perder el turno por pánico.'},
  Confusion:    {buff:false, desc:'Probabilidad de golpear al azar — puede alcanzar a un aliado o a sí mismo.'},
  Silencio:     {buff:false, desc:'Su próximo turno solo puede usar ataques básicos, sin habilidades especiales.'}
};
function statusChipHTML(st){
  const info = STATUS_INFO[st.name];
  const cls = 'status-chip ' + (info && info.buff ? 'buff' : 'debuff');
  const desc = (info ? info.desc : '').replace(/"/g,'&quot;');
  const stacksTxt = st.stacks ? (' x'+st.stacks) : '';
  return `<span class="${cls}" title="${desc}" data-status-desc="${desc}">${st.name}${stacksTxt} (${st.duration})</span>`;
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
// espiritu_flat — ver GEAR_CATALOG) a través de TODO el equipo.
function equipModsSum(equip, key){
  let total = 0;
  EQUIP_SLOTS.forEach(slot=>{
    const it = equip && equip[slot];
    if(it && it.mods && it.mods[key]!==undefined) total += it.mods[key];
  });
  return total;
}
// Todo el equipo (armas Y equipo general: armadura/casco/botas/guantes,
// ahora que ese equipo también trae specials — antes solo miraba arma/arma2).
function specialsFromEquip(equip){
  const out = [];
  EQUIP_SLOTS.forEach(slot=>{
    const it = equip && equip[slot];
    if(it) itemSpecialsArr(it).forEach(sp=> out.push(sp));
  });
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
  sources.forEach(({it, sp})=>{
    if(sp.type==='aturdir'){
      // Piedras de alma únicamente (formato viejo) — inmediato, sin cambios.
      if(chance(sp.chance)){
        applyStatus(target, {name:'Aturdido', duration:1}, false);
        log(`<b>${it.name}</b> aturde a ${target.name}.`);
      }
    } else if(sp.type==='retroceso'){
      // Inmediato: se aplica ya mismo, así que el enemigo pierde la acción
      // que le tocaba este mismo ciclo de turno (ver processEnemyTurns).
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
      if(chance(sp.chance)){
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
      } else if(skill.dmgType==='fisico' && chance(sp.chance)){
        applyStatus(target, {name:'Sangrado', duration:3, stack:true, maxStack:3}, false);
        log(`<b>${it.name}</b> abre una herida en ${target.name}, que empieza a sangrar.`);
      }
    } else if(sp.type==='debilitar_enemigo'){
      // Maza de combate Tier S ('maza_s'): además de su retroceso normal,
      // 10% de probabilidad propia de bajarle el ataque al enemigo un 15%
      // durante 4 turnos (reusa el estado Debilitado, que ya reduce el daño
      // propio del que lo porta — ver enemyAct).
      if(chance(sp.chance) && fireTierSBuff(sp.tierSProc, false, target, {name:'Debilitado'})){
        log(`<b>${it.name}</b> quiebra la guardia de ${target.name}: -15% de su ataque durante 4 turnos.`);
      }
    } else if(sp.type==='esp_refund_on_apply' && skill){
      // Vara arcana Tier S ('vara_s'): al aplicar Quemadura o Ralentizado
      // (es decir, al golpear con Bola de fuego/Lanza de hielo), 5% de
      // probabilidad de recuperar el Espíritu máximo completo.
      if((skill.dmgType==='fuego' || skill.dmgType==='hielo') && chance(sp.chance)){
        const d = derived();
        state.char.curSpi = d.maxSpi;
        log(`<b>${it.name}</b> te devuelve todo tu Espíritu.`);
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
    if(pool < skill.cost.valor){ log('No tienes recursos suficientes para eso.'); return; }
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

  // spend cost
  if(skill.cost && !isRepeat){
    if(skill.cost.tipo==='estamina') state.char.curSta -= skill.cost.valor;
    else state.char.curSpi -= skill.cost.valor;
    checkPetResourceRecovery();
    // Sabiduría/Voluntad (piedras) y Vara arcana (arma de Mago/Sacerdote):
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
  if(skill.targetMode==='front'){
    // Si hay 2+ enemigos en el frente a la vez, el jugador ya eligió cuál
    // por click (ver useSkillFromMenu/onTarget) y llega acá con targetIdx
    // puesto — se valida que siga siendo un frontline vivo antes de usarlo,
    // por si el objetivo murió/cambió entre el click y la resolución. Con
    // un solo frontline vivo (el caso de siempre hasta ahora), targetIdx
    // llega null y se sigue auto-eligiendo como antes.
    let fi = -1;
    if(targetIdx!=null && combat.enemies[targetIdx] && combat.enemies[targetIdx].hp>0 && combat.enemies[targetIdx].tpl && combat.enemies[targetIdx].tpl.frontline){
      fi = targetIdx;
    } else {
      fi = frontEnemyIndex();
    }
    if(fi<0){ log('No hay ningún enemigo al frente.'); return; }
    targets = [combat.enemies[fi]];
  } else if(skill.targetMode==='any'){
    let t;
    if(typeof targetIdx==='string' && targetIdx.startsWith('ally:')){
      const allyIdx = parseInt(targetIdx.slice(5));
      const allyTarget = (combat.allies||[])[allyIdx];
      if(!allyTarget || allyTarget.hp<=0 || !isAllyHostile(allyTarget.id)){ log('Objetivo inválido.'); return; }
      t = allyTarget;
    } else {
      t = combat.enemies[targetIdx];
      if(!t || t.hp<=0){ log('Objetivo inválido.'); return; }
    }
    targets = [t];
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
    const existingBuff = hasStatus(combat.playerStatuses, skill.applySelf.name);
    if(existingBuff) existingBuff.duration = effectiveDuration;
    else combat.playerStatuses.push(Object.assign({}, skill.applySelf, {duration: effectiveDuration}));
    log(`Usas ${skill.name}. Te sientes más fuerte.`);
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

  targets.forEach(target=>{
    if(ceguera && chance(ceguera.procChance||0.32)){
      log(`La Ceguera hace que tu golpe hacia ${target.name} no encuentre nada.`);
      return;
    }
    // Esquivar del enemigo (equipo general: Precisión, ver GEAR_CATALOG) —
    // solo enemigos de verdad tienen tpl/evasion; un aliado hostil como
    // objetivo no esquiva por esta vía.
    if(target.tpl){
      const dodgeChance = clamp((target.evasion||0) + enemyStatusEvasionBonus(target.statuses) + levelGapEvasionBonus(monsterLevel, state.char.level) - d.precision, 0.02, 0.85);
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
      if(st) base *= (1 + (st.stacks||1)*skill.scalesWithStack.perStackMult);
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
      base *= (1+skill.bonusVsMarked);
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

    // Foco arcano Tier S ('foco_s'): cuando la habilidad consumió un estado
    // (cualquiera de los combos de arriba dejó comboText), +10% de daño más
    // — condición continua, se evalúa en cada golpe que sí combea.
    if(comboText && equipSpecialsForDmg.some(sp=>sp.tierSProc==='foco_s')){
      base *= 1.1;
    }

    let isCrit = skill.guaranteedCrit ? true : chance(crit);
    if(isCrit) base *= (1.5 + d.critDmgBonus);

    let ignore = skill.ignoreResist||0;
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
      const selfHeal = Math.max(1, Math.round(dmg*skill.selfHealPctOfDmg));
      const beforeHeal = state.char.curHP;
      state.char.curHP = Math.min(d.maxHP, state.char.curHP+selfHeal);
      if(state.char.curHP>beforeHeal) log(`Recuperas ${state.char.curHP-beforeHeal} de vida.`);
    }

    log(`Usas <b>${skill.name}</b> sobre ${target.name}: ${dmg} de daño${isCrit?' (¡crítico!)':''}.${comboText}`);

    if(skill.applies){
      let applyDef = skill.applies;
      if(skillId==='golpe_bruto') applyDef = Object.assign({}, skill.applies, {chance: skillBonus('golpe_bruto','tambaleoChance', skill.applies.chance)});
      else if(skillId==='corte_rapido') applyDef = Object.assign({}, skill.applies, {
        maxStack: skillBonus('corte_rapido','maxStack', skill.applies.maxStack),
        duration: skillBonus('corte_rapido','duration', skill.applies.duration)
      });
      applyStatus(target, applyDef, false);
    }
    applyEquippedSpecials(target, dmg, skill);
  });

  // Foco arcano (Mago) / Arco corto y Carcaj de cuero épicos (Arquero): una
  // sola repetición gratuita del mismo golpe, sin volver a cobrar el costo.
  // Nunca aplica a un ultimate (evita una segunda ejecución gratis de algo
  // ya limitado por usos/enfriamiento) ni encadena una segunda repetición.
  if(!isRepeat && !skill.ultimate){
    const equipSpecials = specialsFromEquip(state.char.equip);
    if(skill.cost && equipSpecials.some(sp=>sp.type==='doble_encantamiento' && chance(sp.chance))){
      log(`Tu arma realiza un <b>doble encantamiento</b>: ${skill.name} se relanza sin costo.`);
      await playerUseSkill(skillId, targetIdx, true);
      return;
    }
    if(skillId==='ataque_basico'){
      const segundoAtaque = equipSpecials.find(sp=>sp.type==='segundo_ataque_basico' && chance(sp.chance));
      if(segundoAtaque){
        log('Realizas un segundo ataque básico.');
        // Carcaj Tier S ('carcaj_s'): 10% de que ESTE segundo ataque ignore
        // 50% de resistencia física — se arma acá, se consume una sola vez
        // en el cálculo de daño de abajo (ver combat.pendingIgnoreBoost).
        if(segundoAtaque.tierSProc==='carcaj_s' && chance(0.1)) combat.pendingIgnoreBoost = true;
        await playerUseSkill(skillId, targetIdx, true);
        // Arco corto Tier S ('arcocorto_s'): cada segundo ataque cura un 3%
        // de tu vida máxima.
        if(segundoAtaque.tierSProc==='arcocorto_s'){
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
    await playBattleAnim(combat.lastActor, combat.lastAction);
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
const COMBAT_SPEED_DELAY_MS = {1: 650, 2: 0};
function getCombatSpeed(){
  try{
    const v = parseInt(localStorage.getItem('dsCombatSpeed'), 10);
    return (v===1 || v===2) ? v : 1;
  }catch(e){ return 1; }
}
function setCombatSpeed(speed){
  try{ localStorage.setItem('dsCombatSpeed', String(speed)); }catch(e){}
}

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
    if(stepDelay>0){ renderCombat(); await playBattleAnim(combat.lastActor, combat.lastAction); combat.lastActor = null; combat.lastAction = null; }
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

    if(ally.role==='sacerdote'){
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
        const heal = Math.round(d.maxHP*0.15*healBonus*healMultiplierFor(combat.playerStatuses));
        const before = state.char.curHP;
        state.char.curHP = Math.min(d.maxHP, state.char.curHP+heal);
        log(`<b>${ally.name}</b> te cura ${state.char.curHP-before} de vida.`);
        if(healDmgBuff){
          const existing = hasStatus(combat.playerStatuses,'Inspirado');
          if(existing) existing.duration = 2; else combat.playerStatuses.push({name:'Inspirado', duration:2, dmgMult:1+healDmgBuff.value});
        }
        if(healShieldSp && playerPct<0.4 && chance(healShieldSp.chance)){
          const shieldAmt = Math.round(d.maxHP*healShieldSp.shieldPct);
          grantShield(true, null, shieldAmt);
          log(`<b>${ally.name}</b> te protege con un escudo de ${shieldAmt}.`);
        }
        combat.lastAction = {label:'Bendición curativa', effects:[{targetKind:'player', amount:state.char.curHP-before, kind:'heal'}]};
        return;
      }
      if(mostInjured && allyPct < 0.5 && hasSpirit){
        ally.spirit -= ALLY_SKILL_COST;
        const heal = Math.round(mostInjured.maxHP*0.15*healBonus*healMultiplierFor(mostInjured.statuses));
        const before = mostInjured.hp;
        mostInjured.hp = Math.min(mostInjured.maxHP, mostInjured.hp+heal);
        log(`<b>${ally.name}</b> cura a <b>${mostInjured.name}</b> ${mostInjured.hp-before} de vida.`);
        if(healDmgBuff){
          const existing = hasStatus(mostInjured.statuses,'Inspirado');
          if(existing) existing.duration = 2; else mostInjured.statuses.push({name:'Inspirado', duration:2, dmgMult:1+healDmgBuff.value});
        }
        if(healShieldSp && allyPct<0.4 && chance(healShieldSp.chance)){
          const shieldAmt = Math.round(mostInjured.maxHP*healShieldSp.shieldPct);
          grantShield(false, mostInjured, shieldAmt);
          log(`<b>${ally.name}</b> protege a <b>${mostInjured.name}</b> con un escudo de ${shieldAmt}.`);
        }
        combat.lastAction = {label:'Bendición curativa', effects:[{targetKind:'ally', key:mostInjured.id, amount:mostInjured.hp-before, kind:'heal'}]};
        return;
      }
      // Nadie necesita curación (o no le queda espíritu para curar): Bendición
      // Sagrada — baja todas las resistencias del enemigo del frente, para
      // que tanto tus golpes como los del resto del equipo rindan más contra
      // objetivos muy resistentes (el hueco que Riakis necesita para caer).
      if(ally.skillCooldown<=0 && hasSpirit){
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
          ally.skillCooldown = ALLY_SKILL_COOLDOWN;
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
    (ally.specials||[]).forEach(sp=>{ if(sp.type==='aumento_dano') dmg *= (1+sp.value); });
    const blessedDebuff = hasStatus(enemyTarget.statuses,'Bendecido');
    if(blessedDebuff && blessedDebuff.incomingDmgMult) dmg *= blessedDebuff.incomingDmgMult;
    let resKey = 'fisico';
    let skillText = null;
    let skillName = null;

    if(ally.skillCooldown<=0 && ally.role!=='sacerdote' && ally[ALLY_SKILL_POOL[ally.role]]>=ALLY_SKILL_COST){
      ally.skillCooldown = ALLY_SKILL_COOLDOWN;
      ally[ALLY_SKILL_POOL[ally.role]] -= ALLY_SKILL_COST;
      if(ally.role==='guerrero'){ dmg *= 1.6; skillText = 'descarga un Golpe Pesado sobre'; skillName = 'Golpe Pesado'; }
      else if(ally.role==='arquero'){ dmg *= 1.0; skillText = 'clava un Disparo Certero (ignora parte de la resistencia) en'; skillName = 'Disparo Certero'; }
      else if(ally.role==='asesino'){
        const missingPct = 1 - (enemyTarget.hp/enemyTarget.maxHP);
        dmg *= 1 + missingPct*0.6;
        skillText = 'aprovecha un Golpe Sombrío contra';
        skillName = 'Golpe Sombrío';
      }
      else if(ally.role==='mago'){ resKey = 'fuego'; dmg *= 1.15; skillText = 'lanza una Bola de Fuego a'; skillName = 'Bola de Fuego'; }
    }

    let resVal = ally.role==='arquero' && skillText ? effectiveEnemyRes(enemyTarget, resKey)*0.6 : effectiveEnemyRes(enemyTarget, resKey);
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
    applyAllySpecials(ally, enemyTarget, dmg);
    combat.lastAction = {label: skillName || 'Ataque', effects:[{targetKind:'enemy', key:fi, amount:dmg, kind:'dmg'}]};
}

// Equivalente de applyEquippedSpecials() para aliados — mismos tipos de
// special, pero curando ally.hp en vez de state.char.curHP. Los mecanismos
// que solo tienen sentido para el jugador (esp_refund, doble_encantamiento,
// segundo ataque básico) no están acá: los aliados no tienen un kit de
// habilidades propio con costo variable, así que no aplican.
function applyAllySpecials(ally, target, dmgDealt){
  (ally.specials||[]).forEach(sp=>{
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

function tickStatuses(list, ownerName, target){
  // target = the enemy object being ticked, or null/undefined for the player.
  // Applies damage-over-time and reports whether the owner is stunned this turn.
  // Does NOT decrement durations — that happens exactly once, centrally, at the
  // end of processEnemyTurns (previously this also decremented AND a second
  // block decremented again, so every status lost 2 turns of duration per cycle).
  let skip = false;
  list.forEach(st=>{
    if(st.name==='Sangrado'){
      const dmg = Math.max(1, Math.round(skillBaseDamage()*0.08*(st.stacks||1)));
      if(target){ target.hp = Math.max(0, target.hp-dmg); log(`${ownerName} sangra por ${dmg}.`); }
      else { dealDamageToPlayer(dmg); log(`Sangras por ${dmg}.`); }
    }
    if(st.name==='Veneno'){
      const dmg = Math.max(1, Math.round(skillBaseDamage()*0.06*(st.stacks||1)));
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

  checkCombatEnd();
  if(!combat || combat.over) return;

  const stepDelay = COMBAT_SPEED_DELAY_MS[getCombatSpeed()] || 0;
  for(const enemy of livingEnemies()){
    if(!combat || combat.over || combat!==myCombat) break;
    if(enemy.hp<=0) continue;
    combat.lastActor = {kind:'enemy', idx: combat.enemies.indexOf(enemy)};
    combat.lastAction = null;
    if(stunFlags.get(enemy)){ log(`${enemy.name} está aturdido y pierde su turno.`); combat.lastAction = {label:'Aturdido', effects:[]}; }
    else enemyAct(enemy);
    if(stepDelay>0){ renderCombat(); await playBattleAnim(combat.lastActor, combat.lastAction); combat.lastActor = null; combat.lastAction = null; }
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

  // player y aliados regeneran MP/Espíritu cada ciclo de turno, igual ritmo
  const d = derived();
  state.char.curSta = Math.min(d.maxSta, state.char.curSta+5);
  state.char.curSpi = Math.min(d.maxSpi, state.char.curSpi+5);
  livingAllies().forEach(a=>{
    a.mp = Math.min(a.maxMP, a.mp+5);
    a.spirit = Math.min(a.maxSpirit, a.spirit+5);
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

  const target = frontlineTarget();
  const evasion = target.kind==='ally' ? computeAllyEvasion(target.ally) : computeCritEvasion().evasion;
  if(chance(evasion)){
    log(`${enemy.name} ataca a ${target.kind==='ally' ? target.ally.name : 'ti'}, ¡pero esquiva!`);
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
  if(bChance>0 && chance(bChance)){
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
    return;
  }

  // Sistema nuevo, data-driven (2026-09-25, "Década 2 - Arañas" y en
  // adelante): un tpl con `abilities`+`aiPriority` en vez de `moves` (lista
  // de strings sueltas resueltas por un if-chain) resuelve su turno acá y
  // nunca llega al sistema viejo de abajo — décadas ya lanzadas (Bosque
  // Goblin, Bestias, Usurpador, Isla Paraíso, El Mar) siguen 100% con el
  // sistema viejo, sin ningún cambio de comportamiento.
  if(enemy.tpl.abilities){ resolveNewStyleEnemyMove(enemy, target); return; }

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
      combat.enemies.push(makeEnemy(SUMMON_TEMPLATE, state.dungeon.atFloor, state.dungeon.level));
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
    if(state.char.race==='enano') finalDmg -= 2;
    if(combat.playerDefending) finalDmg *= 0.5;
    if(combat.playerPos==='frente') finalDmg *= (1-FRONTLINE_DAMAGE_REDUCTION);
    const furiosoBuff = hasStatus(combat.playerStatuses,'Furioso');
    if(furiosoBuff && furiosoBuff.incomingDmgReduction) finalDmg *= (1 - furiosoBuff.incomingDmgReduction);
    if(hasStatus(combat.playerStatuses,'Paralisis')) finalDmg *= 1.25; // indefenso: sin evasión y más daño recibido
    // Maza de combate / Espadón pesado épicos: reducción de daño recibido pasiva.
    const playerEquipSpecials = specialsFromEquip(state.char.equip);
    playerEquipSpecials.forEach(sp=>{
      if(sp.type==='reduccion_dano') finalDmg *= (1-sp.value);
    });
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
    log(`${enemy.name} ${text}: ${finalDmg} de daño.`);
    combat.lastAction = {label:moveLabel, effects:[{targetKind:'player', amount:finalDmg, kind:'dmg'}]};
  } else {
    const ally = target.ally;
    const allyResKey = elementalType || 'fisico';
    const allyBendicion = hasStatus(ally.statuses,'Bendición');
    let allyDmg = dmg*(1-(((ally.res && ally.res[allyResKey])||0) + (allyBendicion?allyBendicion.resBonus||0:0) - (elementalType?0:corrosionResPenalty(ally.statuses)))/100);
    if(hasStatus(ally.statuses,'Paralisis')) allyDmg *= 1.25; // indefenso: igual que al jugador
    if(ally.pos==='frente') allyDmg *= (1-FRONTLINE_DAMAGE_REDUCTION);
    (ally.specials||[]).forEach(sp=>{ if(sp.type==='reduccion_dano') allyDmg *= (1-sp.value); });
    const allyFuriosoDef = hasStatus(ally.statuses,'Furioso');
    if(allyFuriosoDef && allyFuriosoDef.incomingDmgReduction) allyDmg *= (1 - allyFuriosoDef.incomingDmgReduction);
    if(allyBendicion && allyBendicion.incomingDmgReduction) allyDmg *= (1 - allyBendicion.incomingDmgReduction);
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
    log(`${enemy.name} ${text} a ${ally.name}: ${finalDmg} de daño.`);
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
function resolveNewStyleEnemyMove(enemy, target){
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
    log(`${enemy.name} reacciona al quedar herido: ${tpl.hpThresholdBuff.buff.name}.`);
  }

  const ctx = {
    selfHpPct: enemy.maxHP>0 ? enemy.hp/enemy.maxHP : 1,
    targetHpPct: targetMaxHp>0 ? targetHp/targetMaxHp : 1,
    targetStatuses,
    targetStatusCount(name){ const st=targetStatuses.find(s=>s.name===name); return st?(st.stacks||1):0; },
  };

  const priority = tpl.aiPriority || Object.keys(tpl.abilities);
  let chosenId = null;
  for(const id of priority){
    const ab = tpl.abilities[id];
    if(!ab) continue;
    if(enemy.cooldowns[id] > 0) continue;
    if(ab.condition && !ab.condition(ctx)) continue;
    chosenId = id; break;
  }
  if(!chosenId) chosenId = priority[priority.length-1];
  const ability = tpl.abilities[chosenId];
  if(ability.cooldown) enemy.cooldowns[chosenId] = ability.cooldown;

  // Movimiento de soporte puro (no hace daño): se autobuffea (defensa,
  // ej. "Seda Protectora"/"Caparazón Endurecido") y termina el turno ahí.
  if(ability.utility==='self_buff'){
    const buff = ability.selfBuff;
    const existing = hasStatus(enemy.statuses, buff.name);
    if(existing) Object.assign(existing, buff);
    else enemy.statuses.push(Object.assign({}, buff));
    log(`${enemy.name} usa ${ability.label}.`);
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

  let dmg = enemy.atk * (ability.mult!=null ? ability.mult : 1);
  const fortalecido = hasStatus(enemy.statuses,'Fortalecido');
  if(fortalecido) dmg = Math.round(dmg * (1 + (fortalecido.stacks||1)*0.04));
  if(hasStatus(enemy.statuses,'Debilitado')) dmg = Math.round(dmg*0.85);
  enemy.statuses.forEach(st=>{ if(st.dmgMult) dmg = Math.round(dmg*st.dmgMult); });
  if(tpl.bonusVsOwnStatus && ctx.targetStatusCount(tpl.bonusVsOwnStatus.name) >= tpl.bonusVsOwnStatus.minStacks){
    dmg = Math.round(dmg*tpl.bonusVsOwnStatus.mult);
  }
  if(ability.bonusVsTargetStatus && ctx.targetStatusCount(ability.bonusVsTargetStatus.name) >= (ability.bonusVsTargetStatus.minStacks||1)){
    dmg = Math.round(dmg*ability.bonusVsTargetStatus.mult);
  }

  let finalDmg;
  if(onPlayer){
    let resVal = totalRes('fisico') - corrosionResPenalty(combat.playerStatuses);
    finalDmg = dmg*(1-resVal/100);
    if(state.char.race==='enano') finalDmg -= 2;
    if(combat.playerDefending) finalDmg *= 0.5;
    if(combat.playerPos==='frente') finalDmg *= (1-FRONTLINE_DAMAGE_REDUCTION);
    const furiosoBuff = hasStatus(combat.playerStatuses,'Furioso');
    if(furiosoBuff && furiosoBuff.incomingDmgReduction) finalDmg *= (1 - furiosoBuff.incomingDmgReduction);
    if(hasStatus(combat.playerStatuses,'Paralisis')) finalDmg *= 1.25;
    const playerEquipSpecials = specialsFromEquip(state.char.equip);
    playerEquipSpecials.forEach(sp=>{ if(sp.type==='reduccion_dano') finalDmg *= (1-sp.value); });
    if(hasTierSProc(playerEquipSpecials,'casco_s') && d.maxHP>0 && (state.char.curHP/d.maxHP) < 0.5) finalDmg *= 0.95;
    if(hasTierSProc(playerEquipSpecials,'armadura_s') && !combat.tierSFired.has('armadura_s:player')){
      combat.tierSFired.add('armadura_s:player'); finalDmg *= 0.9;
    }
    finalDmg *= levelDiffDamageMult(monsterEffectiveLevel(), state.char.level);
    finalDmg = Math.max(1, Math.round(finalDmg));
    dealDamageToPlayer(finalDmg);
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
    log(`${enemy.name} usa ${ability.label}: ${finalDmg} de daño.`);
    combat.lastAction = {label:ability.label, effects:[{targetKind:'player', amount:finalDmg, kind:'dmg'}]};
  } else {
    const ally = target.ally;
    const allyBendicion = hasStatus(ally.statuses,'Bendición');
    let resVal = ((ally.res && ally.res.fisico)||0) + (allyBendicion?allyBendicion.resBonus||0:0) - corrosionResPenalty(ally.statuses);
    let allyDmg = dmg*(1-resVal/100);
    if(hasStatus(ally.statuses,'Paralisis')) allyDmg *= 1.25;
    if(ally.pos==='frente') allyDmg *= (1-FRONTLINE_DAMAGE_REDUCTION);
    (ally.specials||[]).forEach(sp=>{ if(sp.type==='reduccion_dano') allyDmg *= (1-sp.value); });
    const allyFuriosoDef = hasStatus(ally.statuses,'Furioso');
    if(allyFuriosoDef && allyFuriosoDef.incomingDmgReduction) allyDmg *= (1 - allyFuriosoDef.incomingDmgReduction);
    if(allyBendicion && allyBendicion.incomingDmgReduction) allyDmg *= (1 - allyBendicion.incomingDmgReduction);
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
    log(`${enemy.name} usa ${ability.label} sobre ${ally.name}: ${finalDmg} de daño.`);
    if(ally.hp<=0) log(`<b>${ally.name}</b> cae en combate y queda fuera de acción hasta que avances al siguiente nivel del laberinto.`);
    combat.lastAction = {label:ability.label, effects:[{targetKind:'ally', key:ally.id, amount:finalDmg, kind:'dmg'}]};
  }

  if(ability.selfBuff){
    const existing = hasStatus(enemy.statuses, ability.selfBuff.name);
    if(existing) existing.duration = ability.selfBuff.duration;
    else enemy.statuses.push(Object.assign({}, ability.selfBuff));
  }
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

function checkCombatEnd(){
  if(!combat || combat.over) return;
  if(state.char.curHP<=0){
    combat.over = true;
    syncAllyHPToDungeon();
    log('Caes al suelo. La oscuridad del laberinto te envuelve...');
    handleDefeat();
    return;
  }
  if(livingEnemies().length===0){
    combat.over = true;
    syncAllyHPToDungeon();
    handleVictory();
  }
}

// Fragmentos de jefe de década — un tipo de material por década (piso que
// cierra esa década), usados como ingrediente de la Forja Legendaria (ver
// TIER_S_RECIPE). No se venden ni se compran con oro/Sellos, solo caen del
// jefe de década correspondiente.
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
  const xpGain = Math.max(1, Math.round(perKillXP * combat.enemies.length * (race().id==='humano'?1.1:1) * xpGapMultiplier() * earlyXpBoost(level) * XP_GLOBAL_BOOST));
  const goldGain = Math.round((rnd(6,14)*combat.enemies.length + (isBoss?60:isElite?20:0)) * rewardMult);
  state.char.xp += xpGain;
  state.char.gold += goldGain;
  log(`Victoria. +${xpGain} experiencia, +${goldGain} de oro.`);
  combat.node.done = true;

  // La experiencia no se reparte: cada aliado recibe el mismo xpGain completo
  // que tú, no una fracción — así todos evolucionan al mismo ritmo que el equipo.
  advanceAllyXp(xpGain);

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
  const rollCount = combat.enemies.length * (isDecadeFinal ? 2 : 1);
  // El jefe de década del piso 10 es la única excepción al piso mínimo de
  // Raro/Único (C/B): es el primer vistazo real a esos rangos, incluso para
  // un personaje que llega ahí todavía por debajo del nivel 11.
  const bypassTiers = (isDecadeFinal && level===10) ? new Set(['raro','rango_b','C','B']) : null;
  let lootText = '';
  let gotRareGear = false;
  let gotRareStone = false;
  for(let i=0;i<rollCount;i++){
    const gearDrop = rollGearDropForLevel(state.char.maxLevelUnlocked||1, state.dungeon.atFloor, bypassTiers);
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
    const stoneDrop = rollGuaranteedStoneDropForLevel(state.char.maxLevelUnlocked||1, bypassTiers);
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

  if(isBoss){
    const clearedLevel = level;
    const wasFrontier = clearedLevel === maxLevelUnlocked();
    if(wasFrontier) state.char.maxLevelUnlocked = Math.min(LEVEL_CAP, clearedLevel+1);
    // Checkpoints: solo los jefes de década (piso 10, 20, 30...) habilitan un
    // punto de entrada nuevo, en el piso siguiente (11, 21, 31...). Si mueres
    // en el 15, tu próxima entrada igual arranca en el 11 - no hay checkpoint
    // a mitad de década, solo al cerrarla.
    if(isDecadeFinal){
      state.char.checkpointLevel = Math.max(state.char.checkpointLevel||1, clearedLevel+1);
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
        log(`Avanzas al nivel ${clearedLevel+1} del laberinto.`);
        renderAll(); save();
      }});
    }
    buttons.push({label:'Retirarse a la ciudad', primary:!canContinue, onClick:()=>{
      const tax = Math.round(state.char.gold*0.1);
      state.char.gold -= tax;
      log(`Regresas a la ciudad conservando tu botín. Se te cobran ${tax} de oro en impuestos.`);
      combat = null;
      state.dungeon = null;
      payAlliesOnExit();
      playLoginAudio();
      renderAll(); save();
    }});
    showChoiceOverlay('Guardián derrotado', bodyText, buttons);
    save();
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
function handleDefeat(){
  stopBossAudio();
  showOverlay('Caído en el laberinto', `Tu cuerpo cede y el laberinto te expulsa antes del final. Pierdes el equipo suelto que llevabas en la mochila y el ${DEFEAT_GOLD_LOSS_PCT}% de tu oro. Lo que hayas guardado en el Hogar sigue a salvo.`, ()=>{
    const lostItems = state.char.inventory.filter(i=>i.kind==='equip').length;
    state.char.inventory = state.char.inventory.filter(i=>i.kind!=='equip');
    state.char.gold = Math.round(state.char.gold*(1-DEFEAT_GOLD_LOSS_PCT/100));
    const d = derived();
    state.char.curHP = Math.round(d.maxHP*0.5);
    state.char.curSta = d.maxSta; state.char.curSpi = d.maxSpi;
    combat = null;
    state.dungeon = null;
    payAlliesOnExit();
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
  document.getElementById('ov-close').onclick = ()=>{
    document.body.removeChild(div);
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
      document.body.removeChild(div);
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
  {title:'MP y Espíritu', body:'El MP paga tus habilidades físicas. El Espíritu paga las mágicas y de utilidad, y también aumenta tu daño mágico. Reposicionarte cambia entre Frente y Retaguardia, y ocupa tu turno.'},
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
  if(div) document.body.removeChild(div);
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

function renderCombat(){
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
      if(pool < sk.cost.valor) disabled = true;
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
      <span class="item-name"><img src="src/assets/pociones/${it.potionId}.png" alt="" style="width:18px; height:18px; object-fit:contain; vertical-align:-4px; margin-right:3px;" onerror="this.replaceWith('${tpl.icon} ')">${tpl.name} x${it.qty}</span>
      <span>${tpl.desc}</span>
    </div>`;
  }).join('') : `<p class="inv-empty-msg">No tienes pociones para usar.</p>`;

  const combatSpeed = getCombatSpeed();
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
  const playerSprite = CLASS_SPRITES[state.char.style];
  const enemySprite = targetEnemy && targetEnemy.tpl ? ENEMY_SPRITES[targetEnemy.tpl.id] : null;
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
      <div class="pos-toggle" id="combat-speed-toggle" style="margin:0;" title="Qué tan rápido se resuelven los turnos de aliados y enemigos">
        <span class="pos-pill ${combatSpeed===1?'active':''}" data-speed="1">x1</span>
        <span class="pos-pill ${combatSpeed===2?'active':''}" data-speed="2">x2</span>
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
      ${equippedPets().map(p=>`<div class="combat-pet-chip" style="box-shadow:0 0 0 2px ${PET_RARITIES[p.rarity].color}bb inset;"><img src="${petArtPath(p.id)}" alt="${p.name}" title="${p.name}" loading="lazy"></div>`).join('')}
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

  // El objetivo pendiente vive en combat.pendingSkill (no en una variable
  // local del closure) para que el click en el canvas de battleStage.js
  // -que se registra una sola vez, no en cada render- pueda leer el valor
  // vigente en el momento del click.
  const useSkillFromMenu = (sid)=>{
    const sk = SKILLS[sid];
    combat.pendingSkill = null;
    combat.pendingTargetFilter = null;
    if(sk.targetMode==='any'){
      combat.pendingSkill = sid;
      log(`Elige un objetivo para ${sk.name}.`);
    } else if(sk.targetMode==='front' && livingFrontlineEnemyIndices().length>1){
      // Dos o más enemigos en el frente a la vez: se pide el mismo click de
      // objetivo que 'any', pero solo entre los que están al frente (ver
      // pendingTargetFilter, leído en onTarget más abajo).
      combat.pendingSkill = sid;
      combat.pendingTargetFilter = 'front';
      log(`Elige a cuál de los enemigos del frente atacar con ${sk.name}.`);
    } else {
      guardedPlayerUseSkill(sid, null);
    }
  };
  const grid = document.getElementById('battle-menu-grid');
  const submenu = document.getElementById('battle-submenu');
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

  const playerInfo = {
    name: state.char.nickname || s.name, icon: race().icon, style: state.char.style,
    hp: state.char.curHP, maxHP: d.maxHP, mp: state.char.curSta, maxMP: d.maxSta,
    spirit: state.char.curSpi, maxSpirit: d.maxSpi, statuses: combat.playerStatuses||[],
    shield: combat.playerShield||0,
    pos: combat.playerPos, bgTheme: DECADE_BG_THEME[decadeIndexForLevel(state.dungeon.level)],
  };
  syncBattleStage(document.getElementById('battle-stage-mount'), combat, playerInfo, {
    isAllyHostile,
    onTarget: (idx)=>{
      if(!combat.pendingSkill) return;
      if(combat.pendingTargetFilter==='front' && !livingFrontlineEnemyIndices().includes(idx)) return; // click fuera del frente, se ignora
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
let selRace = null, selStyle = null;

function renderCreation(){
  const raceGrid = document.getElementById('race-grid');
  raceGrid.innerHTML = Object.values(RACES).map(r=>`
    <button class="pick-card" data-race="${r.id}">
      <img class="pick-card-art" src="src/assets/razas/${r.id}.png" alt="" loading="lazy">
      <h3>${r.icon} ${r.name}</h3>
      <div class="desc">${r.desc}</div>
      <div class="mini-stats">
        <span>FIS <b>${r.stats.fis}</b></span>
        <span>ESP <b>${r.stats.esp}</b></span>
        <span>HAB <b>${r.stats.hab}</b></span>
      </div>
    </button>
  `).join('');

  const styleGrid = document.getElementById('style-grid');
  styleGrid.innerHTML = Object.values(STYLES).map(s=>`
    <button class="pick-card" data-style="${s.id}">
      <img class="pick-card-art emblem" src="src/assets/clases/${s.id}.png" alt="" loading="lazy">
      <h3>${s.icon} ${s.name}</h3>
      <div class="desc">${s.desc}</div>
    </button>
  `).join('');

  raceGrid.querySelectorAll('.pick-card').forEach(el=>{
    el.onclick = ()=>{
      selRace = el.dataset.race;
      raceGrid.querySelectorAll('.pick-card').forEach(c=>c.classList.remove('selected'));
      el.classList.add('selected');
      checkBegin();
    };
  });
  styleGrid.querySelectorAll('.pick-card').forEach(el=>{
    el.onclick = ()=>{
      selStyle = el.dataset.style;
      styleGrid.querySelectorAll('.pick-card').forEach(c=>c.classList.remove('selected'));
      el.classList.add('selected');
      checkBegin();
    };
  });
}
function checkBegin(){
  const nickname = document.getElementById('char-nickname').value.trim();
  document.getElementById('btn-begin').disabled = !(selRace && selStyle && nickname.length >= 3);
}
document.getElementById('char-nickname').addEventListener('input', checkBegin);

document.getElementById('btn-begin').onclick = async ()=>{
  const btn = document.getElementById('btn-begin');
  const msg = document.getElementById('char-nickname-msg');
  const nickname = document.getElementById('char-nickname').value.trim();
  msg.textContent = '';
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
};

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
  invOpen = !invOpen;
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
  a.volume = 0.5;
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
          <b>${row.nickname}</b> <span class="slot-tag">${r.name} · ${s.name}</span>${row.role==='admin' ? ' <span class="slot-tag">admin</span>' : ''}
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

function enterCharacter(row){
  state = rowToState(row);
  migrateState();
  // si ya tenía una corrida activa entra directo al laberinto (sin música de
  // ciudad); si no, aterriza en la ciudad y la música debe sonar ahí también
  if(state.dungeon) stopLoginAudio(); else playLoginAudio();
  document.getElementById('btn-switch-char').style.display = 'inline-block';
  showScreen('screen-game');
  renderAll();
  refreshMissionsState();
  refreshAlliesState();
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
  renderCreation();
  selRace = null; selStyle = null;
  document.querySelectorAll('.pick-card').forEach(c=>c.classList.remove('selected'));
  const nickInput = document.getElementById('char-nickname');
  if(nickInput) nickInput.value = '';
  const nickMsg = document.getElementById('char-nickname-msg');
  if(nickMsg) nickMsg.textContent = '';
  document.getElementById('btn-begin').disabled = true;
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
}

// hide(id): getElementById + set display, sin reventar si el header todavía
// no terminó de montarse — boot() puede llamar a esto antes de que el navegador
// termine de asentar el DOM inicial (el listener de Supabase re-renderiza
// igual apenas confirma la sesión, así que perder ese primer intento es
// inofensivo, pero no debería lanzar un error sin capturar).
function hide(id){ const el=document.getElementById(id); if(el) el.style.display='none'; }
function resetHeaderForLoggedOut(){
  hide('clock-badge'); hide('gold-badge'); hide('tier-badge'); hide('btn-music-toggle');
  hide('btn-inventory'); hide('btn-switch-char'); hide('btn-slots'); hide('btn-reset');
  hide('city-nav');
  const sub = document.getElementById('header-sub');
  if(sub) sub.textContent = 'El juego que nadie ha superado';
}

function showAuthScreen(message){
  state = null; combat = null;
  invOpen = false; homeOpen = false; shopOpen = false; rankingOpen = false; adminOpen = false;
  currentUser = null; currentProfile = null;
  resetHeaderForLoggedOut();
  stopBossAudio();
  renderAuthScreen(message);
  showScreen('screen-auth');
  playLoginAudio();
}

async function enterGame(){
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
