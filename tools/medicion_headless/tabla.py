"""Tabla por década y senda de un lote (results/NOMBRE.json), con medias y objetivos.
python tabla.py NOMBRE [NOMBRE2 ...]     (los lotes posteriores pisan, senda a senda, a los anteriores)
Marca en negrita lo que se separa más de 15 puntos de la media de las seis sendas.
"""
import json, sys, os
os.chdir(os.path.dirname(os.path.abspath(__file__)))
sys.stdout.reconfigure(encoding='utf-8')
CLS = ['pesada', 'paladin', 'doblefilo', 'tirador', 'mago', 'hechicero']
NOM = ['Guerrero', 'Paladín', 'Asesino', 'Arquero', 'Mago', 'Hechicero']
OBJ_LLEGA = {2: 85, 3: 85, 4: 80, 5: 80, 6: 75, 7: 75}
OBJ_JEFE = {30: 80, 40: 75, 50: 70, 60: 50, 70: 40, 80: 30}
S = {}
for name in sys.argv[1:]:   # los lotes posteriores pisan, senda a senda, a los anteriores
    for k, v in json.load(open(f'results/{name}.json'))['summary'].items():
        c = S.setdefault(k, {'kind': v['kind'], 'lv': v['lv'], 'per': {}})
        c['per'].update(v['per'])
print('| Década | Medida | ' + ' | '.join(NOM) + ' | Media | Objetivo |'); print('|---|---|' + '---|' * 8)
fmt = lambda v, m: (f'**{v}**' if abs(v - m) > 15 else str(v)) if v is not None else '-'
for dec in range(2, 8):
    lv = [S.get(f'level {dec*10+u}') for u in (3, 5, 7)]
    lv = [x for x in lv if x]
    if lv:
        for label, idx, obj in (('Completado', 1, None), ('Llega', 2, OBJ_LLEGA[dec]), ('Guardián', 3, OBJ_JEFE[(dec+1)*10] + 5)):
            vals = []
            for st in CLS:
                xs = [x['per'][st][idx] for x in lv if st in x['per'] and x['per'][st][idx] is not None]
                vals.append(round(sum(xs) / len(xs)) if xs else None)
            ok = [v for v in vals if v is not None]; m = sum(ok) / len(ok)
            print(f"| {dec*10+1}-{dec*10+9} | {label} | " + ' | '.join(fmt(v, m) for v in vals) + f" | {round(m)} | {obj if obj else ''} |")
    b = S.get(f'boss {(dec+1)*10}')
    if b:
        vals = [b['per'][st][1] if st in b['per'] else None for st in CLS]; ok = [v for v in vals if v is not None]; m = sum(ok) / len(ok)
        print(f"| {(dec+1)*10} | Jefe | " + ' | '.join(fmt(v, m) for v in vals) + f" | {round(m)} | {OBJ_JEFE[(dec+1)*10]} |")
