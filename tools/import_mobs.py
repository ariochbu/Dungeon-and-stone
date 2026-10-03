"""Importa sprites de monstruos (estilo pixel art 31-40) desde Assets/Sprites mobs/<década>/.
Uso: python import_mobs.py 1-10 11-20 ...   (correr desde la raíz del repo)
Toma la versión de mayor tamaño de cada sprite, recorta al alfa y la alinea abajo
en un lienzo cuadrado SIN reescalar (para no dañar el pixel art)."""
from PIL import Image
import glob, os, re, sys

ALIAS = {
  'matriarca_telarana':'matriarca_telaranha', 'reina_telarana':'reina_telaranha',
  'devoradora_de_nido':'devoradora_nido', 'arana_de_caparazon':'arana_caparazon',
  'reflejo_perfecto':'reflejo_perfecto_g', 'mascara_viviente':'mascara_viviente_g',
  'espejo_de_sombras':'espejo_sombras', 'imitador_de_formacion':'imitador_formacion',
  'maestro_del_reflejo':'maestro_reflejo', 'maestro_de_rostros':'maestro_rostros',
  'centinela_de_coral':'centinela_coral_g', 'centinela_coral':'centinela_coral_g',
  'gran_lobo_de_hoja':'gran_lobo_hoja', 'oso_de_las_cuevas':'oso_cuevas', 'loba_de_acantilado':'loba_acantilado',
  'halcon_de_guerra':'halcon_guerra', 'jabali_de_hierro':'jabali_hierro', 'rey_de_la_manada':'rey_manada',
  'alfa_de_la_manada':'alfa_manada', 'medico_de_campana':'medico_campana', 'asesino_de_la_isla':'asesino_isla',
  'asesino_de_elite':'asesino_elite_isla', 'custodio_de_la_isla':'custodio_isla', 'guardia_de_las_profundidades':'guardia_profundidades',
  'sacerdotisa_de_las_mareas':'sacerdotisa_mareas', 'guardian_del_abismo':'guardian_abismo', 'serpiente_de_palpus':'serpiente_palpus',
  'heraldo_de_la_tormenta':'heraldo_tormenta', 'campeon_de_triton':'campeon_triton',
  'usurpador_f1_limo':'usurpador', 'usurpador_f2_mimicry':'usurpador_f2', 'usurpador_f3_clon':'usurpador_f3', 'usurpador_f4_cristal':'usurpador_f4',
  'custodio':'custodio_isla', 'goblin_jefe':'jefe_goblin', 'goblin_gilgoblin':'gilgoblin', 'goblin_hobgoblin':'hobgoblin', 'goblin_ogro':'ogro',
}
def to_id(base):
    b = re.sub(r'^(normal|elite)_', '', base)
    b = re.sub(r'^p\d+_', '', b)
    b = re.sub(r'^jefe_(?=[a-z]+_)', '', b) if base.startswith('jefe_') else b
    b = re.sub(r'^piso_\d+_(jefe_)?', '', b)
    return ALIAS.get(b, b)

done = []
for folder in sys.argv[1:]:
    groups = {}
    for f in glob.glob(f'Assets/Sprites mobs/{folder}/*.png'):
        base = os.path.basename(f)[:-4]
        m = re.match(r'(.*)_(\d+)$', base)
        if not m: continue
        key, sz = m.group(1), int(m.group(2))
        if key not in groups or sz > groups[key][1]: groups[key] = (f, sz)
    for key,(f,sz) in sorted(groups.items()):
        eid = to_id(key)
        im = Image.open(f).convert('RGBA'); im = im.crop(im.getchannel('A').getbbox())
        S = max(im.width, im.height) + 4
        c = Image.new('RGBA', (S,S), (0,0,0,0)); c.paste(im, ((S-im.width)//2, S-im.height-1), im)
        c.save(f'src/assets/enemigos/{eid}.png', optimize=True)
        done.append(eid)
print(len(done), done)
