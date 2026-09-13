"use strict";

import { supabase } from './supabaseClient.js';
import * as auth from './auth.js';

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
    id:'pesada', name:'Arma pesada', icon:'🔨', scaleStat:'fis',
    desc:'Mazos y hachas. Rompe la guardia y remata al aturdido.',
    skills:['golpe_bruto','machacar','grito_guerra']
  },
  doblefilo: {
    id:'doblefilo', name:'Asesino', icon:'🔪', scaleStat:'fishab',
    desc:'Dagas gemelas. Desangra a tu presa y luego termina el trabajo.',
    skills:['corte_rapido','danza_cuchillas','golpe_gracia']
  },
  tirador: {
    id:'tirador', name:'Tirador', icon:'🏹', scaleStat:'hab',
    desc:'Distancia y precisión. Marca, retrocede, dispara.',
    skills:['disparo_certero','marca_cazador','lluvia_flechas']
  },
  canalizador: {
    id:'canalizador', name:'Canalizador', icon:'🔥', scaleStat:'esp',
    desc:'Fuego y hielo. Siembra el elemento y detónalo después.',
    skills:['bola_fuego','lanza_hielo','explosion_arcana']
  }
};

/* ============================================================
   TABERNA — aliados reclutables (v1: solo Gremio, sin traición ni
   mantenimiento recurrente todavía; nivel 10 de personaje requerido)
   ============================================================ */
const ALLY_ROSTER = [
  {templateId:'aldric', role:'guerrero', name:'Aldric de la Muralla', icon:'🛡️', bio:'Escudero retirado que aún no aprende a rendirse. Se planta al frente y no se mueve.', baseCost:150, costPerLevel:10, frontline:true},
  {templateId:'neira', role:'arquero', name:'Neira la Certera', icon:'🏹', bio:'Cazadora de las tierras altas. Nunca falla dos veces al mismo blanco.', baseCost:170, costPerLevel:11, frontline:false},
  {templateId:'vex', role:'asesino', name:'Vex', icon:'🗡️', bio:'No cuenta su pasado. Solo dice que llegó tarde a la venganza que buscaba.', baseCost:190, costPerLevel:12, frontline:false},
  {templateId:'fennwick', role:'mago', name:'Fennwick', icon:'🔮', bio:'Aprendiz expulsado del Círculo Roto por "experimentar de más".', baseCost:220, costPerLevel:14, frontline:false},
  {templateId:'delyth', role:'sacerdote', name:'Hermana Delyth', icon:'✨', bio:'La última de su orden. Cura a cualquiera que se lo pida, sin preguntar por qué pelea.', baseCost:240, costPerLevel:15, frontline:false}
];
const ALLY_MIN_LEVEL = 10;
const MAX_ALLIES = 4;
function allyHireCost(tpl, charLevel){ return tpl.baseCost + charLevel*tpl.costPerLevel; }

// skill definitions
const SKILLS = {
  ataque_basico: {
    id:'ataque_basico', name:'Ataque básico', cost:null, dmgType:'fisico', mult:0.55,
    desc:'Un golpe simple y confiable. No cuesta recursos.', targetMode:'front'
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
    desc:'Daño físico. 70% de aplicar Tambaleo.', targetMode:'front'
  },
  machacar: {
    id:'machacar', name:'Machacar', cost:{tipo:'estamina', valor:20}, dmgType:'fisico', mult:0.7,
    requiresPos:'frente', consumes:{name:'Tambaleo', bonusMult:1.8, applies:{name:'Aturdido', duration:1}},
    desc:'Si el objetivo está Tambaleante: lo aturde y hace mucho más daño.', targetMode:'front'
  },
  grito_guerra: {
    id:'grito_guerra', name:'Grito de guerra', cost:{tipo:'espiritu', valor:10}, utility:'buff_self',
    applySelf:{name:'Furioso', duration:2, dmgMult:1.3, evasionDelta:-10, incomingDmgReduction:0.2},
    desc:'+30% daño físico y -20% daño recibido durante 2 turnos, a cambio de -10% evasión.', targetMode:'self'
  },

  corte_rapido: {
    id:'corte_rapido', name:'Corte rápido', cost:{tipo:'estamina', valor:12}, dmgType:'fisico', mult:0.6,
    requiresPos:'frente', applies:{name:'Sangrado', chance:0.85, duration:3, stack:true, maxStack:3},
    desc:'Daño físico. Apila Sangrado (hasta x3).', targetMode:'front'
  },
  danza_cuchillas: {
    id:'danza_cuchillas', name:'Danza de cuchillas', cost:{tipo:'estamina', valor:22}, dmgType:'fisico', mult:0.5, hits:2,
    requiresPos:'frente', scalesWithStack:{name:'Sangrado', perStackMult:0.15},
    desc:'Golpea dos veces. +15% de daño por cada carga de Sangrado en el objetivo.', targetMode:'front'
  },
  golpe_gracia: {
    id:'golpe_gracia', name:'Golpe de gracia', cost:{tipo:'estamina', valor:18}, dmgType:'fisico', mult:0.9,
    requiresPos:'frente', consumesStackBonus:{name:'Sangrado', perStackMult:0.25},
    desc:'Consume el Sangrado del objetivo: +25% de daño por carga consumida.', targetMode:'front'
  },

  disparo_certero: {
    id:'disparo_certero', name:'Disparo certero', cost:{tipo:'estamina', valor:10}, dmgType:'fisico', mult:0.8,
    ignoreResist:0.5, penaltyIfFrente:0.2,
    desc:'Ignora 50% de la resistencia física. Menos preciso desde el Frente.', targetMode:'any'
  },
  marca_cazador: {
    id:'marca_cazador', name:'Marca del cazador', cost:{tipo:'espiritu', valor:8}, utility:'mark',
    applies:{name:'Marcado', chance:1, duration:3},
    desc:'No hace daño. El objetivo recibe +20% de todo el daño durante 3 turnos.', targetMode:'any'
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
    desc:'Consume Quemadura o Ralentizado del objetivo para +60% de daño.', targetMode:'any'
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
  {
    regular: [
      {id:'goblin_arquero', name:'Goblin arquero', icon:'🏹', hp:0.85, atk:1.1, res:{fisico:-5,fuego:0,hielo:0,veneno:5,aturdimiento:0}, moves:['pegar','robar']},
      {id:'goblin_guerrero', name:'Goblin guerrero', icon:'🗡️', hp:1.15, atk:1.05, res:{fisico:10,fuego:-5,hielo:0,veneno:0,aturdimiento:5}, moves:['pegar'], frontline:true},
      {id:'goblin_saqueador', name:'Goblin saqueador', icon:'🪓', hp:1.0, atk:1.0, res:{fisico:0,fuego:0,hielo:-10,veneno:10,aturdimiento:10}, moves:['pegar','robar'], frontline:true},
      {id:'goblin_chaman', name:'Chamán goblin', icon:'💀', hp:0.85, atk:0.95, res:{fisico:-10,fuego:15,hielo:15,veneno:25,aturdimiento:-10}, moves:['pegar','debilitar']}
    ],
    elite: [{id:'jefe_goblin', name:'Jefe goblin', icon:'👹', hp:1.9, atk:1.4, res:{fisico:20,fuego:-10,hielo:5,veneno:15,aturdimiento:25}, moves:['pegar','aplastar'], elite:true, frontline:true}],
    guardians: [
      {id:'hobgoblin', name:'Hobgoblin', icon:'🛡️', hp:3.2, atk:1.6, res:{fisico:15,fuego:5,hielo:5,veneno:15,aturdimiento:30}, moves:['pegar','aplastar','debilitar'], boss:true, frontline:true},
      {id:'gilgoblin', name:'Gilgoblin', icon:'🔱', hp:3.0, atk:1.7, res:{fisico:10,fuego:10,hielo:10,veneno:20,aturdimiento:20}, moves:['pegar','aplastar','debilitar'], boss:true, frontline:true}
    ],
    decadeBoss: {id:'ogro', name:'Ogro', icon:'👺', hp:4.2, atk:1.9, res:{fisico:25,fuego:0,hielo:0,veneno:10,aturdimiento:35}, moves:['pegar','aplastar','debilitar'], boss:true, frontline:true}
  },
  // Década 1 — pisos 11-20 — Arañas del bosque profundo (familia tarántula, veneno/Parálisis)
  {
    regular: [
      {id:'tarantula_cazadora', name:'Tarántula cazadora', icon:'🕷️', hp:1.1, atk:1.05, res:{fisico:5,fuego:-5,hielo:0,veneno:20,aturdimiento:0}, moves:['pegar'], frontline:true},
      {id:'tarantula_saltarina', name:'Tarántula saltarina', icon:'🕷️', hp:0.9, atk:1.15, res:{fisico:0,fuego:-10,hielo:0,veneno:20,aturdimiento:0}, moves:['pegar','paralizar'], frontline:true},
      {id:'tarantula_tejedora', name:'Tarántula tejedora', icon:'🕸️', hp:0.8, atk:0.95, res:{fisico:-5,fuego:-10,hielo:10,veneno:25,aturdimiento:0}, moves:['pegar','paralizar']},
      {id:'viuda_venenosa', name:'Viuda venenosa', icon:'🕸️', hp:0.75, atk:1.0, res:{fisico:-10,fuego:-10,hielo:5,veneno:30,aturdimiento:0}, moves:['paralizar','pegar']}
    ],
    elite: [{id:'matriarca_telaranha', name:'Matriarca telaraña', icon:'🕷️', hp:2.0, atk:1.35, res:{fisico:10,fuego:-15,hielo:5,veneno:35,aturdimiento:0}, moves:['pegar','paralizar'], elite:true, frontline:true}],
    guardians: [
      {id:'reina_telaranha', name:'Reina telaraña', icon:'👑', hp:3.4, atk:1.55, res:{fisico:15,fuego:-15,hielo:10,veneno:40,aturdimiento:5}, moves:['pegar','paralizar','aplastar'], boss:true, frontline:true},
      {id:'devoradora_nido', name:'Devoradora de nido', icon:'🕷️', hp:3.6, atk:1.5, res:{fisico:20,fuego:-10,hielo:5,veneno:35,aturdimiento:10}, moves:['pegar','paralizar','aplastar'], boss:true, frontline:true}
    ],
    decadeBoss: {id:'matriarca_escarlata', name:'Matriarca escarlata', icon:'🕷️', hp:4.6, atk:1.75, res:{fisico:20,fuego:-15,hielo:10,veneno:45,aturdimiento:10}, moves:['pegar','paralizar','aplastar'], boss:true, frontline:true}
  },
  // Década 2 — pisos 21-30 — Guaridas de bestias, con Riakis
  {
    regular: [
      {id:'loba_acantilado', name:'Loba de acantilado', icon:'🐺', hp:1.1, atk:1.1, res:{fisico:10,fuego:0,hielo:5,veneno:0,aturdimiento:0}, moves:['pegar'], frontline:true},
      {id:'oso_cuevas', name:'Oso de las cuevas', icon:'🐻', hp:1.3, atk:1.15, res:{fisico:15,fuego:0,hielo:5,veneno:0,aturdimiento:5}, moves:['pegar','aplastar'], frontline:true},
      {id:'buitre_corrupto', name:'Buitre corrupto', icon:'🦅', hp:0.8, atk:1.0, res:{fisico:-5,fuego:0,hielo:0,veneno:10,aturdimiento:0}, moves:['pegar','cegar']},
      {id:'lince_sombrio', name:'Lince sombrío', icon:'🐈‍⬛', hp:0.9, atk:1.1, res:{fisico:5,fuego:0,hielo:0,veneno:0,aturdimiento:0}, moves:['pegar','atemorizar']}
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
    decadeBoss: {id:'custodio_isla', name:'Custodio de la Isla', icon:'🏝️', hp:3.2, atk:0.7, res:{fisico:15,fuego:10,hielo:10,veneno:10,aturdimiento:15}, moves:['curar','buff_pasivo','invocar','area_debil'], boss:true, frontline:false}
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
  rango_b: {id:'rango_b', name:'Rango B', color:'#c17fd1'},
  rango_a: {id:'rango_a', name:'Rango A', color:'#d1a84f'}
  // futuras rarezas (pendientes de implementar): S, SS (SS será numerado/único mundial)
};
const RANGO_B_RES_PCT = 20;
const RANGO_A_RES_PCT = 28;
const RANGO_B_WEAPON_BONUS = 14;
const RANGO_A_WEAPON_BONUS = 20;

// Valores planos por rareza: todo objeto de una misma rareza da el mismo
// bono de resistencia, y toda arma poco común da el mismo bono de daño,
// sin importar en qué piso/nivel se consiguió.
const COMUN_RES_PCT = 5;
const POCO_COMUN_RES_PCT = 12;
const POCO_COMUN_WEAPON_BONUS = 8;

// weapon/offhand options the shop sells, keyed by combat style; each subclass can only
// buy the gear that fits its playstyle (heavy weapons + shield, dual blades, bow + quiver, staff + focus)
const WEAPON_OPTIONS = {
  pesada: {
    arma: ['Martillo de guerra','Maza de combate','Espadón pesado'],
    arma2: ['Escudo de hierro']
  },
  doblefilo: {
    arma: ['Daga curva','Cuchillo largo'],
    arma2: ['Daga gemela']
  },
  tirador: {
    arma: ['Arco corto','Arco largo'],
    arma2: ['Carcaj de cuero']
  },
  canalizador: {
    arma: ['Vara arcana','Bastón rúnico'],
    arma2: ['Foco arcano']
  }
};
const OFFHAND_LABELS = {pesada:'Escudo', doblefilo:'Arma 2', tirador:'Carcaj', canalizador:'Foco'};
// which stat a subclass's weapons feed (pure damage, no other stats — as requested)
const SHOP_WEAPON_STAT = {pesada:'fis', doblefilo:'hab', tirador:'hab', canalizador:'esp'};
// sub-perk poco-común (guardian) weapons roll, following each subclass's logic:
// heavy weapons never get life steal, dps (doble filo) never gets stun
const SPECIALS_BY_STYLE = {
  pesada: {type:'aturdir', label:'posibilidad de aturdir', chance:0.12},
  doblefilo: {type:'robovida', label:'robo de vida', percent:0.10},
  tirador: {type:'aturdir', label:'posibilidad de aturdir', chance:0.10},
  canalizador: {type:'robovida', label:'robo de vida', percent:0.08}
};

function shopWeaponValue(){ return 3 + Math.floor(state.char.level/2); }
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
function fightingDecadeBoss(){
  return !!(combat && combat.active && combat.enemies.some(e=>e.tpl.id==='ogro'));
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

function buyWeapon(slot){
  const styleId = state.char.style;
  const opts = WEAPON_OPTIONS[styleId];
  if(!opts || !opts[slot]) return;
  const price = shopWeaponPrice(slot==='arma2');
  if(state.char.gold < price){ log('No tienes suficiente oro para eso.'); return; }
  state.char.gold -= price;
  const name = pick(opts[slot]);
  const statKey = SHOP_WEAPON_STAT[styleId] || 'fis';
  addToInventory({slot, name, bonus:{stat:statKey, value:shopWeaponValue()}, rarity:'comun'});
  log(`Compras <b>${name}</b> por ${price} de oro.`);
  renderAll(); save();
}

// equipo común no ligado a la senda de combate: armadura, casco, botas,
// guantes y amuleto. Cada uno da un único bono plano, igual que las armas.
const SHOP_GEAR_SLOTS = ['armadura','casco','botas','guantes','amuleto'];
function shopGearPrice(slot){ return slot==='armadura' ? 45 + state.char.level*4 : 35 + state.char.level*3; }
function shopGearValue(slot){ return slot==='armadura' ? 2 + Math.floor(state.char.level/2) : 2 + Math.floor(state.char.level/3); }
function buyGear(slot){
  const price = shopGearPrice(slot);
  if(state.char.gold < price){ log('No tienes suficiente oro para eso.'); return; }
  state.char.gold -= price;
  const name = pick(COMUN_GEAR_NAMES[slot]);
  const bonus = slot==='amuleto'
    ? {res: pick(['fisico','fuego','hielo','veneno','aturdimiento']), value: COMUN_RES_PCT}
    : {stat: GUARDIAN_SLOT_STAT[slot] || 'maxhp', value: shopGearValue(slot)};
  addToInventory({slot, name, bonus, rarity:'comun'});
  log(`Compras <b>${name}</b> por ${price} de oro.`);
  renderAll(); save();
}

// Equipo poco común, también con oro (no Sellos) — un escalón intermedio
// entre lo común de siempre y la tienda de Sellos del Gremio.
function shopGearPricePocoComun(slot){ return Math.round(shopGearPrice(slot) * 2.2); }
function shopGearValuePocoComun(slot){ return slot==='armadura' ? 4 + Math.floor(state.char.level/2) : 4 + Math.floor(state.char.level/3); }
function buyGearPocoComun(slot){
  const price = shopGearPricePocoComun(slot);
  if(state.char.gold < price){ log('No tienes suficiente oro para eso.'); return; }
  state.char.gold -= price;
  const name = pick(COMUN_GEAR_NAMES[slot]);
  const bonus = slot==='amuleto'
    ? {res: pick(['fisico','fuego','hielo','veneno','aturdimiento']), value: POCO_COMUN_RES_PCT}
    : {stat: GUARDIAN_SLOT_STAT[slot] || 'maxhp', value: shopGearValuePocoComun(slot)};
  addToInventory({slot, name, bonus, rarity:'poco_comun'});
  log(`Compras <b>${name}</b> por ${price} de oro.`);
  renderAll(); save();
}

// Tienda del Gremio: se paga con Sellos del Laberinto (misiones), no con oro.
// Vende equipo de rango Único (B) y Épico (A) — Legendario (S) todavía no está
// definido, así que no se vende aquí.
const SELLO_SHOP_SLOTS = ['arma','armadura','casco','botas','guantes','amuleto'];
function selloShopPrice(rarity){ return rarity==='rango_a' ? 700 : 350; }
function makeSelloShopItem(slot, rarity){
  const resPct = rarity==='rango_a' ? RANGO_A_RES_PCT : RANGO_B_RES_PCT;
  const weaponBonus = rarity==='rango_a' ? RANGO_A_WEAPON_BONUS : RANGO_B_WEAPON_BONUS;
  const tag = rarity==='rango_a' ? 'épico' : 'único';
  const styleId = state.char.style;
  const opts = WEAPON_OPTIONS[styleId] || WEAPON_OPTIONS.pesada;
  let name, bonus, special = null;
  if(slot==='arma'){
    name = pick(opts.arma) + ` ${tag} del Gremio`;
    const statKey = SHOP_WEAPON_STAT[styleId] || 'fis';
    bonus = {stat:statKey, value: weaponBonus};
    special = SPECIALS_BY_STYLE[styleId] || null;
  } else if(slot==='armadura'){
    name = `Placa ${tag} del Gremio`;
    bonus = {stat:'maxhp', value: (rarity==='rango_a' ? 10 : 6) + Math.floor(state.char.level/2)};
  } else if(slot==='amuleto'){
    name = `Reliquia ${tag} del Gremio`;
    bonus = {res: pick(['fisico','fuego','hielo','veneno','aturdimiento']), value: resPct};
  } else {
    name = `${slotLabel(slot)} ${tag} del Gremio`;
    bonus = {stat: GUARDIAN_SLOT_STAT[slot], value: (rarity==='rango_a' ? 8 : 5) + Math.floor(state.char.level/3)};
  }
  const item = {slot, name, bonus, rarity};
  if(special) item.special = special;
  return item;
}
function buySelloGear(slot, rarity){
  const price = selloShopPrice(rarity);
  if((state.char.missionCurrency||0) < price){ log('No tienes suficientes Sellos del Laberinto.'); return; }
  state.char.missionCurrency -= price;
  const item = makeSelloShopItem(slot, rarity);
  addToInventory(item);
  log(`Compras <b>${item.name}</b> por ${price} Sellos del Laberinto.`);
  renderAll(); save();
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
  const specialBonus = item.special ? 15 : 0;
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

// every guardian from level 2 onward hands out a fixed, subclass-appropriate poco-común item
const GUARDIAN_REWARD_SLOTS = {2:'arma', 3:'casco', 4:'arma2', 5:'guantes', 6:'armadura', 7:'botas', 8:'amuleto', 9:'arma', 10:'armadura'};
const GUARDIAN_SLOT_STAT = {casco:'hab', guantes:'fis', botas:'hab'}; // themed stat for the new slots
const GUARDIAN_SLOT_NAMES = {
  casco:['Yelmo del guardián','Corona vigilante','Máscara custodia'],
  botas:['Botas del guardián','Grebas vigilantes','Sandalias del custodio'],
  guantes:['Guanteletes del guardián','Manoplas vigilantes','Garras del custodio']
};
// Rareza garantizada del guardián según la década — sube con la profundidad.
// La década 1 (pisos 1-10) ya no da recompensa asegurada: con el sistema de
// rangos activo, ese hueco ahora lo cubre el loot normal + la tienda de Sellos.
function guardianRewardRarity(decade){
  if(decade<=1) return 'poco_comun';
  if(decade<=3) return 'rango_b';
  return 'rango_a';
}
function generateGuardianReward(level){
  const decade = decadeIndexForLevel(level);
  if(decade===0) return null;
  const slot = GUARDIAN_REWARD_SLOTS[((level-1)%10)+1];
  if(!slot) return null;
  const rarity = guardianRewardRarity(decade);
  const weaponBonus = rarity==='rango_a' ? RANGO_A_WEAPON_BONUS : rarity==='rango_b' ? RANGO_B_WEAPON_BONUS : POCO_COMUN_WEAPON_BONUS;
  const resPct = rarity==='rango_a' ? RANGO_A_RES_PCT : rarity==='rango_b' ? RANGO_B_RES_PCT : POCO_COMUN_RES_PCT;
  const styleId = state.char.style;
  const opts = WEAPON_OPTIONS[styleId] || WEAPON_OPTIONS.pesada;
  let name, bonus, special = null;
  if(slot==='arma' || slot==='arma2'){
    name = pick(opts[slot]) + ' del guardián';
    const statKey = SHOP_WEAPON_STAT[styleId] || 'fis';
    bonus = {stat:statKey, value: weaponBonus};
    special = SPECIALS_BY_STYLE[styleId] || null;
  } else if(slot==='armadura'){
    name = pick(['Coraza del guardián','Placa ancestral','Manto del vigía']);
    bonus = {stat:'maxhp', value: 3 + Math.floor(state.char.level/2) + decade*2};
  } else if(slot==='amuleto'){
    name = pick(['Sello del guardián','Reliquia custodiada','Talismán antiguo']);
    const resKeys = ['fisico','fuego','hielo','veneno','aturdimiento'];
    bonus = {res: pick(resKeys), value: resPct};
  } else {
    // casco, botas, guantes
    name = pick(GUARDIAN_SLOT_NAMES[slot]);
    bonus = {stat: GUARDIAN_SLOT_STAT[slot], value: 3 + Math.floor(state.char.level/3) + decade*2};
  }
  const item = {slot, name, bonus, rarity};
  if(special) item.special = special;
  return item;
}

/* ============================================================
   PIEDRAS DE ALMA (SOUL STONES) — v2, familias con fórmulas por rango
   ============================================================
   Investigué la novela «Sobreviviendo siendo un bárbaro»: usa "Esencias" con
   rango numérico 9 (débil) a 1 (fuerte), no piedras con letras. Este sistema
   sigue siendo una capa propia de nuestro juego, con el ranking pedido:
   E (más bajo) < F < D < C < B < A < S < SS (más alto).
   Solo caen piedras de rango E y F por ahora. Las fórmulas de D/C/B ya están
   listas (se duplican por rango, igual que E→F), y las de A/S/SS también
   (efectos "avanzados" que empiezan en A y suben +10 puntos porcentuales por
   rango) — simplemente no hay forma de conseguir esos rangos todavía. */
const SOUL_STONE_TIERS = ['E','F','D','C','B','A','S','SS']; // ascendente: E la más baja, SS la más alta
const AVAILABLE_SOUL_TIERS = ['E','F']; // únicos rangos obtenibles por ahora
const SOUL_TIER_COLORS = {E:'#9a9a9a', F:'#6fae6f', D:'#4f9bd1', C:'#8a7fd1', B:'#c17fd1', A:'#d1a84f', S:'#d1594f', SS:'#e23c6b'};
function soulTierIdx(tier){ return SOUL_STONE_TIERS.indexOf(tier); }

// Fórmulas de escalado por familia (documentadas para cuando D-SS estén disponibles).
// statValue: se duplica por cada rango. procChance: se duplica desde F en adelante.
// advValue: "efecto avanzado" que arranca en rango A y sube +10 puntos/rango (o tabla fija).
const SOUL_FAMILIES = {
  vigor:     {name:'Vigor',           statKey:'fis',    baseE:4,  procBaseAtF:0.02, advBaseAtA:0.10, advLabel:'robo de vida (% del daño causado)'},
  sabiduria: {name:'Sabiduría',       statKey:'maxsta', baseE:16, procBaseAtF:0.05, advBaseAtA:0.10, advLabel:'probabilidad de escudo de maná'},
  voluntad:  {name:'Voluntad',        statKey:'esp',    baseE:4,  procBaseAtF:0.05, advBaseAtA:0.10, advLabel:'probabilidad de que tu próxima habilidad cueste la mitad de espíritu'},
  instinto:  {name:'Instinto',        statKey:'hab',    baseE:4,  procBaseAtF:0.02, advBaseAtA:0.10, advLabel:'probabilidad de doble lanzamiento (el segundo gratis y sin turno)'},
  vitalidad: {name:'Vitalidad',       statKey:'maxhp',  baseE:2,  procBaseAtF:0.02, advBaseAtA:0.10, advLabel:'probabilidad de curar 10% de tu vida máxima'},
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
function soulFuriaBase(tier){ const idx=soulTierIdx(tier); return idx===0 ? 0.10 : 0.18 + (idx-1)*0.001; }
function soulFuriaMissingScale(tier){ const idx=soulTierIdx(tier); return idx===0 ? 0.005 : 0.006 + (idx-1)*0.001; }

const SOUL_STONES = {
  vigor_e:     {id:'vigor_e',     family:'vigor',     name:'Piedra del Alma: Vigor (E)',            tier:'E', icon:'🟤', bonus:{stat:'fis', value:4},
    desc:'+4 Físico permanente.', preview:'Desde F: probabilidad de aturdir al golpear. Desde A: roba vida.'},
  vigor_f:     {id:'vigor_f',     family:'vigor',     name:'Piedra del Alma: Vigor (F)',            tier:'F', icon:'🟤', bonus:{stat:'fis', value:8},
    special:{type:'aturdir', chance:0.02},
    desc:'+8 Físico. 2% de probabilidad de aturdir al enemigo al golpear.', preview:'Desde A: roba vida (% del daño causado).'},
  sabiduria_e: {id:'sabiduria_e', family:'sabiduria', name:'Piedra del Alma: Sabiduría (E)',        tier:'E', icon:'📘', bonus:{stat:'maxsta', value:16},
    desc:'+16 MP máximo.', preview:'Desde F: probabilidad de recuperar MP gastado. Desde A: escudo de maná.'},
  sabiduria_f: {id:'sabiduria_f', family:'sabiduria', name:'Piedra del Alma: Sabiduría (F)',        tier:'F', icon:'📘', bonus:{stat:'maxsta', value:32},
    special:{type:'mp_refund', chance:0.05, amount:0.05},
    desc:'+32 MP máximo. 5% de probabilidad de recuperar el 5% del MP gastado.', preview:'Desde A: probabilidad de escudo de maná (cubre daño físico y mágico según tu MP máximo).'},
  voluntad_e:  {id:'voluntad_e',  family:'voluntad',  name:'Piedra del Alma: Voluntad (E)',         tier:'E', icon:'🔷', bonus:{stat:'esp', value:4},
    desc:'+4 Espíritu permanente.', preview:'Desde F: probabilidad de recuperar espíritu gastado. Desde A: próxima habilidad a mitad de costo.'},
  voluntad_f:  {id:'voluntad_f',  family:'voluntad',  name:'Piedra del Alma: Voluntad (F)',         tier:'F', icon:'🔷', bonus:{stat:'esp', value:8},
    special:{type:'esp_refund', chance:0.05, amount:0.05},
    desc:'+8 Espíritu. 5% de probabilidad de recuperar el 5% del espíritu gastado.', preview:'Desde A: probabilidad de que tu próxima habilidad cueste la mitad de espíritu.'},
  instinto_e:  {id:'instinto_e',  family:'instinto',  name:'Piedra del Alma: Instinto (E)',         tier:'E', icon:'🟢', bonus:{stat:'hab', value:4},
    desc:'+4 Habilidad permanente.', preview:'Desde F: probabilidad de quemar o congelar según la habilidad. Desde A: doble lanzamiento.'},
  instinto_f:  {id:'instinto_f',  family:'instinto',  name:'Piedra del Alma: Instinto (F)',         tier:'F', icon:'🟢', bonus:{stat:'hab', value:8},
    special:{type:'elemental_proc', chance:0.02},
    desc:'+8 Habilidad. 2% de probabilidad de quemar (fuego) o congelar/ralentizar (hielo) al enemigo, según la habilidad usada.', preview:'Desde A: probabilidad de lanzar la habilidad dos veces (la segunda gratis, sin gastar turno).'},
  vitalidad_e: {id:'vitalidad_e', family:'vitalidad', name:'Piedra del Alma: Vitalidad (E)',        tier:'E', icon:'❤️', bonus:{stat:'maxhp', value:2},
    desc:'+16 Vida máxima aprox.', preview:'Desde F: refleja parte del daño recibido. Desde A: probabilidad de autocurarte.'},
  vitalidad_f: {id:'vitalidad_f', family:'vitalidad', name:'Piedra del Alma: Vitalidad (F)',        tier:'F', icon:'❤️', bonus:{stat:'maxhp', value:4},
    special:{type:'reflect', pct:0.02},
    desc:'+32 Vida máxima aprox. Devuelves el 2% del daño físico que recibes a tu atacante.', preview:'Desde A: probabilidad de recuperar el 10% de tu vida máxima.'},
  furia_e:     {id:'furia_e',     family:'furia',     name:'Piedra del Alma: Furia Contenida (E)',  tier:'E', icon:'🔥',
    special:{type:'lowhp_dmg_v2', threshold:0.3, base:0.10, missingScale:0.005},
    desc:'Por debajo del 30% de vida: +10% de daño, y +0.5% adicional por cada 1% de vida que te falte.', preview:'Desde A: probabilidad de revivir una vez por entrada al laberinto (25% en A, 50% en S, 100% en SS).'},
  furia_f:     {id:'furia_f',     family:'furia',     name:'Piedra del Alma: Furia Contenida (F)',  tier:'F', icon:'🔥',
    special:{type:'lowhp_dmg_v2', threshold:0.3, base:0.18, missingScale:0.006},
    desc:'Por debajo del 30% de vida: +18% de daño, y +0.6% adicional por cada 1% de vida que te falte.', preview:'Desde A: probabilidad de revivir una vez por entrada al laberinto (25% en A, 50% en S, 100% en SS).'},
  sombra_e:    {id:'sombra_e',    family:'sombra',    name:'Piedra del Alma: Sombra Cazadora (E)',  tier:'E', icon:'🌑',
    special:{type:'evasion_flat', value:0.03},
    desc:'+3% de probabilidad de esquivar cualquier ataque.', preview:'Desde A: probabilidad de invocar una sombra que atrae el agro de los enemigos (1% en A, 5% en S, 10% en SS; máximo una sombra a la vez).'},
  sombra_f:    {id:'sombra_f',    family:'sombra',    name:'Piedra del Alma: Sombra Cazadora (F)',  tier:'F', icon:'🌑',
    special:{type:'evasion_flat', value:0.06},
    desc:'+6% de probabilidad de esquivar cualquier ataque.', preview:'Desde A: probabilidad de invocar una sombra que atrae el agro de los enemigos (1% en A, 5% en S, 10% en SS; máximo una sombra a la vez).'}
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
  state.char.soulSlots[slotIdx] = null;
  state.char.inventory.push(stone);
  log(`Retiras <b>${stone.name}</b> de tu espacio de alma.`);
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
  return {arma:'Arma', armadura:'Armadura', amuleto:'Amuleto', casco:'Casco', botas:'Botas', guantes:'Guantes'}[slot] || slot;
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

function derived(){
  const fis = baseStat('fis'), esp = baseStat('esp'), hab = baseStat('hab');
  let maxHP = Math.round(40 + fis*8 + state.char.level*5);
  let maxSta = Math.round(20 + fis*3 + hab*2);
  let maxSpi = Math.round(20 + esp*4);
  const eq = state.char.equip;
  EQUIP_SLOTS.forEach(slot=>{
    const it = eq[slot];
    if(it && it.bonus && it.bonus.stat === 'maxhp') maxHP += it.bonus.value*8;
  });
  socketedStones().forEach(s=>{
    if(s.bonus && s.bonus.stat === 'maxhp') maxHP += s.bonus.value*8;
    if(s.bonus && s.bonus.stat === 'maxsta') maxSta += s.bonus.value; // Sabiduría: valor directo, sin escalar
  });
  const critChance = clamp(0.05 + hab*0.006 + (race().id==='bestia'?0.15:0), 0, 0.6);
  let evasionBase = 0.04 + hab*0.005 + (race().id==='hada'?0.15:0);
  socketedStones().forEach(s=>{
    if(s.special && s.special.type==='evasion_flat') evasionBase += s.special.value;
  });
  return {fis,esp,hab,maxHP,maxSta,maxSpi,critChance,evasionBase};
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
    record_level: state.char.record.level,
    record_floor_idx: state.char.record.floorIdx,
    stash: state.char.stash,
    soul_slots: state.char.soulSlots,
    dungeon: state.dungeon
  };
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
      inventory: row.inventory || [],
      itemCounter: row.item_counter || 0,
      maxLevelUnlocked: row.max_level_unlocked || 1,
      record: {level: row.record_level || 1, floorIdx: row.record_floor_idx || 0},
      stash: row.stash || {gold:0, items:[]},
      soulSlots: row.soul_slots || []
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

function itemBonusText(item){
  let txt = item.bonus.stat
    ? `+${item.bonus.value} ${STAT_LABELS[item.bonus.stat] || item.bonus.stat}`
    : `+${item.bonus.value}% Resistencia a ${RES_LABELS[item.bonus.res] || item.bonus.res}`;
  if(item.special){
    if(item.special.type==='aturdir') txt += ` · ${Math.round(item.special.chance*100)}% ${item.special.label}`;
    else if(item.special.type==='robovida') txt += ` · ${Math.round(item.special.percent*100)}% ${item.special.label}`;
  }
  return txt;
}
function itemNameHTML(it){
  const r = RARITIES[it.rarity||'comun'];
  return `<b style="color:${r.color};">${it.name}</b> <span class="slot-tag" style="border-color:${r.color}; color:${r.color};">${r.name}</span>`;
}

function renderInventory(){
  const equippedHTML = EQUIP_SLOTS.map(slot=>{
    const it = state.char.equip[slot];
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

  const gearHTML = gearItems.length ? gearItems.map(it=>`
    <div class="inv-item-row">
      <div>
        ${itemNameHTML(it)} <span class="slot-tag">${slotLabel(it.slot)}</span>
        <div class="inv-item-bonus">${itemBonusText(it)}</div>
      </div>
      <button class="inv-btn" data-equip="${it.uid}">Equipar</button>
    </div>
  `).join('') : `<p class="inv-empty-msg">No llevas equipo suelto en la mochila.</p>`;

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

  const wardHTML = hasWard()
    ? `<div class="inv-item-row">
        <div>
          <b>${WARD_ITEM.icon} ${WARD_ITEM.name}</b>
          <div class="inv-item-bonus neutral">${WARD_ITEM.desc}</div>
        </div>
      </div>`
    : `<p class="inv-empty-msg">No llevas ningún tótem protector. Los élites pueden dejarlo caer.</p>`;

  document.getElementById('main-panel').innerHTML = `
    <div style="display:flex; align-items:center; justify-content:space-between; gap:10px; margin-bottom:4px;">
      <h3 style="color:var(--bronze-light);">Inventario y equipamiento</h3>
      <button class="reset-btn" id="btn-close-inv">Cerrar</button>
    </div>
    <p style="color:var(--text-dim); font-size:0.85em; margin-top:0;">Equipa y desequipa a tu gusto entre combates para ajustar tu estrategia.</p>

    <div class="section-label" style="margin-top:6px;">Equipado</div>
    ${equippedHTML}

    <div class="section-label">Equipo en la mochila</div>
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
  document.querySelectorAll('[data-equip]').forEach(btn=>{
    btn.onclick = ()=> equipItem(btn.dataset.equip);
  });
  document.querySelectorAll('[data-unequip]').forEach(btn=>{
    btn.onclick = ()=> unequipItem(btn.dataset.unequip);
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

function applyPotionEffect(potionId){
  const item = state.char.inventory.find(i=>i.kind==='potion' && i.potionId===potionId);
  if(!item || item.qty<=0){ log('No tienes esa poción.'); return false; }
  const tpl = POTION_TEMPLATES[potionId];
  const d = derived();
  if(tpl.effect.heal==='hp'){
    const amt = Math.round(d.maxHP*tpl.effect.amount);
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

function usePotionInCombat(potionId){
  if(!combat || combat.over) return;
  if(applyPotionEffect(potionId)){
    endPlayerTurn();
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
        <p>Siempre se entra desde el nivel 1, piso 1.</p>
        <button id="btn-enter-dungeon">Entrar (Nivel 1)</button>
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
    <p style="color:var(--text-dim); font-size:0.85em; margin-top:0;">Revisa tu 🎒 Inventario (arriba) para equipar mejor equipo o comprobar cuántas pociones llevas antes de entrar al laberinto. Si mueres dentro perderás el equipo suelto de tu mochila y la mitad de tu oro; si te retiras tras vencer a un guardián, conservas todo.</p>
  `;
  document.getElementById('btn-rest-city').onclick = ()=>{
    const d = derived();
    state.char.curHP = d.maxHP; state.char.curSta = d.maxSta; state.char.curSpi = d.maxSpi;
    log('Descansas en la ciudad. Vida, MP y espíritu restaurados.');
    renderSheet(); save();
  };
  document.getElementById('btn-enter-dungeon').onclick = ()=>{
    const d = derived();
    state.char.curHP = d.maxHP; state.char.curSta = d.maxSta; state.char.curSpi = d.maxSpi;
    state.dungeon = generateDungeon(1);
    log('Entras al laberinto desde el nivel 1. El aire cambia; algo respira ahí dentro.');
    renderAll(); save();
  };
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
const MISSION_OBJECTIVE_TYPES = ['kill_elites','clear_floors','defeat_guardian'];
const MISSION_OBJECTIVE_LABEL = {
  kill_elites:'élite(s) derrotado(s)',
  clear_floors:'piso(s) del laberinto avanzado(s)',
  defeat_guardian:'guardián(es) de nivel derrotado(s)'
};
const MISSION_OBJECTIVE_TARGET = {
  kill_elites:     {E:1, F:1, D:2, C:2, B:2, A:3, S:3, SS:4},
  clear_floors:    {E:3, F:3, D:4, C:4, B:5, A:5, S:6, SS:8},
  defeat_guardian: {E:1, F:1, D:1, C:1, B:1, A:1, S:1, SS:1}
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
// Nivel de referencia por banda de misión, solo para que generateLoot() elija
// una rareza acorde (E/F->común/poco_común, ... hasta D/C-B/A->rango_a como
// techo real — no hace falta un tope aparte, es el rango más alto que existe).
const MISSION_BAND_REFERENCE_LEVEL = [5, 25, 45, 55, 55];
function makeMissionItemReward(band){
  if(band === 0 && chance(0.5)){
    const pool = Object.values(SOUL_STONES).filter(s=>AVAILABLE_SOUL_TIERS.includes(s.tier));
    const tpl = pick(pool);
    return {kind:'soulstone', stoneId:tpl.id, family:tpl.family, name:tpl.name, tier:tpl.tier, icon:tpl.icon, desc:tpl.desc, bonus:tpl.bonus, special:tpl.special};
  }
  return generateLoot(rnd(1,4), MISSION_BAND_REFERENCE_LEVEL[band] || 5);
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
}
async function dismissAlly(allyId){
  const { error } = await supabase.rpc('dismiss_ally', {p_ally_id: allyId});
  if(error){ log('No se pudo despedir al aliado: '+error.message); return; }
  state.char.allies = (state.char.allies||[]).filter(a=>a.id!==allyId);
  log('Despides a un aliado.');
  renderAll();
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
    return `<div class="inv-item-row">
      <div>
        <b>${tpl.icon||'⚔️'} ${a.name}</b> <span class="slot-tag">${a.role} · nivel ${a.level}</span>
        <div class="inv-item-bonus neutral">${tpl.bio||''}</div>
      </div>
      <button class="inv-btn danger" data-dismiss="${a.id}">Despedir</button>
    </div>`;
  }).join('') : `<p class="inv-empty-msg">Todavía no has reclutado a nadie.</p>`;

  const rosterHTML = ALLY_ROSTER.map(tpl=>{
    const already = allies.some(a=>a.template_id===tpl.templateId);
    const cost = allyHireCost(tpl, state.char.level);
    const full = allies.length >= MAX_ALLIES;
    const disabled = already || full || state.char.gold < cost;
    return `<div class="inv-item-row">
      <div>
        <b>${tpl.icon} ${tpl.name}</b> <span class="slot-tag">${tpl.role}</span>
        <div class="inv-item-bonus neutral">${tpl.bio}</div>
      </div>
      <button class="inv-btn" data-hire="${tpl.templateId}" ${disabled?'disabled':''}>${already ? 'Ya reclutado' : `Reclutar (${cost} oro)`}</button>
    </div>`;
  }).join('');

  panel.innerHTML = `
    <div style="display:flex; align-items:center; justify-content:space-between; gap:10px; margin-bottom:4px;">
      <h3 style="color:var(--bronze-light);">Taberna</h3>
      <button class="reset-btn" id="btn-close-taberna">Cerrar</button>
    </div>
    <p style="color:var(--text-dim); font-size:0.85em; margin-top:0;">Hasta ${MAX_ALLIES} aliados a la vez, ${MAX_ALLIES+1} contándote a ti. Pelean junto a ti automáticamente — el que tiene "frontline" ocupa tu lugar en el frente y absorbe los golpes. El mantenimiento diario y el riesgo de traición todavía no están activos.</p>

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
    <div id="admin-list"><p class="inv-empty-msg">Cargando cuentas…</p></div>
  `;
  document.getElementById('btn-close-admin').onclick = ()=>{ adminOpen=false; renderAll(); };
  await loadAdminList();
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
function renderShop(){
  const styleId = state.char.style;
  const opts = WEAPON_OPTIONS[styleId] || {};
  const armaPrice = shopWeaponPrice(false);
  const arma2Price = shopWeaponPrice(true);
  const armaLabel = slotLabel('arma');
  const arma2Label = slotLabel('arma2');

  const weaponRowHTML = (slot, label, price) => `
    <div class="inv-item-row">
      <div>
        <b>${label}</b> <span class="slot-tag">${state.char.style ? style().name : ''}</span>
        <div class="inv-item-bonus">+${shopWeaponValue()} ${STAT_LABELS[SHOP_WEAPON_STAT[styleId]] || ''} · daño puro, sin otras características</div>
      </div>
      <button class="inv-btn" data-buy-weapon="${slot}" ${state.char.gold<price?'disabled':''}>Comprar (${price} oro)</button>
    </div>`;

  const weaponHTML = (opts.arma ? weaponRowHTML('arma', armaLabel, armaPrice) : '')
    + (opts.arma2 ? weaponRowHTML('arma2', arma2Label, arma2Price) : '');

  const gearHTML = SHOP_GEAR_SLOTS.map(slot=>{
    const price = shopGearPrice(slot);
    const bonusText = slot==='amuleto'
      ? `+${COMUN_RES_PCT}% a una resistencia al azar`
      : `+${shopGearValue(slot)} ${STAT_LABELS[GUARDIAN_SLOT_STAT[slot] || 'maxhp'] || ''}`;
    return `<div class="inv-item-row">
      <div>
        <b>${slotLabel(slot)}</b>
        <div class="inv-item-bonus">${bonusText} · sin otras características</div>
      </div>
      <button class="inv-btn" data-buy-gear="${slot}" ${state.char.gold<price?'disabled':''}>Comprar (${price} oro)</button>
    </div>`;
  }).join('');

  const pocoComunHTML = SHOP_GEAR_SLOTS.map(slot=>{
    const price = shopGearPricePocoComun(slot);
    const bonusText = slot==='amuleto'
      ? `+${POCO_COMUN_RES_PCT}% a una resistencia al azar`
      : `+${shopGearValuePocoComun(slot)} ${STAT_LABELS[GUARDIAN_SLOT_STAT[slot] || 'maxhp'] || ''}`;
    return `<div class="inv-item-row">
      <div>
        <b>${slotLabel(slot)}</b> <span class="slot-tag" style="border-color:${RARITIES.poco_comun.color}; color:${RARITIES.poco_comun.color};">Poco común</span>
        <div class="inv-item-bonus">${bonusText}</div>
      </div>
      <button class="inv-btn" data-buy-gear-poco="${slot}" ${state.char.gold<price?'disabled':''}>Comprar (${price} oro)</button>
    </div>`;
  }).join('');

  const selloHTML = SELLO_SHOP_SLOTS.map(slot=>{
    return ['rango_b','rango_a'].map(rarity=>{
      const price = selloShopPrice(rarity);
      const r = RARITIES[rarity];
      const disabled = (state.char.missionCurrency||0) < price;
      return `<div class="inv-item-row">
        <div>
          <b>${slotLabel(slot)}</b> <span class="slot-tag" style="border-color:${r.color}; color:${r.color};">${r.name}</span>
          <div class="inv-item-bonus" style="color:${r.color};">Equipo de rango ${r.name} para tu senda</div>
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
    <p style="color:var(--text-dim); font-size:0.85em; margin-top:0;">Oro disponible: <b>${state.char.gold}</b>. Las armas que vendemos aquí son de rareza común: solo dan daño, sin ventajas adicionales. Solo se ofrecen las que calzan con tu senda de combate (${style().name}).</p>

    <div class="section-label">Armas de tu senda</div>
    ${weaponHTML || '<p class="inv-empty-msg">No hay armas disponibles para tu senda de combate.</p>'}

    <div class="section-label">Equipo común</div>
    ${gearHTML}

    <div class="section-label">Equipo poco común</div>
    ${pocoComunHTML}

    <div class="section-label">Tienda del Gremio (Sellos del Laberinto: ${state.char.missionCurrency||0})</div>
    ${selloHTML}

    <div class="section-label">Pociones</div>
    ${potionHTML}

    <div class="section-label">Vender objetos (50% de su valor)</div>
    ${sellRows || '<p class="inv-empty-msg">No tienes nada que vender por ahora.</p>'}
  `;

  document.getElementById('btn-close-shop').onclick = ()=>{ shopOpen=false; renderAll(); };
  document.querySelectorAll('[data-buy-weapon]').forEach(btn=>{
    btn.onclick = ()=> buyWeapon(btn.dataset.buyWeapon);
  });
  document.querySelectorAll('[data-buy-gear]').forEach(btn=>{
    btn.onclick = ()=> buyGear(btn.dataset.buyGear);
  });
  document.querySelectorAll('[data-buy-gear-poco]').forEach(btn=>{
    btn.onclick = ()=> buyGearPocoComun(btn.dataset.buyGearPoco);
  });
  document.querySelectorAll('[data-buy-sello]').forEach(btn=>{
    btn.onclick = ()=>{
      const [slot, rarity] = btn.dataset.buySello.split('|');
      buySelloGear(slot, rarity);
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

  document.getElementById('main-panel').innerHTML = html;

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
      count = 1;
    } else {
      templates = bestiary.regular;
      count = rnd(1,2);
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
      const item = generateLoot(f, dg.level);
      addToInventory(item);
      msg += item.kind==='potion'
        ? ` También hallas: <b>${POTION_TEMPLATES[item.potionId].name}</b> (guardada en la mochila).`
        : ` También hallas: <b>${item.name}</b> (guardado en la mochila).`;
    }
    log(msg);
    node.done = true;
    renderAll();
  } else if(node.type==='descanso'){
    const d = derived();
    state.char.curHP = d.maxHP;
    state.char.curSta = Math.min(d.maxSta, state.char.curSta + Math.round(d.maxSta*0.5));
    state.char.curSpi = Math.min(d.maxSpi, state.char.curSpi + Math.round(d.maxSpi*0.5));
    log('Una hoguera olvidada. Vida restaurada, MP y espíritu recuperados a medias.');
    node.done = true;
    renderAll();
  }
}

/* ============================================================
   LOOT
   ============================================================ */
// nombres de objeto común compartidos entre el botín del laberinto y la tienda
const COMUN_GEAR_NAMES = {
  arma:['Filo desgastado','Hoja del laberinto','Astilla de hueso','Punta templada'],
  armadura:['Cota remendada','Placa de piedra','Manto raído','Escamas frías'],
  amuleto:['Amuleto de sangre','Talismán roto','Anillo apagado','Cuenta tallada'],
  casco:['Yelmo mellado','Capucha andrajosa','Máscara resquebrajada','Cráneo pulido'],
  botas:['Botas de cuero curtido','Sandalias del errante','Grebas oxidadas','Zapatillas silenciosas'],
  guantes:['Guanteletes de hierro','Manoplas raídas','Guantes de esgrima','Zarpas envueltas']
};
// A partir de qué década empieza a caer cada rareza, y con qué peso — el
// equipo suelto del laberinto ahora sube de rango con la profundidad, no
// solo la tienda de Sellos.
const LOOT_RES_PCT = {comun:COMUN_RES_PCT, poco_comun:POCO_COMUN_RES_PCT, rango_b:RANGO_B_RES_PCT, rango_a:RANGO_A_RES_PCT};
const LOOT_STAT_MULT = {comun:1, poco_comun:1.6, rango_b:2.5, rango_a:3.5};
function lootRarityForLevel(level){
  const decade = decadeIndexForLevel(level||1);
  const roll = Math.random();
  if(decade<=0) return 'comun';
  if(decade===1) return roll<0.75 ? 'comun' : 'poco_comun';
  if(decade===2) return roll<0.55 ? 'comun' : (roll<0.9 ? 'poco_comun' : 'rango_b');
  if(decade===3) return roll<0.4 ? 'comun' : (roll<0.75 ? 'poco_comun' : (roll<0.95 ? 'rango_b' : 'rango_a'));
  if(decade===4) return roll<0.25 ? 'poco_comun' : (roll<0.7 ? 'rango_b' : 'rango_a');
  return roll<0.5 ? 'rango_b' : 'rango_a'; // década 5
}
function generateLoot(floorIdx, level){
  if(chance(0.4)){
    return {kind:'potion', potionId: pick(Object.keys(POTION_TEMPLATES))};
  }
  const rarity = lootRarityForLevel(level||1);
  const slot = pick(['arma','armadura','amuleto','casco','botas','guantes']);
  const statPool = ['fis','esp','hab','maxhp'];
  const kind = chance(0.65) ? {stat: pick(statPool)} : {res: pick(['fisico','fuego','hielo','veneno','aturdimiento'])};
  const value = Math.round((rnd(1,2) + Math.floor(floorIdx/2)) * LOOT_STAT_MULT[rarity]);
  const name = pick(COMUN_GEAR_NAMES[slot]);
  return {kind:'equip', slot, name, bonus: kind.stat ? {stat:kind.stat, value} : {res:kind.res, value: LOOT_RES_PCT[rarity]}, rarity};
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
    if(level===1){
      hp = 200;
      atk = Math.round(26 * lvlMult);
    } else {
      hp = Math.round(300 * lvlMult);
      atk = Math.round(26 * lvlMult);
    }
  } else if(tpl.elite){
    // elite: level 1 baseline ~100-110 HP
    hp = Math.round(rnd(100,110) * floorMult * lvlMult);
    atk = Math.round(16 * floorMult * lvlMult);
  } else {
    // regular mob: level 1 baseline ~40-50 HP, tpl.hp/tpl.atk give per-species variance
    hp = Math.round(rnd(40,50) * tpl.hp * floorMult * lvlMult);
    atk = Math.round(9 * tpl.atk * floorMult * lvlMult);
  }
  const res = Object.assign({}, tpl.res);
  if(tpl.boss && level===1) res.fisico = 5; // defensa física reducida solo para el guardián de nivel 1
  return {
    tpl, name:tpl.name, icon:tpl.icon,
    maxHP:hp, hp:hp, atk:atk, res,
    statuses:[], defending:false, cooldowns:{}
  };
}

/* ============================================================
   COMBAT
   ============================================================ */
function startCombat(enemyGroup, node){
  // v1: los aliados entran a cada combate con la vida al máximo (todavía no
  // se persiste el daño entre peleas ni la sátisfacción por ser derribados —
  // eso es de la siguiente entrega, junto con el mantenimiento recurrente y
  // la lealtad).
  const allies = (state.char.allies||[]).map(makeCombatAlly);
  combat = {
    active:true,
    node,
    enemies:enemyGroup, // slot 0 = front
    allies,
    playerPos:'frente',
    playerStatuses:[],
    playerDefending:false,
    turnLog:[],
    over:false
  };
  invOpen = false;
  const allyText = allies.length ? ` A tu lado: ${allies.map(a=>a.name).join(', ')}.` : '';
  log(`¡Emboscada! Te enfrentas a: ${enemyGroup.map(e=>e.name).join(', ')}.${allyText}`);
  renderAll();
}

function livingAllies(){ return (combat.allies||[]).filter(a=>a.hp>0); }
// A quién apuntan los enemigos: si hay un aliado en el frente con vida, lo
// intercepta a él (como un tanque real); si no, va directo al jugador. El
// jugador nunca se pone "en el frente del grupo" en el sentido de bloquear —
// su Frente/Retaguardia sigue siendo su propia postura de siempre.
function frontlineTarget(){
  const tank = livingAllies().find(a=>a.frontline);
  if(tank) return {kind:'ally', ally:tank};
  return {kind:'player'};
}
function dealDamageToAlly(ally, amount){
  ally.hp = Math.max(0, ally.hp - amount);
}

// Estadísticas de combate del aliado, derivadas de su nivel — v1 no tiene
// equipo ni piedras de alma propias todavía, solo la curva base por rol.
function makeCombatAlly(row){
  const tpl = ALLY_ROSTER.find(t=>t.templateId===row.template_id);
  const lvl = row.level || 1;
  const maxHP = Math.round(40 + lvl*7 + (tpl.frontline ? lvl*3 : 0));
  const atk = Math.round(6 + lvl*1.7);
  return {
    id: row.id, templateId: row.template_id, name: row.name, icon: tpl.icon, role: tpl.role,
    frontline: tpl.frontline, level: lvl,
    maxHP, hp: maxHP, atk, statuses:[]
  };
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
  const furioso = hasStatus(combat.playerStatuses,'Furioso');
  if(furioso) ev += furioso.evasionDelta/100;
  if(combat.playerDefending) ev = Math.max(ev, 0.5);
  if(hasStatus(combat.playerStatuses,'Paralisis')) ev = 0; // indefenso: la Parálisis anula toda evasión, incluso defendiendo
  return {crit:d.critChance, evasion:clamp(ev,0,0.6)};
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

function applyStatus(target, statusDef, isPlayer){
  if(!statusDef) return;
  if(statusDef.chance!==undefined && !chance(statusDef.chance)) return;
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

function applyEquippedSpecials(target, dmgDealt, skill){
  const sources = ['arma','arma2'].map(slot=>state.char.equip[slot]).filter(it=>it && it.special)
    .concat(socketedStones().filter(s=>s.special));
  sources.forEach(it=>{
    const sp = it.special;
    if(sp.type==='aturdir'){
      if(chance(sp.chance)){
        applyStatus(target, {name:'Aturdido', duration:1}, false);
        log(`<b>${it.name}</b> aturde a ${target.name}.`);
      }
    } else if(sp.type==='robovida'){
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
      }
    }
  });
}

function playerUseSkill(skillId, targetIdx){
  if(combat.over) return;
  const skill = SKILLS[skillId];
  const d = derived();

  const miedo = hasStatus(combat.playerStatuses,'Miedo');
  if(miedo && chance(miedo.procChance||0.4)){
    log('El Miedo te paraliza. Pierdes el turno.');
    endPlayerTurn();
    return;
  }

  // resource check
  if(skill.cost){
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
    endPlayerTurn(); return;
  }
  if(skill.utility==='reposition'){
    combat.playerPos = combat.playerPos==='frente' ? 'retaguardia' : 'frente';
    log(`Te mueves a ${combat.playerPos==='frente'?'el Frente':'la Retaguardia'}.`);
    endPlayerTurn(); return;
  }

  // spend cost
  if(skill.cost){
    if(skill.cost.tipo==='estamina') state.char.curSta -= skill.cost.valor;
    else state.char.curSpi -= skill.cost.valor;
    // Sabiduría/Voluntad: probabilidad de recuperar parte de lo gastado
    socketedStones().forEach(s=>{
      if(!s.special) return;
      if(s.special.type==='mp_refund' && skill.cost.tipo==='estamina' && chance(s.special.chance)){
        const d0 = derived();
        const refund = Math.max(1, Math.round(skill.cost.valor*s.special.amount));
        state.char.curSta = Math.min(d0.maxSta, state.char.curSta+refund);
        log(`<b>${s.name}</b> te devuelve ${refund} de MP.`);
      }
      if(s.special.type==='esp_refund' && skill.cost.tipo==='espiritu' && chance(s.special.chance)){
        const d0 = derived();
        const refund = Math.max(1, Math.round(skill.cost.valor*s.special.amount));
        state.char.curSpi = Math.min(d0.maxSpi, state.char.curSpi+refund);
        log(`<b>${s.name}</b> te devuelve ${refund} de espíritu.`);
      }
    });
  }

  // resolve target(s)
  let targets = [];
  if(skill.targetMode==='front'){
    const fi = frontEnemyIndex();
    if(fi<0){ log('No hay ningún enemigo al frente.'); return; }
    targets = [combat.enemies[fi]];
  } else if(skill.targetMode==='any'){
    const t = combat.enemies[targetIdx];
    if(!t || t.hp<=0){ log('Objetivo inválido.'); return; }
    targets = [t];
  } else if(skill.targetMode==='all'){
    targets = livingEnemies();
  } else if(skill.targetMode==='self'){
    targets = [];
  }

  if(skill.utility==='mark'){
    targets.forEach(t=> applyStatus(t, skill.applies, false));
    log(`Marcas a ${targets.map(t=>t.name).join(', ')}.`);
    endPlayerTurn(); return;
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
    endPlayerTurn(); return;
  }

  const confusion = hasStatus(combat.playerStatuses,'Confusion');
  if(confusion && chance(confusion.procChance||0.35)){
    const selfDmg = Math.max(1, Math.round(skillBaseDamage() * skill.mult));
    log(`La Confusión te hace atacar a ciegas... ¡y te golpeas a ti mismo!`);
    dealDamageToPlayer(selfDmg);
    endPlayerTurn();
    return;
  }

  const {crit} = computeCritEvasion();
  const furioso = hasStatus(combat.playerStatuses,'Furioso');
  const raceObj = race();
  const ceguera = hasStatus(combat.playerStatuses,'Ceguera');

  targets.forEach(target=>{
    if(ceguera && chance(ceguera.procChance||0.32)){
      log(`La Ceguera hace que tu golpe hacia ${target.name} no encuentre nada.`);
      return;
    }
    // evasion of enemy (simple: small base)
    let base = skillBaseDamage() * skill.mult * (skill.hits||1);

    // race passives affecting outgoing
    if(raceObj.id==='draconido' && skill.dmgType==='fuego') base *= 1.15;
    if(raceObj.id==='barbaro' && state.char.curHP/d.maxHP < 0.3) base *= 1.2;
    if(furioso) base *= (furioso.dmgMult||1);
    if(hasStatus(combat.playerStatuses,'Debilitado')) base *= 0.85; // te drenaron la fuerza: -15% de daño mientras dure
    socketedStones().forEach(s=>{
      if(s.special && s.special.type==='lowhp_dmg_v2' && state.char.curHP/d.maxHP < s.special.threshold){
        const missingPct = (1 - state.char.curHP/d.maxHP) * 100; // puntos de vida faltantes
        base *= 1 + s.special.base + missingPct*s.special.missingScale;
      }
    });

    // combo: consumes specific status for bonus (machacar)
    let comboText = '';
    if(skill.consumes){
      const st = hasStatus(target.statuses, skill.consumes.name);
      if(st){
        base *= skill.consumes.bonusMult;
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
        base *= (1 + (st.stacks||1)*skill.consumesStackBonus.perStackMult);
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
          base *= (1+opt.bonusMult);
          removeStatus(target.statuses, opt.name);
          comboText = ` ¡Combo elemental! ${opt.name} detonado.`;
          used = true;
        }
      }
      if(!used) base *= (1-(skill.penaltyIfNone||0));
    }
    // marked passive (all incoming dmg +20%)
    if(hasStatus(target.statuses,'Marcado')) base *= 1.2;

    let isCrit = chance(crit);
    if(isCrit) base *= 1.5;

    let ignore = skill.ignoreResist||0;
    let resKey = skill.dmgType==='arcano'? null : skill.dmgType;
    let resVal = resKey ? (target.res[resKey]||0)*(1-ignore) : 0;
    let dmg = base*(1-resVal/100);
    if(skill.penaltyIfFrente && combat.playerPos==='frente') dmg *= (1-skill.penaltyIfFrente);
    dmg = Math.max(1, Math.round(dmg));
    if(target.defending) dmg = Math.round(dmg*0.5);
    target.hp = Math.max(0, target.hp - dmg);

    log(`Usas <b>${skill.name}</b> sobre ${target.name}: ${dmg} de daño${isCrit?' (¡crítico!)':''}.${comboText}`);

    if(skill.applies) applyStatus(target, skill.applies, false);
    applyEquippedSpecials(target, dmg, skill);
  });

  endPlayerTurn();
}

function endPlayerTurn(){
  checkCombatEnd();
  if(combat.over) return;
  resolveAllyTurns();
  checkCombatEnd();
  if(combat.over) return;
  processEnemyTurns();
}

// IA de aliados v1: sin habilidades propias todavía, solo un golpe básico al
// enemigo del frente — salvo el Sacerdote, que prioriza curar a quien esté
// más bajo de vida (tú o otro aliado) antes de atacar.
function resolveAllyTurns(){
  livingAllies().forEach(ally=>{
    if(ally.hp<=0 || combat.over) return;
    if(ally.role==='sacerdote'){
      const d = derived();
      const playerPct = state.char.curHP / d.maxHP;
      const others = livingAllies().filter(a=>a!==ally);
      const mostInjured = others.sort((a,b)=>(a.hp/a.maxHP)-(b.hp/b.maxHP))[0];
      const allyPct = mostInjured ? mostInjured.hp/mostInjured.maxHP : 1;
      if(playerPct < 0.5 && playerPct <= allyPct){
        const heal = Math.round(d.maxHP*0.15);
        const before = state.char.curHP;
        state.char.curHP = Math.min(d.maxHP, state.char.curHP+heal);
        log(`<b>${ally.name}</b> te cura ${state.char.curHP-before} de vida.`);
        return;
      }
      if(mostInjured && allyPct < 0.5){
        const heal = Math.round(mostInjured.maxHP*0.15);
        const before = mostInjured.hp;
        mostInjured.hp = Math.min(mostInjured.maxHP, mostInjured.hp+heal);
        log(`<b>${ally.name}</b> cura a <b>${mostInjured.name}</b> ${mostInjured.hp-before} de vida.`);
        return;
      }
    }
    const fi = frontEnemyIndex();
    if(fi<0) return;
    const enemyTarget = combat.enemies[fi];
    const resVal = (enemyTarget.res && enemyTarget.res.fisico) || 0;
    const dmg = Math.max(1, Math.round(ally.atk*(1-resVal/100)));
    enemyTarget.hp = Math.max(0, enemyTarget.hp - dmg);
    log(`<b>${ally.name}</b> ataca a ${enemyTarget.name}: ${dmg} de daño.`);
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

function processEnemyTurns(){
  combat.playerDefending = false;

  // apply DOT and determine stun per enemy (does not decrement durations yet)
  const stunFlags = new Map();
  combat.enemies.forEach(enemy=>{
    if(enemy.hp<=0) return;
    stunFlags.set(enemy, tickStatuses(enemy.statuses, enemy.name, enemy));
  });

  checkCombatEnd();
  if(combat.over) return;

  livingEnemies().forEach(enemy=>{
    if(enemy.hp<=0) return;
    if(stunFlags.get(enemy)){ log(`${enemy.name} está aturdido y pierde su turno.`); return; }
    enemyAct(enemy);
  });

  // decrement every status exactly once per turn cycle (enemies + player)
  // (player DOT — Sangrado/Quemadura — needs to actually tick before we decrement it away;
  // this call was missing entirely before, so a player bitten by a spider never actually bled)
  tickStatuses(combat.playerStatuses, null, null);
  combat.enemies.forEach(enemy=> decrementStatuses(enemy.statuses));
  decrementStatuses(combat.playerStatuses);

  // player regen
  const d = derived();
  state.char.curSta = Math.min(d.maxSta, state.char.curSta+5);
  state.char.curSpi = Math.min(d.maxSpi, state.char.curSpi+5);

  checkCombatEnd();
  renderAll();
  save();
}

const SUMMON_TEMPLATE = {id:'criatura_menor', name:'Criatura menor invocada', icon:'👾', hp:0.3, atk:0.5, res:{fisico:0,fuego:0,hielo:0,veneno:0,aturdimiento:0}, moves:['pegar']};

function enemyAct(enemy){
  if(!enemy.cooldowns) enemy.cooldowns = {};
  Object.keys(enemy.cooldowns).forEach(k=> enemy.cooldowns[k] = Math.max(0, enemy.cooldowns[k]-1));

  const target = frontlineTarget();
  const evasion = target.kind==='ally' ? 0.06 : computeCritEvasion().evasion; // v1: los aliados no tienen su propia fórmula de evasión todavía, solo una base plana
  if(chance(evasion)){
    log(`${enemy.name} ataca a ${target.kind==='ally' ? target.ally.name : 'ti'}, ¡pero esquiva!`);
    return;
  }

  const available = enemy.tpl.moves.filter(m=> !(m==='invocar' && enemy.cooldowns.invocar>0));
  const move = pick(available.length ? available : enemy.tpl.moves);

  // movimientos de soporte: no hacen daño directo, resuelven su efecto y terminan el turno del enemigo ahí.
  if(move==='curar'){
    const heal = Math.max(1, Math.round(enemy.maxHP*0.12));
    const before = enemy.hp;
    enemy.hp = Math.min(enemy.maxHP, enemy.hp+heal);
    log(`${enemy.name} se cura ${enemy.hp-before} de vida.`);
    return;
  }
  if(move==='buff_pasivo'){
    const buff = hasStatus(enemy.statuses,'Fortalecido');
    if(buff) buff.stacks = (buff.stacks||1)+1;
    else enemy.statuses.push({name:'Fortalecido', duration:99, stacks:1, stack:true});
    log(`${enemy.name} se fortalece con cada turno que pasa.`);
    return;
  }
  if(move==='invocar'){
    enemy.cooldowns.invocar = 5;
    if(combat.enemies.length < 6){
      const minion = makeEnemy(SUMMON_TEMPLATE, state.dungeon.atFloor, state.dungeon.level);
      combat.enemies.push(minion);
      log(`${enemy.name} invoca una criatura menor.`);
    }
    return;
  }

  const d = derived();
  let dmg = enemy.atk;
  const fortalecido = hasStatus(enemy.statuses,'Fortalecido');
  if(fortalecido) dmg = Math.round(dmg * (1 + (fortalecido.stacks||1)*0.04));
  let text = 'ataca';
  // Los efectos negativos (Sangrado, Debilitado, Parálisis, Ceguera, Miedo,
  // Confusión) solo tienen mecánica implementada sobre el jugador por ahora
  // — apuntarle a un aliado con estos movimientos aún no aplica el estado,
  // solo el daño del golpe. Los aliados con su propio set de debuffs quedan
  // para la siguiente entrega de la Taberna.
  const onPlayer = target.kind==='player';
  if(move==='robar'){ text='intenta robar tu oro'; dmg = Math.round(dmg*0.6); }
  if(move==='morder'){ text='muerde, veneno en los colmillos'; if(onPlayer) applyStatus(null, {name:'Sangrado', duration:2, stack:true, maxStack:3}, true); }
  if(move==='debilitar'){ text='drena tu fuerza'; if(onPlayer) applyStatus(null, {name:'Debilitado', duration:2}, true); dmg = Math.round(dmg*0.6); }
  if(move==='aplastar'){ text='golpea con fuerza brutal'; dmg = Math.round(dmg*1.4); }
  if(move==='paralizar'){ text='muerde y paraliza'; if(onPlayer) applyStatus(null, {name:'Paralisis', duration:2, chance:0.5}, true); }
  if(move==='cegar'){ text='arroja algo a tus ojos'; if(onPlayer) applyStatus(null, {name:'Ceguera', duration:2, chance:0.5, procChance:0.32}, true); }
  if(move==='atemorizar'){ text='ruge y siembra el terror'; if(onPlayer) applyStatus(null, {name:'Miedo', duration:2, chance:0.5, procChance:0.4}, true); dmg = Math.round(dmg*0.7); }
  if(move==='confundir'){ text='distorsiona tu percepción'; if(onPlayer) applyStatus(null, {name:'Confusion', duration:2, chance:0.5, procChance:0.35}, true); dmg = Math.round(dmg*0.7); }
  if(move==='area_debil'){ text='golpea a todo tu grupo por igual'; dmg = Math.round(dmg*0.5); }

  let finalDmg;
  if(onPlayer){
    // resistance vs player
    let resVal = totalRes('fisico');
    finalDmg = dmg*(1-resVal/100);
    if(state.char.race==='enano') finalDmg -= 2;
    if(combat.playerDefending) finalDmg *= 0.5;
    const furiosoBuff = hasStatus(combat.playerStatuses,'Furioso');
    if(furiosoBuff && furiosoBuff.incomingDmgReduction) finalDmg *= (1 - furiosoBuff.incomingDmgReduction);
    if(hasStatus(combat.playerStatuses,'Paralisis')) finalDmg *= 1.25; // indefenso: sin evasión y más daño recibido
    finalDmg = Math.max(1, Math.round(finalDmg));
    dealDamageToPlayer(finalDmg);
    log(`${enemy.name} ${text}: ${finalDmg} de daño.`);
  } else {
    finalDmg = Math.max(1, Math.round(dmg));
    dealDamageToAlly(target.ally, finalDmg);
    log(`${enemy.name} ${text} a ${target.ally.name}: ${finalDmg} de daño.`);
    if(target.ally.hp<=0) log(`<b>${target.ally.name}</b> cae en combate — se recuperará al terminar la pelea.`);
  }

  // Vitalidad: devuelve un % del daño físico recibido a quien lo infligió
  // (piedra engarzada del jugador, así que solo aplica cuando el golpe fue
  // contra el propio jugador).
  if(onPlayer){
    socketedStones().forEach(s=>{
      if(s.special && s.special.type==='reflect'){
        const reflected = Math.max(1, Math.round(finalDmg*s.special.pct));
        enemy.hp = Math.max(0, enemy.hp-reflected);
        log(`<b>${s.name}</b> devuelve ${reflected} de daño a ${enemy.name}.`);
      }
    });
  }
}

function checkCombatEnd(){
  if(!combat || combat.over) return;
  if(state.char.curHP<=0){
    combat.over = true;
    log('Caes al suelo. La oscuridad del laberinto te envuelve...');
    handleDefeat();
    return;
  }
  if(livingEnemies().length===0){
    combat.over = true;
    handleVictory();
  }
}

function handleVictory(){
  const isBoss = combat.node.type==='jefe';
  const isElite = combat.node.type==='elite';
  const level = state.dungeon.level || 1;
  const rewardMult = 1 + (level-1)*0.08; // los niveles más duros pagan algo mejor (solo aplica al oro)
  const perKillXP = isBoss ? guardianXP(level) : isElite ? eliteXP(level) : mobXP(level);
  const xpGain = Math.round(perKillXP * combat.enemies.length * (race().id==='humano'?1.1:1));
  const goldGain = Math.round((rnd(6,14)*combat.enemies.length + (isBoss?60:isElite?20:0)) * rewardMult);
  state.char.xp += xpGain;
  state.char.gold += goldGain;
  log(`Victoria. +${xpGain} experiencia, +${goldGain} de oro.`);
  combat.node.done = true;

  if(isElite) advanceMissionsFor('kill_elites', 1);
  if(isBoss) advanceMissionsFor('defeat_guardian', 1);

  if(isElite || isBoss){
    if(chance(0.8)){
      const item = generateLoot(state.dungeon.atFloor, state.dungeon.level);
      addToInventory(item);
      log(item.kind==='potion'
        ? `También obtienes: <b>${POTION_TEMPLATES[item.potionId].name}</b> (guardada en la mochila).`
        : `También obtienes: <b>${item.name}</b> (guardado en la mochila).`);
    }
  }

  if(isElite && !hasWard() && chance(WARD_DROP_CHANCE)){
    addToInventory({kind:'ward'});
    log(`También obtienes: <b>${WARD_ITEM.icon} ${WARD_ITEM.name}</b> (guardado en la mochila).`);
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
    log(`Derrotas al guardián del nivel ${clearedLevel}.`);

    const reward = generateGuardianReward(clearedLevel);
    let rewardText = '';
    if(reward){
      addToInventory(reward);
      log(`El guardián te concede: ${itemNameHTML(reward)} (${itemBonusText(reward)}), guardado en tu mochila.`);
      rewardText = ` El guardián deja tras de sí <b style="color:${RARITIES[reward.rarity].color};">${reward.name}</b>, que recoges de inmediato.`;
    }

    // guardianes de nivel 4 en adelante: 20% (temporal) de soltar una piedra de alma (solo rango E o F por ahora)
    if(clearedLevel >= 4 && chance(0.20)){
      const pool = Object.values(SOUL_STONES).filter(s=>AVAILABLE_SOUL_TIERS.includes(s.tier));
      const tpl = pick(pool);
      addToInventory({kind:'soulstone', stoneId:tpl.id, family:tpl.family, name:tpl.name, tier:tpl.tier, icon:tpl.icon, desc:tpl.desc, preview:tpl.preview, bonus:tpl.bonus, special:tpl.special});
      log(`El guardián también deja caer una <b style="color:${SOUL_TIER_COLORS[tpl.tier]};">${tpl.name}</b> — una piedra de alma de rango ${tpl.tier}.`);
      rewardText += ` También encuentras una piedra de alma: <b style="color:${SOUL_TIER_COLORS[tpl.tier]};">${tpl.name}</b>.`;
    }

    const canContinue = clearedLevel < LEVEL_CAP;
    const bodyText = (canContinue
      ? `Has vencido al guardián del nivel ${clearedLevel}. Puedes seguir adentrándote al nivel ${clearedLevel+1}, o retirarte a la ciudad conservando todo tu botín.`
      : `Has vencido al guardián del nivel ${clearedLevel}, el último conocido del laberinto. Retírate a la ciudad conservando todo tu botín.`) + rewardText;
    const buttons = [];
    if(canContinue){
      buttons.push({label:`Continuar al nivel ${clearedLevel+1}`, primary:true, onClick:()=>{
        combat = null;
        state.dungeon = generateDungeon(clearedLevel+1);
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

function handleDefeat(){
  showOverlay('Caído en el laberinto', `Tu cuerpo cede y el laberinto te expulsa antes del final. Pierdes el equipo suelto que llevabas en la mochila y la mitad de tu oro. Lo que hayas guardado en el Hogar sigue a salvo.`, ()=>{
    const lostItems = state.char.inventory.filter(i=>i.kind==='equip').length;
    const hadWard = hasWard();
    state.char.inventory = state.char.inventory.filter(i=>i.kind!=='equip' && i.kind!=='ward');
    state.char.gold = Math.round(state.char.gold*0.5);
    const d = derived();
    state.char.curHP = Math.round(d.maxHP*0.5);
    state.char.curSta = d.maxSta; state.char.curSpi = d.maxSpi;
    combat = null;
    state.dungeon = null;
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
  {title:'La Taberna', body:'Desde nivel 10, recluta aliados — guerrero, arquero, asesino, mago o sacerdote — pagando oro una sola vez. Pelean junto a ti de forma automática: el que tiene rol de tanque ocupa el Frente y absorbe los golpes por ti.'},
  {title:'Ranking', body:'Tu récord personal (el piso más profundo que has alcanzado) y el top 10 de todos los jugadores.'},
  {title:'Combate por turnos', body:'Cada turno eliges una habilidad o acción. Frente y Retaguardia son tus dos posiciones: la mayoría de golpes físicos fuertes exigen estar en el Frente; la Retaguardia da +8% de evasión y favorece las habilidades a distancia.'},
  {title:'MP y Espíritu', body:'El MP paga tus habilidades físicas. El Espíritu paga las mágicas y de utilidad, y también aumenta tu daño mágico. Reposicionarte cambia entre Frente y Retaguardia, y ocupa tu turno.'},
  {title:'Frente y Retaguardia, con aliados', body:'Cuando tengas un aliado tanque en el Frente, los enemigos no podrán llegar hasta tu Retaguardia sin pasar por él primero — igual que tú no puedes golpear al enemigo de atrás sin resolver primero al de adelante. Posicionarte bien pesará tanto como golpear fuerte.'},
  {title:'Defenderse', body:'Te da al menos 50% de probabilidad de esquivar el próximo golpe, y si aun así te alcanzan, el daño se reduce a la mitad. Es una opción real cuando la pelea se pone difícil, no solo un último recurso.'},
  {title:'El Tótem', body:'Un objeto raro que sueltan los élites. Bloquea gratis, una sola vez y sin gastar tu turno, el golpe que te mataría — pero solo funciona contra el jefe final de una década del laberinto (piso 10, 20, 30...).'},
  {title:'El ciclo nocturno', body:'Entre las 04:00 y las 10:00 (hora de servidor), el laberinto cambia: aparecen enemigos distintos y más peligrosos, con sus propios efectos negativos. Vigila el reloj.'},
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
function renderCombat(){
  const d = derived();
  const s = style();
  const skillIds = s.skills;

  const enemyHTML = combat.enemies.map((e,i)=>{
    const dead = e.hp<=0;
    const slotTag = i===0 ? 'Frente' : (i===1?'Medio':'Fondo');
    const statusChips = e.statuses.map(st=>`<span class="status-chip">${st.name}${st.stacks?(' x'+st.stacks):''} (${st.duration})</span>`).join('');
    const hpPct = clamp(e.hp/e.maxHP*100,0,100);
    const canTargetAny = livingEnemies().length>0;
    return `<div class="enemy-card ${dead?'dead':''} ${!dead && canTargetAny?'targetable':''}" data-idx="${i}">
      <div class="ei">${e.icon}</div>
      <div class="einfo">
        <div class="ename"><span>${e.name}</span><span class="slot-tag">${slotTag}</span></div>
        <div class="bar-track" style="margin-top:4px;"><div class="bar-fill hp" style="width:${hpPct}%"></div></div>
        <div style="font-size:0.7em; color:var(--text-dim); margin-top:2px;">${e.hp}/${e.maxHP} HP</div>
        <div>${statusChips}</div>
      </div>
    </div>`;
  }).join('');

  const playerStatusChips = combat.playerStatuses.map(st=>`<span class="status-chip">${st.name} (${st.duration})</span>`).join('');

  const allyHTML = (combat.allies||[]).map(a=>{
    const dead = a.hp<=0;
    const hpPct = clamp(a.hp/a.maxHP*100, 0, 100);
    const statusChips = (a.statuses||[]).map(st=>`<span class="status-chip">${st.name}${st.stacks?(' x'+st.stacks):''} (${st.duration})</span>`).join('');
    return `<div class="enemy-card ${dead?'dead':''}">
      <div class="ei">${a.icon}</div>
      <div class="einfo">
        <div class="ename"><span>${a.name}</span>${a.frontline ? '<span class="slot-tag">Frente</span>' : ''}</div>
        <div class="bar-track" style="margin-top:4px;"><div class="bar-fill hp" style="width:${hpPct}%"></div></div>
        <div style="font-size:0.7em; color:var(--text-dim); margin-top:2px;">${a.hp}/${a.maxHP} HP</div>
        <div>${statusChips}</div>
      </div>
    </div>`;
  }).join('');

  const skillButtons = skillIds.map(sid=>{
    const sk = SKILLS[sid];
    let disabled = false;
    if(sk.cost){
      const pool = sk.cost.tipo==='estamina'?state.char.curSta:state.char.curSpi;
      if(pool < sk.cost.valor) disabled = true;
    }
    if(sk.requiresPos && combat.playerPos!==sk.requiresPos && !sk.penaltyIfFrente) disabled = true;
    const costText = sk.cost ? `${sk.cost.valor} ${COST_LABELS[sk.cost.tipo] || sk.cost.tipo}` : 'Gratis';
    return `<button class="skill-btn" data-skill="${sid}" ${disabled?'disabled':''}>
      <span class="sname">${sk.name}</span>
      <span class="scost">${costText}${sk.requiresPos?(' · requiere '+ (sk.requiresPos==='frente'?'Frente':'Retaguardia')):''}</span>
      <span class="sdesc">${sk.desc}</span>
    </button>`;
  }).join('');

  const utilButtons = ['ataque_basico','defender','reposicionar'].map(sid=>{
    const sk = SKILLS[sid];
    return `<button class="skill-btn" data-skill="${sid}">
      <span class="sname">${sk.name}</span>
      <span class="scost">Gratis</span>
      <span class="sdesc">${sk.desc}</span>
    </button>`;
  }).join('');

  const potionItems = state.char.inventory.filter(i=>i.kind==='potion');
  const potionButtons = potionItems.length ? potionItems.map(it=>{
    const tpl = POTION_TEMPLATES[it.potionId];
    return `<button class="skill-btn potion-btn" data-potion="${it.potionId}">
      <span class="sname">${tpl.icon} ${tpl.name} <span class="slot-tag">x${it.qty}</span></span>
      <span class="scost">Gratis · consume tu turno</span>
      <span class="sdesc">${tpl.desc}</span>
    </button>`;
  }).join('') : `<p class="inv-empty-msg">No tienes pociones para usar.</p>`;

  document.getElementById('main-panel').innerHTML = `
    <h3 style="color:var(--bronze-light); margin-bottom:10px;">Combate</h3>
    <div class="combat-grid">
      <div class="combat-side">
        <h4>Tú</h4>
        <div class="pos-toggle">
          <span class="pos-pill ${combat.playerPos==='frente'?'active':''}">Frente</span>
          <span class="pos-pill ${combat.playerPos==='retaguardia'?'active':''}">Retaguardia</span>
        </div>
        <div style="font-size:0.7em; color:var(--text-dim); margin:2px 0 6px;">Frente: exige la mayoría de habilidades físicas de golpe. Retaguardia: +8% evasión y mejor para habilidades a distancia.</div>
        <div class="player-card">
          <div class="pc-icon">${race().icon}</div>
          <div style="margin-top:6px; font-size:0.85em;">${state.char.curHP} / ${d.maxHP} HP</div>
          <div style="margin-top:6px;">${playerStatusChips || '<span style="color:var(--text-dim); font-size:0.75em;">Sin efectos activos</span>'}</div>
        </div>
        ${allyHTML ? `<h4 style="margin-top:10px;">Tu equipo</h4><div class="enemy-slots">${allyHTML}</div>` : ''}
      </div>
      <div class="combat-side">
        <h4>Enemigos</h4>
        <div class="enemy-slots">${enemyHTML}</div>
      </div>
    </div>

    <div class="section-label" style="margin-top:4px;">Habilidades de ${s.name}</div>
    <div class="skills-bar">${skillButtons}</div>
    <div class="section-label">Acciones generales</div>
    <div class="skills-bar">${utilButtons}</div>
    <div class="section-label">Pociones</div>
    <p class="inv-combat-note">Beber una poción ocupa tu turno, igual que una habilidad.</p>
    <div class="skills-bar">${potionButtons}</div>
  `;

  let pendingSkill = null;
  document.querySelectorAll('.skill-btn[data-skill]').forEach(btn=>{
    btn.onclick = ()=>{
      const sid = btn.dataset.skill;
      const sk = SKILLS[sid];
      if(sk.targetMode==='any'){
        pendingSkill = sid;
        log(`Elige un objetivo para ${sk.name}.`);
        document.querySelectorAll('.enemy-card.targetable').forEach(card=>{
          card.onclick = ()=>{
            const idx = parseInt(card.dataset.idx);
            playerUseSkill(sid, idx);
          };
        });
      } else {
        playerUseSkill(sid, null);
      }
    };
  });
  document.querySelectorAll('.skill-btn[data-potion]').forEach(btn=>{
    btn.onclick = ()=> usePotionInCombat(btn.dataset.potion);
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
function renderAuthScreen(message){
  const wrap = document.getElementById('auth-box');
  let mode = 'login';
  wrap.innerHTML = `
    <div class="pick-card" style="max-width:380px; margin:0 auto; text-align:left;">
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
function resetHeaderForLoggedOut(){
  document.getElementById('gold-badge').style.display = 'none';
  document.getElementById('tier-badge').style.display = 'none';
  document.getElementById('btn-inventory').style.display = 'none';
  document.getElementById('btn-switch-char').style.display = 'none';
  document.getElementById('btn-slots').style.display = 'none';
  document.getElementById('btn-reset').style.display = 'none';
  document.getElementById('header-sub').textContent = 'El juego que nadie ha superado';
}

function showAuthScreen(message){
  state = null; combat = null;
  invOpen = false; homeOpen = false; shopOpen = false; rankingOpen = false; adminOpen = false;
  currentUser = null; currentProfile = null;
  resetHeaderForLoggedOut();
  renderAuthScreen(message);
  showScreen('screen-auth');
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
