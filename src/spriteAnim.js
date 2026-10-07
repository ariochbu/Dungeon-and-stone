// Reproductor de tiras de sprites: lo usan el combate (battleStage.js) y el
// laberinto (labyrinthMap.js).
//
// Formato de la tira (ver tools/import_spritesheet.py): celdas iguales, una fila por estado.
//   fila 0 reposo · fila 1 ataque · fila 2 golpe recibido · fila 3 muerte
// El personaje mira a la DERECHA y apoya los pies en el borde inferior de la
// celda, centrado. Para el bando contrario se dibuja espejado (flip).

export const DEFAULT_SHEET = {
  cell: 64,
  states: {
    idle:   { row: 0, frames: 4, fps: 6,  loop: true },
    attack: { row: 1, frames: 6, fps: 12, loop: false, next: 'idle' },
    hurt:   { row: 2, frames: 2, fps: 8,  loop: false, next: 'idle' },
    death:  { row: 3, frames: 4, fps: 7,  loop: false }, // se queda en el último cuadro
  },
};

// Hoja de animación a partir de una entrada de assets/sprites/chibi/index.json
// ({cw, ch, bh, frames:[reposo, ataque, golpe, muerte]}, ver tools/import_chibi.py).
// bh = alto del cuerpo en reposo dentro de la tira. Las primeras medían 64; las
// de 2026-10-07 vienen a 128 para verse nítidas. `k` las lleva a la misma
// medida en pantalla, así quien dibuja no necesita saber cuál le tocó.
export const CHIBI_BODY = 64;
export function sheetFromMeta(meta){
  const k = CHIBI_BODY / (meta.bh || CHIBI_BODY);
  // Sprite de viaje del laberinto: fila 0 quieto, fila 1 caminando (en bucle).
  if(meta.walk) return { cw: meta.cw, ch: meta.ch, k, states: {
    idle: { row: 0, frames: meta.frames[0], fps: 6, loop: true },
    walk: { row: 1, frames: meta.frames[1], fps: 10, loop: true },
  } };
  const sheet = structuredClone(DEFAULT_SHEET);
  delete sheet.cell;
  sheet.cw = meta.cw; sheet.ch = meta.ch; sheet.k = k;
  ['idle','attack','hurt','death'].forEach((k, i)=>{ sheet.states[k].frames = meta.frames[i]; });
  return sheet;
}

export function loadImage(src){
  return new Promise((res, rej)=>{
    const img = new Image();
    img.onload = ()=> res(img);
    img.onerror = ()=> rej(new Error('No se pudo cargar ' + src));
    img.src = src;
  });
}

export class SpriteAnim {
  constructor(img, sheet = DEFAULT_SHEET){
    this.img = img;
    this.sheet = sheet;
    this.state = 'idle';
    this.t = 0;        // segundos dentro del estado actual
    this.speed = 1;
  }
  play(state){
    if(!this.sheet.states[state]) return;
    this.state = state;
    this.t = 0;
  }
  update(dt){
    const st = this.sheet.states[this.state];
    this.t += dt * this.speed;
    if(!st.loop && this.t * st.fps >= st.frames && st.next) this.play(st.next);
  }
  frameIndex(){
    const st = this.sheet.states[this.state];
    const i = Math.floor(this.t * st.fps);
    return st.loop ? i % st.frames : Math.min(st.frames - 1, i);
  }
  // Dibuja con los pies en (x, y). `scale` es respecto a un cuerpo de 64px.
  // Las tiras de 64 se agrandan sin suavizado (pixel art nítido); las de más
  // resolución se achican, y ahí el suavizado es lo que las deja limpias.
  draw(ctx, x, y, scale = 3, flip = false){
    const k = this.sheet.k || 1;
    scale *= k;
    const { states } = this.sheet;
    // Celda cuadrada (cell) o rectangular (cw x ch), según la tira.
    const cw = this.sheet.cw || this.sheet.cell, ch = this.sheet.ch || this.sheet.cell;
    const st = states[this.state];
    ctx.save();
    ctx.imageSmoothingEnabled = k < 1;
    if(k < 1) ctx.imageSmoothingQuality = 'high';
    ctx.translate(Math.round(x), Math.round(y));
    if(flip) ctx.scale(-1, 1);
    ctx.drawImage(this.img, this.frameIndex() * cw, st.row * ch, cw, ch, -cw * scale / 2, -ch * scale, cw * scale, ch * scale);
    ctx.restore();
  }
}
