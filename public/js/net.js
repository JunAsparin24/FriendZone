// Thin WebSocket wrapper: auto-reconnect, typed message listeners, heartbeat.
const listeners = {};
let ws = null;

export const net = {
  connected: false,
  onOpen: null,
  onClose: null,

  connect() {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    ws = new WebSocket(`${proto}://${location.host}/ws`);
    ws.onopen = () => {
      net.connected = true;
      net.onOpen?.();
    };
    ws.onmessage = (e) => {
      let msg;
      try { msg = JSON.parse(e.data); } catch { return; }
      listeners[msg.t]?.forEach((fn) => fn(msg));
    };
    ws.onclose = () => {
      const was = net.connected;
      net.connected = false;
      if (was) net.onClose?.();
      setTimeout(() => net.connect(), 1500);
    };
  },

  send(t, data = {}) {
    if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ t, ...data }));
  },

  /** Subscribe to a message type. Returns an unsubscribe function. */
  on(t, fn) {
    (listeners[t] ||= new Set()).add(fn);
    return () => listeners[t].delete(fn);
  },
};

setInterval(() => net.send('ping'), 25000);
