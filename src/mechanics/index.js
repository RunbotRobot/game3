// The mechanic registry. This is the seam the game changes itself through:
// an era installs and uninstalls mechanics, and each one contributes prompt text,
// HUD, canvas drawing, and input handling. Adding a genuinely new way to play
// means dropping a file in here and listing it below — nothing else changes.

import resources from './resources.js';
import inventory from './inventory.js';
import stats from './stats.js';
import timer from './timer.js';
import deck from './deck.js';
import grid from './grid.js';
import nodes from './nodes.js';
import rig from './rig.js';

export const MECHANICS = Object.fromEntries(
  [resources, inventory, stats, timer, deck, grid, nodes, rig].map((m) => [m.id, m]),
);

/** A short menu the model reads, so it knows what it is allowed to become. */
export function catalogue() {
  return Object.values(MECHANICS).map((m) => `- ${m.id}: ${m.name} — ${m.blurb}`).join('\n');
}

export const active = (g) => (g.state.era.mechanics || []).map((id) => MECHANICS[id]).filter(Boolean);

export function install(g, id, config = {}) {
  const m = MECHANICS[id];
  if (!m) return false;
  if (!g.state.era.mechanics.includes(id)) g.state.era.mechanics.push(id);
  g.state.mech[id] = g.state.mech[id] || {};
  m.install?.(g, config);
  return true;
}

export function uninstall(g, id) {
  const m = MECHANICS[id];
  if (!m) return false;
  g.state.era.mechanics = g.state.era.mechanics.filter((x) => x !== id);
  m.uninstall?.(g);
  return true;
}

/** Re-run install() for everything in the save — timers and derived state
 *  do not survive a page reload, but the save says they should exist. */
export function rehydrate(g) {
  for (const id of [...(g.state.era.mechanics || [])]) {
    if (!MECHANICS[id]) { g.state.era.mechanics = g.state.era.mechanics.filter((x) => x !== id); continue; }
    g.state.mech[id] = g.state.mech[id] || {};
    MECHANICS[id].install?.(g, {});
  }
}

/** Fan out a lifecycle hook across active mechanics, collecting string returns. */
export function collect(g, hook, ...args) {
  return active(g).map((m) => m[hook]?.(g, ...args)).filter((v) => typeof v === 'string' && v);
}
