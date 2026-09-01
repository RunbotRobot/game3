import { block, row } from '../ui/dom.js';

const key = (x, y) => `${x},${y}`;

/** The prose becomes a place with coordinates. Arrows move you for free;
 *  only stepping onto unmapped ground costs a turn. */
export default {
  id: 'grid',
  name: 'Cartography',
  blurb: 'Space has resolved into squares. Arrow keys move you.',
  install(g, config) {
    const s = g.mech('grid');
    s.w = Number(config.w) || 9;
    s.h = Number(config.h) || 9;
    s.x = s.x ?? Math.floor(s.w / 2);
    s.y = s.y ?? Math.floor(s.h / 2);
    s.tiles = s.tiles || {};
    s.tiles[key(s.x, s.y)] = s.tiles[key(s.x, s.y)] || { glyph: '·', label: 'where you started' };
  },
  keydown(g, e) {
    const s = g.mech('grid');
    const d = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] }[e.key];
    if (!d || g.busy) return false;
    const nx = Math.max(0, Math.min(s.w - 1, s.x + d[0]));
    const ny = Math.max(0, Math.min(s.h - 1, s.y + d[1]));
    if (nx === s.x && ny === s.y) return true;
    s.x = nx; s.y = ny;
    const known = s.tiles[key(nx, ny)];
    if (known) { g.ui.system(`⟶ ${known.label || key(nx, ny)}`); g.ui.renderHud(); g.save(); }
    else g.submit(`(step onto unmapped ground at ${nx},${ny})`);
    return true;
  },
  prompt: (g) => {
    const s = g.mech('grid');
    const seen = Object.keys(s.tiles).length;
    return `A ${s.w}x${s.h} GRID MAP is active. The player stands at ${s.x},${s.y}; ${seen} squares are mapped. `
      + `When they enter unmapped ground, name that square with `
      + `{"op":"set","path":"world.map.${s.x}_${s.y}","value":{"glyph":"#","label":"the drowned kitchen"}} `
      + `— glyph is ONE character. Keep squares terse and distinct.`;
  },
  /** Absorb any world.map.* the model wrote into the grid's own tile store. */
  afterTurn(g) {
    const s = g.mech('grid');
    const written = g.state.world.map || {};
    for (const [k, v] of Object.entries(written)) {
      const m = k.match(/^(\d+)_(\d+)$/);
      if (m && v && typeof v === 'object') s.tiles[key(+m[1], +m[2])] = { glyph: String(v.glyph || '·')[0], label: v.label || '' };
    }
    if (!s.tiles[key(s.x, s.y)]) s.tiles[key(s.x, s.y)] = { glyph: '·', label: '' };
  },
  hud: (g) => {
    const s = g.mech('grid');
    return block('position', row('at', `${s.x}, ${s.y}`), row('mapped', `${Object.keys(s.tiles).length} / ${s.w * s.h}`),
      row('here', s.tiles[key(s.x, s.y)]?.label || '—'));
  },
  draw(g, ctx, t, W, H) {
    const s = g.mech('grid');
    const cell = Math.min(26, Math.floor(Math.min(W, H) / (Math.max(s.w, s.h) + 6)));
    if (cell < 6) return;
    // Lower-left: the log column is usually empty down here, and the HUD is not.
    const ox = 26, oy = H - cell * s.h - 128;
    const style = getComputedStyle(document.documentElement);
    const accent = style.getPropertyValue('--accent').trim() || '#7fd1c1';
    const fg = style.getPropertyValue('--fg').trim() || '#ccc';
    ctx.save();
    ctx.font = `${Math.floor(cell * 0.62)}px ui-monospace, monospace`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (let y = 0; y < s.h; y++) {
      for (let x = 0; x < s.w; x++) {
        const tile = s.tiles[key(x, y)];
        const cx = ox + x * cell + cell / 2, cy = oy + y * cell + cell / 2;
        if (!tile) { ctx.globalAlpha = 0.13; ctx.fillStyle = fg; ctx.fillRect(cx - 1, cy - 1, 2, 2); continue; }
        ctx.globalAlpha = 0.5; ctx.fillStyle = fg; ctx.fillText(tile.glyph, cx, cy);
      }
    }
    const px = ox + s.x * cell + cell / 2, py = oy + s.y * cell + cell / 2;
    ctx.globalAlpha = 0.45 + 0.35 * Math.sin(t / 420);
    ctx.strokeStyle = accent; ctx.lineWidth = 1.2;
    ctx.strokeRect(px - cell / 2 + 1.5, py - cell / 2 + 1.5, cell - 3, cell - 3);
    ctx.restore();
  },
};
