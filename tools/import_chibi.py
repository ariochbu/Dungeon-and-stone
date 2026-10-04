"""Importa las láminas chibi de los jugadores (Assets/Jugador/<raza> chibi/*.jfif)
a tiras listas para prototype-2d/spriteAnim.js.

Las láminas llegan sin nombre, en JPG, con el "fondo transparente" pintado como
cuadritos grises y con los cuadros en posiciones no del todo parejas. Este script:
  1. borra el fondo de cuadritos (o blanco);
  2. detecta las 4 filas (reposo, ataque, golpe, muerte) y cada cuadro dentro de ellas;
  3. reduce todo con un mismo factor (reposo = BODY_H px de alto) y arma una
     tira de celdas iguales, con los pies apoyados abajo;
  4. escribe prototype-2d/assets/sprites/chibi/<senda>_<raza>.png y un
     index.json con el tamaño de celda y los cuadros por fila de cada tira.

Qué senda es cada archivo se indica en SENDA_POR_ARCHIVO (se identificó a ojo).

Uso, desde la raíz del repo:
  python tools/import_chibi.py            importa todo lo mapeado
  python tools/import_chibi.py --scan DIR  hojas de contacto para identificar archivos
"""
import glob
import json
import os
import sys

import numpy as np
from PIL import Image, ImageDraw

SRC = 'Assets/Jugador'
OUT = 'prototype-2d/assets/sprites/chibi'
BODY_H = 64  # alto del personaje en reposo, en píxeles de la tira final
RAZAS = {'barbaro': 'barbaro', 'enano': 'enano', 'hada': 'hada', 'humano': 'humano',
         'dragonico': 'draconido', 'hombre bestia': 'bestia'}

# id corto del archivo (lo que va entre "Image_" y ".jfif", primeros 6) -> senda
SENDA_POR_ARCHIVO = {
    # bárbaro
    '5v2h31': 'tirador', 'pg93z7': 'doblefilo', '6w1860': 'pesada', '4kuwti': 'hechicero', '4qktnh': 'mago', '7mn3y3': 'paladin',
    # enano
    'cvyli1': 'tirador', '3asiav': 'doblefilo', 'idolla': 'pesada', '85xmyk': 'hechicero', '4rycqh': 'mago', 'givjb8': 'paladin',
    # hada
    'od8aq1': 'tirador', '3ai9fe': 'doblefilo', 'ys3ca0': 'pesada', 'j0tt8g': 'hechicero', 'l03qt5': 'mago', 'kdqemi': 'paladin',
    # humano
    'fk85rx': 'tirador', 'q9jzbo': 'doblefilo', 'cfxk3a': 'pesada', 'sn2gon': 'hechicero', '1dukzp': 'mago', 'v79ahv': 'paladin',
    # dracónido
    'algtb6': 'tirador', 'it1uvg': 'doblefilo', 'u9boy8': 'pesada', 'owl8wx': 'hechicero', 'rp2nzm': 'mago', 'rml7gg': 'paladin',
    # hombre bestia
    'fc0uuu': 'tirador', '4p4nz2': 'doblefilo', 'x9998d': 'pesada', '1oc8r9': 'hechicero', 'ge74j9': 'mago', 'adn2nm': 'paladin',
}


# Aliados de la Taberna (Assets/Aliados/chibi): id corto -> templateId del aliado.
# Salen como aliado_<templateId>.png en la misma carpeta e índice.
ALIADO_POR_ARCHIVO = {
    'b6v5xj': 'aldric', '9p1x6z': 'brann', 'jmp9l5': 'neira', 'nbaykx': 'lyra', 'elrxyo': 'fennwick',
    'gzta75': 'eira', 'ndli9n': 'delyth', '28eevs': 'seraphina', 'x0x2c5': 'vex', 'ok5fxk': 'kael',
}


# Monstruos (Assets/Sprites mobs/<década>/chibi): id corto -> id del enemigo en el
# juego. Salen como enemigo_<id>.png. Se guardan mirando a la derecha, igual que
# los jugadores; el combate los dibuja espejados.
ENEMIGO_POR_ARCHIVO = {
    'yonxu8': 'goblin_arquero',
    '334dlc': 'goblin_chaman', 'yq54c8': 'gilgoblin', 'b6y16r': 'goblin_guerrero', 'm2qzhq': 'goblin_saqueador',
    'ui1u5a': 'hobgoblin', 'uvd593': 'jefe_goblin', 's675p0': 'ogro',
    # arañas (11-20). Las tres con nombre las nombró ariochbu; el resto es
    # una asignación a ojo PENDIENTE de confirmar.
    'matriarca telaraa movs': 'matriarca_telaranha', 'reina telaraa movs': 'reina_telaranha',
    'matriarca escarlata movs': 'matriarca_escarlata',
    's1pg1p': 'viuda_venenosa', 'e7q49e': 'saltadora_alfa', 'kgvz2u': 'gran_tejedora', 'hiork1': 'devoradora_nido',
    'mjiind': 'viuda_carmesi', 'l0jjj7': 'tarantula_saltarina', 'v5fdpo': 'reina_devoradora', 'dl9lck': 'tarantula_cazadora',
    '91khx0': 'arana_caparazon', 'kqjvt5': 'tarantula_tejedora', 'j1ss8y': 'viuda_alfa',
}


# Láminas que el generador dibujó mirando a la IZQUIERDA: cada cuadro se
# espeja al importar, para que todas las tiras queden mirando a la derecha.
MIRA_IZQUIERDA = {'enemigo_goblin_chaman', 'enemigo_goblin_guerrero', 'enemigo_jefe_goblin', 'enemigo_ogro'} | {
    'enemigo_' + n for n in ('tarantula_cazadora', 'tarantula_saltarina', 'tarantula_tejedora', 'viuda_alfa', 'viuda_carmesi',
                             'viuda_venenosa', 'arana_caparazon', 'saltadora_alfa', 'gran_tejedora', 'matriarca_telaranha',
                             'reina_telaranha', 'reina_devoradora')}


# Sprites de viaje para el laberinto (Assets/Jugador/caminar): uno por raza,
# 2 filas (quieto, caminando). Salen como caminar_<raza>.png con "walk" en el
# índice. Se reconocen por el id corto o porque el nombre del archivo trae la raza.
CAMINAR_POR_ARCHIVO = {'ze5y2w': 'barbaro', 'fuuwe0': 'draconido', 'feeff9': 'enano', 'a61nez': 'hada', '2kpos3': 'bestia', 'gu0bu3': 'humano'}
# Íconos sueltos de las salas (Assets/Laberinto): id corto -> nombre. Salen en
# prototype-2d/assets/sprites/iconos/<nombre>.png, recortados y a 40px de alto.
ICONO_POR_ARCHIVO = {'maq23y': 'cofre', '8ba8a5': 'cofre_abierto', 'haqagx': 'hoguera'}


def walk_race(path):
    sid = short_id(path)
    if sid in CAMINAR_POR_ARCHIVO:
        return CAMINAR_POR_ARCHIVO[sid]
    for key, raza in sorted(RAZAS.items(), key=lambda kv: -len(kv[0])):
        if key in sid:
            return raza
    return None


def short_id(path):
    base = os.path.basename(path)
    if 'Image_' in base:
        return base.split('Image_')[-1][:6]
    # archivo con nombre puesto a mano: el nombre sin extensión, solo ASCII
    return os.path.splitext(base)[0].lower().encode('ascii', 'ignore').decode()


def remove_background(im, lines=True):
    """Devuelve alfa (bool HxW): False donde hay fondo de cuadritos/blanco."""
    rgb = np.asarray(im.convert('RGB')).astype(np.int16)
    mx, mn = rgb.max(axis=2), rgb.min(axis=2)
    lowsat = (mx - mn) < 18
    h, w = lowsat.shape
    # El tono del fondo cambia de lámina en lámina (cuadritos claros u oscuros):
    # el umbral sale del borde de la propia imagen.
    edge = np.concatenate([mn[0][lowsat[0]], mn[-1][lowsat[-1]], mn[:, 0][lowsat[:, 0]], mn[:, -1][lowsat[:, -1]]])
    thr = max(60, int(np.percentile(edge, 5)) - 14) if edge.size else 132
    cand = lowsat & (mn > thr)                     # gris de fondo o blanco, sin color
    # Fondo de color liso (verde o magenta "croma"): si el borde es de un color
    # vivo, el fondo es todo lo que se parezca a ese color.
    # (se busca el color vivo más repetido de toda la imagen: el borde puede
    # ser una línea negra de cuadrícula)
    vivid = rgb[(mx - mn) > 110]
    chroma, key = False, None
    if vivid.size:
        codes = (vivid[:, 0] // 32) * 64 + (vivid[:, 1] // 32) * 8 + (vivid[:, 2] // 32)
        top = np.bincount(codes).argmax()
        sel = vivid[codes == top]
        if sel.shape[0] > 0.15 * h * w:
            chroma, key = True, np.median(sel, axis=0)
    if chroma:
        cand = np.abs(rgb - key[None, None, :]).sum(axis=2) < 100
    # Líneas de cuadrícula (grises más oscuros que el fondo): tramos rectos y
    # largos, que ningún personaje tiene. Se tratan como fondo.
    dark = ((mx < 150) if chroma else ((mx - mn) < 30)) & ~cand  # sobre croma la línea negra sale teñida por el JPG
    # Sobre croma las líneas cruzan la lámina entera; se exige un tramo largo para
    # no confundirlas con un personaje de ropa oscura (que ocupa una sola celda).
    frac = 0.7 if chroma else 0.25
    if not lines:
        frac = 9  # íconos sueltos: no hay cuadrícula que quitar
    for arr, lim in ((dark, frac * w), (dark.T, frac * h)):
        target = cand if arr is dark else cand.T
        for i in range(arr.shape[0]):
            for a, b in runs(arr[i], 1):
                if b - a >= lim:
                    target[i, a:b] = True
    mask = Image.fromarray((cand * 255).astype(np.uint8)).copy()  # .copy(): fromarray deja la imagen de solo lectura
    # 1) todo lo que toca el borde es fondo
    px = mask.load()
    for x in range(0, w, 2):
        for y in (0, h - 1):
            if px[x, y] == 255:
                ImageDraw.floodfill(mask, (x, y), 128)
    for y in range(0, h, 2):
        for x in (0, w - 1):
            if px[x, y] == 255:
                ImageDraw.floodfill(mask, (x, y), 128)
    m = np.asarray(mask).copy()
    bright = mx
    # tonos del fondo ya detectado (los dos grises de los cuadritos, o blanco)
    bgvals = bright[m == 128]
    if bgvals.size:
        hist = np.bincount(bgvals // 6, minlength=44)
        tones = [int(t) * 6 + 3 for t in np.argsort(hist)[-3:]]
    else:
        tones = []
    # 2) huecos encerrados (entre brazo y cuerpo, dentro del arco): son fondo
    #    solo si son casi enteros de esos mismos tonos planos.
    left = {(int(y), int(x)) for y, x in zip(*np.nonzero(m == 255))}
    tone_arr = np.array(tones)
    while left:
        seed = left.pop()
        comp, stack = [seed], [seed]
        while stack:
            y, x = stack.pop()
            for nb in ((y + 1, x), (y - 1, x), (y, x + 1), (y, x - 1)):
                if nb in left:
                    left.remove(nb); comp.append(nb); stack.append(nb)
        if chroma:
            if len(comp) >= 6:
                ys, xs = np.array(comp).T
                m[ys, xs] = 128
            continue
        if len(comp) < 40 or not tones:
            continue
        ys, xs = np.array(comp).T
        vals = bright[ys, xs]
        flat = np.mean(np.min(np.abs(vals[:, None] - tone_arr[None, :]), axis=1) <= 9)
        if flat >= 0.85:
            m[ys, xs] = 128
    alpha = m != 128
    # quita 1px de borde (halo del JPG)
    a = alpha.copy()
    a[1:, :] &= alpha[:-1, :]; a[:-1, :] &= alpha[1:, :]
    a[:, 1:] &= alpha[:, :-1]; a[:, :-1] &= alpha[:, 1:]
    if chroma:
        # Reborde teñido del color de fondo: en los 2px del contorno se borra
        # también lo que se parece al fondo con una tolerancia más amplia.
        inner = a.copy()
        inner[1:, :] &= a[:-1, :]; inner[:-1, :] &= a[1:, :]
        inner[:, 1:] &= a[:, :-1]; inner[:, :-1] &= a[:, 1:]
        spill = np.abs(rgb - key[None, None, :]).sum(axis=2) < 190
        a &= ~((a & ~inner) & spill)
    return a


def runs(flags, min_gap):
    """Tramos [ini, fin) de True en un vector, uniendo huecos menores a min_gap."""
    out, start, gap = [], None, 0
    for i, v in enumerate(flags):
        if v:
            if start is None:
                start = i
            gap = 0
        elif start is not None:
            gap += 1
            if gap >= min_gap:
                out.append((start, i - gap + 1))
                start, gap = None, 0
    if start is not None:
        out.append((start, len(flags) - gap))
    return out


def find_frames(alpha, relaxed=False, nrows=4):
    """Lista de 4 filas; cada fila es una lista de cajas (x0, y0, x1, y1)."""
    h, w = alpha.shape
    bands = runs(alpha.sum(axis=1) > 2, 5)
    if bands:
        med = np.median([b - a for a, b in bands])
        bands = [(a, b) for a, b in bands if (b - a) >= 0.35 * med]
    if len(bands) != nrows:  # filas pegadas o sobrantes: se parte en partes iguales
        bands = [(round(i * h / nrows), round((i + 1) * h / nrows)) for i in range(nrows)]
    def boxes_in(a, b, x0, x1):
        sub = alpha[a:b, x0:x1]
        ys = np.nonzero(sub.any(axis=1))[0]
        xs = np.nonzero(sub.any(axis=0))[0]
        if not ys.size:
            return None
        return (x0 + int(xs[0]), a + int(ys[0]), x0 + int(xs[-1]) + 1, a + int(ys[-1]) + 1, int(sub.sum()))

    raw = []
    for a, b in bands:
        segs = runs(alpha[a:b].sum(axis=0) > 1, 4)
        raw.append([bx for bx in (boxes_in(a, b, x0, x1) for x0, x1 in segs) if bx])
    # Referencia: el personaje de pie en la fila de reposo.
    idle = [bx for bx in raw[0] if (bx[3] - bx[1]) >= 0.5 * max(q[3] - q[1] for q in raw[0])] if raw[0] else []
    if not idle:
        return [[] for _ in bands]
    ref_h = float(np.median([bx[3] - bx[1] for bx in idle]))
    ref_area = float(np.median([bx[4] for bx in idle]))
    centers = sorted((bx[0] + bx[2]) / 2 for bx in idle)
    pitch = float(np.median(np.diff(centers))) if len(centers) > 1 else w / 6
    rows = []
    for (a, b), boxes in zip(bands, raw):
        out = []
        for bx in boxes:
            if bx[4] < 0.25 * ref_area:      # resto suelto (chispa, flecha, daga caída)
                continue
            width = bx[2] - bx[0]
            n = int(round(width / pitch))
            parts = None
            if width > 1.45 * pitch and n >= 2:
                # Cuadros pegados entre sí: se cortan por los valles de la silueta,
                # solo si cada trozo sigue siendo un personaje de pie (si no, es
                # un efecto ancho —un hechizo, un tajo— y se deja entero).
                proj = alpha[a:b, bx[0]:bx[2]].sum(axis=0)
                cuts = [0]
                for k in range(1, n):
                    c = int(k * width / n); r = int(pitch * 0.3)
                    lo, hi = max(1, c - r), min(width - 1, c + r)
                    cuts.append(lo + int(np.argmin(proj[lo:hi])))
                cuts.append(width)
                parts = [boxes_in(a, b, bx[0] + cuts[i], bx[0] + cuts[i + 1]) for i in range(n)]
                # relaxed (monstruos): cuerpos anchos y bajos que se tocan entre
                # celdas; basta con que cada trozo tenga cuerpo suficiente.
                if relaxed:
                    parts = [p for p in parts if p is not None and p[4] >= 0.25 * ref_area]
                    if len(parts) < 2:
                        parts = None
                elif any(p is None or (p[3] - p[1]) < 0.7 * ref_h or p[4] < 0.4 * ref_area for p in parts):
                    parts = None
            out.extend([p[:4] for p in parts] if parts else [bx[:4]])
        rows.append(out)
    return rows


def build_strip(im, alpha, rows, flip=False, walk=False):
    rgba = np.dstack([np.asarray(im.convert('RGB')), (alpha * 255).astype(np.uint8)])
    src = Image.fromarray(rgba, 'RGBA')
    idle_h = np.median([y1 - y0 for (_x0, y0, _x1, y1) in rows[0]])
    idle_w = np.median([x1 - x0 for (x0, _y0, x1, _y1) in rows[0]])
    k = BODY_H / idle_h
    frames = []
    for r, boxes in enumerate(rows):
        line = []
        for box in boxes:
            crop = src.crop(box)
            if flip:
                crop = crop.transpose(Image.FLIP_LEFT_RIGHT)
            small = crop.resize((max(1, round(crop.width * k)), max(1, round(crop.height * k))), Image.BOX)
            small.putalpha(small.getchannel('A').point(lambda v: 255 if v >= 140 else 0))
            line.append(small)
        frames.append(line)
    body_w = idle_w * k
    # Ataque (fila 1): el personaje mira a la derecha y el efecto (tajo, hechizo)
    # se extiende hacia ese lado, así que se alinea por la izquierda del cuerpo.
    centered = range(len(frames)) if walk else (0, 2, 3)   # en las de caminar no hay fila de ataque
    half = max([f.width / 2 for r in centered for f in frames[r]] + ([] if walk else [f.width - body_w / 2 for f in frames[1]]) + [body_w / 2])
    cw = int(np.ceil(half)) * 2 + 2
    ch = max(f.height for line in frames for f in line) + 2
    cols = max(len(line) for line in frames)
    sheet = Image.new('RGBA', (cw * cols, ch * len(frames)), (0, 0, 0, 0))
    for r, line in enumerate(frames):
        for c, f in enumerate(line):
            x = round(cw / 2 - body_w / 2) if (r == 1 and not walk) else (cw - f.width) // 2
            sheet.paste(f, (c * cw + x, r * ch + ch - 1 - f.height), f)
    meta = {'cw': cw, 'ch': ch, 'frames': [len(line) for line in frames]}
    if walk:
        meta['walk'] = True
    return sheet, meta


def race_folders():
    for d in sorted(glob.glob(os.path.join(SRC, '*chibi'))):
        key = os.path.basename(d).lower().replace(' chibi', '')
        yield d, RAZAS[key]


def scan(dest):
    """Hojas de contacto con el id de cada archivo, para identificar sendas a ojo."""
    os.makedirs(dest, exist_ok=True)
    for d, raza in race_folders():
        files = sorted(glob.glob(d + '/*'), key=os.path.getmtime)
        tw, th = 400, 400
        sheet = Image.new('RGB', (tw * 4, th * ((len(files) + 3) // 4)), (30, 30, 30))
        draw = ImageDraw.Draw(sheet)
        for i, f in enumerate(files):
            im = Image.open(f).convert('RGB')
            im.thumbnail((tw - 8, th - 28))
            x, y = (i % 4) * tw, (i // 4) * th
            sheet.paste(im, (x + 4, y + 24))
            draw.text((x + 6, y + 4), short_id(f), fill=(255, 220, 90))
        sheet.save(os.path.join(dest, f'chibi_{raza}.jpg'), quality=88)
    print('ok', dest)


def main():
    if len(sys.argv) > 2 and sys.argv[1] == '--scan':
        return scan(sys.argv[2])
    os.makedirs(OUT, exist_ok=True)
    index = {}
    jobs = []
    for d, raza in race_folders():
        for f in sorted(glob.glob(d + '/*')):
            senda = SENDA_POR_ARCHIVO.get(short_id(f))
            if senda:
                jobs.append((f, f'{senda}_{raza}'))
    for f in sorted(glob.glob('Assets/Aliados/chibi/*')):
        if short_id(f) in ALIADO_POR_ARCHIVO:
            jobs.append((f, 'aliado_' + ALIADO_POR_ARCHIVO[short_id(f)]))
    for f in sorted(glob.glob('Assets/Sprites mobs/*/chibi/*')):
        if short_id(f) in ENEMIGO_POR_ARCHIVO:
            jobs.append((f, 'enemigo_' + ENEMIGO_POR_ARCHIVO[short_id(f)]))
    for f in sorted(glob.glob('Assets/Jugador/caminar/*')):
        if walk_race(f):
            jobs.append((f, 'caminar_' + walk_race(f)))
    only = sys.argv[1] if len(sys.argv) > 1 else ''   # prefijo opcional: solo esas tiras
    if only and os.path.exists(os.path.join(OUT, 'index.json')):
        index = json.load(open(os.path.join(OUT, 'index.json'), encoding='utf-8'))
    for f, name in jobs:
        if not any(name.startswith(o) for o in only.split(',')):
            continue
        if True:
            im = Image.open(f)
            alpha = remove_background(im)
            walk = name.startswith('caminar_')
            rows = find_frames(alpha, relaxed=name.startswith('enemigo_'), nrows=2 if walk else 4)
            if any(not line for line in rows):
                print('!! sin cuadros en alguna fila:', f)
                continue
            sheet, meta = build_strip(im, alpha, rows, name in MIRA_IZQUIERDA, walk)
            sheet.save(os.path.join(OUT, name + '.png'))
            index[name] = meta
            print(name, meta)
    if not only or only == 'iconos':
        dest = os.path.join(os.path.dirname(OUT), 'iconos')
        os.makedirs(dest, exist_ok=True)
        for f in sorted(glob.glob('Assets/Laberinto/*')):
            name = ICONO_POR_ARCHIVO.get(short_id(f))
            if not name:
                continue
            im = Image.open(f)
            alpha = remove_background(im, lines=False)
            # la sombra del ícono viene teñida del fondo magenta: también se quita
            px = np.asarray(im.convert('RGB')).astype(np.int16)
            alpha &= ~((px[:, :, 0] > px[:, :, 1] + 50) & (px[:, :, 2] > px[:, :, 1] + 50) & (np.abs(px[:, :, 0] - px[:, :, 2]) < 70))
            rgba = np.dstack([np.asarray(im.convert('RGB')), (alpha * 255).astype(np.uint8)])
            icon = Image.fromarray(rgba, 'RGBA')
            icon = icon.crop(icon.getbbox())
            k = 40 / icon.height
            icon = icon.resize((max(1, round(icon.width * k)), 40), Image.BOX)
            icon.putalpha(icon.getchannel('A').point(lambda v: 255 if v >= 140 else 0))
            icon.save(os.path.join(dest, name + '.png'))
            print('icono', name, icon.size)
    with open(os.path.join(OUT, 'index.json'), 'w', encoding='utf-8') as fh:
        json.dump(index, fh, indent=1, sort_keys=True)
    print('ok', len(index), 'tiras')


if __name__ == '__main__':
    main()
