import { el, $ } from './dom.js';
import { createStage } from './stage.js';
import { active } from '../mechanics/index.js';

export function createUI(g) {
  const logEl = $('#log'), hudEl = $('#hud'), choicesEl = $('#choices');
  const inputEl = $('#input'), statusEl = $('#status'), modal = $('#modal');
  const floatersEl = $('#floaters');
  const rigEl = $('#rig');
  const stage = createStage(g, $('#stage'));

  const jumpEl = $('#btn-jump');

  // Stick to the bottom only while the player is already there. Scrolling up is
  // how you read at your own speed, and yanking the view back down mid-paragraph
  // is the fastest way to make a game unreadable.
  let pinned = true;
  let unread = 0;

  const atBottom = () => logEl.scrollHeight - logEl.scrollTop - logEl.clientHeight < 48;
  // Follow instantly. Animating it would fire scroll events reading "not at the
  // bottom" mid-flight, which would unpin the view the moment it auto-scrolled.
  const scroll = () => { logEl.scrollTop = logEl.scrollHeight; };

  function showJump() {
    jumpEl.hidden = pinned;
    jumpEl.textContent = unread > 1 ? `↓ ${unread} new` : '↓ new';
  }

  logEl.addEventListener('scroll', () => {
    const wasPinned = pinned;
    pinned = atBottom();
    if (pinned && !wasPinned) unread = 0;
    showJump();
  }, { passive: true });

  jumpEl.addEventListener('click', () => {
    pinned = true; unread = 0; showJump();
    logEl.scrollTo({ top: logEl.scrollHeight, behavior: 'smooth' });
  });

  function entry(cls, node) {
    logEl.append(el(`div.entry.${cls}`, {}, node));
    // Keep the DOM bounded on a long session; the save keeps the real history.
    // Trimming from the top shifts everything up, so give the reader their place back.
    while (logEl.childElementCount > 220) {
      const first = logEl.firstElementChild;
      const shed = first.offsetHeight + parseFloat(getComputedStyle(first).marginBottom || 0);
      first.remove();
      if (!pinned) logEl.scrollTop = Math.max(0, logEl.scrollTop - shed);
    }
    if (pinned) scroll();
    else { unread += 1; showJump(); }
  }

  const ui = {
    stage,

    /** True while the player has scrolled up to read. Timed mechanics wait. */
    get reading() { return !pinned; },

    toBottom() { pinned = true; unread = 0; showJump(); scroll(); },


    narration(text) {
      entry('narration', String(text).split(/\n{2,}/).map((p) => el('p', { text: p.trim() })));
    },
    player(text) { entry('player', el('span', { text })); },
    system(text) { entry('system', el('span', { text })); },
    error(text, retry) {
      entry('error', el('span', {}, `⚠ ${text}`,
        retry ? el('button', { style: { marginLeft: '10px' }, onClick: (e) => { e.target.closest('.entry').remove(); retry(); } }, 'try again') : null));
    },
    upheaval(text) { entry('upheaval', el('span', { text })); },

    status(text, thinking = false) {
      statusEl.textContent = text || '';
      statusEl.classList.toggle('thinking', !!thinking);
    },

    /** Put text in the composer without sending it. */
    suggest(text) { inputEl.value = text; inputEl.focus(); },

    renderChoices(list) {
      choicesEl.replaceChildren(...(list || []).slice(0, 5).map((c) =>
        el('button', { onClick: () => g.submit(String(c)) }, String(c))));
    },

    renderHud() {
      const blocks = active(g).map((m) => { try { return m.hud?.(g); } catch { return null; } }).filter(Boolean);
      hudEl.replaceChildren(...blocks);
    },

    renderEra() {
      const { era } = g.state;
      $('#era-index').textContent = roman(era.index);
      $('#era-name').textContent = era.name;
      $('#era-tagline').textContent = era.tagline || '';
      ui.applyPalette(era.palette);
      stage.setMotion(era.motion);
      inputEl.placeholder = active(g).map((m) => m.composer?.(g)?.placeholder).find(Boolean) || 'what do you do?';
    },

    applyPalette(p) {
      if (!p) return;
      const root = document.documentElement.style;
      for (const k of ['bg', 'fg', 'accent']) if (isHex(p[k])) root.setProperty(`--${k}`, p[k]);
      root.setProperty('color-scheme', isDark(p.bg) ? 'dark' : 'light');
      // Android paints the status bar with this, so the era should own it too.
      if (isHex(p.bg)) document.querySelector('meta[name=theme-color]')?.setAttribute('content', p.bg);
    },

    toggleHud(force) {
      const open = force ?? !document.body.classList.contains('hud-open');
      document.body.classList.toggle('hud-open', open);
    },

    renderDrift() {
      const { pressure, threshold } = g.state.drift;
      $('#drift-fill').style.width = `${Math.min(100, (pressure / threshold) * 100)}%`;
    },

    renderClock() {
      const m = Math.floor(g.state.meta.playMs / 60000);
      $('#clock').textContent = `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`;
    },

    // --- the apparatus overlay ----------------------------------------------
    renderRig() {
      const parts = active(g).flatMap((m) => { try { return m.render?.(g) || []; } catch { return []; } });
      rigEl.replaceChildren(...parts);
    },

    // --- floating fragments -------------------------------------------------
    renderFloaters() {
      floatersEl.replaceChildren();
      for (const f of g.state.floaters) floatersEl.append(makeFloater(g, f));
    },
    clearFloaters() {
      g.state.floaters = [];
      ui.renderFloaters();
      g.save();
    },

    addFloater(f) {
      g.state.floaters = g.state.floaters.filter((x) => x.id !== f.id);
      g.state.floaters.push(f);
      while (g.state.floaters.length > 8) {
        const oldest = g.state.floaters.findIndex((x) => !x.sticky);
        g.state.floaters.splice(oldest < 0 ? 0 : oldest, 1);
      }
      ui.renderFloaters();
    },

    /** Fragments last a few turns, then let go. Only the rewrite nudge sticks. */
    ageFloaters() {
      const before = g.state.floaters.length;
      g.state.floaters = g.state.floaters.filter((f) => f.sticky || (f.ttl = (f.ttl ?? 0) - 1) > 0);
      if (g.state.floaters.length !== before) ui.renderFloaters();
    },

    // --- modal --------------------------------------------------------------
    openModal(...nodes) {
      $('#modal-body').replaceChildren(...nodes);
      if (!modal.open) modal.showModal();
    },
    closeModal() { if (modal.open) modal.close(); },

    // On a phone, refocusing after every turn throws the keyboard up over the
    // prose you just asked for. Let the player decide when to type.
    focus() { if (!matchMedia('(hover: none), (pointer: coarse)').matches) inputEl.focus(); },
  };

  modal.addEventListener('click', (e) => { if (e.target === modal) modal.close(); });
  return ui;
}

function makeFloater(g, f) {
  const node = el('div.floater', {
    text: f.text,
    title: f.sticky ? 'click to dismiss' : 'click to dismiss · drag to move',
  });
  const place = () => {
    node.style.left = `${f.x * 100}%`;
    node.style.top = `${f.y * 100}%`;
  };
  place();

  // Nothing that happens on a fragment may reach the page behind it. A touch
  // produces a synthesized click after pointerup, and by then the fragment is
  // gone — so the click would land on the choice button it was covering.
  node.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); });

  node.addEventListener('pointerdown', (e) => {
    e.preventDefault();          // suppresses the compatibility mouse/click events
    e.stopPropagation();
    // Grab offset: without it the box snaps its own corner to the cursor, which
    // reads as the thing lurching away from you every time you touch it.
    const box = node.getBoundingClientRect();
    const grabX = e.clientX - box.left;
    const grabY = e.clientY - box.top;
    const from = { x: e.clientX, y: e.clientY };
    let dragged = false;

    node.setPointerCapture(e.pointerId);

    const move = (ev) => {
      if (!dragged && Math.hypot(ev.clientX - from.x, ev.clientY - from.y) < 4) return;
      dragged = true;
      node.classList.add('dragging');
      f.x = Math.max(0, Math.min(0.95, (ev.clientX - grabX) / window.innerWidth));
      f.y = Math.max(0, Math.min(0.95, (ev.clientY - grabY) / window.innerHeight));
      place();
    };

    const done = () => {
      node.classList.remove('dragging');
      node.removeEventListener('pointermove', move);
      node.removeEventListener('pointerup', done);
      node.removeEventListener('pointercancel', done);
      if (node.hasPointerCapture?.(e.pointerId)) node.releasePointerCapture(e.pointerId);
      if (dragged) g.save();
      else dismissFloater(g, f, node);   // a click that did not move is a dismissal
    };

    node.addEventListener('pointermove', move);
    node.addEventListener('pointerup', done);
    node.addEventListener('pointercancel', done);
  });

  return node;
}

function dismissFloater(g, f, node) {
  g.state.floaters = g.state.floaters.filter((x) => x !== f);
  node.classList.add('leaving');
  node.style.pointerEvents = 'auto';   // keep absorbing until it is actually gone
  node.addEventListener('animationend', () => node.remove(), { once: true });
  setTimeout(() => node.remove(), 600);   // in case the animation never fires
  g.save();
}

const isHex = (v) => typeof v === 'string' && /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(v.trim());

function isDark(hex) {
  if (!isHex(hex)) return true;
  let h = hex.replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const n = parseInt(h, 16);
  return (0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) < 128;
}

function roman(n) {
  const map = [[1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'],
    [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']];
  let out = '';
  for (const [v, s] of map) while (n >= v) { out += s; n -= v; }
  return out || 'I';
}
