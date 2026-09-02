import * as State from './state.js';
import { ask, PROVIDERS } from './llm.js';
import { systemPrompt, turnPrompt } from './prompt.js';
import { createUI } from './ui/index.js';
import { MECHANICS, install, uninstall, rehydrate, collect } from './mechanics/index.js';
import { addPressure, upheave } from './director.js';
import { tick, openEvolveModal, openSettingsModal, watchForRewrites } from './evolve.js';

const OPENING = '(begin — build the first room with the walk mechanic and put me in it; give me one concrete, '
  + 'nameable reason to be there; open with something strange enough to register as a loose thread, not '
  + 'atmosphere for its own sake)';

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
      onNotice: (m) => g.ui.system(m),
      onStatus: (m) => g.ui.status(m, true),
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
    g.ui.ageFloaters();

    g.state.meta.turns += 1;
    g.state.transcript = g.state.transcript.slice(-120);
    g.ui.renderChoices(result.choices);
    g.ui.renderHud();
    g.ui.renderRig();

    const ready = addPressure(g, text, result);
    g.ui.renderDrift();
    g.ui.status('');
    g.save();

    if (ready) await upheave(g);
  } catch (e) {
    console.error(e);
    // The turn is not lost: put it back so one tap can send it again.
    g.ui.error(e.message || String(e), () => submit(text, { silent }));
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
  State.adoptLegacyKey(g.state.settings.provider);
  g.ui = createUI(g);
  rehydrate(g);
  // Belt and braces: drop any fragment that has no life left, whatever wrote it.
  g.state.floaters = g.state.floaters.filter((f) => f.sticky || Number(f.ttl) > 0);

  g.ui.renderEra();
  g.ui.renderHud();
  g.ui.renderRig();
  g.ui.renderFloaters();
  g.ui.renderDrift();
  g.ui.renderClock();
  g.ui.renderGoal();

  // Replay enough of the transcript that a reload feels like sitting back down.
  for (const e of g.state.transcript.slice(-8)) {
    if (e.role === 'player') g.ui.player(e.text); else g.ui.narration(e.text);
  }
  g.ui.renderLogPeek();

  document.querySelector('#hud').addEventListener('click', (e) => {
    // Collapsed strip: nothing in it is interactive (.hud-body is hidden), so
    // any tap means "show me the detail." Open sheet: let a real action (a
    // travel destination, a played card, hold-it) close it again after firing;
    // tapping empty space or a title leaves it open.
    if (!document.body.classList.contains('hud-open')) { g.ui.toggleHud(true); return; }
    if (e.target.closest('button')) g.ui.toggleHud(false);
  });

  document.querySelector('#input-row').addEventListener('submit', (e) => {
    e.preventDefault();
    const el = document.querySelector('#input');
    const v = el.value;
    el.value = '';
    // Sending your own line is the one thing that opens the keyboard, and it
    // stays open afterward unless told otherwise — on a phone that is ~40% of
    // the screen, which is what was actually eating the log down to a few
    // lines. focus() already refuses to reopen it after a turn; this closes
    // the one it left open.
    el.blur();
    submit(v);
  });

  document.querySelector('#btn-hud').addEventListener('click', () => g.ui.toggleHud());
  document.querySelector('#goal-bar').addEventListener('click', () => g.ui.editGoal());
  document.querySelector('#goal-bar').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); g.ui.editGoal(); }
  });

  // The log drawer (walk-active mode): a peek bar you tap open, same pattern
  // as #hud's own strip-to-sheet toggle, just for everything text-related.
  document.querySelector('#log-peek').addEventListener('click', () => g.ui.toggleLogDrawer(true));
  document.querySelector('#log-peek').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); g.ui.toggleLogDrawer(true); }
  });

  document.addEventListener('pointerdown', (e) => {
    if (document.body.classList.contains('hud-open') && !e.target.closest('#hud, #btn-hud')) {
      g.ui.toggleHud(false);
    }
    // Tapping the room itself — not a joystick, not a hotspot, not the drawer
    // or its own peek bar — is "put the reading away and look at the world."
    if (document.body.classList.contains('log-open') && !e.target.closest('#log-drawer, #log-peek')) {
      g.ui.toggleLogDrawer(false);
    }
  });
  document.querySelector('#btn-evolve').addEventListener('click', () => openEvolveModal(g));
  document.querySelector('#btn-settings').addEventListener('click', () =>
    openSettingsModal(g, { getApiKey: State.getApiKey, setApiKey: State.setApiKey, keyedProviders: State.keyedProviders, PROVIDERS }));

  // Mechanics get first refusal on keys, but never while you are typing.
  window.addEventListener('keydown', (e) => {
    if (e.target.matches('input, textarea, select')) return;
    if (e.key === 'Escape' && g.state.floaters.length) { g.ui.clearFloaters(); return; }
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

  // Orientation change / URL bar show-hide can change the real height of the
  // always-visible status stack the 3D pane is measured against.
  window.addEventListener('resize', () => g.ui.syncStatusHeight());
  window.addEventListener('beforeunload', () => g.save());
  watchForRewrites(g);

  // Always playable on first load: with no key, fall back to the offline engine
  // rather than opening on an error.
  if (!State.getApiKey(g.state.settings.provider) && g.state.settings.provider !== 'local') {
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
