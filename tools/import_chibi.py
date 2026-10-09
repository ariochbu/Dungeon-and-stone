"""Importa las láminas chibi (jugadores, aliados y monstruos) a las tiras que
usa el combate (src/spriteAnim.js) y saca los retratos sueltos.

Las láminas llegan con fondo croma (verde/magenta) o de cuadritos y con los
cuadros en posiciones no del todo parejas. Este script:
  1. borra el fondo;
  2. decide si el archivo es una LÁMINA (4 filas: reposo, ataque, golpe,
     muerte) o un RETRATO (una sola figura grande);
  3. lámina: detecta cada cuadro, reduce todo con un mismo factor (reposo =
     BODY_H px de alto) y arma una tira de celdas iguales, con los pies abajo.
     Va a src/assets/chibi/<nombre>.png + index.json (cw, ch, bh, frames);
  4. retrato: recortado, a src/assets/enemigos/<id>.png (monstruos) o
     src/assets/jugador/<senda>_<raza>.png (jugadores).

Quién es cada archivo sale de su nombre (tablas *_POR_NOMBRE) o, si llegó sin
nombre, de su id corto (tablas *_POR_ARCHIVO, identificados a ojo). Si dos
archivos dan la misma tira gana el más nuevo.

Uso, desde la raíz del repo:
  python tools/import_chibi.py                 importa todo lo mapeado
  python tools/import_chibi.py enemigo_,aliado_   solo las tiras con ese prefijo
  python tools/import_chibi.py --review DIR    hojas de contacto de lo importado
                                               (para ver hacia dónde mira cada una)
"""
import glob
import json
import multiprocessing
import os
import sys
import unicodedata

import numpy as np
from PIL import Image, ImageDraw

SRC = 'Assets/Jugador'
OUT = 'src/assets/chibi'
OUT_ENEMIGOS = 'src/assets/enemigos'
OUT_JUGADOR = 'src/assets/jugador'
BODY_H = 128  # alto del personaje en reposo, en píxeles de la tira (el juego la dibuja a 64·escala)
RAZAS = {'barbaro': 'barbaro', 'enano': 'enano', 'hada': 'hada', 'humano': 'humano',
         'dragonico': 'draconido', 'hombre bestia': 'bestia'}

# Jugadores: la senda sale del nombre del archivo (la raza, de la carpeta).
SENDA_POR_PALABRA = (('paladi', 'paladin'), ('hechi', 'hechicero'), ('mag', 'mago'), ('asesin', 'doblefilo'),
                     ('arquer', 'tirador'), ('guerrer', 'pesada'))
# Nombres que no dicen su senda o la dicen mal (vistos a ojo).
SENDA_POR_NOMBRE = {
    ('barbaro', 'guerrero hechicero'): 'hechicero', ('barbaro', 'guerrero paladin'): 'paladin',
    ('humano', 'h humano'): 'tirador', ('draconido', 'draconico hechicero pj'): 'paladin',
}
# Láminas viejas sin nombre: id corto (entre "Image_" y ".jfif", primeros 6) -> senda
SENDA_POR_ARCHIVO = {
    'cvyli1': 'tirador', '3asiav': 'doblefilo', 'idolla': 'pesada', '85xmyk': 'hechicero', '4rycqh': 'mago', 'givjb8': 'paladin',
    'fc0uuu': 'tirador', '4p4nz2': 'doblefilo', 'x9998d': 'pesada', '1oc8r9': 'hechicero', 'ge74j9': 'mago', 'adn2nm': 'paladin',
}

# Aliados de la Taberna (Assets/Aliados/chibi) -> templateId. Salen como aliado_<templateId>.
ALIADO_POR_NOMBRE = {
    'hoja de sprites de arquera pixel art': 'lyra', 'sprite de animacion de arquera elfica': 'neira',
    'hoja de sprites de caballero pixelado': 'aldric', 'hoja de sprites pixel art del paladin enano': 'brann',
    'hoja de sprites del mago de fuego retro': 'fennwick', 'hoja de sprites de maga de hielo chibi': 'eira',
    'hoja de sprites de sacerdotisa luminosa': 'delyth', 'sacerdote': 'seraphina',
    'sprite sheet del ninja sombrio': 'kael', 'hojas sombrias en verde neon': 'vex',
}
ALIADO_POR_ARCHIVO = {
    'qyvu4r': 'aldric', '9p1x6z': 'brann', 'n49u2c': 'neira', 'nbaykx': 'lyra', 'elrxyo': 'fennwick',
    'gzta75': 'eira', 'fgeg6g': 'delyth', '28eevs': 'seraphina', 'x0x2c5': 'vex', 'ok5fxk': 'kael',
}

# Monstruos (Assets/Sprites mobs/<década>/chibi) -> id del enemigo en el juego.
# El nombre se compara sin tildes, en minúsculas y sin el " mob"/" full" final.
ENEMIGO_POR_NOMBRE = {
    'gilgoblin': 'gilgoblin', 'hobgoblin': 'hobgoblin',
    'arana de caparazon': 'arana_caparazon', 'devoradora de nido': 'devoradora_nido', 'matriarca telarana': 'matriarca_telaranha',
    'gran tejedora': 'gran_tejedora', 'matriarca abisal': 'matriarca_abisal', 'matriarca escarlata': 'matriarca_escarlata',
    'reina devoradora': 'reina_devoradora', 'reina telarana': 'reina_telaranha', 'saltadora alfaa': 'saltadora_alfa',
    'tarantula cazadora': 'tarantula_cazadora', 'tarantula saltarina': 'tarantula_saltarina', 'tarantula tejedora': 'tarantula_tejedora',
    'viuda alfa': 'viuda_alfa', 'viuda carmesi': 'viuda_carmesi', 'viuda venenosa': 'viuda_venenosa',
    'saltadora alfa': 'saltadora_alfa',
    'lobo del acantilado': 'loba_acantilado', 'oso de las cuevas': 'oso_cuevas', 'buitre corrupto': 'buitre_corrupto',
    'lince sombrio': 'lince_sombrio', 'alfa de la manada': 'alfa_manada', 'gran lobo de hoja': 'gran_lobo_hoja',
    'oso roca lunar': 'oso_roca_lunar', 'halcon de guerra': 'halcon_guerra', 'tigre sable': 'tigre_sable',
    'jabali hierro': 'jabali_hierro', 'lobo quimera': 'lobo_quimera', 'oso acorazado': 'oso_acorazado',
    'bestia carmesi': 'bestia_carmesi', 'rey de la manada': 'rey_manada', 'riakis': 'riakis',
    'duelista veterano': 'duelista_veterano', 'asesino de elite': 'asesino_elite_isla', 'asesino de la isla': 'asesino_isla',
    'capitan mercenario': 'capitan_mercenario', 'cazador veterano': 'cazador_veterano', 'cazarecompensas': 'cazarrecompensas',
    'custodio': 'custodio_isla', 'explorador rival': 'explorador_rival', 'medico': 'medico_campana',
    'mercenario desertor': 'mercenario_desertor', 'superviviente curtido': 'superviviente_curtido',
    'superviviente despiadado': 'superviviente_despiadado',
    'arquero naga': 'naga_arquero', 'cangrejo gigante': 'cangrejo_gigante', 'capitan triton': 'campeon_triton',
    'naga capitan': 'naga_capitan', 'guardia de las profundidades': 'guardia_profundidades', 'garvel': 'garvel',
    'gran cangrejo': 'gran_cangrejo_abisal', 'naga maestro': 'naga_maestro', 'sirena corrupta': 'sirena_corrupta',
    'stom gush': 'storm_gush', 'stom gush fase final': 'storm_gush_final', 'centinela de coral': 'centinela_coral_g',
    'guardian del abismo': 'guardian_abismo', 'heraldo de la tormenta': 'heraldo_tormenta', 'heraldo de la tormental': 'heraldo_tormenta',
    'leviatan abisal': 'leviatan_abisal', 'sacerdotisa de las mareas': 'sacerdotisa_mareas', 'serpiente de palpus': 'serpiente_palpus',
    'sirena matriarcal': 'sirena_matriarca', 'triton guerrero': 'triton_guerrero', 'triton hechicero': 'triton_hechicero',
    # La Grieta (61-70)
    'boca peregrina': 'boca_peregrina', 'ciempies especular': 'ciempies_especular', 'ciervo torcido': 'ciervo_torcido',
    'vigilante descosido': 'vigilante_descosido', 'acaro del vacio': 'acaro_umbral', 'larva de fase': 'larva_fase',
    'ojo de reflujo': 'ojo_reflujo', 'sabueso invertido': 'sabueso_invertido',
    'anca del vacio': 'ancla_vacio', 'eco heredado': 'eco_heredado', 'pastor de errores': 'pastor_errores',
    'quimera disonante': 'quimera_disonante',
    'la costura': 'la_costura', 'el inversor': 'el_inversor', 'el coro hueco': 'coro_hueco', 'arana del vacio': 'geometra_ciega',
    'hambre de colores': 'hambre_colores', 'el recuerdo mal nacido': 'recuerdo_mal_nacido',
    'rey de las articulaciones': 'rey_articulaciones', 'leviatan, la marea seca': 'marea_seca',
    'la puerta que camina': 'puerta_camina',
    'el sin forma primera fase': 'sin_forma', 'el sin forma segunda fase': 'sin_forma_f2', 'el sin forma tercera fase': 'sin_forma_f3',
    # Bosque muerto (71-80): por ahora solo una imagen por criatura (sin animación)
    'raiz desenterrada': 'raiz_desenterrada', 'jardinero hueco': 'jardinero_hueco', 'ciervo sepulcrall': 'ciervo_sepulcral',
    'polilla funeraria': 'polilla_funeraria', 'hongo de osario': 'hongo_osario', 'enredadera viuda': 'enredadera_viuda',
    'cuervo de savia': 'cuervo_savia', 'brote carronero': 'brote_carronero', 'caracol de tumba': 'caracol_tumba',
    'espantapajaros raigal': 'espantapajaros_raigal', 'mantis de poda': 'mantis_poda', 'semilla doliente': 'semilla_doliente',
    'madre micelio': 'madre_micelio', 'injerto profano': 'injerto_profano', 'custodio del invernador': 'custodio_invernadero',
    'heraldo de la flor negra': 'heraldo_flor_negra',
    'el jardinero enterrado': 'jardinero_enterrado', 'la gran madre micelio': 'gran_madre_micelio',
    'el ciervo cementerio': 'ciervo_cementerio', 'la novia de las raices': 'novia_raices',
    'el arbol de los juramentos': 'arbol_juramentos', 'la bestia del invernadero': 'bestia_invernadero',
    'el sepultero de savia': 'sepulturero_savia', 'la flor de las mil voces': 'flor_mil_voces',
    'el ultimo jardinero': 'ultimo_jardinero',
    'corazon marchito primera fase': 'corazon_marchito', 'corazon marchito segunda fase': 'corazon_marchito_f2',
    'corazon marchito tercera fase': 'corazon_marchito_f3',
    # Abismo en llamas (81-90): por ahora solo retratos (animaciones pendientes). Nombres tal como los subió ariochbu.
    'diablillo llavero': 'diablillo_llavero', 'carcelero de ceniza': 'carcelero_ceniza', 'perro de grillete': 'perro_grillete',
    'marcador': 'marcador', 'fogonero': 'fogonero', 'arpia de hollin': 'arpia_hollin', 'escriba de condenas': 'escriba_condenas',
    'preso calcinado': 'preso_calcinado', 'verdugo de brasa': 'verdugo_brasa', 'alcaide menor': 'alcaide_menor',
    'forjador de cadenas': 'forjador_cadenas', 'la puerta de hierro vivo': 'puerta_hierro_vivo',
    'el contador de cadenas': 'contador_condenas', 'el contador de condenas': 'contador_condenas',
    'la sabuesa de tres collares': 'sabuesa_tres_collares', 'el fundidor': 'el_fundidor', 'la dama del grillete': 'dama_grillete',
    'el testigo ciego': 'testigo_ciego', 'el horno que camina': 'horno_camina', 'el porta llaves': 'portallaves', 'el portallaves': 'portallaves',
    'el segundo carcelero': 'segundo_carcelero',
    'carcelero primera fase': 'carcelero', 'el carcelero primera fase': 'carcelero', 'el carcelero segunda fase': 'carcelero_f2',
    'el carcelero tercera forma': 'carcelero_f3', 'el carcelero tercera fase': 'carcelero_f3',
}
# Sin nombre (identificados a ojo, comparando con el sprite que ya tenía cada uno).
ENEMIGO_POR_ARCHIVO = {
    # goblins (1-10)
    'yonxu8': 'goblin_arquero', '334dlc': 'goblin_chaman', 'b6y16r': 'goblin_guerrero', 'm2qzhq': 'goblin_saqueador',
    'uvd593': 'jefe_goblin', 's675p0': 'ogro',
    # impostores (31-40)
    'lz8eev': 'doble_corrupto', '6an4rq': 'doble_corrupto', '2cvtz1': 'doble_perfecto', 'vteg3c': 'doble_perfecto',
    'i9s44x': 'espejo_viviente', '66sie7': 'espejo_viviente', '3hwv1c': 'farsante_menor', 'iby4em': 'farsante_menor',
    '9psqyo': 'impostor_mayor', 'a5v8tk': 'impostor_mayor', 'i5w7ci': 'reflejo_perfecto_g', 'skk6ro': 'reflejo_perfecto_g',
    'a8xiyk': 'mascara_viviente_g', 'wfetbk': 'mascara_viviente_g', '45l6r8': 'espejo_sombras', '7sbp2f': 'espejo_sombras',
    'mi2p07': 'doble_traicionero', 'cbcg3g': 'doble_traicionero', 'jn7igb': 'imitador_formacion', 'fvwtde': 'imitador_formacion',
    'ikozkq': 'falso_companero', 'octp9m': 'falso_companero', 'k78soy': 'maestro_reflejo', 's8prk5': 'maestro_reflejo',
    'ntxgtz': 'maestro_rostros', 'ety243': 'maestro_rostros', 'cesh9a': 'usurpador_fragmentado', 'f1fn0f': 'usurpador_fragmentado',
    'ongaij': 'usurpador', 'u528fs': 'usurpador', 'srkgtu': 'usurpador_f2', '5o6gpk': 'usurpador_f2',
    'xjanzy': 'usurpador_f3', '7ce365': 'usurpador_f3', 'he3ndg': 'usurpador_f4', 'oyxkq2': 'usurpador_f4',
    '3tswl7': 'sombra_mimetica', '40h3wl': 'sombra_mimetica',
}

# Todas las tiras se guardan mirando a la DERECHA (el combate espeja al bando
# enemigo). Acá van las que el generador dibujó mirando a la IZQUIERDA: se
# espejan al importar. Revisar con --review cada vez que llegue arte nuevo.
# (lista revisada a ojo el 2026-10-07 con las láminas nuevas de las décadas 1-60)
MIRA_IZQUIERDA = {'enemigo_' + n for n in (
    'saltadora_alfa', 'alfa_manada', 'arana_caparazon', 'bestia_carmesi', 'buitre_corrupto', 'campeon_triton', 'cangrejo_gigante',
    'centinela_coral_g', 'devoradora_nido', 'doble_perfecto', 'duelista_veterano', 'garvel', 'goblin_chaman',
    'goblin_guerrero', 'gran_cangrejo_abisal', 'gran_lobo_hoja', 'gran_tejedora', 'guardia_profundidades',
    'guardian_abismo', 'halcon_guerra', 'heraldo_tormenta', 'jabali_hierro', 'jefe_goblin', 'leviatan_abisal',
    'loba_acantilado', 'lobo_quimera', 'maestro_reflejo', 'matriarca_abisal', 'matriarca_escarlata',
    'matriarca_telaranha', 'naga_arquero', 'naga_capitan', 'naga_maestro', 'ogro', 'oso_acorazado', 'oso_cuevas',
    'oso_roca_lunar', 'reina_devoradora', 'reina_telaranha', 'rey_manada', 'riakis', 'sacerdotisa_mareas',
    'serpiente_palpus', 'sirena_corrupta', 'storm_gush', 'storm_gush_final', 'tarantula_cazadora',
    'tarantula_saltarina', 'tarantula_tejedora', 'tigre_sable', 'triton_guerrero', 'triton_hechicero', 'usurpador_f2',
    'usurpador_f3', 'usurpador_f4', 'viuda_alfa', 'viuda_carmesi', 'viuda_venenosa',
    # La Grieta (61-70): todo el lote vino mirando a la izquierda
    'hambre_colores', 'acaro_umbral', 'ancla_vacio', 'boca_peregrina', 'ciempies_especular', 'ciervo_torcido', 'coro_hueco',
    'eco_heredado', 'el_inversor', 'geometra_ciega', 'la_costura', 'larva_fase', 'marea_seca', 'ojo_reflujo',
    'pastor_errores', 'puerta_camina', 'quimera_disonante', 'recuerdo_mal_nacido', 'rey_articulaciones',
    'sabueso_invertido', 'sin_forma', 'sin_forma_f2', 'sin_forma_f3', 'vigilante_descosido',
    # Bosque muerto (71-80), revisado a ojo el 2026-10-08. Miran a la derecha y no van acá:
    # raiz_desenterrada, semilla_doliente, jardinero_enterrado, corazon_marchito (fase 1)
    'jardinero_hueco', 'ciervo_sepulcral', 'polilla_funeraria', 'hongo_osario', 'enredadera_viuda', 'cuervo_savia',
    'brote_carronero', 'caracol_tumba', 'espantapajaros_raigal', 'mantis_poda', 'madre_micelio', 'injerto_profano',
    'custodio_invernadero', 'heraldo_flor_negra', 'gran_madre_micelio', 'ciervo_cementerio', 'novia_raices',
    'arbol_juramentos', 'bestia_invernadero', 'sepulturero_savia', 'flor_mil_voces', 'ultimo_jardinero',
    'corazon_marchito_f2', 'corazon_marchito_f3',
)} | {
    # jugadores y aliados: se mira hacia dónde lanzan el ataque
    'doblefilo_barbaro', 'paladin_barbaro', 'tirador_barbaro', 'hechicero_bestia', 'paladin_bestia', 'pesada_bestia',
    'tirador_bestia', 'doblefilo_draconido', 'paladin_draconido', 'doblefilo_enano', 'paladin_enano', 'pesada_enano',
    'tirador_enano', 'doblefilo_hada', 'paladin_hada', 'pesada_hada', 'tirador_hada', 'paladin_humano',
    'tirador_humano', 'aliado_aldric', 'aliado_delyth', 'aliado_eira', 'aliado_fennwick', 'aliado_kael',
    'aliado_lyra', 'aliado_neira', 'aliado_vex',
}
# Retratos de monstruos: quedan mirando a la IZQUIERDA (hacia el grupo). Acá
# los que llegaron mirando a la derecha.
RETRATO_MIRA_DERECHA = {
    'asesino_elite_isla', 'capitan_mercenario', 'cazador_veterano', 'cazarrecompensas', 'doble_corrupto',
    'doble_traicionero', 'espejo_sombras', 'farsante_menor', 'falso_companero', 'gilgoblin', 'goblin_arquero',
    'goblin_chaman', 'goblin_guerrero', 'hobgoblin', 'imitador_formacion', 'impostor_mayor', 'lince_sombrio',
    'maestro_rostros', 'medico_campana', 'mercenario_desertor', 'reflejo_perfecto_g', 'sirena_matriarca',
    'superviviente_despiadado', 'usurpador_fragmentado',
}


# Sprites de viaje para el laberinto (Assets/Jugador/caminar): uno por raza,
# 2 filas (quieto, caminando). Salen como caminar_<raza>.png con "walk" en el
# índice. Se reconocen por el id corto o porque el nombre del archivo trae la raza.
CAMINAR_POR_ARCHIVO = {'ze5y2w': 'barbaro', 'fuuwe0': 'draconido', 'feeff9': 'enano', 'a61nez': 'hada', '2kpos3': 'bestia', 'gu0bu3': 'humano'}
# Íconos sueltos de las salas (Assets/Laberinto): id corto -> nombre. Salen en
# src/assets/chibi/iconos/<nombre>.png, recortados y a 40px de alto.
ICONO_POR_ARCHIVO = {'maq23y': 'cofre', '8ba8a5': 'cofre_abierto', 'haqagx': 'hoguera'}


def walk_race(path):
    sid = short_id(path)
    if sid in CAMINAR_POR_ARCHIVO:
        return CAMINAR_POR_ARCHIVO[sid]
    for key, raza in sorted(RAZAS.items(), key=lambda kv: -len(kv[0])):
        if key in sid:
            return raza
    return None


def norm_name(path):
    """Nombre del archivo sin extensión, sin tildes, en minúsculas."""
    base = os.path.splitext(os.path.basename(path))[0]
    base = unicodedata.normalize('NFKD', base).encode('ascii', 'ignore').decode().lower()
    return ' '.join(base.split())


def enemy_id(path):
    if 'Image_' in os.path.basename(path):
        return ENEMIGO_POR_ARCHIVO.get(short_id(path))
    n = norm_name(path)
    for suf in (' mob', ' full'):
        if n.endswith(suf):
            n = n[:-len(suf)]
    return ENEMIGO_POR_NOMBRE.get(n)


def player_senda(path, raza):
    if 'Image_' in os.path.basename(path):
        return SENDA_POR_ARCHIVO.get(short_id(path))
    n = norm_name(path)
    if (raza, n) in SENDA_POR_NOMBRE:
        return SENDA_POR_NOMBRE[(raza, n)]
    for word, senda in SENDA_POR_PALABRA:
        if word in n:
            return senda
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
    # Líneas de cuadrícula y franjas de suelo: tramos rectos y largos que
    # ningún personaje tiene. Se tratan como fondo. En un retrato (una sola
    # figura grande) no hay nada de eso y sí hay tramos largos legítimos.
    if lines and big_figure(~cand):
        lines = False
    if chroma:
        # Sobre croma, todo lo que no es fondo y cruza la lámina casi entera
        # (línea clara u oscura, o un suelo de ladrillo bajo los pies). Se borra
        # el tramo y un par de píxeles a cada lado, que quedan teñidos.
        solid = ~cand
        for arr, lim, target in ((solid, 0.75 * w, cand), (solid.T, 0.75 * h, cand.T)):
            hit = np.zeros(arr.shape, dtype=bool)
            for i in np.nonzero(arr.sum(axis=1) >= lim)[0]:
                for x0, x1 in runs(arr[i], 3):
                    if x1 - x0 >= lim:
                        hit[max(0, i - 2):i + 3, x0:x1] = True
            if lines:
                target |= hit
        # Suelo de ladrillo que solo abarca una parte de la fila: tramo largo y casi todo gris.
        lowsat_t = (mx - mn) < 40
        hit = np.zeros(solid.shape, dtype=bool)
        for i in np.nonzero(solid.sum(axis=1) >= 0.25 * w)[0]:
            for x0, x1 in runs(solid[i], 3):
                # (gris y parejo: un lobo gris también es "gris", pero con luces y sombras)
                if x1 - x0 >= 0.25 * w and lowsat_t[i, x0:x1].mean() > 0.85 and mx[i, x0:x1].std() < 20:
                    hit[max(0, i - 2):i + 3, x0:x1] = True
        if lines:
            cand |= hit
    else:
        dark = ((mx - mn) < 30) & ~cand
        frac = 0.25 if lines else 9  # íconos sueltos: no hay cuadrícula que quitar
        for arr, lim in ((dark, frac * w), (dark.T, frac * h)):
            target = cand if arr is dark else cand.T
            for i in range(arr.shape[0]):
                for x0, x1 in runs(arr[i], 1):
                    if x1 - x0 >= lim:
                        target[i, x0:x1] = True
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


def big_figure(solid):
    """True si el dibujo llena más de media imagen de alto de un tirón: es un
    retrato. En una lámina, entre fila y fila casi no hay nada."""
    h, w = solid.shape
    dense = solid.sum(axis=1) > 0.15 * w
    return any(b - a > 0.5 * h for a, b in runs(dense, 5))


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


def find_frames_walk(alpha, relaxed=False, nrows=4):
    """Láminas de caminar (2 filas). Lista de filas; cada fila es una lista de cajas (x0, y0, x1, y1)."""
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


def row_bands(alpha):
    """Franjas horizontales con dibujo. El umbral ignora restos de líneas de cuadrícula."""
    w = alpha.shape[1]
    bands = runs(alpha.sum(axis=1) > max(2, 0.012 * w), 5)
    if bands:
        med = np.median([b - a for a, b in bands])
        bands = [(a, b) for a, b in bands if (b - a) >= 0.35 * med]
    return bands


def find_frames(alpha, relaxed=False, nrows=4):
    """Lista de 4 filas; cada fila es una lista de cajas (x0, y0, x1, y1).

    Las láminas vienen en una cuadrícula de 6 columnas (reposo 4, ataque 6,
    golpe 2, muerte 4-5), pero a menudo un cuadro toca al de al lado (una cola,
    un tridente, un tajo). El paso de la cuadrícula dice en cuántos cuadros
    partir cada bloque pegado."""
    if nrows != 4:
        return find_frames_walk(alpha, relaxed, nrows)
    h, w = alpha.shape
    bands = row_bands(alpha)
    if len(bands) != nrows:  # filas pegadas o sobrantes: se parte en partes iguales
        bands = [(round(i * h / nrows), round((i + 1) * h / nrows)) for i in range(nrows)]

    def box(a, b, x0, x1):
        sub = alpha[a:b, x0:x1]
        ys = np.nonzero(sub.sum(axis=1) > 1)[0]
        xs = np.nonzero(sub.sum(axis=0) > 1)[0]
        if not ys.size or not xs.size:
            return None
        return (x0 + int(xs[0]), a + int(ys[0]), x0 + int(xs[-1]) + 1, a + int(ys[-1]) + 1, int(sub.sum()))

    raw = []
    for a, b in bands:
        segs = runs(alpha[a:b].sum(axis=0) > 3, 4)
        raw.append([bx for bx in (box(a, b, x0, x1) for x0, x1 in segs) if bx])
    # Paso de la cuadrícula: distancia entre cuadros sueltos vecinos; si no hay, ancho/6.
    p0 = w / 6
    gaps = []
    for boxes in raw:
        single = [bx for bx in boxes if (bx[2] - bx[0]) < 1.3 * p0 and (bx[3] - bx[1]) > 0.3 * (bands[0][1] - bands[0][0])]
        cs = [(bx[0] + bx[2]) / 2 for bx in single]
        gaps += [d for d in np.diff(cs) if 0.6 * p0 <= d <= 1.4 * p0]
    pitch = float(np.median(gaps)) if len(gaps) >= 3 else p0
    rows = []
    for (a, b), boxes in zip(bands, raw):
        out = []
        for bx in boxes:
            width = bx[2] - bx[0]
            n = int(round(width / pitch))
            if width > 1.45 * pitch and n >= 2:
                # Bloque de varios cuadros pegados: se corta por los valles de la
                # silueta, cerca de donde la cuadrícula dice que cambia de celda.
                proj = alpha[a:b, bx[0]:bx[2]].sum(axis=0)
                cuts = [0]
                for k in range(1, n):
                    c = int(k * width / n); r = int(pitch * 0.3)
                    lo, hi = max(cuts[-1] + 1, c - r), min(width - 1, c + r)
                    cuts.append(lo + int(np.argmin(proj[lo:hi])) if hi > lo else c)
                cuts.append(width)
                out.extend(q for q in (box(a, b, bx[0] + cuts[i], bx[0] + cuts[i + 1]) for i in range(n)) if q)
            else:
                out.append(bx)
        rows.append(out)
    if not rows[0]:
        return [[] for _ in bands]
    # Restos sueltos (chispa, flecha, daga caída): mucho más chicos que el cuerpo en reposo.
    ref_area = float(np.median([bx[4] for bx in rows[0]]))
    return [[bx[:4] for bx in line if bx[4] >= 0.25 * ref_area] for line in rows]


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
    meta = {'cw': cw, 'ch': ch, 'bh': BODY_H, 'frames': [len(line) for line in frames]}
    if walk:
        meta['walk'] = True
    return sheet, meta


def race_folders():
    for d in sorted(glob.glob(os.path.join(SRC, '*chibi'))):
        key = os.path.basename(d).lower().replace(' chibi', '')
        yield d, RAZAS[key]


def is_portrait(alpha):
    """Una sola figura grande (retrato) en vez de una lámina de 4 filas."""
    return big_figure(alpha)


def save_small(im, path):
    """PNG con paleta (256 colores, alfa incluido): un tercio del peso."""
    im.quantize(256, method=Image.Quantize.FASTOCTREE, dither=Image.Dither.NONE).save(path, optimize=True)


def cut_portrait(im, alpha, max_side, flip=False):
    rgba = np.dstack([np.asarray(im.convert('RGB')), (alpha * 255).astype(np.uint8)])
    pic = Image.fromarray(rgba, 'RGBA')
    # solo la figura principal: se descartan motas sueltas lejos del cuerpo
    ys, xs = np.nonzero(alpha)
    pic = pic.crop((int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1))
    if flip:
        pic = pic.transpose(Image.FLIP_LEFT_RIGHT)
    k = max_side / max(pic.size)
    if k < 1:
        pic = pic.resize((max(1, round(pic.width * k)), max(1, round(pic.height * k))), Image.LANCZOS)
        pic.putalpha(pic.getchannel('A').point(lambda v: 255 if v >= 128 else 0))
    return pic


def collect_jobs():
    """(archivo, nombre de tira, tipo) de todo lo que está mapeado."""
    jobs = []
    for d, raza in race_folders():
        for f in sorted(glob.glob(d + '/*')):
            senda = player_senda(f, raza)
            if senda:
                jobs.append((f, f'{senda}_{raza}', 'jugador'))
    for f in sorted(glob.glob('Assets/Aliados/chibi/*')):
        tid = ALIADO_POR_ARCHIVO.get(short_id(f)) if 'Image_' in os.path.basename(f) else ALIADO_POR_NOMBRE.get(norm_name(f))
        if tid:
            jobs.append((f, 'aliado_' + tid, 'aliado'))
    for f in sorted(glob.glob('Assets/Sprites mobs/*/*/*')):
        if os.path.basename(os.path.dirname(f)).lower() == 'chibi' and enemy_id(f):
            jobs.append((f, 'enemigo_' + enemy_id(f), 'enemigo'))
    for f in sorted(glob.glob('Assets/Jugador/caminar/*')):
        if walk_race(f):
            jobs.append((f, 'caminar_' + walk_race(f), 'caminar'))
    return jobs


def review(dest):
    """Hojas de contacto: primer cuadro de reposo y uno de ataque de cada tira,
    y cada retrato de monstruo. Las tiras deben mirar a la DERECHA; los
    retratos de monstruos, a la IZQUIERDA."""
    os.makedirs(dest, exist_ok=True)
    index = json.load(open(os.path.join(OUT, 'index.json'), encoding='utf-8'))
    groups = {}
    for name in sorted(index):
        groups.setdefault(name.split('_')[0] if name.startswith(('enemigo', 'aliado', 'caminar')) else 'jugador', []).append(name)
    tw, th, cols = 213, 190, 6
    for g, names in groups.items():
        for page in range(0, len(names), 36):
            part = names[page:page + 36]
            sheet = Image.new('RGB', (tw * cols, th * ((len(part) + cols - 1) // cols)), (58, 58, 78))
            draw = ImageDraw.Draw(sheet)
            for i, name in enumerate(part):
                meta, im = index[name], Image.open(os.path.join(OUT, name + '.png')).convert('RGBA')
                x, y = (i % cols) * tw, (i // cols) * th
                cell = im.crop((0, 0, meta['cw'], meta['ch']))
                cell = cell.crop(cell.getbbox())
                k = min((tw - 6) / cell.width, (th - 20) / cell.height)
                cell = cell.resize((max(1, int(cell.width * k)), max(1, int(cell.height * k))), Image.LANCZOS)
                sheet.paste(cell, (x + (tw - cell.width) // 2, y + th - cell.height - 2), cell)
                draw.text((x + 3, y + 2), name.replace('enemigo_', '').replace('aliado_', ''), fill=(255, 230, 90))
            sheet.save(os.path.join(dest, f'tiras_{g}_{page // 36}.png'))
    ids = sorted({j[1][8:] for j in collect_jobs() if j[2] == 'enemigo'})
    ids = [i for i in ids if os.path.exists(os.path.join(OUT_ENEMIGOS, i + '.png'))]
    tw = 160
    for page in range(0, len(ids), 48):
        part = ids[page:page + 48]
        sheet = Image.new('RGB', (tw * 8, (tw + 14) * ((len(part) + 7) // 8)), (58, 58, 78))
        draw = ImageDraw.Draw(sheet)
        for i, eid in enumerate(part):
            im = Image.open(os.path.join(OUT_ENEMIGOS, eid + '.png')).convert('RGBA')
            im.thumbnail((tw - 4, tw - 4))
            x, y = (i % 8) * tw, (i // 8) * (tw + 14)
            sheet.paste(im, (x + 2, y + 14), im)
            draw.text((x + 3, y + 1), eid, fill=(255, 230, 90))
        sheet.save(os.path.join(dest, f'retratos_{page // 48}.png'))
    print('ok', dest)


def process(job):
    """Un archivo -> ('tira'|'retrato', nombre, archivo, imagen, meta)."""
    f, name, kind = job
    im = Image.open(f)
    alpha = remove_background(im)
    walk = kind == 'caminar'
    if not walk and is_portrait(alpha):
        if kind == 'enemigo':
            pic = cut_portrait(im, alpha, 320, flip=name[8:] in RETRATO_MIRA_DERECHA)
            side = max(pic.size)
            canvas = Image.new('RGBA', (side, side), (0, 0, 0, 0))   # cuadrado, pies abajo (así lo dibuja el combate)
            canvas.paste(pic, ((side - pic.width) // 2, side - pic.height))
            return 'retrato', name, f, canvas, None
        return 'retrato', name, f, cut_portrait(im, alpha, 520), None
    rows = find_frames(alpha, relaxed=kind == 'enemigo', nrows=2 if walk else 4)
    if any(not line for line in rows):
        return None, name, f, None, None
    sheet, meta = build_strip(im, alpha, rows, name in MIRA_IZQUIERDA, walk)
    return 'tira', name, f, sheet, meta


def main():
    if len(sys.argv) > 2 and sys.argv[1] == '--review':
        return review(sys.argv[2])
    os.makedirs(OUT, exist_ok=True)
    index = {}
    if os.path.exists(os.path.join(OUT, 'index.json')):
        index = json.load(open(os.path.join(OUT, 'index.json'), encoding='utf-8'))
    only = sys.argv[1] if len(sys.argv) > 1 else ''   # prefijos opcionales: solo esas tiras
    jobs = [j for j in collect_jobs() if any(j[1].startswith(o) for o in only.split(','))]
    jobs.sort(key=lambda j: -os.path.getmtime(j[0]))  # si dos archivos dan lo mismo, gana el más nuevo
    done = set()
    with multiprocessing.Pool(min(4, max(1, (os.cpu_count() or 2) - 1))) as pool:
        for what, name, f, pic, meta in pool.imap(process, jobs):
            if what is None or (what, name) in done:
                if what is None:
                    print('!! sin cuadros en alguna fila:', f)
                continue
            done.add((what, name))
            if what == 'tira':
                save_small(pic, os.path.join(OUT, name + '.png'))
                index[name] = meta
                print(name, meta, '<-', os.path.basename(f))
            elif name.startswith('enemigo_'):
                save_small(pic, os.path.join(OUT_ENEMIGOS, name[8:] + '.png'))
                print('retrato', name, '<-', os.path.basename(f))
            elif not name.startswith('aliado_'):
                save_small(pic, os.path.join(OUT_JUGADOR, name + '.png'))
                print('retrato', name, '<-', os.path.basename(f))
    if not only or only == 'iconos':
        dest = os.path.join(OUT, 'iconos')
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
