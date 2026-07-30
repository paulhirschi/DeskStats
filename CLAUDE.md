# Desk Stats — project context for future sessions

A local dashboard for a 7" desk display (1024×600 landscape): a Raspberry
Pi in kiosk-mode browser hits this FastAPI server over LAN. Styled to
match [paulhirschi.com](https://paulhirschi.com) — the user's math/stats
portfolio site. Audience of one: a data scientist who wants their desk
toy to feel like a stats/math nerd's dashboard, not a corporate BI tool.

Run it: `uv run uvicorn app.main:app --host 0.0.0.0 --port 8000`

## Architecture

- **`app/main.py`** — FastAPI app. Three routes: `/` (index.html),
  `/api/snapshot` (live sim state, polled every 1s), `/api/qotd/{qtype}`
  (Claude-generated content, `?difficulty=` query param). Static files
  and the index route both send `Cache-Control: no-cache` via a custom
  `NoCacheStaticFiles` — see **Gotchas** below for why this matters.
- **`app/simulations.py`** — `SimulationHub` owns every "live" widget's
  state and ticks all of them every 0.5s via one background
  `asyncio.Task`. This is the single source of truth polled by
  `/api/snapshot` — it's what makes multiple displays (or just repeated
  reloads) see the *same* live numbers instead of each client running
  its own random sequence. Each sim is a small class with `tick()` +
  `snapshot()`; to swap in real data later, replace a `tick()` body.
- **`app/qotd.py`** — Claude API integration for the five "of the day"
  widgets. See **The QOTD system** below — this is the most involved
  part of the backend and worth understanding before touching it.
- **`static/`** — no framework, no build step, no bundler. Plain
  `index.html` + `styles.css` + `app.js`. KaTeX is vendored locally at
  `static/vendor/katex/` (self-hosted, not a CDN — this app should keep
  working with no internet access except for the Claude API calls).
- **`static/css/tokens.css`** — copied from
  `~/Projects/website/styles/tokens-{light,dark}.scss` (the portfolio
  site's own design tokens). Dark is the default theme (kinder on an
  always-on desk screen); re-copy this file if the portfolio's palette
  changes and you want this dashboard to follow.

## The widget-slot system

The grid is a **fixed 2-row × 3-column layout — 6 visible slots**, no
more, no less. There are currently **19 widgets** registered in the
`WIDGETS` array in `app.js`, and the user picks which 6 show via the
gear-icon settings modal.

How it actually works, because it's easy to get wrong:

- Every widget's `<section class="card" data-widget="...">` lives
  permanently inside `#widget-pool` (a `hidden` div) in `index.html`.
  They are **never destroyed or recreated** — only moved. This is
  deliberate: a widget's JS timers/state (an SVG chart mid-transition, a
  KaTeX render, a `setInterval`) keep running even while the widget
  isn't in a visible slot.
- `applyLayout()` in `app.js` moves the chosen 6 widgets' DOM nodes
  from the pool into the 6 `.slot` divs via `appendChild`.
  **`appendChild` moves a node but does not clear the destination's
  existing children** — so `applyLayout()` first returns *every*
  widget to the pool, then places the chosen 6. Skipping that first
  step causes duplicate widgets stacked in one slot (this actually
  happened once — see Gotchas).
- Layout is persisted to `localStorage["desk-dashboard-layout"]`
  (a JSON array of 6 widget ids, slot order). `DEFAULT_LAYOUT` in
  `app.js` is the fallback: `coin, bayes, walk, collatz, dice, fact`.
- To add a new widget: add its card markup inside `#widget-pool`, add
  `{ id, label }` to `WIDGETS`, wire up its JS (see the three patterns
  below), and it's automatically available in the picker — no other
  registration needed.

## Three kinds of widgets

**1. Live/backend-simulated** (coin, dice, walk, collatz, monty,
galton, benford) — state lives in `SimulationHub`, ticks every 0.5s,
polled via `/api/snapshot` every 1s in `pollSnapshot()` →
`renderSnapshot(data)`. Use this pattern for anything that should look
"alive" and consistent across reloads/displays.

**2. Client-side cycling** (bayes, dist, anscombe) — a small curated
list of scenarios/datasets, computed deterministically in JS (exact
math, not sampled), auto-advancing via `setInterval` every 7–8s. No
backend involvement — these don't need live randomness, just variety.
Anscombe's Quartet in particular reuses real published 1973 data and
computes its regression line live from whichever dataset is showing
(not a hardcoded line) — the fact that the line barely moves between
datasets *is* the demonstration.

**3. Claude-generated "of the day"** (integral, derivative, diffeq,
probability, stat, numday) — see below.

Plus fully static/decorative ones with no live or generated data: Ulam
Spiral (canvas, computed once), Digit by Digit (π/e/τ/φ/√2 ticker), and
Quote (hardcoded array, shuffle button).

## The QOTD system (`app/qotd.py`)

Five content types, four of which have an **EASY/MEDIUM/HARD** picker
(integral, derivative, diffeq, probability, stat); Number of the Day has
no difficulty axis — it's a fact, not a problem to solve.

- Prompts are built from `QOTD_TEMPLATES[qtype]` with a
  `%%DIFFICULTY_GUIDANCE%%` token swapped for
  `DIFFICULTY_GUIDANCE[qtype][difficulty]` (plain string replace, not
  `.format()` — the templates are full of literal LaTeX braces that
  would otherwise need escaping).
- Output is forced into a `submit_question` tool call
  (`prompt_latex` / `answer_latex` fields) so the response is always
  structured JSON, never freeform text to parse.
- **Temperature is per-type**, not uniform: `0.8` for integral/
  derivative/diffeq (exact-correctness matters more than variety for
  calculus), `1.0` for probability/stat/numday (graded on "interesting
  and correct," not "unique," so they get Claude's max temperature).
- **Caching is two-layer and this is the whole point**: an in-memory
  dict in `qotd.py` keyed `(qtype, difficulty, date)`, *and*
  `localStorage["desk-dashboard-qotd-{qtype}-{difficulty}"]` on the
  client (numday has no difficulty suffix). A widget being selected in
  the picker, or simply being displayed, **must never** by itself
  trigger a fetch — only a stale/missing date does. Switching between
  two difficulties already generated today is instant, zero network
  calls. Verified repeatedly against the server's own access log.
- A response with an empty `prompt`/`answer` (usually a `max_tokens`
  cutoff mid-generation) is rejected and **not cached**, so the next
  request just tries again rather than serving a broken result all day.
- Model default: `claude-haiku-4-5-20251001` (fast/cheap, appropriate
  since generation is at most once per type+difficulty+day), override
  via `ANTHROPIC_MODEL` in `.env`.
- Frontend reveal uses the same "button is the field" trick as the
  daily chess puzzle on paulhirschi.com/about: clicking swaps the
  button's own label between "Show solution" and the rendered answer
  (with an eye / eye-off icon swap), rather than growing the card.
- Math-heavy answers (integral/derivative/diffeq) are auto-scaled to
  fill their widget via `fitMathToBox()` — measures the rendered KaTeX
  box against the available container, computes a font-size multiplier
  (clamped 0.65×–3.5×), and refits on resize, theme toggle, and layout
  change. Prose-heavy ones (probability/stat/numday) get a scrollable
  container with a thin themed scrollbar instead, since Claude's answer
  length varies and can't be pre-sized.

## Conventions worth reusing

- **Card anatomy**: `.card` > `.card-head` (dot + label + optional
  picker/chip) + `.card-body` (content, often `.card-body-split` for
  justify-content:space-between) + optional `.card-foot`.
- **Card-head pickers**: `.pill-picker` (flex container) +
  `.pill-btn` (variable-width chip, e.g. `I II III IV` or `π e τ φ √2`)
  or `.difficulty-btn` (fixed 16px square, `E M H`). Both share
  `.is-active` for the selected state. These were consolidated from
  widget-specific names (`.anscombe-btn`, etc.) into generic reusable
  ones — keep using the generic names for anything new.
- **`localStorage` keys in use**: `desk-dashboard-theme`,
  `desk-dashboard-layout`, `desk-dashboard-constant`,
  `desk-dashboard-qotd-{type}[-{difficulty}]`,
  `desk-dashboard-qotd-difficulty-{type}`. Keep the `desk-dashboard-`
  prefix for anything new.
- **Animating SVG elements smoothly**: keep the same DOM node across
  redraws and let a CSS `transition: cx …, cy …` animate position
  changes, rather than clearing `innerHTML` and rebuilding (which
  snaps instead of gliding). Used for Anscombe's points/line and the
  Galton board's ball. To reset a transitioned element without
  animating the reset itself: set `transitionDuration = "0s"`, set the
  reset position, force a reflow (`el.getBoundingClientRect()`), *then*
  restore the real transition duration and set the real target.
- **Bar charts that must persist elements** (Galton board) vs. **bar
  charts that can freely redraw** (CLT dice, Benford, Distribution
  Showdown) — the former needs persistent `<rect>`/`<circle>` nodes
  updated in place; the latter can clear `svg.innerHTML` and rebuild
  every tick since nothing needs to animate smoothly between redraws.

## Environment & secrets

- `.env` (git-ignored) holds `ANTHROPIC_API_KEY` and optional
  `ANTHROPIC_MODEL`; `.env.example` is the template. `load_dotenv()`
  runs at the top of `main.py`.
- `uv` manages the venv + deps (`pyproject.toml` / `uv.lock`). Deps:
  `fastapi`, `uvicorn[standard]`, `anthropic`, `python-dotenv`.
- `.claude/launch.json` has a `desk-dashboard` config for the
  run/preview tooling.

## Gotchas already hit once — don't re-introduce these

1. **Stale static-asset caching.** Before `NoCacheStaticFiles` existed,
   editing JS/CSS/HTML and reloading the browser could silently keep
   serving the *old* version — wasted real debugging time chasing
   "bugs" that were just cached code. Fixed now; if something edited
   still doesn't seem to take effect, suspect the browser tool's own
   caching before assuming the fix is wrong.
2. **`appendChild` doesn't clear a slot's existing children** — see
   widget-slot system above. Always empty-then-refill, never assume
   moving a new node into a slot displaces what's already there.
3. **A `display` CSS rule can silently override the `hidden`
   attribute.** The settings modal once showed on every page load
   because `.modal-overlay { display: flex }` beat the UA default for
   `[hidden]`. Any element toggled via the `hidden` attribute that also
   has its own `display` rule needs an explicit
   `.foo[hidden] { display: none }` override.
4. **Refit ordering when a sibling's size depends on another
   element's state.** When the QOTD reveal button grows (showing an
   answer) it eats into the prompt's available space above it — the
   button must be resized *before* the prompt is refit against it, not
   after, or there's a brief overlap.
5. **Don't hand-transcribe long numeric constants.** A manual copy of
   e's first 100 digits drifted partway through once. Compute constants
   (τ, φ, √2, etc.) with arbitrary-precision arithmetic (Python's
   `decimal.Decimal`) and verify the output, rather than typing digits
   from memory.
6. **Claude generations can truncate mid-JSON** on longer answers
   (raised `max_tokens` 600→1024 after this happened once). Always
   validate `prompt`/`answer` are non-empty before trusting/caching a
   generation.
7. **Browser-automation click flakiness ≠ app bug.** The computer-use
   click tool occasionally misses due to stale coordinates after a
   layout shift. Before concluding a click handler is broken, verify
   with a direct `element.click()` / `dispatchEvent` in the JS console.

## Content standards (quotes, facts, historical data)

The user has explicitly asked for *verified* quotes and facts, not just
plausible-sounding ones. Standards actually applied so far:

- When a quote's exact wording/attribution can't be confirmed with
  reasonable confidence, either drop the `source` field or drop the
  quote entirely — don't guess. (E.g., Bill Nye's list is shorter than
  everyone else's on purpose; a couple of Hannah Arendt/Hedy Lamarr
  quotes were skipped for the same reason.)
- Watch for classic misattributions before adding a "great quote": the
  "I disapprove of what you say…" line is Voltaire's biographer's
  paraphrase, not Voltaire's; "the arc of the moral universe bends
  toward justice" is Theodore Parker/MLK, not Obama's own words even
  though he quoted it often. Both were deliberately avoided.
- Mathematical/historical datasets (Anscombe's Quartet, physical
  constants) are sourced from well-established published values, and
  cross-checked (e.g., recomputing summary statistics) rather than
  trusted from memory alone where feasible.

## Known-stale docs

`README.md` describes only the original ~6 widgets from the first pass
and hasn't been updated since. It's aimed at a human reader (e.g. on
GitHub); this file is the one that matters for picking up work. Worth
refreshing the README at some point, but nothing in it is *wrong*,
just incomplete.
