import { block, row, meter } from '../ui/dom.js';

/** Real-time pressure. When it runs out the world takes a turn without you. */
export default {
  id: 'timer',
  name: 'Pressure',
  blurb: 'Something is now happening whether or not you act.',
  install(g, config) {
    const s = g.mech('timer');
    s.seconds = Number(config.seconds) || 45;
    s.left = s.seconds;
    s.label = config.label || 'it is coming';
    clearInterval(s.handle);
    s.handle = setInterval(() => {
      if (g.busy) return;
      s.left -= 1;
      if (s.left <= 0) { s.left = s.seconds; g.submit('(the moment passes without you)', { silent: true }); }
      g.ui.renderHud();
    }, 1000);
  },
  uninstall(g) { clearInterval(g.mech('timer').handle); },
  afterTurn(g) { const s = g.mech('timer'); s.left = s.seconds; },
  prompt: (g) => `A REAL-TIME CLOCK is running (${g.mech('timer').seconds}s per turn, labelled "${g.mech('timer').label}"). `
    + `If the player's input is "(the moment passes without you)" they ran out of time — advance the threat against them. `
    + `Keep narration short and urgent while this is installed.`,
  hud: (g) => {
    const s = g.mech('timer');
    const wrap = document.createElement('div');
    wrap.append(row(s.label, `${s.left}s`), meter(s.left / s.seconds));
    return block('pressure', wrap);
  },
};
