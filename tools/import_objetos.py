"""Importa ilustraciones limpias de piedras de alma (una por rango) y de pociones.
Uso: python tools/import_objetos.py "Assets/Objetos/arte"   (desde la raíz del repo)
Nombres (cualquier extensión de imagen):
  piedras:  piedra_F, piedra_E, piedra_D, piedra_C, piedra_B, piedra_A, piedra_S, piedra_SS
  pociones: vida_menor, vida_mayor, estamina, espiritu, antidoto
Recorta al centro en cuadrado, reduce a 256x256 y guarda en src/assets/piedras/arte/<RANGO>.jpg
o src/assets/pociones/arte/<id>.jpg. Imprime las listas para SOUL_STONE_CLEAN_ART / POTION_CLEAN_ART."""
from PIL import Image
import glob, os, sys

TIERS = ['F','E','D','C','B','A','S','SS']
POTIONS = ['vida_menor','vida_mayor','estamina','espiritu','antidoto']

folder = sys.argv[1]
os.makedirs('src/assets/piedras/arte', exist_ok=True)
os.makedirs('src/assets/pociones/arte', exist_ok=True)
stones, potions, skipped = [], [], []
for f in sorted(glob.glob(os.path.join(folder, '*.*'))):
    name = os.path.splitext(os.path.basename(f))[0].strip().lower().replace(' ', '_').replace('-', '_')
    tier = name[7:].upper() if name.startswith('piedra_') else None
    if tier in TIERS: dest, bucket, key = f'src/assets/piedras/arte/{tier}.jpg', stones, tier
    elif name in POTIONS: dest, bucket, key = f'src/assets/pociones/arte/{name}.jpg', potions, name
    else:
        skipped.append(os.path.basename(f)); continue
    im = Image.open(f).convert('RGB')
    w, h = im.size; m = min(w, h)
    im.crop(((w-m)//2, (h-m)//2, (w-m)//2+m, (h-m)//2+m)).resize((256, 256), Image.LANCZOS).save(dest, quality=88, optimize=True)
    bucket.append(key)
print('SOUL_STONE_CLEAN_ART:', [t for t in TIERS if t in stones])
print('POTION_CLEAN_ART:', [x for x in POTIONS if x in potions])
if skipped: print('nombre no reconocido (omitidos):', skipped)
