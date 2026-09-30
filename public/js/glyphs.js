// Drawn SVG icons that stand in for emoji across the interface. Each is a little flat cartoon
// sticker in the same style as the activity badges (bold ink outline, bright fills). A watcher swaps
// any emoji we have an icon for into its <svg> as text appears on the page, so templates can keep
// writing "🪙 500" and it shows as a proper coin. Typed text (inputs, chat you're writing) is left alone.
const INK = '#1a1330';
const O = `stroke="${INK}" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"`;
const W = (d, w = 1.6) => `stroke="${INK}" stroke-width="${w}" fill="none" stroke-linecap="round" stroke-linejoin="round" d="${d}"`;
const star = (cx, cy, r, ri = r * 0.45) => {
  let d = '';
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5, rr = i % 2 ? ri : r;
    d += `${i ? 'L' : 'M'}${(cx + Math.cos(a) * rr).toFixed(2)} ${(cy + Math.sin(a) * rr).toFixed(2)}`;
  }
  return `${d}Z`;
};
const face = (fill, inner) => `<circle cx="12" cy="12" r="9.5" fill="${fill}" ${O}/>${inner}`;
const speaker = `<path d="M3.5 9.5h3.5l5-4v13l-5-4H3.5z" fill="#ffffff" ${O}/>`;

const ICONS = {
  coin: `<circle cx="12" cy="12" r="9.5" fill="#ffd84d" ${O}/><circle cx="12" cy="12" r="6.3" fill="#ffc21a" stroke="#d99a00" stroke-width="1.2"/><path d="${star(12, 12, 3.6)}" fill="#fff6c2"/><path d="M6 7.5a8 8 0 0 1 4-2.6" stroke="#fff" stroke-width="1.4" fill="none" stroke-linecap="round" opacity=".8"/>`,
  crown: `<path d="M3 18l1.5-10 4.5 4.5L12 5l3 7.5L19.5 8 21 18z" fill="#ffd84d" ${O}/><path d="M3 18h18v2.5H3z" fill="#ffb13b" ${O}/><circle cx="12" cy="14.5" r="1.5" fill="#ff5d73"/>`,
  gift: `<rect x="3.5" y="10" width="17" height="10.5" rx="1.5" fill="#ff5d73" ${O}/><rect x="2.5" y="7" width="19" height="4" rx="1.2" fill="#ff8fa3" ${O}/><path d="M10.5 7h3v13.5h-3z" fill="#ffd84d" ${O}/><path d="M12 7C9 2.5 5.5 4.5 7.5 7M12 7c3-4.5 6.5-2.5 4.5 0" fill="none" ${O}/>`,
  trophy: `<path d="M7 3.5h10v5a5 5 0 0 1-10 0z" fill="#ffd84d" ${O}/><path d="M7 5.5H4a3 3 0 0 0 3.5 4M17 5.5h3a3 3 0 0 1-3.5 4" fill="none" ${O}/><path d="M10.5 13.5h3v3.5h-3z" fill="#ffc21a" ${O}/><rect x="7" y="17" width="10" height="3.5" rx="1" fill="#8b5a2b" ${O}/>`,
  sparkle: `<path d="M9.5 3.5c.8 4 2 5.2 6 6-4 .8-5.2 2-6 6-.8-4-2-5.2-6-6 4-.8 5.2-2 6-6z" fill="#ffd84d" ${O}/><path d="M17.5 13c.5 2.4 1.2 3.1 3.5 3.5-2.3.5-3 1.2-3.5 3.5-.4-2.3-1.1-3-3.5-3.5 2.4-.4 3.1-1.1 3.5-3.5z" fill="#fff6c2" ${O}/>`,
  shirt: `<path d="M8.5 3.5L3 6.5l2 4.5 2.5-1v10.5h9V10l2.5 1 2-4.5-5.5-3a3.5 3.5 0 0 1-7 0z" fill="#39c6ff" ${O}/>`,
  pants: `<path d="M6 3.5h12l1 17h-5l-2-10-2 10H5z" fill="#3b82f6" ${O}/><path d="M6 6.5h12" ${O}/>`,
  hat: `<path d="M7.5 5h9v10h-9z" fill="#3a3f55" ${O}/><path d="M7.5 12h9v3h-9z" fill="#ff5d73" ${O}/><ellipse cx="12" cy="16.5" rx="9" ry="2.8" fill="#3a3f55" ${O}/>`,
  glasses: `<path d="M2.5 9h19" ${O}/><path d="M3.5 9h7l-.6 4.5a2.5 2.5 0 0 1-2.5 2H6.6a2.5 2.5 0 0 1-2.5-2z" fill="#2b2f4a" ${O}/><path d="M13.5 9h7l-.6 4.5a2.5 2.5 0 0 1-2.5 2h-.8a2.5 2.5 0 0 1-2.5-2z" fill="#2b2f4a" ${O}/><path d="M5.5 10.5l1.5 2M15.5 10.5l1.5 2" stroke="#fff" stroke-width="1.1" stroke-linecap="round" opacity=".7"/>`,
  wings: `<path d="M12 8C9 4 3.5 3.5 2.5 5.5c2 1 2.5 2.5 1.5 4 2 .3 2.8 1.6 2 3.3 2.4-.2 4.3-1 6-3.5z" fill="#ffffff" ${O}/><path d="M12 8c3-4 8.5-4.5 9.5-2.5-2 1-2.5 2.5-1.5 4-2 .3-2.8 1.6-2 3.3-2.4-.2-4.3-1-6-3.5z" fill="#ffffff" ${O}/><path d="M12 7.5v11" ${O}/>`,
  scissors: `<circle cx="6.5" cy="17" r="3" fill="#ff8fc7" ${O}/><circle cx="17.5" cy="17" r="3" fill="#ff8fc7" ${O}/><path d="M8.5 15L17 3.5M15.5 15L7 3.5" fill="none" ${O}/>`,
  person: `<circle cx="12" cy="6" r="3.5" fill="#ffcf9f" ${O}/><path d="M6.5 21v-6.5a5.5 5.5 0 0 1 11 0V21z" fill="#39c6ff" ${O}/>`,
  eyes: `<ellipse cx="8" cy="12" rx="4" ry="5.5" fill="#ffffff" ${O}/><ellipse cx="16" cy="12" rx="4" ry="5.5" fill="#ffffff" ${O}/><circle cx="9" cy="13" r="2" fill="${INK}"/><circle cx="17" cy="13" r="2" fill="${INK}"/>`,
  paw: `<ellipse cx="12" cy="15.5" rx="5" ry="4.5" fill="#ff8fc7" ${O}/><circle cx="5.5" cy="10" r="2.2" fill="#ff8fc7" ${O}/><circle cx="9.5" cy="6" r="2.2" fill="#ff8fc7" ${O}/><circle cx="14.5" cy="6" r="2.2" fill="#ff8fc7" ${O}/><circle cx="18.5" cy="10" r="2.2" fill="#ff8fc7" ${O}/>`,
  egg: `<path d="M12 2.5c4 0 7 6.5 7 11a7 7 0 0 1-14 0c0-4.5 3-11 7-11z" fill="#fff6e6" ${O}/><circle cx="9.5" cy="11" r="1.3" fill="#ff8fc7"/><circle cx="14.5" cy="15" r="1.6" fill="#39c6ff"/><circle cx="10" cy="17" r="1" fill="#ffd84d"/>`,
  lock: `<path d="M7.5 10.5V8a4.5 4.5 0 0 1 9 0v2.5" fill="none" ${O}/><rect x="4.5" y="10.5" width="15" height="10" rx="2" fill="#ffd84d" ${O}/><circle cx="12" cy="15" r="1.5" fill="${INK}"/><path d="M12 15.5v2.3" ${O}/>`,
  check: `<path ${W('M4.5 12.5l4.5 4.5 10-10', 3)}/>`,
  checkbox: `<rect x="2.5" y="2.5" width="19" height="19" rx="5" fill="#6ee7a0" ${O}/><path ${W('M7 12.5l3.5 3.5L17 9', 2.4)}/>`,
  close: `<path ${W('M6 6l12 12M18 6L6 18', 2.8)}/>`,
  sound: `${speaker}<path ${W('M15 9a4 4 0 0 1 0 6M17.5 6.5a7.5 7.5 0 0 1 0 11')}/>`,
  soundLow: `${speaker}<path ${W('M15 9a4 4 0 0 1 0 6')}/>`,
  mute: `${speaker}<path ${W('M15.5 9.5l5 5M20.5 9.5l-5 5')}/>`,
  music: `<path d="M9 17.5V5.5l10-2v12" fill="none" ${O}/><ellipse cx="6.5" cy="17.5" rx="3" ry="2.4" fill="#b77bff" ${O}/><ellipse cx="16.5" cy="15.5" rx="3" ry="2.4" fill="#b77bff" ${O}/><path d="M9 8.5l10-2" ${O}/>`,
  chat: `<path d="M4 4.5h16a1.5 1.5 0 0 1 1.5 1.5v9a1.5 1.5 0 0 1-1.5 1.5h-9l-5 4v-4H4A1.5 1.5 0 0 1 2.5 15V6A1.5 1.5 0 0 1 4 4.5z" fill="#ffffff" ${O}/><circle cx="8" cy="10.5" r="1.2" fill="${INK}"/><circle cx="12" cy="10.5" r="1.2" fill="${INK}"/><circle cx="16" cy="10.5" r="1.2" fill="${INK}"/>`,
  gear: `<path d="M10 2.5h4l.6 2.6 2.3 1 2.3-1.4 2.8 2.8-1.4 2.3 1 2.3 2.4.6v4l-2.6.6-1 2.3 1.4 2.3-2.8 2.8-2.3-1.4-2.3 1-.6 2.6h-4l-.6-2.6-2.3-1-2.3 1.4-2.8-2.8 1.4-2.3-1-2.3-2.6-.6v-4l2.6-.6 1-2.3L4 7.1l2.8-2.8 2.3 1.4 2.3-1z" transform="translate(12 12) scale(.82) translate(-12 -12.6)" fill="#c0c6d4" ${O}/><circle cx="12" cy="12" r="3" fill="#ffffff" ${O}/>`,
  gamepad: `<path d="M7 7.5h10a5 5 0 0 1 5 5.5l-.5 3.5a2.5 2.5 0 0 1-4.3 1.3L15 15.5H9l-2.2 2.3a2.5 2.5 0 0 1-4.3-1.3L2 13a5 5 0 0 1 5-5.5z" fill="#7c6bff" ${O}/><path d="M7.5 10v4M5.5 12h4" stroke="#fff" stroke-width="1.8" stroke-linecap="round"/><circle cx="16" cy="11" r="1.2" fill="#ffd84d"/><circle cx="18" cy="13" r="1.2" fill="#ff5d73"/>`,
  monitor: `<rect x="2.5" y="3.5" width="19" height="13" rx="2" fill="#39c6ff" ${O}/><path d="M9 20.5h6M12 16.5v4" ${O}/><path d="M5 6.5l3 0" stroke="#fff" stroke-width="1.4" stroke-linecap="round"/>`,
  sun: `<circle cx="12" cy="12" r="5" fill="#ffd84d" ${O}/>${[0, 45, 90, 135, 180, 225, 270, 315].map((a) => `<path d="M12 2.5v3" transform="rotate(${a} 12 12)" stroke="#ffb13b" stroke-width="2.2" stroke-linecap="round"/>`).join('')}`,
  moon: `<path d="M15 3a9 9 0 1 0 6 13.5A7 7 0 0 1 15 3z" fill="#fff3b0" ${O}/><circle cx="10" cy="14" r="1.3" fill="#e6d680"/><circle cx="13" cy="18" r=".9" fill="#e6d680"/>`,
  sunrise: `<path d="M5 16a7 7 0 0 1 14 0z" fill="#ffb13b" ${O}/><path d="M2.5 16h19" ${O}/><path d="M12 3.5v3M5.5 6.5l2 2M18.5 6.5l-2 2" stroke="#ff9f43" stroke-width="2" stroke-linecap="round"/><path d="M6 19.5h12" stroke="#ff8fc7" stroke-width="1.8" stroke-linecap="round"/>`,
  house: `<path d="M3 11.5L12 4l9 7.5" fill="none" ${O}/><path d="M5 10v10.5h14V10L12 4.5z" fill="#ffd6a8" ${O}/><path d="M3 11.5L12 4l9 7.5-1.5 1.3L12 6.5l-7.5 6.3z" fill="#ff5d73" ${O}/><rect x="10" y="14" width="4" height="6.5" fill="#8b5a2b" ${O}/>`,
  star: `<path d="${star(12, 12.5, 9.5)}" fill="#ffd84d" ${O}/>`,
  heart: `<path d="M12 20.5S3 15 3 9a4.5 4.5 0 0 1 9-1 4.5 4.5 0 0 1 9 1c0 6-9 11.5-9 11.5z" fill="#ff5d73" ${O}/><path d="M6.5 8.5a2 2 0 0 1 2-1.5" stroke="#fff" stroke-width="1.4" fill="none" stroke-linecap="round" opacity=".8"/>`,
  fire: `<path d="M12 2.5c1 4 6 6 6 11a6 6 0 0 1-12 0c0-3 1.5-4.5 3-6 0 2 1 3 2 3.5-.5-3 0-6 1-8.5z" fill="#ff7a2e" ${O}/><path d="M12 12c.5 2 3 3 3 5.5a3 3 0 0 1-6 0c0-1.5 1-2.5 3-5.5z" fill="#ffd84d"/>`,
  wave: `<path d="M8 11V5a1.5 1.5 0 0 1 3 0v5.5V3.5a1.5 1.5 0 0 1 3 0v7V5a1.5 1.5 0 0 1 3 0v8.5c0 4-2.5 7-6.5 7-3 0-4.5-1.5-6-4L3 12.5a1.5 1.5 0 0 1 2.3-2L8 13z" fill="#ffcf9f" ${O}/><path d="M18.5 2.5l1.5-1M20 5l2-.3" stroke="#ffb13b" stroke-width="1.5" stroke-linecap="round"/>`,
  laugh: face('#ffd84d', `<path ${W('M7 9.5l2 1-2 1M17 9.5l-2 1 2 1', 1.4)}/><path d="M7 13.5h10a5 5 0 0 1-10 0z" fill="#8b1e3f" ${O}/><path d="M4 11c-1 1.5-1 3 0 4M20 11c1 1.5 1 3 0 4" stroke="#39c6ff" stroke-width="1.6" stroke-linecap="round"/>`),
  wow: face('#ffd84d', `<circle cx="8.5" cy="9.5" r="1.4" fill="${INK}"/><circle cx="15.5" cy="9.5" r="1.4" fill="${INK}"/><ellipse cx="12" cy="15.5" rx="2.3" ry="3" fill="#8b1e3f" ${O}/>`),
  smile: face('#ffd84d', `<circle cx="8.5" cy="10" r="1.3" fill="${INK}"/><circle cx="15.5" cy="10" r="1.3" fill="${INK}"/><path ${W('M8 14.5a5 5 0 0 0 8 0', 1.6)}/>`),
  dice: `<rect x="3.5" y="3.5" width="17" height="17" rx="4" fill="#ffffff" ${O}/>${[[8, 8], [16, 8], [12, 12], [8, 16], [16, 16]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="1.5" fill="#ff5d73"/>`).join('')}`,
  mirror: `<ellipse cx="12" cy="10" rx="6.5" ry="8" fill="#ffd84d" ${O}/><ellipse cx="12" cy="10" rx="4.5" ry="6" fill="#bfe6ff" ${O}/><path d="M10 6.5l-1.5 4" stroke="#fff" stroke-width="1.4" stroke-linecap="round"/><path d="M8 21l4-3 4 3z" fill="#ffd84d" ${O}/>`,
  chair: `<path d="M6.5 3.5h11v8h-11z" fill="#c28a4e" ${O}/><path d="M5 11.5h14v3H5z" fill="#a0703f" ${O}/><path d="M6.5 14.5v6M17.5 14.5v6" ${O}/>`,
  swords: `<path d="M4 3.5l9 9M20 3.5l-9 9" stroke="#e8ecf5" stroke-width="3" stroke-linecap="round"/><path ${W('M4 3.5l9 9M20 3.5l-9 9', 1.2)}/><path d="M6.5 14l3.5 3.5M17.5 14L14 17.5" stroke="#ffd84d" stroke-width="2.4" stroke-linecap="round"/><path d="M8.5 16l-4 4.5M15.5 16l4 4.5" stroke="#8b5a2b" stroke-width="2.4" stroke-linecap="round"/>`,
  car: `<path d="M2.5 16.5l1.5-4.5 4-1.5 3-4h6l3 4 1.5 1.5v4.5z" fill="#ff5d73" ${O}/><path d="M11.5 7.5h4.5l2 3h-8z" fill="#bfe6ff" ${O}/><circle cx="7" cy="17" r="2.5" fill="#2b2f4a" ${O}/><circle cx="17.5" cy="17" r="2.5" fill="#2b2f4a" ${O}/>`,
  fish: `<path d="M3 12c3-5 9-6 13-3l5-3v12l-5-3c-4 3-10 2-13-3z" fill="#39c6ff" ${O}/><circle cx="7.5" cy="11" r="1.2" fill="${INK}"/><path d="M12 9c1 2 1 4 0 6" fill="none" stroke="#1d8fc2" stroke-width="1.2"/>`,
  bow: `<path d="M6 2.5c9 3 9 16 0 19" fill="none" stroke="#8b5a2b" stroke-width="2.4" stroke-linecap="round"/><path d="M6 2.5v19" stroke="${INK}" stroke-width="1"/><path d="M3 12h17" ${O}/><path d="M17 9.5l4 2.5-4 2.5z" fill="#c0c6d4" ${O}/><path d="M3 12l-1-2M3 12l-1 2" stroke="#ff5d73" stroke-width="1.6" stroke-linecap="round"/>`,
  alien: `<path d="M5 9a7 7 0 0 1 14 0v5l2 3h-3l-1 3h-2l-1-2h-4l-1 2H7l-1-3H3l2-3z" fill="#b77bff" ${O}/><ellipse cx="9" cy="10.5" rx="1.8" ry="2.4" fill="${INK}"/><ellipse cx="15" cy="10.5" rx="1.8" ry="2.4" fill="${INK}"/><path d="M8 3.5L6 1.5M16 3.5l2-2" ${O}/>`,
  boom: `<path d="M12 2l2 5 5-2.5-2 5L22 12l-5 1.5 2.5 5-5-2L12 22l-2-5.5-5 2.5 2-5L2 12l5-1.5L4.5 5.5l5 2z" fill="#ffb13b" ${O}/><path d="M12 7l1 3 3-1-1.5 3 2.5 1-3 .8L15 17l-3-1.5-2 2.5-.5-3.5-3 .5 2-2.5-2-2h3z" fill="#ffd84d"/>`,
  palette: `<path d="M12 2.5a9.5 9.5 0 1 0 0 19c1.5 0 2-1 1.5-2-.8-1.6.2-3 2-3h2.5a3.5 3.5 0 0 0 3.5-3.5C21.5 7 17.5 2.5 12 2.5z" fill="#fff1c9" ${O}/><circle cx="7.5" cy="11" r="1.8" fill="#ff5d73"/><circle cx="10" cy="6.8" r="1.8" fill="#ffd84d"/><circle cx="15" cy="6.8" r="1.8" fill="#39c6ff"/><circle cx="17.5" cy="11" r="1.8" fill="#6ee7a0"/>`,
  moneybag: `<path d="M9 5.5h6l-1.5 2.5c4.5 1.5 7 5 7 8.5 0 3-2.5 4.5-8.5 4.5s-8.5-1.5-8.5-4.5c0-3.5 2.5-7 7-8.5z" fill="#c9a36a" ${O}/><path d="M9 5.5l-1-2.5h8l-1 2.5" fill="#c9a36a" ${O}/><circle cx="12" cy="14.5" r="3.2" fill="#ffd84d" ${O}/>`,
  book: `<path d="M3 5c3-1.5 6-1.5 9 .5v15c-3-2-6-2-9-.5z" fill="#39c6ff" ${O}/><path d="M21 5c-3-1.5-6-1.5-9 .5v15c3-2 6-2 9-.5z" fill="#6ee7a0" ${O}/>`,
  swirl: `<path ${W('M12 12a1.5 1.5 0 0 1 3 0 3 3 0 0 1-6 0 4.5 4.5 0 0 1 9 0 6 6 0 0 1-12 0 7.5 7.5 0 0 1 15 0', 2)} stroke="#7c6bff"/>`,
  rocket: `<path d="M12 2.5c3.5 2 5 5.5 5 9.5v4H7v-4c0-4 1.5-7.5 5-9.5z" fill="#ffffff" ${O}/><circle cx="12" cy="9.5" r="2" fill="#39c6ff" ${O}/><path d="M7 12l-3 4v2.5l3-1.5M17 12l3 4v2.5l-3-1.5" fill="#ff5d73" ${O}/><path d="M9.5 17.5c.5 2 1.5 3.5 2.5 4.5 1-1 2-2.5 2.5-4.5z" fill="#ffb13b" ${O}/>`,
  wind: `<path ${W('M3 8.5h11a3 3 0 1 0-3-3M3 13h15a3 3 0 1 1-3 3M3 17.5h7', 2)} stroke="#6fb6ff"/>`,
  rotate: `<path ${W('M19 11a7 7 0 0 0-13-3M5 13a7 7 0 0 0 13 3', 2.2)}/><path d="M4.5 3.5L6 8l4.5-1M19.5 20.5L18 16l-4.5 1" fill="none" ${O}/>`,
  mouse: `<rect x="6" y="2.5" width="12" height="19" rx="6" fill="#ffffff" ${O}/><path d="M12 2.5v7M6 9.5h12" ${O}/><rect x="11" y="5" width="2" height="3" rx="1" fill="#7c6bff"/>`,
  castle: `<path d="M3.5 21V8h3v2h2V8h2v2h3V8h2v2h2V8h3v13z" fill="#aab3c5" ${O}/><path d="M10 21v-5a2 2 0 0 1 4 0v5z" fill="#5a3a22" ${O}/><path d="M12 8V3.5l3 1.2-3 1.2" fill="#ff5d73" ${O}/>`,
  slots: `<rect x="3.5" y="4" width="15" height="16.5" rx="2" fill="#ff5d73" ${O}/><rect x="5.5" y="8" width="11" height="6" rx="1" fill="#ffffff" ${O}/><path d="M9.2 8v6M12.8 8v6" stroke="${INK}" stroke-width="1.2"/><path d="M18.5 9v-3.5" ${O}/><circle cx="18.5" cy="4.5" r="1.8" fill="#ffd84d" ${O}/><path d="M7 17h8" ${O}/>`,
  cart: `<path d="M2.5 4h3l2.5 11h11l2-8H7" fill="#ffd84d" ${O}/><circle cx="9.5" cy="19" r="1.8" fill="#ffffff" ${O}/><circle cx="17" cy="19" r="1.8" fill="#ffffff" ${O}/>`,
  sofa: `<path d="M4 9.5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2V13H4z" fill="#b77bff" ${O}/><path d="M2.5 12a1.5 1.5 0 0 1 3 0v1.5h13V12a1.5 1.5 0 0 1 3 0v5.5h-19z" fill="#9b59b6" ${O}/><path d="M4.5 17.5v2M19.5 17.5v2" ${O}/>`,
  pencil: `<path d="M4 20l1-5L16 4l4 4L9 19z" fill="#ffd84d" ${O}/><path d="M16 4l4 4 1-1a2 2 0 0 0 0-3l-1-1a2 2 0 0 0-3 0z" fill="#ff8fa3" ${O}/><path d="M4 20l1-5 4 4z" fill="#f6c9a0" ${O}/>`,
  trash: `<path d="M5 7.5h14l-1.2 13H6.2z" fill="#c0c6d4" ${O}/><path d="M3.5 6h17M9.5 6V4h5v2" fill="none" ${O}/><path d="M10 10.5v7M14 10.5v7" ${O}/>`,
  sponge: `<rect x="3.5" y="7" width="17" height="11" rx="3" fill="#ffd84d" ${O}/><circle cx="8" cy="11" r="1.1" fill="#e0b21a"/><circle cx="13" cy="13.5" r="1.3" fill="#e0b21a"/><circle cx="16.5" cy="10.5" r="1" fill="#e0b21a"/>`,
  medal1: `<path d="M8 2.5h3l2 6h-3zM16 2.5h-3l-2 6h3z" fill="#39c6ff" ${O}/><circle cx="12" cy="15" r="6.5" fill="#ffd84d" ${O}/><text x="12" y="18.3" font-size="9" font-weight="900" text-anchor="middle" fill="${INK}" font-family="Rubik,sans-serif">1</text>`,
  medal2: `<path d="M8 2.5h3l2 6h-3zM16 2.5h-3l-2 6h3z" fill="#ff5d73" ${O}/><circle cx="12" cy="15" r="6.5" fill="#dfe4ee" ${O}/><text x="12" y="18.3" font-size="9" font-weight="900" text-anchor="middle" fill="${INK}" font-family="Rubik,sans-serif">2</text>`,
  medal3: `<path d="M8 2.5h3l2 6h-3zM16 2.5h-3l-2 6h3z" fill="#6ee7a0" ${O}/><circle cx="12" cy="15" r="6.5" fill="#e0955a" ${O}/><text x="12" y="18.3" font-size="9" font-weight="900" text-anchor="middle" fill="${INK}" font-family="Rubik,sans-serif">3</text>`,
  party: `<path d="M3 21l4-12 8 8z" fill="#ffd84d" ${O}/><path d="M5 15l4 4M6 11.5l6.5 6.5" stroke="#ff5d73" stroke-width="1.6"/><path d="M13 3.5l1 2M20 9l-2 .5M17 4.5l-1.5 2.5" stroke="#39c6ff" stroke-width="1.8" stroke-linecap="round"/><circle cx="19.5" cy="4" r="1.2" fill="#ff8fc7"/><circle cx="11" cy="8" r="1" fill="#6ee7a0"/>`,
  banana: `<path d="M4 6c1 8 7 13 16 12-1 2-3 3.5-6 3.5C7 21.5 2.5 15 3 6.5z" fill="#ffd84d" ${O}/><path d="M3 6.5L4.5 3.5" stroke="#8b5a2b" stroke-width="2" stroke-linecap="round"/>`,
  oil: `<rect x="5" y="4" width="14" height="17" rx="2" fill="#3a3f55" ${O}/><path d="M5 9h14M5 16h14" stroke="#ffb13b" stroke-width="1.6"/><path d="M12 11c1.5 2 2 2.6 2 3.3a2 2 0 0 1-4 0c0-.7.5-1.3 2-3.3z" fill="#1a1330"/>`,
  shell: `<ellipse cx="12" cy="13" rx="9" ry="7" fill="#6ee7a0" ${O}/><path d="M12 6v14M5 10l7 3 7-3" fill="none" stroke="#2f9e44" stroke-width="1.4"/><ellipse cx="12" cy="18.5" rx="9" ry="2.2" fill="#ffffff" ${O}/>`,
  bolt: `<path d="M13.5 2L4.5 13.5h6L9 22l9.5-12h-6z" fill="#ffd84d" ${O}/>`,
  shield: `<path d="M12 2.5l8 3v6c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10v-6z" fill="#39c6ff" ${O}/><path d="M12 5.5v13c3-1.2 5-3.8 5-7V7.5z" fill="#1d8fc2"/>`,
  mushroom: `<path d="M2.5 12a9.5 8 0 0 1 19 0z" fill="#ff5d73" ${O}/><circle cx="8" cy="8.5" r="1.6" fill="#fff"/><circle cx="15" cy="7.5" r="2" fill="#fff"/><path d="M8 12h8l-.8 6.5a3.2 3.2 0 0 1-6.4 0z" fill="#fff6e6" ${O}/>`,
  flag: `<path d="M5 21.5V3" ${O}/><path d="M5 3.5h14v10H5z" fill="#ffffff" ${O}/><path d="M5 3.5h3.5V7H5zM12 3.5h3.5V7H12zM8.5 7H12v3.2H8.5zM15.5 7H19v3.2h-3.5zM5 10.2h3.5v3.3H5zM12 10.2h3.5v3.3H12z" fill="${INK}"/>`,
  question: `<rect x="3" y="3" width="18" height="18" rx="4" fill="#ffb13b" ${O}/><path d="M9 9.5a3 3 0 1 1 4 2.8c-.8.4-1 1-1 2" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round"/><circle cx="12" cy="17.3" r="1.3" fill="#fff"/>`,
  bubble: `<circle cx="12" cy="12" r="8.5" fill="#bfe6ff" fill-opacity=".7" ${O}/><path d="M8 8.5a4.5 4.5 0 0 1 3.5-2" stroke="#fff" stroke-width="1.8" fill="none" stroke-linecap="round"/>`,
  skull: `<path d="M4 11a8 8 0 0 1 16 0c0 2.5-1 3.8-2.5 4.5V19h-11v-3.5C5 14.8 4 13.5 4 11z" fill="#ffffff" ${O}/><circle cx="9" cy="11.5" r="2" fill="${INK}"/><circle cx="15" cy="11.5" r="2" fill="${INK}"/><path d="M10 19v-2M14 19v-2" ${O}/>`,
  clover: `${[0, 90, 180, 270].map((a) => `<circle cx="12" cy="7.3" r="3.8" fill="#6ee7a0" transform="rotate(${a} 12 11.5)" ${O}/>`).join('')}<path d="M12 11.5c0 4 1 7 3 9.5" fill="none" stroke="#2f9e44" stroke-width="1.8" stroke-linecap="round"/>`,
  shoe: `<path d="M3 15.5V9l4 1c2 1.5 4 2 6.5 2.5L20 14c1 .5 1.5 1.3 1.5 2.5v1H3z" fill="#ff5d73" ${O}/><path d="M3 17.5h18.5v2H3z" fill="#ffffff" ${O}/><path d="M8 11.5l1.5-1.5M10.5 12l1.5-1.5" stroke="#fff" stroke-width="1.3" stroke-linecap="round"/>`,
  bandage: `<rect x="1.5" y="8.5" width="21" height="7" rx="3.5" fill="#f6c9a0" transform="rotate(-35 12 12)" ${O}/><rect x="8.5" y="9" width="7" height="6" fill="#fff6e6" transform="rotate(-35 12 12)" ${O}/>`,
  drumstick: `<path d="M14 3.5a6.5 6.5 0 0 1 3.5 12L12 21l-3-3 1.5-3A6.5 6.5 0 0 1 14 3.5z" fill="#d9822b" ${O}/><circle cx="7" cy="19.5" r="1.8" fill="#fff" ${O}/><circle cx="4.8" cy="17.5" r="1.8" fill="#fff" ${O}/>`,
  target: `<circle cx="12" cy="12" r="9.5" fill="#ffffff" ${O}/><circle cx="12" cy="12" r="6.5" fill="#ff5d73" ${O}/><circle cx="12" cy="12" r="3.3" fill="#ffd84d" ${O}/>`,
  wand: `<path d="M4 20L15 9" stroke="#3a3f55" stroke-width="2.6" stroke-linecap="round"/><path d="${star(17, 7, 4.5, 2)}" fill="#ffd84d" ${O}/>`,
  angry: face('#ff7a5a', `<path ${W('M6.5 8l4 1.5M17.5 8l-4 1.5', 1.6)}/><circle cx="9" cy="11" r="1.2" fill="${INK}"/><circle cx="15" cy="11" r="1.2" fill="${INK}"/><path ${W('M8.5 16.5a4 4 0 0 1 7 0', 1.6)}/>`),
  dizzy: `<path d="${star(12, 12, 6)}" fill="#ffd84d" ${O}/><path ${W('M3 6a10 7 0 0 1 18 0', 1.4)} stroke="#b77bff"/>`,
  trident: `<path d="M12 22V6M6 3.5v4a6 6 0 0 0 12 0v-4M12 2.5v4" fill="none" stroke="#ffd84d" stroke-width="3" stroke-linecap="round"/><path d="M12 22V6M6 3.5v4a6 6 0 0 0 12 0v-4M12 2.5v4" fill="none" ${W('', 1)}/>`,
  dragon: `<path d="M4 16c0-6 4-10 9-10l3-3 1 3.5 3.5.5-2 2.5c1.5 1.5 2 3.5 1.5 5.5L17 18l-4-1-2 3-2-3z" fill="#6ee7a0" ${O}/><circle cx="16" cy="9.5" r="1.1" fill="${INK}"/><path d="M4 16c-1 2-1 3.5 0 5" ${O}/>`,
  moai: `<path d="M8 3h8l1 5-1 13H8L7 8z" fill="#aab3c5" ${O}/><path d="M7.5 8h9" stroke="${INK}" stroke-width="2"/><path d="M11 10v5.5h2.5" fill="none" ${O}/><path d="M9.5 18h5" ${O}/>`,
  ferris: `<circle cx="12" cy="10" r="7.5" fill="none" stroke="#ff8fc7" stroke-width="2"/><path d="M12 10L7 21M12 10l5 11M5 21h14" ${O}/>${[0, 72, 144, 216, 288].map((a) => `<circle cx="12" cy="2.5" r="1.8" fill="#39c6ff" transform="rotate(${a} 12 10)" ${O}/>`).join('')}`,
  bell: `<path d="M12 3a6 6 0 0 1 6 6v5l2 3H4l2-3V9a6 6 0 0 1 6-6z" fill="#ffd84d" ${O}/><circle cx="12" cy="19.5" r="2" fill="#ffb13b" ${O}/>`,
  cherry: `<path d="M8 15C9 10 12 6 17 3.5M16 15c0-4-.5-8 1-11.5" fill="none" stroke="#2f9e44" stroke-width="1.8" stroke-linecap="round"/><circle cx="7.5" cy="16.5" r="4" fill="#ff5d73" ${O}/><circle cx="16" cy="16.5" r="4" fill="#ff5d73" ${O}/>`,
  gem: `<path d="M6.5 4h11l4 5.5L12 21 2.5 9.5z" fill="#39c6ff" ${O}/><path d="M2.5 9.5h19M9 4l-2 5.5L12 21l5-11.5L15 4" fill="none" stroke="${INK}" stroke-width="1"/>`,
  lemon: `<ellipse cx="12" cy="12" rx="8.5" ry="6.5" fill="#ffe14d" transform="rotate(-20 12 12)" ${O}/><path d="M19 6l2-1.5" stroke="#2f9e44" stroke-width="2" stroke-linecap="round"/>`,
  eagle: `<path d="M2.5 9c4-1 7 0 9.5 3 2.5-3 5.5-4 9.5-3-2 1.5-3 3-3.5 5l-3 .5L14 18h-4l-1-3.5-3-.5C5.5 12 4.5 10.5 2.5 9z" fill="#8b5a2b" ${O}/><circle cx="12" cy="11" r="2" fill="#ffffff" ${O}/><path d="M12 12.5l1.5 1" stroke="#ffb13b" stroke-width="1.6"/>`,
  exclaim: `<rect x="9.5" y="2.5" width="5" height="13" rx="2.5" fill="#ff5d73" ${O}/><circle cx="12" cy="19.5" r="2.5" fill="#ff5d73" ${O}/>`,
  compass: `<circle cx="12" cy="12" r="9.5" fill="#ffffff" ${O}/><path d="M12 4.5v3M12 16.5v3M4.5 12h3M16.5 12h3" ${O}/><path d="M9 15l2-5 4-1-2 5z" fill="#ff5d73" ${O}/>`,
  splash: `<path d="M12 3c3 4.5 5 7.5 5 10a5 5 0 0 1-10 0c0-2.5 2-5.5 5-10z" fill="#39c6ff" ${O}/><path d="M4 18c1-1 2-1 3 0M17 18c1-1 2-1 3 0" stroke="#39c6ff" stroke-width="1.8" stroke-linecap="round"/>`,
  leaf: `<path d="M4 20C4 10 10 4 20 4c0 10-6 16-16 16z" fill="#6ee7a0" ${O}/><path d="M4 20L14 10" stroke="#2f9e44" stroke-width="1.6" stroke-linecap="round"/>`,
  cross: `<path d="M9 3.5h6v5.5h5.5v6H15v5.5H9V15H3.5V9H9z" fill="#ff5d73" ${O}/>`,
  potion: `<path d="M9 3h6v5l4.5 8a3 3 0 0 1-2.6 4.5H7.1A3 3 0 0 1 4.5 16L9 8z" fill="#8dff3a" ${O}/><path d="M9 3h6" ${O}/><path d="M6.5 14h11" stroke="#fff" stroke-width="1.2" opacity=".7"/><circle cx="10" cy="17" r="1.2" fill="#fff" opacity=".8"/>`,
  spider: `<ellipse cx="12" cy="14" rx="5" ry="4.5" fill="#6a2f8a" ${O}/><circle cx="12" cy="8.5" r="3" fill="#6a2f8a" ${O}/><circle cx="10.8" cy="8.2" r=".9" fill="#8dff3a"/><circle cx="13.2" cy="8.2" r=".9" fill="#8dff3a"/><path ${W('M7.5 12L3 9M7.5 14.5L2.5 14M7.8 16.5L3.5 20M16.5 12L21 9M16.5 14.5L21.5 14M16.2 16.5L20.5 20', 1.5)}/>`,
  mug: `<path d="M5 6h11v13a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2z" fill="#ffd84d" ${O}/><path d="M16 9h2.5a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2H16" fill="none" ${O}/><path d="M4.5 6.5c0-3 12-3 12 0 0 1.5-2 1-3 2-1-1-3-.5-4-1-1 1-5 1.5-5-1z" fill="#fff" ${O}/>`,
  joystick: `<rect x="3.5" y="14" width="17" height="6.5" rx="2" fill="#7c6bff" ${O}/><path d="M12 14V7" ${O}/><circle cx="12" cy="6" r="3.2" fill="#ff5d73" ${O}/><circle cx="17" cy="17.2" r="1.3" fill="#ffd84d"/>`,
  snow: `${[0, 60, 120].map((a) => `<path d="M12 2.5v19M12 6l-2.5-2M12 6l2.5-2M12 18l-2.5 2M12 18l2.5 2" transform="rotate(${a} 12 12)" stroke="#8fe3ff" stroke-width="2.2" stroke-linecap="round" fill="none"/>`).join('')}<circle cx="12" cy="12" r="2" fill="#fff" ${O}/>`,
  sleep: `<text x="4" y="14" font-size="10" font-weight="900" fill="#7c6bff" stroke="${INK}" stroke-width=".8" font-family="Rubik,sans-serif">Z</text><text x="12" y="20" font-size="7" font-weight="900" fill="#7c6bff" stroke="${INK}" stroke-width=".6" font-family="Rubik,sans-serif">z</text>`,
};

// emoji → icon (the variation selector after an emoji is swallowed too)
const MAP = {
  '🪙': 'coin', '👑': 'crown', '🎁': 'gift', '🏆': 'trophy', '✨': 'sparkle', '👕': 'shirt', '👖': 'pants', '🎩': 'hat',
  '🕶': 'glasses', '🪽': 'wings', '💇': 'scissors', '🧍': 'person', '👀': 'eyes', '🐾': 'paw', '🥚': 'egg', '🔒': 'lock',
  '✅': 'checkbox', '✓': 'check', '✔': 'check', '✕': 'close', '✖': 'close', '🔊': 'sound', '🔈': 'soundLow', '🔉': 'soundLow', '🔇': 'mute',
  '🎵': 'music', '🎶': 'music', '💬': 'chat', '⚙': 'gear', '🎮': 'gamepad', '🖥': 'monitor', '☀': 'sun', '🌙': 'moon',
  '🌅': 'sunrise', '🏠': 'house', '🏡': 'house', '🏘': 'house', '⭐': 'star', '❤': 'heart', '🤍': 'heart', '🔥': 'fire', '👋': 'wave',
  '😂': 'laugh', '😮': 'wow', '🙂': 'smile', '😌': 'smile', '🎲': 'dice', '🪞': 'mirror', '🪑': 'chair', '⚔': 'swords',
  '🏎': 'car', '🎣': 'fish', '🏹': 'bow', '👾': 'alien', '💥': 'boom', '🎨': 'palette', '💰': 'moneybag', '📖': 'book',
  '🌀': 'swirl', '🚀': 'rocket', '💨': 'wind', '🔄': 'rotate', '🖱': 'mouse', '🏰': 'castle', '🎰': 'slots', '🛒': 'cart',
  '🛋': 'sofa', '✏': 'pencil', '🗑': 'trash', '🧽': 'sponge', '🥇': 'medal1', '🥈': 'medal2', '🥉': 'medal3', '🎉': 'party',
  '🍌': 'banana', '🛢': 'oil', '🟢': 'shell', '⚡': 'bolt', '🛡': 'shield', '🍄': 'mushroom', '🏁': 'flag', '❓': 'question',
  '🫧': 'bubble', '💀': 'skull', '🍀': 'clover', '👟': 'shoe', '🩹': 'bandage', '🍗': 'drumstick', '🎯': 'target',
  '🪄': 'wand', '😡': 'angry', '💫': 'dizzy', '🔱': 'trident', '🐉': 'dragon', '🗿': 'moai', '🎡': 'ferris', '🔔': 'bell',
  '🍒': 'cherry', '💎': 'gem', '🍋': 'lemon', '🦅': 'eagle', '❗': 'exclaim', '💦': 'splash', '🍃': 'leaf', '🩺': 'cross',
  '💤': 'sleep', '🐟': 'fish', '🐠': 'fish',
  '🧪': 'potion', '❄': 'snow', '🕷': 'spider', '🍺': 'mug', '🕹': 'joystick', '🤝': 'wave', '📣': 'bell',
};

/** An icon as an inline SVG string (1em square, sits on the text line). */
export function glyph(name, cls = '') {
  const body = ICONS[name];
  if (!body) return '';
  return `<svg class="gly ${cls}" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">${body}</svg>`;
}

const keys = Object.keys(MAP).sort((a, b) => b.length - a.length).map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
const RE = new RegExp(`(${keys.join('|')})\\uFE0F?`, 'gu');
const HAS = new RegExp(`(${keys.join('|')})`, 'u'); // no /g, so .test() keeps no state between calls

/** Replace known emoji in a string of HTML text with icons. */
export const emo = (s) => String(s).replace(RE, (_, e) => glyph(MAP[e]));

// ---- the watcher -----------------------------------------------------------------------------------

const SKIP = new Set(['SCRIPT', 'STYLE', 'TEXTAREA', 'INPUT', 'OPTION', 'TITLE', 'svg', 'SVG', 'CANVAS']);
const tpl = document.createElement('template');

function swapText(node) {
  const text = node.nodeValue;
  if (!text || !HAS.test(text)) return;
  const p = node.parentNode;
  if (!p || SKIP.has(p.nodeName) || p.closest?.('[contenteditable], .no-glyphs, svg')) return;
  // escape the text, then swap the emoji in
  tpl.innerHTML = text.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c])).replace(RE, (_, e) => glyph(MAP[e]));
  p.replaceChild(tpl.content, node);
}

function scan(root) {
  if (root.nodeType === 3) { swapText(root); return; }
  if (root.nodeType !== 1 || SKIP.has(root.nodeName)) return;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const found = [];
  for (let n = walker.nextNode(); n; n = walker.nextNode()) if (HAS.test(n.nodeValue)) found.push(n);
  found.forEach(swapText);
}

let pending = new Set(), queued = false;
const observer = new MutationObserver((muts) => {
  for (const m of muts) {
    if (m.type === 'characterData') pending.add(m.target);
    else m.addedNodes.forEach((n) => pending.add(n));
  }
  if (!queued) {
    queued = true;
    queueMicrotask(() => {
      queued = false;
      const list = pending;
      pending = new Set();
      list.forEach((n) => n.isConnected && scan(n));
    });
  }
});
scan(document.body);
observer.observe(document.body, { childList: true, subtree: true, characterData: true });
