"""Importa ilustraciones limpias de armas (una por arma, compartida por todos los rangos; el SS queda fuera).
Uso: python tools/import_armas.py "Assets/Armas/arte"   (desde la raíz del repo)
Nombres: <slug>.jpg (cualquier extensión de imagen), p.ej. arco_corto.jpg. Los slugs válidos son los de WEAPON_NAME_SLUG en src/game.js.
Recorta al centro en cuadrado, reduce a 256x256 y guarda src/assets/armas/arte/<nombre>.jpg.
Al final imprime la lista para pegar en WEAPON_CLEAN_ART."""
from PIL import Image
import glob, os, re, sys

src = open('src/game.js', encoding='utf-8').read()
block = src[src.index('const WEAPON_NAME_SLUG'):]
block = block[:block.index('};')]
SLUGS = set(re.findall(r"':'([a-z_]+)'", block))

folder = sys.argv[1]
os.makedirs('src/assets/armas/arte', exist_ok=True)
base, skipped = [], []
for f in sorted(glob.glob(os.path.join(folder, '*.*'))):
    name = os.path.splitext(os.path.basename(f))[0].strip().lower().replace(' ', '_').replace('-', '_')
    slug = name
    if slug not in SLUGS:
        skipped.append(os.path.basename(f)); continue
    im = Image.open(f).convert('RGB')
    w, h = im.size; m = min(w, h)
    im = im.crop(((w-m)//2, (h-m)//2, (w-m)//2+m, (h-m)//2+m)).resize((256, 256), Image.LANCZOS)
    im.save(f'src/assets/armas/arte/{slug}.jpg', quality=88, optimize=True)
    base.append(slug)
print(len(base), 'importadas')
print('WEAPON_CLEAN_ART:', sorted(base))
missing = sorted(SLUGS - set(base))
if missing: print('faltan (base):', missing)
if skipped: print('nombre no reconocido (omitidos):', skipped)
