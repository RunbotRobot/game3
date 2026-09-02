// The hour hand. Every REMIND_AFTER of actual play, the game asks to be rewritten:
// it composes a prompt describing what it currently is and what has happened in it,
// which you paste to Claude. Claude edits this repo; you reload; the save survives.

import { el } from './ui/dom.js';
import { digest } from './prompt.js';
import { MECHANICS } from './mechanics/index.js';
import { pickBestModel } from './llm.js';
import { freshState } from './state.js';

const REMIND_AFTER = 60 * 60 * 1000;   // one hour of play, not one hour of wall clock
const WATCH_EVERY = 90 * 1000;

/** Notice when the source under the running page has been rewritten and pulled,
 *  so a session can be played straight through and reloaded at a good moment
 *  rather than at whatever moment the push happened to land. */
export async function watchForRewrites(g, every = WATCH_EVERY) {
  const read = async () => {
    const r = await fetch(`./version.json?t=${Date.now()}`, { cache: 'no-store' });
    if (!r.ok) throw new Error(String(r.status));
    return (await r.json()).build;
  };

  let running;
  try { running = await read(); } catch { return; }   // no version.json: nothing to watch
  g.build = running;
  console.info(`game3 build ${running}`);

  const btn = document.querySelector('#btn-reload');
  btn.addEventListener('click', () => { g.save(); location.reload(); });

  setInterval(async () => {
    try {
      const latest = await read();
      if (latest === running || btn.hidden === false) return;
      btn.hidden = false;
      g.ui.system('⟡ the game has been rewritten underneath you. finish what you are doing, then press "rewritten ⟳". your save carries over.');
    } catch { /* server went away; try again next tick */ }
  }, every);
}

export function tick(g, dtMs) {
  const meta = g.state.meta;
  meta.playMs += dtMs;
  g.ui.renderClock();
  if (meta.playMs - meta.lastReminderMs >= REMIND_AFTER) {
    meta.lastReminderMs = meta.playMs;
    nudge(g);
  }
}

function nudge(g) {
  const btn = document.querySelector('#btn-evolve');
  btn.classList.add('hot');
  g.ui.system('⟡ the game has been this game for an hour. it would like to be rewritten — press "evolve".');
  g.ui.addFloater({
    id: 'evolve-nudge',
    text: 'something outside the game wants changing',
    x: 0.06 + Math.random() * 0.2, y: 0.2 + Math.random() * 0.5, sticky: true,
  });
  g.save();
}

/** The prompt you paste to Claude. Everything Claude needs to morph the code. */
export function buildEvolutionPrompt(g, wish) {
  const { era, drift, meta } = g.state;
  const installed = era.mechanics.map((id) => `${id} (${MECHANICS[id]?.name || 'unknown'})`).join(', ') || 'none';
  const unused = Object.keys(MECHANICS).filter((id) => !era.mechanics.includes(id)).join(', ') || 'none';
  const history = (drift.upheavals || []).map((u, i) => `${i + 1}. ${u.name}`).join('\n') || '(still in the first era)';
  const done = (meta.evolutions || []).map((e, i) => `${i + 1}. ${e}`).join('\n') || '(none yet — this is the first)';

  return `EVOLUTION REQUEST — game3

I have been playing for ${Math.round(meta.playMs / 60000)} minutes across ${meta.turns} turns.
Change the code so the game keeps becoming something else. Work on branch claude/ai-game-api-tools-jia4zw.

WHERE THE GAME IS NOW
Era ${era.index}: "${era.name}" — ${era.tagline}
Interface directive: ${era.interfaceDirective}
Installed mechanics: ${installed}
Built but not installed: ${unused}
Drift pressure: ${drift.pressure} / ${drift.threshold}

ERAS SO FAR
${history}

EVOLUTIONS YOU HAVE ALREADY MADE
${done}

WORLD STATE
${digest(g.state)}

THE LAST FEW TURNS
${g.state.transcript.slice(-6).map((e) => (e.role === 'player' ? `> ${e.text}` : e.text)).join('\n\n').slice(0, 3000)}

WHAT I WANT CHANGED
${wish?.trim() || '(nothing specific — surprise me, but make it a real change in how the game is played, not just new prose.)'}

HOW TO DO IT
- Add at least one genuinely new mechanic in src/mechanics/ and register it in src/mechanics/index.js.
  A new mechanic should change what my hands do, not just what the HUD shows.
- You may also change the engine itself: the turn pipeline, the canvas, the prompt, the drift rules.
- My save must survive: bump STATE_VERSION and add a migration rather than breaking the shape.
- Append one line to EVOLUTION_LOG.md describing what changed, and add it to meta.evolutions
  in a migration so the game remembers what you have already done.
- Commit and push to claude/ai-game-api-tools-jia4zw. Tell me in one sentence what to expect.`;
}

export function openEvolveModal(g) {
  document.querySelector('#btn-evolve').classList.remove('hot');
  g.state.floaters = g.state.floaters.filter((f) => f.id !== 'evolve-nudge');
  g.ui.renderFloaters();

  const wish = el('textarea', {
    placeholder: 'optional: what has gone stale? what do you want it to become?',
    style: { height: '70px' },
  });
  const out = el('textarea', { readonly: true });
  const copy = el('button', {}, 'copy prompt');
  const regen = () => { out.value = buildEvolutionPrompt(g, wish.value); };
  wish.addEventListener('input', regen);
  regen();

  copy.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(out.value); copy.textContent = 'copied ✓'; }
    catch { out.select(); copy.textContent = 'select + ⌘C'; }
    setTimeout(() => { copy.textContent = 'copy prompt'; }, 2200);
  });

  const share = navigator.share ? el('button', {}, 'share to…') : null;
  share?.addEventListener('click', async () => {
    try { await navigator.share({ title: 'game3 evolution', text: out.value }); }
    catch { /* the sheet was dismissed */ }
  });

  g.ui.openModal(
    el('h2', { text: 'rewrite the game' }),
    el('div.sub', { text: 'Paste this to Claude, let it push, then reload. Your save carries over.' }),
    el('label', { text: 'what should change' }), wish,
    el('label', { text: 'prompt' }), out,
    el('div.row', {}, copy, share, el('button', { onClick: () => g.ui.closeModal() }, 'close')),
  );
}

/** Settings: provider, key, model discovery, and the save itself. */
export function openSettingsModal(g, { getApiKey, setApiKey, keyedProviders, PROVIDERS }) {
  const s = g.state.settings;

  const provider = el('select', {}, ...Object.entries(PROVIDERS).map(([id, p]) =>
    el('option', { value: id, selected: id === s.provider }, p.label)));
  const key = el('input', { type: 'password', value: getApiKey(s.provider), placeholder: 'pasted here, kept in this browser only' });
  const chain = el('div.hint');
  const showChain = () => {
    const held = keyedProviders().filter((id) => PROVIDERS[id]);
    chain.textContent = held.length > 1
      ? `fallback order: ${[provider.value, ...held.filter((id) => id !== provider.value)].join(' → ')}`
      : 'add a key for a second provider and the game will fall through to it when the first is overloaded.';
  };
  const model = el('input', { type: 'text', value: s.model || '', placeholder: PROVIDERS[s.provider].defaultModel });
  const models = el('select', { style: { marginTop: '6px' } });
  const discover = el('button', {}, 'list models');
  const note = el('div.hint');
  models.hidden = true;

  const linkFor = (id) => {
    const url = PROVIDERS[id].keyUrl;
    return url ? el('div.hint', {}, 'get a key: ', el('a', { href: url, target: '_blank', rel: 'noreferrer' }, url))
               : el('div.hint', { text: 'no key needed — procedural fallback, no network.' });
  };
  let link = linkFor(s.provider);

  provider.addEventListener('change', () => {
    model.placeholder = PROVIDERS[provider.value].defaultModel;
    model.value = '';
    key.value = getApiKey(provider.value);   // keys are per provider now
    models.hidden = true;
    const next = linkFor(provider.value);
    link.replaceWith(next); link = next;
    showChain();
  });
  key.addEventListener('change', () => { setApiKey(provider.value, key.value.trim()); showChain(); });

  async function discoverModels() {
    note.textContent = 'asking…';
    try {
      const list = await PROVIDERS[provider.value].listModels(key.value.trim());
      if (!list.length) { note.textContent = 'the provider returned no models for this key'; return; }
      models.replaceChildren(...list.map((m) => el('option', { value: m, selected: m === model.value }, m)));
      models.hidden = false;
      models.onchange = () => { model.value = models.value; };
      note.textContent = `${list.length} models — pick one to fill the box. suggested: ${pickBestModel(list)}`;
      if (!model.value) model.value = pickBestModel(list);
    } catch (e) { note.textContent = `could not list models: ${e.message}`; }
  }
  discover.addEventListener('click', discoverModels);
  showChain();
  if (getApiKey(s.provider) && PROVIDERS[s.provider].keyUrl) discoverModels();

  const saveBtn = el('button', {}, 'save');
  saveBtn.addEventListener('click', () => {
    s.provider = provider.value;
    s.model = model.value.trim();
    setApiKey(provider.value, key.value.trim());
    delete (s.knownModels || {})[provider.value];   // re-discover against the new key
    g.save();
    g.ui.closeModal();
    g.ui.system(`⟡ now speaking through ${PROVIDERS[s.provider].label}${s.model ? ` / ${s.model}` : ''}`);
  });

  const exportBtn = el('button', {}, 'export save');
  exportBtn.addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(g.state, null, 2)], { type: 'application/json' });
    const a = el('a', { href: URL.createObjectURL(blob), download: `game3-era${g.state.era.index}.json` });
    a.click(); URL.revokeObjectURL(a.href);
  });

  const importBtn = el('button', {}, 'import save');
  importBtn.addEventListener('click', () => {
    const file = el('input', { type: 'file', accept: '.json' });
    file.addEventListener('change', async () => {
      try {
        g.replaceState(JSON.parse(await file.files[0].text()));
        g.ui.closeModal();
      } catch (e) { note.textContent = `bad save file: ${e.message}`; }
    });
    file.click();
  });

  const wipeBtn = el('button', {}, 'burn it down');
  wipeBtn.addEventListener('click', () => {
    if (wipeBtn.dataset.armed) { g.replaceState(freshState()); g.ui.closeModal(); }
    else { wipeBtn.dataset.armed = '1'; wipeBtn.textContent = 'really? everything?'; }
  });

  const sweep = el('button', {}, 'clear fragments');
  sweep.addEventListener('click', () => { g.ui.clearFloaters(); g.ui.closeModal(); });

  g.ui.openModal(
    el('h2', { text: 'settings' }),
    el('div.hint', { text: `running build ${g.build || 'unknown'} · esc clears floating fragments` }),
    el('div.sub', { text: 'The key lives in this browser only. Nothing is sent anywhere but the provider you pick.' }),
    el('label', { text: 'provider' }), provider, link,
    el('label', { text: 'api key' }), key, chain,
    el('label', { text: 'model' }), model, el('div.row', {}, discover), models, note,
    el('div.row', {}, saveBtn, sweep, exportBtn, importBtn, wipeBtn,
      el('button', { onClick: () => g.ui.closeModal() }, 'close')),
  );
}
