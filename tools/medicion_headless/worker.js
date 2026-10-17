// Trabajador de medición: corre dentro de la página del juego (headless) y pide tareas al servidor.
const W = window;
const realST = W.setTimeout;
const sleep = (ms)=> new Promise(r=> realST(r, ms));
const post = (u, d)=> fetch(u, {method:'POST', body: JSON.stringify(d)}).then(r=> r.json()).catch(()=> null);
const get = (u)=> fetch(u).then(r=> r.json());
const WID = (new URLSearchParams(location.search)).get('w') || Math.random().toString(36).slice(2, 7);
const log = (msg)=> post('/__log', {msg: `[${WID}] ${msg}`});
W.addEventListener('error', (e)=> log('error ' + (e.message || e)));
W.addEventListener('unhandledrejection', (e)=> log('rechazo ' + (e.reason && (e.reason.stack || e.reason.message) || e.reason)));
const yieldNow = ()=> new Promise(res=>{ const ch = new MessageChannel(); ch.port1.onmessage = ()=> res(); ch.port2.postMessage(0); });
const race = (p, ms)=> Promise.race([p, new Promise(res=> realST(()=> res(null), ms))]);
// Sin dibujar nada: como una pestaña oculta (el simulador no necesita animaciones) y sin gastar CPU en el raster.
W.requestAnimationFrame = ()=> 0;
try{ const stl = document.createElement('style'); stl.textContent = 'html,body{display:none!important} *{animation:none!important;transition:none!important}'; document.head.appendChild(stl); }catch(e){}
(async ()=>{
  for(let i = 0; i < 1800 && !(W.__sim && W.__vsClase && W.__simLevel); i++) await sleep(100);
  if(!W.__sim){ log('sin __sim, recargo'); location.reload(); return; }
  if((new URLSearchParams(location.search)).get('snap')){
    if((new URLSearchParams(location.search)).get('old')){ W.__sinInvisibles(false); W.__aliados({hpMult:1, parity:false, rearAoe:1}); }
    try{ const r = await W.__snapshot({}); await post('/__snap', {r, out: W.__snapshotUltima}); }catch(e){ await post('/__snap', {err: String(e && e.stack || e)}); }
    return;
  }
  const init = await get('/__init');
  // Tabla de aprendizaje compartida: se escribe en localStorage antes de la primera simulación.
  if(init.learnReady){
    const T = await get('/__learn.json');
    try{ localStorage.setItem('simAprende.v1', JSON.stringify(T)); }catch(e){ log('no guarda tabla ' + e.message); }
  } else { try{ localStorage.removeItem('simAprende.v1'); }catch(e){} }
  await import('/tools/calib_harness.js');
  if(!W.__st){
    W.__st = realST; const q = [], ch = new MessageChannel();
    ch.port1.onmessage = ()=>{ const f = q.shift(); if(f) try{ f(); }catch(e){ console.error(e); } };
    W.setTimeout = (fn, ms, ...a)=>{ if(typeof fn === 'function' && (ms || 0) < 3000){ q.push(()=> fn(...a)); ch.port2.postMessage(0); return 0; } return realST(fn, ms, ...a); };
  }
  if(init.ally) W.__aliados(init.ally);
  if(init.noHidden !== undefined) W.__sinInvisibles(init.noHidden);
  W.__simIA({rules:true, learn:true, eps:0.10, persist:false, tag: init.tag || 'cal'});
  W.__alter && W.__alter(true);
  const V = W.__vsClase, NAMES = ['tuning', 'beta', 'jefeTuning', 'jefeBeta', 'paraiso'];
  const BASE = JSON.parse(JSON.stringify(NAMES.reduce((o, k)=> (o[k] = V[k], o), {})));
  const restore = ()=> NAMES.forEach(k=>{ const o = V[k]; Object.keys(o).forEach(x=> delete o[x]); Object.assign(o, JSON.parse(JSON.stringify(BASE[k]))); });
  const applyTune = (t)=>{
    restore();
    if(!t) return;
    ['tuning', 'beta'].forEach(name=> Object.entries(t[name] || {}).forEach(([dec, kinds])=>{ V[name][dec] = Object.assign(V[name][dec] || {}, JSON.parse(JSON.stringify(kinds))); }));
    ['jefeTuning', 'jefeBeta'].forEach(name=> Object.entries(t[name] || {}).forEach(([lv, v])=>{ V[name][lv] = Object.assign({}, v); }));
    if(t.paraiso) Object.assign(V.paraiso, t.paraiso);
  };
  const cfgOf = (style, prof, lv, extra, ref)=>{ const c = Object.assign({style, profession: prof || null, level: lv, dungeonLevel: lv, n: 1, beta: true}, W.refFor(lv), {potionsAll: 10000}, ref || {}, extra || {}); if(!c.potionsAll) delete c.potionsAll; return c; };
  if(!init.learnReady){
    const tr = init.train || {levels:[25, 35, 45, 55, 65, 75, 85], bosses:[30, 40, 50, 60, 70, 80, 90], rounds:3};
    const CLS = ['pesada', 'paladin', 'doblefilo', 'tirador', 'mago', 'hechicero'];
    applyTune(init.trainTune || null);
    for(let i = 0; i < tr.rounds; i++){
      for(const lv of tr.levels) for(const st of CLS){ await yieldNow(); await race(W.__simLevel(cfgOf(st, null, lv)), 60000); }
      for(const lv of tr.bosses) for(const st of CLS){ await yieldNow(); await race(W.__sim(cfgOf(st, null, lv, {node:'jefe'})), 20000); }
      log('entrenamiento ronda ' + i);
    }
    const T = W.__simAprende(), raw = {};
    Object.entries(T).forEach(([k, arms])=>{ raw[k] = {}; Object.entries(arms).forEach(([a, v])=>{ raw[k][a] = [v.n, v.n * (v.media || 0)]; }); });
    await post('/__learnpost', {w: WID, table: raw});
    for(;;){ await sleep(3000); const i2 = await get('/__init'); if(i2.learnReady){ location.reload(); return; } }
  }
  log('listo');
  for(;;){
    let t;
    try{ t = await get('/__next?w=' + WID); }catch(e){ await sleep(2000); continue; }
    if(!t || !t.id){ await sleep(1500); continue; }
    applyTune(t.tune);
    const res = [0, 0, 0, 0, 0]; let err = 0;
    const t0 = Date.now();
    for(let i = 0; i < t.n && err < t.n; ){
      await yieldNow();
      if(t.kind === 'level'){
        const r = await race(W.__simLevel(cfgOf(t.style, t.prof, t.lv, null, t.ref)), 90000);
        if(!r || !r.n){ err++; continue; }
        res[0]++; res[1] += r.cleared; res[2] += (r.muereEn.combate + r.muereEn.elite) ? 0 : 1; res[3] += r.peleas.jefe[0]; res[4] += r.peleas.jefe[1];
      } else {
        const r = await race(W.__sim(cfgOf(t.style, t.prof, t.lv, {node:'jefe'}, t.ref)), 30000);
        if(!r || !r.n){ err++; continue; }
        res[0]++; res[1] += r.winRate === 100 ? 1 : 0;
      }
      i++;
    }
    for(let k = 0; k < 20; k++){ const ok = await post('/__result', {id: t.id, batch: t.batch, cell: t.cell, style: t.style, prof: t.prof || null, kind: t.kind, lv: t.lv, res, err, ms: Date.now() - t0, w: WID}); if(ok) break; await sleep(2000); }
  }
})();
