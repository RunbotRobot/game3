import { block, row } from '../ui/dom.js';

/** An RPG stat block, plus a real die roll the model must honour. */
export default {
  id: 'stats',
  name: 'Numbers',
  blurb: 'The world has started keeping score.',
  install(g, config) {
    const s = g.mech('stats');
    if (!Object.keys(g.state.player.stats || {}).length) {
      g.state.player.stats = config.stats || { body: 2, mind: 3, nerve: 2, luck: 1 };
    }
    s.lastRoll = null;
  },
  /** The engine rolls, not the model — so the dice cannot be flattered. */
  beforeTurn(g) {
    const s = g.mech('stats');
    s.lastRoll = 1 + Math.floor(Math.random() * 20);
    return `A d20 was rolled for this action and came up ${s.lastRoll}. `
      + `Treat 1 as a real failure with consequences, 20 as extraordinary, and interpolate honestly. `
      + `Mention the number nowhere; show it in what happens.`;
  },
  prompt: (g) => {
    const st = g.state.player.stats || {};
    return `STATS are active: ${Object.entries(st).map(([k, v]) => `${k} ${v}`).join(', ')}. `
      + `Adjust with {"op":"inc","path":"player.stats.<name>","value":N} when the fiction earns it.`;
  },
  hud: (g) => {
    const st = g.state.player.stats || {};
    const roll = g.mech('stats').lastRoll;
    return block('numbers', ...Object.entries(st).map(([k, v]) => row(k, v)),
      roll ? row('last d20', roll) : null);
  },
};
