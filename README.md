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
python3 -m http.server 8099
# then open http://localhost:8099
```

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

Hit **list models** in settings to pull the live model list from whichever provider
you picked, so you never have to guess a model id.

Your key is kept in `localStorage` in your browser and sent only to that provider.
This is a personal, local toy — don't host it publicly with a key in it.

## Playing

- Type anything. The suggested actions are suggestions, not a menu.
- The thin rail under the header is **drift pressure**. When it fills, the game
  upheaves into a new era: new palette, new prose rules, new mechanics.
- Mechanics announce themselves with `⟡`. When `grid` is installed, arrow keys move
  you for free — only stepping onto unmapped ground spends a turn.
- **evolve** builds the prompt you paste at Claude to change the source. The button
  starts glowing after an hour of play.
- Everything autosaves to `localStorage`; ⚙ can export/import a save as JSON.

## Layout

```
index.html          shell, canvas, composer
styles.css          era palette lives in CSS variables the game rewrites
src/state.js        save, migrations, and the op language the model mutates the world with
src/llm.js          providers; the only file that knows about HTTP
src/prompt.js       what the model is told it is
src/director.js     drift pressure and upheaval
src/evolve.js       the hourly rewrite nudge, the evolution prompt, settings
src/mechanics/      one file per way of playing — the seam the game changes through
src/ui/             log, HUD, floating fragments, canvas stage
```
