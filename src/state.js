// Persistent world state. This file is deliberately conservative: it is the one
// module that MUST stay backward-compatible as the rest of the game is rewritten,
// because a save made under Era III has to still load after the code has morphed.

export const SAVE_KEY = 'game3.save';
export const KEY_KEY = 'game3.apikey';
export const STATE_VERSION = 1;

export function freshState() {
  return {
    version: STATE_VERSION,
    meta: { started: Date.now(), playMs: 0, turns: 0, lastReminderMs: 0, evolutions: [] },
    era: {
      index: 1,
      name: 'The Waking',
      tagline: 'you do not remember choosing this',
      palette: { bg: '#0b0d10', fg: '#d7dce3', accent: '#7fd1c1' },
      motion: 'drift',
      interfaceDirective: 'Plain prose. The world answers in full sentences.',
      mechanics: ['resources'],
    },
    player: {
      name: 'you',
      description: 'unwritten',
      inventory: [],
      stats: {},
      resources: { clarity: 7 },
    },
    world: {},
    mech: {},   // per-mechanic private state, keyed by mechanic id
    drift: { pressure: 0, threshold: 14, upheavals: [] },
    floaters: [],
    transcript: [],
    settings: { provider: 'gemini', model: '', temperature: 1.0 },
  };
}

// --- migrations -------------------------------------------------------------
// Append a function per version bump. Never edit an existing one.
const MIGRATIONS = [
  // (state) => state   // v1 -> v2 goes here
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

export const getApiKey = () => localStorage.getItem(KEY_KEY) || '';
export const setApiKey = (k) => k ? localStorage.setItem(KEY_KEY, k) : localStorage.removeItem(KEY_KEY);

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
            x: clamp01(op.x), y: clamp01(op.y), ttl: Number(op.ttl) || 0,
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

const clamp01 = (n) => Math.min(0.95, Math.max(0.02, Number.isFinite(+n) ? +n : Math.random()));
