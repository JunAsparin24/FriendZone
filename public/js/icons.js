// Hand-drawn SVG badge icons for every activity (activity bar, titles, world signs, minimap and
// the emblems on the 3D buildings). Each is a glossy rounded square with a white glyph.
const INK = '#1a1330';
const S = `stroke="${INK}" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"`;

function gear(cx, cy, r, teeth = 8) {
  let d = '';
  for (let i = 0; i < teeth * 2; i++) {
    const a0 = (i / (teeth * 2)) * Math.PI * 2, a1 = ((i + 1) / (teeth * 2)) * Math.PI * 2;
    const rr = i % 2 ? r * 0.78 : r;
    const p = (a) => `${(cx + Math.cos(a) * rr).toFixed(1)} ${(cy + Math.sin(a) * rr).toFixed(1)}`;
    d += `${i ? 'L' : 'M'}${p(a0 + 0.06)} L${p(a1 - 0.06)} `;
  }
  return `${d}Z`;
}

const GLYPHS = {
  racing: ['#ff7a6b', '#c9303f', `
    <path d="M6 22h9M4 29h8M7 36h6" stroke="#fff" stroke-width="3" stroke-linecap="round" opacity=".8"/>
    <path d="M13 41 L16 32 L27 29 L35 22 L47 22 L52 29 L58 31 L59 41 Z" fill="#fff" ${S}/>
    <path d="M32 29 L37 25 L45 25 L48 29 Z" fill="#7ec8ff" ${S} stroke-width="2"/>
    <path d="M52 31 L58 32" stroke="${INK}" stroke-width="2"/>
    <circle cx="22" cy="42" r="7" fill="#2b2f4a" ${S}/><circle cx="22" cy="42" r="2.5" fill="#fff"/>
    <circle cx="49" cy="42" r="7" fill="#2b2f4a" ${S}/><circle cx="49" cy="42" r="2.5" fill="#fff"/>
    <rect x="40" y="31" width="6" height="4" rx="1" fill="#ff5d5d"/>`],
  arena: ['#ffc46b', '#e0782a', ['-45', '45'].map((r) => `
    <g transform="rotate(${r} 32 32)">
      <path d="M29 8 L32 4 L35 8 L35 40 L29 40 Z" fill="#fff" ${S}/>
      <rect x="22" y="39" width="20" height="5" rx="2" fill="#ffd84d" ${S}/>
      <rect x="29.5" y="44" width="5" height="9" rx="1.5" fill="#8b5a2b" ${S}/>
      <circle cx="32" cy="56" r="3.5" fill="#ffd84d" ${S}/>
    </g>`).join('')],
  archery: ['#7ff0b0', '#2f9e6a', `
    <circle cx="28" cy="36" r="20" fill="#fff" ${S}/>
    <circle cx="28" cy="36" r="14" fill="#ff5d73" ${S} stroke-width="2.5"/>
    <circle cx="28" cy="36" r="8" fill="#fff" ${S} stroke-width="2.5"/>
    <circle cx="28" cy="36" r="3.5" fill="#ff5d73"/>
    <path d="M29 35 L52 12" stroke="${INK}" stroke-width="6" stroke-linecap="round"/>
    <path d="M29 35 L52 12" stroke="#c98a4a" stroke-width="3" stroke-linecap="round"/>
    <path d="M49 9 L57 7 L55 15 Z M45 13 L53 11 L51 19 Z" fill="#ffd84d" ${S} stroke-width="2"/>`],
  fishing: ['#5fd3ff', '#1f6fd0', `
    <circle cx="16" cy="16" r="3.5" fill="#fff" opacity=".85"/><circle cx="24" cy="10" r="2.2" fill="#fff" opacity=".85"/>
    <path d="M44 33 L57 23 L55 33 L57 43 Z" fill="#ffb347" ${S}/>
    <path d="M9 33 C15 20 36 18 46 33 C36 48 15 46 9 33 Z" fill="#ffd84d" ${S}/>
    <path d="M26 24 C30 22 33 22 36 24 L32 27 Z" fill="#ffb347" ${S} stroke-width="2"/>
    <path d="M27 40 C30 38 33 38 35 40" stroke="${INK}" stroke-width="2" fill="none"/>
    <circle cx="18" cy="31" r="3" fill="${INK}"/><circle cx="17" cy="30" r="1" fill="#fff"/>`],
  casino: ['#c99bff', '#6a3fb5', `
    <g transform="rotate(-14 22 30)"><rect x="8" y="16" width="27" height="27" rx="6" fill="#fff" ${S}/>
      <circle cx="15" cy="23" r="2.6" fill="#e0463c"/><circle cx="21.5" cy="29.5" r="2.6" fill="#e0463c"/><circle cx="28" cy="36" r="2.6" fill="#e0463c"/></g>
    <g transform="rotate(12 42 38)"><rect x="29" y="25" width="27" height="27" rx="6" fill="#fff" ${S}/>
      <circle cx="36" cy="32" r="2.6" fill="${INK}"/><circle cx="49" cy="32" r="2.6" fill="${INK}"/>
      <circle cx="36" cy="45" r="2.6" fill="${INK}"/><circle cx="49" cy="45" r="2.6" fill="${INK}"/><circle cx="42.5" cy="38.5" r="2.6" fill="${INK}"/></g>`],
  trading: ['#ffe27a', '#e0a020', `
    <circle cx="34" cy="36" r="19" fill="#d9a441" ${S}/>
    <circle cx="30" cy="32" r="19" fill="#ffe27a" ${S}/>
    <circle cx="30" cy="32" r="13" fill="none" stroke="#d9a441" stroke-width="2.5"/>
    <path d="M30 22 L33 29 L40 29 L34.5 33.5 L36.5 41 L30 36.5 L23.5 41 L25.5 33.5 L20 29 L27 29 Z" fill="#fff" ${S} stroke-width="2"/>
    <path d="M50 10 l2 5 5 2 -5 2 -2 5 -2 -5 -5 -2 5 -2 Z" fill="#fff"/>`],
  shop: ['#ffb3d9', '#e0468f', `
    <path d="M20 13 L27 11 C28.5 16 35.5 16 37 11 L44 13 L55 24 L48 32 L44 28 L44 53 L20 53 L20 28 L16 32 L9 24 Z" fill="#fff" ${S}/>
    <path d="M32 44 C27 40 24 37 24 34 C24 31 28 30 32 33 C36 30 40 31 40 34 C40 37 37 40 32 44 Z" fill="#ff5d8c"/>`],
  wardrobe: ['#5fe8d6', '#1a9e8e', `
    <path d="M32 22 C32 18 28 17 28 13.5 C28 9.5 36 9.5 36 13.5" fill="none" ${S}/>
    <path d="M32 22 L54 40 C56 42 55 46 52 46 L12 46 C9 46 8 42 10 40 Z" fill="#fff" ${S}/>
    <path d="M18 46 L20 55 L44 55 L46 46" fill="#ffd84d" ${S}/>`],
  boss: ['#9b8cff', '#3a2a8a', `
    <path d="M18 20 L12 6 L26 16 Z M46 20 L52 6 L38 16 Z" fill="#fff" ${S}/>
    <path d="M12 52 C8 30 16 15 32 15 C48 15 56 30 52 52 C46 49 42 55 37 51 C33 55 30 55 27 51 C22 55 18 49 12 52 Z" fill="#6ee77a" ${S}/>
    <circle cx="24" cy="30" r="6.5" fill="#fff" ${S} stroke-width="2.5"/><circle cx="40" cy="30" r="6.5" fill="#fff" ${S} stroke-width="2.5"/>
    <circle cx="25.5" cy="31" r="3" fill="${INK}"/><circle cx="38.5" cy="31" r="3" fill="${INK}"/>
    <path d="M20 22 L28 25 M44 22 L36 25" ${S}/>
    <path d="M21 40 C26 46 38 46 43 40 Z" fill="${INK}"/>
    <path d="M25 41 L27 44 L29 42 L32 45 L35 42 L37 44 L39 41 Z" fill="#fff"/>`],
  house: ['#ffc46b', '#ff7a3d', `
    <rect x="41" y="10" width="7" height="13" fill="#b5654a" ${S}/>
    <path d="M14 30 L14 54 L50 54 L50 30" fill="#fff" ${S}/>
    <path d="M7 32 L32 10 L57 32 Z" fill="#ff5d5d" ${S}/>
    <rect x="27" y="39" width="10" height="15" rx="2" fill="#8b5a2b" ${S}/>
    <path d="M20.5 43 C18 41 16.5 39.5 16.5 37.5 C16.5 35.5 19 35 20.5 37 C22 35 24.5 35.5 24.5 37.5 C24.5 39.5 23 41 20.5 43 Z" fill="#ff5d8c"/>
    <rect x="40" y="36" width="7" height="7" rx="1" fill="#7ec8ff" ${S} stroke-width="2"/>`],
  doodle: ['#fff08a', '#ff9f43', `
    <path d="M8 50 C14 40 20 56 27 46 S38 40 42 50" fill="none" stroke="#39c6ff" stroke-width="4" stroke-linecap="round"/>
    <g transform="rotate(45 34 28)">
      <rect x="28" y="4" width="12" height="36" rx="2" fill="#ffd84d" ${S}/>
      <rect x="28" y="4" width="12" height="7" rx="2" fill="#ff9fb4" ${S}/>
      <path d="M28 40 L34 51 L40 40 Z" fill="#f6c9a0" ${S}/>
      <path d="M32 47 L34 51 L36 47 Z" fill="${INK}"/>
    </g>`],
  arcade: ['#b77bff', '#5a2fd0', `
    <rect x="16" y="8" width="32" height="48" rx="4" fill="#fff" ${S}/>
    <rect x="20" y="13" width="24" height="17" rx="2" fill="#2b1f5e" ${S} stroke-width="2"/>
    <path d="M25 26 h3 v-3 h3 v3 h2 v-3 h3 v3 h3" stroke="#6ee7a0" stroke-width="2.5" fill="none"/>
    <circle cx="26" cy="41" r="4" fill="#ff5d73" ${S} stroke-width="2"/>
    <circle cx="38" cy="38" r="2.6" fill="#ffd84d" ${S} stroke-width="2"/><circle cx="41" cy="44" r="2.6" fill="#39c6ff" ${S} stroke-width="2"/>`],
  tavern: ['#ffc46b', '#b0662a', `
    <path d="M18 18 h22 v32 a4 4 0 0 1 -4 4 h-14 a4 4 0 0 1 -4 -4 Z" fill="#ffd84d" ${S}/>
    <path d="M40 24 h5 a5 5 0 0 1 5 5 v8 a5 5 0 0 1 -5 5 h-5" fill="none" ${S} stroke-width="3.5"/>
    <path d="M16 18 c0 -8 26 -8 26 0 c0 5 -6 3 -8 6 c-3 -3 -6 -1 -9 -3 c-3 2 -9 3 -9 -3 Z" fill="#fff" ${S}/>
    <path d="M24 30 v18 M31 30 v18" stroke="#e0a020" stroke-width="2.5" stroke-linecap="round"/>`],
  roulette: ['#5fdf8f', '#1f7a47', `
    <circle cx="32" cy="33" r="22" fill="#8b5a2b" ${S}/>
    <circle cx="32" cy="33" r="16" fill="none" stroke="#e0463c" stroke-width="10" stroke-dasharray="6.28 6.28"/>
    <circle cx="32" cy="33" r="16" fill="none" stroke="${INK}" stroke-width="10" stroke-dasharray="6.28 6.28" stroke-dashoffset="6.28"/>
    <circle cx="32" cy="33" r="9" fill="#ffd84d" ${S} stroke-width="2.5"/>
    <path d="M32 26 V40 M25 33 H39" stroke="${INK}" stroke-width="2"/>
    <circle cx="44" cy="18" r="3.5" fill="#fff" ${S} stroke-width="2"/>`],
  settings: ['#b8c3e8', '#5a6699', `
    <path d="${gear(32, 32, 22, 8)}" fill="#fff" ${S}/>
    <circle cx="32" cy="32" r="7" fill="#5a6699" ${S}/>`],
  music: ['#ff9fcf', '#b77bff', `
    <path d="M24 44 V16 L50 10 V38" fill="none" stroke="${INK}" stroke-width="9" stroke-linejoin="round"/>
    <path d="M24 44 V16 L50 10 V38" fill="none" stroke="#fff" stroke-width="4" stroke-linejoin="round"/>
    <ellipse cx="18" cy="46" rx="8" ry="6" fill="#fff" ${S}/><ellipse cx="44" cy="40" rx="8" ry="6" fill="#fff" ${S}/>`],
  pets: ['#ffb3d9', '#e0559b', `
    <ellipse cx="32" cy="41" rx="12" ry="10" fill="#fff" ${S}/>
    <ellipse cx="16" cy="29" rx="5.5" ry="6.5" fill="#fff" ${S} transform="rotate(-20 16 29)"/>
    <ellipse cx="25" cy="19" rx="5.5" ry="7" fill="#fff" ${S}/>
    <ellipse cx="39" cy="19" rx="5.5" ry="7" fill="#fff" ${S}/>
    <ellipse cx="48" cy="29" rx="5.5" ry="6.5" fill="#fff" ${S} transform="rotate(20 48 29)"/>
    <ellipse cx="32" cy="42" rx="5" ry="3.5" fill="#ff8fc7"/>`],
};

/** Full SVG markup for an icon (no size = scales to its container). */
export function iconSvg(id, size = null) {
  const g = GLYPHS[id];
  if (!g) return '';
  const [top, bottom, glyph] = g;
  const dims = size ? `width="${size}" height="${size}"` : '';
  return `<svg class="ico" ${dims} viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <defs><linearGradient id="ig-${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${top}"/><stop offset="1" stop-color="${bottom}"/></linearGradient></defs>
    <rect x="2" y="2" width="60" height="60" rx="16" fill="url(#ig-${id})" stroke="${INK}" stroke-width="3"/>
    <path d="M9 18 C9 11 13 8 20 8 H44 C51 8 55 11 55 18 C45 14 19 14 9 18 Z" fill="#fff" opacity=".28"/>
    ${glyph}
  </svg>`;
}

export const hasIcon = (id) => id in GLYPHS;

const images = new Map();
/** An <img> of the icon for drawing onto canvases (may still be loading; check .complete). */
export function iconImage(id, size = 128) {
  const key = `${id}|${size}`;
  if (!images.has(key)) {
    const img = new Image();
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(iconSvg(id, size))}`;
    images.set(key, img);
  }
  return images.get(key);
}
