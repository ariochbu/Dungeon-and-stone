// Escena de combate en Canvas para el juego real - puerto generalizado del
// motor de prototype-2d/combat.html (drawActor/attackLunge/rangedAttack/
// drawHealGlow, etc.), adaptado para:
//   1) dibujar CUALQUIER actor con sprite si lo tiene (CLASS_SPRITES/
//      ENEMY_SPRITES) o con su emoji si no lo tiene, en la misma escena
//      (no hay una "tarjeta aparte" para lo que no tiene arte propio);
//   2) posicionarse dinámicamente según la cantidad real de enemigos/
//      aliados de cada combate, no una grilla fija;
//   3) sincronizarse contra el `combat` real de game.js en vez de simular
//      su propio estado de demo.
//
// game.js sigue siendo la única fuente de verdad: este módulo solo lee
// combat.enemies/combat.allies/combat.lastActor/combat.lastAction y dibuja.
// No aplica daño, no decide turnos, no cambia HP.

import { CLASS_SPRITES, ALLY_SPRITES, ENEMY_SPRITES, playerSpriteFor, RACE_SIZE, ALLY_TEMPLATE_SPRITES, enemySpriteFor, enemyChibiKey } from './battleSprites.js?v=90';

import { SpriteAnim, sheetFromMeta } from './spriteAnim.js?v=2';

const TILE = 16;
const SCALE = 3;
const SIZE = TILE * SCALE; // 48px por actor a escala base (sprites fijos sin versión chibi)

// Sprites chibi animados (2026-10-04): tiras con reposo/ataque/golpe/muerte
// en src/assets/chibi, generadas por tools/import_chibi.py. index.json dice el
// tamaño de celda y los cuadros de cada una. Quien no tenga tira (monstruos de
// décadas aún sin arte chibi) sigue con su sprite fijo de siempre.
let CHIBI = {};
fetch('src/assets/chibi/index.json?v=8').then(r=> r.json()).then(j=>{ CHIBI = j; }).catch(()=>{});
const chibiImgs = {}; // key -> Image (cargando o lista)
function chibiAnimFor(key){
  const meta = CHIBI[key];
  if(!meta) return null;
  if(!chibiImgs[key]){ chibiImgs[key] = new Image(); chibiImgs[key].src = `src/assets/chibi/${key}.png?v=5`; }
  const img = chibiImgs[key];
  return img.complete && img.naturalWidth > 0 ? new SpriteAnim(img, sheetFromMeta(meta)) : null;
}
// Fondo ilustrado por década (src/assets/fondos/<década>.jpg).
const bgImgs = {};
function decadeBgImage(decade){
  if(decade == null) return null;
  const key = `${decade*10 + 1}-${decade*10 + 10}`;
  if(!(key in bgImgs)){ bgImgs[key] = new Image(); bgImgs[key].src = `src/assets/fondos/${key}.jpg?v=2`; }
  const img = bgImgs[key];
  return img.complete && img.naturalWidth > 0 ? img : null;
}
let currentDecade = null;
const STATIC_SIZE = 96;
const CHIBI_SCALE = 1.25; // respecto a un cuerpo de 64px (spriteAnim iguala las tiras de más resolución)
// Escena más grande (antes 480x300) para que quepan hasta 6 combatientes por
// bando en filas separadas de frente/retaguardia sin encimarse — pedido
// explícito 2026-09-28, tras ver enemigos y aliados montados unos sobre otros.
const STAGE_W = 640;
const STAGE_H = 450;
const RES = 2;
// Cuatro filas fijas, de arriba abajo: retaguardia enemiga, frente enemigo,
// frente aliado, retaguardia aliada. Los dos frentes quedan cara a cara en el
// centro; cada retaguardia es UNA sola fila detrás de su frente.
const ROW_Y = { enemyBack: 76, enemyFront: 176, partyFront: 286, partyBack: 384 }; // (escena vertical anterior, sin uso)
// Combate HORIZONTAL (2026-10-04, pedido explícito): el grupo a la izquierda y
// los enemigos a la derecha, cada bando en dos columnas — retaguardia y frente —
// con los dos frentes cara a cara en el centro (estilo Darkest Dungeon).
const COL_X = { party: { back: 104, front: 236 }, enemy: { front: 404, back: 536 } };
const COL_Y = { top: 205, bottom: 388 }; // rango de los pies dentro de una columna

// --- estado de módulo: el canvas se crea UNA vez y se reinserta en cada
// sync (renderCombat() destruye su contenedor con innerHTML= en cada
// llamada; el nodo <canvas> en sí sobrevive porque lo mantenemos acá,
// fuera de esa reconstrucción). ---
let canvas = null;
let ctx = null;
let actors = new Map(); // key estable -> actor
let effects = { bursts:[], floats:[], healGlows:[], projectiles:[], trails:[] };
let shake = 0;
let rafId = null;
let clickHandler = null;
let lastCombatRef = null;
let bgParticles = [];
let currentTheme = null;
// Aldric (guerrero) usa el mismo sprite que un jugador Guerrero — si tu
// propia senda es esa, se ven idénticos. Cuando coinciden, se le aplica un
// tinte de color al aliado (ver drawActor) para poder distinguirlos.
let playerSpriteRef = null;
// El canvas tiene una resolución interna fija (480x300) pero su tamaño en
// pantalla se achica en celulares/tablets (CSS width:100%) - sin esto, el
// texto (nombres, números flotantes) se ve fijo en píxeles internos y
// termina diminuto en pantallas angostas. uiScale compensa para que el
// texto mantenga un tamaño legible en píxeles reales sin importar cuánto
// se achique el canvas.
let uiScale = 1;

// Fondos temáticos por década, puerto de prototype-2d/combat.html
// (drawBackground/THEME_FX) — todo dibujado en Canvas, sin assets nuevos.
// 'forest' Bosque Goblin/Arañas, 'cave' Riakis/bestias, 'cult' Usurpador,
// 'sea' Isla Paraíso/El Mar.
// Debe reflejar los mismos buff:true de STATUS_INFO en game.js — duplicado
// acá porque importar game.js desde battleStage.js crearía un ciclo (game.js
// ya importa este módulo). Si se agrega un status buff nuevo allá, agregarlo
// también aquí.
let BUFF_STATUS_NAMES = new Set(['Furioso','Inspirado','Fortalecido']); // se reemplaza con playerInfo.buffNames
// Ícono de cada estado para las fichas bajo las barras. Los nombres son los de
// STATUS_INFO en game.js; uno sin ícono muestra sus dos primeras letras.
const STATUS_ICON = {
  Tambaleo:'💢', Quebranto:'🕯️', 'Armadura Rota':'🛡', Aturdido:'💫', Furioso:'😡', Inspirado:'🎺', Sangrado:'🩸', Veneno:'☠', Marcado:'🎯', Quemadura:'🔥',
  Ralentizado:'🐌', Bendecido:'🔻', 'Bendición':'✨', Fortalecido:'💪', Corrosion:'🧪', Debilitado:'⬇', Voluntad:'🧠',
  'Último Bastión':'🛡', Empapado:'💧', Lluvia:'🌧', 'Cristalización':'💎', 'Forma Robada':'🎭', 'Caos Desatado':'🌪',
  'Sacerdote de la Tormenta':'⚡', Mermado:'📉', Ruina:'🏚', Paralisis:'⛓', Ceguera:'🙈', Miedo:'😱', Confusion:'❓',
  Silencio:'🤐', 'Bastión':'🧱', 'Égida':'🔰',
  'Corrupción':'🥀', 'Ley: Gravedad Reducida':'🪶', 'Ley: Eco Violento':'📣', 'Ley: Carne de Piedra':'🗿', 'Ley: Silencio Arcano':'🔇',
};
// Los estados "para todo el combate" se guardan con duración 99 y van bajando
// (97, 96…): se muestran como ∞ en vez de un número que no dice nada.
const PERMANENT_TURNS = 50;
let banner = null; // nombre de la acción en curso, arriba al centro
// Explicación de un estado al pasar el ratón o tocar su ficha (2026-10-04): los
// aliados no tienen tarjeta arriba como el jugador y el enemigo, así que la
// ficha bajo sus barras era el único sitio donde ver qué les pasa.
let STATUS_INFO_REF = {};   // nombre -> {buff, desc}, llega de game.js
let chipRects = [];         // fichas dibujadas en este cuadro: {x, y, w, h, st, owner}
let statusTip = null;       // {st, owner, x, y, until} — `until` solo si se fijó con un toque
function chipAt(sx, sy){
  // margen generoso: en el celular la ficha mide unos pocos milímetros
  return chipRects.find(c=> sx >= c.x - 5 && sx <= c.x + c.w + 5 && sy >= c.y - 7 && sy <= c.y + c.h + 7) || null;
}
function stagePoint(evt){
  const rect = canvas.getBoundingClientRect();
  return [(evt.clientX - rect.left)*STAGE_W/rect.width, (evt.clientY - rect.top)*STAGE_H/rect.height];
}
function drawStatusTip(){
  if(!statusTip) return;
  if(statusTip.until && performance.now() > statusTip.until){ statusTip = null; return; }
  const st = statusTip.st, info = STATUS_INFO_REF[st.name] || {}, buff = BUFF_STATUS_NAMES.has(st.name);
  const fs = Math.round(11*Math.min(uiScale, 1.7)), lh = fs + 4, maxW = Math.min(STAGE_W - 16, 250*Math.min(uiScale, 1.5));
  const title = `${STATUS_ICON[st.name] ? STATUS_ICON[st.name] + ' ' : ''}${st.name}`;
  const meta = [st.stacks > 1 ? `x${st.stacks} cargas` : '', st.duration != null ? (st.duration >= PERMANENT_TURNS ? 'hasta el final del combate' : `${st.duration} turno${st.duration === 1 ? '' : 's'}`) : ''].filter(Boolean).join(' · ');
  ctx.save();
  ctx.font = `${fs}px Georgia, serif`; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
  // parte la descripción en renglones que quepan
  const words = (info.desc || 'Sin descripción.').split(' '), lines = [];
  let cur = '';
  words.forEach(w=>{ const t = cur ? cur + ' ' + w : w; if(ctx.measureText(t).width > maxW - 16 && cur){ lines.push(cur); cur = w; } else cur = t; });
  if(cur) lines.push(cur);
  const head = `${title}${meta ? '  ·  ' + meta : ''}`;
  ctx.font = `bold ${fs}px Georgia, serif`;
  const w = Math.min(maxW, Math.max(ctx.measureText(head).width, ...lines.map(l=>{ ctx.font = `${fs}px Georgia, serif`; return ctx.measureText(l).width; })) + 16);
  const h = lh*(lines.length + 2) + 8;
  let x = Math.max(6, Math.min(STAGE_W - w - 6, statusTip.x - w/2));
  let y = statusTip.y - h - 10; if(y < 6) y = statusTip.y + 22;
  ctx.fillStyle = 'rgba(14,11,9,0.96)'; ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = buff ? '#7ed957' : '#ff8a80'; ctx.lineWidth = 1; ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  ctx.font = `bold ${fs}px Georgia, serif`; ctx.fillStyle = buff ? '#b9f7c4' : '#ffc4bd'; ctx.fillText(head, x + 8, y + 6);
  ctx.font = `${fs}px Georgia, serif`; ctx.fillStyle = '#a89a84'; ctx.fillText(`${buff ? 'Beneficio' : 'Perjuicio'} sobre ${statusTip.owner}`, x + 8, y + 6 + lh);
  ctx.fillStyle = '#e8dfcf'; lines.forEach((l, i)=> ctx.fillText(l, x + 8, y + 6 + lh*(i + 2)));
  ctx.restore();
}

const THEME_FX = {
  forest: { tint:'rgba(140,215,120,0.16)', particle:'rgba(210,240,160,0.6)' },
  cave:   { tint:'rgba(120,170,255,0.14)', particle:'rgba(175,225,255,0.55)' },
  cult:   { tint:'rgba(220,140,60,0.16)',  particle:'rgba(255,190,100,0.6)' },
  sea:    { tint:'rgba(120,210,255,0.16)', particle:'rgba(225,248,255,0.6)' },
};

function spawnBgParticles(theme){
  const fx = THEME_FX[theme] || THEME_FX.forest;
  bgParticles = [];
  for(let i=0;i<14;i++){
    bgParticles.push({
      x: Math.random()*STAGE_W, y: Math.random()*STAGE_H,
      r: 1+Math.random()*1.8, speed: 0.12+Math.random()*0.18,
      phase: Math.random()*Math.PI*2, color: fx.particle,
    });
  }
}
function drawBgParticles(){
  ctx.save();
  bgParticles.forEach(p=>{
    p.y -= p.speed; p.phase += 0.02;
    if(p.y < -4){ p.y = STAGE_H+4; p.x = Math.random()*STAGE_W; }
    ctx.globalAlpha = 0.7; ctx.fillStyle = p.color;
    ctx.beginPath(); ctx.arc(p.x+Math.sin(p.phase)*6, p.y, p.r, 0, Math.PI*2); ctx.fill();
  });
  ctx.restore();
}

function drawBackground(theme){
  const w = STAGE_W, h = STAGE_H;
  const skyH = h; // toda la escena es "cielo/ambiente" temático, sin franja de piso separada
  if(theme==='cave'){
    const g = ctx.createLinearGradient(0,0,0,h);
    g.addColorStop(0,'#241a14'); g.addColorStop(1,'#4a3626');
    ctx.fillStyle=g; ctx.fillRect(0,0,w,h);
    for(let i=0;i<22;i++){
      const rx=(i*67+23)%w, ry=8+(i*23)%(h-20);
      ctx.fillStyle = i%2===0 ? 'rgba(0,0,0,0.24)' : 'rgba(140,105,70,0.16)';
      ctx.beginPath();
      ctx.moveTo(rx,ry); ctx.lineTo(rx+15,ry+6); ctx.lineTo(rx+8,ry+19); ctx.lineTo(rx-11,ry+14);
      ctx.closePath(); ctx.fill();
    }
    for(let x=4;x<w;x+=34){
      const len = 26+((x*13)%30);
      ctx.fillStyle='#140f0b';
      ctx.beginPath(); ctx.moveTo(x-13,0); ctx.lineTo(x+13,0); ctx.lineTo(x,len); ctx.closePath(); ctx.fill();
      ctx.fillStyle='rgba(255,255,255,0.07)';
      ctx.beginPath(); ctx.moveTo(x-13,0); ctx.lineTo(x-4,0); ctx.lineTo(x,len*0.6); ctx.closePath(); ctx.fill();
    }
    ctx.fillStyle='rgba(150,220,255,0.6)';
    [[70,44],[240,60],[400,40]].forEach(([x,y])=>{ ctx.beginPath(); ctx.arc(x,y,2.6,0,Math.PI*2); ctx.fill(); });
  } else if(theme==='cult'){
    const g = ctx.createLinearGradient(0,0,0,h);
    g.addColorStop(0,'#150e1a'); g.addColorStop(1,'#241628');
    ctx.fillStyle=g; ctx.fillRect(0,0,w,h);
    ctx.fillStyle='rgba(190,150,70,0.28)'; ctx.fillRect(0,0,w,4);
    const gold='#d4af5a', goldDark='#8a6a2a';
    for(let x=20; x<w; x+=76){
      ctx.fillStyle=goldDark; ctx.fillRect(x-2, 30, 4, h-40);
      ctx.fillStyle=gold;
      ctx.beginPath(); ctx.moveTo(x-9,32); ctx.lineTo(x+9,32); ctx.lineTo(x,20); ctx.closePath(); ctx.fill();
      const flick = 2+Math.sin(Date.now()/220+x)*1.3;
      const fg = ctx.createRadialGradient(x,14,0,x,14,7+flick);
      fg.addColorStop(0,'#fff3c4'); fg.addColorStop(0.5,'#ffb347'); fg.addColorStop(1,'rgba(255,120,40,0)');
      ctx.fillStyle=fg;
      ctx.beginPath(); ctx.ellipse(x,14,6,9+flick,0,0,Math.PI*2); ctx.fill();
    }
  } else if(theme==='sea'){
    const g = ctx.createLinearGradient(0,0,0,h);
    g.addColorStop(0,'#6fd0ea'); g.addColorStop(1,'#1f6fa8');
    ctx.fillStyle=g; ctx.fillRect(0,0,w,h);
    ctx.strokeStyle='rgba(255,255,255,0.4)'; ctx.lineWidth=2;
    for(let row=0; row<5; row++){
      const y = 18+row*(h/6);
      ctx.beginPath();
      for(let x=0;x<=w;x+=14){ ctx.lineTo(x, y+Math.sin((x+row*40)/16)*4); }
      ctx.stroke();
    }
  } else { // forest (default) — Bosque Goblin, Arañas
    const g = ctx.createLinearGradient(0,0,0,h);
    g.addColorStop(0,'#7fb877'); g.addColorStop(1,'#3a5c38');
    ctx.fillStyle=g; ctx.fillRect(0,0,w,h);
    ctx.fillStyle='#2c4e29';
    for(let x=-20;x<w+40;x+=36){ ctx.beginPath(); ctx.arc(x,26,24,0,Math.PI*2); ctx.fill(); }
    ctx.fillStyle='#1c3a1a';
    for(let x=-30;x<w+40;x+=50){ ctx.beginPath(); ctx.arc(x+22,58,32,0,Math.PI*2); ctx.fill(); }
  }
  const fx = THEME_FX[theme];
  if(fx){
    ctx.save();
    ctx.globalCompositeOperation = 'overlay';
    ctx.fillStyle = fx.tint;
    ctx.fillRect(0, 0, w, skyH);
    ctx.restore();
  }
}

function ensureCanvas(container){
  if(!canvas){
    canvas = document.createElement('canvas');
    // Más alto que antes (220->300) a propósito: con el menú Pokémon-style
    // y el HUD de HP/MP/Espíritu en HTML (ver renderCombat en game.js)
    // sobraba espacio abajo que antes ocupaban las tarjetas viejas — se usa
    // ese espacio para agrandar la escena en vez de dejarlo vacío.
    // Resolución interna al doble: la escena se estira para aprovechar pantallas
    // anchas y así el texto y los sprites no se ven borrosos.
    canvas.width = STAGE_W*RES; canvas.height = STAGE_H*RES;
    canvas.style.width = '100%';
    // Tan ancha como deje el panel, sin que el menú de combate se salga de la pantalla.
    canvas.style.maxWidth = `min(1100px, calc((100vh - 300px) * ${STAGE_W} / ${STAGE_H}))`;
    canvas.style.minWidth = 'min(100%, 420px)';
    canvas.style.height = 'auto';
    canvas.style.display = 'block';
    canvas.style.margin = '0 auto';
    canvas.style.background = '#14110f'; // fallback hasta el primer draw(); el tema real lo pinta drawBackground()
    canvas.style.borderRadius = '6px';
    canvas.style.border = '1px solid var(--border)';
    canvas.style.cursor = 'default';
    ctx = canvas.getContext('2d');
    canvas.addEventListener('click', onCanvasClick);
    canvas.addEventListener('mousemove', (evt)=>{
      const [sx, sy] = stagePoint(evt), c = chipAt(sx, sy);
      if(c){ statusTip = {st: c.st, owner: c.owner, x: c.x + c.w/2, y: c.y}; canvas.style.cursor = 'help'; }
      else { if(statusTip && !statusTip.until) statusTip = null; canvas.style.cursor = 'default'; }
    });
    canvas.addEventListener('mouseleave', ()=>{ if(statusTip && !statusTip.until) statusTip = null; });
    startLoop();
  }
  if(canvas.parentElement !== container){
    container.appendChild(canvas);
  }
}

function startLoop(){
  if(rafId) return;
  const step = ()=>{ draw(); rafId = requestAnimationFrame(step); };
  rafId = requestAnimationFrame(step);
}

// --- construcción/actualización de actores a partir del combat real ---

function keyFor(kind, entity, idx){
  if(kind==='player') return 'player';
  if(kind==='enemy') return 'enemy:'+idx; // el índice ES el identificador real (data-idx de antes)
  return 'ally:'+entity.id;
}

function spriteFor(kind, entity, playerStyle, playerRace){
  if(kind==='player') return playerSpriteFor(playerStyle, playerRace);
  if(kind==='enemy') return enemySpriteFor(entity);
  if(kind==='ally') return ALLY_TEMPLATE_SPRITES[entity.templateId] || ALLY_SPRITES[entity.role] || null;
  return null;
}

function roleFor(kind, entity, playerStyle){
  if(kind==='player') return ['tirador','mago','hechicero'].includes(playerStyle) ? 'ranged' : 'melee';
  if(kind==='ally') return ['arquero','mago','sacerdote'].includes(entity.role) ? 'ranged' : 'melee';
  // Enemigos: solo la primera década traía `role`; el resto caía en 'melee' y
  // los de arco o báculo embestían cuerpo a cuerpo. Ahora los que atacan a
  // distancia se listan aquí (2026-10-09). Para sumar uno: agregar su id.
  if(!entity.tpl) return 'melee';
  if(entity.tpl.role === 'ranged' || entity.tpl.role === 'mago' || RANGED_ENEMY_IDS.has(entity.tpl.id)) return 'ranged';
  return 'melee';
}
const RANGED_ENEMY_IDS = new Set([
  'goblin_arquero', 'goblin_chaman', 'tarantula_tejedora',
  'cazarrecompensas', 'cazador_veterano', 'medico_campana',
  'triton_hechicero', 'sirena_corrupta', 'naga_arquero', 'naga_capitan', 'sacerdotisa_mareas', 'naga_maestro', 'sirena_matriarca',
  'ojo_reflujo', 'pastor_errores', 'eco_heredado',
  'hongo_osario', 'semilla_doliente', 'madre_micelio', 'heraldo_flor_negra', 'flor_mil_voces',
]);

// Reparte `count` actores en UNA sola fila centrada, sin límite de cuántos
// caben en frente o en retaguardia: el ancho de cada casilla se achica solo
// cuando la fila se llena.
function layoutRowAt(count, y){
  const slot = Math.min(150, (STAGE_W - 24) / Math.max(1, count));
  const span = slot * count;
  const out = [];
  for(let i=0;i<count;i++){
    out.push({x: STAGE_W/2 - span/2 + slot*(i+0.5), y, gap: slot, nameMaxW: slot*0.9});
  }
  return out;
}

// Separa `items` en fila de frente y fila de retaguardia según isFront(it) y
// devuelve la posición de cada uno en el mismo orden en que vinieron. Sin
// topes por fila: 5 tanques van los 5 al frente, y así.
function layoutByDepth(items, isFront, frontY, backY){
  const frontIdx = [], backIdx = [];
  items.forEach((it,i)=>{ (isFront(it) ? frontIdx : backIdx).push(i); });
  const out = new Array(items.length);
  layoutRowAt(frontIdx.length, frontY).forEach((p,k)=>{ out[frontIdx[k]] = p; });
  layoutRowAt(backIdx.length, backY).forEach((p,k)=>{ out[backIdx[k]] = p; });
  return out;
}

// Reparte los actores de un bando en sus dos columnas. Dentro de cada columna
// se apilan de arriba abajo; con tres o más se alternan un poco hacia adelante
// para que no queden uno encima del otro.
function layoutColumns(items, isFront, side){
  const out = new Array(items.length);
  const fwd = side === 'party' ? 1 : -1;
  [true, false].forEach(front=>{
    const idxs = [];
    items.forEach((it, i)=>{ if(isFront(it) === front) idxs.push(i); });
    const n = idxs.length, x0 = COL_X[side][front ? 'front' : 'back'];
    idxs.forEach((i, k)=>{
      // Hasta 3 por columna van apilados; con 4 o más (grupos de 5-6 enemigos,
      // o todo el equipo en la misma fila) la columna se parte en dos hileras
      // intercaladas, la segunda hacia afuera, para que no se encimen.
      if(n > 3){
        const rows = Math.ceil(n/2), sub = k % 2, r = Math.floor(k/2);
        const y = rows === 1 ? (COL_Y.top + COL_Y.bottom)/2 : COL_Y.top + (COL_Y.bottom - COL_Y.top) * (r + sub*0.5)/(rows - 0.5);
        out[i] = {x: x0 + (sub ? -58*fwd : 10*fwd), y, gap: 80, nameMaxW: 70};
        return;
      }
      const y = n === 1 ? (COL_Y.top + COL_Y.bottom)/2 : COL_Y.top + (COL_Y.bottom - COL_Y.top) * k/(n - 1);
      const stagger = n >= 3 ? (k % 2 ? 34 : -10) * fwd : 0;
      out[i] = {x: x0 + stagger, y, gap: 110, nameMaxW: 104};
    });
  });
  return out;
}

function syncBattleStage(container, combat, playerInfo, onTargetClick){
  ensureCanvas(container);
  clickHandler = onTargetClick;
  lastCombatRef = combat;

  currentDecade = playerInfo.bgDecade != null ? playerInfo.bgDecade : null;
  if(playerInfo.buffNames) BUFF_STATUS_NAMES = new Set(playerInfo.buffNames);
  if(playerInfo.statusInfo) STATUS_INFO_REF = playerInfo.statusInfo;
  const theme = playerInfo.bgTheme || 'forest';
  if(theme !== currentTheme){ currentTheme = theme; spawnBgParticles(theme); }

  const seen = new Set();

  // El jugador es un combatiente más: se ubica en la fila de Frente o de
  // Retaguardia según su formación real, igual que cualquier aliado, sin un
  // lugar propio en el centro.
  const allies = combat.allies||[];
  const playerSlot = { isPlayer:true, pos: playerInfo.pos };
  const party = [playerSlot, ...allies];
  const playerPartyIdx = 0;
  const partyPos = layoutColumns(party, p=> p.pos==='frente', 'party');

  // jugador: su Y también refleja su formación real (Frente/Retaguardia, el
  // mismo botón "Reposicionarse" de siempre) en vez de quedar siempre fijo
  // — igual que los aliados y los enemigos.
  {
    const k = 'player';
    seen.add(k);
    let a = actors.get(k);
    if(!a){ a = makeActor(k); actors.set(k, a); }
    const pp = partyPos[playerPartyIdx];
    a.baseX = pp.x; a.baseY = pp.y; a.x = a.baseX; a.y = a.baseY;
    playerSpriteRef = spriteFor('player', null, playerInfo.style, playerInfo.race);
    Object.assign(a, {
      kind:'player', name: playerInfo.name, icon: playerInfo.icon, nameMaxW: pp.nameMaxW, chibiKey: `${playerInfo.style}_${playerInfo.race}`,
      sprite: playerSpriteRef, role: roleFor('player', null, playerInfo.style), sizeMul: RACE_SIZE[playerInfo.race] || 1,
      hp: playerInfo.hp, maxHP: playerInfo.maxHP, mp: playerInfo.mp, maxMP: playerInfo.maxMP,
      spirit: playerInfo.spirit, maxSpirit: playerInfo.maxSpirit, alive: playerInfo.hp>0,
      shield: playerInfo.shield||0,
      showResources:true, statuses: playerInfo.statuses||[], targetable:false,
      side:'party',
    });
  }

  // aliados: los que están en el frente (pos==='frente') se dibujan más
  // cerca de los enemigos que los de retaguardia, siguiendo su formación real.
  const allyPos = partyPos.slice(1);
  (combat.allies||[]).forEach((ally, i)=>{
    const k = keyFor('ally', ally);
    seen.add(k);
    let a = actors.get(k);
    if(!a){ a = makeActor(k); actors.set(k, a); }
    a.baseX = allyPos[i].x; a.baseY = allyPos[i].y; a.x = a.baseX; a.y = a.baseY;
    const hostile = typeof clickHandler.isAllyHostile==='function' && clickHandler.isAllyHostile(ally.id);
    Object.assign(a, {
      kind:'ally', refIdx:i, name: ally.name, icon: ally.icon, nameMaxW: allyPos[i].nameMaxW, sprite: spriteFor('ally', ally), chibiKey: 'aliado_' + ally.templateId,
      role: roleFor('ally', ally), hp: ally.hp, maxHP: ally.maxHP, mp: ally.mp, maxMP: ally.maxMP,
      spirit: ally.spirit, maxSpirit: ally.maxSpirit, alive: ally.hp>0, shield: ally.shield||0, showResources:true,
      statuses: ally.statuses||[], targetable: hostile && ally.hp>0, side:'party',
    });
  });

  // enemigos: los de línea frontal (tanques/melee, tpl.frontline) se dibujan
  // más cerca del grupo del jugador; los de soporte/distancia quedan atrás.
  // Las invocaciones muertas (crías de la Matriarca, copias del Usurpador,
  // cangrejos del Custodio…) no ocupan lugar: su cuerpo se desvanece donde
  // cayó. Antes se quedaban en el reparto y se iban apilando al fondo cada
  // vez que el jefe volvía a invocar.
  const allEnemies = combat.enemies||[];
  const gone = allEnemies.map(e=> !!(e.summoned && e.hp<=0));
  const standingPos = layoutColumns(allEnemies.filter((e, i)=> !gone[i]), e=> !!(e.tpl && e.tpl.frontline), 'enemy');
  const enemyPos = []; { let n = 0; allEnemies.forEach((e, i)=>{ enemyPos[i] = gone[i] ? null : standingPos[n++]; }); }
  // Si ya no queda ningún enemigo de línea frontal vivo, la retaguardia
  // queda desbloqueada para elegir objetivo (ver playerFrontTargetIndices en
  // game.js) — el resaltado visual debe reflejar exactamente lo mismo.
  const anyFrontAlive = (combat.enemies||[]).some(e=>e.hp>0 && e.tpl && e.tpl.frontline);
  (combat.enemies||[]).forEach((en, i)=>{
    const k = keyFor('enemy', en, i);
    let a = actors.get(k);
    if(gone[i]){
      // ya cayó: se queda donde estaba hasta desvanecerse (si nunca se llegó a dibujar, no aparece)
      if(a){ seen.add(k); Object.assign(a, {hp:0, alive:false, vanish:true, targetable:false, statuses:[]}); }
      return;
    }
    seen.add(k);
    if(!a){ a = makeActor(k); actors.set(k, a); }
    a.baseX = enemyPos[i].x; a.baseY = enemyPos[i].y; a.x = a.baseX; a.y = a.baseY;
    Object.assign(a, {
      vanish:false, kind:'enemy', refIdx:i, name: en.name, icon: en.icon, nameMaxW: enemyPos[i].nameMaxW, sprite: spriteFor('enemy', en), chibiKey: enemyChibiKey(en), sizeMul: en.tpl && en.tpl.boss ? 1.3 : (en.tpl && en.tpl.elite ? 1.12 : (en.tpl && en.tpl.decoy ? 0.9 : (en.summoned ? 0.8 : 1))),
      role: roleFor('enemy', en), hp: en.hp, maxHP: en.maxHP, alive: en.hp>0, showResources:false,
      statuses: en.statuses||[],
      // Con pendingTargetFilter==='front' (2026-09-25: elegir a cuál de 2+
      // objetivos elegibles atacar) solo se resalta el conjunto elegible del
      // momento: si sigue vivo algún frontline, solo esos; si ya no queda
      // ninguno, toda la retaguardia queda desbloqueada — el resto sigue sin
      // poder recibir el click (ver onTarget/playerFrontTargetIndices).
      targetable: en.hp>0 && (combat.pendingTargetFilter!=='front' || !anyFrontAlive || !!(en.tpl && en.tpl.frontline)),
      side:'enemy',
    });
  });

  // limpia actores que ya no corresponden (combate terminó / se reinició)
  for(const k of Array.from(actors.keys())){
    if(!seen.has(k)) actors.delete(k);
  }
}

function makeActor(key){
  return {
    key, x:0, y:0, baseX:0, baseY:0, scale:1, squashY:1,
    bob: Math.random()*6, flash:0, opacity:1,
  };
}

// --- animación de una acción real (lastActor/lastAction de game.js) ---

function actorForLastActor(lastActor){
  if(!lastActor) return null;
  if(lastActor.kind==='player') return actors.get('player');
  if(lastActor.kind==='ally') return actors.get('ally:'+lastActor.id);
  if(lastActor.kind==='enemy') return actors.get('enemy:'+lastActor.idx);
  return null;
}
function actorForEffect(ef){
  // Una acción sin efectos (esquivar, bloquear, aturdido, replegarse,
  // Bendición Sagrada de Delyth, etc. — todas usan effects:[]) hace que
  // playBattleAnim() pida el actor del efecto [0] de un array vacío
  // (undefined) — sin este guard, esto tiraba una excepción no capturada
  // a mitad de un await de resolveAllyTurns/processEnemyTurns, cortando en
  // seco el resto de esa cadena de turnos (el resto de aliados/enemigos que
  // todavía no actuaban, el tick de estados, el render final) mientras el
  // finally de guardedPlayerUseSkill igual liberaba el menú — exactamente el
  // patrón reportado hoy: "puedo atacar de nuevo, nadie más se movió" y
  // "Sangrado no baja su duración cada turno".
  if(!ef) return null;
  if(ef.targetKind==='player') return actors.get('player');
  if(ef.targetKind==='ally') return actors.get('ally:'+ef.key);
  if(ef.targetKind==='enemy') return actors.get('enemy:'+ef.key);
  return null;
}

function tween(ms, fn){
  return new Promise(res=>{
    const start = performance.now();
    function frame(now){
      const t = Math.min(1, (now-start)/ms);
      fn(t);
      if(t<1) requestAnimationFrame(frame); else res();
    }
    requestAnimationFrame(frame);
  });
}
const easeOutCubic = t=> 1-Math.pow(1-t,3);
const easeInCubic = t=> t*t*t;

async function playBattleAnim(lastActor, lastAction){
  const actor = actorForLastActor(lastActor);
  if(!actor || !lastAction) return;

  const heals = (lastAction.effects||[]).filter(e=>e.kind==='heal');
  const dmgs = (lastAction.effects||[]).filter(e=>e.kind==='dmg');
  const firstTarget = actorForEffect((lastAction.effects||[])[0]) || actor;

  shake = Math.max(shake, dmgs.length ? 3 : 0);
  const hasEffect = dmgs.length || heals.length;
  if(lastAction.label){
    // Con efecto (golpe, cura): cartel arriba con el nombre de la habilidad.
    // Sin efecto (esquiva, bloqueo, turno perdido, beneficio): texto sobre quien actúa.
    // (el golpe básico no lleva cartel: saldría en casi todos los turnos)
    if(hasEffect){ if(!/^(Ataque|Ataque básico)$/i.test(lastAction.label)) banner = {text: lastAction.label, life: 1, side: actor.side}; }
    else effects.floats.push({x: actor.baseX, y: actor.baseY - 92, text: lastAction.label, color: '#ffe9a8', life: 1.3});
  }
  if(actor.anim && actor.alive !== false && hasEffect) actor.anim.play('attack');

  if(actor.role==='ranged'){
    await rangedAnim(actor, firstTarget, heals.length ? '#7ed957' : '#ffd58a');
  } else if(dmgs.length || heals.length){
    await lungeAnim(actor, firstTarget);
  } else {
    // acción sin objetivo (buff propio, defensa, etc.): un pequeño "squash" de feedback
    await tween(160, t=>{ actor.scale = 1 - 0.08*Math.sin(t*Math.PI); });
    actor.scale = 1;
  }

  (lastAction.effects||[]).forEach(ef=>{
    const target = actorForEffect(ef);
    if(!target) return;
    target.flash = ef.kind==='dmg' ? 1 : 0;
    if(ef.kind==='dmg' && target.anim && target.alive !== false && target !== actor) target.anim.play('hurt');
    const label = (ef.kind==='heal'?'+':'-') + ef.amount;
    effects.floats.push({x:target.x||target.baseX, y:(target.y||target.baseY)-84, text:label, color: ef.kind==='heal'?'#7ed957':'#ff6b6b', life:1});
    if(ef.kind==='heal') effects.healGlows.push({x:target.x||target.baseX, y:(target.y||target.baseY)-30, life:1});
    else effects.bursts.push({x:target.x||target.baseX, y:(target.y||target.baseY)-30, life:1});
  });

  await sleep(120);
}
function sleep(ms){ return new Promise(r=>setTimeout(r,ms)); }

async function lungeAnim(actor, target){
  const sx=actor.baseX, sy=actor.baseY;
  const dx = target.baseX + (actor.side==='party' ? -46 : 46);
  const dy = target.baseY + 2;
  await tween(160, t=>{ const e=easeOutCubic(t); actor.x=sx+(dx-sx)*e; actor.y=sy+(dy-sy)*e; actor.scale=1+0.1*e; });
  await tween(80, ()=>{});
  await tween(180, t=>{ const e=easeInCubic(t); actor.x=dx+(sx-dx)*e; actor.y=dy+(sy-dy)*e; actor.scale=1.1-0.1*e; });
  actor.x=sx; actor.y=sy; actor.scale=1;
}

async function rangedAnim(actor, target, color){
  await tween(100, t=>{ actor.scale = 1-0.08*easeOutCubic(t); });
  await tween(80, t=>{ actor.scale = 0.92+0.08*easeOutCubic(t); });
  actor.scale = 1;
  const ox = actor.baseX + (actor.side==='party' ? 18 : -18), oy = actor.baseY-32;
  const dx = target.baseX, dy = target.baseY-32;
  const proj = {x:ox,y:oy,color};
  effects.projectiles.push(proj);
  await tween(220, t=>{ proj.x = ox+(dx-ox)*t; proj.y = oy+(dy-oy)*t; });
  effects.projectiles = effects.projectiles.filter(p=>p!==proj);
}

// --- click-to-target: reemplaza el onclick de .enemy-card.targetable ---

function onCanvasClick(evt){
  // Tocar una ficha de estado la explica unos segundos (en el celular no hay
  // puntero que dejar encima). Si se está eligiendo objetivo, eso va primero.
  if(!(lastCombatRef && lastCombatRef.pendingSkill)){
    const [sx, sy] = stagePoint(evt), c = chipAt(sx, sy);
    statusTip = c ? {st: c.st, owner: c.owner, x: c.x + c.w/2, y: c.y, until: performance.now() + 4500} : null;
    return;
  }
  if(!clickHandler || !lastCombatRef || !lastCombatRef.pendingSkill) return;
  const rect = canvas.getBoundingClientRect();
  const scaleX = STAGE_W/rect.width, scaleY = STAGE_H/rect.height;
  const cx = (evt.clientX-rect.left)*scaleX;
  const cy = (evt.clientY-rect.top)*scaleY;
  for(const a of actors.values()){
    if(!a.targetable) continue;
    const w=64, h=72*(a.sizeMul||1);
    const left=a.baseX-w/2, right=a.baseX+w/2, top=a.baseY-h, bottom=a.baseY+10;
    if(cx>=left && cx<=right && cy>=top && cy<=bottom){
      if(a.kind==='ally') clickHandler.onTarget('ally:'+a.refIdx);
      else clickHandler.onTarget(a.refIdx);
      return;
    }
  }
}

// --- dibujo ---

// Recorta el nombre con "…" si no entra en el espacio que tiene ese actor
// antes de pisar al de al lado (a.nameMaxW, ver layoutByDepth) — con 4-5
// aliados de nombre largo ("Aldric de la Muralla") en pantallas angostas,
// donde uiScale agranda la fuente pero el espacio entre actores no cambia,
// los nombres se superponían y quedaban ilegibles.
function fitText(text, maxWidth){
  if(!maxWidth || ctx.measureText(text).width <= maxWidth) return text;
  let t = text;
  while(t.length>1 && ctx.measureText(t+'…').width > maxWidth){ t = t.slice(0,-1); }
  return t + '…';
}

function drawBar(x,y,w,h,pct,color){
  ctx.fillStyle = '#000'; ctx.fillRect(x,y,w,h);
  ctx.fillStyle = color; ctx.fillRect(x+1,y+1, Math.max(0,(w-2)*Math.max(0,pct)), h-2);
  ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.lineWidth=1; ctx.strokeRect(x+0.5,y+0.5,w-1,h-1);
}

function drawActor(a, hud, dt){
  const cx = a.x||a.baseX;
  const cy = a.y||a.baseY;
  if(hud) return drawActorHud(a, cx, cy);

  // Tira chibi: se crea cuando su imagen termina de cargar y se rehace si el
  // actor de este puesto cambió (otro monstruo en el mismo índice).
  if(a._chibiKey !== a.chibiKey){ a.anim = null; a._chibiKey = a.chibiKey; }
  if(a.vanish){
    // invocación muerta: termina de caer y se desvanece del todo
    a._vanish = a._vanish == null ? 1.6 : a._vanish - dt;
    if(a._vanish <= 0) return;
  } else a._vanish = null;
  const vanishK = a.vanish ? Math.min(1, a._vanish/0.8) : 1;
  if(!a.anim && a.chibiKey) a.anim = chibiAnimFor(a.chibiKey);
  if(a.anim){
    if(a.alive === false && a.anim.state !== 'death') a.anim.play('death');
    else if(a.alive !== false && a.anim.state === 'death') a.anim.play('idle');
    a.anim.update(dt);
  }

  ctx.save();
  ctx.globalAlpha = (a.alive===false ? 0.3 : (a.opacity!=null?a.opacity:1)) * vanishK;
  const dupTint = a.kind==='ally' && a.sprite && a.sprite===playerSpriteRef;
  if(a.alive===false) ctx.filter = 'grayscale(1)';
  else if(a.flash>0) ctx.filter = 'brightness(1.8) saturate(0.3) sepia(1) hue-rotate(-50deg) saturate(4)';
  else if(dupTint) ctx.filter = 'hue-rotate(210deg) saturate(1.2)';

  // Sprite fijo (monstruos sin tira chibi): a un tamaño parejo con los chibi.
  const sz = STATIC_SIZE*(a.scale||1)*(a.sizeMul||1);
  const w = sz, h = sz*(a.squashY||1);
  // sombra en el suelo
  ctx.save(); ctx.filter = 'none'; ctx.globalAlpha = vanishK; ctx.fillStyle = 'rgba(0,0,0,0.32)';
  ctx.beginPath(); ctx.ellipse(cx, cy + 1, 17*(a.sizeMul||1), 5, 0, 0, Math.PI*2); ctx.fill(); ctx.restore();
  if(a.anim){
    if(a.alive === false){
      const st = a.anim.sheet.states.death, done = a.anim.state === 'death' && a.anim.frameIndex() >= st.frames - 1;
      a._deadFade = done ? Math.max(0.28, (a._deadFade == null ? 0.9 : a._deadFade) - dt*0.8) : 0.9;
      ctx.globalAlpha = a._deadFade * vanishK;
    } else a._deadFade = null;
    // las tiras miran a la derecha: el bando enemigo se dibuja espejado
    a.anim.draw(ctx, cx, cy, CHIBI_SCALE*(a.sizeMul||1)*(a.scale||1), a.side === 'enemy');
  } else if(a.sprite){
    // El actor de un slot (p.ej. 'enemy:0') sobrevive entre peleas distintas
    // que reusan el mismo índice — sin comparar contra la fuente ya
    // cacheada, un Goblin guerrero en el slot 0 de una pelea deja su imagen
    // "pegada" ahí para siempre, y el Hobgoblin/Gilgoblin/Ogro que ocupe ese
    // mismo slot en peleas futuras se sigue viendo como aquel primer Goblin
    // aunque el resto de sus datos (nombre, HP) sí estén bien actualizados.
    if(!a._img || a._imgSrc !== a.sprite){
      a._img = new Image();
      a._img.src = a.sprite;
      a._imgSrc = a.sprite;
    }
    if(a._img.complete && a._img.naturalWidth>0){
      // Sprites no cuadrados (aliados HD, 2:3): se respeta su proporción y se
      // dibujan un poco más altos para que la figura no quede chica.
      const ar = a._img.naturalWidth / a._img.naturalHeight;
      if(Math.abs(ar-1) > 0.05){
        const hh = h * (ar < 1 ? 1.35 : 1), ww = hh * ar;
        ctx.drawImage(a._img, cx-ww/2, cy-hh, ww, hh);
      } else {
        ctx.drawImage(a._img, cx-w/2, cy-h, w, h);
      }
    }
  } else {
    ctx.filter = a.flash>0 ? ctx.filter : 'none';
    ctx.font = `${Math.round(SIZE*0.8*(a.scale||1))}px sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
    ctx.fillText(a.icon||'❓', cx, cy+2);
  }
  ctx.filter = 'none';
  ctx.restore();
}
// Nombre, barras, estados y marco de objetivo: en una pasada aparte, después
// de todos los cuerpos, para que el de la fila de abajo no los tape.
function drawActorHud(a, cx, cy){
  // el aro de objetivo solo aparece mientras se está eligiendo a quién atacar
  if(a.targetable && lastCombatRef && lastCombatRef.pendingSkill){
    ctx.save();
    ctx.strokeStyle = `rgba(255,215,110,${0.6 + 0.35*Math.sin(Date.now()/140)})`; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.ellipse(cx, cy + 1, 28*(a.sizeMul||1), 8, 0, 0, Math.PI*2); ctx.stroke();
    ctx.restore();
  }
  if(a.alive === false) return;

  // barras
  let by = cy+7;
  ctx.save();
  ctx.font = `${Math.round(12*Math.min(uiScale, 1.45))}px monospace`; ctx.textAlign='center'; ctx.fillStyle='#e8dfcf';
  // el nombre va sobre la cabeza: bajo los pies se montaba sobre el cuerpo
  ctx.strokeStyle = 'rgba(0,0,0,0.85)'; ctx.lineWidth = 3;
  const nameY = cy - (a.anim ? 64*CHIBI_SCALE : STATIC_SIZE*0.92)*(a.sizeMul||1) - 5;
  ctx.strokeText(fitText(a.name||'', a.nameMaxW), cx, nameY); ctx.fillText(fitText(a.name||'', a.nameMaxW), cx, nameY);
  ctx.restore();
  drawBar(cx-22, by, 44, 5, (a.hp||0)/(a.maxHP||1), (a.hp/a.maxHP)<0.3 ? '#b24444' : '#8c2f2f');
  // Escudo (2026-09-25, pedido explícito): franja morada pegada justo
  // encima de la barra de vida, proporcional a escudo/maxHP (tope 100%).
  if(a.shield>0){
    drawBar(cx-22, by-4, 44, 3, Math.min(1, a.shield/(a.maxHP||1)), '#8a7fd1');
  }
  if(a.showResources){
    drawBar(cx-22, by+6, 44, 4, (a.mp||0)/(a.maxMP||1), '#b8934a');
    drawBar(cx-22, by+11, 44, 4, (a.spirit||0)/(a.maxSpirit||1), '#5d8aa8');
  }
  drawStatusChips(a, cx, by + (a.showResources?21:13));
}

// Chips de estado cerca del actor (antes solo había puntos genéricos que no
// decían qué efecto era — ni el jugador ni el resto podían saber qué le
// pasaba a un enemigo con Sangrado, Veneno, etc. sin abrir la mochila).
// Se agrandó la letra (7px -> 11px base) porque se reportó ilegible; con
// el canvas más alto ahora hay margen de sobra para el tamaño más grande.
// Como mucho 3 visibles + un "+N" si hay más, apilados justo debajo de sus
// barras — la sección "cercana al enemigo" pedida en vez de un contador arriba.
function drawStatusChips(a, cx, topY){
  const list = a.statuses || [];
  if(!list.length) return;
  // Fila horizontal de fichas (antes una columna de texto que, con el
  // combate en columnas, tapaba al personaje de abajo). Hasta 5 + "+N".
  const shown = list.slice(0, 5), cw = 22, n = shown.length + (list.length > shown.length ? 1 : 0);
  const x0 = cx - (n*cw)/2;
  ctx.save();
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  shown.forEach((st, i)=>{
    const buff = BUFF_STATUS_NAMES.has(st.name), x = x0 + i*cw;
    chipRects.push({x: x + 1, y: topY - 7, w: cw - 2, h: 14, st, owner: a.name || ''});
    ctx.fillStyle = buff ? 'rgba(32,78,48,0.94)' : 'rgba(96,30,30,0.94)';
    ctx.fillRect(x + 1, topY - 7, cw - 2, 14);
    ctx.strokeStyle = buff ? '#7ed957' : '#ff8a80'; ctx.lineWidth = 1; ctx.strokeRect(x + 1.5, topY - 6.5, cw - 3, 13);
    const icon = STATUS_ICON[st.name];
    ctx.fillStyle = '#fff';
    if(icon){ ctx.font = `${Math.round(10*uiScale)}px sans-serif`; ctx.fillText(icon, x + 7, topY + 1); }
    else { ctx.font = `bold ${Math.round(8*uiScale)}px monospace`; ctx.fillText(st.name.slice(0, 2), x + 7, topY + 1); }
    // número: cargas (x2, x3) si se acumula; si no, turnos que le quedan
    const num = st.stacks > 1 ? 'x' + st.stacks : (st.duration != null ? (st.duration >= PERMANENT_TURNS ? '∞' : String(st.duration)) : '');
    ctx.font = `bold ${Math.round(8*uiScale)}px monospace`; ctx.fillStyle = buff ? '#d7ffe0' : '#ffdede';
    ctx.fillText(num, x + 16, topY + 1);
  });
  if(list.length > shown.length){
    ctx.font = `bold ${Math.round(9*uiScale)}px monospace`; ctx.fillStyle = '#d9b76b';
    ctx.fillText('+' + (list.length - shown.length), x0 + shown.length*cw + cw/2, topY + 1);
  }
  ctx.restore();
}

function drawBurst(b){
  const t=1-b.life;
  ctx.save(); ctx.globalAlpha=Math.max(0,b.life); ctx.strokeStyle='#fff6d0'; ctx.lineWidth=2;
  for(let i=0;i<6;i++){
    const ang=(Math.PI*2/6)*i+t*0.6, r=6+t*14;
    const bx=b.x, by=b.y;
    ctx.beginPath(); ctx.moveTo(bx+Math.cos(ang)*r*0.4, by+Math.sin(ang)*r*0.4*0.6);
    ctx.lineTo(bx+Math.cos(ang)*r, by+Math.sin(ang)*r*0.6); ctx.stroke();
  }
  ctx.restore();
}
function drawHealGlow(g){
  const t=1-g.life, gx=g.x, gy=g.y;
  ctx.save(); ctx.globalAlpha=Math.max(0,g.life)*0.85;
  const grad = ctx.createRadialGradient(gx,gy,0,gx,gy,20);
  grad.addColorStop(0,'rgba(170,255,180,0.55)'); grad.addColorStop(1,'rgba(120,230,140,0)');
  ctx.fillStyle=grad; ctx.beginPath(); ctx.arc(gx,gy,20,0,Math.PI*2); ctx.fill();
  ctx.fillStyle='rgba(210,255,210,0.9)';
  for(let i=0;i<5;i++){
    const ang=(Math.PI*2/5)*i+t*1.5, r=7+t*10;
    ctx.beginPath(); ctx.arc(gx+Math.cos(ang)*r*0.6, gy-t*20+Math.sin(ang)*r*0.3, 1.4,0,Math.PI*2); ctx.fill();
  }
  ctx.restore();
}
function drawProjectile(p){
  const px=p.x, py=p.y;
  ctx.save();
  const grad = ctx.createRadialGradient(px,py,0,px,py,7);
  grad.addColorStop(0,'#fff'); grad.addColorStop(0.5,p.color); grad.addColorStop(1,'rgba(0,0,0,0)');
  ctx.fillStyle=grad; ctx.beginPath(); ctx.arc(px,py,7,0,Math.PI*2); ctx.fill();
  ctx.restore();
}

function draw(){
  if(!ctx) return;
  const rect = canvas.getBoundingClientRect();
  uiScale = rect.width>0 ? Math.max(1, STAGE_W/rect.width) : 1;
  ctx.save();
  ctx.scale(RES, RES);
  ctx.imageSmoothingEnabled = true;
  if(shake>0){ ctx.translate((Math.random()*2-1)*shake, (Math.random()*2-1)*shake); shake = Math.max(0, shake-0.9); }
  ctx.clearRect(-10,-10,STAGE_W+20,STAGE_H+20);
  const now = performance.now(), dt = Math.min(0.05, (now - (draw._last || now))/1000); draw._last = now;
  const bg = decadeBgImage(currentDecade);
  if(bg){
    // "cover" anclado abajo: el suelo de la ilustración queda bajo los pies
    const k = Math.max(STAGE_W/bg.naturalWidth, STAGE_H/bg.naturalHeight);
    const bw = bg.naturalWidth*k, bh = bg.naturalHeight*k;
    ctx.drawImage(bg, (STAGE_W - bw)/2, STAGE_H - bh, bw, bh);
    ctx.fillStyle = 'rgba(8,6,10,0.2)'; ctx.fillRect(0, 0, STAGE_W, STAGE_H);
  } else drawBackground(currentTheme || 'forest');
  drawBgParticles();

  actors.forEach(a=>{
    if(a.alive!==false) a.bob += 0.05;
    // vuelve suavemente a su posición base si no está mid-animación (x/y quedan
    // en baseX/baseY casi siempre; las animaciones los mueven temporalmente)
    if(a.x==null) a.x = a.baseX;
    if(a.y==null) a.y = a.baseY;
  });

  const order = Array.from(actors.values()).sort((a, b)=> (a.y||a.baseY) - (b.y||b.baseY));
  order.forEach(a=> drawActor(a, false, dt));
  chipRects = [];
  order.forEach(a=> drawActor(a, true, dt));

  effects.projectiles.forEach(drawProjectile);
  effects.bursts.forEach(drawBurst);
  effects.bursts.forEach(b=> b.life -= 0.06);
  effects.bursts = effects.bursts.filter(b=>b.life>0);
  effects.healGlows.forEach(drawHealGlow);
  effects.healGlows.forEach(g=> g.life -= 0.02);
  effects.healGlows = effects.healGlows.filter(g=>g.life>0);

  ctx.textAlign='center'; ctx.font=`bold ${Math.round(14*uiScale)}px monospace`;
  effects.floats.forEach(f=>{
    ctx.globalAlpha = Math.max(0,f.life);
    ctx.fillStyle=f.color; ctx.strokeStyle='#000'; ctx.lineWidth=2;
    const fx=f.x, fy=f.y;
    ctx.strokeText(f.text, fx, fy); ctx.fillText(f.text, fx, fy);
    ctx.globalAlpha=1;
  });
  effects.floats.forEach(f=>{ f.y -= 0.4; f.life -= 0.015; });
  effects.floats = effects.floats.filter(f=>f.life>0);

  actors.forEach(a=>{ if(a.flash>0) a.flash -= 0.06; });

  if(banner){
    banner.life -= dt/1.3;
    const al = Math.max(0, Math.min(1, banner.life*4));
    ctx.save(); ctx.globalAlpha = al;
    ctx.font = `bold ${Math.round(15*uiScale)}px Georgia, serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const bw = ctx.measureText(banner.text).width + 30, bh = Math.round(24*uiScale), bx = STAGE_W/2;
    ctx.fillStyle = banner.side === 'party' ? 'rgba(28,52,36,0.92)' : 'rgba(84,24,24,0.92)'; ctx.fillRect(bx - bw/2, 14, bw, bh);
    ctx.strokeStyle = '#c9a25d'; ctx.lineWidth = 1; ctx.strokeRect(bx - bw/2 + 0.5, 14.5, bw - 1, bh - 1);
    ctx.fillStyle = '#ffe9a8'; ctx.fillText(banner.text, bx, 14 + bh/2 + 1);
    ctx.restore();
    if(banner.life <= 0) banner = null;
  }
  drawStatusTip();

  ctx.restore();
}

export { syncBattleStage, playBattleAnim };
