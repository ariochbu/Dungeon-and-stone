"""Convierte una lámina de animación (la que sale del generador de imágenes) en
una tira lista para prototype-2d/spriteAnim.js.

La lámina de entrada debe ser una cuadrícula pareja: 4 filas x 6 columnas
  fila 1 reposo (4 cuadros) · fila 2 ataque (6) · fila 3 golpe recibido (2) · fila 4 muerte (4)
con el personaje mirando a la derecha. Las celdas que sobran van vacías.

Qué hace:
  - si la imagen no trae transparencia, borra el color de fondo (el de la esquina);
  - recorta cada cuadro, y los reduce TODOS con el mismo factor para que el
    personaje no cambie de tamaño entre cuadros;
  - los apoya en el borde inferior de una celda de 64x64, centrados.

Uso, desde la raíz del repo:
  python tools/import_spritesheet.py "Assets/Sprites jugador/lamina.png" pesada_barbaro
  -> prototype-2d/assets/sprites/pesada_barbaro.png
Opciones: --rows 4 --cols 6 --cell 64 --tol 40
"""
import argparse
import os
from PIL import Image


def key_out_background(im, tol):
    if im.mode == 'RGBA' and im.getextrema()[3][0] < 250:
        return im  # ya trae transparencia
    im = im.convert('RGBA')
    bg = im.getpixel((0, 0))[:3]
    px = im.load()
    for y in range(im.height):
        for x in range(im.width):
            r, g, b, _ = px[x, y]
            if abs(r - bg[0]) + abs(g - bg[1]) + abs(b - bg[2]) <= tol:
                px[x, y] = (0, 0, 0, 0)
    return im


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('src')
    ap.add_argument('name')
    ap.add_argument('--rows', type=int, default=4)
    ap.add_argument('--cols', type=int, default=6)
    ap.add_argument('--cell', type=int, default=64)
    ap.add_argument('--tol', type=int, default=40)
    a = ap.parse_args()

    im = key_out_background(Image.open(a.src), a.tol)
    cw, ch = im.width / a.cols, im.height / a.rows
    crops = {}
    for r in range(a.rows):
        for c in range(a.cols):
            cell = im.crop((round(c * cw), round(r * ch), round((c + 1) * cw), round((r + 1) * ch)))
            bbox = cell.getchannel('A').point(lambda v: 255 if v > 40 else 0).getbbox()
            if bbox:
                crops[(r, c)] = cell.crop(bbox)
    if not crops:
        raise SystemExit('No se encontró ningún cuadro: ¿la lámina tiene fondo liso o transparente?')

    # Un solo factor para toda la lámina (deja 1px de margen).
    factor = min((a.cell - 2) / max(c.width for c in crops.values()),
                 (a.cell - 2) / max(c.height for c in crops.values()))
    out = Image.new('RGBA', (a.cell * a.cols, a.cell * a.rows), (0, 0, 0, 0))
    for (r, c), crop in crops.items():
        w, h = max(1, round(crop.width * factor)), max(1, round(crop.height * factor))
        small = crop.resize((w, h), Image.BOX)
        # Bordes duros: el pixel art no lleva semitransparencias.
        alpha = small.getchannel('A').point(lambda v: 255 if v >= 128 else 0)
        small.putalpha(alpha)
        out.paste(small, (c * a.cell + (a.cell - w) // 2, r * a.cell + a.cell - h), small)

    dest = f'prototype-2d/assets/sprites/{a.name}.png'
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    out.save(dest)
    counts = [sum(1 for (r, _c) in crops if r == row) for row in range(a.rows)]
    print('ok', dest, out.size, 'cuadros por fila:', counts)


if __name__ == '__main__':
    main()
