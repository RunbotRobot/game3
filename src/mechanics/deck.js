import { block, el } from '../ui/dom.js';

/** You no longer say what you do. You play what you were dealt. */
export default {
  id: 'deck',
  name: 'The Hand',
  blurb: 'Your options have been dealt to you.',
  install(g, config) {
    const s = g.mech('deck');
    s.cards = Array.isArray(config.cards) && config.cards.length ? config.cards.slice(0, 7)
      : ['PRESS ON', 'LISTEN', 'LIE', 'BURN IT', 'REMEMBER'];
    s.discard = [];
  },
  composer: () => ({ placeholder: 'play a card, or improvise anyway…' }),
  prompt: (g) => {
    const s = g.mech('deck');
    return `A CARD HAND is active: [${s.cards.join(' | ')}]. The player mostly acts by playing one. `
      + `Replace the hand as the story turns, with {"op":"install","mechanic":"deck","config":{"cards":["...","..."]}} `
      + `— 3 to 7 short imperative cards, all-caps, specific to this scene.`;
  },
  hud: (g) => {
    const s = g.mech('deck');
    return block('your hand', el('div', { style: { display: 'flex', flexDirection: 'column', gap: '4px' } },
      ...s.cards.map((c) => el('button', { onClick: () => g.submit(`[play: ${c}]`) }, c))));
  },
};
