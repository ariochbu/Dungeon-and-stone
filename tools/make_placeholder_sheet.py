"""Genera una tira de sprites de RELLENO para el piloto de animación
(prototype-2d/sprites.html). No es arte final: es un muñeco chibi dibujado con
rectángulos, solo para poder probar el reproductor antes de tener el arte real.

Formato (el mismo que debe respetar el arte real, ver tools/import_spritesheet.py):
  celdas de 64x64, 6 columnas, una fila por estado:
    fila 0 reposo (4 cuadros) · fila 1 ataque (6) · fila 2 golpe (2) · fila 3 muerte (4)

Uso, desde la raíz del repo:  python tools/make_placeholder_sheet.py
"""
from PIL import Image, ImageDraw

CELL, COLS = 64, 6
OUT = 'prototype-2d/assets/sprites/piloto_pesada_barbaro.png'

LINE = (26, 18, 16, 255)
SKIN, SKIN_D = (224, 172, 128, 255), (186, 130, 96, 255)
HAIR, HAIR_D = (122, 72, 40, 255), (88, 50, 30, 255)
CLOTH, CLOTH_D = (176, 44, 44, 255), (124, 28, 34, 255)
BOOT = (70, 48, 36, 255)
STEEL, STEEL_D = (150, 156, 166, 255), (98, 104, 116, 255)
WOOD = (120, 84, 52, 255)
WHITE = (255, 255, 255, 255)


def box(d, x0, y0, x1, y1, fill, shade=None):
    """Rectángulo con contorno oscuro de 1px y, opcional, sombra abajo."""
    if y0 > y1:
        y0 = y1
    d.rectangle([x0 - 1, y0 - 1, x1 + 1, y1 + 1], fill=LINE)
    d.rectangle([x0, y0, x1, y1], fill=fill)
    if shade:
        d.rectangle([x0, y1 - max(1, (y1 - y0) // 3), x1, y1], fill=shade)


def figure(bob=0, lean=0, hammer=(0, 0), swing=0, squash=0, flash=False, eyes=True):
    """Un cuadro. bob: sube/baja el torso; lean: inclina hacia la derecha;
    hammer: desplazamiento del martillo; swing: 0 arriba .. 3 abajo; squash: aplasta (muerte)."""
    im = Image.new('RGBA', (CELL, CELL), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    gx, gy = 30, 60  # punto de apoyo (pies)
    top = gy - 44 + bob + squash
    # piernas y botas
    box(d, gx - 8, gy - 12 + squash // 2, gx - 3, gy - 4, SKIN, SKIN_D)
    box(d, gx + 2, gy - 12 + squash // 2, gx + 7, gy - 4, SKIN, SKIN_D)
    box(d, gx - 9, gy - 4, gx - 2, gy - 1, BOOT)
    box(d, gx + 1, gy - 4, gx + 8, gy - 1, BOOT)
    # torso + taparrabos
    tx = gx + lean
    box(d, tx - 9, top + 24, tx + 8, gy - 13 + squash // 2, SKIN, SKIN_D)
    box(d, tx - 9, gy - 18 + squash // 2, tx + 8, gy - 12 + squash // 2, CLOTH, CLOTH_D)
    # escudo (brazo izquierdo, atrás)
    box(d, tx - 17, top + 22, tx - 10, top + 38, STEEL, STEEL_D)
    # cabeza grande (chibi)
    hx = tx + lean
    box(d, hx - 12, top, hx + 11, top + 22, SKIN, SKIN_D)
    box(d, hx - 12, top, hx + 11, top + 7, HAIR, HAIR_D)
    box(d, hx - 12, top + 8, hx - 9, top + 16, HAIR)
    if eyes:
        d.rectangle([hx + 1, top + 12, hx + 3, top + 15], fill=LINE)
        d.rectangle([hx + 7, top + 12, hx + 9, top + 15], fill=LINE)
    else:  # ojos cerrados
        d.rectangle([hx + 1, top + 14, hx + 3, top + 14], fill=LINE)
        d.rectangle([hx + 7, top + 14, hx + 9, top + 14], fill=LINE)
    # martillo (brazo derecho): según swing, de arriba a abajo
    ax, ay = tx + 10 + hammer[0], top + 26 + hammer[1]
    ends = [(4, -22), (12, -14), (18, -2), (16, 10)][swing]
    ex, ey = ax + ends[0], ay + ends[1]
    d.line([ax, ay, ex, ey], fill=LINE, width=4)
    d.line([ax, ay, ex, ey], fill=WOOD, width=2)
    box(d, ex - 5, ey - 4, ex + 5, ey + 4, STEEL, STEEL_D)
    box(d, ax - 2, ay - 2, ax + 2, ay + 2, SKIN)
    if flash:  # golpe recibido: silueta en blanco
        px = im.load()
        for y in range(CELL):
            for x in range(CELL):
                if px[x, y][3]:
                    px[x, y] = WHITE
    return im


def main():
    rows = [
        # reposo: respiración
        [figure(bob=0), figure(bob=1), figure(bob=2), figure(bob=1)],
        # ataque: carga, sube, baja, impacto, recupera
        [figure(lean=-1, swing=0), figure(lean=-2, swing=0, hammer=(-2, -2)), figure(lean=1, swing=1),
         figure(lean=3, swing=2, hammer=(2, 0)), figure(lean=4, swing=3, hammer=(3, 2)), figure(lean=1, swing=1)],
        # golpe recibido
        [figure(lean=-3, flash=True), figure(lean=-2, eyes=False)],
        # muerte: se desploma
        [figure(lean=-2, eyes=False), figure(lean=-3, squash=6, eyes=False),
         figure(lean=-4, squash=14, eyes=False), figure(lean=-4, squash=20, eyes=False)],
    ]
    sheet = Image.new('RGBA', (CELL * COLS, CELL * len(rows)), (0, 0, 0, 0))
    for r, frames in enumerate(rows):
        for c, f in enumerate(frames):
            sheet.paste(f, (c * CELL, r * CELL))
    import os
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    sheet.save(OUT)
    print('ok', OUT, sheet.size)


if __name__ == '__main__':
    main()
