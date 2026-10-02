// Stops movement keys getting "stuck": if the key-up never reaches us (you let go while another window,
// a second monitor or a text box had the focus), the key would stay held forever. So held keys are
// dropped when the window loses focus, the page is hidden or the cursor leaves it, and a watchdog drops
// any key the browser has stopped repeating (a key that's really held keeps sending key-downs).
const HELD_FOR = 1500; // ms without a repeat before a key counts as let go

const MODIFIERS = new Set(['shift', 'control', 'alt', 'meta']); // (these don't repeat on every system)
const seen = new Map();
window.addEventListener('keydown', (e) => seen.set(e.key.toLowerCase(), performance.now()), true);

/** Watch a Set of held keys (lower-case key names). `keep(k)`: keys something else holds on purpose. */
export function guardKeys(keys, keep = () => false) {
  const clear = () => { for (const k of [...keys]) if (!keep(k)) keys.delete(k); };
  window.addEventListener('blur', clear);
  document.addEventListener('visibilitychange', () => { if (document.hidden) clear(); });
  document.documentElement.addEventListener('mouseleave', clear);
  setInterval(() => {
    const now = performance.now();
    for (const k of [...keys]) if (!keep(k) && !MODIFIERS.has(k) && now - (seen.get(k) ?? 0) > HELD_FOR) keys.delete(k);
  }, 250);
}
