// Recalibración de 1-80 con los objetivos de ariochbu del 2026-10-09 (solo localhost).
// Uso:  await import('/tools/calib_1_80.js');  calib180();   → progreso en window.CAL (y en localStorage 'cal180').
//
// Objetivos (% de combates ganados con la referencia de calib_harness.js: rango A, piedras A, Caídos
// épicos y los aliados de la beta; rango B en 1-20, donde el A todavía no se puede equipar):
//   salas normales y de élite: % de recorridos en que la referencia llega viva al guardián
//                      1-19: 90 · 21-39: 85 · 41-59: 80 · 61-79: 75
//   jefe de década     10: 90 · 20: 85 · 30: 80 · 40: 75 · 50: 70 · 60: 50 · 70: 40 · 80: 30
//   guardianes         % de veces que se les gana cuando se llega: el objetivo de su jefe de década + 5
// Todo se mide recorriendo el nivel entero (vida, MP y pociones se arrastran de sala en sala, como en el
// juego). Medir cada combate normal por separado no sirve: con 8-9 salas por nivel, un 80% por combate
// dejaba los niveles completados en 8-14% y solo contaba a las sendas que sobrevivían.
// 1-20 solo se mide (rango B, ~100%): no se endurece para no cerrar el paso a personajes nuevos.
await import('/tools/calib_harness.js');
const W = window, CLS = W.CLS, V = W.__vsClase;
const FIGHT_TARGET = [90, 90, 85, 85, 80, 80, 75, 75];
const BOSS_TARGET = {10: 90, 20: 85, 30: 80, 40: 75, 50: 70, 60: 50, 70: 40, 80: 30};
// Con la pestaña oculta el navegador frena los temporizadores a uno por segundo y el simulador se
// arrastra: los cortos se despachan por MessageChannel (los largos, que son los de corte, siguen igual).
if(!W.__st){
  W.__st = W.setTimeout; const q = [], ch = new MessageChannel();
  ch.port1.onmessage = ()=>{ const f = q.shift(); if(f) try{ f(); }catch(e){ console.error(e); } };
  W.setTimeout = (fn, ms, ...a)=>{ if(typeof fn === 'function' && (ms || 0) < 3000){ q.push(()=> fn(...a)); ch.port2.postMessage(0); return 0; } return W.__st(fn, ms, ...a); };
}
const race = (p, ms)=> Promise.race([p, new Promise(res=> setTimeout(()=> res(null), ms))]);
const yieldNow = ()=> new Promise(res=>{ const ch = new MessageChannel(); ch.port1.onmessage = ()=> res(); ch.port2.postMessage(0); });
const cfg = (st, lv, extra)=> Object.assign({style: st, level: lv, dungeonLevel: lv, n: 1, beta: true}, W.refFor(lv), extra || {});
const pct = (w, t)=> t ? Math.round(w / t * 100) : null;
const save = ()=>{ try{ localStorage.setItem('cal180', JSON.stringify(W.CAL)); }catch(e){} };
const note = (s)=>{ W.CAL.log.push(new Date().toISOString().slice(11, 19) + ' ' + s); W.CAL.now = s; save(); };

// ---- escalas ----
const scaleOf = (dec, kind)=>{
  if(dec === 4 && kind === 'guardian') return {hp: V.paraiso.hp, atk: V.paraiso.atk};   // Isla Paraíso: el guardián es un grupo
  const t = dec <= 3 ? V.beta[dec] : V.tuning[dec];
  const v = t && (t[kind] || (t.hp ? t : null));
  return v ? {hp: v.hp, atk: v.atk} : {hp: 1, atk: 1};
};
const setScale = (dec, kind, hp, atk)=>{
  if(dec === 4 && kind === 'guardian'){ V.paraiso.hp = hp; V.paraiso.atk = atk; return; }
  if(dec <= 3){
    // en la beta, si la década tenía un único {hp, atk} o le faltaban tipos, se completan antes de tocar uno
    const full = {}; ['regular', 'elite', 'guardian'].forEach(k=>{ full[k] = scaleOf(dec, k); });
    full[kind] = {hp, atk}; V.beta[dec] = full;
  } else V.tuning[dec][kind] = {hp, atk};
};
const bossOf = (lv)=> Object.assign({}, (lv <= 40 ? V.jefeBeta : V.jefeTuning)[lv]);
const setBoss = (lv, hp, atk)=>{ (lv <= 40 ? V.jefeBeta : V.jefeTuning)[lv] = {hp, atk}; };

// ---- medidas ----
// Recorridos de nivel: combates normales y guardián ganados, y niveles completados, por senda y en total.
async function measureLevels(dec, n){
  const out = {per: {}, lle: [0, 0], gua: [0, 0], clear: [0, 0]};
  for(const st of CLS){
    const p = {lle: [0, 0], gua: [0, 0], clear: [0, 0]};
    for(const lv of [dec * 10 + 3, dec * 10 + 7]){
      for(let i = 0; i < n; i++){
        W.CAL.tick = `${lv} ${st} ${i}`;
        const r = await race(W.__simLevel(cfg(st, lv)), 25000); await yieldNow();
        if(!r) continue;
        p.clear[0]++; p.clear[1] += r.cleared;
        p.lle[0]++; p.lle[1] += (r.muereEn.combate + r.muereEn.elite) ? 0 : 1;   // llegó al guardián
        p.gua[0] += r.peleas.jefe[0]; p.gua[1] += r.peleas.jefe[1];
      }
    }
    out.per[st] = {lle: pct(p.lle[1], p.lle[0]), gua: pct(p.gua[1], p.gua[0]), clear: pct(p.clear[1], p.clear[0]), nGua: p.gua[0]};
    ['lle', 'gua', 'clear'].forEach(k=>{ out[k][0] += p[k][0]; out[k][1] += p[k][1]; });
  }
  return {lle: pct(out.lle[1], out.lle[0]), gua: pct(out.gua[1], out.gua[0]), clear: pct(out.clear[1], out.clear[0]), nGua: out.gua[0], per: out.per};
}
// Combates sueltos (élite o jefe de década): % por senda y media.
async function measureFights(lvs, node, n){
  const per = {}; let tot = 0, cnt = 0;
  for(const st of CLS){
    let w = 0, k = 0;
    for(const lv of lvs) for(let i = 0; i < n; i++){
      W.CAL.tick = `${lv} ${st} ${node} ${i}`;
      const r = await race(W.__sim(cfg(st, lv, {node})), 6000); if(i % 4 === 0) await yieldNow();
      if(!r) continue; k++; if(r.winRate === 100) w++;
    }
    per[st] = pct(w, k); if(k){ tot += w / k * 100; cnt++; }
  }
  return {mean: cnt ? Math.round(tot / cnt) : null, per};
}

// ---- búsqueda: sube o baja vida y ataque a la vez hasta acercar la medida al objetivo ----
// Paso proporcional y amortiguado (una lectura ruidosa no descarrila la búsqueda, la siguiente la corrige).
async function tune(label, get, set, target, read, steps){
  const base = get(); let s = 1, last = null, lo = null, hi = null; const trail = [];   // lo: mayor s que aún gana de más; hi: menor s que ya gana de menos
  for(let i = 0; i < steps; i++){
    set(+(base.hp * s).toFixed(3), +(base.atk * s).toFixed(3));
    last = await read();
    trail.push(`${s.toFixed(3)}→${last}`);
    if(last === null || Math.abs(last - target) <= 3) break;
    if(i === steps - 1) break;
    const lg = (v)=>{ const p = Math.max(2, Math.min(98, v)) / 100; return Math.log(p / (1 - p)); };
    if(last > target) lo = lo === null ? s : Math.max(lo, s); else hi = hi === null ? s : Math.min(hi, s);
    if(lo !== null && hi !== null && lo < hi) s = Math.sqrt(lo * hi);   // ya está acotado: al medio
    else s *= Math.exp(Math.max(-0.4, Math.min(0.4, 0.3 * (lg(last) - lg(target)))));
  }
  // se queda con el paso que más se acercó
  const best = trail.map(t=> t.split('→').map(Number)).filter(t=> !isNaN(t[1])).sort((x, y)=> Math.abs(x[1] - target) - Math.abs(y[1] - target))[0];
  if(best){ s = best[0]; last = best[1]; set(+(base.hp * s).toFixed(3), +(base.atk * s).toFixed(3)); }
  note(`${label} obj ${target}: ${trail.join(' ')} ⇒ ${s}`);
  return {s: +s.toFixed(3), last, v: get()};
}
// Reparto por senda: la que gana de más recibe más daño, la que gana de menos, menos.
function nudgeClass(table, per, key, target){
  const lg = (v)=>{ const p = Math.max(3, Math.min(97, v)) / 100; return Math.log(p / (1 - p)); };
  CLS.forEach(st=>{
    const v = per[st] != null && typeof per[st] === 'object' ? per[st][key] : per[st];
    if(v == null) return;
    const m = (table[st] || 1) * Math.exp(Math.max(-0.3, Math.min(0.3, 0.25 * (lg(v) - lg(target)))));
    table[st] = +Math.max(0.4, Math.min(1.8, m)).toFixed(3);
  });
}

// Normales y élites se mueven juntos (un solo factor sobre los dos) hasta que la referencia llega al
// guardián el T% de las veces; el guardián, hasta que se le gana el TG% de las veces que se llega.
async function calibDecade(dec, tuneIt){
  const T = FIGHT_TARGET[dec], TG = BOSS_TARGET[dec * 10 + 10] + 5, rec = {T, TG};
  V.dec[dec] = V.dec[dec] || {}; V.gua[dec] = V.gua[dec] || {};
  const mobs = {get: ()=> ({hp: 1, atk: 1, r: scaleOf(dec, 'regular'), e: scaleOf(dec, 'elite')}), base: null};
  const getMobs = ()=>{ mobs.base = {r: scaleOf(dec, 'regular'), e: scaleOf(dec, 'elite')}; return {hp: 1, atk: 1}; };
  const setMobs = (h, a)=>{ setScale(dec, 'regular', +(mobs.base.r.hp * h).toFixed(3), +(mobs.base.r.atk * a).toFixed(3)); setScale(dec, 'elite', +(mobs.base.e.hp * h).toFixed(3), +(mobs.base.e.atk * a).toFixed(3)); };
  const sendas = async (key, table, target, label)=>{
    for(let k = 0; k < 4; k++){
      const m = await measureLevels(dec, 16);
      note(`d${dec} sendas ${label} v${k}: ${CLS.map(st=> st.slice(0, 3) + ' ' + m.per[st][key]).join(' ')} (media ${m[key]})`);
      if(CLS.every(st=> m.per[st][key] != null && Math.abs(m.per[st][key] - target) <= 7)) break;
      nudgeClass(table, m.per, key, target);
    }
  };
  if(tuneIt){
    await tune(`d${dec} salas`, getMobs, setMobs, T, async ()=> (await measureLevels(dec, 8)).lle, 7);
    await sendas('lle', V.dec[dec], T, 'salas');
    await tune(`d${dec} salas (repaso)`, getMobs, setMobs, T, async ()=> (await measureLevels(dec, 12)).lle, 4);
    await tune(`d${dec} guardianes`, ()=> scaleOf(dec, 'guardian'), (h, a)=> setScale(dec, 'guardian', h, a), TG, async ()=> (await measureLevels(dec, 14)).gua, 7);
    await sendas('gua', V.gua[dec], TG, 'guardián');
    await tune(`d${dec} guardianes (repaso)`, ()=> scaleOf(dec, 'guardian'), (h, a)=> setScale(dec, 'guardian', h, a), TG, async ()=> (await measureLevels(dec, 16)).gua, 4);
  }
  rec.final = await measureLevels(dec, 30);
  rec.scale = {regular: scaleOf(dec, 'regular'), elite: scaleOf(dec, 'elite'), guardian: scaleOf(dec, 'guardian')};
  rec.clase = Object.assign({}, V.dec[dec]); rec.claseGuardian = Object.assign({}, V.gua[dec]);
  W.CAL.dec[dec] = rec;
  note(`d${dec} FINAL llega ${rec.final.lle} [${CLS.map(st=> rec.final.per[st].lle).join(' ')}] guardián ${rec.final.gua} [${CLS.map(st=> rec.final.per[st].gua).join(' ')}] niveles ${rec.final.clear}`);
}
async function calibBoss(lv){
  const T = BOSS_TARGET[lv], rec = {T};
  V.jefe[lv] = V.jefe[lv] || {};
  await tune(`jefe ${lv}`, ()=> bossOf(lv), (h, a)=> setBoss(lv, h, a), T, async ()=> (await measureFights([lv], 'jefe', 40)).mean, 7);
  for(let k = 0; k < 3; k++){
    const m = await measureFights([lv], 'jefe', 60);
    note(`jefe ${lv} sendas v${k}: ${CLS.map(st=> st.slice(0, 3) + ' ' + m.per[st]).join(' ')} (media ${m.mean})`);
    nudgeClass(V.jefe[lv], m.per, null, T);
  }
  await tune(`jefe ${lv} (repaso)`, ()=> bossOf(lv), (h, a)=> setBoss(lv, h, a), T, async ()=> (await measureFights([lv], 'jefe', 50)).mean, 4);
  rec.final = await measureFights([lv], 'jefe', 100);
  rec.tune = bossOf(lv); rec.clase = Object.assign({}, V.jefe[lv]);
  W.CAL.boss[lv] = rec;
  note(`jefe ${lv} FINAL ${rec.final.mean}: ${CLS.map(st=> st.slice(0, 3) + ' ' + rec.final.per[st]).join(' ')}`);
}

// decs: décadas a ajustar; soloMedir: décadas que solo se miden; bosses: jefes a ajustar.
W.calib180 = async (decs, soloMedir, bosses)=>{
  W.CAL = {log: [], dec: {}, boss: {}, done: false, started: new Date().toISOString()};
  try{
    for(const d of (soloMedir || [0, 1])) await calibDecade(d, false);
    for(const d of (decs || [2, 3, 4, 5, 6, 7])) await calibDecade(d, true);
    for(const lv of (bosses || [10, 20, 30, 40, 50, 60, 70, 80])) await calibBoss(lv);
  }catch(e){ note('ERROR ' + (e && e.stack || e)); W.CAL.error = String(e); }
  W.CAL.done = true; save();
};
