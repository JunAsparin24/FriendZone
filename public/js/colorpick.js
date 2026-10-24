// Any colour, not just the presets: a colour wheel, an eyedropper (pick up a colour off anything on the
// screen: a wall, someone's outfit, the sofa) and the colours you've picked lately, so two things can be
// exactly the same colour. Each picker sits at the front of a row of swatches and hands its colour to that
// row's own handler, by "clicking" a hidden swatch with the colour on it.

const KEY = 'fz.recentColors';
const HEX = /^#[0-9a-f]{6}$/i;

export function recentColors() {
  try { return (JSON.parse(localStorage.getItem(KEY)) ?? []).filter((c) => HEX.test(c)); } catch { return []; }
}
function remember(c) {
  const list = [c, ...recentColors().filter((x) => x !== c)].slice(0, 10);
  try { localStorage.setItem(KEY, JSON.stringify(list)); } catch { /* no storage */ }
}

/**
 * The picker's buttons, for the front of a row of swatches. `fixed`: attributes every swatch in the row has
 * (e.g. { 'data-field': 'hairColor' }); `attr` + `prefix`: where the colour goes (data-color="#…", or
 * data-x="roofc:#…"). `cur`: the colour chosen now.
 */
export function pickerHtml(fixed, attr, prefix, cur) {
  const v = HEX.test(cur ?? '') ? cur : '#ffffff';
  const enc = encodeURIComponent(JSON.stringify(fixed));
  return `<span class="cpick" data-cp-fixed="${enc}" data-cp-attr="${attr}" data-cp-prefix="${prefix}">`
    + `<label class="swatch cp-wheel" title="Any colour you like"><input type="color" value="${v}"></label>`
    + (window.EyeDropper ? '<button type="button" class="swatch cp-drop" title="Pick a colour up off anything on the screen">💧</button>' : '')
    + recentColors().map((c) => `<button type="button" class="swatch cp-recent" data-cp-color="${c}" style="--c:${c}" title="Used lately: ${c}"></button>`).join('')
    + '</span>';
}

/** Make the pickers inside `root` work (call once per root: it watches everything that's put in it later). */
export function wirePickers(root) {
  const send = (wrap, color) => {
    if (!wrap || !HEX.test(color)) return;
    color = color.toLowerCase();
    remember(color);
    const b = document.createElement('button');
    b.type = 'button';
    b.hidden = true;
    for (const [k, val] of Object.entries(JSON.parse(decodeURIComponent(wrap.dataset.cpFixed)))) b.setAttribute(k, val);
    b.setAttribute(wrap.dataset.cpAttr, wrap.dataset.cpPrefix + color);
    wrap.append(b);
    b.click();
    b.remove();
  };
  root.addEventListener('change', (e) => { const i = e.target.closest?.('.cp-wheel input'); if (i) send(i.closest('.cpick'), i.value); });
  root.addEventListener('click', async (e) => {
    const r = e.target.closest?.('.cp-recent');
    if (r) { send(r.closest('.cpick'), r.dataset.cpColor); return; }
    const d = e.target.closest?.('.cp-drop');
    if (d && window.EyeDropper) {
      const wrap = d.closest('.cpick');
      try { const { sRGBHex } = await new window.EyeDropper().open(); send(wrap, sRGBHex); } catch { /* cancelled */ }
    }
  });
}
