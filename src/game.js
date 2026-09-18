"use strict";

import { supabase } from './supabaseClient.js';
import * as auth from './auth.js';
import { syncBattleStage, playBattleAnim } from './battleStage.js';

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
    id:'tirador', name:'Tirador', icon:'🏹', scaleStat:'fis',
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
      ? 'Un golpe simple y confiable. No cuesta recursos. +60% de daño para el Tirador — su golpe más fuerte.'
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
    desc:'Ultimate del Tirador. Ignora toda la resistencia física, crítico garantizado, y +50% de daño si el objetivo está Marcado.'
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
  // Década 1 — pisos 11-20 — Arañas del bosque profundo (familia tarántula, veneno/Parálisis)
  {
    regular: [
      {id:'tarantula_cazadora', name:'Tarántula cazadora', icon:'🕷️', hp:1.1, atk:1.05, res:{fisico:5,fuego:-5,hielo:0,veneno:20,aturdimiento:0}, moves:['pegar','picar'], frontline:true},
      {id:'tarantula_saltarina', name:'Tarántula saltarina', icon:'🕷️', hp:0.9, atk:1.15, res:{fisico:0,fuego:-10,hielo:0,veneno:20,aturdimiento:0}, moves:['pegar','paralizar','picar'], frontline:true},
      {id:'tarantula_tejedora', name:'Tarántula tejedora', icon:'🕸️', hp:0.8, atk:0.95, res:{fisico:-5,fuego:-10,hielo:10,veneno:25,aturdimiento:0}, moves:['pegar','paralizar','picar']},
      {id:'viuda_venenosa', name:'Viuda venenosa', icon:'🕸️', hp:0.75, atk:1.0, res:{fisico:-10,fuego:-10,hielo:5,veneno:30,aturdimiento:0}, moves:['paralizar','pegar','picar']}
    ],
    elite: [{id:'matriarca_telaranha', name:'Matriarca telaraña', icon:'🕷️', hp:2.0, atk:1.35, res:{fisico:10,fuego:-15,hielo:5,veneno:35,aturdimiento:0}, moves:['pegar','paralizar'], elite:true, frontline:true}],
    guardians: [
      {id:'reina_telaranha', name:'Reina telaraña', icon:'👑', hp:3.4, atk:1.55, res:{fisico:15,fuego:-15,hielo:10,veneno:40,aturdimiento:5}, moves:['pegar','paralizar','aplastar'], boss:true, frontline:true},
      {id:'devoradora_nido', name:'Devoradora de nido', icon:'🕷️', hp:3.6, atk:1.5, res:{fisico:20,fuego:-10,hielo:5,veneno:35,aturdimiento:10}, moves:['pegar','paralizar','aplastar'], boss:true, frontline:true}
    ],
    decadeBoss: {id:'matriarca_escarlata', name:'Matriarca escarlata', icon:'🕷️', hp:4.2, atk:1.5, res:{fisico:20,fuego:-15,hielo:10,veneno:45,aturdimiento:10}, moves:['pegar','paralizar','aplastar'], boss:true, frontline:true}
  },
  // Década 2 — pisos 21-30 — Guaridas de bestias, con Riakis
  {
    regular: [
      {id:'loba_acantilado', name:'Loba de acantilado', icon:'🐺', hp:1.1, atk:1.1, res:{fisico:10,fuego:0,hielo:5,veneno:0,aturdimiento:0}, moves:['pegar','morder'], frontline:true},
      {id:'oso_cuevas', name:'Oso de las cuevas', icon:'🐻', hp:1.3, atk:1.15, res:{fisico:15,fuego:0,hielo:5,veneno:0,aturdimiento:5}, moves:['pegar','aplastar','morder'], frontline:true},
      {id:'buitre_corrupto', name:'Buitre corrupto', icon:'🦅', hp:0.8, atk:1.0, res:{fisico:-5,fuego:0,hielo:0,veneno:10,aturdimiento:0}, moves:['pegar','cegar','morder']},
      {id:'lince_sombrio', name:'Lince sombrío', icon:'🐈‍⬛', hp:0.9, atk:1.1, res:{fisico:5,fuego:0,hielo:0,veneno:0,aturdimiento:0}, moves:['pegar','atemorizar','morder']}
    ],
    elite: [{id:'alfa_manada', name:'Alfa de la manada', icon:'🐺', hp:2.1, atk:1.4, res:{fisico:15,fuego:0,hielo:5,veneno:0,aturdimiento:5}, moves:['pegar','atemorizar'], elite:true, frontline:true}],
    guardians: [
      {id:'behemoth_piedra', name:'Behemoth de piedra', icon:'🗿', hp:3.8, atk:1.5, res:{fisico:30,fuego:0,hielo:0,veneno:0,aturdimiento:20}, moves:['pegar','aplastar'], boss:true, frontline:true},
      {id:'guardian_corrupto', name:'Guardián corrupto', icon:'🐗', hp:3.5, atk:1.6, res:{fisico:15,fuego:0,hielo:0,veneno:10,aturdimiento:10}, moves:['pegar','aplastar','atemorizar'], boss:true, frontline:true}
    ],
    // Riakis: su "escudo de corrupción" resiste casi todo el daño mundano
    // (físico/veneno/aturdimiento) pero es vulnerable a fuego/hielo — el hueco
    // que un Canalizador puede explotar hoy. Cuando exista el Sacerdote
    // (Taberna), su efecto sagrado deberá abrir ese mismo hueco sin necesitar
    // magia elemental — queda como gancho pendiente, no implementado todavía.
    decadeBoss: {id:'riakis', name:'Señor del Caos Riakis', icon:'👁️', hp:5.0, atk:1.6, res:{fisico:55,fuego:-25,hielo:-25,veneno:40,aturdimiento:30}, moves:['pegar','cegar','atemorizar'], boss:true, frontline:true}
  },
  // Década 3 — pisos 31-40 — El Usurpador Sin Nombre (mimetismo, Confusión)
  {
    regular: [
      {id:'sombra_mimetica', name:'Sombra mimética', icon:'🫥', hp:0.9, atk:1.05, res:{fisico:0,fuego:0,hielo:0,veneno:0,aturdimiento:10}, moves:['pegar','confundir']},
      {id:'espejo_viviente', name:'Espejo viviente', icon:'🪞', hp:1.0, atk:1.0, res:{fisico:5,fuego:5,hielo:5,veneno:5,aturdimiento:5}, moves:['pegar','confundir'], frontline:true},
      {id:'doble_corrupto', name:'Doble corrupto', icon:'👥', hp:1.1, atk:1.1, res:{fisico:10,fuego:0,hielo:0,veneno:0,aturdimiento:0}, moves:['pegar'], frontline:true},
      {id:'farsante_menor', name:'Farsante menor', icon:'🎭', hp:0.85, atk:1.0, res:{fisico:0,fuego:0,hielo:0,veneno:0,aturdimiento:0}, moves:['pegar','robar','confundir']}
    ],
    elite: [{id:'impostor_mayor', name:'Impostor mayor', icon:'🎭', hp:2.2, atk:1.4, res:{fisico:10,fuego:5,hielo:5,veneno:5,aturdimiento:15}, moves:['pegar','confundir'], elite:true, frontline:true}],
    guardians: [
      {id:'reflejo_perfecto', name:'Reflejo perfecto', icon:'🪞', hp:3.7, atk:1.55, res:{fisico:15,fuego:10,hielo:10,veneno:10,aturdimiento:15}, moves:['pegar','confundir','aplastar'], boss:true, frontline:true},
      {id:'mascara_viviente', name:'Máscara viviente', icon:'🎭', hp:3.6, atk:1.6, res:{fisico:10,fuego:10,hielo:10,veneno:10,aturdimiento:20}, moves:['pegar','confundir','aplastar'], boss:true, frontline:true}
    ],
    decadeBoss: {id:'usurpador', name:'El Usurpador Sin Nombre', icon:'🎭', hp:4.8, atk:1.8, res:{fisico:20,fuego:10,hielo:10,veneno:10,aturdimiento:20}, moves:['pegar','confundir','aplastar'], boss:true, frontline:true}
  },
  // Década 4 — pisos 41-50 — Isla Paraíso (supervivencia; ver reglas de
  // generación especiales en generateDungeon() y enterNode())
  {
    regular: [
      {id:'explorador_rival', name:'Explorador rival', icon:'🗡️', hp:1.0, atk:1.1, res:{fisico:5,fuego:0,hielo:0,veneno:0,aturdimiento:0}, moves:['pegar','robar'], frontline:true},
      {id:'mercenario_desertor', name:'Mercenario desertor', icon:'🪓', hp:1.1, atk:1.15, res:{fisico:10,fuego:0,hielo:0,veneno:0,aturdimiento:0}, moves:['pegar','aplastar'], frontline:true},
      {id:'cazarrecompensas', name:'Cazarrecompensas', icon:'🏹', hp:0.85, atk:1.1, res:{fisico:-5,fuego:0,hielo:0,veneno:0,aturdimiento:0}, moves:['pegar','robar']},
      {id:'superviviente_curtido', name:'Superviviente curtido', icon:'🔪', hp:0.95, atk:1.15, res:{fisico:5,fuego:0,hielo:0,veneno:5,aturdimiento:0}, moves:['pegar','atemorizar']}
    ],
    elite: [{id:'superviviente_despiadado', name:'Superviviente despiadado', icon:'⚔️', hp:2.0, atk:1.45, res:{fisico:10,fuego:0,hielo:0,veneno:5,aturdimiento:5}, moves:['pegar','aplastar','atemorizar'], elite:true, frontline:true}],
    guardians: [], // esta década no tiene guardianes de nivel intermedios (ver enterNode)
    // El jefe de década llega escoltado (ver enterNode) y no busca hacer daño
    // directo: cura, se bufa solo y llama refuerzos. Débil en poder bruto
    // frente al Usurpador, pero nunca solo.
    decadeBoss: {id:'custodio_isla', name:'Custodio de la Isla', icon:'🏝️', hp:3.2, atk:1.2, res:{fisico:15,fuego:10,hielo:10,veneno:10,aturdimiento:15}, moves:['curar','buff_pasivo','invocar','area_debil'], boss:true, frontline:false}
  },
  // Década 5 — pisos 51-60 — El Mar (Storm Gush / Tetrasea)
  {
    regular: [
      {id:'triton_guerrero', name:'Tritón guerrero', icon:'🔱', hp:1.15, atk:1.15, res:{fisico:10,fuego:5,hielo:-10,veneno:0,aturdimiento:0}, moves:['pegar','aplastar'], frontline:true},
      {id:'triton_hechicero', name:'Tritón hechicero', icon:'🌊', hp:0.85, atk:1.05, res:{fisico:-5,fuego:10,hielo:-10,veneno:5,aturdimiento:0}, moves:['pegar','debilitar']},
      {id:'cangrejo_gigante', name:'Cangrejo gigante', icon:'🦀', hp:1.3, atk:1.05, res:{fisico:20,fuego:0,hielo:-5,veneno:0,aturdimiento:10}, moves:['pegar'], frontline:true},
      {id:'sirena_corrupta', name:'Sirena corrupta', icon:'🧜', hp:0.8, atk:1.0, res:{fisico:-5,fuego:5,hielo:-5,veneno:5,aturdimiento:0}, moves:['pegar','confundir']}
    ],
    elite: [{id:'guardia_profundidades', name:'Guardia de las profundidades', icon:'🔱', hp:2.3, atk:1.45, res:{fisico:15,fuego:5,hielo:-10,veneno:5,aturdimiento:10}, moves:['pegar','aplastar'], elite:true, frontline:true}],
    guardians: [
      {id:'leviatan_menor', name:'Leviatán menor', icon:'🐋', hp:3.9, atk:1.6, res:{fisico:20,fuego:5,hielo:-10,veneno:10,aturdimiento:15}, moves:['pegar','aplastar'], boss:true, frontline:true},
      {id:'centinela_coral', name:'Centinela de coral', icon:'🪸', hp:3.7, atk:1.55, res:{fisico:25,fuego:5,hielo:-15,veneno:15,aturdimiento:15}, moves:['pegar','aplastar','debilitar'], boss:true, frontline:true}
    ],
    decadeBoss: {id:'storm_gush', name:'Storm Gush, Tetrasea el Señor de las Lágrimas', icon:'🔱', hp:5.4, atk:1.85, res:{fisico:25,fuego:5,hielo:-15,veneno:10,aturdimiento:20}, moves:['pegar','aplastar','debilitar'], boss:true, frontline:true}
  }
];

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
const RARITIES = {
  comun: {id:'comun', name:'Común', color:'#a3a3a3'},
  poco_comun: {id:'poco_comun', name:'Poco común', color:'#3ecf6e'},
  raro: {id:'raro', name:'Raro', color:'#8a7fd1'}, // mismo color que SOUL_TIER_COLORS.C — mismo escalón en la misma escala de letras
  rango_b: {id:'rango_b', name:'Rango B', color:'#c17fd1'},
  rango_a: {id:'rango_a', name:'Rango A', color:'#d1a84f'},
  legendario: {id:'legendario', name:'Legendario', color:'#d1594f'}, // mismo color que SOUL_TIER_COLORS.S
  ss: {id:'ss', name:'SS', color:'#e23c6b'} // mismo color que SOUL_TIER_COLORS.SS
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
function wTier(rank, value, specials){ return {rank, value, specials: specials||[]}; }

// Arma 1 de Mago y Sacerdote es EL MISMO pool (Vara arcana / Bastón rúnico)
// con los mismos números — se define una sola vez y ambas sendas la comparten,
// para que nunca puedan divergir por accidente.
const MAGO_ARMA1 = {
  'Vara arcana': [
    wTier('comun', 13),
    wTier('poco_comun', 18, [{type:'esp_refund', chance:0.05, amount:0.5, text:'de recuperar la mitad del espíritu gastado'}]),
    wTier('raro', 22, [{type:'esp_refund', chance:0.08, amount:0.5, text:'de recuperar la mitad del espíritu gastado'}]),
    wTier('rango_b', 26, [{type:'esp_refund', chance:0.12, amount:0.5, text:'de recuperar la mitad del espíritu gastado'}]),
    wTier('rango_a', 30, [{type:'esp_refund', chance:0.15, amount:0.5, text:'de recuperar la mitad del espíritu gastado'}]),
  ],
  'Bastón rúnico': [
    wTier('comun', 13),
    wTier('poco_comun', 18, [{type:'aumento_dano', value:0.05, text:'de aumento de daño'}]),
    wTier('raro', 22, [{type:'aumento_dano', value:0.08, text:'de aumento de daño'}]),
    wTier('rango_b', 26, [{type:'aumento_dano', value:0.10, text:'de aumento de daño'}]),
    wTier('rango_a', 30, [{type:'aumento_dano', value:0.13, text:'de aumento de daño'}]),
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
      ],
      'Maza de combate': [
        wTier('comun', 12),
        wTier('poco_comun', 19, [{type:'retroceso', chance:0.12, text:'de aplicar retroceso'}]),
        wTier('raro', 26, [{type:'retroceso', chance:0.18, text:'de aplicar retroceso'}]),
        wTier('rango_b', 30, [{type:'retroceso', chance:0.22, text:'de aplicar retroceso'}]),
        wTier('rango_a', 38, [{type:'retroceso', chance:0.18, text:'de aplicar retroceso'}, {type:'reduccion_dano', value:0.05, text:'de reducción de daño recibido'}]),
      ],
      'Espadón pesado': [
        wTier('comun', 12),
        wTier('poco_comun', 19, [{type:'bloqueo', chance:0.05, text:'de bloquear ataque'}]),
        wTier('raro', 26, [{type:'bloqueo', chance:0.09, text:'de bloquear ataque'}]),
        wTier('rango_b', 30, [{type:'bloqueo', chance:0.12, text:'de bloquear ataque'}]),
        wTier('rango_a', 37, [{type:'bloqueo', chance:0.12, text:'de bloquear ataque'}, {type:'reduccion_dano', value:0.05, text:'de reducción de daño recibido'}]),
      ],
    },
    arma2: {
      'Escudo de hierro': [
        wTier('comun', 0, [{type:'bloqueo', chance:0.10, text:'de bloquear ataque'}]),
        wTier('poco_comun', 0, [{type:'bloqueo', chance:0.12, text:'de bloquear ataque'}]),
        wTier('raro', 0, [{type:'bloqueo', chance:0.16, text:'de bloquear ataque'}]),
        wTier('rango_b', 0, [{type:'bloqueo', chance:0.18, text:'de bloquear ataque'}]),
        wTier('rango_a', 0, [{type:'bloqueo', chance:0.18, text:'de bloquear ataque'}, {type:'reflect', pct:0.10, text:'de devolver el daño recibido'}]),
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
      ],
      'Cuchillo largo': [
        wTier('comun', 10),
        wTier('poco_comun', 17, [{type:'sangrado', chance:0.05, text:'de aplicar sangrado 2 turnos'}]),
        wTier('raro', 22, [{type:'sangrado', chance:0.08, text:'de aplicar sangrado 2 turnos'}]),
        wTier('rango_b', 29, [{type:'sangrado', chance:0.12, text:'de aplicar sangrado 2 turnos'}]),
        wTier('rango_a', 34, [{type:'sangrado', chance:0.12, text:'de aplicar sangrado 2 turnos'}, {type:'silencio', chance:0.10, text:'de aplicar silencio al enemigo'}]),
      ],
    },
    arma2: {
      'Daga gemela': [
        wTier('comun', 10),
        wTier('poco_comun', 14, [{type:'sangrado', chance:0.12, text:'de aplicar sangrado 2 turnos'}]),
        wTier('raro', 19, [{type:'sangrado', chance:0.15, text:'de aplicar sangrado 2 turnos'}]),
        wTier('rango_b', 24, [{type:'sangrado', chance:0.20, text:'de aplicar sangrado 2 turnos'}]),
        wTier('rango_a', 29, [{type:'sangrado', chance:0.20, text:'de aplicar sangrado 2 turnos'}, {type:'succion_hechizo', percent:0.10, text:'succión de hechizo'}]),
      ],
      'Cuchillo gemelo': [
        wTier('comun', 10),
        wTier('poco_comun', 17, [{type:'sangrado', chance:0.05, text:'de aplicar sangrado 2 turnos'}]),
        wTier('raro', 22, [{type:'sangrado', chance:0.08, text:'de aplicar sangrado 2 turnos'}]),
        wTier('rango_b', 29, [{type:'sangrado', chance:0.12, text:'de aplicar sangrado 2 turnos'}]),
        wTier('rango_a', 34, [{type:'sangrado', chance:0.12, text:'de aplicar sangrado 2 turnos'}, {type:'silencio', chance:0.10, text:'de aplicar silencio al enemigo'}]),
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
      ],
      'Arco largo': [
        wTier('comun', 10),
        wTier('poco_comun', 18, [{type:'penetracion_armadura', value:0.10, text:'de penetración de armadura'}]),
        wTier('raro', 23, [{type:'penetracion_armadura', value:0.12, text:'de penetración de armadura'}]),
        wTier('rango_b', 29, [{type:'penetracion_armadura', value:0.15, text:'de penetración de armadura'}]),
        wTier('rango_a', 35, [{type:'penetracion_armadura', value:0.15, text:'de penetración de armadura'}, {type:'aumento_dano', value:0.05, text:'de aumento de daño'}]),
      ],
    },
    arma2: {
      'Carcaj de cuero': [
        wTier('comun', 10),
        wTier('poco_comun', 14, [{type:'robovida', percent:0.10, text:'de robo de vida'}]),
        wTier('raro', 18, [{type:'robovida', percent:0.12, text:'de robo de vida'}]),
        wTier('rango_b', 22, [{type:'robovida', percent:0.15, text:'de robo de vida'}]),
        wTier('rango_a', 26, [{type:'robovida', percent:0.15, text:'de robo de vida'}, {type:'segundo_ataque_basico', chance:0.10, text:'de realizar un segundo ataque básico'}]),
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
      ],
      'Tomo sagrado': [
        wTier('comun', 10),
        wTier('poco_comun', 15, [{type:'aumento_curacion', value:0.05, text:'de aumento de curación'}]),
        wTier('raro', 20, [{type:'aumento_curacion', value:0.08, text:'de aumento de curación'}]),
        wTier('rango_b', 24, [{type:'aumento_curacion', value:0.12, text:'de aumento de curación'}]),
        wTier('rango_a', 28, [{type:'aumento_curacion', value:0.12, text:'de aumento de curación'}, {type:'dano_aliado_curado', value:0.05, text:'de aumento de daño al aliado curado, por 2 turnos'}]),
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
const GEAR_RANK_ORDER = ['comun','poco_comun','raro','rango_b','rango_a'];
const GEAR_NAMES = {
  pesada: {
    casco:['Casco de piedra','Casco de bronce','Casco de plata','Casco de oro','Casco de platino'],
    armadura:['Placa de piedra','Placa de bronce','Placa de plata','Placa de oro','Placa de platino'],
    botas:['Grevas de piedra','Grevas de bronce','Grevas de plata','Grevas de oro','Grevas de platino'],
    guantes:['Manoplas de piedra','Manoplas de bronce','Manoplas de plata','Manoplas de oro','Manoplas de platino'],
    amuleto:['Talismán roto','Talismán','Talismán imbuido con magia','Talismán de sangre','Talismán despertado'],
  },
  doblefilo: {
    casco:['Máscara de piedra','Máscara de bronce','Máscara de plata','Máscara de oro','Máscara de platino'],
    armadura:['Manto de piedra','Manto de bronce','Manto de plata','Manto de oro','Manto de platino'],
    botas:['Zapatillas de piedra','Zapatillas de bronce','Zapatillas de plata','Zapatillas de oro','Zapatillas de platino'],
    guantes:['Zarpas de piedra','Zarpas de bronce','Zarpas de plata','Zarpas de oro','Zarpas de platino'],
    amuleto:['Anillo roto','Anillo','Anillo imbuido con magia','Anillo de sangre','Anillo despertado'],
  },
  tirador: {
    casco:['Capucha de piedra','Capucha de bronce','Capucha de plata','Capucha de oro','Capucha de platino'],
    armadura:['Cota de piedra','Cota de bronce','Cota de plata','Cota de oro','Cota de platino'],
    botas:['Botas de piedra','Botas de bronce','Botas de plata','Botas de oro','Botas de platino'],
    guantes:['Guantes de piedra','Guantes de bronce','Guantes de plata','Guantes de oro','Guantes de platino'],
    amuleto:['Amuleto roto','Amuleto','Amuleto imbuido con magia','Amuleto de sangre','Amuleto despertado'],
  },
  mago: {
    casco:['Diadema de piedra','Diadema de bronce','Diadema de plata','Diadema de oro','Diadema de platino'],
    armadura:['Túnica de piedra','Túnica de bronce','Túnica de plata','Túnica de oro','Túnica de platino'],
    botas:['Sandalias de piedra','Sandalias de bronce','Sandalias de plata','Sandalias de oro','Sandalias de platino'],
    guantes:['Mitones de piedra','Mitones de bronce','Mitones de plata','Mitones de oro','Mitones de platino'],
    amuleto:['Libro roto','Libro','Libro imbuido con magia','Libro de sangre','Libro despertado'],
  },
  // Sacerdote comparte los números de Mago (ambos escalan Habilidad) pero
  // con nombres propios — evité repetir "Libro" en el amuleto para que no
  // compita en nombre con el del Mago; le puse "Reliquia" en su lugar.
  sacerdote: {
    casco:['Corona de piedra','Corona de bronce','Corona de plata','Corona de oro','Corona de platino'],
    armadura:['Sotana de piedra','Sotana de bronce','Sotana de plata','Sotana de oro','Sotana de platino'],
    botas:['Alpargatas de piedra','Alpargatas de bronce','Alpargatas de plata','Alpargatas de oro','Alpargatas de platino'],
    guantes:['Vendas de piedra','Vendas de bronce','Vendas de plata','Vendas de oro','Vendas de platino'],
    amuleto:['Reliquia rota','Reliquia','Reliquia imbuida con fe','Reliquia de sangre','Reliquia despertada'],
  },
};
// Casco: vida máxima (flat, SIN el ×8 que sí aplica al viejo bonus.stat==
// 'maxhp' de Armadura — ver item.mods en derived()) + Precisión (nueva:
// contrarresta la evasión enemiga) + a rango A, aumento de daño.
const CASCO_TIERS = [
  {rank:'comun', mods:{maxhp_flat:15}},
  {rank:'poco_comun', mods:{maxhp_flat:20, precision:5}},
  {rank:'raro', mods:{maxhp_flat:25, precision:10}},
  {rank:'rango_b', mods:{maxhp_flat:30, precision:15}},
  {rank:'rango_a', mods:{maxhp_flat:35, precision:20}, specials:[{type:'aumento_dano', value:0.05, text:'de aumento de daño'}]},
];
// Armadura: resistencia física de siempre (mismo canal que raza/amuleto,
// dmgType 'fisico') + % de reducción de daño recibido + a rango A, bloqueo.
const ARMADURA_TIERS = [
  {rank:'comun', bonus:{res:'fisico', value:10}},
  {rank:'poco_comun', bonus:{res:'fisico', value:15}, specials:[{type:'reduccion_dano', value:0.05, text:'de reducción de daño recibido'}]},
  {rank:'raro', bonus:{res:'fisico', value:20}, specials:[{type:'reduccion_dano', value:0.08, text:'de reducción de daño recibido'}]},
  {rank:'rango_b', bonus:{res:'fisico', value:25}, specials:[{type:'reduccion_dano', value:0.12, text:'de reducción de daño recibido'}]},
  {rank:'rango_a', bonus:{res:'fisico', value:30}, specials:[{type:'reduccion_dano', value:0.12, text:'de reducción de daño recibido'},{type:'bloqueo', chance:0.05, text:'de bloquear ataque'}]},
];
// Botas: Resistencia mágica (canal nuevo, ver derived().resMagica — listo
// para cuando el bestiario tenga ataques elementales propios, todavía casi
// ningún enemigo pega distinto de físico) + resistencia a efectos de estado
// "físicos" (Sangrado/Debilitado/Parálisis/Ceguera/Ralentizado/Tambaleo -
// Miedo/Confusión son alteraciones MENTALES, esas las cubre el amuleto) + a
// rango A, evasión.
const BOTAS_TIERS = [
  {rank:'comun', mods:{res_magica:10}},
  {rank:'poco_comun', mods:{res_magica:15, resistencia_estado:5}},
  {rank:'raro', mods:{res_magica:20, resistencia_estado:8}},
  {rank:'rango_b', mods:{res_magica:25, resistencia_estado:12}},
  {rank:'rango_a', mods:{res_magica:30, resistencia_estado:12}, specials:[{type:'evasion_flat', value:0.05, text:'de evasión'}]},
];
// Amuleto/Accesorio: % Fortaleza mental (resiste Miedo/Confusión
// específicamente) + MP plano + a rango A, Espíritu plano también.
const AMULETO_TIERS = [
  {rank:'comun', mods:{fortaleza_mental:5}},
  {rank:'poco_comun', mods:{fortaleza_mental:8, mp_flat:5}},
  {rank:'raro', mods:{fortaleza_mental:12, mp_flat:10}},
  {rank:'rango_b', mods:{fortaleza_mental:15, mp_flat:15}},
  {rank:'rango_a', mods:{fortaleza_mental:18, mp_flat:15, espiritu_flat:5}},
];
// Guantes: la única pieza donde el stat de verdad cambia por senda. A rango
// A penetra la defensa contraria a su propio daño — física para
// Guerrero/Arquero, mágica para Asesino/Mago/Sacerdote (reusa
// 'penetracion_armadura' de las armas; 'penetracion_magica' es nuevo).
function guantesTiers(stat, penType, penText){
  return [
    {rank:'comun', bonus:{stat, value:5}},
    {rank:'poco_comun', bonus:{stat, value:8}, specials:[{type:'aumento_dano', value:0.05, text:'de aumento de daño'}]},
    {rank:'raro', bonus:{stat, value:12}, specials:[{type:'aumento_dano', value:0.08, text:'de aumento de daño'}]},
    {rank:'rango_b', bonus:{stat, value:16}, specials:[{type:'aumento_dano', value:0.12, text:'de aumento de daño'}]},
    {rank:'rango_a', bonus:{stat, value:20}, specials:[{type:'aumento_dano', value:0.12, text:'de aumento de daño'},{type:penType, value:0.05, text:penText}]},
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

// Objeto único (máx. 1 en mochila a la vez) que solo dropean los élites.
// Bloquea, gratis y sin gastar turno, el golpe que te mataría — pero solo
// reacciona ante el Ogro, el jefe final de las décadas (10, 20, 30...),
// nunca ante Hobgoblin/Gilgoblin ni ningún otro jefe intermedio.
const WARD_ITEM = {
  name: 'Tótem de Última Guardia',
  icon: '🧿',
  desc: 'Bloquea, una sola vez y sin gastar tu turno, el golpe que te mataría. Solo reacciona ante el jefe final de una década del laberinto (nivel 10, 20, 30...) — contra cualquier otro enemigo se mantiene inerte. Se pierde si mueres antes de usarlo.'
};
const WARD_DROP_CHANCE = 0.25;
function hasWard(){ return state.char.inventory.some(i=>i.kind==='ward'); }
function consumeWard(){
  const idx = state.char.inventory.findIndex(i=>i.kind==='ward');
  if(idx>=0) state.char.inventory.splice(idx,1);
}
// Antes solo reconocía al Ogro por id — con el bestiario de 6 décadas esto
// dejaba el Tótem sin efecto contra Matriarca Escarlata, Riakis, Usurpador,
// Custodio de la Isla y Storm Gush. Ahora cualquier jefe de década (nivel
// múltiplo de 10) cuenta, sea cual sea.
function fightingDecadeBoss(){
  return !!(combat && combat.active && state.dungeon && state.dungeon.level % 10 === 0 && combat.enemies.some(e=>e.tpl.boss));
}
function dealDamageToPlayer(amount){
  if(amount<=0) return;
  if(amount>=state.char.curHP && fightingDecadeBoss() && hasWard()){
    consumeWard();
    log(`<b>${WARD_ITEM.icon} ${WARD_ITEM.name}</b> bloquea el golpe que iba a matarte, y se desvanece.`);
    return;
  }
  state.char.curHP = Math.max(0, state.char.curHP - amount);
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
const AUTO_GEAR_TIER_LABEL = {raro:'Raro', rango_b:'Único', rango_a:'Épico'};
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
const SOUL_TIER_COLORS = {E:'#9a9a9a', F:'#6fae6f', D:'#4f9bd1', C:'#8a7fd1', B:'#c17fd1', A:'#d1a84f', S:'#d1594f', SS:'#e23c6b'};
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
// Nerfeadas a la mitad de sus valores originales (0.10/0.18+... y
// 0.005/0.006+...) a pedido explícito.
function soulFuriaBase(tier){ const idx=soulTierIdx(tier); return (idx===0 ? 0.10 : 0.18 + (idx-1)*0.001) * 0.5; }
function soulFuriaMissingScale(tier){ const idx=soulTierIdx(tier); return (idx===0 ? 0.005 : 0.006 + (idx-1)*0.001) * 0.5; }

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
  furia_e:     {id:'furia_e',     family:'furia',     name:'Piedra del Alma: Furia Contenida (E)',  tier:'E', icon:'🔥',
    special:{type:'lowhp_dmg_v2', threshold:0.3, base:0.05, missingScale:0.0025},
    desc:'Por debajo del 30% de vida: +5% de daño, y +0.25% adicional por cada 1% de vida que te falte.', preview:'Desde A: probabilidad de revivir una vez por entrada al laberinto (25% en A, 50% en S, 100% en SS).'},
  furia_f:     {id:'furia_f',     family:'furia',     name:'Piedra del Alma: Furia Contenida (F)',  tier:'F', icon:'🔥',
    special:{type:'lowhp_dmg_v2', threshold:0.3, base:0.09, missingScale:0.003},
    desc:'Por debajo del 30% de vida: +9% de daño, y +0.3% adicional por cada 1% de vida que te falte.', preview:'Desde A: probabilidad de revivir una vez por entrada al laberinto (25% en A, 50% en S, 100% en SS).'},
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

  furia_d:     {id:'furia_d',     family:'furia',     name:'Piedra del Alma: Furia Contenida (D)',  tier:'D', icon:'🔥',
    special:{type:'lowhp_dmg_v2', threshold:0.3, base:soulFuriaBase('D'), missingScale:soulFuriaMissingScale('D')},
    desc:'Por debajo del 30% de vida: +9.05% de daño, y +0.35% adicional por cada 1% de vida que te falte.', preview:'Desde A: probabilidad de revivir una vez por entrada al laberinto (pendiente de implementar).'},
  furia_c:     {id:'furia_c',     family:'furia',     name:'Piedra del Alma: Furia Contenida (C)',  tier:'C', icon:'🔥',
    special:{type:'lowhp_dmg_v2', threshold:0.3, base:soulFuriaBase('C'), missingScale:soulFuriaMissingScale('C')},
    desc:'Por debajo del 30% de vida: +9.1% de daño, y +0.4% adicional por cada 1% de vida que te falte.', preview:'Desde A: probabilidad de revivir una vez por entrada al laberinto (pendiente de implementar).'},
  furia_b:     {id:'furia_b',     family:'furia',     name:'Piedra del Alma: Furia Contenida (B)',  tier:'B', icon:'🔥',
    special:{type:'lowhp_dmg_v2', threshold:0.3, base:soulFuriaBase('B'), missingScale:soulFuriaMissingScale('B')},
    desc:'Por debajo del 30% de vida: +9.15% de daño, y +0.45% adicional por cada 1% de vida que te falte.', preview:'Desde A: probabilidad de revivir una vez por entrada al laberinto (pendiente de implementar).'},
  furia_a:     {id:'furia_a',     family:'furia',     name:'Piedra del Alma: Furia Contenida (A)',  tier:'A', icon:'🔥',
    special:{type:'lowhp_dmg_v2', threshold:0.3, base:soulFuriaBase('A'), missingScale:soulFuriaMissingScale('A')},
    desc:'Por debajo del 30% de vida: +9.2% de daño, y +0.5% adicional por cada 1% de vida que te falte. (Revivir una vez, prometido en este rango, todavía no está implementado.)'},

  sombra_d:    {id:'sombra_d',    family:'sombra',    name:'Piedra del Alma: Sombra Cazadora (D)',  tier:'D', icon:'🌑',
    special:{type:'evasion_flat', value:0.045},
    desc:'+4.5% de probabilidad de esquivar cualquier ataque.', preview:'Desde A: invocar una sombra que atrae el agro (pendiente de implementar).'},
  sombra_c:    {id:'sombra_c',    family:'sombra',    name:'Piedra del Alma: Sombra Cazadora (C)',  tier:'C', icon:'🌑',
    special:{type:'evasion_flat', value:0.06},
    desc:'+6% de probabilidad de esquivar cualquier ataque.', preview:'Desde A: invocar una sombra que atrae el agro (pendiente de implementar).'},
  sombra_b:    {id:'sombra_b',    family:'sombra',    name:'Piedra del Alma: Sombra Cazadora (B)',  tier:'B', icon:'🌑',
    special:{type:'evasion_flat', value:0.08},
    desc:'+8% de probabilidad de esquivar cualquier ataque.', preview:'Desde A: invocar una sombra que atrae el agro (pendiente de implementar).'},
  sombra_a:    {id:'sombra_a',    family:'sombra',    name:'Piedra del Alma: Sombra Cazadora (A)',  tier:'A', icon:'🌑',
    special:{type:'evasion_flat', value:0.10},
    desc:'+10% de probabilidad de esquivar cualquier ataque. (Invocar una sombra, prometido en este rango, todavía no está implementado.)'},

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

  furia_s:     {id:'furia_s',     family:'furia',     name:'Piedra del Alma: Furia Contenida (S)',  tier:'S', icon:'🔥',
    special:{type:'lowhp_dmg_v2', threshold:0.3, base:soulFuriaBase('S'), missingScale:soulFuriaMissingScale('S')},
    desc:'Por debajo del 30% de vida: +9.25% de daño, y +0.55% adicional por cada 1% de vida que te falte.'},
  furia_ss:    {id:'furia_ss',    family:'furia',     name:'Piedra del Alma: Furia Contenida (SS)', tier:'SS', icon:'🔥',
    special:{type:'lowhp_dmg_v2', threshold:0.3, base:soulFuriaBase('SS'), missingScale:soulFuriaMissingScale('SS')},
    desc:'Por debajo del 30% de vida: +9.3% de daño, y +0.6% adicional por cada 1% de vida que te falte.'},

  sombra_s:    {id:'sombra_s',    family:'sombra',    name:'Piedra del Alma: Sombra Cazadora (S)',  tier:'S', icon:'🌑',
    special:{type:'evasion_flat', value:0.12},
    desc:'+12% de probabilidad de esquivar cualquier ataque.'},
  sombra_ss:   {id:'sombra_ss',   family:'sombra',    name:'Piedra del Alma: Sombra Cazadora (SS)', tier:'SS', icon:'🌑',
    special:{type:'evasion_flat', value:0.14},
    desc:'+14% de probabilidad de esquivar cualquier ataque.'}
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
      soulSlots:[] // piedras de alma engarzadas; se desbloquea 1 espacio cada 10 niveles
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
  maxHP += equipModsSum(eq, 'maxhp_flat');
  maxSta += equipModsSum(eq, 'mp_flat');
  maxSpi += equipModsSum(eq, 'espiritu_flat');
  const fortalezaMentalPct = equipModsSum(eq, 'fortaleza_mental');
  // Fortaleza mental (Accesorio) ahora también aporta un poco a Resistencia
  // mágica (pedido explícito: "separarlas, pero que fortaleza mental
  // también aumente un poco resistencia mágica") — a una fracción de lo que
  // aporta Botas, para que Botas siga siendo la fuente principal.
  const FORTALEZA_MENTAL_TO_RES_MAGICA = 0.4;
  const resMagica = clamp(equipModsSum(eq, 'res_magica') + fortalezaMentalPct*FORTALEZA_MENTAL_TO_RES_MAGICA, -60, 80);
  const fortalezaMental = clamp(fortalezaMentalPct/100, 0, 0.9);
  const resistenciaEstado = clamp(equipModsSum(eq, 'resistencia_estado')/100, 0, 0.9);
  // Precisión y Penetración: además de lo que dé el equipo, crecen solas
  // con el nivel (pedido explícito) — sin nada de equipo, un nivel 60 ya
  // trae ~9% de Precisión "de fábrica".
  const PRECISION_PER_LEVEL = 0.0015, PENETRACION_PER_LEVEL = 0.001;
  const precision = clamp(equipModsSum(eq, 'precision')/100 + state.char.level*PRECISION_PER_LEVEL, 0, 0.9);
  const penetracionNivel = state.char.level*PENETRACION_PER_LEVEL;
  const critChance = clamp(0.05 + hab*0.006 + (race().id==='bestia'?0.15:0), 0, 0.6);
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
    if(s.special && s.special.type==='evasion_flat') evasionBase += s.special.value;
  });
  specialsFromEquip(eq).forEach(sp=>{
    if(sp.type==='evasion_flat') evasionBase += sp.value;
  });
  return {fis,esp,hab,maxHP,maxSta,maxSpi,critChance,evasionBase,resMagica,fortalezaMental,resistenciaEstado,precision,penetracionNivel};
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

function rowToState(row){
  return {
    char:{
      id: row.id, slotNumber: row.slot_number, nickname: row.nickname,
      role: row.role, hiddenFromLeaderboard: row.hidden_from_leaderboard,
      race: row.race, style: row.style,
      level: row.level, xp: row.xp, gold: row.gold, missionCurrency: row.mission_currency || 0,
      missionRerollCycle: row.mission_reroll_cycle || null, missionRerollCount: row.mission_reroll_count || 0,
      curHP: row.cur_hp, curSta: row.cur_sta, curSpi: row.cur_spi,
      equip: row.equip || {arma:null, arma2:null, armadura:null, amuleto:null, casco:null, botas:null, guantes:null},
      inventory: (row.inventory || []).map(refreshStoneFromTemplate),
      itemCounter: row.item_counter || 0,
      maxLevelUnlocked: row.max_level_unlocked || 1,
      checkpointLevel: row.checkpoint_level || 1,
      record: {level: row.record_level || 1, floorIdx: row.record_floor_idx || 0},
      stash: row.stash || {gold:0, items:[]},
      soulSlots: (row.soul_slots || []).map(refreshStoneFromTemplate),
      pityGear: row.pity_gear || 0,
      pityStone: row.pity_stone || 0,
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
function eliteXP(level){ return level+1; }    // élites: siempre mob+1
function guardianXP(level){ return 2*level+2; } // guardianes: 2×mob+2
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
  const hpPct = clamp(state.char.curHP/d.maxHP*100,0,100);
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
    return `<div class="equip-row"><span>${label}</span><b style="color:${color};">${it.name}</b></div>`;
  }).join('');

  const potionCount = (state.char.inventory||[]).filter(i=>i.kind==='potion').reduce((a,i)=>a+i.qty,0);
  const gearCount = (state.char.inventory||[]).filter(i=>i.kind==='equip').length;
  const stunChance = totalStunChance();

  document.getElementById('sheet').innerHTML = `
    <div class="sheet-title">
      <div class="sheet-emblem">${r.icon}</div>
      <div>
        <div class="name">${state.char.nickname} · ${r.name} · ${s.icon} ${s.name}</div>
        <div class="tag">Nivel ${state.char.level}</div>
      </div>
    </div>

    <div class="bar-row">
      <div class="bar-label"><span>Vida</span><span>${state.char.curHP} / ${d.maxHP}</span></div>
      <div class="bar-track"><div class="bar-fill hp" style="width:${hpPct}%"></div></div>
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
    <div class="sheet-hint">Evasión mostrada fuera de combate; en combate sube +8% en Retaguardia. Aturdir al golpear depende del arma y las piedras de alma que lleves equipadas.</div>

    <div class="section-label">Resistencias</div>
    <div class="res-list">${resHTML}</div>

    <div class="section-label">Equipo</div>
    ${equipHTML}
    <div class="sheet-hint">${gearCount} objeto(s) y ${potionCount} poción(es) en la mochila. <button id="sheet-inv-link">Abrir inventario</button></div>
    <div class="sheet-hint">Espacios de alma: ${socketedStones().length}/${maxSoulSlots(state.char.level)}${maxSoulSlots(state.char.level)===0 ? ' (el primero se desbloquea en nivel 10)' : ''}.</div>

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
function itemNameHTML(it){
  const r = RARITIES[it.rarity||'comun'];
  // Las armas y el equipo general comprados/generados para una senda
  // específica (Guerrero/Asesino/Arquero/Mago/Sacerdote) llevan su
  // etiqueta aquí — el equipo de botín/cofres sí puede venir sin styleId
  // en casos viejos, en cuyo caso no se muestra ninguna etiqueta.
  const roleTag = it.styleId ? ` <span class="slot-tag" style="border-color:var(--bronze); color:var(--bronze-light);">${SHOP_ROLE_LABELS[it.styleId]||it.styleId}</span>` : '';
  return `<b style="color:${r.color};">${it.name}</b> <span class="slot-tag" style="border-color:${r.color}; color:${r.color};">${r.name}</span>${roleTag}`;
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
      <div class="inv-item-row" style="margin-bottom:0;">
        <div>
          ${itemNameHTML(it)}
          <div class="inv-item-bonus">${itemBonusText(it)}</div>
        </div>
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
      <div class="inv-item-row">
        <div>
          ${itemNameHTML(it)}
          <div class="inv-item-bonus">${itemBonusText(it)}</div>
        </div>
        <button class="inv-btn" data-equip="${it.uid}">Equipar en ${targetName}</button>
      </div>
    `).join('');
    return `<div class="section-label" style="margin-top:6px; font-size:0.85em;">${slotLabel(slot)}</div>${rows}`;
  }).join('') : `<p class="inv-empty-msg">No llevas equipo suelto en la mochila.</p>`;

  const potionHTML = potionItems.length ? potionItems.map(it=>{
    const tpl = POTION_TEMPLATES[it.potionId];
    return `<div class="inv-item-row">
      <div>
        <b>${tpl.icon} ${tpl.name}</b> <span class="slot-tag">x${it.qty}</span>
        <div class="inv-item-bonus neutral">${tpl.desc}</div>
      </div>
      <button class="inv-btn" data-usepotion="${it.potionId}">Usar</button>
    </div>`;
  }).join('') : `<p class="inv-empty-msg">No tienes pociones. Búscalas en cofres del laberinto.</p>`;

  ensureSoulSlots();
  const soulSlotsHTML = state.char.soulSlots.length ? state.char.soulSlots.map((stone, idx)=>{
    if(!stone){
      return `<div class="inv-slot">
        <div class="inv-slot-label">Espacio de alma ${idx+1}</div>
        <div class="inv-empty">— vacío —</div>
      </div>`;
    }
    const c = SOUL_TIER_COLORS[stone.tier] || 'var(--text)';
    return `<div class="inv-slot">
      <div class="inv-slot-label">Espacio de alma ${idx+1}</div>
      <div class="inv-item-row" style="margin-bottom:0;">
        <div>
          <b style="color:${c};">${stone.name}</b> <span class="slot-tag" style="border-color:${c}; color:${c};">${stone.tier}</span>
          <div class="inv-item-bonus">${stone.desc}</div>
        </div>
        <button class="inv-btn danger" data-unsocket="${idx}">Retirar</button>
      </div>
    </div>`;
  }).join('') : `<p class="inv-empty-msg">Alcanza el nivel 10 para desbloquear tu primer espacio de alma.</p>`;

  const stoneItems = state.char.inventory.filter(i=>i.kind==='soulstone');
  const stoneBagHTML = stoneItems.length ? stoneItems.map(it=>{
    const c = SOUL_TIER_COLORS[it.tier] || 'var(--text)';
    const sameFamily = state.char.soulSlots.find(s=>s && s.family===it.family);
    const noRoom = state.char.soulSlots.length===0 || state.char.soulSlots.every(s=>s);
    const blocked = sameFamily ? soulTierIdx(it.tier) < soulTierIdx(sameFamily.tier) : noRoom;
    const btnLabel = sameFamily ? 'Reemplazar' : 'Engarzar';
    return `<div class="inv-item-row">
      <div>
        <b style="color:${c};">${it.name}</b> <span class="slot-tag" style="border-color:${c}; color:${c};">${it.tier}</span>
        <div class="inv-item-bonus">${it.desc}</div>
      </div>
      <button class="inv-btn" data-socket="${it.uid}" ${blocked?'disabled':''}>${btnLabel}</button>
    </div>`;
  }).join('') : `<p class="inv-empty-msg">No tienes piedras de alma. Las dejan caer los guardianes de nivel 4 en adelante.</p>`;

  const totemHolders = [];
  if(hasWard()) totemHolders.push('Tú');
  allies.forEach(a=>{ if(a.has_totem) totemHolders.push(a.name); });
  const wardHTML = totemHolders.length
    ? `<div class="inv-item-row">
        <div>
          <b>${WARD_ITEM.icon} ${WARD_ITEM.name}</b> <span class="slot-tag">${totemHolders.join(', ')}</span>
          <div class="inv-item-bonus neutral">${WARD_ITEM.desc} Cada personaje del equipo puede llevar el suyo propio.</div>
        </div>
      </div>`
    : `<p class="inv-empty-msg">Nadie en tu equipo lleva un tótem protector todavía. Los élites pueden dejarlo caer, para cualquiera de ustedes.</p>`;

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

    <div class="section-label">Reliquias</div>
    ${wardHTML}
  `;

  document.getElementById('btn-close-inv').onclick = ()=>{ invOpen=false; renderAll(); };
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
}

function addToInventory(item){
  if(item.kind==='potion'){
    const existing = state.char.inventory.find(i=>i.kind==='potion' && i.potionId===item.potionId);
    if(existing) existing.qty += 1;
    else state.char.inventory.push({kind:'potion', potionId:item.potionId, qty:1});
  } else if(item.kind==='soulstone'){
    state.char.itemCounter = (state.char.itemCounter||0) + 1;
    item.uid = 'it'+state.char.itemCounter;
    state.char.inventory.push(item);
  } else if(item.kind==='ward'){
    if(!hasWard()) state.char.inventory.push({kind:'ward'});
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
        <h3>Descansar</h3>
        <p>Recupera toda tu vida, MP y espíritu antes de partir.</p>
        <button id="btn-rest-city">Descansar</button>
      </div>
      <div class="action-card">
        <h3>Entrar al laberinto</h3>
        <p>${state.char.checkpointLevel>1
          ? `Ya liberaste un checkpoint en el nivel ${state.char.checkpointLevel} (venciste al jefe del piso ${state.char.checkpointLevel-1}). Puedes reanudar ahí o volver a empezar desde el nivel 1.`
          : 'Siempre se entra desde el nivel 1, piso 1.'}</p>
        <button id="btn-enter-dungeon" data-level="1">Entrar (Nivel 1)</button>
        ${state.char.checkpointLevel>1 ? `<button id="btn-enter-checkpoint" data-level="${state.char.checkpointLevel}" style="margin-top:6px;">Entrar desde el checkpoint (Nivel ${state.char.checkpointLevel})</button>` : ''}
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
    </div>
    <div class="section-label">Antes de partir</div>
    <p style="color:var(--text-dim); font-size:0.85em; margin-top:0;">Revisa tu 🎒 Inventario (arriba) para equipar mejor equipo o comprobar cuántas pociones llevas antes de entrar al laberinto. Si mueres dentro perderás el equipo suelto de tu mochila y el ${DEFEAT_GOLD_LOSS_PCT}% de tu oro; si te retiras tras vencer a un guardián, conservas todo.</p>
  `;
  document.getElementById('btn-rest-city').onclick = ()=>{
    const d = derived();
    state.char.curHP = d.maxHP; state.char.curSta = d.maxSta; state.char.curSpi = d.maxSpi;
    log('Descansas en la ciudad. Vida, MP y espíritu restaurados.');
    renderSheet(); save();
  };
  const enterDungeonAt = (startLevel)=>{
    showOverlay(
      'Antes de entrar',
      `Una vez dentro no podrás retirarte hasta vencer al guardián del nivel o caer en el intento. Si mueres, pierdes el equipo suelto que llevas en la mochila y el ${DEFEAT_GOLD_LOSS_PCT}% de tu oro — lo que ya tienes equipado y lo que guardaste en el Hogar está a salvo.`,
      ()=>{
        stopLoginAudio();
        const d = derived();
        state.char.curHP = d.maxHP; state.char.curSta = d.maxSta; state.char.curSpi = d.maxSpi;
        state.dungeon = generateDungeon(startLevel);
        log(startLevel>1
          ? `Entras al laberinto desde tu checkpoint, nivel ${startLevel}. El aire cambia; algo respira ahí dentro.`
          : 'Entras al laberinto desde el nivel 1. El aire cambia; algo respira ahí dentro.');
        renderAll(); save();
      }
    );
  };
  document.getElementById('btn-enter-dungeon').onclick = ()=> enterDungeonAt(1);
  const btnCheckpoint = document.getElementById('btn-enter-checkpoint');
  if(btnCheckpoint) btnCheckpoint.onclick = ()=> enterDungeonAt(state.char.checkpointLevel);
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
}

/* ============================================================
   MISIONES — Gremio
   ============================================================ */
// Banda de rango por piso más profundo desbloqueado (max_level_unlocked),
// NO por nivel de personaje — igual patrón de década que dificultad/sendas.
// Hoy el laberinto topa en piso 10, así que en la práctica todos caen en la
// banda 0 (E/F) hasta que se liberen los 100 niveles.
function missionBandForFloor(floor){
  if(floor<=20) return 0;
  if(floor<=40) return 1;
  if(floor<=60) return 2;
  if(floor<=80) return 3;
  return 4;
}
const MISSION_BAND_RANKS = [['E','F'],['D','C'],['B','A'],['S'],['SS']];
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
// La rareza que puede tocar ahora depende de tu nivel de personaje real (los
// rangos altos siguen gateados por GEAR_TIER_MIN_LEVEL/STONE_TIER_MIN_LEVEL),
// no de un nivel de referencia por banda.
// Las piedras de alma ya no pueden venir de una misión - solo las entrega un
// jefe de década o (a futuro) un jefe de Rift, a pedido explícito. El rango
// de objeto que sí puede tocar sigue limitado a A (ver refresh_and_insert_missions/
// reroll_mission en Supabase, que ya rechazan tier S/SS del lado del servidor).
function makeMissionItemReward(band){
  return generateLoot(rnd(1,4), state.char.level);
}

function generateMissionBatch(maxFloor){
  const frontier = missionBandForFloor(maxFloor);
  const bands = [];
  for(let i=0;i<2;i++) bands.push(Math.max(0, frontier-2)); // fácil
  for(let i=0;i<6;i++) bands.push(Math.max(0, frontier-1)); // núcleo
  for(let i=0;i<2;i++) bands.push(frontier);                // reto
  return bands.map((band, idx)=>{
    const rank = pick(MISSION_BAND_RANKS[band]);
    const objectiveType = pick(MISSION_OBJECTIVE_TYPES);
    const reward = MISSION_RANK_REWARD[rank];
    return {
      rank,
      objective_type: objectiveType,
      objective_target: MISSION_OBJECTIVE_TARGET[objectiveType][rank],
      reward_gold: reward.gold,
      reward_xp: reward.xp,
      reward_currency: reward.currency,
      reward_item: idx===9 ? makeMissionItemReward(band) : null // solo 1 de las 10 trae objeto/piedra fija
    };
  });
}

// Genera UNA misión candidata para un refresco individual — usa la misma
// distribución de bandas que el tablón completo (20% fácil, 60% núcleo, 20%
// reto), pero nunca trae objeto/piedra fija: el "1 de 10 con recompensa fija"
// se decide solo al armar el tablón completo, no en cada refresco suelto.
function generateSingleMission(maxFloor){
  const frontier = missionBandForFloor(maxFloor);
  const roll = Math.random();
  const band = roll < 0.2 ? Math.max(0, frontier-2) : roll < 0.8 ? Math.max(0, frontier-1) : frontier;
  const rank = pick(MISSION_BAND_RANKS[band]);
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
  return data || [];
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
        <b>${tpl.icon||'⚔️'} ${a.name}</b> <span class="slot-tag">${a.role} · nivel ${a.level}</span>${a.has_totem ? ` <span class="slot-tag">${WARD_ITEM.icon} Tótem</span>` : ''} <span class="slot-tag" style="border-color:${satColor}; color:${satColor};">Satisfacción ${satisfaction}%</span>
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
    supabase.from('characters').select('id, user_id, nickname, role, hidden_from_leaderboard, level, record_level, record_floor_idx').order('slot_number')
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
    return `<div class="inv-item-row">
      <div>
        <b>${name}</b> ${rankTag} <span class="slot-tag" style="border-color:var(--bronze); color:var(--bronze-light);">${SHOP_ROLE_LABELS[shopWeaponRole]||shopWeaponRole}</span>
        <div class="inv-item-bonus">${itemBonusText(preview)}</div>
      </div>
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
    return `<div class="inv-item-row">
      <div>
        <b>${preview.name}</b>${rankTag}
        <div class="inv-item-bonus">${itemBonusText(preview)}</div>
      </div>
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
      const r = RARITIES[rarity];
      const disabled = (state.char.missionCurrency||0) < price;
      if(slot==='arma'){
        const cat = WEAPON_CATALOG[shopWeaponRole];
        if(!cat) return '';
        return Object.keys(cat.arma).map(name=>{
          const preview = makeWeaponItem('arma', shopWeaponRole, rarity, name);
          if(!preview) return '';
          return `<div class="inv-item-row">
            <div>
              <b>${name}</b> <span class="slot-tag" style="border-color:${r.color}; color:${r.color};">${r.name}</span> <span class="slot-tag" style="border-color:var(--bronze); color:var(--bronze-light);">${SHOP_ROLE_LABELS[shopWeaponRole]||shopWeaponRole}</span>
              <div class="inv-item-bonus">${itemBonusText(preview)}</div>
            </div>
            <button class="inv-btn" data-buy-sello="arma|${rarity}|${name}" ${disabled?'disabled':''}>Comprar (${price} Sellos)</button>
          </div>`;
        }).join('');
      }
      const preview = makeGearItem(slot, shopWeaponRole, rarity);
      if(!preview) return '';
      return `<div class="inv-item-row">
        <div>
          <b>${preview.name}</b> <span class="slot-tag" style="border-color:${r.color}; color:${r.color};">${r.name}</span>
          <div class="inv-item-bonus">${itemBonusText(preview)}</div>
        </div>
        <button class="inv-btn" data-buy-sello="${slot}|${rarity}" ${disabled?'disabled':''}>Comprar (${price} Sellos)</button>
      </div>`;
    }).join('');
  }).join('');

  const potionHTML = Object.values(POTION_TEMPLATES).filter(t=>SHOP_POTION_PRICES[t.id]).map(t=>{
    const price = SHOP_POTION_PRICES[t.id];
    return `<div class="inv-item-row">
      <div><b>${t.icon} ${t.name}</b>
        <div class="inv-item-bonus neutral">${t.desc}</div>
      </div>
      <button class="inv-btn" data-buy-potion="${t.id}" ${state.char.gold<price?'disabled':''}>Comprar (${price} oro)</button>
    </div>`;
  }).join('');

  const sellGear = state.char.inventory.filter(i=>i.kind==='equip');
  const sellPotions = state.char.inventory.filter(i=>i.kind==='potion');
  const sellStones = state.char.inventory.filter(i=>i.kind==='soulstone');
  const sellRows = [
    ...sellGear.map(it=>`<div class="inv-item-row">
      <div><b>${it.name}</b> <span class="slot-tag">${slotLabel(it.slot)}</span>
        <div class="inv-item-bonus">${itemBonusText(it)}</div>
      </div>
      <button class="inv-btn" data-sell="${it.uid}">Vender (${itemSellValue(it)} oro)</button>
    </div>`),
    ...sellPotions.map(it=>`<div class="inv-item-row">
      <div><b>${POTION_TEMPLATES[it.potionId].icon} ${POTION_TEMPLATES[it.potionId].name}</b> <span class="slot-tag">x${it.qty}</span></div>
      <button class="inv-btn" data-sell-potion="${it.potionId}">Vender 1 (${itemSellValue(it)} oro)</button>
    </div>`),
    ...sellStones.map(it=>{
      const c = SOUL_TIER_COLORS[it.tier] || 'var(--text)';
      return `<div class="inv-item-row">
        <div><b style="color:${c};">${it.name}</b> <span class="slot-tag" style="border-color:${c}; color:${c};">${it.tier}</span></div>
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
    <div class="inv-item-row">
      <div>${itemNameHTML(it)} <span class="slot-tag">${slotLabel(it.slot)}</span>
        <div class="inv-item-bonus">${itemBonusText(it)}</div>
      </div>
      <button class="inv-btn" data-stash-gear="${it.uid}">Guardar en Hogar</button>
    </div>`).join('') : `<p class="inv-empty-msg">No llevas equipo suelto contigo.</p>`;

  const bagPotionHTML = potionItems.length ? potionItems.map(it=>{
    const tpl = POTION_TEMPLATES[it.potionId];
    return `<div class="inv-item-row">
      <div><b>${tpl.icon} ${tpl.name}</b> <span class="slot-tag">x${it.qty}</span></div>
      <button class="inv-btn" data-stash-potion="${it.potionId}">Guardar 1</button>
    </div>`;
  }).join('') : `<p class="inv-empty-msg">No llevas pociones contigo.</p>`;

  const stashGearHTML = stashGear.length ? stashGear.map(it=>`
    <div class="inv-item-row">
      <div>${itemNameHTML(it)} <span class="slot-tag">${slotLabel(it.slot)}</span>
        <div class="inv-item-bonus">${itemBonusText(it)}</div>
      </div>
      <button class="inv-btn" data-retrieve-gear="${it.uid}">Retirar</button>
    </div>`).join('') : `<p class="inv-empty-msg">El Hogar no guarda equipo todavía.</p>`;

  const stashPotionHTML = stashPotions.length ? stashPotions.map(it=>{
    const tpl = POTION_TEMPLATES[it.potionId];
    return `<div class="inv-item-row">
      <div><b>${tpl.icon} ${tpl.name}</b> <span class="slot-tag">x${it.qty}</span></div>
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
    let templates, count;
    if(node.type==='jefe'){
      if(isDecadeFinal){
        templates = [bestiary.decadeBoss];
        count = 1;
      } else if(paraiso){
        // Isla Paraíso: sin guardianes intermedios — el "jefe" de los niveles
        // que no cierran la década es solo un combate más duro, no un
        // encuentro único.
        templates = bestiary.regular.concat(bestiary.elite);
        count = rnd(2,3);
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
    for(let i=0;i<count;i++) group.push(makeEnemy(pick(templates), f, dg.level));
    if(node.type==='jefe' && isDecadeFinal && paraiso){
      // el jefe de Isla Paraíso llega escoltado por dos élites en el frente
      // mientras él se queda atrás.
      group.push(makeEnemy(bestiary.elite[0], f, dg.level));
      group.push(makeEnemy(bestiary.elite[0], f, dg.level));
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
      const item = generateLoot(f, state.char.level);
      if(item){
        addToInventory(item);
        msg += item.kind==='potion'
          ? ` También hallas: <b>${POTION_TEMPLATES[item.potionId].name}</b> (guardada en la mochila).`
          : ` También hallas: <b>${item.name}</b> (guardado en la mochila).`;
        if(item.kind==='equip') advanceMissionsFor('find_equipment', 1);
      }
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
// probabilidad fija, independiente del piso/década (reemplaza la vieja tabla
// por banda). Se revisa de más raro a más común, cada uno un chance()
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
// Nivel mínimo de personaje para que un rango pueda caer — Épico y superior
// necesitan haber avanzado de verdad; C/B piden haber pasado la primera
// década (piso 11+); todo lo demás (E-D) no tiene tope. El jefe de década
// del piso 10 es la única excepción a C/B (ver bypassTiers en handleVictory):
// es el primer vistazo a esos rangos, incluso para un personaje que llega
// ahí todavía por debajo del nivel 11.
const GEAR_TIER_MIN_LEVEL = {rango_a:21, legendario:31, ss:41, rango_b:11, raro:11};
const STONE_TIER_MIN_LEVEL = {A:21, S:31, SS:41, B:11, C:11};
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
  const rarity = rollFlatRarity(FLAT_GEAR_TABLE, GEAR_TIER_MIN_LEVEL, level, bypassTiers, state.char.pityGear||0, GEAR_PITY_TIERS);
  if(!rarity) return null;
  return generateEquipOfRarity(rarity, floorIdx);
}
function rollStoneDropForLevel(level, bypassTiers){
  const tier = rollFlatRarity(FLAT_STONE_TABLE, STONE_TIER_MIN_LEVEL, level, bypassTiers, state.char.pityStone||0, STONE_PITY_TIERS);
  if(!tier) return null;
  const pool = Object.values(SOUL_STONES).filter(s=>s.tier===tier);
  const tpl = pick(pool);
  return {kind:'soulstone', stoneId:tpl.id, family:tpl.family, name:tpl.name, tier:tpl.tier, icon:tpl.icon, desc:tpl.desc, preview:tpl.preview, bonus:tpl.bonus, special:tpl.special};
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
    // El ataque no cambia: sigue con lvlMult, igual que siempre.
    hp = Math.round(rnd(125,135) * tpl.hp * floorMult * eliteHPMult(level||1));
    atk = Math.round(16 * tpl.atk * floorMult * lvlMult);
  } else {
    // regular mob: 2026-09-16, pedido explícito — además del piso de 40-50 a
    // 55-65, la curva de vida usa regularHPMult (no lvlMult) para llegar a
    // ~500-600 en nivel 20, ~1200-1300 en 40, ~1700-1800 en 60. El ataque no
    // cambia: sigue con lvlMult, igual que siempre.
    hp = Math.round(rnd(55,65) * tpl.hp * floorMult * regularHPMult(level||1));
    atk = Math.round(9 * tpl.atk * floorMult * lvlMult);
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
// intercepta a él (como un tanque real); si no, va directo al jugador. El
// jugador nunca se pone "en el frente del grupo" en el sentido de bloquear —
// su Frente/Retaguardia sigue siendo su propia postura de siempre.
function frontlineTarget(){
  const tank = livingAllies().find(a=>a.pos==='frente');
  if(tank) return {kind:'ally', ally:tank};
  return {kind:'player'};
}
function dealDamageToAlly(ally, amount){
  if(amount<=0) return;
  if(amount>=ally.hp && fightingDecadeBoss() && ally.hasTotem){
    ally.hasTotem = false;
    clearAllyTotem(ally.id);
    log(`<b>${WARD_ITEM.icon} ${WARD_ITEM.name}</b> de ${ally.name} bloquea el golpe que iba a matarlo, y se desvanece.`);
    return;
  }
  ally.hp = Math.max(0, ally.hp - amount);
}
function grantAllyTotem(row){
  row.has_totem = true;
  const combatAlly = combat && combat.allies ? combat.allies.find(a=>a.id===row.id) : null;
  if(combatAlly) combatAlly.hasTotem = true;
  supabase.from('character_allies').update({has_totem:true}).eq('id', row.id).then(({error})=>{
    if(error) console.error('No se pudo guardar el Tótem del aliado:', error.message);
  });
  log(`<b>${row.name}</b> encuentra un <b>${WARD_ITEM.icon} ${WARD_ITEM.name}</b>.`);
}
function clearAllyTotem(allyId){
  const row = (state.char.allies||[]).find(r=>r.id===allyId);
  if(row) row.has_totem = false;
  supabase.from('character_allies').update({has_totem:false}).eq('id', allyId).then(({error})=>{
    if(error) console.error('No se pudo actualizar el Tótem del aliado:', error.message);
  });
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
// Vida máxima de un aliado a partir de su fila (nivel + equipo) - extraído de
// makeCombatAlly() para que la hoguera de descanso (que cura a todo el
// equipo sin que haya combate de por medio) calcule el mismo número, en vez
// de reimplementar la fórmula por separado y arriesgarse a que diverjan.
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
  return maxHP;
}
// MP y Espíritu de un aliado: mismo pool de nivel para los dos, más lo que
// sume el Amuleto/Accesorio (mp_flat/espiritu_flat, ver GEAR_CATALOG).
function allyMaxMP(row){ return Math.round(30 + (row.level||1)*5) + equipModsSum(row.equip||{}, 'mp_flat'); }
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
  ALLY_EQUIP_SLOTS.forEach(slot=>{
    const it = equip[slot];
    if(!it || !it.bonus) return;
    if(it.bonus.stat==='maxhp') return; // ya sumado en allyMaxHP()
    else if(it.bonus.stat) atk += it.bonus.value; // arma/casco/botas/guantes: bono plano al ataque, más simple que el modelo de stats del jugador
    else if(it.bonus.res) res[it.bonus.res] = (res[it.bonus.res]||0) + it.bonus.value;
  });
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
  // Specials del arma/arma2 equipadas — mismo formato que el jugador (ver
  // specialsFromEquip), leídos una sola vez acá para no recalcularlos cada
  // turno de combate.
  const specials = specialsFromEquip(equip);
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
    maxHP, hp, maxMP, mp, maxSpirit, spirit, atk, statuses:[], skillCooldown: 1, // 1: no usan su habilidad en el primer turno
    hasTotem: !!row.has_totem,
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
function healMultiplierFor(statuses){
  const c = hasStatus(statuses, 'Corrosion');
  return c ? c.healMult : 1;
}

function hasStatus(list, name){ return list.find(s=>s.name===name); }
function removeStatus(list, name){
  const idx = list.findIndex(s=>s.name===name);
  if(idx>=0) list.splice(idx,1);
}

function frontEnemyIndex(){
  for(let i=0;i<combat.enemies.length;i++) if(combat.enemies[i].hp>0) return i;
  return -1;
}
function livingEnemies(){ return combat.enemies.filter(e=>e.hp>0); }

function computeCritEvasion(){
  const d = derived();
  let ev = d.evasionBase + (combat.playerPos==='retaguardia'?0.08:0);
  // Brecha de nivel: un monstruo de más nivel que el jugador también es más
  // difícil de esquivar (mismo número que usa el jugador para esquivarlo A
  // ÉL, restado en vez de sumado — ver levelGapEvasionBonus).
  ev -= levelGapEvasionBonus(monsterEffectiveLevel(), state.char.level);
  const furioso = hasStatus(combat.playerStatuses,'Furioso');
  if(furioso) ev += furioso.evasionDelta/100;
  if(combat.playerDefending) ev = Math.max(ev, 0.5);
  if(hasStatus(combat.playerStatuses,'Paralisis')) ev = 0; // indefenso: la Parálisis anula toda evasión, incluso defendiendo
  return {crit:d.critChance, evasion:clamp(ev,0.02,0.6)};
}

// v1: los aliados no tienen Habilidad ni equipo propio todavía, solo una
// base plana — la Parálisis igual los anula por completo, como al jugador.
function computeAllyEvasion(ally){
  if(hasStatus(ally.statuses,'Paralisis')) return 0;
  const evasionFlat = (ally.specials||[]).filter(sp=>sp.type==='evasion_flat').reduce((sum,sp)=>sum+sp.value,0);
  const ev = 0.06 + evasionFlat - levelGapEvasionBonus(monsterEffectiveLevel(), state.char.level);
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
function applyStatus(target, statusDef, isPlayer){
  if(!statusDef) return;
  if(statusDef.chance!==undefined){
    let effChance = statusDef.chance;
    const isMental = MENTAL_STATUSES.has(statusDef.name);
    if(isPlayer){
      const d = derived();
      effChance *= isMental ? (1-d.fortalezaMental) : (1-d.resistenciaEstado);
    } else if(target && (target.mentalResist || target.statusResist)){
      effChance *= isMental ? (1-(target.mentalResist||0)) : (1-(target.statusResist||0));
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
      }
    } else if(sp.type==='sangrado'){
      if(chance(sp.chance)){
        applyStatus(target, {name:'Sangrado', duration:2, stack:true, maxStack:3}, false);
        log(`<b>${it.name}</b> abre una herida en ${target.name}, que empieza a sangrar.`);
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
    const fi = frontEnemyIndex();
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
      const dodgeChance = clamp((target.evasion||0) + levelGapEvasionBonus(monsterLevel, state.char.level) - d.precision, 0.02, 0.85);
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
    socketedStones().forEach(s=>{
      if(s.special && s.special.type==='lowhp_dmg_v2' && state.char.curHP/d.maxHP < s.special.threshold){
        const missingPct = (1 - state.char.curHP/d.maxHP) * 100; // puntos de vida faltantes
        base *= 1 + s.special.base + missingPct*s.special.missingScale;
      }
    });
    // Bastón rúnico / Arco largo / Martillo de guerra épico: bono de daño
    // plano del arma equipada, siempre activo (no es una probabilidad).
    specialsFromEquip(state.char.equip).forEach(sp=>{
      if(sp.type==='aumento_dano') base *= (1+sp.value);
    });
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

    let isCrit = skill.guaranteedCrit ? true : chance(crit);
    if(isCrit) base *= 1.5;

    let ignore = skill.ignoreResist||0;
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
    if(skillId==='ataque_basico' && equipSpecials.some(sp=>sp.type==='segundo_ataque_basico' && chance(sp.chance))){
      log('Realizas un segundo ataque básico.');
      await playerUseSkill(skillId, targetIdx, true);
      return;
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
  combat.turnCount = (combat.turnCount||0) + 1;
  if(state.dungeon && state.dungeon.ultimateCooldown>0) state.dungeon.ultimateCooldown--;
  checkCombatEnd();
  if(!combat || combat.over) return;
  await resolveAllyTurns();
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
  const stepDelay = COMBAT_SPEED_DELAY_MS[getCombatSpeed()] || 0;
  for(const ally of livingAllies()){
    combat.lastActor = {kind:'ally', id: ally.id};
    combat.lastAction = null;
    resolveOneAllyTurn(ally);
    if(!combat || combat.over) break;
    if(stepDelay>0){ renderCombat(); await playBattleAnim(combat.lastActor, combat.lastAction); combat.lastActor = null; combat.lastAction = null; }
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
          // Grimorio de plegarias: duración base 2, Poco Común+ la sube a 3.
          const grimorioDur = (ally.specials||[]).some(sp=>sp.type==='bendecido_dur');
          const grimorioDebuff = (ally.specials||[]).find(sp=>sp.type==='dano_recibido_debuff');
          const blessDef = {name:'Bendecido', duration: grimorioDur?3:2};
          if(grimorioDebuff) blessDef.incomingDmgMult = 1+grimorioDebuff.value;
          applyStatus(target, blessDef, false);
          ally.skillCooldown = ALLY_SKILL_COOLDOWN;
          log(`<b>${ally.name}</b> pronuncia una Bendición Sagrada sobre ${target.name}: sus resistencias caen.`);
          combat.lastAction = {label:'Bendición Sagrada', effects:[]};
          return;
        }
      }
    }
    const fi = frontEnemyIndex();
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
    if(chance(enemyTarget.evasion||0)){
      log(`${enemyTarget.name} esquiva el golpe de <b>${ally.name}</b>.`);
      combat.lastAction = {label:'¡Esquivado!', effects:[]};
      return;
    }

    let dmg = ally.atk;
    if(hasStatus(ally.statuses,'Debilitado')) dmg *= 0.85;
    const inspirado = hasStatus(ally.statuses,'Inspirado');
    if(inspirado) dmg *= (inspirado.dmgMult||1);
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
    if(!combat || combat.over) break;
    if(enemy.hp<=0) continue;
    combat.lastActor = {kind:'enemy', idx: combat.enemies.indexOf(enemy)};
    combat.lastAction = null;
    if(stunFlags.get(enemy)){ log(`${enemy.name} está aturdido y pierde su turno.`); combat.lastAction = {label:'Aturdido', effects:[]}; }
    else enemyAct(enemy);
    if(stepDelay>0){ renderCombat(); await playBattleAnim(combat.lastActor, combat.lastAction); combat.lastActor = null; combat.lastAction = null; }
  }
  if(!combat || combat.over) return;

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
  const bChance = blockChance(defenderSpecials);
  if(bChance>0 && chance(bChance)){
    log(`${enemy.name} ataca a ${target.kind==='ally' ? target.ally.name : 'ti'}, ¡pero el escudo bloquea el golpe por completo!`);
    combat.lastAction = {label:'¡Bloqueado!', effects:[]};
    return;
  }

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
    const furiosoBuff = hasStatus(combat.playerStatuses,'Furioso');
    if(furiosoBuff && furiosoBuff.incomingDmgReduction) finalDmg *= (1 - furiosoBuff.incomingDmgReduction);
    if(hasStatus(combat.playerStatuses,'Paralisis')) finalDmg *= 1.25; // indefenso: sin evasión y más daño recibido
    // Maza de combate / Espadón pesado épicos: reducción de daño recibido pasiva.
    specialsFromEquip(state.char.equip).forEach(sp=>{
      if(sp.type==='reduccion_dano') finalDmg *= (1-sp.value);
    });
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
    let allyDmg = dmg*(1-(((ally.res && ally.res[allyResKey])||0) - (elementalType?0:corrosionResPenalty(ally.statuses)))/100);
    if(hasStatus(ally.statuses,'Paralisis')) allyDmg *= 1.25; // indefenso: igual que al jugador
    (ally.specials||[]).forEach(sp=>{ if(sp.type==='reduccion_dano') allyDmg *= (1-sp.value); });
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

function handleVictory(){
  stopBossAudio();
  const isBoss = combat.node.type==='jefe';
  const isElite = combat.node.type==='elite';
  const level = state.dungeon.level || 1;
  const rewardMult = 1 + (level-1)*0.08; // los niveles más duros pagan algo mejor (solo aplica al oro)
  const perKillXP = isBoss ? guardianXP(level) : isElite ? eliteXP(level) : mobXP(level);
  const xpGain = Math.max(1, Math.round(perKillXP * combat.enemies.length * (race().id==='humano'?1.1:1) * xpGapMultiplier()));
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
  let stoneDropped = false;
  let gotRareGear = false;
  let gotRareStone = false;
  for(let i=0;i<rollCount;i++){
    const gearDrop = rollGearDropForLevel(state.char.level, state.dungeon.atFloor, bypassTiers);
    if(gearDrop){
      addToInventory(gearDrop);
      const line = `También obtienes: <b>${itemNameHTML(gearDrop)}</b> (guardado en la mochila).`;
      log(line);
      lootText += ' ' + line;
      advanceMissionsFor('find_equipment', 1);
      if(['rango_a','legendario','ss'].includes(gearDrop.rarity)) gotRareGear = true;
    }
    // Piedras de alma: solo pueden caer del jefe de década o de un futuro
    // jefe de Rift - ningún otro combate (mob, élite, o guardián que no
    // cierra década) las tira, a pedido explícito.
    if(stonesAllowedThisFight && !stoneDropped){
      const stoneDrop = rollStoneDropForLevel(state.char.level, bypassTiers);
      if(stoneDrop){
        addToInventory(stoneDrop);
        const line = `También encuentras una piedra de alma: <b style="color:${SOUL_TIER_COLORS[stoneDrop.tier]};">${stoneDrop.name}</b>.`;
        log(line);
        lootText += ' ' + line;
        stoneDropped = true;
        advanceMissionsFor('find_soul_stones', 1);
        if(['A','S','SS'].includes(stoneDrop.tier)) gotRareStone = true;
      }
    }
  }
  state.char.pityGear = gotRareGear ? 0 : (state.char.pityGear||0) + 1;
  // El contador de pity de piedras solo cuenta intentos reales (peleas donde
  // sí se pudo tirar una piedra) - de lo contrario cada mob normal diluiría
  // el umbral sin haber tenido ninguna chance real de soltar una.
  if(stonesAllowedThisFight) state.char.pityStone = gotRareStone ? 0 : (state.char.pityStone||0) + 1;

  if(isElite && chance(WARD_DROP_CHANCE)){
    // El Tótem es el único objeto que se dropea de forma individual: cada
    // personaje (tú o un aliado) tiene el suyo propio, no uno compartido. Se
    // sortea entre quienes todavía no tengan uno.
    const eligible = [];
    if(!hasWard()) eligible.push({type:'player'});
    (state.char.allies||[]).forEach(row=>{ if(!row.has_totem) eligible.push({type:'ally', row}); });
    if(eligible.length){
      const target = pick(eligible);
      if(target.type==='player'){
        addToInventory({kind:'ward'});
        log(`También obtienes: <b>${WARD_ITEM.icon} ${WARD_ITEM.name}</b> (guardado en la mochila).`);
      } else {
        grantAllyTotem(target.row);
      }
    }
  }

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
      (state.char.allies||[]).filter(a=>a.role==='sacerdote' && (a.auto_gear_tier||'none')!=='rango_a')
        .forEach(a=> grantAllyAutoGear(a,'rango_a'));
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
    const hadWard = hasWard();
    state.char.inventory = state.char.inventory.filter(i=>i.kind!=='equip' && i.kind!=='ward');
    state.char.gold = Math.round(state.char.gold*(1-DEFEAT_GOLD_LOSS_PCT/100));
    const d = derived();
    state.char.curHP = Math.round(d.maxHP*0.5);
    state.char.curSta = d.maxSta; state.char.curSpi = d.maxSpi;
    combat = null;
    state.dungeon = null;
    payAlliesOnExit();
    playLoginAudio();
    if(lostItems>0) log(`Pierdes ${lostItems} objeto(s) de equipo que llevabas en la mochila.`);
    if(hadWard) log(`Tu <b>${WARD_ITEM.icon} ${WARD_ITEM.name}</b> se pierde junto con el resto de tu equipo suelto.`);
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
  {title:'Ranking', body:'Tu récord personal (el piso más profundo que has alcanzado) y el top 10 de todos los jugadores.'},
  {title:'Combate por turnos', body:'Cada turno eliges una habilidad o acción. Frente y Retaguardia son tus dos posiciones: la mayoría de golpes físicos fuertes exigen estar en el Frente; la Retaguardia da +8% de evasión y favorece las habilidades a distancia.'},
  {title:'MP y Espíritu', body:'El MP paga tus habilidades físicas. El Espíritu paga las mágicas y de utilidad, y también aumenta tu daño mágico. Reposicionarte cambia entre Frente y Retaguardia, y ocupa tu turno.'},
  {title:'Frente y Retaguardia, con aliados', body:'Cuando tengas un aliado tanque en el Frente, los enemigos no podrán llegar hasta tu Retaguardia sin pasar por él primero — igual que tú no puedes golpear al enemigo de atrás sin resolver primero al de adelante. Posicionarte bien pesará tanto como golpear fuerte.'},
  {title:'Defenderse', body:'Te da al menos 50% de probabilidad de esquivar el próximo golpe, y si aun así te alcanzan, el daño se reduce a la mitad. Es una opción real cuando la pelea se pone difícil, no solo un último recurso.'},
  {title:'El Tótem', body:'Un objeto raro que sueltan los élites. Bloquea gratis, una sola vez y sin gastar tu turno, el golpe que te mataría — pero solo funciona contra el jefe final de una década del laberinto (piso 10, 20, 30...).'},
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
      <span class="item-name">${tpl.icon} ${tpl.name} x${it.qty}</span>
      <span>${tpl.desc}</span>
    </div>`;
  }).join('') : `<p class="inv-empty-msg">No tienes pociones para usar.</p>`;

  const combatSpeed = getCombatSpeed();
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
    <div class="pos-hint" style="font-size:0.7em; color:var(--text-dim); margin:2px 0 8px;">Frente: exige la mayoría de habilidades físicas de golpe. Retaguardia: +8% evasión y mejor para habilidades a distancia.</div>
    <div id="battle-stage-mount" style="margin-bottom:6px;"></div>
    <div style="font-size:0.7em; color:var(--text-dim); text-align:center; margin-bottom:10px;">
      ${state.char.curHP}/${d.maxHP} HP · ${state.char.curSta}/${d.maxSta} MP · ${state.char.curSpi}/${d.maxSpi} Espíritu
      ${playerStatusChips ? ` · ${playerStatusChips}` : ''}
    </div>

    <div class="battle-menu" id="battle-menu">
      <div class="battle-menu-grid" id="battle-menu-grid">
        <button class="menu-btn" id="menu-basico" ${combat.turnBusy?'disabled':''}>⚔ Básico</button>
        <button class="menu-btn" id="menu-habilidades" ${combat.turnBusy?'disabled':''}>💥 Habilidades</button>
        <button class="menu-btn" id="menu-mochila" ${combat.turnBusy?'disabled':''}>🎒 Mochila</button>
        <button class="menu-btn" id="menu-defensa" ${combat.turnBusy?'disabled':''}>🛡 Defensa</button>
        <button class="menu-btn wide" id="menu-reposicionar" ${combat.turnBusy?'disabled':''}>↔ Reposicionarse (${combat.playerPos==='frente'?'a Retaguardia':'al Frente'})</button>
      </div>
      <div class="battle-submenu" id="battle-submenu" style="display:none;">
        <div class="submenu-list" id="battle-submenu-list"></div>
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
    if(sk.targetMode==='any'){
      combat.pendingSkill = sid;
      log(`Elige un objetivo para ${sk.name}.`);
    } else {
      guardedPlayerUseSkill(sid, null);
    }
  };
  const grid = document.getElementById('battle-menu-grid');
  const submenu = document.getElementById('battle-submenu');
  document.getElementById('menu-basico').onclick = ()=> useSkillFromMenu('ataque_basico');
  document.getElementById('menu-defensa').onclick = ()=> useSkillFromMenu('defender');
  document.getElementById('menu-reposicionar').onclick = ()=> useSkillFromMenu('reposicionar');
  document.getElementById('menu-habilidades').onclick = ()=>{
    document.getElementById('battle-submenu-list').innerHTML = skillSubmenuHTML;
    document.querySelectorAll('#battle-submenu-list .submenu-item[data-skill]').forEach(el=>{
      el.onclick = ()=>{ useSkillFromMenu(el.dataset.skill); };
    });
    grid.style.display = 'none'; submenu.style.display = 'flex';
  };
  document.getElementById('menu-mochila').onclick = ()=>{
    document.getElementById('battle-submenu-list').innerHTML = potionSubmenuHTML;
    document.querySelectorAll('#battle-submenu-list .submenu-item[data-potion]').forEach(el=>{
      el.onclick = ()=>{ combat.pendingSkill = null; guardedUsePotionInCombat(el.dataset.potion); };
    });
    grid.style.display = 'none'; submenu.style.display = 'flex';
  };
  document.getElementById('menu-back').onclick = ()=>{
    submenu.style.display = 'none'; grid.style.display = 'grid';
  };
  document.querySelectorAll('#combat-speed-toggle [data-speed]').forEach(el=>{
    el.onclick = ()=>{
      setCombatSpeed(parseInt(el.dataset.speed,10));
      renderCombat();
    };
  });

  const playerInfo = {
    name: state.char.nickname || s.name, icon: race().icon, style: state.char.style,
    hp: state.char.curHP, maxHP: d.maxHP, mp: state.char.curSta, maxMP: d.maxSta,
    spirit: state.char.curSpi, maxSpirit: d.maxSpi, statusCount: (combat.playerStatuses||[]).length,
  };
  syncBattleStage(document.getElementById('battle-stage-mount'), combat, playerInfo, {
    isAllyHostile,
    onTarget: (idx)=>{
      if(!combat.pendingSkill) return;
      const sid = combat.pendingSkill;
      combat.pendingSkill = null;
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
  invOpen = !invOpen;
  renderAll();
};

document.querySelectorAll('#city-nav .nav-btn').forEach(btn=>{
  btn.onclick = ()=>{
    if(!state) return;
    if(combat && combat.active) return;
    const key = btn.dataset.nav;
    invOpen = false; homeOpen = false; shopOpen = false; rankingOpen = false; adminOpen = false; missionsOpen = false; tabernaOpen = false;
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
      <div>
        <b>${r.icon} ${row.nickname}</b> <span class="slot-tag">${r.name} · ${s.name}</span>${row.role==='admin' ? ' <span class="slot-tag">admin</span>' : ''}
        <div class="inv-item-bonus neutral">Nivel ${row.level} · Récord: Nivel ${row.record_level} · Piso ${row.record_floor_idx}</div>
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
    document.getElementById('btn-new-character').onclick = goToCreation;
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

function goToCreation(){
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
