// Estudio de aliados contra jefes y guardianes (solo localhost, sin sesión). Uso:
//   await import('/tools/medir_aliados.js');
//   medirAliados({n: 30});                        // por senda y combate; base + opciones
//   ALI.prog; aliadosMarkdown()
// Para cada jefe de década (10-100) y guardián (x5 de 21-95): % de victorias, aliados muertos al final, % de combates en
// que muere el primero de ellos y ronda media de su primera baja, por tipo de aliado (frente / retaguardia).
// Opciones (window.__aliados, solo simulador): hpMult, lastBreath, spread, rearAoe. Ver tools/mediciones/aliados-*.md.
await import('/tools/calib_harness.js');
const W = window;
if(!W.__st){
  W.__st = W.setTimeout; const q = [], ch = new MessageChannel();
  ch.port1.onmessage = ()=>{ const f = q.shift(); if(f) try{ f(); }catch(e){ console.error(e); } };
  W.setTimeout = (fn, ms, ...a)=>{ if(typeof fn === 'function' && (ms || 0) < 3000){ q.push(()=> fn(...a)); ch.port2.postMessage(0); return 0; } return W.__st(fn, ms, ...a); };
}
const CLS = ['pesada', 'paladin', 'doblefilo', 'tirador', 'mago', 'hechicero'];
const yieldNow = ()=> new Promise(res=>{ const ch = new MessageChannel(); ch.port1.onmessage = ()=> res(); ch.port2.postMessage(0); });
const race = (p, ms)=> Promise.race([p, new Promise(res=> W.__st(()=> res(null), ms))]);
W.ALI = W.ALI || {data: {}, prog: '', done: false};
W.ALI_OPCIONES = {
  base: {},
  vida15: {hpMult: 1.5},
  vida2: {hpMult: 2},
  ultimo: {lastBreath: true},
  reparto: {spread: true},
  area50: {rearAoe: 0.5},
  combinada: {hpMult: 1.5, spread: true},
  vuelve: {reviveAfter: 3},
};
const DEF = {hpMult: 1, lastBreath: false, spread: false, rearAoe: 1, reviveAfter: 0};
W.medirAliados = async (opts)=>{
  opts = opts || {};
  const n = opts.n || 30, combates = opts.combates || [[10,'jefe'],[20,'jefe'],[30,'jefe'],[40,'jefe'],[50,'jefe'],[60,'jefe'],[70,'jefe'],[80,'jefe'],[90,'jefe'],[100,'jefe'],
    [25,'guardian'],[45,'guardian'],[65,'guardian'],[85,'guardian'],[95,'guardian']];
  const opciones = opts.opciones || ['base'];
  W.__simIA({rules:true, learn:false});
  W.ALI.done = false;
  for(const op of opciones){
    W.__aliados(Object.assign({}, DEF, W.ALI_OPCIONES[op]));
    for(const [lv, kind] of combates){
      const key = `${op} ${kind} ${lv}`, c = W.ALI.data[key] || (W.ALI.data[key] = {});
      for(const st of CLS){
        const a = c[st] || (c[st] = {n:0, win:0, allies:0, dead:0, fights1:0, round1:0, frontDead:0, front:0, rearDead:0, rear:0, turns:0});
        while(a.n < n){
          W.ALI.prog = `${key} ${st} ${a.n}`; if(a.n % 4 === 0) await yieldNow();
          const r = await race(W.__sim(Object.assign({style: st, level: lv, dungeonLevel: lv, n: 1, beta: true, node: 'jefe'}, W.refFor(lv))), 10000);
          if(!r || !r.n) continue;
          a.n++; a.win += r.winRate === 100 ? 1 : 0; a.turns += r.avgTurns || 0;
          const al = r.allies || [];
          a.allies += al.length;
          const dead = al.filter(x=> x.deadAt != null);
          a.dead += al.filter(x=> x.vivo === false).length;   // muertos al final (con 'vuelve', uno que volvió y sigue vivo no cuenta)
          al.forEach(x=>{ if(x.front){ a.front++; if(x.deadAt != null) a.frontDead++; } else { a.rear++; if(x.deadAt != null) a.rearDead++; } });
          if(dead.length){ a.fights1++; a.round1 += Math.min(...dead.map(x=> x.deadAt)); }
        }
      }
    }
  }
  W.__aliados(DEF);
  W.ALI.done = true; W.ALI.prog = 'terminado';
};
W.aliadosMarkdown = ()=>{
  const out = ['| Opción | Combate | Victorias % | Aliados muertos al final (de los que había) | Muere al menos uno % | Ronda de la 1.ª baja | Frente muertos % | Retaguardia muertos % | Turnos |',
    '|---|---|---|---|---|---|---|---|---|'];
  Object.entries(W.ALI.data).forEach(([key, c])=>{
    const t = Object.values(c).reduce((s, a)=>{ Object.keys(a).forEach(k=> s[k] = (s[k] || 0) + a[k]); return s; }, {});
    const [op, kind, lv] = key.split(' ');
    const p = (x, y)=> y ? Math.round(x / y * 100) : '–';
    out.push(`| ${op} | ${kind} ${lv} | ${p(t.win, t.n)} | ${(t.dead / t.n).toFixed(1)} de ${(t.allies / t.n).toFixed(1)} | ${p(t.fights1, t.n)} | ${t.fights1 ? (t.round1 / t.fights1).toFixed(1) : '–'} | ${p(t.frontDead, t.front)} | ${p(t.rearDead, t.rear)} | ${(t.turns / t.n).toFixed(0)} |`);
  });
  return out.join('\n');
};
