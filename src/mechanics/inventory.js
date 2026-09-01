import { block, el } from '../ui/dom.js';

/** Things you are carrying. Clicking one drops it into the composer. */
export default {
  id: 'inventory',
  name: 'Carrying',
  blurb: 'You notice, for the first time, that your hands are full.',
  prompt: (g) => {
    const inv = g.state.player.inventory || [];
    return `INVENTORY is active. Carrying: ${inv.length ? inv.join(', ') : '(nothing)'}. `
      + `Give and take items with {"op":"push"/"pull","path":"player.inventory","value":"a rusty key"}. `
      + `Items must matter later — never hand out flavour junk.`;
  },
  hud: (g) => {
    const inv = g.state.player.inventory || [];
    return block('carrying', inv.length
      ? el('ul.hud-list', {}, ...inv.map((it) => el('li', {
          style: { cursor: 'pointer' },
          onClick: () => g.ui.suggest(`use the ${it}`),
        }, String(it))))
      : el('div', { text: 'nothing', style: { opacity: .6 } }));
  },
};
