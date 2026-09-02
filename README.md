# game3

A text game that does not stay one game.

You type what you do. A language model narrates, and — crucially — is allowed to
change the machinery you are playing with: install a grid, deal you a hand of cards,
start a clock, take your inventory away. Every so often the accumulated pressure tips
over and the whole thing becomes a different kind of game, grown out of what already
happened. Once an hour it asks to be rewritten, and hands you a prompt to paste at
Claude so the *code* changes too.

Single player. No server. No build step.

## Running it

ES modules need HTTP, so `file://` will not work:

```sh
./play.sh            # serves on :8099 and git-pulls every 60s
./play.sh 9000 0     # different port, no auto-pull
```

`play.sh` only starts helping once you have pulled it and restarted your server
with it — the first pull after any change to `play.sh` itself is always by hand:

```sh
git pull && ./play.sh
```

The auto-pull is what makes rewrites arrive on their own: it fast-forwards the
branch, the running page notices `version.json` changed, and the **rewritten ⟳**
button appears. Nothing touches a session in progress until you press it. It only
fast-forwards, so local edits stop the loop rather than being clobbered — and it
does mean you are running pushed code without reading it first. `./play.sh 8099 0`
turns it off, or just use `python3 -m http.server 8099` and pull by hand.

## Getting a model behind it

It boots on an offline procedural fallback so it is playable immediately, but that
engine is deliberately stupid. Open **⚙ → provider** and pick one:

| Provider | Cost | Notes |
| --- | --- | --- |
| **Google Gemini** | free tier | Best default. Key from [aistudio.google.com/apikey](https://aistudio.google.com/apikey). ~15 req/min on Flash — fine for one player. Google may train on free-tier prompts. |
| **Groq** | free tier | Very fast, open models. Good when you want turns to land instantly. |
| **OpenRouter** | free model pool | Rotating `:free` models; `list models` fills the dropdown. |
| **Anthropic** | paid | Best prose and the most reliable at obeying mechanics. ~half a cent per turn on Haiku. |
| **offline** | — | No network. Procedural nonsense, for testing the engine. |

Save a key for **more than one** provider and the game uses the rest as a fallback
chain. When a model comes back overloaded it waits and retries, then tries another
model from the same provider, then another provider entirely — telling you each time
it moves. A turn that fails everywhere is not lost: it comes back with a **try again**
button. ⚙ shows the fallback order.

Hit **list models** in settings to pull the live model list from whichever provider
you picked, so you never have to guess a model id — it fills itself in automatically
when you open settings with a key already saved.

Providers retire model ids without warning. If the one you are on disappears
mid-playthrough, the game asks the provider what it has now, picks the closest
equivalent, retries the turn, and tells you it did — you do not lose the turn or
the save.

Your key is kept in `localStorage` in your browser and sent only to that provider.
This is a personal, local toy — don't host it publicly with a key in it.

## On a phone

This is built to be played on one. The HUD is a scrolling strip above the composer
— several mechanics live in it, so it is never hidden — and the **▤** button pulls it
up into a full sheet you can play from. The grid mechanic has an on-screen d-pad as
well as arrow keys. The composer does not steal focus after a turn, so the keyboard
stays down until you ask for it. Add it to your home screen and it runs fullscreen.

The server has to run somewhere your phone can reach it — a machine on the same
network (`./play.sh`, then browse to that machine's LAN address), or any static host.

**On GitHub Pages** there is nothing to pull: a push is the deploy. The catch is that
Pages serves assets with a ten-minute `max-age`, so a plain reload can hand the browser
back the same code you are trying to replace — and on a phone there is no convenient
hard-reload. The game handles this itself: `src/build.js` carries the build baked into
the running JavaScript, `version.json` carries the published one, and when they disagree
the header says so. Pressing **rewritten ⟳** re-requests every file with the cache
bypassed *before* reloading, so the reload starts from fresh copies.

## Playing

- Type anything. The suggested actions are suggestions, not a menu.
- The thin rail under the header is **drift pressure**. When it fills, the game
  upheaves into a new era: new palette, new prose rules, new mechanics.
- Mechanics announce themselves with `⟡`. When `grid` is installed, arrow keys move
  you for free — only stepping onto unmapped ground spends a turn.
- **evolve** builds the prompt you paste at Claude to change the source. The button
  starts glowing after an hour of play.
- **Scroll up and the game waits.** The log only follows along while you are already
  at the bottom; once you scroll back to read, new text stacks up quietly behind a
  **↓ new** button and any real-time mechanic holds until you return. The clock also
  has a **hold it** button, and pauses while the tab is in the background.
- Floating fragments last a few turns. Tap one to dismiss it, drag to move it,
  press **esc** or use ⚙ → clear fragments to sweep them all.
- Everything autosaves to `localStorage`; ⚙ can export/import a save as JSON.

## On a phone

This is built to be played on one. The HUD is a scrolling strip above the composer
— several mechanics live in it, so it is never hidden — and the **▤** button pulls it
up into a full sheet you can play from. The grid mechanic has an on-screen d-pad as
well as arrow keys. The composer does not steal focus after a turn, so the keyboard
stays down until you ask for it. Add it to your home screen and it runs fullscreen.

The server has to run somewhere your phone can reach it — a machine on the same
network (`./play.sh`, then browse to that machine's LAN address), or any static host.

**On GitHub Pages** there is nothing to pull: a push is the deploy. The catch is that
Pages serves assets with a ten-minute `max-age`, so a plain reload can hand the browser
back the same code you are trying to replace — and on a phone there is no convenient
hard-reload. The game handles this itself: `src/build.js` carries the build baked into
the running JavaScript, `version.json` carries the published one, and when they disagree
the header says so. Pressing **rewritten ⟳** re-requests every file with the cache
bypassed *before* reloading, so the reload starts from fresh copies.

## Playing while it is being rewritten

You can. The page runs entirely from files already loaded, so edits landing in the
repo cannot disturb a session in progress, and every turn autosaves.

Claude works in its own throwaway clone in the cloud — it can push, but it cannot
reach the machine you are playing on, so *something on your side* has to pull.
That is what `./play.sh` is for. With it running, the loop is: Claude pushes, your
server pulls within a minute, the **rewritten ⟳** button appears in the header, and
you press it when you reach a good moment. Mid-scene is fine; between scenes reads
better. Your save migrates forward on load.

**Which build am I actually running?** ⚙ settings shows it, and the console logs
`game3 build …` on load. If that does not match `version.json` on disk, the page is
running older code than the server has — reload, or hard-reload (ctrl/cmd-shift-R).
`serve.py` sends `no-store` on every response so this should not happen; plain
`python3 -m http.server` sends no cache headers at all and leaves it to the browser's
heuristics.

Don't keep the same save open in two tabs — last write wins.

## Layout

```
index.html          shell, canvas, composer
styles.css          era palette lives in CSS variables the game rewrites
src/state.js        save, migrations, and the op language the model mutates the world with
src/llm.js          providers; the only file that knows about HTTP
src/prompt.js       what the model is told it is
src/director.js     drift pressure and upheaval
src/evolve.js       the hourly rewrite nudge, the evolution prompt, settings, rewrite watcher
version.json        the published build; polled by the running game
src/build.js        the build baked into the running code — mismatch means a stale cache
play.sh             serve + auto-pull
serve.py            static server that refuses to let the browser cache stale code
src/mechanics/      one file per way of playing — the seam the game changes through
src/ui/             log, HUD, floating fragments, canvas stage
```
