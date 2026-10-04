"""Empaqueta las páginas de prueba de prototype-2d en archivos HTML sueltos
(todo incrustado: código, tiras chibi, imágenes), para abrirlos con doble clic
o compartirlos sin necesidad de servidor local.

Uso, desde la raíz del repo:  python tools/build_standalone.py
  -> prototype-2d/dist/sprites.html, laberinto.html y combate.html
"""
import base64
import glob
import json
import os
import re

P = 'prototype-2d'


def data_uri(path):
    mime = 'image/jpeg' if path.lower().endswith(('.jpg', '.jpeg')) else 'image/png'
    with open(path, 'rb') as fh:
        return f'data:{mime};base64,' + base64.b64encode(fh.read()).decode()


def main():
    assets = {f'assets/sprites/chibi/{os.path.basename(f)}': data_uri(f) for f in glob.glob(f'{P}/assets/sprites/chibi/*.png')}
    assets['assets/sprites/piloto_pesada_barbaro.png'] = data_uri(f'{P}/assets/sprites/piloto_pesada_barbaro.png')
    assets['assets/tilemap_packed.png'] = data_uri(f'{P}/assets/tilemap_packed.png')
    for e in ('alfa_manada', 'ogro', 'goblin_guerrero', 'goblin_saqueador', 'goblin_arquero', 'goblin_chaman'):
        assets[f'src/assets/enemigos/{e}.png'] = data_uri(f'src/assets/enemigos/{e}.png')
    for f in glob.glob(f'{P}/assets/fondos/*.jpg'):
        assets['assets/fondos/' + os.path.basename(f)] = data_uri(f)
    for f in glob.glob(f'{P}/assets/sprites/iconos/*.png'):
        assets['assets/sprites/iconos/' + os.path.basename(f)] = data_uri(f)
    index = open(f'{P}/assets/sprites/chibi/index.json', encoding='utf-8').read()
    anim = open(f'{P}/spriteAnim.js', encoding='utf-8').read().replace('export ', '')
    anim = anim.replace('img.src = src;', "img.src = ASSETS[src.replace(/^(?:[.]{1,2}[/])+/, '')] || src;")
    os.makedirs(f'{P}/dist', exist_ok=True)
    for page in ('sprites.html', 'laberinto.html', 'combate.html'):
        html = open(f'{P}/{page}', encoding='utf-8').read()
        used = {k: v for k, v in assets.items() if page != 'laberinto.html' or 'chibi' in k or 'tilemap' in k or 'fondos' in k or 'iconos' in k}
        html = re.sub(r"import \{[^}]+\} from './spriteAnim.js';", lambda m: 'const ASSETS = ' + json.dumps(used) + ';\n' + anim, html)
        html = re.sub(r"await fetch\('\./assets/sprites/chibi/index\.json'\)\.then\(r=>r\.json\(\)\)\.catch\(\(\)=>\(\{\}\)\)", lambda m: index.strip(), html)
        html = html.replace("tiles.src = './assets/tilemap_packed.png';", "tiles.src = ASSETS['assets/tilemap_packed.png'];")
        # la versión suelta solo trae el arte chibi
        html = html.replace('<option value="px">Ilustración reducida (64 px)</option>', '').replace('<option value="hd">Ilustración original (160 px)</option>', '')
        assert "from './spriteAnim.js'" not in html and "fetch('./assets" not in html
        with open(f'{P}/dist/{page}', 'w', encoding='utf-8') as fh:
            fh.write(html)
        print(page, round(len(html) / 1e6, 2), 'MB')


if __name__ == '__main__':
    main()
