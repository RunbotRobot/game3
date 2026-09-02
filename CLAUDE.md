# game3 — notes for Claude

A single-player browser game whose *mechanics* change over hours of play, and whose
*code* is rewritten roughly hourly by pasting the in-game "evolve" prompt into a
Claude session. Assume every session is one of those rewrites unless told otherwise.

Work on branch `claude/ai-game-api-tools-jia4zw`.

## Non-negotiables

1. **Saves must survive the rewrite.** The player is mid-playthrough. Never change the
   shape of `state` destructively: bump `STATE_VERSION` in `src/state.js` and append a
   migration to `MIGRATIONS`. Never edit an existing migration. `deepDefault` backfills
   new keys automatically, so adding fields is free; renaming and removing are not.
2. **No build step, no dependencies.** Plain ES modules served over static HTTP. If you
   find yourself wanting a bundler, don't.
3. **The model never executes code.** It mutates the world only through the op language
   in `src/state.js` (`applyOps`). Unknown ops are ignored on purpose — that is what
   makes an old save loadable by new code and vice versa. Keep paths confined to
   `world.` / `player.` / `era.`.
4. **A broken mechanic must not kill the game.** `draw`, `hud`, and lifecycle hooks are
   called inside try/catch or via `collect()`. Keep it that way.
5. **Append to `EVOLUTION_LOG.md`** every time, and add the same line to
   `meta.evolutions` in the migration, so the next session knows what has been done.
6. **Bump `build` in `version.json`** on every push. The player is usually still
   playing while you work; the running page polls that file and offers them a
   reload when a rewrite lands. Forget it and they never find out you changed anything.
7. **Never hardcode a model id as the only path.** Providers retire them mid-playthrough.
   `ask()` in `src/llm.js` heals a retired id from the live model list — keep that
   working, and keep `listModels` tolerant (the capability field has already moved
   from `supportedGenerationMethods` to `supportedActions` once).

## Adding a mechanic (the usual request)

One file in `src/mechanics/`, registered in `src/mechanics/index.js`. The shape:

```js
export default {
  id: 'kebab-id', name: 'Player-facing name',
  blurb: 'One line, shown when it installs.',
  install(g, config) {},      // idempotent — also runs on every page load via rehydrate()
  uninstall(g) {},            // tear down timers/listeners
  prompt(g) {},               // -> string injected into the system prompt. Say how to drive it.
  beforeTurn(g) {},           // -> string appended to this turn's user message (e.g. a die roll)
  afterTurn(g) {},            // absorb whatever the model wrote into world.* into your own state
  hud(g) {},                  // -> HTMLElement | null  (use ui/dom.js: block/row/meter/el)
  draw(g, ctx, t, W, H) {},   // background canvas, under the text
  keydown(g, e) {},           // -> true if consumed. Not called while an input is focused.
  composer(g) {},             // -> { placeholder }
}
```

Mechanic-private state goes in `g.mech('id')`, which is persisted — so it must stay
JSON-safe (no `Set`, `Map`, DOM nodes, or class instances; use arrays and plain objects).

A good new mechanic **changes what the player's hands do**, not just what the HUD shows.
`deck` (you play cards instead of typing) and `grid` (arrows move you for free, only
unmapped ground costs a turn) are the bar. A new meter is not a new mechanic.

## This is played on a phone

Portrait, touch, no keyboard. Assume that when you add anything:

- Nothing interactive may live only in a hover, a keypress, or a desktop-width layout.
  `#hud` was `display:none` under 760px once, which silently made the card hand and the
  travel list unplayable. If a mechanic gives a keyboard control, give it an on-screen
  control too (see the d-pad in `grid.js`).
- Tap targets ≥ 32px, `#input` at 16px or Android zooms on focus, `dvh` not `vh`, and
  `env(safe-area-inset-bottom)` on anything at the bottom.
- Canvas overlays are suppressed under 620px wide — on a phone they just fight the text.
- Do not add a service worker. It would cache the very files the hourly rewrite replaces.

## Where things live

- `src/prompt.js` — the game's voice and rules. Edit here to change *how it narrates*.
- `src/director.js` — drift pressure and what an upheaval does. Edit to change *pacing*.
- `src/evolve.js` — the hourly nudge and the evolution prompt itself. Meta.
- `src/llm.js` — providers. The only file that touches `fetch`. `ask()` walks a fallback
  chain (retry → another model → another provider) and heals retired model ids. Keys are
  per provider in `localStorage`, deliberately not in the save.
- `src/ui/stage.js` — the particle field; `MOTION` maps the model's mood word to physics.
- `src/ui/index.js` — log, HUD, floating fragments. Fragments are turn-scoped: `ttl` counts
  down once per completed turn, `sticky` exempts one (only the rewrite nudge uses it).
  Anything the player can put on screen must also be removable by the player.

## Testing before you push

There is no test suite; verify in a real browser. Note that anything you change in
`play.sh` or `serve.py` cannot reach the player through the auto-pull that those files
implement — say so, and give them the manual command.

```sh
python3 -m http.server 8099 &
# drive it with playwright-core against /opt/pw-browsers/chromium-1194/chrome-linux/chrome
```

Boot with the offline provider (`local`), play a few turns, force an upheaval by setting
`game.state.drift.pressure` near `threshold`, install every mechanic via
`(await import('/src/mechanics/index.js')).install(window.game, id, {})`, then reload and
confirm the save rehydrates. `window.game` is exposed for exactly this. Check the console
is clean, and take a screenshot — canvas overlays must not land under the HUD column.
