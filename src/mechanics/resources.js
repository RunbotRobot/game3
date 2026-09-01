import { block, row, meter } from '../ui/dom.js';

/** Named meters (clarity, dread, fuel, favour...). The model invents the names. */
export default {
  id: 'resources',
  name: 'Meters',
  blurb: 'Some things about you are now countable.',
  prompt: (g) => {
    const r = g.state.player.resources || {};
    const listed = Object.keys(r).length ? Object.entries(r).map(([k, v]) => `${k}=${v}`).join(', ') : '(none yet)';
    return `METERS are active. Current: ${listed}. Adjust them with {"op":"inc","path":"player.resources.<name>","value":N}. `
      + `Invent new meters that fit the current era and retire ones that stop mattering (use "del"). `
      + `Meters between 0 and 10. Let them actually gate outcomes — refuse or complicate actions when a meter is low.`;
  },
  hud: (g) => {
    const r = g.state.player.resources || {};
    const keys = Object.keys(r);
    if (!keys.length) return null;
    return block('meters', ...keys.map((k) => {
      const v = Number(r[k]) || 0;
      const wrap = document.createElement('div');
      wrap.append(row(k, v), meter(v / 10));
      return wrap;
    }));
  },
};
