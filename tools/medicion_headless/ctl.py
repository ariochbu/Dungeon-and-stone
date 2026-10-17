"""Control de la medición.
python ctl.py PORT status
python ctl.py PORT workers N [start_index]   -> lanza N Chrome headless
python ctl.py PORT kill                       -> mata los Chrome de este puerto
"""
import sys, json, subprocess, os, urllib.request, time
PORT = int(sys.argv[1]); CMD = sys.argv[2]
BASE = f'http://127.0.0.1:{PORT}'
CHROME = r'C:\Program Files\Google\Chrome\Application\chrome.exe'
TMP = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'profiles')
def get(p): return json.loads(urllib.request.urlopen(BASE + p, timeout=30).read())
def post(p, d): return json.loads(urllib.request.urlopen(urllib.request.Request(BASE + p, data=json.dumps(d).encode(), method='POST'), timeout=60).read())
if CMD == 'status':
    print(json.dumps(get('/__status'), indent=1, ensure_ascii=False))
elif CMD == 'workers':
    n = int(sys.argv[3]); s0 = int(sys.argv[4]) if len(sys.argv) > 4 else 0
    for i in range(s0, s0 + n):
        prof = os.path.join(TMP, f'p{PORT}_{i}')
        os.makedirs(prof, exist_ok=True)
        subprocess.Popen([CHROME, '--headless=new', f'--user-data-dir={prof}', '--disable-gpu', '--disable-gpu-compositing', '--disable-software-rasterizer', '--no-first-run', '--no-default-browser-check',
                          '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows',
                          '--mute-audio', '--remote-debugging-port=0', f'{BASE}/__runner.html?w=w{PORT}_{i}'],
                         stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        time.sleep(1.5)
    print('lanzados', n)
elif CMD == 'snap':
    prof = os.path.join(TMP, f'p{PORT}_snap')
    os.makedirs(prof, exist_ok=True)
    subprocess.Popen([CHROME, '--headless=new', f'--user-data-dir={prof}', '--disable-gpu', '--disable-gpu-compositing', '--disable-software-rasterizer', '--no-first-run',
                      '--disable-background-timer-throttling', '--remote-debugging-port=0', f'{BASE}/__runner.html?snap=1&w=snap' + ('&old=1' if len(sys.argv) > 3 else '')], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    print('snap lanzado')
elif CMD == 'kill':
    out = subprocess.run(['powershell', '-NoProfile', '-Command',
        f"Get-CimInstance Win32_Process -Filter \"Name='chrome.exe'\" | Where-Object {{ $_.CommandLine -like '*p{PORT}_*' }} | ForEach-Object {{ Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }}"], capture_output=True, text=True)
    print('ok', out.stderr[:300])
