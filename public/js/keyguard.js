// Stops movement keys getting "stuck": if the key-up never reaches us (you let go while another window
// or a second monitor had the focus), the key would stay held forever. So held keys are dropped when
// the window loses focus or the page is hidden. (No timers: browsers only repeat the last key pressed,
// so a key that's held while you press another one sends nothing more, but it's still held.)

/** Watch a Set of held keys (lower-case key names). */
export function guardKeys(keys) {
  const clear = () => keys.clear();
  window.addEventListener('blur', clear);
  document.addEventListener('visibilitychange', () => { if (document.hidden) clear(); });
}
