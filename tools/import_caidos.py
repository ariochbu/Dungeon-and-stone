"""Importa ilustraciones limpias de Caídos del Laberinto (sin marco ni texto).
Uso: python tools/import_caidos.py "Assets/Caidos del laberinto/arte"   (desde la raíz del repo)
Cada archivo debe empezar con el número del Caído: 86.jpg, 086.png, "86 - balor.webp"...
Recorta al centro a 2:3, reduce a 512x768 y guarda src/assets/mascotas/arte/mascota_NNN.jpg.
Al final imprime los ids importados: hay que sumarlos a PET_CLEAN_ART en src/game.js."""
from PIL import Image
import glob, os, re, sys

folder = sys.argv[1]
os.makedirs('src/assets/mascotas/arte', exist_ok=True)
done, skipped = [], []
for f in sorted(glob.glob(os.path.join(folder, '*.*'))):
    m = re.match(r'0*(\d{1,3})(?!\d)', os.path.basename(f))
    if not m or not 1 <= int(m.group(1)) <= 100:
        skipped.append(os.path.basename(f)); continue
    n = int(m.group(1))
    im = Image.open(f).convert('RGB')
    w, h = im.size
    if w/h > 2/3:
        nw = round(h*2/3); im = im.crop(((w-nw)//2, 0, (w-nw)//2+nw, h))
    else:
        nh = round(w*3/2); top = (h-nh)//3; im = im.crop((0, top, w, top+nh))
    im.resize((512, 768), Image.LANCZOS).save(f'src/assets/mascotas/arte/mascota_{n:03d}.jpg', quality=86, optimize=True, progressive=True)
    done.append(n)
print(len(done), 'importados:', sorted(done))
if skipped: print('sin número al inicio (omitidos):', skipped)
