// Doodle Guess: one player draws a secret word, everyone else races to guess it in the chat.
// The server runs the turns, words, hints and scoring; strokes are relayed in small chunks.
import { net } from '../net.js';
import { S, esc, nameOf, colorOf, fmt } from '../state.js';
import { portraitInto } from '../avatar.js';
import { iconSvg } from '../icons.js';
import { sfx } from '../sfx.js';
import { $, listen, hiDpiCanvas, loop, confetti } from './util.js';

const CW = 800, CH = 540;
const COLORS = ['#1a1330', '#ffffff', '#8a8fa8', '#e0463c', '#ff9f43', '#ffd84d', '#6ee7a0', '#2f9e44', '#39c6ff', '#3b5bdb', '#b77bff', '#ff5dac', '#8b5a2b', '#f6c9a0'];
const SIZES = [4, 10, 22, 44];

export function doodle(body) {
  body.innerHTML = `
    <div class="dd-head"><h2>${iconSvg('doodle')} Doodle Guess</h2><div class="dd-round"></div></div>
    <div class="dd-main">
      <div class="dd-players"></div>
      <div class="dd-center">
        <div class="dd-top"><div class="dd-word"></div><div class="dd-timer"><i></i><b></b></div></div>
        <div class="dd-board"><canvas class="dd-canvas"></canvas><div class="dd-overlay hidden"></div></div>
        <div class="dd-tools hidden">
          <div class="dd-colors">${COLORS.map((c) => `<button data-color="${c}" style="--c:${c}" title="${c}"></button>`).join('')}</div>
          <div class="dd-sizes">${SIZES.map((s) => `<button data-size="${s}"><i style="--s:${Math.min(26, s * 0.7 + 4)}px"></i></button>`).join('')}</div>
          <button class="btn small" data-tool="eraser" title="Eraser">🧽</button>
          <button class="btn small" data-tool="undo" title="Undo (Ctrl+Z)">↶ Undo</button>
          <button class="btn small ghost" data-tool="clear">🗑 Clear</button>
        </div>
      </div>
      <div class="dd-chat">
        <ul class="dd-log"></ul>
        <form class="dd-form"><input maxlength="60" placeholder="Type your guess…" autocomplete="off"></form>
      </div>
    </div>`;
  const canvas = $(body, 'canvas'), overlay = $(body, '.dd-overlay'), tools = $(body, '.dd-tools');
  const playersEl = $(body, '.dd-players'), wordEl = $(body, '.dd-word'), timerEl = $(body, '.dd-timer');
  const logEl = $(body, '.dd-log'), form = $(body, '.dd-form'), input = $(body, '.dd-form input');
  const roundEl = $(body, '.dd-round');
  const ctx = hiDpiCanvas(canvas, CW, CH);

  let view = null, endsAt = 0, lastSecond = -1, word = null;
  let strokes = [];                 // { id, c, w, p: [[x,y], ...] } in 0..1 coordinates
  let color = COLORS[0], size = SIZES[1], eraser = false;
  let drawing = null, pending = [], lastFlush = 0, strokeSeq = Math.floor(Math.random() * 1e6);
  let portraitsFor = '';

  const amDrawer = () => view?.drawer === S.me && view?.state === 'drawing';

  // ---- canvas ---------------------------------------------------------------------

  function paper() {
    ctx.fillStyle = '#fffdf6';
    ctx.fillRect(0, 0, CW, CH);
  }

  function segment(s, from, to) {
    ctx.strokeStyle = s.c;
    ctx.lineWidth = s.w;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(from[0] * CW, from[1] * CH);
    ctx.lineTo(to[0] * CW, to[1] * CH);
    ctx.stroke();
  }

  function drawStroke(s, fromIndex = 0) {
    const p = s.p;
    if (!p.length) return;
    if (p.length === 1 || (fromIndex === 0 && p.length === 1)) {
      ctx.fillStyle = s.c;
      ctx.beginPath(); ctx.arc(p[0][0] * CW, p[0][1] * CH, s.w / 2, 0, Math.PI * 2); ctx.fill();
      return;
    }
    for (let i = Math.max(1, fromIndex); i < p.length; i++) segment(s, p[i - 1], p[i]);
  }

  function redraw() {
    paper();
    for (const s of strokes) drawStroke(s);
  }

  /** Add points to a stroke (starting it if needed) and draw only the new part. */
  function extend(id, c, w, pts) {
    let s = strokes[strokes.length - 1];
    if (!s || s.id !== id) {
      s = { id, c, w, p: [] };
      strokes.push(s);
    }
    const from = s.p.length;
    s.p.push(...pts);
    drawStroke(s, from);
  }

  const toBoard = (e) => {
    const r = canvas.getBoundingClientRect();
    return [Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), Math.min(1, Math.max(0, (e.clientY - r.top) / r.height))];
  };

  function flush(force = false) {
    const now = performance.now();
    if (!drawing || !pending.length || (!force && now - lastFlush < 50)) return;
    lastFlush = now;
    net.send('doodle_draw', { id: drawing.id, c: drawing.c, w: drawing.w, p: pending.map(([x, y]) => [+x.toFixed(4), +y.toFixed(4)]) });
    pending = [];
  }

  canvas.onpointerdown = (e) => {
    if (!amDrawer()) return;
    e.preventDefault();
    try { canvas.setPointerCapture(e.pointerId); } catch { /* synthetic */ }
    drawing = { id: ++strokeSeq, c: eraser ? '#fffdf6' : color, w: eraser ? size * 1.6 : size };
    const p = toBoard(e);
    extend(drawing.id, drawing.c, drawing.w, [p]);
    pending = [p];
    flush(true);
  };
  canvas.onpointermove = (e) => {
    if (!drawing) return;
    const p = toBoard(e);
    const s = strokes[strokes.length - 1];
    const last = s.p[s.p.length - 1];
    if (Math.hypot((p[0] - last[0]) * CW, (p[1] - last[1]) * CH) < 2) return;
    extend(drawing.id, drawing.c, drawing.w, [p]);
    pending.push(p);
    sfx('brush');
    flush();
  };
  const endStroke = () => {
    if (!drawing) return;
    flush(true);
    drawing = null;
  };
  canvas.onpointerup = endStroke;
  canvas.onpointercancel = endStroke;
  window.addEventListener('pointerup', endStroke);

  tools.addEventListener('click', (e) => {
    const c = e.target.closest('[data-color]');
    const s = e.target.closest('[data-size]');
    const t = e.target.closest('[data-tool]');
    if (c) { color = c.dataset.color; eraser = false; }
    if (s) size = Number(s.dataset.size);
    if (t?.dataset.tool === 'eraser') eraser = !eraser;
    if (t?.dataset.tool === 'undo') undo();
    if (t?.dataset.tool === 'clear' && strokes.length) {
      strokes = [];
      redraw();
      net.send('doodle_clear');
      sfx('whoosh');
    }
    renderTools();
  });
  function undo() {
    if (!amDrawer() || !strokes.length) return;
    strokes.pop();
    redraw();
    net.send('doodle_undo');
    sfx('pickup');
  }
  const onKey = (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && amDrawer()) { e.preventDefault(); undo(); }
  };
  window.addEventListener('keydown', onKey);

  function renderTools() {
    tools.querySelectorAll('[data-color]').forEach((b) => b.classList.toggle('on', !eraser && b.dataset.color === color));
    tools.querySelectorAll('[data-size]').forEach((b) => b.classList.toggle('on', Number(b.dataset.size) === size));
    tools.querySelector('[data-tool=eraser]').classList.toggle('primary', eraser);
    canvas.style.cursor = amDrawer() ? (eraser ? 'cell' : 'crosshair') : 'default';
  }

  // ---- chat -------------------------------------------------------------------------

  function log(html, cls = '') {
    const li = document.createElement('li');
    li.className = cls;
    li.innerHTML = html;
    logEl.append(li);
    while (logEl.children.length > 60) logEl.firstChild.remove();
    logEl.scrollTop = logEl.scrollHeight;
  }
  form.onsubmit = (e) => {
    e.preventDefault();
    const text = input.value.trim();
    if (!text) return;
    net.send('doodle_guess', { text });
    input.value = '';
  };

  // ---- rendering the state ------------------------------------------------------------

  function renderPlayers() {
    const list = [...(view?.players ?? [])].sort((a, b) => (view.scores[b] ?? 0) - (view.scores[a] ?? 0));
    playersEl.innerHTML = list.map((k, i) => `
      <div class="dd-p ${k === view.drawer ? 'drawing' : ''} ${k in (view.guessed ?? {}) ? 'got' : ''}" data-k="${esc(k)}">
        <span class="dd-rank">#${i + 1}</span><span class="dd-av"></span>
        <span class="dd-name"><b style="color:${colorOf(k)}">${esc(nameOf(k))}${k === S.me ? ' <small>(you)</small>' : ''}</b>
          <small>${fmt(view.scores[k] ?? 0)} pts</small></span>
        <span class="dd-badge">${k === view.drawer ? '✏️' : k in (view.guessed ?? {}) ? '✅' : ''}</span>
      </div>`).join('') || '<p class="muted small">Nobody here yet.</p>';
    const key = list.join('|');
    playersEl.querySelectorAll('[data-k]').forEach((el) => portraitInto(el.querySelector('.dd-av'), S.players[el.dataset.k]?.look, 34, 34, { zoom: 'head' }));
    portraitsFor = key;
  }

  function renderWord() {
    if (!view || view.state === 'idle' || view.state === 'over') { wordEl.innerHTML = ''; return; }
    if (view.state === 'choosing') {
      wordEl.innerHTML = `<span class="muted">${view.drawer === S.me ? 'Pick a word!' : `${esc(nameOf(view.drawer))} is choosing…`}</span>`;
      return;
    }
    const shown = word ?? view.hint ?? '';
    const letters = [...shown].map((ch) => (ch === ' ' ? '<i class="gap"></i>' : `<i>${ch === '_' ? '' : esc(ch)}</i>`)).join('');
    const count = (view.hint ?? shown).replace(/[^_a-zA-Z]/g, '').length;
    wordEl.innerHTML = `<span class="dd-letters ${word ? 'known' : ''}">${letters}</span><small>${count} letters</small>`;
  }

  function renderOverlay() {
    const st = view?.state;
    const players = view?.players ?? [];
    let html = '';
    if (!view || st === 'idle') {
      html = `<div class="dd-card">
        <div class="dd-big">${iconSvg('doodle')}</div>
        <h3>Doodle Guess</h3>
        <p>Take turns drawing a secret word while everyone else guesses in the chat. Faster guesses score more, and the artist scores for every correct guess!</p>
        <p class="muted">${players.length} player${players.length === 1 ? '' : 's'} here · you need at least 2</p>
        <button class="btn primary" data-start ${players.length < 2 ? 'disabled' : ''}>🎨 Start game</button>
        ${players.length < 2 ? '<p class="muted small">Invite friends to the Doodle Studio!</p>' : ''}
      </div>`;
    } else if (st === 'choosing') {
      html = view.drawer === S.me
        ? `<div class="dd-card"><h3>Your turn to draw! Pick a word:</h3><div class="dd-choices">${(view.choices ?? []).map((w, i) => `<button class="btn" data-pick="${i}">${esc(w)}</button>`).join('')}</div>
            <p class="muted small">…or make up your own:</p>
            <form class="dd-custom" autocomplete="off"><input name="word" maxlength="24" placeholder="Your own word" autocomplete="off"><button class="btn primary">Draw it</button></form>
            <p class="error dd-custom-err"></p></div>`
        : `<div class="dd-card"><div class="dd-av-big" data-k="${esc(view.drawer)}"></div><h3>${esc(nameOf(view.drawer))} is choosing a word…</h3><p class="muted">Get ready to guess!</p></div>`;
    } else if (st === 'reveal') {
      const got = Object.entries(view.guessed ?? {});
      html = `<div class="dd-card"><p class="muted">The word was</p><div class="dd-reveal">${esc(view.word ?? '')}</div>
        ${got.length ? `<ul class="dd-gains">${got.map(([k, pts]) => `<li><b style="color:${colorOf(k)}">${esc(nameOf(k))}</b> +${pts}</li>`).join('')}</ul>` : '<p>Nobody got it this time!</p>'}</div>`;
    } else if (st === 'over') {
      const r = view.ranking ?? [];
      html = `<div class="dd-card"><h3>🏆 Final scores</h3>
        <ol class="dd-podium">${r.map((k, i) => `<li class="p${i}"><span>${['🥇', '🥈', '🥉'][i] ?? `${i + 1}.`}</span><b style="color:${colorOf(k)}">${esc(nameOf(k))}</b><em>${fmt(view.scores[k] ?? 0)}</em></li>`).join('')}</ol>
        <p class="muted small">A new game can start in a moment.</p></div>`;
    }
    // keep a half-typed custom word when the overlay re-renders (someone joins, etc.)
    const typing = overlay.querySelector('.dd-custom input');
    const draftWord = typing?.value ?? '', hadFocus = typing && document.activeElement === typing;
    overlay.innerHTML = html;
    overlay.classList.toggle('hidden', !html);
    const custom = overlay.querySelector('.dd-custom input');
    if (custom) { custom.value = draftWord; if (hadFocus) custom.focus(); }
    overlay.querySelectorAll('.dd-av-big[data-k]').forEach((el) => portraitInto(el, S.players[el.dataset.k]?.look, 90, 90, { zoom: 'head' }));
  }

  function renderAll() {
    renderPlayers();
    renderWord();
    renderOverlay();
    const drawer = amDrawer();
    tools.classList.toggle('hidden', !drawer);
    renderTools();
    const guessing = view?.state === 'drawing' && !drawer && !(S.me in (view.guessed ?? {}));
    input.disabled = view?.state === 'drawing' && !guessing;
    input.placeholder = drawer ? "You're drawing! Guesses appear here." : view?.state === 'drawing' && !guessing ? 'You got it! Waiting for the others…'
      : guessing ? 'Type your guess…' : 'Chat…';
    roundEl.textContent = view && view.state !== 'idle' && view.turns ? `Turn ${Math.min(view.turn, view.turns)} of ${view.turns}` : '';
  }

  // ---- network -----------------------------------------------------------------------

  const off = listen({
    doodle: (m) => {
      const prev = view;
      view = m;
      endsAt = performance.now() + m.left * 1000;
      if (m.word) word = m.word;
      if (m.state === 'choosing' || m.state === 'idle') word = null;
      if (!prev || prev.state !== m.state || prev.drawer !== m.drawer) {
        strokes = m.strokes.map((s) => ({ ...s, p: [...s.p] }));
        redraw();
        if (m.state === 'choosing') {
          sfx('newturn');
          log(`✏️ <b style="color:${colorOf(m.drawer)}">${esc(nameOf(m.drawer))}</b> is drawing next!`, 'sys');
        }
        if (m.state === 'reveal') { sfx('notify'); log(`The word was <b>${esc(m.word ?? '')}</b>`, 'sys'); }
        if (m.state === 'over') {
          const winner = m.ranking?.[0];
          sfx(winner === S.me ? 'win' : 'cheer');
          if (winner === S.me) confetti($(body, '.dd-board'), { count: 150 });
        }
        if (m.state === 'drawing' && m.drawer === S.me) sfx('go');
      }
      renderAll();
    },
    doodle_draw: (m) => { extend(m.id, m.c, m.w, m.p); },
    doodle_undo: () => { strokes.pop(); redraw(); },
    doodle_clear: () => { strokes = []; redraw(); },
    doodle_hint: (m) => { if (view) { view.hint = m.hint; renderWord(); sfx('pop'); } },
    doodle_word: (m) => { word = m.word; renderWord(); },
    doodle_guessed: (m) => {
      if (!view) return;
      view.guessed = { ...view.guessed, [m.k]: m.pts };
      view.scores = m.scores;
      if (m.k === S.me) {
        sfx('correct');
        log(`🎉 You got it! <b>+${m.pts}</b>`, 'good');
      } else {
        sfx('guessed');
        log(`✅ <b style="color:${colorOf(m.k)}">${esc(nameOf(m.k))}</b> guessed the word! +${m.pts}`, 'good');
      }
      renderAll();
    },
    doodle_msg: (m) => {
      if (m.sys) { log(esc(m.sys), 'sys'); return; }
      log(`<b style="color:${colorOf(m.k)}">${esc(nameOf(m.k))}</b> ${esc(m.text)}`);
      if (m.k !== S.me) sfx('chat');
    },
    doodle_close: (m) => { log(`🔥 <b>${esc(m.text)}</b> is so close!`, 'close'); sfx('close'); },
    player: () => { if (view) renderPlayers(); },
    error: (m) => {
      if (m.for === 'doodle_pick') {
        m.handled = true;
        const el = overlay.querySelector('.dd-custom-err');
        if (el) el.textContent = m.msg;
        sfx('error');
        return;
      }
      if (m.for !== 'doodle_start') return;
      m.handled = true;
      log(esc(m.msg), 'sys');
      sfx('error');
    },
  });

  overlay.addEventListener('click', (e) => {
    if (e.target.closest('[data-start]')) net.send('doodle_start');
    const pick = e.target.closest('[data-pick]');
    if (pick) net.send('doodle_pick', { i: Number(pick.dataset.pick) });
  });
  overlay.addEventListener('submit', (e) => {
    const form = e.target.closest('.dd-custom');
    if (!form) return;
    e.preventDefault();
    const word = form.word.value.trim();
    if (word) net.send('doodle_pick', { word });
  });

  paper();
  const stop = loop(() => {
    if (!view || !['choosing', 'drawing', 'reveal'].includes(view.state)) {
      timerEl.classList.add('hidden');
      return;
    }
    timerEl.classList.remove('hidden');
    const left = Math.max(0, (endsAt - performance.now()) / 1000);
    timerEl.querySelector('i').style.width = `${(left / Math.max(1, view.dur)) * 100}%`;
    timerEl.querySelector('b').textContent = Math.ceil(left);
    timerEl.classList.toggle('urgent', view.state === 'drawing' && left < 10);
    const sec = Math.ceil(left);
    if (view.state === 'drawing' && sec !== lastSecond && sec <= 10 && sec > 0) sfx('urgent');
    lastSecond = sec;
  });

  log('Welcome to the Doodle Studio! 🎨', 'sys');
  return () => {
    stop();
    off();
    window.removeEventListener('pointerup', endStroke);
    window.removeEventListener('keydown', onKey);
  };
}
