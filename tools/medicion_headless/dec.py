import json, sys, math, os
os.chdir(os.path.dirname(os.path.abspath(__file__)))
d = json.load(open(f'results/{sys.argv[1]}.json'))['summary']
for dec in range(0, 9):
    lv = [d[f'level {dec*10+u}'] for u in (3, 5, 7) if f'level {dec*10+u}' in d]
    b = d.get(f'boss {(dec+1)*10}')
    if not lv and not b: continue
    m = lambda k: (round(sum(x[k][0] for x in lv)/len(lv), 1), round(math.sqrt(sum(x[k][1]**2 for x in lv))/len(lv), 1)) if lv else None
    print(dec, 'llega', m('llega'), 'guard', m('guard'), 'compl', m('win'), 'jefe', b['win'] if b else None)
