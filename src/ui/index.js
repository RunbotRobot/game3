import { el, $ } from './dom.js';
import { createStage } from './stage.js';
import { active } from '../mechanics/index.js';

export function createUI(g) {
  const logEl = $('#log'), hudEl = $('#hud'), choicesEl = $('#choices');
  const inputEl = $('#input'), statusEl = $('#status'), modal = $('#modal');
  const floatersEl = $('#floaters');
  const stage = createStage(g, $('#stage'));

  const scroll = () => { logEl.scrollTop = logEl.scrollHeight; };

  function entry(cls, node) {
    logEl.append(el(`div.entry.${cls}`, {}, node));
    // Keep the DOM bounded on a long session; the save keeps the real history.
    while (logEl.childElementCount > 220) logEl.firstElementChild.remove();
    scroll();
  }

  const ui = {
    stage,

    narration(text) {
      entry('narration', String(text).split(/\n{2,}/).map((p) => el('p', { text: p.trim() })));
    },
    player(text) { entry('player', el('span', { text })); },
    system(text) { entry('system', el('span', { text })); },
    error(text) { entry('error', el('span', { text: `⚠ ${text}` })); },
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
      document.documentElement.style.setProperty('color-scheme', isDark(p.bg) ? 'dark' : 'light');
    },

    renderDrift() {
      const { pressure, threshold } = g.state.drift;
      $('#drift-fill').style.width = `${Math.min(100, (pressure / threshold) * 100)}%`;
    },

    renderClock() {
      const m = Math.floor(g.state.meta.playMs / 60000);
      $('#clock').textContent = `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`;
    },

    // --- floating fragments -------------------------------------------------
    renderFloaters() {
      floatersEl.replaceChildren();
      for (const f of g.state.floaters) floatersEl.append(makeFloater(g, f));
    },
    addFloater(f) {
      g.state.floaters.push(f);
      if (g.state.floaters.length > 14) g.state.floaters.shift();
      ui.renderFloaters();
    },

    // --- modal --------------------------------------------------------------
    openModal(...nodes) {
      $('#modal-body').replaceChildren(...nodes);
      if (!modal.open) modal.showModal();
    },
    closeModal() { if (modal.open) modal.close(); },

    focus() { inputEl.focus(); },
  };

  modal.addEventListener('click', (e) => { if (e.target === modal) modal.close(); });
  return ui;
}

function makeFloater(g, f) {
  const node = el('div.floater', { text: f.text });
  const place = () => {
    node.style.left = `${f.x * 100}%`;
    node.style.top = `${f.y * 100}%`;
  };
  place();
  node.addEventListener('pointerdown', (e) => {
    node.classList.add('dragging');
    node.setPointerCapture(e.pointerId);
    const move = (ev) => {
      f.x = Math.max(0, Math.min(0.95, ev.clientX / window.innerWidth));
      f.y = Math.max(0, Math.min(0.95, ev.clientY / window.innerHeight));
      place();
    };
    const up = () => {
      node.classList.remove('dragging');
      node.removeEventListener('pointermove', move);
      g.save();
    };
    node.addEventListener('pointermove', move);
    node.addEventListener('pointerup', up, { once: true });
  });
  return node;
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
