// Medición de referencia oficial (paso 1 del plan de reestructuración). Solo localhost, sin sesión.
// Uso, en una pestaña PROPIA (otras sesiones pueden navegar la pestaña compartida del navegador integrado):
//   await import('/tools/medir_referencia.js');
//   medirReferencia();                 // todo; se puede parar y retomar (guarda en localStorage 'refMed.v1')
//   medirReferencia({solo:'jefes'});   // solo jefes de década
//   REF.prog                           // progreso
//   refMarkdown()                      // tablas en Markdown con error estándar
//   localStorage.removeItem('refMed.v1') para empezar de cero.
//   Dos pestañas a la vez: medirReferencia({solo:'niveles', orden:[7], key:'refMed.v1.b'}) en la segunda, y luego
//   refFusionar('refMed.v1.b') en la primera junta los datos.
//
// Qué mide (con la referencia de tools/calib_harness.js y las reglas de década encendidas):
//   - niveles enteros x3, x5 y x7 de cada década: completado, llegar vivo al guardián y ganarle cuando se llega;
//   - jefes de década 10-100 (combate suelto con el grupo descansado);
//   - 81-100 dos veces: sin profesión y con cada una de las 12 profesiones.
// La IA es la v2 SIN aprendizaje (opciones por defecto de simDefaultArm), para que la medida se pueda repetir:
// las opciones por defecto salen de entrenar antes con aprendizaje (ver tools/mediciones/referencia-*.md).
await import('/tools/calib_harness.js');
const W = window;
if(!W.__st){
  W.__st = W.setTimeout; const q = [], ch = new MessageChannel();
  ch.port1.onmessage = ()=>{ const f = q.shift(); if(f) try{ f(); }catch(e){ console.error(e); } };
  W.setTimeout = (fn, ms, ...a)=>{ if(typeof fn === 'function' && (ms || 0) < 3000){ q.push(()=> fn(...a)); ch.port2.postMessage(0); return 0; } return W.__st(fn, ms, ...a); };
}
const CLS = ['pesada', 'paladin', 'doblefilo', 'tirador', 'mago', 'hechicero'];
const PROFS = {pesada:['baluarte','verdugo'], paladin:['custodio','inquisidor'], doblefilo:['danzante','ejecutor'],
  tirador:['ballestero','francotirador'], mago:['piromante','criomante'], hechicero:['plaguero','maldecidor']};
let KEY = 'refMed.v1';   // medirReferencia({key}) usa otra clave (para medir en dos pestañas a la vez sin pisarse)
const yieldNow = ()=> new Promise(res=>{ const ch = new MessageChannel(); ch.port1.onmessage = ()=> res(); ch.port2.postMessage(0); });
const race = (p, ms)=> Promise.race([p, new Promise(res=> W.__st(()=> res(null), ms))]);
const load = ()=>{ try{ return JSON.parse(localStorage.getItem(KEY)) || {}; }catch(e){ return {}; } };
W.REF = W.REF || {data: load(), prog: '', done: false};
const save = ()=>{ try{ localStorage.setItem(KEY, JSON.stringify(W.REF.data)); }catch(e){} };
// una celda: clave -> {por variante (senda o senda:profesión): [intentos, éxitos, llega, guardián intentos, guardián ganados]}
function cell(key){ return W.REF.data[key] || (W.REF.data[key] = {}); }
function variants(lv, prof){ return prof ? CLS.flatMap(st=> PROFS[st].map(p=> st + ':' + p)) : CLS; }
// VARIANTE (rama sin-invisibles): opts.variante = {noHidden, ally:{hpMult, parity, rearAoe…}, potionsAll, learn, tag}.
let VAR = {};
const cfgOf = (v, lv, extra)=> Object.assign({style: v.split(':')[0], profession: v.split(':')[1] || null, level: lv, dungeonLevel: lv, n: 1, beta: true}, W.refFor(lv), VAR.potionsAll ? {potionsAll: VAR.potionsAll} : {}, extra || {});
// Calentamiento: recorridos y combates que no cuentan, para que la tabla de aprendizaje de la variante arranque entrenada.
async function warmUp(n){
  for(let i = 0; i < n; i++) for(const lv of [15, 25, 35, 45, 55, 65, 75, 85, 95]) for(const st of CLS){
    W.REF.prog = `calentando ${i} ${lv} ${st}`; await yieldNow();
    await race(W.__simLevel(cfgOf(st, lv)), 30000);
  }
  for(let i = 0; i < n; i++) for(const lv of [20, 30, 40, 50, 60, 70, 80, 90, 100]) for(const st of CLS){
    if(i % 2 === 0) await yieldNow();
    await race(W.__sim(cfgOf(st, lv, {node:'jefe'})), 10000);
  }
}
async function runLevel(key, lv, prof, total){
  const vs = variants(lv, prof), per = Math.ceil(total / vs.length), c = cell(key);
  for(const v of vs){
    const a = c[v] || (c[v] = [0, 0, 0, 0, 0]);
    while(a[0] < per){
      W.REF.prog = `${key} ${v} ${a[0]}/${per}`; await yieldNow();
      const r = await race(W.__simLevel(cfgOf(v, lv)), 30000);
      if(!r || !r.n) continue;
      a[0]++; a[1] += r.cleared; a[2] += (r.muereEn.combate + r.muereEn.elite) ? 0 : 1; a[3] += r.peleas.jefe[0]; a[4] += r.peleas.jefe[1];
      if(a[0] % 5 === 0) save();
    }
    save();
  }
}
async function runBoss(key, lv, prof, total){
  const vs = variants(lv, prof), per = Math.ceil(total / vs.length), c = cell(key);
  for(const v of vs){
    const a = c[v] || (c[v] = [0, 0, 0, 0, 0]);
    while(a[0] < per){
      W.REF.prog = `${key} ${v} ${a[0]}/${per}`; if(a[0] % 4 === 0) await yieldNow();
      const r = await race(W.__sim(cfgOf(v, lv, {node:'jefe'})), 10000);
      if(!r || !r.n) continue;
      a[0]++; a[1] += r.winRate === 100 ? 1 : 0;
      if(a[0] % 10 === 0) save();
    }
    save();
  }
}
W.medirReferencia = async (opts)=>{
  opts = opts || {};
  if(opts.key && opts.key !== KEY){ KEY = opts.key; W.REF.data = load(); }
  VAR = opts.variante || {};
  if(W.__sinInvisibles) W.__sinInvisibles(!!VAR.noHidden);
  if(W.__aliados) W.__aliados(Object.assign({hpMult:1, lastBreath:false, spread:false, rearAoe:1, reviveAfter:0, parity:false}, VAR.ally || {}));
  W.__simIA({rules:true, learn: VAR.learn != null ? !!VAR.learn : false, eps: VAR.eps || 0.10, persist:false, tag: VAR.tag || ''});
  if(VAR.warm){ await warmUp(VAR.warm); }
  if(W.__simAliadosUtil) W.__simAliadosUtil(true);
  W.__alter && W.__alter(true);
  const N = opts.n || 204;          // 204 = 34 por senda o 17 por profesión
  const NB = opts.nb || 300;        // jefes: 50 por senda o 25 por profesión
  W.REF.done = false;
  const bosses = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
  if(opts.solo !== 'niveles'){
    for(const lv of bosses) await runBoss('jefe ' + lv, lv, false, NB);
    for(const lv of [90, 100]) await runBoss('jefe ' + lv + ' prof', lv, true, NB);
  }
  if(opts.solo !== 'jefes'){
    const order = opts.orden || [5, 3, 7];   // primero los x5 de todas las décadas
    for(const u of order) for(let d = 0; d < 10; d++){
      const lv = d * 10 + u;
      await runLevel('nivel ' + lv, lv, false, N);
      if(d >= 8) await runLevel('nivel ' + lv + ' prof', lv, true, N);
    }
  }
  if(W.__simAliadosUtil){ W.REF.util = W.__simAliadosUtil(); try{ localStorage.setItem(KEY + '.util', JSON.stringify(W.REF.util)); }catch(e){} }
  W.REF.done = true; W.REF.prog = 'terminado';
};
W.refFusionar = (otra)=>{ let o = {}; try{ o = JSON.parse(localStorage.getItem(otra)) || {}; }catch(e){} Object.assign(W.REF.data, o); save(); return Object.keys(o).length; };
// ---- informe ----
const pct = (k, n)=> n ? Math.round(k / n * 100) : null;
// error estándar de la media de las variantes (cada una binomial), en puntos
function se(rows){
  const ok = rows.filter(r=> r[1] > 0);
  if(!ok.length) return null;
  const v = ok.reduce((s, [p, n])=> s + (p/100)*(1 - p/100)/n, 0) / (ok.length * ok.length);
  return Math.round(Math.sqrt(v) * 1000) / 10;
}
function summarize(c, idxK, idxN){
  const rows = Object.entries(c).map(([v, a])=> [v, pct(a[idxK], a[idxN]), a[idxN]]);
  const ok = rows.filter(r=> r[1] != null);
  const mean = ok.length ? Math.round(ok.reduce((s, r)=> s + r[1], 0) / ok.length) : null;
  return {mean, se: se(ok.map(r=> [r[1], r[2]])), rows, n: ok.reduce((s, r)=> s + r[2], 0)};
}
W.refMarkdown = ()=>{
  const D = W.REF.data, out = [];
  const head = (vs)=> `| Celda | Media | ±EE | n | ${vs.join(' | ')} |\n|---|---|---|---|${vs.map(()=> '---').join('|')}|`;
  const line = (label, s, vs)=> `| ${label} | **${s.mean}** | ${s.se} | ${s.n} | ${vs.map(v=>{ const r = s.rows.find(x=> x[0] === v); return r && r[1] != null ? r[1] : '–'; }).join(' | ')} |`;
  out.push('### Jefes de década (% de victorias, combate suelto)\n'); out.push(head(CLS));
  Object.keys(D).filter(k=> /^jefe \d+$/.test(k)).sort((a, b)=> parseInt(a.slice(5)) - parseInt(b.slice(5))).forEach(k=> out.push(line(k, summarize(D[k], 1, 0), CLS)));
  out.push('\n### Niveles enteros (completado %)\n'); out.push(head(CLS));
  const lv = Object.keys(D).filter(k=> /^nivel \d+$/.test(k)).sort((a, b)=> parseInt(a.slice(6)) - parseInt(b.slice(6)));
  lv.forEach(k=> out.push(line(k, summarize(D[k], 1, 0), CLS)));
  out.push('\n### Llegar vivo al guardián (%)\n'); out.push(head(CLS));
  lv.forEach(k=> out.push(line(k, summarize(D[k], 2, 0), CLS)));
  out.push('\n### Guardián ganado cuando se llega (%)\n'); out.push(head(CLS));
  lv.forEach(k=> out.push(line(k, summarize(D[k], 4, 3), CLS)));
  // por década: media de los niveles x3, x5, x7
  out.push('\n### Por década (media de los niveles medidos)\n');
  out.push('| Década | Niveles | Completado | ±EE | Llega | ±EE | Guardián | ±EE |\n|---|---|---|---|---|---|---|---|');
  for(let d = 0; d < 10; d++){
    const ks = lv.filter(k=> Math.floor((parseInt(k.slice(6)) - 1) / 10) === d);
    if(!ks.length) continue;
    const agg = (iK, iN)=>{ const s = ks.map(k=> summarize(D[k], iK, iN)); const m = Math.round(s.reduce((a, x)=> a + x.mean, 0) / s.length); const e = Math.round(Math.sqrt(s.reduce((a, x)=> a + x.se*x.se, 0)) / s.length * 10) / 10; return [m, e]; };
    const [c1, e1] = agg(1, 0), [c2, e2] = agg(2, 0), [c3, e3] = agg(4, 3);
    out.push(`| ${d*10+1}-${d*10+10} | ${ks.map(k=> k.slice(6)).join(', ')} | ${c1} | ${e1} | ${c2} | ${e2} | ${c3} | ${e3} |`);
  }
  const profKeys = Object.keys(D).filter(k=> / prof$/.test(k));
  if(profKeys.length){
    const vs = CLS.flatMap(st=> PROFS[st]);
    out.push('\n### 81-100 con profesión (completado % o victorias %)\n');
    out.push(`| Celda | Media | ±EE | n | ${vs.join(' | ')} |\n|---|---|---|---|${vs.map(()=> '---').join('|')}|`);
    profKeys.forEach(k=>{ const s = summarize(D[k], 1, 0); out.push(`| ${k} | **${s.mean}** | ${s.se} | ${s.n} | ${vs.map(p=>{ const r = s.rows.find(x=> x[0].endsWith(':' + p)); return r && r[1] != null ? r[1] : '–'; }).join(' | ')} |`); });
  }
  return out.join('\n');
};
