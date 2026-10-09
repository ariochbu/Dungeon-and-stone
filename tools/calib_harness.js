// Arnés de calibración para la consola del navegador (solo localhost).
// Uso: pegar en la consola con el juego abierto en http://localhost:5173, o
// cargarlo con  await import('/tools/calib_harness.js').
// Mide % de victorias por senda contra jefes y % de niveles completados, con
// la referencia de equipo fijada por ariochbu el 2026-10-08, y busca el ajuste
// de vida/ataque que acerca la media de las seis sendas al objetivo.
// Cada combate corre contra un temporizador: con la pestaña oculta el motor a
// veces se queda esperando una animación y ese combate se descarta.
const W = window;
W.CLS = ['pesada', 'paladin', 'doblefilo', 'tirador', 'mago', 'hechicero'];
const B = {gear: 'rango_b', stoneTier: 'B', petRarity: 'unico'}, A = {gear: 'rango_a', stoneTier: 'A', petRarity: 'epico'};
// aliados y rango de equipo por década (índice 0 = pisos 1-10)
W.REFS = [Object.assign({allies: 0}, B), Object.assign({allies: 1}, B), Object.assign({allies: 2}, A), Object.assign({allies: 3}, A),
  Object.assign({allies: 4}, A), Object.assign({allies: 4}, A), Object.assign({allies: 4}, A), Object.assign({allies: 4}, A)];
W.refFor = (lv)=> W.REFS[Math.min(W.REFS.length - 1, Math.floor((lv - 1) / 10))];
const race = (p, ms)=> Promise.race([p, new Promise(res=> setTimeout(()=> res(null), ms))]);
// Cede el hilo cada tanto (sin temporizadores: en una pestaña oculta el
// navegador los frena a uno por segundo) para que la página siga respondiendo.
const yieldNow = ()=> new Promise(res=>{ const ch = new MessageChannel(); ch.port1.onmessage = ()=> res(); ch.port2.postMessage(0); });
let fights = 0;
W.fight = async (st, lv)=>{
  W.prog = `${lv} ${st} #${++fights} ${new Date().toISOString().slice(11, 19)}`;
  if(fights % 5 === 0) await yieldNow();
  const r = await race(W.__sim(Object.assign({style: st, level: lv, dungeonLevel: lv, n: 1, beta: true}, W.refFor(lv))), 4000);
  return r ? (r.winRate === 100 ? 1 : 0) : null;
};
W.clearLevel = async (st, lv)=>{
  const r = await race(W.__simLevel(Object.assign({style: st, level: lv, dungeonLevel: lv, n: 1, beta: true}, W.refFor(lv))), 15000);
  return r ? (r.clear === 100 ? 1 : 0) : null;
};
W.measure = async (fn, lv, n)=>{
  const per = {}; let tot = 0, cnt = 0;
  for(const st of W.CLS){
    let w = 0, k = 0;
    for(let i = 0; i < n; i++){ const r = await fn(st, lv); if(r === null) continue; k++; w += r; }
    per[st] = k ? Math.round(w / k * 100) : null;
    if(k){ tot += w / k * 100; cnt++; }
  }
  return {mean: cnt ? Math.round(tot / cnt) : null, per};
};
// Búsqueda del factor s (multiplica a la vez vida y ataque del ajuste base)
// que deja la media en el objetivo. set(hp, atk) aplica el ajuste.
W.search = async (fn, lv, target, base, set, n, steps, lo0, hi0)=>{
  let lo = lo0 || 0.35, hi = hi0 || 3.0, s = 1, last = null;
  const log = [];
  for(let i = 0; i < (steps || 5); i++){
    set(+(base.hp * s).toFixed(3), +(base.atk * s).toFixed(3));
    last = await W.measure(fn, lv, n);
    log.push(`${s.toFixed(3)}→${last.mean}`);
    if(Math.abs(last.mean - target) <= 4) break;
    if(last.mean > target) lo = s; else hi = s;      // gana de más → enemigo más fuerte
    s = Math.sqrt(lo * hi);
  }
  set(+(base.hp * s).toFixed(3), +(base.atk * s).toFixed(3));
  return {s: +s.toFixed(3), hp: +(base.hp * s).toFixed(2), atk: +(base.atk * s).toFixed(2), mean: last.mean, per: last.per, log: log.join(' ')};
};

// ---- Calibración completa de jefes: media al objetivo y luego cada senda ----
W.BOSS_BASE = {10:{hp:0.24,atk:0.50},20:{hp:0.80,atk:0.80},30:{hp:1.05,atk:1.00},40:{hp:0.87,atk:0.82},50:{hp:1.42,atk:1.45},60:{hp:1.85,atk:2.05},70:{hp:1.90,atk:2.10},80:{hp:1.89,atk:2.04}};
W.BOSS_TARGET = {10:65,20:65,30:65,40:65,50:60,60:50,70:40,80:30};
W.setBoss = (lv)=> (hp, atk)=> (lv <= 40 ? W.__simTuneBeta : W.__simTune)(lv, hp, atk);
// Daño de una senda en el nivel lv (índice lv/10) hasta que ESA senda quede en el objetivo.
W.fitClass = async (st, lv, target, n)=>{
  const idx = lv / 10, arr = W.__classDmg[st];
  let lo = 0.5, hi = 1.7, v = arr[idx], pct = null;
  for(let i = 0; i < 5; i++){
    arr[idx] = +v.toFixed(3);
    let w = 0, k = 0;
    for(let j = 0; j < n; j++){ const r = await W.fight(st, lv); if(r === null) continue; k++; w += r; }
    pct = k ? Math.round(w / k * 100) : null;
    if(pct === null || Math.abs(pct - target) <= 6) break;
    if(pct > target) hi = v; else lo = v;            // gana de más → menos daño
    v = Math.sqrt(lo * hi);
  }
  arr[idx] = +v.toFixed(3);
  return {v: +v.toFixed(2), pct};
};
W.calibBosses = async (levels)=>{
  W.calib = W.calib || {};
  for(const lv of levels){
    const t = W.BOSS_TARGET[lv], rec = {};
    rec.a = await W.search(W.fight, lv, t, W.BOSS_BASE[lv], W.setBoss(lv), 20, 6);
    rec.cls = {};
    for(const st of W.CLS) rec.cls[st] = await W.fitClass(st, lv, t, 24);
    rec.b = await W.search(W.fight, lv, t, {hp: rec.a.hp, atk: rec.a.atk}, W.setBoss(lv), 30, 5, 0.75, 1.33);
    rec.final = await W.measure(W.fight, lv, 30);
    W.calib[lv] = rec; W.calibStep = lv;
  }
  W.calibDone = true;
};

// ---- Segunda vuelta: daño de clase suavizado, jefes otra vez y pisos ----
// Valores por nivel [1,10,...,80] tras suavizar el ajuste senda a senda.
W.CLASS_DMG_SMOOTH = {
  pesada:    [1, 0.65, 0.65, 0.65, 0.65, 0.65, 0.65, 0.65, 0.70],
  paladin:   [1, 0.80, 0.85, 0.90, 0.85, 0.90, 0.80, 0.85, 0.95],
  doblefilo: [1, 1.10, 1.15, 1.10, 1.05, 1.00, 1.00, 1.05, 1.20],
  tirador:   [1, 1.12, 1.10, 1.10, 1.12, 1.10, 1.20, 1.15, 1.15],
  mago:      [1, 1.15, 0.85, 0.85, 1.00, 0.95, 1.20, 1.20, 1.00],
  hechicero: [1, 1.30, 1.30, 1.40, 1.30, 1.30, 1.60, 1.67, 1.67],
};
W.calibBosses2 = async (start)=>{
  Object.keys(W.CLASS_DMG_SMOOTH).forEach(st=> W.CLASS_DMG_SMOOTH[st].forEach((v, i)=>{ W.__classDmg[st][i] = v; }));
  W.calib2 = {};
  for(const lv of [10, 20, 30, 40, 50, 60, 70, 80]){
    const rec = await W.search(W.fight, lv, W.BOSS_TARGET[lv], start[lv], W.setBoss(lv), 30, 6, 0.7, 1.45);
    rec.final = await W.measure(W.fight, lv, 40);
    W.calib2[lv] = rec; W.calibStep = 'b' + lv;
  }
};
// Pisos: un factor por década sobre normales, élites y guardianes a la vez.
W.FLOOR_BASE = [
  {regular:[1, 1], elite:[1, 1], guardian:[0.60, 0.70]},
  {regular:[1.08, 1.16], elite:[1.08, 1.16], guardian:[1.08, 1.16]},
  {regular:[1, 1], elite:[1, 1], guardian:[1, 1]},
  {regular:[1.30, 1.50], elite:[1.30, 1.50], guardian:[1.20, 1.35]},
  {regular:[1, 1], elite:[1, 1], guardian:[1, 1]},
  {regular:[1.8, 2.6], elite:[1.7, 2.4], guardian:[1.5, 1.75]},
  {regular:[2.5, 3.8], elite:[2.5, 3.8], guardian:[1.9, 2.4]},
  {regular:[2.8, 4.3], elite:[2.8, 4.3], guardian:[2.1, 2.65]},
];
W.FLOOR_TARGET = [90, 90, 90, 90, 78, 75, 75, 75];
W.setFloor = (dec, s)=> ['regular', 'elite', 'guardian'].forEach(k=>{
  const b = W.FLOOR_BASE[dec][k];
  (dec <= 3 ? W.__simScaleBeta : W.__simScale)(dec, k, +(b[0] * s).toFixed(3), +(b[1] * s).toFixed(3));
});
W.calibFloors = async ()=>{
  W.calibF = {};
  for(let dec = 0; dec < 8; dec++){
    const lv = dec * 10 + 5, t = W.FLOOR_TARGET[dec];
    let lo = 0.4, hi = 3.0, s = 1, last = null; const log = [];
    for(let i = 0; i < 5; i++){
      W.setFloor(dec, s);
      last = await W.measure(W.clearLevel, lv, 5);
      log.push(`${s.toFixed(2)}→${last.mean}`);
      if(last.mean === null || Math.abs(last.mean - t) <= 6) break;
      if(last.mean > t) lo = s; else hi = s;
      s = Math.sqrt(lo * hi);
    }
    W.setFloor(dec, s);
    const b = W.FLOOR_BASE[dec];
    W.calibF[dec] = {s: +s.toFixed(2), log: log.join(' '), per: last.per,
      regular: b.regular.map(v=> +(v * s).toFixed(2)), elite: b.elite.map(v=> +(v * s).toFixed(2)), guardian: b.guardian.map(v=> +(v * s).toFixed(2))};
    W.calibStep = 'f' + dec;
  }
};
W.calibAll2 = async (start)=>{ W.calibDone = false; await W.calibBosses2(start); await W.calibFloors(); W.calibDone = true; };

// ---- Tercera vuelta (2026-10-08): pisos 21-80 con los objetivos de ariochbu ----
// 1-20: 90% (no se tocan), 21-40: 80%, 41-60: 70%, 61-80: 60%. Se mide SIN
// Ley del Caos ni Corrupción (__alter(false)). base = escala vigente en el código.
W.FLOOR_BASE3 = {
  2: {regular:[1.73, 1.73], elite:[1.73, 1.73], guardian:[1.73, 1.73]},
  3: {regular:[2.18, 2.51], elite:[2.18, 2.51], guardian:[2.01, 2.26]},
  4: {regular:[1.23, 1.23], elite:[1.23, 1.23], guardian:[1.23, 1.23]},
  5: {regular:[2.06, 2.98], elite:[1.95, 2.75], guardian:[1.72, 2.01]},
  6: {regular:[2.5, 3.8], elite:[2.5, 3.8], guardian:[1.9, 2.4]},
  7: {regular:[3.21, 4.93], elite:[3.21, 4.93], guardian:[2.41, 3.04]},
};
W.FLOOR_TARGET3 = {2: 80, 3: 80, 4: 70, 5: 70, 6: 60, 7: 60};
W.calibFloors3 = async (nPer)=>{
  W.__alter(false); W.calibDone = false; W.calibF3 = {};
  const setF = (dec, s)=> ['regular', 'elite', 'guardian'].forEach(k=>{ const b = W.FLOOR_BASE3[dec][k]; (dec <= 3 ? W.__simScaleBeta : W.__simScale)(dec, k, +(b[0]*s).toFixed(3), +(b[1]*s).toFixed(3)); });
  // dos niveles por década (el 3 y el 7) para no calibrar contra un solo guardián
  const meas = async (dec, n)=>{ const a = await W.measure(W.clearLevel, dec*10 + 3, n), b = await W.measure(W.clearLevel, dec*10 + 7, n); const per = {}; W.CLS.forEach(c=> per[c] = Math.round((a.per[c] + b.per[c]) / 2)); return {mean: Math.round((a.mean + b.mean) / 2), per}; };
  W.calibF3.base = {5: await W.measure(W.clearLevel, 5, nPer), 15: await W.measure(W.clearLevel, 15, nPer)};
  for(const dec of [2, 3, 4, 5, 6, 7]){
    const t = W.FLOOR_TARGET3[dec]; let lo = 0.5, hi = 2.2, s = 1, last = null; const log = [];
    for(let i = 0; i < 5; i++){
      setF(dec, s); last = await meas(dec, nPer); log.push(`${s.toFixed(2)}→${last.mean}`);
      if(Math.abs(last.mean - t) <= 5) break;
      if(last.mean > t) lo = s; else hi = s;
      s = Math.sqrt(lo * hi);
    }
    setF(dec, s);
    const fin = await meas(dec, nPer + 2), b = W.FLOOR_BASE3[dec];
    W.calibF3[dec] = {s: +s.toFixed(2), log: log.join(' '), fin, vals: ['regular', 'elite', 'guardian'].map(k=> b[k].map(v=> +(v*s).toFixed(2)))};
    W.calibStep = 'f3-' + dec;
  }
  W.calibDone = true;
};

// ---- Cuarta vuelta (2026-10-08): pisos 3-20 y jefes del 10 y del 20 ----
W.calibLow = async (nPer)=>{
  W.calibDone = false; W.calibLowR = {};
  const BASE = {0: {regular:[1, 1], elite:[1, 1], guardian:[0.60, 0.70]}, 1: {regular:[1.08, 1.16], elite:[1.08, 1.16], guardian:[1.08, 1.16]}};
  const setF = (dec, s)=> ['regular', 'elite', 'guardian'].forEach(k=>{ const b = BASE[dec][k]; W.__simScaleBeta(dec, k, +(b[0]*s).toFixed(3), +(b[1]*s).toFixed(3)); });
  const meas = async (dec, n)=>{ const a = await W.measure(W.clearLevel, dec*10 + 4, n), b = await W.measure(W.clearLevel, dec*10 + 8, n); const per = {}; W.CLS.forEach(c=> per[c] = Math.round((a.per[c] + b.per[c]) / 2)); return {mean: Math.round((a.mean + b.mean) / 2), per}; };
  for(const dec of [0, 1]){
    let lo = 0.6, hi = 3.2, s = 1, last = null; const log = [];
    for(let i = 0; i < 6; i++){
      setF(dec, s); last = await meas(dec, nPer); log.push(`${s.toFixed(2)}→${last.mean}`);
      if(Math.abs(last.mean - 90) <= 4) break;
      if(last.mean > 90) lo = s; else hi = s;
      s = Math.sqrt(lo * hi);
    }
    setF(dec, s);
    W.calibLowR['f' + dec] = {s: +s.toFixed(2), log: log.join(' '), fin: await meas(dec, nPer + 2), vals: ['regular', 'elite', 'guardian'].map(k=> BASE[dec][k].map(v=> +(v*s).toFixed(2)))};
    W.calibStep = 'low-f' + dec;
  }
  for(const lv of [10, 20]){
    const rec = await W.search(W.fight, lv, 65, W.BOSS_BASE[lv], W.setBoss(lv), 30, 6);
    rec.final = await W.measure(W.fight, lv, 40);
    W.calibLowR['b' + lv] = rec; W.calibStep = 'low-b' + lv;
  }
  W.calibDone = true;
};

// ---- Quinta vuelta (2026-10-08): evaluación completa con la rama clases-x1 ----
// (daño x1, vida nueva, kit y rotación del Hechicero, dos tanques para la
// retaguardia). evalAll mide; calibAll5 ajusta jefes 30-80 y pisos 21-80.
W.evalAll = async (nBoss, nFloor)=>{
  const out = {boss: {}, floor: {}};
  for(const lv of [10, 20, 30, 40, 50, 60, 70, 80]) out.boss[lv] = await W.measure(W.fight, lv, nBoss);
  W.__alter(false);
  for(const lv of [5, 15, 25, 35, 45, 55, 65, 75]) out.floor[lv] = await W.measure(W.clearLevel, lv, nFloor);
  W.__alter(true);
  return out;
};
W.calibAll5 = async (bossBase, floorBase)=>{
  W.calibDone = false; W.c5 = {before: await W.evalAll(24, 6), boss: {}, floor: {}};
  W.calibStep = 'c5-before';
  for(const lv of [30, 40, 50, 60, 70, 80]){
    const rec = await W.search(W.fight, lv, W.BOSS_TARGET[lv], bossBase[lv], W.setBoss(lv), 30, 6, 0.6, 1.7);
    W.c5.boss[lv] = {hp: rec.hp, atk: rec.atk, log: rec.log}; W.calibStep = 'c5-b' + lv;
  }
  W.__alter(false);
  const setF = (dec, s)=> ['regular', 'elite', 'guardian'].forEach(k=>{ const b = floorBase[dec][k]; (dec <= 3 ? W.__simScaleBeta : W.__simScale)(dec, k, +(b[0]*s).toFixed(3), +(b[1]*s).toFixed(3)); });
  const meas = async (dec, n)=>{ const a = await W.measure(W.clearLevel, dec*10 + 3, n), b = await W.measure(W.clearLevel, dec*10 + 7, n); return Math.round((a.mean + b.mean) / 2); };
  for(const dec of [2, 3, 4, 5, 6, 7]){
    const t = W.FLOOR_TARGET3[dec]; let lo = 0.5, hi = 2.2, s = 1; const log = [];
    for(let i = 0; i < 5; i++){
      setF(dec, s); const m = await meas(dec, 6); log.push(`${s.toFixed(2)}→${m}`);
      if(Math.abs(m - t) <= 5) break;
      if(m > t) lo = s; else hi = s;
      s = Math.sqrt(lo * hi);
    }
    setF(dec, s);
    W.c5.floor[dec] = {s: +s.toFixed(2), log: log.join(' '), vals: ['regular', 'elite', 'guardian'].map(k=> floorBase[dec][k].map(v=> +(v*s).toFixed(2)))};
    W.calibStep = 'c5-f' + dec;
  }
  W.__alter(true);
  W.c5.after = await W.evalAll(30, 6);
  W.calibDone = true;
};
