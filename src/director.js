// Drift. Every turn adds pressure; when it fills, the game stops being the game
// it was. This is the slow engine underneath the whole thing — the player should
// feel it coming (the rail at the top fills) without being told what it means.

import { ask } from './llm.js';
import { upheavalPrompt } from './prompt.js';
import { applyOps, FAST_ARC_TUNING } from './state.js';
import { install, uninstall } from './mechanics/index.js';

/** Pressure rises faster when the player is pushing at the edges of the fiction. */
export function addPressure(g, input, result) {
  const d = g.state.drift;
  let gain = 1;
  const text = String(input).toLowerCase();
  if (text.length > 90) gain += 0.5;                                  // effortful play
  if (/\b(why|who|what) (am|are|is) (i|you|this)\b/.test(text)) gain += 1;   // poking the frame
  if ((result?.ops || []).some((o) => o.op === 'install' || o.op === 'uninstall')) gain += 1;
  d.pressure = Math.round((d.pressure + gain) * 10) / 10;
  return d.pressure >= d.threshold;
}

export async function upheave(g) {
  g.ui.status('the game is changing its mind…', true);
  const r = await ask({
    state: g.state,
    system: 'You redesign a text game between chapters. You reply with one JSON object and nothing else.',
    user: upheavalPrompt(g),
    temperature: 1.15,
    onNotice: (m) => g.ui.system(m),
  });

  const era = g.state.era;
  const previous = era.name;
  g.state.drift.upheavals.push({ name: previous, endedAtTurn: g.state.meta.turns, at: Date.now() });

  era.index += 1;
  era.name = String(r.eraName || 'The Turn').slice(0, 48);
  era.tagline = String(r.tagline || '').slice(0, 90);
  era.interfaceDirective = String(r.interfaceDirective || era.interfaceDirective).slice(0, 400);
  if (r.palette) era.palette = { ...era.palette, ...r.palette };
  if (r.motion) era.motion = r.motion;

  for (const id of asArray(r.uninstall)) uninstall(g, id);
  for (const id of asArray(r.install)) install(g, id, {});

  const side = applyOps(g.state, r.ops);
  for (const m of side.install) install(g, m.id, m.config);
  for (const id of side.uninstall) uninstall(g, id);
  for (const f of side.float) g.ui.addFloater(f);

  // Each era is harder to leave than the last, so the game settles as it deepens.
  // (Both numbers are the temporary fast-pacing constants — see state.js.)
  g.state.drift.pressure = 0;
  g.state.drift.threshold = Math.min(FAST_ARC_TUNING.cap, Math.round(g.state.drift.threshold * FAST_ARC_TUNING.growth));

  g.ui.upheaval(`${previous} ends`);
  g.ui.renderEra();
  if (r.narration) { g.ui.narration(r.narration); g.state.transcript.push({ role: 'game', text: r.narration, ts: Date.now() }); }
  g.ui.system(`⟡ era ${era.index}: ${era.name} — ${era.mechanics.join(', ') || 'prose only'}`);
  g.ui.renderHud();
  g.ui.renderRig();
  g.ui.renderGoal();
  g.ui.renderDrift();
  g.save();
}

const asArray = (v) => (Array.isArray(v) ? v.filter((x) => typeof x === 'string') : []);
