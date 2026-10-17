"""Distancia a la media de las seis sendas, antes → después, por década (completado y guardián) y por jefe.
python distancia.py ANTES DESPUES      (lotes de results/; en negrita lo que queda a más de 15 puntos)"""
import json, sys, os
os.chdir(os.path.dirname(os.path.abspath(__file__)))
sys.stdout.reconfigure(encoding='utf-8')
CLS = ['pesada', 'paladin', 'doblefilo', 'tirador', 'mago', 'hechicero']
NOM = ['Guerrero', 'Paladín', 'Asesino', 'Arquero', 'Mago', 'Hechicero']
A = json.load(open(f'results/{sys.argv[1]}.json'))['summary']
D = json.load(open(f'results/{sys.argv[2]}.json'))['summary']
def dec_vals(S, dec, idx):
    lv = [S.get(f'level {dec*10+u}') for u in (3, 5, 7)]; lv = [x for x in lv if x]
    if not lv: return None
    return [sum(x['per'][st][idx] for x in lv) / len(lv) for st in CLS]
def dist(vals):
    m = sum(vals) / len(vals); return [v - m for v in vals], m
b = lambda x: f'**{x:+.0f}**' if abs(x) > 15 else f'{x:+.0f}'
print('| Década | Medida | ' + ' | '.join(NOM) + ' | Media (antes → después) |'); print('|---|---|' + '---|' * 7)
for dec in range(2, 8):
    for label, idx in (('Completado', 1), ('Guardián', 3)):
        va, vd = dec_vals(A, dec, idx), dec_vals(D, dec, idx)
        if not va or not vd: continue
        da, ma = dist(va); dd, md = dist(vd)
        print(f'| {dec*10+1}-{dec*10+9} | {label} | ' + ' | '.join(f'{b(x)} → {b(y)}' for x, y in zip(da, dd)) + f' | {ma:.0f} → {md:.0f} |')
    ba, bd = A.get(f'boss {(dec+1)*10}'), D.get(f'boss {(dec+1)*10}')
    if ba and bd:
        da, ma = dist([ba['per'][st][1] for st in CLS]); dd, md = dist([bd['per'][st][1] for st in CLS])
        print(f'| {(dec+1)*10} | Jefe | ' + ' | '.join(f'{b(x)} → {b(y)}' for x, y in zip(da, dd)) + f' | {ma:.0f} → {md:.0f} |')
