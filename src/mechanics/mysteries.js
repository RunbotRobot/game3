import { block, el } from '../ui/dom.js';

/**
 * The rule this enforces: nothing stays unexplained forever. Every strange fact
 * the story introduces gets a name here, and stays on the board — visible, with
 * a running count in the HUD title even while the phone strip is collapsed —
 * until the story answers it. This is what makes upheavals feel like a plot
 * advancing instead of a new dream starting: see the note in director.js.
 *
 * A permanent pillar, not an optional toggle — see the standing instruction in
 * prompt.js and CLAUDE.md. It can technically still be uninstalled by an op,
 * the same as anything else, but nothing in this codebase asks for that.
 */
export default {
  id: 'mysteries',
  name: 'Loose Threads',
  blurb: 'Nothing stays unexplained. Everything strange gets a name, and an answer, eventually.',

  install(g) {
    const s = g.mech('mysteries');
    s.threads = s.threads || {};
  },

  prompt(g) {
    const s = g.mech('mysteries');
    const all = Object.entries(s.threads);
    const open = all.filter(([, t]) => t.status === 'open');
    const resolved = all.filter(([, t]) => t.status === 'resolved').slice(-3);

    return `THE LOOSE-THREADS LEDGER is the discipline that keeps this a story instead of a dream. `
      + `Open (${open.length}): ${open.length ? open.map(([id, t]) => `${id}="${t.question}"`).join('; ') : '(none)'}. `
      + `Recently resolved: ${resolved.length ? resolved.map(([id, t]) => `${id}="${t.answer}"`).join('; ') : '(none yet)'}.\n`
      + `RULE: the moment narration introduces something unexplained — a number, a symbol, an object out of place, `
      + `an event with no visible cause — register it in the SAME reply with `
      + `{"op":"set","path":"world.mysteryOpen.<short-id>","value":{"question":"why are there 47 marks on the bell?"}}. `
      + `RULE: resolve a thread the moment the story earns the answer, with `
      + `{"op":"set","path":"world.mysteryResolved.<id>","value":"<the answer, stated plainly>"}. `
      + `An answer can recontextualise rather than simply reveal — but it must actually explain the thing, not gesture at it. `
      + `${open.length >= 4 ? 'There are already 4+ open — resolve at least one before opening another.' : 'Keep at most 3-4 open at once.'}`;
  },

  afterTurn(g) {
    const s = g.mech('mysteries');
    const w = g.state.world;
    for (const [id, v] of Object.entries(w.mysteryOpen || {})) {
      if (!v || typeof v !== 'object' || s.threads[id]) continue;
      s.threads[id] = { question: String(v.question || id).slice(0, 140), status: 'open', answer: '', turn: g.state.meta.turns };
    }
    w.mysteryOpen = {};
    for (const [id, answer] of Object.entries(w.mysteryResolved || {})) {
      if (!s.threads[id]) s.threads[id] = { question: id, status: 'open', answer: '', turn: g.state.meta.turns };
      s.threads[id].status = 'resolved';
      s.threads[id].answer = String(answer || '').slice(0, 200);
    }
    w.mysteryResolved = {};
  },

  hud(g) {
    const s = g.mech('mysteries');
    const all = Object.entries(s.threads);
    const open = all.filter(([, t]) => t.status === 'open');
    const resolved = all.filter(([, t]) => t.status === 'resolved').slice(-3);
    if (!all.length) return block('loose threads', el('div', { text: 'nothing strange yet', style: { opacity: .6 } }));

    return block(`loose threads · ${open.length} open`,
      el('ul.hud-list', {},
        ...open.map(([, t]) => el('li', { text: `? ${t.question}` })),
        ...resolved.map(([, t]) => el('li', {
          style: { opacity: .55, textDecoration: 'line-through' }, text: `✓ ${t.question}`,
        }))));
  },
};
