"""Lanzar lotes y resumir.
python cal.py PORT run NAME SPEC_JSON     -> envía y espera; imprime resumen y lo guarda en results/NAME.json
SPEC: {"cells":[["level",25],["boss",30]], "n":204, "nb":300, "chunk":17, "chunkb":25, "tune":{...}, "prof":false,
       "styles":["tirador","mago"] (solo esas sendas; n sigue siendo por 6), "kit":{...} (valores de KIT_RETAGUARDIA), "nerf":{...} (valores de NERF_TANQUES)}
python cal.py PORT show NAME
"""
import sys, json, time, math, os, urllib.request
PORT = int(sys.argv[1]); CMD = sys.argv[2]
BASE = f'http://127.0.0.1:{PORT}'
HERE = os.path.dirname(os.path.abspath(__file__)); RES = os.path.join(HERE, 'results'); os.makedirs(RES, exist_ok=True)
CLS = ['pesada', 'paladin', 'doblefilo', 'tirador', 'mago', 'hechicero']
NOM = {'pesada':'Gue', 'paladin':'Pal', 'doblefilo':'Ase', 'tirador':'Arq', 'mago':'Mag', 'hechicero':'Hec'}
def get(p):
    for k in range(60):
        try: return json.loads(urllib.request.urlopen(BASE + p, timeout=60).read())
        except Exception:
            time.sleep(2)
    raise RuntimeError('servidor no responde')
def post(p, d): return json.loads(urllib.request.urlopen(urllib.request.Request(BASE + p, data=json.dumps(d).encode(), method='POST'), timeout=60).read())

def build(spec, batch):
    tasks = []
    for kind, lv in spec['cells']:
        n = spec.get('n', 204) if kind == 'level' else spec.get('nb', 300)
        ch = spec.get('chunk', 17) if kind == 'level' else spec.get('chunkb', 25)
        per = math.ceil(n / len(CLS))
        for st in spec.get('styles') or CLS:
            left = per
            while left > 0:
                k = min(ch, left); left -= k
                tasks.append({'kind': kind, 'lv': lv, 'style': st, 'n': k, 'cell': f'{kind} {lv}', 'tune': spec.get('tune'), 'ref': (spec.get('refs') or {}).get(str(lv)), 'kit': spec.get('kit'), 'nerf': spec.get('nerf')})
    # intercalar para que las celdas avancen a la vez (las de nivel alto tardan más: primero)
    tasks.sort(key=lambda t: (-t['lv'] if t['kind'] == 'level' else 0))
    return tasks

def summarize(results):
    cells = {}
    for r in results:
        c = cells.setdefault(r['cell'], {'kind': r['kind'], 'lv': r['lv'], 'st': {}})
        a = c['st'].setdefault(r['style'], [0, 0, 0, 0, 0])
        for i in range(5): a[i] += r['res'][i]
    out = {}
    for name, c in cells.items():
        def stat(iK, iN):
            rows = [(a[iK] / a[iN], a[iN]) for a in c['st'].values() if a[iN]]
            if not rows: return None
            m = sum(p for p, _ in rows) / len(rows)
            se = math.sqrt(sum(p * (1 - p) / n for p, n in rows)) / len(rows)
            return [round(m * 100, 1), round(se * 100, 1)]
        per = {st: [a[0], round(a[1] / a[0] * 100) if a[0] else None, round(a[2] / a[0] * 100) if a[0] else None, round(a[4] / a[3] * 100) if a[3] else None] for st, a in c['st'].items()}
        out[name] = {'kind': c['kind'], 'lv': c['lv'], 'n': sum(a[0] for a in c['st'].values()), 'win': stat(1, 0), 'llega': stat(2, 0) if c['kind'] == 'level' else None, 'guard': stat(4, 3) if c['kind'] == 'level' else None, 'per': per}
    return out

def show(summ):
    lines = []
    for name in sorted(summ, key=lambda k: (summ[k]['kind'], summ[k]['lv'])):
        s = summ[name]
        per = ' '.join(f"{NOM[st]}:{s['per'][st][1]}" + (f"/{s['per'][st][2]}/{s['per'][st][3]}" if s['kind'] == 'level' else '') for st in CLS if st in s['per'])
        if s['kind'] == 'level':
            lines.append(f"{name:10s} n={s['n']:4d} completa {s['win'][0]:5.1f}±{s['win'][1]:.1f}  llega {s['llega'][0]:5.1f}±{s['llega'][1]:.1f}  guardián {s['guard'][0] if s['guard'] else '-'}±{s['guard'][1] if s['guard'] else '-'} | {per}")
        else:
            lines.append(f"{name:10s} n={s['n']:4d} gana {s['win'][0]:5.1f}±{s['win'][1]:.1f} | {per}")
    return '\n'.join(lines)

if CMD == 'run':
    name = sys.argv[3]; spec = json.loads(sys.argv[4]) if not sys.argv[4].startswith('@') else json.load(open(sys.argv[4][1:]))
    tasks = build(spec, name)
    post('/__submit', {'batch': name, 'tasks': tasks})
    t0 = time.time()
    while True:
        st = get('/__status')['batches'].get(name)
        if st and st['done'] >= st['total']: break
        time.sleep(5)
    res = get('/__results?batch=' + name)
    summ = summarize(res)
    json.dump({'spec': spec, 'summary': summ, 'raw': res, 'secs': round(time.time() - t0)}, open(os.path.join(RES, name + '.json'), 'w'))
    print(f'[{name}] {round(time.time() - t0)} s')
    print(show(summ))
elif CMD == 'wait':
    name = sys.argv[3]; t0 = time.time()
    while True:
        st = get('/__status')['batches'].get(name)
        if st and st['done'] >= st['total']: break
        time.sleep(5)
    res = get('/__results?batch=' + name); summ = summarize(res)
    json.dump({'spec': {}, 'summary': summ, 'raw': res}, open(os.path.join(RES, name + '.json'), 'w'))
    print(show(summ))
elif CMD == 'show':
    d = json.load(open(os.path.join(RES, sys.argv[3] + '.json')))
    print(show(d['summary']))
