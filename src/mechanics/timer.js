import { block, row, meter, el } from '../ui/dom.js';

/** Real-time pressure. When it runs out the world takes a turn without you. */
export default {
  id: 'timer',
  name: 'Pressure',
  blurb: 'Something is now happening whether or not you act.',
  install(g, config) {
    const s = g.mech('timer');
    s.seconds = Number(config.seconds) || 75;
    s.left = Math.min(s.left || s.seconds, s.seconds);
    s.label = config.label || 'it is coming';
    s.paused = s.paused ?? false;
    clearInterval(s.handle);
    s.handle = setInterval(() => {
      // The clock is pressure, not a reading test. It holds while a turn is
      // resolving, while the player has scrolled up to read, while the tab is
      // in the background, and whenever they have paused it outright.
      if (g.busy || s.paused || g.ui.reading || document.hidden) return;
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
    const held = s.paused || g.ui.reading;
    const countdown = held ? 'held' : `${s.left}s`;
    const wrap = document.createElement('div');
    wrap.append(row(s.label, countdown), meter(s.left / s.seconds));
    wrap.append(el('button', {
      style: { marginTop: '8px' },
      onClick: () => { s.paused = !s.paused; g.ui.renderHud(); g.save(); },
    }, s.paused ? 'let it run' : 'hold it'));
    // The countdown is time-critical, so it rides in the title too — the one
    // piece of a block that stays visible when the phone strip is collapsed.
    return block(`pressure · ${countdown}`, wrap);
  },
};
