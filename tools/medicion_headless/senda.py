import json, os
os.chdir(os.path.dirname(os.path.abspath(__file__)))
CLS = ['pesada', 'paladin', 'doblefilo', 'tirador', 'mago', 'hechicero']
NOM = ['Guerrero', 'Paladín', 'Asesino', 'Arquero', 'Mago', 'Hechicero']
S = json.load(open('results/fin2.json'))['summary']
S3 = json.load(open('results/fin3.json'))['summary']
S.update({k: v for k, v in S3.items() if k.startswith('boss')})
print('| Década | Medida | ' + ' | '.join(NOM) + ' | Media |'); print('|---|---|' + '---|' * 7)
flags = []
for dec in range(2, 8):
    lv = [S[f'level {dec*10+u}'] for u in (3, 5, 7)]
    for label, idx in (('Completado', 1), ('Llega', 2), ('Guardián', 3)):
        vals = []
        for st in CLS:
            xs = [x['per'][st][idx] for x in lv if x['per'][st][idx] is not None]
            vals.append(round(sum(xs) / len(xs)))
        m = sum(vals) / 6
        print(f"| {dec*10+1}-{dec*10+9} | {label} | " + ' | '.join((f'**{v}**' if abs(v - m) > 15 else str(v)) for v in vals) + f" | {round(m)} |")
        for st, v in zip(NOM, vals):
            if abs(v - m) > 15: flags.append((dec, label, st, v, round(m)))
    b = S[f'boss {(dec+1)*10}']; vals = [b['per'][st][1] for st in CLS]; m = sum(vals) / 6
    print(f"| {(dec+1)*10} | Jefe | " + ' | '.join((f'**{v}**' if abs(v - m) > 15 else str(v)) for v in vals) + f" | {round(m)} |")
    for st, v in zip(NOM, vals):
        if abs(v - m) > 15: flags.append((dec, 'Jefe', st, v, round(m)))
print()
for f in flags: print(f)
