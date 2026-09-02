// Persistent world state. This file is deliberately conservative: it is the one
// module that MUST stay backward-compatible as the rest of the game is rewritten,
// because a save made under Era III has to still load after the code has morphed.

export const SAVE_KEY = 'game3.save';
export const KEY_KEY = 'game3.apikey';
export const STATE_VERSION = 7;

// Temporary: pressure fills fast so eras cycle in minutes, not hours, while
// the shape of the game's arc is still being tuned. Once that shape feels
// right, raise INITIAL and CAP back toward their old values (14 and 46) —
// that's the whole knob, nowhere else needs to change.
export const FAST_ARC_TUNING = { initial: 6, cap: 20, growth: 1.25 };

export function freshState() {
  return {
    version: STATE_VERSION,
    meta: { started: Date.now(), playMs: 0, turns: 0, lastReminderMs: 0, evolutions: [] },
    era: {
      index: 1,
      name: 'The Waking',
      tagline: 'you know exactly where you are, and exactly why that is strange',
      palette: { bg: '#0b0d10', fg: '#d7dce3', accent: '#7fd1c1' },
      motion: 'drift',
      interfaceDirective: 'Concrete prose: named places, named things, a body that moves through a real '
        + 'room. The player walks it instead of reading past it — see the walk mechanic.',
      mechanics: ['walk', 'mysteries'],
    },
    player: {
      name: 'you',
      description: 'unwritten',
      goal: '',   // plain string — the player can set it directly (tap the goal bar); the model can too
      inventory: [],
      stats: {},
      resources: { clarity: 7 },
    },
    world: {},
    mech: {},   // per-mechanic private state, keyed by mechanic id
    drift: { pressure: 0, threshold: FAST_ARC_TUNING.initial, upheavals: [] },
    floaters: [],
    transcript: [],
    settings: { provider: 'gemini', model: '', temperature: 1.0 },
  };
}

// --- migrations -------------------------------------------------------------
// Append a function per version bump. Never edit an existing one.
const MIGRATIONS = [
  // v1 -> v2: Google retired the gemini-2.x ids for new keys. Clear a pinned one
  // so the save falls back to the provider's current default instead of 404ing.
  (s) => {
    if (s.settings?.provider === 'gemini' && /^gemini-[12]\./.test(s.settings.model || '')) s.settings.model = '';
    s.meta = s.meta || {};
    s.meta.evolutions = s.meta.evolutions || [];
    s.meta.evolutions.push('Model auto-healing: a retired model id is replaced from the live list instead of stranding the save. Added the rewrite watcher.');
    return s;
  },
  // v2 -> v3: floaters had no working lifetime and could not be dismissed, so a
  // long session accumulated permanent ones. Clear the stuck set; new ones expire.
  (s) => {
    s.floaters = [];
    s.meta = s.meta || {};
    s.meta.evolutions = s.meta.evolutions || [];
    s.meta.evolutions.push('Floating fragments now expire after a few turns, drag from where you grab them, and dismiss on click.');
    return s;
  },
  // v3 -> v4: no shape change — records the "more visuals, less text" evolution
  // (the rig mechanic and a shorter default narration length) in the log.
  (s) => {
    s.meta = s.meta || {};
    s.meta.evolutions = s.meta.evolutions || [];
    s.meta.evolutions.push('Added the rig mechanic: the apparatus is drawn as touchable marks over the scene instead of described in prose, and default narration is shorter throughout.');
    return s;
  },
  // v4 -> v5: an intentional reset, requested by the player, not the usual
  // additive migration. The abstract, mystery-accumulating default (drift
  // through installable mechanics, 2D top-down travel) is replaced with a
  // concrete one: a hand-rolled 3D scene walked with a joystick, a visible
  // goal, and a loose-threads ledger that forces every unexplained thing to
  // eventually get an answer. This is the one case where replacing the whole
  // state is correct rather than a bug — carry forward only what isn't
  // narrative: the evolution history (so the game still remembers what it has
  // been) and the player's provider/model choice (a config preference, not
  // part of the story).
  (s) => {
    const evolutions = s.meta?.evolutions || [];
    const provider = s.settings?.provider || 'gemini';
    const model = s.settings?.model || '';
    const reset = freshState();
    reset.meta.evolutions = [...evolutions,
      'Reset at the player\'s request: the game had grown too abstract and dream-like, with mysteries '
      + '(47 tally marks, and others) that were never on track to be explained. Replaced the default '
      + 'mechanics with a concrete world: a hand-rolled WebGL 3D scene walked with a joystick instead of '
      + 'typed travel, a visible player-or-model-set goal, and a loose-threads ledger (the mysteries '
      + 'mechanic) that requires every unexplained thing to eventually be resolved. Pacing is temporarily '
      + 'much faster (drift threshold 14 -> 6) so the shape of a full arc can be felt sooner.'];
    reset.settings.provider = provider;
    reset.settings.model = model;
    return reset;
  },
  // v5 -> v6: no shape change — records the log-drawer/second-joystick evolution.
  (s) => {
    s.meta = s.meta || {};
    s.meta.evolutions = s.meta.evolutions || [];
    s.meta.evolutions.push('The 3D room now fills the screen: log, HUD and composer collapse into a '
      + 'tap-to-open drawer instead of a fixed reading pane, and a second joystick free-looks the camera '
      + 'independently of which way you\'re walking.');
    return s;
  },
  // v6 -> v7: no shape change — records the "the joysticks act as one control" fix.
  (s) => {
    s.meta = s.meta || {};
    s.meta.evolutions = s.meta.evolutions || [];
    s.meta.evolutions.push('The right (view) joystick now turns the avatar itself, the same as the left '
      + 'stick\'s left/right already did, instead of free-rotating an independent camera — the two sticks '
      + 'are meant to be one control, not two unrelated ones.');
    return s;
  },
  // v7 -> v8 goes here
];

export function migrate(state) {
  const base = freshState();
  let v = state.version ?? 0;
  while (v < STATE_VERSION && MIGRATIONS[v - 1]) { state = MIGRATIONS[v - 1](state); v++; }
  state.version = STATE_VERSION;
  // Backfill anything a newer engine expects but an older save lacks.
  return deepDefault(state, base);
}

function deepDefault(target, defaults) {
  if (target === null || typeof target !== 'object' || Array.isArray(target)) {
    return target === undefined ? defaults : target;
  }
  for (const k of Object.keys(defaults)) {
    if (!(k in target)) target[k] = structuredClone(defaults[k]);
    else target[k] = deepDefault(target[k], defaults[k]);
  }
  return target;
}

export function load() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return freshState();
    return migrate(JSON.parse(raw));
  } catch (e) {
    console.warn('save was unreadable, starting over', e);
    return freshState();
  }
}

export function save(state) {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(state));
  } catch (e) {
    // Quota: the transcript is the only thing that grows without bound.
    state.transcript = state.transcript.slice(-40);
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(state)); } catch { /* give up quietly */ }
  }
}

// Keys are per provider, so the game can fall through to a second provider when
// the first is overloaded. They live outside the save: an exported save is a
// thing you might send somewhere, and it should not carry credentials.
export const getApiKey = (provider) => localStorage.getItem(`${KEY_KEY}.${provider}`) || '';
export const setApiKey = (provider, k) =>
  (k ? localStorage.setItem(`${KEY_KEY}.${provider}`, k) : localStorage.removeItem(`${KEY_KEY}.${provider}`));
export const keyedProviders = () =>
  Object.keys(localStorage).filter((k) => k.startsWith(`${KEY_KEY}.`)).map((k) => k.slice(KEY_KEY.length + 1));

/** One-time move from the single-key era. */
export function adoptLegacyKey(provider) {
  const legacy = localStorage.getItem(KEY_KEY);
  if (!legacy) return;
  if (provider && !getApiKey(provider)) setApiKey(provider, legacy);
  localStorage.removeItem(KEY_KEY);
}

// --- the op language --------------------------------------------------------
// The model mutates the world by emitting ops rather than by writing code. This
// is what keeps the world open-ended without letting a hallucination corrupt the
// engine: unknown ops are ignored, and paths are confined to safe roots.

const ROOTS = new Set(['world', 'player', 'era']);
const BANNED = new Set(['__proto__', 'constructor', 'prototype']);

function resolve(state, path, create) {
  const parts = String(path || '').split('.').filter(Boolean);
  if (parts.length < 2 || !ROOTS.has(parts[0])) return null;
  if (parts.some((p) => BANNED.has(p))) return null;
  let node = state;
  for (let i = 0; i < parts.length - 1; i++) {
    const k = parts[i];
    if (node[k] === undefined || node[k] === null) {
      if (!create) return null;
      node[k] = {};
    }
    if (typeof node[k] !== 'object') return null;
    node = node[k];
  }
  return { node, key: parts[parts.length - 1] };
}

/** Apply model-authored ops. Returns the ops the engine needs to act on itself. */
export function applyOps(state, ops = []) {
  const side = { install: [], uninstall: [], float: [], notes: [] };
  for (const op of Array.isArray(ops) ? ops : []) {
    if (!op || typeof op !== 'object') continue;
    try {
      switch (op.op) {
        case 'set': {
          const t = resolve(state, op.path, true);
          if (t) t.node[t.key] = op.value;
          break;
        }
        case 'inc': {
          const t = resolve(state, op.path, true);
          if (t) t.node[t.key] = (Number(t.node[t.key]) || 0) + (Number(op.value) || 0);
          break;
        }
        case 'push': {
          const t = resolve(state, op.path, true);
          if (!t) break;
          if (!Array.isArray(t.node[t.key])) t.node[t.key] = [];
          if (t.node[t.key].length < 200) t.node[t.key].push(op.value);
          break;
        }
        case 'pull': {
          const t = resolve(state, op.path, false);
          if (!t || !Array.isArray(t.node[t.key])) break;
          const i = t.node[t.key].findIndex((v) => String(v).toLowerCase() === String(op.value).toLowerCase());
          if (i >= 0) t.node[t.key].splice(i, 1);
          break;
        }
        case 'del': {
          const t = resolve(state, op.path, false);
          if (t) delete t.node[t.key];
          break;
        }
        case 'float':
          side.float.push({
            id: op.id || `f${Date.now()}${Math.random().toString(36).slice(2, 6)}`,
            text: String(op.text ?? '').slice(0, 200),
            x: clamp01(op.x), y: clamp01(op.y),
            ttl: Math.max(1, Math.min(40, Number(op.ttl) || DEFAULT_TTL)),   // in turns
          });
          break;
        case 'unfloat':
          state.floaters = state.floaters.filter((f) => f.id !== op.id);
          break;
        case 'install': if (op.mechanic) side.install.push({ id: op.mechanic, config: op.config || {} }); break;
        case 'uninstall': if (op.mechanic) side.uninstall.push(op.mechanic); break;
        case 'note': side.notes.push(String(op.text ?? '')); break;
        default: break; // forward-compatible: a future engine may know this op
      }
    } catch (e) {
      console.warn('bad op', op, e);
    }
  }
  return side;
}

const DEFAULT_TTL = 3;

const clamp01 = (n) => Math.min(0.95, Math.max(0.02, Number.isFinite(+n) ? +n : Math.random()));
