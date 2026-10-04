// Conductor de pruebas (no forma parte del juego): maneja la interfaz real
// como lo haría un jugador para recorrer una década con un personaje de prueba.
// Uso, en la consola de la página del juego ya con sesión iniciada:
//   const qa = await import('/prototype-2d/qa_driver.js'); await qa.run(1, 21);
const sleep = (ms)=> new Promise(r=> setTimeout(r, ms));
const vis = (sel, re)=> [...document.querySelectorAll(sel)].find(e=> e.offsetParent !== null && (!re || re.test(e.textContent)));
const logs = (n = 4)=> [...document.querySelectorAll('#log-box > *')].slice(-n).map(e=> e.textContent.trim().slice(0, 120));
const inCombat = ()=>{ const c = document.querySelector('#battle-stage-mount canvas'); return !!c && c.isConnected; };
async function closeOverlays(){
  for(let i = 0; i < 8; i++){
    const b = [...document.querySelectorAll('.overlay-msg button')].find(x=> x.offsetParent !== null);
    if(!b) return;
    b.click(); await sleep(700);
  }
}
async function hireAllies(max = 4){
  vis('.sn-item, .sn-row, button, a', /Taberna/).click(); await sleep(1300);
  const rec = vis('button, [data-tv], [data-spot]', /Reclutar/); if(rec){ rec.click(); await sleep(1200); }
  let hired = 0;
  for(let i = 0; i < 12 && hired < max; i++){
    const b = [...document.querySelectorAll('[data-hire]')].find(x=> !x.disabled && x.offsetParent !== null);
    if(!b) break;
    b.click(); await sleep(2000); await closeOverlays(); hired++;
  }
  return hired;
}
async function enterGate(level){
  vis('.sn-item, .sn-row, button, a', /Entrar al laberinto/).click(); await sleep(1300);
  const g = document.querySelector(`.lb-gate[data-level="${level}"], .checkpoint-btn[data-level="${level}"]`);
  if(!g) return false;
  g.click(); await sleep(1300); await closeOverlays(); await sleep(600);
  return !!document.getElementById('labyrinth-mount') || inCombat();
}
// Toca por toda la vista hasta que el personaje avanza a una sala.
async function step(){
  const c = document.querySelector('#labyrinth-mount canvas'); if(!c) return 'sin-laberinto';
  const r = c.getBoundingClientRect(), before = logs(1)[0];
  for(let gx = 40; gx <= 460; gx += 28) for(let gy = 30; gy <= 360; gy += 40)
    c.dispatchEvent(new MouseEvent('click', {clientX: r.left + gx*r.width/480, clientY: r.top + gy*r.height/384, bubbles: true}));
  for(let i = 0; i < 40; i++){ await sleep(300); if(inCombat()) return 'combate'; if(logs(1)[0] !== before) return 'evento'; }
  return 'nada';
}
function clickTargets(){
  const c = document.querySelector('#battle-stage-mount canvas'); if(!c) return;
  const r = c.getBoundingClientRect();
  for(const x of [426, 460, 392, 416, 548, 582, 514, 538, 214, 248, 92, 126]) for(const y of [205, 250, 296, 340, 388])
    c.dispatchEvent(new MouseEvent('click', {clientX: r.left + x*r.width/640, clientY: r.top + y*r.height/450, bubbles: true}));
}
async function waitMenu(){
  for(let i = 0; i < 80; i++){
    if(!inCombat()) return false;
    if(vis('.overlay-msg button')) return false;
    if(vis('button', /Básico/) || vis('#menu-back')) return true;
    await sleep(350);
  }
  return false;
}
async function round(){
  if(!(await waitMenu())) return 'fin';
  let used = 'básico';
  if(!vis('#menu-back') && Math.random() < 0.7){ const s = vis('button', /Habilidades/); if(s){ s.click(); await sleep(350); } }
  if(vis('#menu-back')){
    const sk = [...document.querySelectorAll('.submenu-item[data-skill]')].filter(e=> e.offsetParent !== null && !e.classList.contains('disabled'));
    if(sk.length){ const s = sk[Math.floor(Math.random()*sk.length)]; used = s.querySelector('.item-name').textContent.trim().slice(0, 40); s.click(); }
    else { vis('#menu-back').click(); await sleep(300); const b = vis('button', /Básico/); if(b) b.click(); }
  } else { const b = vis('button', /Básico/); if(b) b.click(); }
  await sleep(450); clickTargets(); await sleep(1100);
  return used;
}
// Recorre: aliados, puerta, salas hasta `fights` combates, `rounds` turnos cada uno.
export async function run(charIdx, gate, {fights = 2, rounds = 10, allies = 4} = {}){
  const out = {char: null, hired: 0, steps: [], fights: []};
  if(document.querySelector('#select-box')){
    const j = [...document.querySelectorAll('button')].filter(x=> x.textContent.trim() === 'Jugar')[charIdx];
    if(j && j.offsetParent !== null){ j.click(); await sleep(3500); }
  }
  out.char = (document.querySelector('.sn-name, .sheet-title .name') || {}).textContent;
  await closeOverlays();
  if(!document.getElementById('labyrinth-mount') && !inCombat()){
    out.hired = await hireAllies(allies);
    out.entered = await enterGate(gate);
  }
  let guard = 0;
  while(out.fights.length < fights && guard++ < 14){
    if(!inCombat()){
      await closeOverlays();
      const s = await step(); out.steps.push(s + ': ' + (logs(1)[0] || '').slice(0, 90));
      if(s === 'nada' || s === 'sin-laberinto') break;
      if(s !== 'combate') continue;
    }
    const f = {start: logs(1)[0], used: []};
    for(let i = 0; i < rounds; i++){ const u = await round(); f.used.push(u); if(u === 'fin') break; }
    f.end = logs(6); f.stillFighting = inCombat();
    out.fights.push(f);
    await closeOverlays();
    // tras una victoria aparece "continuar / retirarse": se sigue adelante
    const cont = vis('button', /Continuar al nivel|Seguir|Continuar/); if(cont && !inCombat()){ cont.click(); await sleep(1200); }
    if(f.stillFighting) break;
  }
  out.where = inCombat() ? 'combate' : document.getElementById('labyrinth-mount') ? 'laberinto' : 'ciudad';
  return out;
}
export const tools = {sleep, vis, logs, inCombat, closeOverlays, step, round};
