// Compara varias mediciones de tools/medir_referencia.js guardadas en localStorage (solo localhost).
//   await import('/tools/comparar_variantes.js');
//   compararVariantes([['Hoy', 'si.hoy'], ['Sin invisibles ×1,5', 'si.x15'], ['Sin invisibles ×2', 'si.x2']]);
// Devuelve Markdown: por década (llega / guardián / completado), jefes, sendas por década y utilidad de aliados.
const W = window;
const CLS = ['pesada', 'paladin', 'doblefilo', 'tirador', 'mago', 'hechicero'];
const NOMBRE = {pesada:'Guerrero', paladin:'Paladín', doblefilo:'Asesino', tirador:'Arquero', mago:'Mago', hechicero:'Hechicero'};
const load = (k)=>{ try{ return JSON.parse(localStorage.getItem(k)) || {}; }catch(e){ return {}; } };
const f1 = (x)=> x == null ? '–' : String(x).replace('.', ',');
// media de las variantes de una celda (cada una binomial) y su error estándar
function cellStat(c, iK, iN, only){
  const rows = Object.entries(c || {}).filter(([v])=> !only || only.includes(v)).map(([v, a])=> [a[iN] ? a[iK]/a[iN] : null, a[iN]]).filter(r=> r[0] != null);
  if(!rows.length) return null;
  const m = rows.reduce((s, r)=> s + r[0], 0) / rows.length;
  const v = rows.reduce((s, [p, n])=> s + p*(1 - p)/n, 0) / (rows.length*rows.length);
  return {m: m*100, se: Math.sqrt(v)*100};
}
function decadeStat(D, d, iK, iN, only){
  const s = [3, 5, 7].map(u=> cellStat(D['nivel ' + (d*10 + u)], iK, iN, only)).filter(Boolean);
  if(!s.length) return null;
  return {m: s.reduce((a, x)=> a + x.m, 0)/s.length, se: Math.sqrt(s.reduce((a, x)=> a + x.se*x.se, 0))/s.length};
}
const fmt = (s)=> s ? `${Math.round(s.m)} ±${f1(Math.round(s.se*10)/10)}` : '–';
W.compararVariantes = (vars)=>{
  const Ds = vars.map(([, k])=> load(k)), out = [];
  const head = (first)=> `| ${first} | ${vars.map(v=> v[0]).join(' | ')} |\n|---|${vars.map(()=> '---').join('|')}|`;
  for(const [title, iK, iN] of [['Llegar vivo al guardián (%)', 2, 0], ['Guardián ganado cuando se llega (%)', 4, 3], ['Niveles completados (%)', 1, 0]]){
    out.push(`\n#### ${title}\n`); out.push(head('Década'));
    for(let d = 0; d < 10; d++) out.push(`| ${d*10 + 1}-${d*10 + 10} | ${Ds.map(D=> fmt(decadeStat(D, d, iK, iN))).join(' | ')} |`);
  }
  out.push('\n#### Jefes de década (% de victorias)\n'); out.push(head('Jefe'));
  for(const lv of [10, 20, 30, 40, 50, 60, 70, 80, 90, 100]) out.push(`| ${lv} | ${Ds.map(D=> fmt(cellStat(D['jefe ' + lv], 1, 0))).join(' | ')} |`);
  for(const lv of [90, 100]) out.push(`| ${lv} con profesión | ${Ds.map(D=> fmt(cellStat(D['jefe ' + lv + ' prof'], 1, 0))).join(' | ')} |`);
  out.push('\n#### 81-100 con profesión, niveles completados (%)\n'); out.push(head('Nivel'));
  for(const lv of [83, 85, 87, 93, 95, 97]) out.push(`| ${lv} | ${Ds.map(D=> fmt(cellStat(D['nivel ' + lv + ' prof'], 1, 0))).join(' | ')} |`);
  // por senda
  vars.forEach(([name], i)=>{
    const D = Ds[i];
    out.push(`\n#### ${name}: niveles completados por senda y década (%; entre paréntesis, guardián ganado)\n`);
    out.push(`| Década | ${CLS.map(c=> NOMBRE[c]).join(' | ')} |\n|---|${CLS.map(()=> '---').join('|')}|`);
    for(let d = 0; d < 10; d++) out.push(`| ${d*10 + 1}-${d*10 + 10} | ${CLS.map(c=>{ const a = decadeStat(D, d, 1, 0, [c]), g = decadeStat(D, d, 4, 3, [c]); return a ? `${Math.round(a.m)} (${g ? Math.round(g.m) : '–'})` : '–'; }).join(' | ')} |`);
    out.push(`\n${name}: jefes de década por senda (% de victorias)\n`);
    out.push(`| Jefe | ${CLS.map(c=> NOMBRE[c]).join(' | ')} |\n|---|${CLS.map(()=> '---').join('|')}|`);
    for(const lv of [10, 20, 30, 40, 50, 60, 70, 80, 90, 100]) out.push(`| ${lv} | ${CLS.map(c=>{ const a = (D['jefe ' + lv] || {})[c]; return a && a[0] ? Math.round(a[1]/a[0]*100) : '–'; }).join(' | ')} |`);
  });
  return out.join('\n');
};
// Utilidad de aliados (de __simAliadosUtil guardado en localStorage[clave + '.util']): por aliado y década, en
// salas (combate + élite) y en "jefe" (guardianes y jefes de década).
W.compararAliados = (vars)=>{
  const out = [];
  vars.forEach(([name, k])=>{
    const U = load(k + '.util');
    out.push(`\n#### ${name}\n`);
    out.push('| Aliado | Década | Sala o jefe | Combates | Daño | Curación | Escudo | Control | Apoyo | Recibe | Muere | Ronda en que cae |\n|---|---|---|---|---|---|---|---|---|---|---|---|');
    Object.keys(U).sort().forEach(key=>{
      const [tpl, dec, node] = key.split('|'), u = U[key];
      out.push(`| ${tpl} | ${dec} | ${node} | ${u.combates} | ${u.dañoPorCombate} | ${u.curaPorCombate} | ${u.escudoPorCombate} | ${f1(u.controlPorCombate)} | ${f1(u.apoyoPorCombate)} | ${u.recibePorCombate} | ${u.muere} | ${f1(u.rondaMedia)} |`);
    });
  });
  return out.join('\n');
};
