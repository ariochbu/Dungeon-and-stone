"""Arma tiras animadas a partir de los personajes ACTUALES del jugador
(src/assets/jugador/<senda>_<raza>.png, una imagen fija cada uno).

No redibuja nada: cada cuadro es la misma ilustración deformada (respira, se
inclina para golpear, parpadea en blanco al recibir daño, cae al morir).
Mismo formato que tools/import_spritesheet.py:
  6 columnas · fila 0 reposo (4) · fila 1 ataque (6) · fila 2 golpe (2) · fila 3 muerte (4)

Genera dos versiones por personaje, en prototype-2d/assets/sprites/:
  px/  celda 64, reducida a pixel art (paleta corta + contorno oscuro)
  hd/  celda 160, con el detalle de la ilustración original

Uso, desde la raíz del repo:  python tools/make_player_sheets.py
"""
import glob
import os
from PIL import Image, ImageChops, ImageFilter

SRC = 'src/assets/jugador'
OUT = 'prototype-2d/assets/sprites'
COLS = 6
OUTLINE = (24, 16, 14, 255)

# (ángulo en grados — negativo inclina hacia la derecha, el lado del enemigo —,
#  desplazamiento x en fracción de celda, estirado vertical, efecto)
ROWS = [
    [(0, 0, 1.00, None), (0, 0, 1.015, None), (0, 0, 1.03, None), (0, 0, 1.015, None)],
    [(6, -0.05, 0.98, None), (10, -0.08, 0.97, None), (-6, 0.04, 1.02, None),
     (-16, 0.10, 1.0, None), (-10, 0.07, 1.0, None), (-3, 0.02, 1.0, None)],
    [(9, -0.07, 0.98, 'white'), (5, -0.04, 1.0, 'red')],
    [(18, -0.03, 0.97, None), (42, 0, 0.95, None), (70, 0, 0.95, None), (88, 0, 0.95, 'fade')],
]


def transform(base, angle, stretch):
    """Estira y gira alrededor de los pies (centro del borde inferior)."""
    w, h = base.size
    img = base.resize((w, max(1, round(h * stretch))), Image.LANCZOS) if stretch != 1 else base
    pad = int(max(img.size) * 1.15)  # radio suficiente para girar sin recortar
    big = Image.new('RGBA', (pad * 2, pad * 2), (0, 0, 0, 0))
    big.paste(img, (pad - img.width // 2, pad - img.height), img)  # pies en (pad, pad)
    if angle:
        big = big.rotate(angle, resample=Image.BICUBIC, center=(pad, pad))
    return big, pad


def effect(img, kind):
    if not kind:
        return img
    r, g, b, a = img.split()
    if kind == 'white':
        return Image.merge('RGBA', (a.point(lambda v: 255 if v else 0),) * 3 + (a,))
    if kind == 'red':
        red = Image.merge('RGBA', (r.point(lambda v: min(255, v + 90)), g.point(lambda v: v // 2), b.point(lambda v: v // 2), a))
        return red
    if kind == 'fade':
        dark = Image.merge('RGBA', tuple(c.point(lambda v: int(v * 0.55)) for c in (r, g, b)) + (a,))
        return dark
    return img


# Sendas que atacan a distancia (arco, magia): no se lanzan contra el enemigo.
# Su ataque es tomar impulso hacia atrás y soltar el disparo con un leve
# retroceso; el proyectil lo dibuja el juego (ver prototype-2d/sprites.html).
RANGED = ('tirador', 'mago', 'hechicero')
RANGED_ATTACK = [(3, -0.02, 0.99, None), (6, -0.04, 0.98, None), (7, -0.05, 0.98, None),
                 (-4, 0.02, 1.01, None), (3, -0.02, 1.0, None), (1, 0, 1.0, None)]


def frame(base, spec, cell, body_h, pixel):
    angle, dx, stretch, kind = spec
    big, pad = transform(base, angle, stretch)
    scale = body_h / base.height
    size = (max(1, round(big.width * scale)), max(1, round(big.height * scale)))
    small = effect(big.resize(size, Image.BOX if pixel else Image.LANCZOS), kind)
    if pixel:
        small.putalpha(small.getchannel('A').point(lambda v: 255 if v >= 128 else 0))
    bbox = small.getbbox()
    out = Image.new('RGBA', (cell, cell), (0, 0, 0, 0))
    if not bbox:
        return out
    feet_x, feet_y = pad * scale, pad * scale
    crop = small.crop(bbox)
    # pies en el centro-abajo de la celda (1px de margen para el contorno), sin salirse
    x = round(cell / 2 + dx * cell - (feet_x - bbox[0]))
    x = max(1, min(cell - 1 - crop.width, x)) if crop.width <= cell - 2 else (cell - crop.width) // 2
    y = min(cell - 1 - crop.height, round(cell - 1 - (feet_y - bbox[1])))
    out.paste(crop, (x, max(0, y)), crop)
    return out


def pixel_finish(sheet):
    """Paleta corta (la misma para todos los cuadros) + contorno oscuro de 1px."""
    alpha = sheet.getchannel('A')
    rgb = sheet.convert('RGB').quantize(colors=40, method=Image.MEDIANCUT, dither=Image.NONE).convert('RGB')
    body = Image.merge('RGBA', rgb.split() + (alpha,))
    grown = alpha.filter(ImageFilter.MaxFilter(3))
    ring = ImageChops.subtract(grown, alpha)
    out = Image.new('RGBA', sheet.size, (0, 0, 0, 0))
    out.paste(Image.new('RGBA', sheet.size, OUTLINE), (0, 0), ring)
    out.paste(body, (0, 0), alpha)
    return out


def build(path, cell, body_h, pixel):
    base = Image.open(path).convert('RGBA')
    base = base.crop(base.getbbox())
    sheet = Image.new('RGBA', (cell * COLS, cell * len(ROWS)), (0, 0, 0, 0))
    ranged = os.path.basename(path).split('_')[0] in RANGED
    for r, specs in enumerate(ROWS):
        if r == 1 and ranged:
            specs = RANGED_ATTACK
        for c, spec in enumerate(specs):
            sheet.paste(frame(base, spec, cell, body_h, pixel), (c * cell, r * cell))
    return pixel_finish(sheet) if pixel else sheet


def main():
    files = sorted(glob.glob(os.path.join(SRC, '*.png')))
    for sub, cell, body_h, pixel in (('px', 64, 52, True), ('hd', 160, 132, False)):
        os.makedirs(os.path.join(OUT, sub), exist_ok=True)
        for f in files:
            build(f, cell, body_h, pixel).save(os.path.join(OUT, sub, os.path.basename(f)))
    print('ok', len(files), 'personajes x 2 versiones en', OUT)


if __name__ == '__main__':
    main()
