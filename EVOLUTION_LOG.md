# Evolution log

One line per rewrite, newest last. The in-game **evolve** prompt asks Claude to
append here so a later session can see what the game has already been.

- **Era 0 — the engine.** Turn loop, op language, drift/upheaval, canvas stage,
  floating fragments, hourly rewrite nudge. Seven starting mechanics:
  resources, inventory, stats, timer, deck, grid, nodes.
- **Fix — model retirement.** Google retired `gemini-2.5-flash` for new keys and moved
  the ListModels capability field to `supportedActions`, which emptied the model dropdown.
  Default is now `gemini-3.6-flash`; `listModels` paginates and accepts either field;
  a retired id is re-discovered and retried automatically mid-turn. Added `version.json`
  and the rewrite watcher, so a rewrite pulled underneath a live session announces itself.
- **Fix — floating fragments.** They had no working lifetime and could not be dismissed,
  so they accumulated forever; dragging also snapped the box's corner to the cursor, which
  read as the thing lurching away when clicked. Fragments now expire after a few turns
  (`ttl`, in turns), drag from where you grab them, and dismiss on a click that did not
  move. The rewrite nudge is `sticky` and stays. Added `play.sh` (serve + auto-pull).
- **Fix — stale builds.** `play.sh` shipped in the same commit as the floater fix, so it
  could not have pulled that commit; the reload button was from the previous build and the
  fix was never fetched. Added `serve.py` (every response `no-store`, so a pulled rewrite
  cannot be masked by a cached module), the running build id in settings and the console,
  esc to sweep all fragments, and a boot-time cull of any fragment with no life left.
  Default fragment lifetime cut from 6 turns to 3.
- **Phone-first, and a fallback chain.** The game is played only on a phone, where the HUD
  had been hidden below 760px — making the card hand, inventory and travel list unreachable.
  It is now a scrolling strip that pulls up into a sheet, with a d-pad for `grid`, no focus
  stealing, safe-area padding and a web app manifest. On overload, `ask()` retries with
  backoff, then falls to another model, then to another provider (keys are now per
  provider), and a failed turn offers a retry rather than being lost. Fixed a filter that
  tested `/mini/` against model ids — every *gemini* model matched it.
- **Read at your own pace.** The log auto-scrolled on every append, so new text yanked
  the view down mid-paragraph, and the `timer` mechanic burned turns while the player was
  still reading. The log now follows only while already at the bottom, offers a "↓ new"
  button otherwise, and exposes `ui.reading` so timed mechanics hold — as does the clock
  when the tab is hidden or when held by hand (default 45s to 75s). Auto-follow is
  instant rather than smooth, because animating it fired mid-flight scroll events that
  unpinned the view. Added `src/build.js` so a stale cache can be told apart from a fresh
  rewrite, and made the reload button refetch every file with the cache bypassed first —
  which is what GitHub Pages' ten-minute max-age needs on a phone.
- **Fix — fragments tapped through themselves.** Dismissing a floating fragment removed it
  on `pointerup`, and the synthesized click that follows a touch then landed on whatever
  the fragment had been covering — usually a suggested action, which quietly spent a turn.
  Fragments now cancel the compatibility mouse events on `pointerdown`, swallow clicks
  outright, and stay interactive while fading so a stray click is absorbed rather than
  passed through.
- **Fix — the keyboard was eating the log.** Sending a typed line left the on-screen
  keyboard open, which on a phone is roughly 40% of the screen — measured, that dropped
  the log from ~13 visible lines to ~4. Nothing had ever closed the keyboard the player's
  own typing opened; `focus()` only ever refused to *reopen* it after a turn. Submitting
  now blurs the input, and the viewport declares `interactive-widget=resizes-content` so
  supporting browsers size the layout around the keyboard correctly while it's up.
- **Evolution — the apparatus, drawn.** Requested: more visuals, less text. Added `rig`,
  a mechanic that draws the current mechanism as small touchable marks positioned over
  the scene — the model places and moves them by writing `world.rig.<id>`, in the same
  idiom `grid` and `nodes` already use for `world.map` and `world.places`. Tapping a part
  touches it, dragging one pulls at it; both arrive as input in place of a typed sentence.
  A `stage` (ok/strained/broken) and a `hot` flag carry urgency visually — no reading
  required. Default narration length is cut to 1-2 short paragraphs throughout, and
  mechanics are told not to re-describe what they already render. Also fixed a duplicated
  "On a phone" section in README.md left over from an earlier edit.
- **Fix — the phone strip was still too tall, and a long era name overlapped the header.**
  A real-device screenshot (Brave, which keeps its own persistent chrome the earlier
  viewport tests didn't account for) showed the log still cut to ~4 lines even with the
  keyboard closed — the always-expanded HUD strip (up to 132px per block) plus choices
  plus composer simply cost more than the budget allowed. The strip now shows only each
  block's title (a `block()` change in `ui/dom.js` wraps content in `.hud-body`, hidden
  under 760px until the sheet is pulled up); tapping anywhere on the collapsed strip opens
  it. `timer` puts its live countdown in the title text itself, since that's the one
  time-critical thing that can't wait for a tap. Also: `#era-name` had no line-clamp, so a
  long title wrapped to two lines and the second line ran under the baseline-aligned clock
  and buttons — it's now single-line with an ellipsis on phone widths.
- **The reset — a concrete, coherent world in 3D.** Requested by the player: the game had
  become too abstract and dream-like, with mysteries (47 tally marks, among others) that
  were never on track to be explained, and it took too long to leave the opening scene.
  Reused the engine — op language, provider fallback, the evolve loop, mobile chrome — and
  replaced the defaults that were producing that feel:
  - `src/engine3d.js` — a hand-rolled WebGL renderer (mat4/vec3 math, flat-shaded boxes,
    a procedural grid-floor shader; no external 3D library). `walk.js` uses it for a
    third-person room the player moves through with a thumbstick instead of typed or
    tapped travel — the model authors geography via `world.walkPlaces.<id>`/`world.walkAt`,
    the same delta-channel idiom `grid`/`nodes` already used. Installed by default; `grid`
    and `nodes` still exist but are now discouraged alongside it (same feature, worse fit).
  - `mysteries.js` — a loose-threads ledger. Every unexplained fact the story introduces
    must be registered (`world.mysteryOpen.<id>`) in the same reply and resolved
    (`world.mysteryResolved.<id>`) once earned; the HUD title shows the open count even
    collapsed. Installed by default, and instructed never to be uninstalled.
  - `player.goal` — a plain string, not a mechanic, shown in a new always-visible goal bar
    under the drift rail. The player can set or overwrite it by tapping it; the model reads
    it every turn from `digest()` and can update it as the story develops.
  - `prompt.js` rewritten for concreteness and forward momentum: ground everything in
    named, physically consistent detail; register the strange instead of letting it
    accumulate; something should move most turns.
  - Pacing temporarily much faster (`FAST_ARC_TUNING` in `state.js`, threshold 14 → 6) so
    a full arc can be felt in one sitting while its shape is tuned.
  - `STATE_VERSION` 4 → 5: an intentional, explicitly-requested full reset (not the usual
    additive migration) — carries forward only the evolution history and the provider/model
    choice. Documented in `CLAUDE.md` as a one-time pattern, not a template.
