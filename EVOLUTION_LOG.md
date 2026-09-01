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
