"""Importa ilustraciones limpias de piezas de conjunto (una por pieza, compartida por todos los rangos).
Uso: python tools/import_equipo.py "Assets/Equipo/arte"   (desde la raíz del repo)
Nombres: <conjunto>_<pieza>.jpg (cualquier extensión de imagen), p.ej. jack_casco.jpg.
Conjuntos: jack artemisa soberano bastion eclipse gracia guardian voluntad. Piezas: casco armadura guantes botas amuleto.
Recorta al centro en cuadrado, reduce a 256x256 y guarda src/assets/equipo/arte/<nombre>.jpg.
Al final imprime la lista para pegar en GEAR_CLEAN_ART (src/game.js)."""
from PIL import Image
import glob, os, sys

SETS = ['jack','artemisa','soberano','bastion','eclipse','gracia','guardian','voluntad']
SLOTS = ['casco','armadura','guantes','botas','amuleto']
VALID = {f'{a}_{b}' for a in SETS for b in SLOTS}

folder = sys.argv[1]
os.makedirs('src/assets/equipo/arte', exist_ok=True)
done, skipped = [], []
for f in sorted(glob.glob(os.path.join(folder, '*.*'))):
    name = os.path.splitext(os.path.basename(f))[0].strip().lower().replace(' ', '_').replace('-', '_')
    if name not in VALID:
        skipped.append(os.path.basename(f)); continue
    im = Image.open(f).convert('RGB')
    w, h = im.size; m = min(w, h)
    im = im.crop(((w-m)//2, (h-m)//2, (w-m)//2+m, (h-m)//2+m)).resize((256, 256), Image.LANCZOS)
    im.save(f'src/assets/equipo/arte/{name}.jpg', quality=88, optimize=True)
    done.append(name)
print(len(done), 'importadas')
print('GEAR_CLEAN_ART:', sorted(done))
missing = sorted(VALID - set(done))
if missing: print('faltan:', missing)
if skipped: print('nombre no reconocido (omitidos):', skipped)
