"""Depuración: ejecuta código JS en una pestaña trabajadora y muestra lo que devuelve.
python dbg.py PORT archivo.js      (el código es el cuerpo de una función async; recibe W = window y cfgOf)
"""
import sys, json, time, uuid, urllib.request
sys.stdout.reconfigure(encoding="utf-8", errors="replace")
PORT = int(sys.argv[1]); code = open(sys.argv[2], encoding='utf-8').read()
BASE = f'http://127.0.0.1:{PORT}'
def get(p): return json.loads(urllib.request.urlopen(BASE + p, timeout=60).read())
def post(p, d): return json.loads(urllib.request.urlopen(urllib.request.Request(BASE + p, data=json.dumps(d).encode(), method='POST'), timeout=60).read())
b = 'dbg_' + uuid.uuid4().hex[:8]
post('/__submit', {'batch': b, 'front': True, 'tasks': [{'kind': 'js', 'lv': 0, 'code': code}]})
while True:
    r = get('/__results?batch=' + b)
    if r: break
    time.sleep(1)
o = r[0]['out']
print(o if isinstance(o, str) else json.dumps(o, ensure_ascii=False, indent=1))
