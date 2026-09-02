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
   The v4→v5 migration is a one-time, explicitly-requested exception (the player asked
   to start over) that replaces the whole state — that pattern exists for exactly that
   ask, not as a template for a routine migration. Don't reach for it casually.
2. **No build step, no dependencies.** Plain ES modules served over static HTTP. If you
   find yourself wanting a bundler, don't. This extends to the 3D renderer: `engine3d.js`
   is hand-rolled WebGL — no Three.js, no CDN import, even though it would be less code.
   A `<script src="cdn...">` is still a dependency; it just hides where it lives.
3. **The model never executes code.** It mutates the world only through the op language
   in `src/state.js` (`applyOps`). Unknown ops are ignored on purpose — that is what
   makes an old save loadable by new code and vice versa. Keep paths confined to
   `world.` / `player.` / `era.`.
4. **A broken mechanic must not kill the game.** `draw`, `hud`, and lifecycle hooks are
   called inside try/catch or via `collect()`. Keep it that way.
5. **Append to `EVOLUTION_LOG.md`** every time, and add the same line to
   `meta.evolutions` in the migration, so the next session knows what has been done.
6. **Bump the build in BOTH `version.json` and `src/build.js`** on every push, to the
   same string. `version.json` is what the running page polls; `src/build.js` is what
   is baked into the JavaScript it is actually executing. Equal means up to date;
   published-ahead means a rewrite landed *or* the browser is serving cached modules,
   and the game says which. Forget them and the player never learns you changed anything.
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
  hud(g) {},                  // -> HTMLElement | null  (use ui/dom.js: block/row/meter/el —
                               //    on a phone only block()'s title stays visible until the
                               //    sheet is opened; put anything time-critical in the title)
  draw(g, ctx, t, W, H) {},   // background canvas, under the text
  render(g) {},               // -> HTMLElement[], absolutely positioned over #rig (see rig.js)
  keydown(g, e) {},           // -> true if consumed. Not called while an input is focused.
  composer(g) {},             // -> { placeholder }
}
```

Mechanic-private state goes in `g.mech('id')`, which is persisted — so it must stay
JSON-safe (no `Set`, `Map`, DOM nodes, or class instances; use arrays and plain objects).

A good new mechanic **changes what the player's hands do**, not just what the HUD shows.
`deck` (you play cards instead of typing), `walk` (a 3D room you move an avatar through
with a thumbstick), and `rig` (the model draws the mechanism as touchable marks over the
scene instead of describing it) are the bar. A new meter is not a new mechanic.

## The three pillars

The player asked, explicitly, for the game to stop being an abstract dream that
accumulated mysteries it never explained. Three things exist to hold that line, and a
future rewrite should be reluctant to remove any of them:

- **`walk`** (`src/mechanics/walk.js`, renderer in `src/engine3d.js`) — a hand-rolled
  WebGL 3D room the player walks with a joystick, replacing typed/tapped travel as the
  default. The model authors geography via `world.walkPlaces.<id>` / `world.walkAt`,
  the same delta-channel idiom `grid`/`nodes` already used for `world.map`/`world.places`.
  Do not install `grid` or `nodes` alongside it — same feature, worse fit for what the
  player asked for. `grid`/`nodes` still exist and still work; they're just not the default.
  A few things about it are load-bearing, not incidental:
  - **Steering, not camera-relative input, from either stick.** Left/right on the move
    stick turns the avatar directly (heading is sticky between pushes); up/down moves along
    whatever it's currently facing. The right (view) stick's left/right also turns the
    avatar — same direct math, a second way to nudge heading, not a separate camera-only
    concept — because "which way I'm looking" and "which way I'm facing" being different
    things made the two joysticks feel unrelated instead of one control. The chase camera
    has no independent yaw of its own: it only ever lerps toward `a.heading`. The first
    movement version rotated the raw stick input by the camera's own yaw instead — since
    the camera chases the avatar's heading, that fed back on itself and turned "hold right"
    into a runaway spin rather than a turn that settles. If you touch movement or the view
    stick, keep heading updates direct and linear in the input, never derived from a value
    the camera itself lags.
  - **Every prop needs a real `y`.** `engine3d.js`'s box renderer requires `{x,y,z,...}` —
    a prop object with no `y` produces `NaN` in its model matrix and WebGL just silently
    drops it, no JS error. `expandProp()`/the shape kits are what supply it now; don't start
    passing raw prop specs straight to `boxes:` again.
  - **Props are shape kits, not one block.** `SHAPE_KITS` in `walk.js` (box/pillar/table/
    chest/shelf/lamp/tree/person) each expand a prop's bounding w/h/d into a few correctly-
    placed sub-boxes. `person` reuses the same `humanoidBoxes()` the player avatar is built
    from, so an NPC reads as a relative of the player, not a stranger kind of block.
  - **`localToWorld(cx, cz, ry, dx, dz)` is the one correct local-frame transform** — dx is
    the object's own right, dz its own forward, verified against the camera's proven eye-
    offset formula. Don't reintroduce the old arm-only `x+dx*cos, z-dx*sin` shortcut for
    anything with a front/back distinction (a face, hair, a chest's lid) — it was never
    validated for direction, only got away with it because arms are symmetric.
  - **`mat4.rotateY` in `engine3d.js` must agree with `localToWorld`'s sign, not just any
    valid rotation matrix.** A box's world *position* swings around the body's pivot via
    `localToWorld`; its own *orientation* comes separately from `rotateY(b.ry)`. Both are
    individually "correct" rotation matrices in the abstract, but if their sign conventions
    disagree, position and orientation spin in opposite senses — a rigid part reads as
    rotating in place, backwards, against the body. They were built independently and did
    disagree once already. At heading 0 both reduce to identity, so this is invisible unless
    you actually turn something and check which way a part *faces*, not just where its
    center ends up — check both together (compare a rotated box's local front against the
    same forward vector the camera uses) if you ever touch either one.
  - **Labels are tap-to-reveal**, not always-on. Each prop/exit gets a `.walk-hotspot` sized
    from its projected on-screen footprint; tapping it shows the `.walk-label` for a few
    seconds. When two hotspots overlap (a big exit marker behind a small prop), the smaller
    one must win the tap — `updateMark()` gives it the higher z-index for exactly this.
  - **The room is the screen, and text is a drawer, not a permanent slice of it.** A
    fixed `--scene-h` split was tried first and lost either way it was sized — big enough
    to read cost too much of the room, small enough to leave the room alone couldn't fit
    a line. `#log`/`#hud`/`#composer` now live inside `#log-drawer` (`body.walk-active
    #log-drawer { display: none }`), collapsed to a tap-to-open peek bar (`#log-peek`:
    icon + latest line) until a real tap opens it as a bottom sheet over the dimmed
    scene. Below a thin always-visible status strip (topbar/drift/goal/peek), the scene
    pane's `top`/`height` is set from `--status-h`, and that value is *measured*
    (`ui.syncStatusHeight()`, via `getBoundingClientRect()` on the status stack — called
    on boot, on era/goal re-render, and on resize), never a guessed constant: era name
    length, goal text, and safe-area insets all change the real number, and a hardcoded
    one has already been wrong twice in this project's history (`--scene-h` itself, and
    this very `--status-h` on its first cut). Anything that shows inside the drawer
    (`#hud` included) needs the drawer open to be visible at all — `toggleHud()` opens
    `log-open` too, in `walk-active` mode, so `#btn-hud` doesn't set a class with nothing
    rendered behind it.
- **`mysteries`** (`src/mechanics/mysteries.js`) — the loose-threads ledger. Every
  unexplained fact the story introduces (the 47 tally marks that never got an answer is
  the example that prompted this) must be registered via `world.mysteryOpen.<id>` in the
  same reply that introduces it, and resolved via `world.mysteryResolved.<id>` once the
  story earns the answer. The HUD title shows the open count even collapsed.
- **`player.goal`** — a plain string, not a mechanic (so it can't be uninstalled). Always
  visible in the goal bar under the drift rail. The player can set or overwrite it
  directly by tapping it; the model reads it from `digest()` every turn and can update it
  as the story develops. An empty goal is a prompt for the model to help find one soon.

Pacing is temporarily fast (`FAST_ARC_TUNING` in `src/state.js`, `drift.threshold` starts
at 6) so a full arc can be felt in one sitting while it's being tuned. Raise `initial` and
`cap` back toward their old values (14 and 46) once the shape feels right — that's the
whole knob.

## This is played on a phone

Portrait, touch, no keyboard. Assume that when you add anything:

- Nothing interactive may live only in a hover, a keypress, or a desktop-width layout.
  `#hud` was `display:none` under 760px once, which silently made the card hand and the
  travel list unplayable. If a mechanic gives a keyboard control, give it an on-screen
  control too (see the joystick in `walk.js`, or the d-pad in `grid.js`).
- Tap targets ≥ 32px, `#input` at 16px or Android zooms on focus, `dvh` not `vh`, and
  `env(safe-area-inset-bottom)` on anything at the bottom.
- Canvas overlays are suppressed under 620px wide — on a phone they just fight the text.
- The on-screen keyboard eats roughly 40% of the screen while it is up. Nothing should
  refocus `#input` on the player's behalf after a turn (already the case — see `focus()`
  in `ui/index.js`), and submitting a typed line blurs it, or the keyboard stays open
  over the very prose the player just asked for.
- A touch produces a synthesized `click` after `pointerup`. Anything that removes
  itself on touch must `preventDefault()` on `pointerdown` and stay interactive while
  it fades, or that click lands on whatever it was covering.
- Never yank the view. The log follows only while pinned to the bottom (`ui.reading`
  is true once the player scrolls up); anything on a real-time clock must check it and
  hold. Reading speed is the player's, not the game's.
- Do not add a service worker. It would cache the very files the hourly rewrite replaces.

## Where things live

- `src/prompt.js` — the game's voice and rules. Edit here to change *how it narrates*.
- `src/director.js` — drift pressure and what an upheaval does. Edit to change *pacing*.
- `src/evolve.js` — the hourly nudge and the evolution prompt itself. Meta.
- `src/llm.js` — providers. The only file that touches `fetch`. `ask()` walks a fallback
  chain (retry → another model → another provider) and heals retired model ids. Keys are
  per provider in `localStorage`, deliberately not in the save.
- `src/engine3d.js` — the hand-rolled WebGL renderer `walk.js` draws with: mat4/vec3
  math, a box mesh, a procedural grid-floor shader. No face culling (see the comment in
  the file) — the scene is small enough that it isn't worth reasoning about winding order.
- `src/ui/stage.js` — the particle field; `MOTION` maps the model's mood word to physics.
  Hidden (not removed) while `walk` is installed — `#scene3d` takes over the same
  full-bleed background layer, since a canvas can't hold two kinds of context.
- `src/ui/index.js` — log (sticky-bottom scrolling), HUD, floating fragments. Fragments are turn-scoped: `ttl` counts
  down once per completed turn, `sticky` exempts one (only the rewrite nudge uses it).
  Anything the player can put on screen must also be removable by the player.

## Testing before you push

There is no test suite; verify in a real browser. Note that anything you change in
`play.sh` or `serve.py` cannot reach the player through the auto-pull that those files
implement — say so, and give them the manual command.

```sh
python3 serve.py 8099 &
# drive it with playwright-core against /opt/pw-browsers/chromium-1194/chrome-linux/chrome
```

Boot with the offline provider (`local`), play a few turns, force an upheaval by setting
`game.state.drift.pressure` near `threshold`, install every mechanic via
`(await import('/src/mechanics/index.js')).install(window.game, id, {})`, then reload and
confirm the save rehydrates. `window.game` is exposed for exactly this. Check the console
is clean, and take a screenshot — canvas overlays must not land under the HUD column.

Headless Chromium needs software WebGL flags to render `walk`'s 3D scene at all —
`--use-gl=angle --use-angle=swiftshader --enable-webgl --ignore-gpu-blocklist
--disable-gpu-sandbox` on `chromium.launch()`. Without them `canvas.getContext('webgl2')`
returns `null` and the mechanic degrades to text-only (by design — see `install()` in
`walk.js`), which looks like nothing is wrong until you check for the system message.
