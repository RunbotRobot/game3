import { el } from '../ui/dom.js';

/**
 * The apparatus, drawn instead of described. Parts appear as small touchable
 * marks over the scene; tapping one touches it, dragging one pulls at it.
 * The model owns what exists and where by writing world.rig.<id> — this
 * mechanic only ever renders what it is told.
 */
export default {
  id: 'rig',
  name: 'The Apparatus',
  blurb: 'The mechanism is drawn now, not described. Touch it, or drag it.',

  install(g) {
    const s = g.mech('rig');
    s.parts = s.parts || {};
  },

  prompt(g) {
    const s = g.mech('rig');
    const parts = Object.entries(s.parts);
    const known = parts.length
      ? parts.map(([id, p]) => `${id}: "${p.label}" ${p.glyph} at ${p.x.toFixed(2)},${p.y.toFixed(2)} — ${p.stage}${p.hot ? ' · drawing the eye' : ''}`).join('\n  ')
      : '(nothing placed yet)';
    return `THE APPARATUS is drawn on screen instead of described in prose. Current parts:\n  ${known}\n`
      + `Add or move a part with {"op":"set","path":"world.rig.<short-id>","value":{"label":"the axle","glyph":"⚙","x":0.5,"y":0.4,"stage":"ok","hot":false}}. `
      + `label: two or three words, shown as a caption. glyph: one or two characters — a single mark, not a picture. `
      + `x,y: 0 to 1, screen position. stage: "ok" | "strained" | "broken" — controls how urgent it looks. `
      + `hot: true only for the one or two parts that matter most right now. `
      + `Remove a part with {"op":"del","path":"world.rig.<id>"} the instant it is destroyed, consumed, or left behind — never leave a stale mark on screen. `
      + `The player acts on the apparatus directly: "(touch: <label>)" and "(pull: <label>)" arrive as input instead of typed sentences. `
      + `Let the diagram carry the description. Narration should react in a sentence or two, not restate what is already drawn.`;
  },

  afterTurn(g) {
    const s = g.mech('rig');
    for (const [id, v] of Object.entries(g.state.world.rig || {})) {
      if (v === null) { delete s.parts[id]; continue; }
      if (!v || typeof v !== 'object') continue;
      s.parts[id] = {
        label: String(v.label ?? s.parts[id]?.label ?? id).slice(0, 40),
        glyph: String(v.glyph ?? s.parts[id]?.glyph ?? '•').slice(0, 2),
        x: clamp01(v.x, s.parts[id]?.x ?? 0.5),
        y: clamp01(v.y, s.parts[id]?.y ?? 0.5),
        stage: ['ok', 'strained', 'broken'].includes(v.stage) ? v.stage : (s.parts[id]?.stage ?? 'ok'),
        hot: !!v.hot,
      };
    }
    g.state.world.rig = {};   // the delta channel; mech.parts is the record that persists
  },

  composer: () => ({ placeholder: 'touch or drag the apparatus, or type instead…' }),

  hud(g) {
    const n = Object.keys(g.mech('rig').parts).length;
    return n ? null : null;   // no HUD footprint — it lives over the scene, not in the panel column
  },

  render(g) {
    return Object.entries(g.mech('rig').parts).map(([id, p]) => makePart(g, id, p));
  },
};

function clamp01(v, fallback) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(0.96, Math.max(0.04, n)) : fallback;
}

function makePart(g, id, p) {
  const node = el('button.rig-part', {
    'data-stage': p.stage,
    title: `touch or drag: ${p.label}`,
    style: { left: `${p.x * 100}%`, top: `${p.y * 100}%` },
  }, el('span.rig-glyph', { text: p.glyph }), el('span.rig-label', { text: p.label }));
  if (p.hot) node.classList.add('hot');

  // Tap touches it; a real drag pulls at it instead. Distinguished by movement,
  // same pattern as the floating fragments — and for the same reason: the
  // synthesized click after a touch must never reach whatever is behind this.
  node.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); });
  node.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    e.stopPropagation();
    const from = { x: e.clientX, y: e.clientY };
    let dragged = false;
    node.setPointerCapture(e.pointerId);

    const move = (ev) => {
      if (!dragged && Math.hypot(ev.clientX - from.x, ev.clientY - from.y) < 10) return;
      dragged = true;
      node.style.transform = `translate(calc(-50% + ${ev.clientX - from.x}px), calc(-50% + ${ev.clientY - from.y}px))`;
    };
    const done = () => {
      node.removeEventListener('pointermove', move);
      node.removeEventListener('pointerup', done);
      node.removeEventListener('pointercancel', done);
      if (node.hasPointerCapture?.(e.pointerId)) node.releasePointerCapture(e.pointerId);
      node.style.transition = 'transform .2s ease';
      node.style.transform = '';
      setTimeout(() => { node.style.transition = ''; }, 220);
      if (g.busy) return;
      g.submit(dragged ? `(pull: ${p.label})` : `(touch: ${p.label})`);
    };
    node.addEventListener('pointermove', move);
    node.addEventListener('pointerup', done);
    node.addEventListener('pointercancel', done);
  });

  return node;
}
