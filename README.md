# Desk Stats

A local dashboard for a 7" desk display: a grid of math/stats toys —
live simulations, generated daily problems, real datasets, a running
digit ticker — styled to match
[paulhirschi.com](https://paulhirschi.com). Point a Raspberry Pi's
kiosk browser at it over LAN and leave it running.

19 widgets are available; you pick which 6 show via the gear icon in
the header. A few highlights:

- **Live simulations** — Law of Large Numbers, Central Limit Theorem,
  a random walk, the Collatz conjecture, the Monty Hall problem, a
  Galton board, and a live Benford's Law demo — all ticking server-side
  so every display sees the same numbers.
- **Claude-generated daily problems** — an Integral, a Derivative, a
  Differential Equation, a Probability puzzle, and a Stat-concept
  question, each with an Easy/Medium/Hard picker, rendered in LaTeX,
  regenerated once a day per difficulty.
- **Real data, not toy data** — Anscombe's Quartet (the actual 1973
  datasets), a Ulam spiral, Bayes' theorem / PPV, a distribution
  comparison showdown.
- **Just for fun** — a shuffleable quote widget (Marcus Aurelius to
  Maryam Mirzakhani), and a digit-by-digit ticker for π, e, τ, φ, and √2.

## Run it

```bash
uv run uvicorn app.main:app --host 0.0.0.0 --port 8000
```

Then point the Pi's browser (kiosk mode) at `http://<this-machine>:8000`.

### Enable the Claude-generated widgets (optional)

The five "of the day" widgets call the Claude API. Without a key they
show a plain "couldn't load" message and everything else still works.

```bash
cp .env.example .env
```

Then edit `.env` and set `ANTHROPIC_API_KEY`. Each widget/difficulty
combination is generated at most once per day and cached (server-side
in memory, client-side in `localStorage`), so this stays cheap even
left running for months.

## Choosing which widgets show

Click the gear icon in the header to open the widget picker: six
dropdowns, one per slot, listing all 19 widgets. Picking a widget
already shown elsewhere swaps the two slots. The layout is remembered
per browser, so the Pi's kiosk browser and your laptop can each show a
different arrangement.

## How it's built

- **Backend** (`app/`):
  - `simulations.py` — a `SimulationHub` advances every live simulation
    every 0.5s in one background task, polled via `/api/snapshot` once
    a second. Each sim is a small class with `tick()` + `snapshot()`.
  - `qotd.py` — generates the daily problems via the Claude API, with a
    forced structured tool-call, per-type difficulty prompts, and the
    once-a-day caching described above.
  - `main.py` — the FastAPI app tying it together, serving the frontend
    with `Cache-Control: no-cache` (this app changes often enough in
    development that stale browser caching isn't worth the risk).
- **Frontend** (`static/`): no framework, no build step — plain
  HTML/CSS/JS. Chart-style widgets are hand-rolled SVG; math widgets
  render via a locally-vendored KaTeX (`static/vendor/katex/`, no CDN
  dependency). Widgets you're not currently showing stay alive in a
  hidden pool rather than being torn down, so their timers/state keep
  running if you switch back to them later.
- **Design tokens** (`static/css/tokens.css`): copied from
  `~/Projects/website/styles/tokens-{light,dark}.scss` so the palette,
  type, and card chrome match the portfolio site. Defaults to dark
  (better for an always-on desk screen); toggle in the header.

See [`CLAUDE.md`](CLAUDE.md) for the full architecture writeup,
widget-authoring conventions, and a list of gotchas worth not repeating
— that's the file to read before making non-trivial changes here.

## Swapping in real data later

Each simulation lives in its own small class in `app/simulations.py`
with a `tick()` and `snapshot()` method — replace a `tick()` body with
a real data pull (a sensor reading, an API call, a DB query) and the
frontend doesn't need to change.
