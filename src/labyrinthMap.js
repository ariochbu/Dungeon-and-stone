// Laberinto por salas (2026-10-04): reemplaza el mapa de nodos con íconos por
// una vista horizontal sobre el fondo de la década — cada nodo es un recuadro
// con su contenido, unidos por senderos; el personaje camina hasta la sala
// elegida. Puerto de prototype-2d/laberinto.html (aspecto "fondo con
// recuadros", sentido horizontal).
//
// Este módulo SOLO dibuja y avisa qué sala se tocó. Las reglas siguen en
// game.js: qué salas son alcanzables (opts.isReachable) y qué pasa al entrar
// (opts.onEnter → enterNode). No cambia state.dungeon.

import { SpriteAnim, sheetFromMeta } from './spriteAnim.js?v=1';

const T = 16;                    // unidad de la cuadrícula
const ROOM_W = 7, ROOM_H = 5;    // tamaño de una sala, en unidades
const FX = ROOM_W + 4, LY = ROOM_H + 2; // paso entre pisos (→) y entre sendas (↓)
const VIEW_W = 480, VIEW_H = 384;
const TYPE_COLOR = { entrada:'#8a8f99', combate:'#c44a4a', elite:'#9a5fd0', tesoro:'#e0b23f', descanso:'#e8853a', jefe:'#ff3b3b' };
const BADGE = {
  combate: {icon:'⚔', label:'Normal',   bg:'#5a2a2a', fg:'#ffd9d4', line:'#c44a4a'},
  elite:   {icon:'☠', label:'Élite',    bg:'#3f2a66', fg:'#e6d6ff', line:'#9a5fd0'},
  jefe:    {icon:'♛', label:'Guardián', bg:'#7a1c1c', fg:'#ffe9a8', line:'#ffd76a'},
};

let CHIBI = {};
fetch('src/assets/chibi/index.json?v=1').then(r=> r.json()).then(j=>{ CHIBI = j; }).catch(()=>{});
const imgs = {};
function img(src){
  if(!imgs[src]){ imgs[src] = new Image(); imgs[src].src = src; }
  const i = imgs[src];
  return i.complete && i.naturalWidth > 0 ? i : null;
}
function chibiAnim(key){
  const meta = CHIBI[key], image = meta && img(`src/assets/chibi/${key}.png?v=1`);
  return image ? new SpriteAnim(image, sheetFromMeta(meta)) : null;
}

// --- estado del módulo: sobrevive a los re-render de game.js ---
let canvas = null, ctx = null, rafId = null;
let dg = null, opts = null, world = null, worldFor = null;
let hero = null, heroAnim = null, heroKey = null;
let cam = {x:0, y:0}, manualCam = null, drag = null, dragged = false, walking = false, last = 0;

function buildWorld(d){
  const lanes = Math.max(...d.floors.map(f=> f.length)), F = d.floors.length;
  const rooms = [];
  d.floors.forEach((nodes, f)=> nodes.forEach((node, n)=>{
    const lane = nodes.length === 1 ? Math.floor(lanes/2) : n;
    const x0 = 1 + f*FX, y0 = 1 + lane*LY + 1;
    rooms.push({f, n, node, lane, x0, y0, cx: x0 + 3, cy: y0 + 2});
  }));
  const halls = [];
  for(let f = 0; f < F - 1; f++) halls[f] = 1 + f*FX + ROOM_W + 2;
  return {W: F*FX + 2, H: lanes*LY + 2, lanes, F, rooms, halls, roomAt: (f, n)=> rooms.find(r=> r.f === f && r.n === n)};
}
const P = (tx, ty)=> ({x: (tx + 0.5)*T, y: (ty + 0.5)*T});
function clampCam(x, y){
  const ww = world.W*T, wh = world.H*T;
  return [ww <= VIEW_W ? ww/2 : Math.max(VIEW_W/2, Math.min(ww - VIEW_W/2, x)), wh <= VIEW_H ? wh/2 : Math.max(VIEW_H/2, Math.min(wh - VIEW_H/2, y))];
}

function ensureCanvas(container){
  if(!canvas){
    canvas = document.createElement('canvas');
    canvas.width = VIEW_W; canvas.height = VIEW_H;
    canvas.style.cssText = 'width:100%; max-width:760px; height:auto; display:block; margin:0 auto; border:1px solid var(--border); border-radius:6px; image-rendering:pixelated; background:#0d0b10; cursor:pointer; touch-action:none;';
    ctx = canvas.getContext('2d');
    // Arrastrar para mirar el laberinto (con límites); un toque corto elige sala.
    canvas.addEventListener('pointerdown', (e)=>{ drag = {x:e.clientX, y:e.clientY, cx:cam.x, cy:cam.y}; dragged = false; try{ canvas.setPointerCapture(e.pointerId); }catch(err){} });
    canvas.addEventListener('pointermove', (e)=>{
      if(!drag || !world) return;
      const r = canvas.getBoundingClientRect(), k = canvas.width / r.width;
      const dx = (e.clientX - drag.x)*k, dy = (e.clientY - drag.y)*k;
      if(!dragged && Math.hypot(dx, dy) < 6) return;
      dragged = true;
      const [x, y] = clampCam(drag.cx - dx, drag.cy - dy);
      manualCam = {x, y}; cam.x = x; cam.y = y;
    });
    ['pointerup', 'pointercancel'].forEach(ev=> canvas.addEventListener(ev, ()=>{ drag = null; }));
    canvas.addEventListener('click', onClick);
  }
  if(canvas.parentElement !== container) container.appendChild(canvas);
  if(!rafId){ last = performance.now(); rafId = requestAnimationFrame(frame); }
}

function onClick(e){
  if(dragged){ dragged = false; return; }
  if(walking || !world) return;
  const r = canvas.getBoundingClientRect();
  const tx = ((e.clientX - r.left)*canvas.width/r.width + cam.x - VIEW_W/2)/T;
  const ty = ((e.clientY - r.top)*canvas.height/r.height + cam.y - VIEW_H/2)/T;
  const m = world.rooms.find(q=> tx >= q.x0 - 0.5 && tx < q.x0 + ROOM_W + 0.5 && ty >= q.y0 - 0.5 && ty < q.y0 + ROOM_H + 0.5);
  if(!m || !opts.isReachable(m.f, m.n)) return;
  // camina hasta la sala y recién ahí entra (combate, cofre, descanso)
  const a = world.roomAt(dg.atFloor, dg.atNode), hx = world.halls[dg.atFloor];
  hero.path = [P(a.cx, a.cy), P(hx, a.cy), P(hx, m.cy), P(m.cx - 1, m.cy + 1)];
  walking = true; manualCam = null;
  hero.onArrive = ()=>{ walking = false; opts.onEnter(m.f, m.n); };
}

// Monta (o actualiza) el laberinto dentro de `container`.
//   options: { level, race, style, isReachable(f,n), onEnter(f,n),
//              previewIds(node, f) -> ids de monstruos a mostrar, spriteUrl(id) }
export function mountLabyrinth(container, dungeon, options){
  dg = dungeon; opts = options;
  ensureCanvas(container);
  if(worldFor !== dg || !world || world.F !== dg.floors.length){
    world = buildWorld(dg); worldFor = dg; manualCam = null; walking = false;
    hero = null;
  } else world.rooms.forEach(m=>{ m.node = dg.floors[m.f][m.n]; });
  const here = world.roomAt(dg.atFloor, dg.atNode);
  const spot = P(here.cx - (dg.atFloor === 0 ? 0 : 1), here.cy + 1);
  if(!hero){ hero = {x: spot.x, y: spot.y, path: [], flip: false}; [cam.x, cam.y] = clampCam(spot.x + 70, spot.y); }
  else if(!walking){ hero.x = spot.x; hero.y = spot.y; hero.path = []; }
  const key = CHIBI['caminar_' + options.race] ? 'caminar_' + options.race : `${options.style}_${options.race}`;
  if(key !== heroKey){ heroKey = key; heroAnim = null; }
}

// --- dibujo ---
function roundRect(x, y, w, h, r){
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}
function drawBackdrop(){
  const d = Math.min(5, Math.floor(((opts.level || 1) - 1)/10));
  const bg = img(`src/assets/fondos/${d*10 + 1}-${d*10 + 10}.jpg?v=1`);
  if(bg){
    const k = Math.max(VIEW_W/bg.naturalWidth, VIEW_H/bg.naturalHeight)*1.15, w = bg.naturalWidth*k, h = bg.naturalHeight*k;
    const px = (cam.x/(world.W*T) - 0.5)*(w - VIEW_W), py = (cam.y/(world.H*T) - 0.5)*(h - VIEW_H);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(bg, (VIEW_W - w)/2 - px, (VIEW_H - h)/2 - py, w, h);
    ctx.imageSmoothingEnabled = false;
  }
  ctx.fillStyle = bg ? 'rgba(10,8,12,0.5)' : '#14110e'; ctx.fillRect(0, 0, VIEW_W, VIEW_H);
}
function drawPaths(){
  ctx.strokeStyle = 'rgba(232,220,198,0.32)'; ctx.lineWidth = 5; ctx.lineCap = 'round'; ctx.setLineDash([2, 9]);
  const L = (tx, ty)=> [(tx + 0.5)*T, (ty + 0.5)*T];
  world.halls.forEach((hx, f)=>{
    const lower = world.rooms.filter(r=> r.f === f), upper = world.rooms.filter(r=> r.f === f + 1);
    const ys = lower.concat(upper).map(r=> r.cy);
    ctx.beginPath(); ctx.moveTo(...L(hx, Math.min(...ys))); ctx.lineTo(...L(hx, Math.max(...ys)));
    lower.forEach(r=>{ ctx.moveTo(...L(r.x0 + ROOM_W, r.cy)); ctx.lineTo(...L(hx, r.cy)); });
    upper.forEach(r=>{ ctx.moveTo(...L(r.x0 - 1, r.cy)); ctx.lineTo(...L(hx, r.cy)); });
    ctx.stroke();
  });
  ctx.setLineDash([]);
}
function icon(name, cx, cy, h){
  const im = img(`src/assets/chibi/iconos/${name}.png?v=1`);
  if(!im) return false;
  const w = im.naturalWidth*h/im.naturalHeight;
  ctx.drawImage(im, Math.round(cx - w/2), Math.round(cy - h/2), Math.round(w), h);
  return true;
}
// Monstruos de la sala: tira chibi si existe, si no el sprite de siempre.
function drawFoes(m, cx, cy, dt){
  if(!m.foes){
    const ids = (opts.previewIds ? opts.previewIds(m.node, m.f) : []) || [];
    m.foes = ids.map(id=> ({id, anim: null}));
  }
  const type = m.node.type, scale = type === 'jefe' ? 0.85 : type === 'elite' ? 0.62 : 0.45, n = m.foes.length;
  m.foes.forEach((foe, i)=>{
    const x = cx + (n > 1 ? (i ? 15 : -13) : 0), y = cy + 24 + (i ? 4 : 0);
    if(!foe.anim) foe.anim = chibiAnim('enemigo_' + foe.id);
    if(foe.anim){ foe.anim.update(dt); foe.anim.draw(ctx, x, y, scale, true); return; }
    const url = opts.spriteUrl && opts.spriteUrl(foe.id), im = url && img(url);
    if(im){ const h = 64*scale*1.15, w = im.naturalWidth*h/im.naturalHeight; ctx.drawImage(im, Math.round(x - w/2), Math.round(y - h), Math.round(w), Math.round(h)); }
  });
}
function drawBadge(m){
  const b = BADGE[m.node.type];
  if(!b || m.node.done) return;
  const x = m.x0*T + 3, y = m.y0*T + 3;
  ctx.font = 'bold 8px Georgia'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  const w = ctx.measureText(b.label).width + 19;
  ctx.fillStyle = b.bg; ctx.fillRect(x, y, w, 12);
  ctx.strokeStyle = b.line; ctx.lineWidth = 1; ctx.strokeRect(x + 0.5, y + 0.5, w - 1, 11);
  ctx.fillStyle = b.fg; ctx.font = '9px serif'; ctx.fillText(b.icon, x + 3, y + 6.5);
  ctx.font = 'bold 8px Georgia'; ctx.fillText(b.label, x + 14, y + 6.5);
}
function drawRoom(m, t, dt){
  const node = m.node, cx = (m.cx + 0.5)*T, cy = (m.cy + 0.5)*T - 10;
  const x = m.x0*T, y = m.y0*T, w = ROOM_W*T, h = ROOM_H*T;
  const here = m.f === dg.atFloor && m.n === dg.atNode, visited = !!dg.visited[m.f + '-' + m.n];
  const reach = !walking && opts.isReachable(m.f, m.n);
  const hidden = m.f > dg.atFloor + 1; // niebla: más allá del piso siguiente no se ve
  roundRect(x, y, w, h, 6);
  ctx.fillStyle = hidden ? 'rgba(8,6,10,0.72)' : here ? 'rgba(255,255,255,0.10)' : visited ? 'rgba(8,6,10,0.55)' : 'rgba(8,6,10,0.34)';
  ctx.fill();
  ctx.lineWidth = reach || here ? 2 : 1;
  ctx.strokeStyle = reach ? `rgba(255,215,110,${0.6 + 0.35*Math.sin(t*5)})` : here ? '#f2ead8' : hidden ? 'rgba(150,140,160,0.35)' : 'rgba(201,162,93,0.55)';
  ctx.stroke();
  if(hidden){
    ctx.fillStyle = 'rgba(170,160,180,0.6)'; ctx.font = 'bold 20px Georgia'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('?', x + w/2, y + h/2); ctx.textAlign = 'left';
    return;
  }
  if(node.type === 'descanso'){
    ctx.fillStyle = `rgba(255,170,60,${0.13 + 0.05*Math.sin(t*7)})`; ctx.beginPath(); ctx.arc(cx, cy + 6, 26, 0, 7); ctx.fill();
    if(!icon('hoguera', cx, cy + 6, 34)){ ctx.font = '22px serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('🔥', cx, cy + 6); ctx.textAlign = 'left'; }
  } else if(node.type === 'tesoro'){
    if(!icon(node.done ? 'cofre_abierto' : 'cofre', cx, cy + 6, 34)){ ctx.font = '22px serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('💰', cx, cy + 6); ctx.textAlign = 'left'; }
  } else if(['combate', 'elite', 'jefe'].includes(node.type) && !node.done) drawFoes(m, cx, cy, dt);
  drawBadge(m);
  // sala del piso siguiente a la que no se puede pasar: candado y más oscura
  if(m.f === dg.atFloor + 1 && !reach && !walking){
    ctx.font = '11px serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('🔒', x - T + 6, (m.cy + 0.5)*T); ctx.textAlign = 'left';
    roundRect(x, y, w, h, 6); ctx.fillStyle = 'rgba(8,6,10,0.4)'; ctx.fill();
  }
}
function drawMinimap(){
  const cw = 8, ch = 7, pad = 4, mw = world.F*cw + pad*2 - 2, mh = world.lanes*ch + pad*2 - 2;
  const ox = VIEW_W - mw - 5, oy = 5;
  ctx.fillStyle = 'rgba(10,8,12,0.78)'; ctx.fillRect(ox, oy, mw, mh);
  ctx.strokeStyle = '#6b5d4d'; ctx.lineWidth = 1; ctx.strokeRect(ox + 0.5, oy + 0.5, mw - 1, mh - 1);
  world.rooms.forEach(m=>{
    const x = ox + pad + m.f*cw, y = oy + pad + m.lane*ch, here = m.f === dg.atFloor && m.n === dg.atNode;
    ctx.globalAlpha = here || opts.isReachable(m.f, m.n) ? 1 : dg.visited[m.f + '-' + m.n] ? 0.35 : 0.6;
    ctx.fillStyle = m.f > dg.atFloor + 1 && m.node.type !== 'jefe' ? '#4a4650' : TYPE_COLOR[m.node.type] || '#666';
    ctx.fillRect(x, y, cw - 2, ch - 2);
    ctx.globalAlpha = 1;
    if(here){ ctx.strokeStyle = '#fff'; ctx.strokeRect(x - 0.5, y - 0.5, cw - 1, ch - 1); }
  });
}
function frame(now){
  if(!canvas || !canvas.isConnected || !world){ rafId = null; return; } // el laberinto salió de pantalla: se detiene
  const dt = Math.min(0.05, (now - last)/1000), t = now/1000; last = now;
  if(hero.path.length){
    const p = hero.path[0], dx = p.x - hero.x, dy = p.y - hero.y, dist = Math.hypot(dx, dy), step = 120*dt;
    if(dx) hero.flip = dx < 0;
    if(dist <= step){
      hero.x = p.x; hero.y = p.y; hero.path.shift();
      if(!hero.path.length && hero.onArrive){ const fn = hero.onArrive; hero.onArrive = null; fn(); if(!canvas.isConnected){ rafId = null; return; } }
    } else { hero.x += dx/dist*step; hero.y += dy/dist*step; }
  }
  if(manualCam){ [cam.x, cam.y] = clampCam(manualCam.x, manualCam.y); }
  else { const [tx, ty] = clampCam(hero.x + 70, hero.y); cam.x += (tx - cam.x)*Math.min(1, dt*6); cam.y += (ty - cam.y)*Math.min(1, dt*6); }

  ctx.imageSmoothingEnabled = false;
  drawBackdrop();
  ctx.save();
  ctx.translate(Math.round(VIEW_W/2 - cam.x), Math.round(VIEW_H/2 - cam.y));
  drawPaths();
  world.rooms.forEach(m=> drawRoom(m, t, dt));
  ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.beginPath(); ctx.ellipse(hero.x, hero.y + 7, 6, 2, 0, 0, 7); ctx.fill();
  if(!heroAnim && heroKey) heroAnim = chibiAnim(heroKey);
  if(heroAnim){
    const want = hero.path.length && heroAnim.sheet.states.walk ? 'walk' : 'idle';
    if(heroAnim.state !== want) heroAnim.play(want);
    heroAnim.update(dt);
    heroAnim.draw(ctx, hero.x, hero.y + 8, 0.5, hero.flip);
  } else { ctx.fillStyle = '#f2ead8'; ctx.beginPath(); ctx.arc(hero.x, hero.y - 4, 5, 0, 7); ctx.fill(); }
  ctx.restore();
  drawMinimap();
  rafId = requestAnimationFrame(frame);
}
