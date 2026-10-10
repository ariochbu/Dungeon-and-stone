// Iconos propios del juego (2026-10-10, pedido de ariochbu: "estos tipos de iconos deseo desaparecerlos,
// TODOS"). Los emojis se veían distintos en cada teléfono y rompían el estilo. Aquí vive un juego de
// iconos de línea (SVG, heredan el color del texto) y dos formas de usarlos:
//   · En el DOM: installIconizer() vigila la página y cambia cada emoji que aparezca por su icono; el que
//     no tiene icono asignado se quita. Así no queda ninguno aunque venga de un dato o de un registro.
//   · En los lienzos (combate, laberinto): drawIcon(ctx, nombre, x, y, tamaño, color).

// Trazos sobre una cuadrícula de 24x24. '|' separa trazos; un trazo que empieza por '@' va relleno.
const P = {
  sword: 'M20 4L9 15|M6 12l6 6|M8 16l-4 4',
  swords: 'M4 4l12 12|M20 4L8 16|M14 18l4-4|M6 14l4 4|M4 20l3-3|M20 20l-3-3',
  shield: 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z',
  bow: 'M6 3c8 2 8 16 0 18|M6 3v18|M3 12h17|M17 9l3 3-3 3',
  dagger: 'M12 2l3 9H9z|M7 11h10|M12 11v8|M10 21h4',
  axe: 'M6 21L15 6|M11 5c3-3 8-1 8 4-2 1-5 1-7-1z',
  wand: 'M5 21L15 9|M17 3l1.2 2.8L21 7l-2.8 1.2L17 11l-1.2-2.8L13 7l2.8-1.2z',
  skull: 'M12 3a8 8 0 0 0-5 14v3h10v-3a8 8 0 0 0-5-14z|@M8 11.5a1.5 1.5 0 1 0 3 0 1.5 1.5 0 1 0-3 0|@M13 11.5a1.5 1.5 0 1 0 3 0 1.5 1.5 0 1 0-3 0|M10 20v-2|M14 20v-2',
  heart: 'M12 20s-7-4.5-7-10a4 4 0 0 1 7-2 4 4 0 0 1 7 2c0 5.5-7 10-7 10z',
  coin: 'M4 12a8 8 0 1 0 16 0 8 8 0 1 0-16 0|M8.5 12a3.5 3.5 0 1 0 7 0 3.5 3.5 0 1 0-7 0',
  gem: 'M6 4h12l4 6-10 11L2 10z|M2 10h20|M9 4l3 6 3-6',
  star: 'M12 3l2.7 5.8 6.3.8-4.6 4.4 1.2 6.3L12 17.3 6.4 20.3l1.2-6.3L3 9.6l6.3-.8z',
  potion: 'M9 3h6|M10 3v5l-5 9a3 3 0 0 0 3 4h8a3 3 0 0 0 3-4l-5-9V3|M7 15h10',
  book: 'M5 4h13v16H5z|M9 4v16|M12 8h3',
  scroll: 'M7 4h11a2 2 0 0 1 2 2v1h-4|M7 4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h9a2 2 0 0 0 2-2V7|M9 9h5|M9 13h5',
  key: 'M4 8a4 4 0 1 0 8 0 4 4 0 1 0-8 0|M11 11l9 9|M17 17l2-2|M14 14l2-2',
  chest: 'M3 10a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4v9H3z|M3 12h18|M12 11v3',
  fire: 'M12 3c1 4 5 5 5 10a5 5 0 0 1-10 0c0-2 1-3 2-4 0 2 1 3 2 3 0-3-1-5 1-9z',
  snow: 'M12 3v18|M4.2 7.5l15.6 9|M19.8 7.5l-15.6 9',
  drop: 'M12 3c4 5 6 8 6 11a6 6 0 0 1-12 0c0-3 2-6 6-11z',
  bolt: 'M13 2L5 13h6l-1 9 8-11h-6z',
  eye: 'M2 12s4-6 10-6 10 6 10 6-4 6-10 6S2 12 2 12z|M9.5 12a2.5 2.5 0 1 0 5 0 2.5 2.5 0 1 0-5 0',
  crown: 'M4 18h16|M4 18L3 8l5 4 4-7 4 7 5-4-1 10',
  gear: 'M9 12a3 3 0 1 0 6 0 3 3 0 1 0-6 0|M12 3v3|M12 18v3|M3 12h3|M18 12h3|M5.6 5.6l2.1 2.1|M16.3 16.3l2.1 2.1|M5.6 18.4l2.1-2.1|M16.3 7.7l2.1-2.1',
  question: 'M3 12a9 9 0 1 0 18 0 9 9 0 1 0-18 0|M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.4-1 1-1 1.7|M12 17v.01',
  sound: 'M4 9v6h4l5 4V5L8 9z|M16 9a4 4 0 0 1 0 6|M18.5 6.5a8 8 0 0 1 0 11',
  mute: 'M4 9v6h4l5 4V5L8 9z|M16 9l5 6|M21 9l-5 6',
  people: 'M6 8a3 3 0 1 0 6 0 3 3 0 1 0-6 0|M3 20a6 6 0 0 1 12 0|M14.5 9a2.5 2.5 0 1 0 5 0 2.5 2.5 0 1 0-5 0|M15 20a5 5 0 0 1 6-4',
  person: 'M8.5 8a3.5 3.5 0 1 0 7 0 3.5 3.5 0 1 0-7 0|M5 21a7 7 0 0 1 14 0',
  home: 'M3 11l9-8 9 8|M5 10v10h14V10|M10 20v-6h4v6',
  bag: 'M5 8h14l-1 13H6z|M9 8V6a3 3 0 0 1 6 0v2',
  mug: 'M5 6h10v12a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2z|M15 9h2a2 2 0 0 1 2 2v2a2 2 0 0 1-2 2h-2',
  tree: 'M12 21v-7|M12 3l6 7h-3l4 5H5l4-5H6z',
  calendar: 'M4 6h16v15H4z|M4 10h16|M8 3v4|M16 3v4',
  trophy: 'M7 4h10v5a5 5 0 0 1-10 0z|M7 6H4a3 3 0 0 0 3 4|M17 6h3a3 3 0 0 1-3 4|M12 14v4|M8 21h8',
  map: 'M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2z|M9 4v14|M15 6v14',
  medal: 'M7 15a5 5 0 1 0 10 0 5 5 0 1 0-10 0|M8 3l4 7 4-7',
  lock: 'M6 11h12v10H6z|M8 11V8a4 4 0 0 1 8 0v3',
  warning: 'M12 3l10 18H2z|M12 10v5|M12 18v.01',
  check: 'M4 12l5 5L20 6',
  cross: 'M5 5l14 14|M19 5L5 19',
  paw: 'M8 18c0-3 2-5 4-5s4 2 4 5c0 2-2 2-4 2s-4 0-4-2z|@M4.4 10a1.6 1.6 0 1 0 3.2 0 1.6 1.6 0 1 0-3.2 0|@M8.4 6a1.6 1.6 0 1 0 3.2 0 1.6 1.6 0 1 0-3.2 0|@M12.4 6a1.6 1.6 0 1 0 3.2 0 1.6 1.6 0 1 0-3.2 0|@M16.4 10a1.6 1.6 0 1 0 3.2 0 1.6 1.6 0 1 0-3.2 0',
  mask: 'M4 5h16v6a8 8 0 0 1-16 0z|M8 10h2|M14 10h2|M9 14c2 1.5 4 1.5 6 0',
  mirror: 'M7 10a5 7 0 1 0 10 0 5 7 0 1 0-10 0|M12 17v4|M9 21h6',
  moon: 'M20 14A8 8 0 1 1 10 4a6 6 0 0 0 10 10z',
  gift: 'M4 10h16v10H4z|M3 7h18v3H3z|M12 7v13|M12 7c-2-4-6-3-5 0|M12 7c2-4 6-3 5 0',
  target: 'M3 12a9 9 0 1 0 18 0 9 9 0 1 0-18 0|M7 12a5 5 0 1 0 10 0 5 5 0 1 0-10 0|M12 12v.01',
  card: 'M6 3h12v18H6z|M12 8l1.2 2.6 2.8.3-2 2 .5 2.8L12 14.4 9.5 15.7l.5-2.8-2-2 2.8-.3z',
  hammer: 'M14 4l6 6|M17 7L6 18l-2-2L15 5|M4 8l4-4',
  chain: 'M9 6a3 3 0 0 1 6 0v3a3 3 0 0 1-6 0z|M9 15a3 3 0 0 1 6 0v3a3 3 0 0 1-6 0z|M12 10v4',
  up: 'M12 19V5|M6 11l6-6 6 6',
  down: 'M12 5v14|M6 13l6 6 6-6',
  door: 'M6 21V4h12v17|M4 21h16|M14 12v.01',
  music: 'M9 18V5l11-2v13|M5 18a2 2 0 1 0 4 0 2 2 0 1 0-4 0|M16 16a2 2 0 1 0 4 0 2 2 0 1 0-4 0',
  city: 'M3 21V9l5-3v15|M8 21V4l8 3v14|M16 21v-9l5 2v7|M2 21h20',
  cap: 'M2 9l10-5 10 5-10 5z|M6 11v5c3 3 9 3 12 0v-5|M22 9v6',
  trash: 'M5 7h14|M9 7V4h6v3|M7 7l1 14h8l1-14',
  chat: 'M4 5h16v11H10l-4 4v-4H4z',
  spiral: 'M12 12a2 2 0 1 1 2 2 4 4 0 1 1-4-4 6 6 0 1 1 6 6',
  bubble: 'M12 4c-5 0-8 3-8 7s3 7 8 7 8-3 8-7-3-7-8-7z',
  dizzy: 'M12 3l1.5 5.5L19 7l-3.5 4.5L21 14l-5.5 1L17 21l-5-3-5 3 1.5-6L3 14l5.5-2.5L5 7l5.5 1.5z',
  brick: 'M3 6h18v12H3z|M3 12h18|M9 6v6|M15 12v6',
  wind: 'M3 9h11a3 3 0 1 0-3-3|M3 14h15a3 3 0 1 1-3 3|M3 19h6',
  portal: 'M5 21V11a7 7 0 0 1 14 0v10|M3 21h18|M12 13a1.5 1.5 0 1 1 1.5 1.5 3 3 0 1 1-3-3 4.5 4.5 0 0 1 4.5 4.5',
  dice: 'M5 5h14v14H5z|@M8 9a1 1 0 1 0 2 0 1 1 0 1 0-2 0|@M14 9a1 1 0 1 0 2 0 1 1 0 1 0-2 0|@M11 12a1 1 0 1 0 2 0 1 1 0 1 0-2 0|@M8 15a1 1 0 1 0 2 0 1 1 0 1 0-2 0|@M14 15a1 1 0 1 0 2 0 1 1 0 1 0-2 0',
  boot: 'M9 3h5v9l5 3v4H7v-6z|M7 19h12',
};
export const ICON_NAMES = Object.keys(P);
function svgBody(name){
  return P[name].split('|').map(d=> d[0] === '@' ? `<path d="${d.slice(1)}" fill="currentColor" stroke="none"/>` : `<path d="${d}"/>`).join('');
}
export function iconSVG(name, color){
  if(!P[name]) return '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="${color || 'currentColor'}" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"${color ? ` color="${color}"` : ''}>${svgBody(name)}</svg>`;
}
// Para plantillas del juego: icon('sword') devuelve el <span> listo.
export function icon(name){ return P[name] ? `<span class="ic" data-ic="${name}">${iconSVG(name)}</span>` : ''; }

// Qué icono le toca a cada emoji que todavía aparece en textos y datos. Lo que no esté aquí se quita
// (las criaturas tienen su retrato; un emoji suelto junto al nombre no aporta nada).
const E = {
  sword: '🗡️ ⚔ 🔪 🤺', swords: '⚔️', shield: '🛡️ 🛡 🪖 🔰 🧥 🧤', bow: '🏹', axe: '🪓', wand: '🔮 🪄 ✨ 🧙',
  skull: '💀 ☠ ☠️ 👹 👺 🧟 👻 ⚰️', heart: '❤️ 🫀', coin: '⛁ 💰', gem: '💎 🔷 💠 📿', star: '★ ⭐ ✦ 🌟',
  potion: '🧪 🍷 🥃', book: '📘 📖', scroll: '📜', key: '🗝️ 🔑', chest: '🧰', fire: '🔥 ♨️', snow: '❄️', drop: '🩸 💧 ☣️ 🦠',
  bolt: '⚡ 💥', eye: '👁️ 🔭', crown: '👑 ♛', gear: '⚙️ 🛠️', question: '❓ ❕ ❗', sound: '🔊', mute: '🔇 🤐', people: '👥 🪑',
  person: '🧝 👤 🧑 🧍', home: '🏠 🏚️ 🏚', bag: '🎒 🛒', mug: '🍺', tree: '🌳 🌿 🌱 🌾', calendar: '📅', trophy: '🏆 🥇 🥈 🥉',
  map: '🗺️', medal: '🎖️', lock: '🔒', warning: '⚠', check: '✓ ✔', cross: '✕ ✖', paw: '🐾 🐺 🐕', mask: '🎭',
  mirror: '🪞', moon: '🌑', gift: '🎁', target: '🎯', card: '🎴', hammer: '⚒️ 🔨 ⛏️', chain: '⛓️ ⛓', door: '🚪',
  music: '🎼 ♪ 🥁 📯 🎺', city: '🏙️ 🏰', cap: '🎓', trash: '🗑️', chat: '💬 🗣️ 📣', spiral: '🌀 🌪', up: '💪', down: '⬇ 📉',
  dizzy: '💫 💢', brick: '🧱', wind: '💨', bubble: '🫥',
  portal: '🕳️ 🕳', dice: '🎲', boot: '👢',
};
const EMOJI_TO_ICON = {};
Object.entries(E).forEach(([name, list])=> list.split(' ').forEach(e=>{ EMOJI_TO_ICON[e] = name; EMOJI_TO_ICON[e.replace(/️/g, '')] = name; }));
const EMOJI_RE = /(?:[\u{1F1E6}-\u{1F1FF}\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{2300}-\u{23FF}][️\u{1F3FB}-\u{1F3FF}]?(?:‍[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]️?)*)/gu;
export function iconForEmoji(e){ return EMOJI_TO_ICON[e] || EMOJI_TO_ICON[e.replace(/️/g, '')] || null; }
export function stripEmoji(text){ return String(text == null ? '' : text).replace(EMOJI_RE, '').replace(/\s{2,}/g, ' ').trim(); }

const SKIP = new Set(['SCRIPT', 'STYLE', 'TEXTAREA', 'INPUT', 'CANVAS', 'SVG']);
function fixTextNode(node){
  const text = node.nodeValue;
  if(!text || text.length < 1) return;
  EMOJI_RE.lastIndex = 0;
  if(!EMOJI_RE.test(text)) return;
  const parent = node.parentNode;
  if(!parent || SKIP.has(parent.nodeName) || (parent.closest && parent.closest('.ic'))) return;
  // en un <option> no caben elementos: ahí el emoji solo se quita
  if(parent.nodeName === 'OPTION' || parent.nodeName === 'TITLE'){ node.nodeValue = stripEmoji(text); return; }
  const frag = document.createDocumentFragment();
  let last = 0, dropped = false;
  text.replace(EMOJI_RE, (m, idx)=>{
    let before = text.slice(last, idx);
    if(dropped) before = before.replace(/^\s+/, ' ');
    if(before) frag.appendChild(document.createTextNode(before));
    const name = iconForEmoji(m);
    dropped = !name;
    if(name){ const span = document.createElement('span'); span.className = 'ic'; span.dataset.ic = name; span.innerHTML = iconSVG(name); frag.appendChild(span); }
    last = idx + m.length;
    return m;
  });
  let rest = text.slice(last);
  if(dropped) rest = rest.replace(/^\s+/, frag.childNodes.length ? ' ' : '');
  if(rest) frag.appendChild(document.createTextNode(rest));
  parent.replaceChild(frag, node);
}
function fixTree(root){
  if(root.nodeType === 3){ fixTextNode(root); return; }
  if(root.nodeType !== 1 || SKIP.has(root.nodeName) || root.classList.contains('ic')) return;
  ['title', 'placeholder', 'alt'].forEach(a=>{ const v = root.getAttribute && root.getAttribute(a); if(v){ EMOJI_RE.lastIndex = 0; if(EMOJI_RE.test(v)) root.setAttribute(a, stripEmoji(v)); } });
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
  const texts = [], els = [];
  for(let n = walker.nextNode(); n; n = walker.nextNode()){ if(n.nodeType === 3) texts.push(n); else els.push(n); }
  els.forEach(el=> ['title', 'placeholder', 'alt'].forEach(a=>{ const v = el.getAttribute(a); if(v){ EMOJI_RE.lastIndex = 0; if(EMOJI_RE.test(v)) el.setAttribute(a, stripEmoji(v)); } }));
  texts.forEach(fixTextNode);
}
let installed = false;
export function installIconizer(){
  if(installed || typeof MutationObserver === 'undefined') return;
  installed = true;
  fixTree(document.body);
  new MutationObserver((muts)=>{
    muts.forEach(m=>{
      if(m.type === 'characterData') fixTextNode(m.target);
      else m.addedNodes.forEach(fixTree);
    });
  }).observe(document.body, {childList: true, subtree: true, characterData: true});
}

// ---- Lienzos ----
const imgs = {};
function iconImage(name, color){
  const key = name + '|' + color;
  if(!imgs[key]){
    const im = new Image();
    im.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(iconSVG(name, color).replace('<svg ', '<svg width="48" height="48" '));
    imgs[key] = im;
  }
  return imgs[key];
}
// Dibuja el icono centrado en (x, y). Devuelve false si todavía no está cargado (o no existe).
export function drawIcon(ctx, name, x, y, size, color){
  if(!P[name]) return false;
  const im = iconImage(name, color || '#f1e3c4');
  if(!im.complete || !im.naturalWidth) return false;
  ctx.drawImage(im, x - size / 2, y - size / 2, size, size);
  return true;
}
export function preloadIcons(names, color){ names.forEach(n=> iconImage(n, color || '#f1e3c4')); }
