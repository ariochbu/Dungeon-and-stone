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

import { CLASS_SPRITES, ALLY_SPRITES, ENEMY_SPRITES } from './battleSprites.js?v=47';

const TILE = 16;
const SCALE = 2.2;
const SIZE = TILE * SCALE; // ~35px por actor a escala base

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
// El canvas tiene una resolución interna fija (480x220) pero su tamaño en
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
const BUFF_STATUS_NAMES = new Set(['Furioso','Inspirado','Fortalecido']);

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
      x: Math.random()*canvas.width, y: Math.random()*canvas.height,
      r: 1+Math.random()*1.8, speed: 0.12+Math.random()*0.18,
      phase: Math.random()*Math.PI*2, color: fx.particle,
    });
  }
}
function drawBgParticles(){
  ctx.save();
  bgParticles.forEach(p=>{
    p.y -= p.speed; p.phase += 0.02;
    if(p.y < -4){ p.y = canvas.height+4; p.x = Math.random()*canvas.width; }
    ctx.globalAlpha = 0.7; ctx.fillStyle = p.color;
    ctx.beginPath(); ctx.arc(p.x+Math.sin(p.phase)*6, p.y, p.r, 0, Math.PI*2); ctx.fill();
  });
  ctx.restore();
}

function drawBackground(theme){
  const w = canvas.width, h = canvas.height;
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
    canvas.width = 480; canvas.height = 220;
    canvas.style.width = '100%';
    canvas.style.maxWidth = '560px';
    canvas.style.display = 'block';
    canvas.style.margin = '0 auto';
    canvas.style.background = '#14110f'; // fallback hasta el primer draw(); el tema real lo pinta drawBackground()
    canvas.style.borderRadius = '6px';
    canvas.style.border = '1px solid var(--border)';
    canvas.style.cursor = 'default';
    ctx = canvas.getContext('2d');
    canvas.addEventListener('click', onCanvasClick);
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

function spriteFor(kind, entity, playerStyle){
  if(kind==='player') return CLASS_SPRITES[playerStyle] || null;
  if(kind==='enemy') return ENEMY_SPRITES[entity.tpl && entity.tpl.id] || null;
  if(kind==='ally') return ALLY_SPRITES[entity.role] || null;
  return null;
}

function roleFor(kind, entity, playerStyle){
  if(kind==='player') return playerStyle==='tirador' || playerStyle==='mago' ? 'ranged' : 'melee';
  if(kind==='ally') return entity.role==='arquero' || entity.role==='mago' ? 'ranged' : 'melee';
  return entity.tpl ? (entity.tpl.role || 'melee') : 'melee';
}

function layoutRow(count, baseY, spanX, rowOffset){
  // reparte `count` actores en una sola fila, centrados; si son muchos
  // (>4) usa dos filas para no amontonarlos horizontalmente.
  const perRow = count > 4 ? Math.ceil(count/2) : count;
  const positions = [];
  for(let i=0;i<count;i++){
    const row = Math.floor(i/perRow);
    const inRow = i - row*perRow;
    const rowCount = Math.min(perRow, count - row*perRow);
    const gap = spanX / (rowCount+1);
    const x = 240 + gap*(inRow+1) - spanX/2; // 240 = centro horizontal del canvas (480px)
    const y = baseY + row*(rowOffset||34);
    positions.push({x, y, gap}); // gap = ancho disponible para el nombre antes de pisar al vecino
  }
  return positions;
}

// Ubica a cada actor en una de dos "profundidades" (frente/retaguardia) según
// su formación real de combate, en vez de una sola fila pareja — un aliado
// en el frente (o un enemigo de línea frontal) se dibuja más cerca de la
// otra línea que uno de retaguardia/soporte, como en el prototipo.
function layoutByDepth(items, isFront, frontY, backY, spanX){
  const frontIdx = [], backIdx = [];
  items.forEach((it,i)=> (isFront(it) ? frontIdx : backIdx).push(i));
  const positions = new Array(items.length);
  const frontPos = layoutRow(frontIdx.length, frontY, spanX);
  const backPos = layoutRow(backIdx.length, backY, spanX);
  frontIdx.forEach((itemIdx, i)=>{ positions[itemIdx] = frontPos[i]; });
  backIdx.forEach((itemIdx, i)=>{ positions[itemIdx] = backPos[i]; });
  return positions;
}

function syncBattleStage(container, combat, playerInfo, onTargetClick){
  ensureCanvas(container);
  clickHandler = onTargetClick;
  lastCombatRef = combat;

  const theme = playerInfo.bgTheme || 'forest';
  if(theme !== currentTheme){ currentTheme = theme; spawnBgParticles(theme); }

  const seen = new Set();

  // jugador: centrado en X, pero su Y también refleja su formación real
  // (Frente/Retaguardia, el mismo botón "Reposicionarse" de siempre) en vez
  // de quedar siempre fijo — igual que los aliados y los enemigos. El
  // desplazamiento es chico a propósito (~12-16px, no ~40-50 como en el
  // primer intento): con solo 220px de alto en el canvas, una separación
  // más grande hacía que el nombre/las barras de un actor "de atrás" se
  // pisaran con el sprite del que tiene justo delante en la misma columna
  // (típicamente un único enemigo de línea frontal justo arriba del
  // jugador en Frente) — se veía roto en cualquier tamaño de pantalla.
  {
    const k = 'player';
    seen.add(k);
    let a = actors.get(k);
    const playerY = playerInfo.pos==='frente' ? 163 : 175;
    if(!a){ a = makeActor(k); actors.set(k, a); }
    a.baseX = 240; a.baseY = playerY; a.x = a.baseX; a.y = a.baseY;
    playerSpriteRef = spriteFor('player', null, playerInfo.style);
    Object.assign(a, {
      kind:'player', name: playerInfo.name, icon: playerInfo.icon, nameMaxW: 100,
      sprite: playerSpriteRef, role: roleFor('player', null, playerInfo.style),
      hp: playerInfo.hp, maxHP: playerInfo.maxHP, mp: playerInfo.mp, maxMP: playerInfo.maxMP,
      spirit: playerInfo.spirit, maxSpirit: playerInfo.maxSpirit, alive: playerInfo.hp>0,
      showResources:true, statuses: playerInfo.statuses||[], targetable:false,
      side:'party',
    });
  }

  // aliados: los que están en el frente (pos==='frente') se dibujan más
  // cerca de los enemigos que los de retaguardia, siguiendo su formación real.
  const allyPos = layoutByDepth(combat.allies||[], a=>a.pos==='frente', 140, 154, 220);
  (combat.allies||[]).forEach((ally, i)=>{
    const k = keyFor('ally', ally);
    seen.add(k);
    let a = actors.get(k);
    if(!a){ a = makeActor(k); actors.set(k, a); }
    a.baseX = allyPos[i].x; a.baseY = allyPos[i].y; a.x = a.baseX; a.y = a.baseY;
    const hostile = typeof clickHandler.isAllyHostile==='function' && clickHandler.isAllyHostile(ally.id);
    Object.assign(a, {
      kind:'ally', refIdx:i, name: ally.name, icon: ally.icon, nameMaxW: allyPos[i].gap, sprite: spriteFor('ally', ally),
      role: roleFor('ally', ally), hp: ally.hp, maxHP: ally.maxHP, mp: ally.mp, maxMP: ally.maxMP,
      spirit: ally.spirit, maxSpirit: ally.maxSpirit, alive: ally.hp>0, showResources:true,
      statuses: ally.statuses||[], targetable: hostile && ally.hp>0, side:'party',
    });
  });

  // enemigos: los de línea frontal (tanques/melee, tpl.frontline) se dibujan
  // más cerca del grupo del jugador; los de soporte/distancia quedan atrás.
  const enemyPos = layoutByDepth(combat.enemies||[], e=> !!(e.tpl && e.tpl.frontline), 64, 48, 340);
  (combat.enemies||[]).forEach((en, i)=>{
    const k = keyFor('enemy', en, i);
    seen.add(k);
    let a = actors.get(k);
    if(!a){ a = makeActor(k); actors.set(k, a); }
    a.baseX = enemyPos[i].x; a.baseY = enemyPos[i].y; a.x = a.baseX; a.y = a.baseY;
    Object.assign(a, {
      kind:'enemy', refIdx:i, name: en.name, icon: en.icon, nameMaxW: enemyPos[i].gap, sprite: spriteFor('enemy', en),
      role: roleFor('enemy', en), hp: en.hp, maxHP: en.maxHP, alive: en.hp>0, showResources:false,
      statuses: en.statuses||[], targetable: en.hp>0, side:'enemy',
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
    const label = (ef.kind==='heal'?'+':'-') + ef.amount;
    effects.floats.push({x:target.x||target.baseX, y:(target.y||target.baseY)-38, text:label, color: ef.kind==='heal'?'#7ed957':'#ff6b6b', life:1});
    if(ef.kind==='heal') effects.healGlows.push({x:target.x||target.baseX, y:(target.y||target.baseY)-16, life:1});
    else effects.bursts.push({x:target.x||target.baseX, y:(target.y||target.baseY)-16, life:1});
  });

  await sleep(120);
}
function sleep(ms){ return new Promise(r=>setTimeout(r,ms)); }

async function lungeAnim(actor, target){
  const sx=actor.baseX, sy=actor.baseY;
  const dx = target.baseX + (actor.side==='party' ? -18 : 18);
  const dy = target.baseY + (actor.side==='party' ? 14 : -14);
  await tween(160, t=>{ const e=easeOutCubic(t); actor.x=sx+(dx-sx)*e; actor.y=sy+(dy-sy)*e; actor.scale=1+0.1*e; });
  await tween(80, ()=>{});
  await tween(180, t=>{ const e=easeInCubic(t); actor.x=dx+(sx-dx)*e; actor.y=dy+(sy-dy)*e; actor.scale=1.1-0.1*e; });
  actor.x=sx; actor.y=sy; actor.scale=1;
}

async function rangedAnim(actor, target, color){
  await tween(100, t=>{ actor.scale = 1-0.08*easeOutCubic(t); });
  await tween(80, t=>{ actor.scale = 0.92+0.08*easeOutCubic(t); });
  actor.scale = 1;
  const ox = actor.baseX, oy = actor.baseY-18;
  const dx = target.baseX, dy = target.baseY-18;
  const proj = {x:ox,y:oy,color};
  effects.projectiles.push(proj);
  await tween(220, t=>{ proj.x = ox+(dx-ox)*t; proj.y = oy+(dy-oy)*t; });
  effects.projectiles = effects.projectiles.filter(p=>p!==proj);
}

// --- click-to-target: reemplaza el onclick de .enemy-card.targetable ---

function onCanvasClick(evt){
  if(!clickHandler || !lastCombatRef || !lastCombatRef.pendingSkill) return;
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width/rect.width, scaleY = canvas.height/rect.height;
  const cx = (evt.clientX-rect.left)*scaleX;
  const cy = (evt.clientY-rect.top)*scaleY;
  for(const a of actors.values()){
    if(!a.targetable) continue;
    const w=SIZE, h=SIZE;
    const left=a.baseX-w/2, right=a.baseX+w/2, top=a.baseY-h, bottom=a.baseY+8;
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

function drawActor(a){
  const cx = a.x||a.baseX;
  const cy = a.y||a.baseY;

  ctx.save();
  ctx.globalAlpha = a.alive===false ? 0.3 : (a.opacity!=null?a.opacity:1);
  const dupTint = a.kind==='ally' && a.sprite && a.sprite===playerSpriteRef;
  if(a.alive===false) ctx.filter = 'grayscale(1)';
  else if(a.flash>0) ctx.filter = 'brightness(1.8) saturate(0.3) sepia(1) hue-rotate(-50deg) saturate(4)';
  else if(dupTint) ctx.filter = 'hue-rotate(210deg) saturate(1.2)';

  const w = SIZE*(a.scale||1), h = SIZE*(a.scale||1)*(a.squashY||1);
  if(a.sprite){
    if(!a._img){ a._img = new Image(); a._img.src = a.sprite; }
    if(a._img.complete && a._img.naturalWidth>0){
      ctx.drawImage(a._img, cx-w/2, cy-h, w, h);
    }
  } else {
    ctx.filter = a.flash>0 ? ctx.filter : 'none';
    ctx.font = `${Math.round(SIZE*0.8*(a.scale||1))}px sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
    ctx.fillText(a.icon||'❓', cx, cy+2);
  }
  ctx.filter = 'none';
  ctx.restore();

  if(a.targetable){
    ctx.save();
    ctx.strokeStyle = 'rgba(217,183,107,0.8)'; ctx.lineWidth = 1.5;
    ctx.strokeRect(cx-w/2-2, cy-h-2, w+4, h+4);
    ctx.restore();
  }

  // barras
  let by = cy+6;
  ctx.save();
  ctx.font = `${Math.round(9*uiScale)}px monospace`; ctx.textAlign='center'; ctx.fillStyle='#e8dfcf';
  ctx.fillText(fitText(a.name||'', a.nameMaxW), cx, by-8);
  ctx.restore();
  drawBar(cx-18, by, 36, 4, (a.hp||0)/(a.maxHP||1), (a.hp/a.maxHP)<0.3 ? '#b24444' : '#8c2f2f');
  if(a.showResources){
    drawBar(cx-18, by+5, 36, 3, (a.mp||0)/(a.maxMP||1), '#b8934a');
    drawBar(cx-18, by+9, 36, 3, (a.spirit||0)/(a.maxSpirit||1), '#5d8aa8');
  }
  drawStatusChips(a, cx, by + (a.showResources?14:9));
}

// Chips de estado cerca del actor (antes solo había puntos genéricos que no
// decían qué efecto era — ni el jugador ni el resto podían saber qué le
// pasaba a un enemigo con Sangrado, Veneno, etc. sin abrir la mochila).
// Como mucho 3 visibles + un "+N" si hay más, apilados justo debajo de sus
// barras — la sección "cercana al enemigo" pedida en vez de un contador arriba.
function drawStatusChips(a, cx, topY){
  const list = a.statuses || [];
  if(!list.length) return;
  const shown = list.slice(0,3);
  ctx.save();
  ctx.font = `${Math.round(7*uiScale)}px monospace`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  shown.forEach((st, i)=>{
    const buff = BUFF_STATUS_NAMES.has(st.name);
    const label = st.name.slice(0,4) + (st.duration!=null ? String(st.duration) : '');
    const w = Math.max(20, ctx.measureText(label).width + 5);
    const y = topY + i*9;
    ctx.fillStyle = buff ? 'rgba(60,120,70,0.9)' : 'rgba(120,50,50,0.9)';
    ctx.fillRect(cx-w/2, y-4, w, 8);
    ctx.fillStyle = buff ? '#d7ffe0' : '#ffdede';
    ctx.fillText(label, cx, y+1);
  });
  if(list.length > shown.length){
    ctx.fillStyle = '#d9b76b';
    ctx.fillText('+'+(list.length-shown.length), cx, topY + shown.length*9 + 1);
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
  uiScale = rect.width>0 ? canvas.width/rect.width : 1;
  ctx.save();
  if(shake>0){ ctx.translate((Math.random()*2-1)*shake, (Math.random()*2-1)*shake); shake = Math.max(0, shake-0.9); }
  ctx.clearRect(-10,-10,canvas.width+20,canvas.height+20);
  drawBackground(currentTheme || 'forest');
  drawBgParticles();

  actors.forEach(a=>{
    if(a.alive!==false) a.bob += 0.05;
    // vuelve suavemente a su posición base si no está mid-animación (x/y quedan
    // en baseX/baseY casi siempre; las animaciones los mueven temporalmente)
    if(a.x==null) a.x = a.baseX;
    if(a.y==null) a.y = a.baseY;
  });

  const order = Array.from(actors.values());
  order.forEach(a=> drawActor(a));

  effects.projectiles.forEach(drawProjectile);
  effects.bursts.forEach(drawBurst);
  effects.bursts.forEach(b=> b.life -= 0.06);
  effects.bursts = effects.bursts.filter(b=>b.life>0);
  effects.healGlows.forEach(drawHealGlow);
  effects.healGlows.forEach(g=> g.life -= 0.02);
  effects.healGlows = effects.healGlows.filter(g=>g.life>0);

  ctx.textAlign='center'; ctx.font=`bold ${Math.round(11*uiScale)}px monospace`;
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

  ctx.restore();
}

export { syncBattleStage, playBattleAnim };
