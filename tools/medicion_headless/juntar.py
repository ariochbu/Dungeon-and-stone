"""Junta varios lotes (results/*.json) sumando sus recorridos y combates, y guarda el resumen en results/SALIDA.json.
python juntar.py SALIDA LOTE1 LOTE2 [...]
Sirve para medir dos veces el mismo código y dar una tabla con el doble de muestra (las vueltas sueltas se separan
más de lo que dice su error estándar: la IA que aprende sigue aprendiendo en cada pestaña)."""
import json, sys, os, math
os.chdir(os.path.dirname(os.path.abspath(__file__)))
out, names = sys.argv[1], sys.argv[2:]
raw = []
for n in names: raw += json.load(open(f'results/{n}.json'))['raw']
cells = {}
for r in raw:
    c = cells.setdefault(r['cell'], {'kind': r['kind'], 'lv': r['lv'], 'st': {}})
    a = c['st'].setdefault(r['style'], [0, 0, 0, 0, 0])
    for i in range(5): a[i] += r['res'][i]
summ = {}
for name, c in cells.items():
    def stat(iK, iN):
        rows = [(a[iK] / a[iN], a[iN]) for a in c['st'].values() if a[iN]]
        if not rows: return None
        m = sum(p for p, _ in rows) / len(rows)
        se = math.sqrt(sum(p * (1 - p) / n for p, n in rows)) / len(rows)
        return [round(m * 100, 1), round(se * 100, 1)]
    per = {st: [a[0], round(a[1] / a[0] * 100) if a[0] else None, round(a[2] / a[0] * 100) if a[0] else None, round(a[4] / a[3] * 100) if a[3] else None] for st, a in c['st'].items()}
    summ[name] = {'kind': c['kind'], 'lv': c['lv'], 'n': sum(a[0] for a in c['st'].values()), 'win': stat(1, 0), 'llega': stat(2, 0) if c['kind'] == 'level' else None, 'guard': stat(4, 3) if c['kind'] == 'level' else None, 'per': per}
json.dump({'spec': {'juntado': names}, 'summary': summ, 'raw': raw}, open(f'results/{out}.json', 'w'))
print('ok', out, len(raw), 'tareas')
