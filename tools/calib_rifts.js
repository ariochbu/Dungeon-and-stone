// Calibración de los RIFTS (2026-10-11, solo localhost). Mide y ajusta RIFT_TUNING de src/game.js.
// Uso (consola del navegador con el juego servido en local, sin iniciar sesión):
//   await import('/tools/calib_rifts.js');
//   riftMedir({decs:[0,1,2,3,4,5,6,7,8,9], n:10, clave:'antes'});   → progreso en window.RIFT.antes
//   riftCalibrar([4,5,6,7,8,9]);                                      → busca los tres pares de RIFT_TUNING por década
// Objetivos: llegar al jefe ~76% (dos oleadas al 87%), jefe del rift ~60% de las veces que se llega, rift completo ~46%.
// Referencia: la de calib_harness.js (rango B y 0-1 aliados en 1-20, rango A y 2-4 aliados después), las seis
// sendas sin profesión, niveles x5 y x9 de cada década. Las tres etapas se pelean seguidas, sin curar (simRifts).
await import('/tools/calib_harness.js');
const W = window;
const CLS = ['pesada', 'paladin', 'doblefilo', 'tirador', 'mago', 'hechicero'];
const TEMAS = ['cripta', 'forja', 'tormenta', 'sombras'];
const OBJ = {llega: 76, jefe: 60};
// Con la pestaña oculta el navegador frena los temporizadores: los cortos se despachan por MessageChannel.
if(!W.__st){
  W.__st = W.setTimeout; const q = [], ch = new MessageChannel();
  ch.port1.onmessage = ()=>{ const f = q.shift(); if(f) try{ f(); }catch(e){ console.error(e); } };
  W.setTimeout = (fn, ms, ...a)=>{ if(typeof fn === 'function' && (ms || 0) < 3000){ q.push(()=> fn(...a)); ch.port2.postMessage(0); return 0; } return W.__st(fn, ms, ...a); };
}
const race = (p, ms)=> Promise.race([p, new Promise(res=> W.__st(()=> res(null), ms))]);
const yieldNow = ()=> new Promise(res=>{ const ch = new MessageChannel(); ch.port1.onmessage = ()=> res(); ch.port2.postMessage(0); });
const pct = (w, t)=> t ? Math.round(w / t * 100) : null;
W.RIFT = W.RIFT || {};
const guardar = ()=>{ try{ localStorage.setItem('calRift' + (W.RIFT_ID || ''), JSON.stringify(W.RIFT)); }catch(e){} };

// Una celda = [llega1, gana1, llega2, gana2, llega3, gana3, completos, atascados, perdidos por tiempo]
const suma = (a, b)=>{ for(let i = 0; i < a.length; i++) a[i] += b[i]; return a; };
const vacia = ()=> [0, 0, 0, 0, 0, 0, 0, 0, 0];
const lee = (c)=> ({o1: pct(c[1], c[0]), o2: pct(c[3], c[2]), llega: pct(c[3], c[0]), jefe: pct(c[5], c[4]), completo: pct(c[6], c[0]), n: c[0], nJefe: c[4], atascados: c[7], tiempo: c[8]});
async function celda(st, lv, tema, n, stages){
  const c = vacia();
  for(let i = 0; i < n; i += 5){
    const k = Math.min(5, n - i);
    const r = await race(W.__simRift(Object.assign({style: st, theme: tema, level: lv, dungeonLevel: lv, n: k, beta: true, stages: stages || 3}, W.refFor(lv))), 60000);
    await yieldNow();
    if(!r){ c[8] += k; continue; }
    suma(c, [r.etapa[0][0], r.etapa[0][1], r.etapa[1][0], r.etapa[1][1], r.etapa[2][0], r.etapa[2][1], r.full, r.stuck, 0]);
  }
  return c;
}
// Mide una década: por senda (los dos niveles y todos los temas juntos), por nivel, por tema y total.
async function medirDec(dec, n, opt){
  opt = opt || {};
  const temas = opt.temas || TEMAS, niveles = opt.niveles || [dec * 10 + 5, dec * 10 + 9], sendas = opt.sendas || CLS;
  const tot = vacia(), senda = {}, tema = {}, nivel = {}, sn = {};
  for(const st of sendas) for(const lv of niveles) for(const tm of temas){
    W.RIFT.tick = `${lv} ${st} ${tm} ${new Date().toISOString().slice(11, 19)}`;
    const c = await celda(st, lv, tm, n, opt.stages);
    suma(tot, c); suma(senda[st] = senda[st] || vacia(), c); suma(tema[tm] = tema[tm] || vacia(), c); suma(nivel[lv] = nivel[lv] || vacia(), c);
    suma(sn[st + ' ' + lv] = sn[st + ' ' + lv] || vacia(), c);
  }
  const map = (o)=>{ const r = {}; Object.keys(o).forEach(k=>{ r[k] = lee(o[k]); }); return r; };
  return Object.assign(lee(tot), {senda: map(senda), tema: map(tema), nivel: map(nivel), sendaNivel: map(sn), tuning: Object.assign({}, W.__riftTuning[dec])});
}
W.riftMedir = async ({decs, n, clave, temas, niveles, sendas})=>{
  const out = W.RIFT[clave] = W.RIFT[clave] || {}; W.RIFT.done = false;
  for(const d of decs){ out[d] = await medirDec(d, n || 10, {temas, niveles: niveles && niveles.map(o=> d * 10 + o), sendas}); guardar(); }
  W.RIFT.done = true; guardar();
};

// Búsqueda de un factor s sobre un par de mandos hasta acercar la medida al objetivo (misma idea que tune() de
// calib_1_80.js: paso proporcional amortiguado y, cuando el objetivo queda acotado, al medio).
async function buscar(label, set, target, read, steps, s0){
  let s = s0 || 1, last = null, lo = null, hi = null; const trail = [];
  const lg = (v)=>{ const p = Math.max(2, Math.min(98, v)) / 100; return Math.log(p / (1 - p)); };
  for(let i = 0; i < steps; i++){
    set(s); last = await read();
    trail.push([+s.toFixed(3), last]);
    W.RIFT.log.push(`${new Date().toISOString().slice(11, 19)} ${label} s=${s.toFixed(3)} → ${last}`); guardar();
    if(last === null || Math.abs(last - target) <= 3 || i === steps - 1) break;
    if(last > target) lo = lo === null ? s : Math.max(lo, s); else hi = hi === null ? s : Math.min(hi, s);
    if(lo !== null && hi !== null && lo < hi) s = Math.sqrt(lo * hi);
    else s *= Math.exp(Math.max(-0.45, Math.min(0.45, 0.25 * (lg(last) - lg(target)))));
  }
  const best = trail.filter(t=> t[1] !== null).sort((x, y)=> Math.abs(x[1] - target) - Math.abs(y[1] - target))[0];
  if(best){ s = best[0]; set(s); }
  return {s: +s.toFixed(3), medida: best && best[1], trail};
}
// Por década, dos búsquedas seguidas, cada una con un factor sobre vida y ataque a la vez:
//   1. las oleadas (hp/atk) hasta que la referencia llega al jefe el 76% de las veces;
//   2. el jefe (bossHp/bossAtk) hasta que se le gana el 60% de las veces que se llega.
// Un mando aparte para la primera oleada o para la élite no sirve: entre etapas no se cura nadie, así que con la
// primera oleada al 87% la segunda no pasa del 78% ni con la élite a una décima parte (medido el 2026-10-11).
// opt.desde: {dec: {hp, atk, ...}} para arrancar de otros valores; opt.solo: ['oleadas','jefe'].
W.riftCalibrar = async (decs, opt)=>{
  opt = opt || {};
  W.RIFT.log = W.RIFT.log || []; W.RIFT.cal = W.RIFT.cal || {}; W.RIFT.done = false;
  const T = W.__riftTuning, r3 = (v)=> +v.toFixed(3), n = opt.n || 10, pasos = opt.pasos || 8, solo = opt.solo || ['oleadas', 'jefe'];
  for(const d of decs){
    if(opt.desde && opt.desde[d]) Object.assign(T[d], opt.desde[d]);
    const base = Object.assign({}, T[d]), rec = {};
    if(solo.includes('oleadas')) rec.oleadas = await buscar(`d${d} oleadas`, (s)=>{ T[d].hp = r3(base.hp * s); T[d].atk = r3(base.atk * s); }, OBJ.llega, async ()=> (await medirDec(d, n, {stages: 2})).llega, pasos);
    if(solo.includes('jefe')) rec.jefe = await buscar(`d${d} jefe`, (s)=>{ T[d].bossHp = r3(base.bossHp * s); T[d].bossAtk = r3(base.bossAtk * s); }, OBJ.jefe, async ()=> (await medirDec(d, n)).jefe, pasos);
    rec.tuning = Object.assign({}, T[d]); W.RIFT.cal[d] = rec; guardar();
  }
  W.RIFT.done = true; guardar();
};
