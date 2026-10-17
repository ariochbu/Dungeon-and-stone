"""Servidor local de medición: sirve el juego (raíz dada) y reparte tareas a pestañas Chrome headless.
Solo local (127.0.0.1), sin sesión, nunca toca Supabase más allá de cargar la página. Usado para
tools/mediciones/calibracion-21-80-2026-10-17.md. Pasos (desde esta carpeta):
  python server.py <raíz del repo> 5301                    # en otra consola
  curl -X POST 127.0.0.1:5301/__learnload --data-binary @../mediciones/aprendizaje-calibracion-2026-10-17.json
  curl -X POST 127.0.0.1:5301/__config -d "{\"learnReady\":true}"
     (o, para entrenar una tabla nueva: __learnload con {} y __config {"learnReady":false}; cada pestaña juega
      3 rondas de calentamiento, envía su tabla y el servidor las suma; luego __config {"learnReady":true})
  python ctl.py 5301 workers 24                             # lanza 24 Chrome headless (worker.js)
  python cal.py 5301 run NOMBRE "{\"cells\":[[\"level\",25],[\"boss\",30]],\"n\":408,\"nb\":600}"
  python dec.py NOMBRE                                      # medias por década
  python ctl.py 5301 snap                                   # foto __snapshot en snap_5301.json
  python ctl.py 5301 kill
Uso: python server.py ROOT PORT
"""
import sys, os, json, time, threading, uuid
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from urllib.parse import urlparse, parse_qs

ROOT = os.path.abspath(sys.argv[1]); PORT = int(sys.argv[2])
HERE = os.path.dirname(os.path.abspath(__file__))
LOCK = threading.Lock()
QUEUE = []          # tareas pendientes
RUNNING = {}        # id -> (task, t0, worker)
DONE = {}           # batch -> list of results
BATCH_TOTAL = {}
LOGS = []
WORKERS = {}
LEARN = {}
LEARN_POSTS = []
CONFIG = {'warm': 3, 'tag': 'cal'}
TIMEOUT = 1500

class H(SimpleHTTPRequestHandler):
    extensions_map = dict(SimpleHTTPRequestHandler.extensions_map, **{'.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css'})
    def __init__(self, *a, **k): super().__init__(*a, directory=ROOT, **k)
    def log_message(self, *a): pass
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store'); super().end_headers()
    def _json(self, obj, code=200):
        b = json.dumps(obj).encode()
        self.send_response(code); self.send_header('Content-Type', 'application/json'); self.send_header('Content-Length', str(len(b))); self.end_headers(); self.wfile.write(b)
    def _body(self):
        n = int(self.headers.get('Content-Length') or 0)
        return json.loads(self.rfile.read(n) or b'{}')
    def do_GET(self):
        u = urlparse(self.path); q = parse_qs(u.query)
        if u.path == '/__runner.html':
            html = open(os.path.join(ROOT, 'index.html'), encoding='utf-8').read()
            html = html.replace('</body>', '<script type="module" src="/__worker.js"></script></body>')
            b = html.encode('utf-8'); self.send_response(200); self.send_header('Content-Type', 'text/html; charset=utf-8'); self.send_header('Content-Length', str(len(b))); self.end_headers(); self.wfile.write(b); return
        if u.path == '/__worker.js':
            b = open(os.path.join(HERE, 'worker.js'), 'rb').read()
            self.send_response(200); self.send_header('Content-Type', 'text/javascript'); self.send_header('Content-Length', str(len(b))); self.end_headers(); self.wfile.write(b); return
        if u.path == '/__learn.json':
            with LOCK: return self._json(LEARN)
        if u.path == '/__learnstat':
            with LOCK: return self._json({'posts': LEARN_POSTS, 'keys': len(LEARN)})
        if u.path == '/__init':
            return self._json(CONFIG)
        if u.path == '/__next':
            w = q.get('w', ['?'])[0]
            with LOCK:
                WORKERS[w] = time.time()
                now = time.time()
                for tid, (t, t0, ww) in list(RUNNING.items()):
                    if now - t0 > TIMEOUT: QUEUE.insert(0, t); del RUNNING[tid]
                if not QUEUE: return self._json({})
                t = QUEUE.pop(0); RUNNING[t['id']] = (t, now, w)
            return self._json(t)
        if u.path == '/__status':
            with LOCK:
                out = {}
                for b, tot in BATCH_TOTAL.items():
                    out[b] = {'total': tot, 'done': len(DONE.get(b, [])), 'queued': sum(1 for t in QUEUE if t['batch'] == b), 'running': sum(1 for (t, _, _) in RUNNING.values() if t['batch'] == b)}
                return self._json({'batches': out, 'workers': {k: round(time.time() - v) for k, v in WORKERS.items()}, 'logs': LOGS[-20:]})
        if u.path == '/__results':
            b = q.get('batch', [''])[0]
            with LOCK: return self._json(DONE.get(b, []))
        return super().do_GET()
    def do_POST(self):
        u = urlparse(self.path); d = self._body()
        if u.path == '/__result':
            with LOCK:
                if d['id'] in RUNNING:
                    del RUNNING[d['id']]
                    DONE.setdefault(d['batch'], []).append(d)
            return self._json({'ok': 1})
        if u.path == '/__submit':
            with LOCK:
                b = d['batch']; tasks = d['tasks']
                for t in tasks: t['id'] = uuid.uuid4().hex; t['batch'] = b
                if d.get('front'): QUEUE[0:0] = tasks
                else: QUEUE.extend(tasks)
                BATCH_TOTAL[b] = BATCH_TOTAL.get(b, 0) + len(tasks)
            return self._json({'ok': len(tasks)})
        if u.path == '/__snap':
            json.dump(d, open(os.path.join(HERE, f'snap_{PORT}.json'), 'w'))
            return self._json({'ok': 1})
        if u.path == '/__learnpost':
            with LOCK:
                for k, arms in d['table'].items():
                    row = LEARN.setdefault(k, {})
                    for a, (n, sm) in arms.items():
                        c = row.setdefault(a, [0, 0]); c[0] += n; c[1] += sm
                LEARN_POSTS.append(d.get('w'))
            return self._json({'ok': 1})
        if u.path == '/__learnload':
            with LOCK: LEARN.clear(); LEARN.update(d)
            return self._json({'ok': len(LEARN)})
        if u.path == '/__config':
            with LOCK: CONFIG.update(d)
            return self._json(CONFIG)
        if u.path == '/__log':
            with LOCK: LOGS.append(d.get('msg')); del LOGS[:-500]
            return self._json({'ok': 1})
        if u.path == '/__clear':
            with LOCK: QUEUE.clear()
            return self._json({'ok': 1})
        self._json({'err': 'no'}, 404)

ThreadingHTTPServer(('127.0.0.1', PORT), H).serve_forever()
