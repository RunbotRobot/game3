import { collect, active, catalogue } from './mechanics/index.js';

const OPS_REFERENCE = `
{"op":"set","path":"world.<anything>","value":<any>}      remember a fact about the world
{"op":"inc","path":"player.resources.<name>","value":-1}  move a meter
{"op":"push"/"pull","path":"player.inventory","value":"a rusty key"}
{"op":"del","path":"world.<anything>"}                    forget something
{"op":"float","text":"it is behind you","x":0.7,"y":0.3}  pin a fragment loose on the screen (x,y are 0-1;
                                                          sparingly — one every few turns at most)
{"op":"install","mechanic":"<id>","config":{}}            add a way of playing
{"op":"uninstall","mechanic":"<id>"}                      remove one`;

const VOICE = `
HOW TO NARRATE
- Second person, present tense. 2-4 short paragraphs. Concrete nouns over adjectives.
- Never ask "what would you like to do?" and never summarise the player's options in prose.
- The player can attempt anything. Say yes, or say yes-but; say no only when the world has already
  established why not. Never block an action because it wasn't anticipated.
- Consequences are permanent. If something breaks, record it with an op and never quietly restore it.
- Introduce something the player did not ask about in most turns: a noise, an arrival, a change offstage.
  The world has business of its own.
- No moralising, no narrator winking at the player, no "little did you know".
- Do not explain the mechanics. Show them.`;

/** Everything the model needs to be this game, right now. */
export function systemPrompt(g) {
  const { era } = g.state;
  const mechanicText = active(g).map((m) => `[${m.id}] ${m.prompt?.(g) || m.blurb}`).join('\n');

  return `You are the engine of a single-player text game that refuses to remain one kind of game.
It is being played by one person, for their own enjoyment, over many hours. There is no audience.

CURRENT ERA — ${era.index}: ${era.name}
"${era.tagline}"
Interface directive: ${era.interfaceDirective}

ACTIVE MECHANICS (obey these; they are really running in the interface)
${mechanicText || '(none — pure prose)'}
${VOICE}

STATE OPS — you change the world by emitting ops, never by describing changes you did not record:
${OPS_REFERENCE}

MECHANICS YOU MAY INSTALL OR REMOVE AT ANY TIME
${catalogue()}
Install one when the story genuinely turns — when the player's problem stops being the kind of problem
the current mechanics can express. Do not install more than one per turn, and do not churn.

REPLY WITH ONE JSON OBJECT, NOTHING ELSE:
{
  "narration": "the prose for this turn",
  "sensory": { "motion": "drift|pulse|scatter|still|storm",
               "palette": { "bg": "#0b0d10", "fg": "#d7dce3", "accent": "#7fd1c1" } },
  "choices": ["three or four short concrete actions, imperative, 2-5 words"],
  "ops": [ ... ]
}
"palette" is optional — include it only when the mood of the place has genuinely shifted.`;
}

/** The turn itself: recent history, the live world, and what the player just did. */
export function turnPrompt(g, input) {
  const pre = collect(g, 'beforeTurn');
  return [
    `WORLD STATE\n${digest(g.state)}`,
    `RECENT HISTORY\n${history(g.state)}`,
    pre.length ? `THIS TURN\n${pre.join('\n')}` : '',
    `PLAYER INPUT: ${input}`,
  ].filter(Boolean).join('\n\n');
}

/** Asked when drift pressure fills: the game is told to become a different game. */
export function upheavalPrompt(g) {
  const past = (g.state.drift.upheavals || []).map((u) => u.name).join(' → ') || '(none yet)';
  return `${digest(g.state)}

RECENT HISTORY
${history(g.state)}

The current era, "${g.state.era.name}", has run its course. Transform the game.

This is not a scene change. The *kind of game* must change: what the player does with their hands,
what counts as a move, what the interface is for. A player who walked away for a week and came back
should not recognise it. Grow it out of what has already happened — the new form must be the old
story's consequence, not a non-sequitur. Eras so far: ${past}.

Available mechanics:
${catalogue()}

Reply with one JSON object only:
{
  "eraName": "two to four words",
  "tagline": "a short line, lowercase, unsettling",
  "interfaceDirective": "one or two sentences telling your future self how prose and interface work now",
  "palette": { "bg": "#hex", "fg": "#hex", "accent": "#hex" },
  "motion": "drift|pulse|scatter|still|storm",
  "install": ["mechanic ids to add"],
  "uninstall": ["mechanic ids to remove"],
  "narration": "2-3 paragraphs carrying the player across the break, in second person",
  "ops": [ ... ]
}
Palette must be readable: strong contrast between bg and fg.`;
}

/** A compact, bounded view of the world. Bounded matters — this is sent every turn. */
export function digest(state) {
  const { player, world, era } = state;
  const lines = [
    `you: ${player.name} — ${player.description}`,
    Object.keys(player.resources || {}).length ? `meters: ${JSON.stringify(player.resources)}` : '',
    (player.inventory || []).length ? `carrying: ${player.inventory.join(', ')}` : '',
    Object.keys(player.stats || {}).length ? `stats: ${JSON.stringify(player.stats)}` : '',
    `era ${era.index}: ${era.name}`,
    `world: ${truncate(JSON.stringify(world), 2600)}`,
  ];
  return lines.filter(Boolean).join('\n');
}

function history(state, n = 12) {
  return state.transcript.slice(-n)
    .map((e) => (e.role === 'player' ? `> ${e.text}` : e.text))
    .join('\n\n')
    .slice(-5000) || '(the game has not started)';
}

const truncate = (s, n) => (s.length > n ? `${s.slice(0, n)}…[truncated]` : s);
