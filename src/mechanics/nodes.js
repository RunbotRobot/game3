import { block, el } from '../ui/dom.js';

/** A constellation of named places. Travel is a click, not a sentence. */
export default {
  id: 'nodes',
  name: 'The Constellation',
  blurb: 'The places you know have arranged themselves into a map.',
  install(g, config) {
    const s = g.mech('nodes');
    s.places = s.places || {};
    s.at = s.at || null;
    (config.places || []).forEach((p) => addPlace(s, p));
  },
  prompt: (g) => {
    const s = g.mech('nodes');
    const names = Object.keys(s.places);
    return `A NODE MAP is active. Known places: ${names.length ? names.join(', ') : '(none)'}; the player is at "${s.at || 'nowhere named'}". `
      + `Reveal a place with {"op":"push","path":"world.places","value":{"name":"the salt observatory","from":"${s.at || ''}"}} `
      + `where "from" is an existing place it connects to. Two to four words per name.`;
  },
  afterTurn(g) {
    const s = g.mech('nodes');
    for (const p of g.state.world.places || []) addPlace(s, p);
    g.state.world.places = [];
  },
  hud: (g) => {
    const s = g.mech('nodes');
    const here = s.places[s.at];
    const links = here ? here.links : Object.keys(s.places);
    return block('travel', links.length
      ? el('div', { style: { display: 'flex', flexDirection: 'column', gap: '4px' } },
          ...links.map((n) => el('button', { onClick: () => { g.mech('nodes').at = n; g.submit(`(travel to ${n})`); } }, n)))
      : el('div', { text: 'nowhere yet', style: { opacity: .6 } }));
  },
  draw(g, ctx, t, W, H) {
    if (W < 620) return;   // on a phone the HUD carries this; the canvas would just fight the text
    const s = g.mech('nodes');
    const names = Object.keys(s.places);
    if (!names.length) return;
    const style = getComputedStyle(document.documentElement);
    const accent = style.getPropertyValue('--accent').trim() || '#7fd1c1';
    ctx.save();
    ctx.translate(W * 0.40, H * 0.58);   // drifts in the open middle, clear of the HUD
    ctx.strokeStyle = accent; ctx.fillStyle = accent;
    for (const n of names) {
      const a = s.places[n];
      for (const m of a.links) {
        const b = s.places[m];
        if (!b) continue;
        ctx.globalAlpha = 0.16;
        ctx.beginPath(); ctx.moveTo(a.px, a.py); ctx.lineTo(b.px, b.py); ctx.stroke();
      }
    }
    ctx.font = '10px ui-monospace, monospace';
    for (const n of names) {
      const a = s.places[n];
      const current = n === s.at;
      ctx.globalAlpha = current ? 0.6 + 0.3 * Math.sin(t / 500) : 0.3;
      ctx.beginPath(); ctx.arc(a.px, a.py, current ? 4 : 2.2, 0, Math.PI * 2); ctx.fill();
      if (current) { ctx.globalAlpha = 0.5; ctx.fillText(n, a.px + 8, a.py + 3); }
    }
    ctx.restore();
  },
};

function addPlace(s, p) {
  const name = typeof p === 'string' ? p : p?.name;
  if (!name || s.places[name]) return;
  const from = typeof p === 'object' ? p.from : null;
  const anchor = from && s.places[from];
  const angle = Math.random() * Math.PI * 2, r = 34 + Math.random() * 40;
  s.places[name] = {
    links: anchor ? [from] : [],   // plain array: state.mech is JSON-serialised into the save
    px: (anchor ? anchor.px : 0) + Math.cos(angle) * r,
    py: (anchor ? anchor.py : 0) + Math.sin(angle) * r,
  };
  if (anchor && !anchor.links.includes(name)) anchor.links.push(name);
  if (!s.at) s.at = name;
}
