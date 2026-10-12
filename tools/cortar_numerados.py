"""Corta las láminas de piezas numeradas (5 piezas en fila sobre fondo oscuro) en imágenes cuadradas.
Uso: python tools/cortar_numerados.py   → Assets/Numerados/arte/NNN.jpg (256 px) + _revision.jpg
Las láminas van en Assets/Numerados/laminas/NN_tema.png, en el orden de numerados-propuesta.md."""
import glob, os
import numpy as np
from PIL import Image, ImageDraw
SRC, DST, N, SIZE = 'Assets/Numerados/laminas', 'Assets/Numerados/arte', 5, 256
# piezas donde la vecina queda muy cerca: se exige un hueco menor para separarlas
HUECO = {1: 5, 22: 5, 57: 5, 42: 6, 69: 6}
os.makedirs(DST, exist_ok=True)
hoja = []
for k, f in enumerate(sorted(glob.glob(SRC + '/*.png'))):
    im = Image.open(f).convert('RGB'); a = np.asarray(im).astype(int)
    bg = np.median(np.concatenate([a[:16].reshape(-1,3), a[-16:].reshape(-1,3)]), axis=0)
    mask = np.abs(a - bg).sum(axis=2) > 60
    # se corta por el valle más vacío cerca de cada quinto (las piezas van repartidas a lo ancho)
    col = np.convolve(mask.sum(axis=0).astype(float), np.ones(11)/11, mode='same'); w = im.width / N; cortes = [0]
    for j in range(1, N):
        a0, a1 = int(j*w - w*0.25), int(j*w + w*0.25)
        cortes.append(a0 + int(np.argmin(col[a0:a1])))
    cortes.append(im.width)
    for j in range(N):
        sub = mask[:, cortes[j]:cortes[j+1]]
        xs = np.where(sub.sum(axis=0) > 6)[0]
        if len(xs):
            # tramos de columnas ocupadas; se queda el de más masa y sus vecinos pegados (<16 px):
            # así no entra el borde de la pieza de al lado
            runs, ini, prev = [], xs[0], xs[0]
            for x in xs[1:]:
                if x - prev > 1: runs.append([ini, prev]); ini = x
                prev = x
            runs.append([ini, prev])
            masa = [sub[:, r[0]:r[1]+1].sum() for r in runs]; c = int(np.argmax(masa)); lo = hi = c
            g = HUECO.get(k*N + j + 1, 16)
            while lo > 0 and runs[lo][0] - runs[lo-1][1] < g: lo -= 1
            while hi < len(runs)-1 and runs[hi+1][0] - runs[hi][1] < g: hi += 1
            xs = np.arange(runs[lo][0], runs[hi][1] + 1); sub = sub[:, xs[0]:xs[-1]+1]; cortes_x = cortes[j] + xs[0]
        else: cortes_x = cortes[j]
        ys = np.where(sub.sum(axis=1) > 6)[0]
        if not len(xs) or not len(ys): xs = np.arange(sub.shape[1]); ys = np.arange(sub.shape[0])
        x0, x1 = max(cortes[j], cortes_x - 6), min(cortes[j+1], cortes_x + sub.shape[1] + 6)
        y0, y1 = max(0, ys[0]-6), min(im.height, ys[-1]+7)
        rec = im.crop((x0, y0, x1, y1))               # solo el rectángulo de la pieza: nunca entra la vecina
        lado = int(max(rec.size) * 1.12)
        lienzo = Image.new('RGB', (lado, lado), tuple(int(v) for v in bg))
        lienzo.paste(rec, ((lado - rec.width)//2, (lado - rec.height)//2))
        num = k*N + j + 1
        out = lienzo.resize((SIZE, SIZE), Image.LANCZOS); out.save(f'{DST}/{num:03d}.jpg', quality=90)
        hoja.append((num, out))
rev = Image.new('RGB', (10*128, 10*128), (10, 10, 10)); d = ImageDraw.Draw(rev)
for num, im in hoja:
    x, y = ((num-1) % 10)*128, ((num-1)//10)*128
    rev.paste(im.resize((128, 128)), (x, y)); d.text((x+3, y+2), f'{num:03d}', fill=(255, 215, 106))
rev.save(DST + '/_revision.jpg', quality=85)
print(len(hoja), 'piezas')
