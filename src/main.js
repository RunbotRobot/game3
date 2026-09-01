import * as State from './state.js';
import { ask, PROVIDERS } from './llm.js';
import { systemPrompt, turnPrompt } from './prompt.js';
import { createUI } from './ui/index.js';
import { MECHANICS, install, uninstall, rehydrate, collect } from './mechanics/index.js';
import { addPressure, upheave } from './director.js';
import { tick, openEvolveModal, openSettingsModal } from './evolve.js';

const OPENING = '(begin — open somewhere specific and strange, establish who I am in one clause, explain nothing)';

const g = {
  state: State.load(),
  ui: null,
  busy: false,
  mech(id) { return (this.state.mech[id] = this.state.mech[id] || {}); },
  save() { State.save(this.state); },
  submit,
  replaceState(next) {
    this.state = State.migrate(next);
    this.save();
    location.reload();
  },
};

// --- the turn ---------------------------------------------------------------

async function submit(input, { silent = false } = {}) {
  const text = String(input || '').trim();
  if (!text || g.busy) return;
  g.busy = true;
  g.ui.renderChoices([]);
  if (!silent) { g.ui.player(text); g.state.transcript.push({ role: 'player', text, ts: Date.now() }); }
  g.ui.status('…', true);

  try {
    const result = await ask({
      state: g.state,
      system: systemPrompt(g),
      user: turnPrompt(g, text),
    });

    const narration = String(result.narration || result.text || '').trim();
    if (narration) {
      g.ui.narration(narration);
      g.state.transcript.push({ role: 'game', text: narration, ts: Date.now() });
    }

    if (result.sensory?.motion) { g.state.era.motion = result.sensory.motion; g.ui.stage.setMotion(result.sensory.motion); }
    if (result.sensory?.palette) { Object.assign(g.state.era.palette, result.sensory.palette); g.ui.applyPalette(g.state.era.palette); }

    const side = State.applyOps(g.state, result.ops);
    for (const m of side.install) { if (install(g, m.id, m.config)) g.ui.system(`⟡ ${m.id}: ${mechBlurb(m.id)}`); }
    for (const id of side.uninstall) { if (uninstall(g, id)) g.ui.system(`⟡ ${id} is no longer part of this.`); }
    for (const f of side.float) g.ui.addFloater(f);
    for (const n of side.notes) g.ui.system(n);

    collect(g, 'afterTurn');

    g.state.meta.turns += 1;
    g.state.transcript = g.state.transcript.slice(-120);
    g.ui.renderChoices(result.choices);
    g.ui.renderHud();

    const ready = addPressure(g, text, result);
    g.ui.renderDrift();
    g.ui.status('');
    g.save();

    if (ready) await upheave(g);
  } catch (e) {
    console.error(e);
    g.ui.error(e.message || String(e));
    g.ui.status('');
    if (/no API key/.test(e.message || '')) g.ui.system('open ⚙ and add a key, or pick the offline dream engine.');
  } finally {
    g.busy = false;
    g.save();
    g.ui.focus();
  }
}

const mechBlurb = (id) => MECHANICS[id]?.blurb || 'something new is running.';

// --- boot -------------------------------------------------------------------

function boot() {
  g.ui = createUI(g);
  rehydrate(g);

  g.ui.renderEra();
  g.ui.renderHud();
  g.ui.renderFloaters();
  g.ui.renderDrift();
  g.ui.renderClock();

  // Replay enough of the transcript that a reload feels like sitting back down.
  for (const e of g.state.transcript.slice(-8)) {
    if (e.role === 'player') g.ui.player(e.text); else g.ui.narration(e.text);
  }

  document.querySelector('#input-row').addEventListener('submit', (e) => {
    e.preventDefault();
    const el = document.querySelector('#input');
    const v = el.value;
    el.value = '';
    submit(v);
  });

  document.querySelector('#btn-evolve').addEventListener('click', () => openEvolveModal(g));
  document.querySelector('#btn-settings').addEventListener('click', () =>
    openSettingsModal(g, { getApiKey: State.getApiKey, setApiKey: State.setApiKey, PROVIDERS }));

  // Mechanics get first refusal on keys, but never while you are typing.
  window.addEventListener('keydown', (e) => {
    if (e.target.matches('input, textarea, select')) return;
    for (const id of (g.state.era.mechanics || [])) {
      if (MECHANICS[id]?.keydown?.(g, e)) { e.preventDefault(); return; }
    }
  });

  // Play time only accrues while the tab is actually in front of you.
  let last = Date.now();
  setInterval(() => {
    const now = Date.now();
    const dt = now - last;
    last = now;
    if (!document.hidden && dt < 30000) tick(g, dt);
  }, 5000);

  window.addEventListener('beforeunload', () => g.save());

  // Always playable on first load: with no key, fall back to the offline engine
  // rather than opening on an error.
  if (!State.getApiKey() && g.state.settings.provider !== 'local') {
    g.state.settings.provider = 'local';
    g.ui.system('⟡ running on the offline dream engine. ⚙ settings → Google Gemini is free, and much better at this.');
  }

  if (!g.state.transcript.length) {
    submit(OPENING, { silent: true });
  } else {
    g.ui.status(`era ${g.state.era.index} · ${g.state.meta.turns} turns in`);
  }
  g.ui.focus();
}

boot();
window.game = g;   // so you can poke at it from the console mid-session
