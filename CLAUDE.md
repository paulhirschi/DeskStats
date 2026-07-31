# Desk Stats — project context for future sessions

A local dashboard for a 7" desk display (1024×600 landscape): a Raspberry
Pi in kiosk-mode browser hits this FastAPI server over LAN. Styled to
match [paulhirschi.com](https://paulhirschi.com) — the user's math/stats
portfolio site. Audience of one: a data scientist who wants their desk
toy to feel like a stats/math nerd's dashboard, not a corporate BI tool.

Run it: `uv run uvicorn app.main:app --host 0.0.0.0 --port 8000`

## Architecture

- **`app/main.py`** — FastAPI app. Routes: `/` (index.html),
  `/api/snapshot` (live sim + ISS state, polled every 1s),
  `/api/reset/{name}` (POST, restarts one `SimulationHub` sim — see
  **Reset buttons** below), `/api/qotd/{qtype}` (Claude-generated
  content, `?difficulty=` query param). Static files and the index route
  both send `Cache-Control: no-cache` via a custom `NoCacheStaticFiles`
  — see **Gotchas** below for why this matters.
- **`app/simulations.py`** — `SimulationHub` owns every RNG-driven "live"
  widget's state and ticks all of them every 0.5s via one background
  `asyncio.Task`. This is the single source of truth polled by
  `/api/snapshot` — it's what makes multiple displays (or just repeated
  reloads) see the *same* live numbers instead of each client running
  its own random sequence. Each sim is a small class with `tick()` +
  `snapshot()` + `reset()` (just re-runs `__init__`); `SimulationHub.
  RESETTABLE` whitelists which sim names `/api/reset/{name}` accepts.
- **`app/iss.py`** — `ISSTracker`, a second background task polling the
  free Open Notify API (real position + crew, not simulated) on its own
  slow ~5s/10min cadence — hitting SimulationHub's 0.5s tick would be
  pointless and rude to a third party's free API. Its `snapshot()` is
  merged into the same `/api/snapshot` payload under an `"iss"` key so
  the frontend only needs the one poll loop. This is the app's one
  dependency on outbound internet access beyond the Claude API (see the
  `static/` bullet below) — a network hiccup just leaves the last-known
  position in place rather than erroring the widget.
- **`app/qotd.py`** — Claude API integration for the five "of the day"
  widgets. See **The QOTD system** below — this is the most involved
  part of the backend and worth understanding before touching it.
- **`static/`** — no framework, no build step, no bundler. Plain
  `index.html` + `styles.css` + `app.js`. KaTeX is vendored locally at
  `static/vendor/katex/`, and the ISS tracker's world coastline is
  vendored at `static/js/world-land.js` (both self-hosted, not a CDN).
  Aside from `app/iss.py` polling Open Notify and `app/qotd.py` calling
  the Claude API, this app runs with no internet access — the Pi's
  browser itself only ever talks to this local server over LAN.
- **`static/css/tokens.css`** — copied from
  `~/Projects/website/styles/tokens-{light,dark}.scss` (the portfolio
  site's own design tokens). Dark is the default theme (kinder on an
  always-on desk screen); re-copy this file if the portfolio's palette
  changes and you want this dashboard to follow.

## The widget-slot system

The grid is **3 columns, always** — but the row count is responsive:
**2 rows (6 slots)** normally, sliding in a **3rd row (9 slots)** once
the viewport is both wide and tall enough (a tablet in landscape, a big
monitor — not the 1024×600 baseline). There are currently **21
widgets** registered in the `WIDGETS` array in `app.js`; the user picks
which ones show, per visible slot, via the gear-icon settings modal.

The responsive breakpoint is duplicated on purpose, once in each
language, and **the two numbers must be kept in sync by hand**:

- `styles.css` — `@media (min-width: 960px) and (min-height: 760px)`
  sets `grid-template-rows: repeat(3, 1fr)` and reveals the 3
  `.slot-extra` divs (`display: flex`, overriding their default
  `display: none`). This is what the browser actually renders.
- `app.js` — `const THREE_ROW_QUERY = "(min-width: 960px) and
  (min-height: 760px)"` feeds a `matchMedia()` that `getSlotCount()`
  checks (returns `9` or `6`). This is what JS uses to decide how many
  widgets to actually place. If these two ever drift apart, the grid
  will *visually* show 9 cells while JS only populates 6 of them (or
  vice versa) — always change both at once.
- The 960/760 numbers were chosen specifically to sit outside the
  pre-existing small-screen fallback (`max-width: 900px, max-height:
  560px`, 2 columns + scroll) so the two media queries can never both
  match at once and fight over the grid.

How the slot mechanics work, because it's easy to get wrong:

- Every widget's `<section class="card" data-widget="...">` lives
  permanently inside `#widget-pool` (a `hidden` div) in `index.html`.
  They are **never destroyed or recreated** — only moved. This is
  deliberate: a widget's JS timers/state (an SVG chart mid-transition, a
  KaTeX render, a `setInterval`) keep running even while the widget
  isn't in a visible slot.
- `applyLayout()` in `app.js` calls `getSlotCount()` to find out how
  many slots are *currently* visible, then moves that many widgets'
  DOM nodes from the pool into the `.slot` divs via `appendChild`.
  **`appendChild` moves a node but does not clear the destination's
  existing children** — so `applyLayout()` first returns *every*
  widget to the pool, then places the visible ones. Skipping that first
  step causes duplicate widgets stacked in one slot (this actually
  happened once — see Gotchas).
- `layout` is a **9-entry array always**, in `app.js` and in
  `localStorage["desk-dashboard-layout"]`, even while only 6 slots are
  on screen — `applyLayout()` just uses `layout.slice(0,
  getSlotCount())`. This means resizing down to 2 rows and back up to 3
  doesn't forget what was in slots 7–9. `DEFAULT_LAYOUT` in `app.js`
  is the fallback (9 ids: the original 6, then `monty, quote, numday`
  for the 3rd row).
- `threeRowMedia.addEventListener("change", applyLayout)` re-runs
  placement whenever the breakpoint is crossed (resizing the window,
  rotating a tablet). The settings modal's row count is only read at
  `openSettings()` time, though — if you resize while it's open, it
  won't add/remove rows until you close and reopen it. Acceptable
  trade-off so far, not fixed.
- To add a new widget: add its card markup inside `#widget-pool`, add
  `{ id, label }` to `WIDGETS`, wire up its JS (see the three patterns
  below), and it's automatically available in the picker — no other
  registration needed.

## Three kinds of widgets

**1. Live/backend-simulated** (coin, dice, walk, collatz, monty,
galton, benford) — state lives in `SimulationHub`, ticks every 0.5s,
polled via `/api/snapshot` every 1s in `pollSnapshot()` →
`renderSnapshot(data)`. Use this pattern for anything that should look
"alive" and consistent across reloads/displays. Each of these seven has
a reset button in its card-head — see **Reset buttons** below.

**1b. Live/real-world-data** (iss) — same `/api/snapshot` poll, same
"alive and consistent across displays" property, but the state isn't
RNG-driven so there's nothing to usefully "reset": `ISSTracker` (in
`app/iss.py`) polls a real external API on its own slower cadence
instead of `SimulationHub`'s tick. If a future widget is backed by
another real external API, follow this pattern rather than cramming it
into `SimulationHub`.

**2. Client-side cycling** (bayes, dist, anscombe, periodic) — a small
curated list of scenarios/datasets, computed deterministically in JS
(exact math, not sampled), auto-advancing via `setInterval` every
7–10s. No backend involvement — these don't need live randomness, just
variety. Anscombe's Quartet in particular reuses real published 1973
data and computes its regression line live from whichever dataset is
showing (not a hardcoded line) — the fact that the line barely moves
between datasets *is* the demonstration. Periodic Table highlights a
random element every 10s (`setInterval`, `Math.random()` — genuinely
random, not a fixed cycle order) and reads its details from vendored
real data; see the vendoring bullet below.

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
- **Reset buttons** (`.card-reset-btn`, 16px, same sizing as
  `.quote-shuffle`): every `SimulationHub`-backed widget's card-head has
  one, wired in `app.js`'s `RESET_BUTTON_IDS` map to `POST
  /api/reset/{name}`, which re-runs that sim's `__init__` server-side
  and returns a fresh snapshot for an instant repaint (other displays
  pick it up on their next 1s poll). Only add one for a widget whose
  state is meaningfully "restartable" — the ISS tracker deliberately
  doesn't have one, since its position isn't a simulation you reset.
- **Vendoring real external datasets** (not just libraries): KaTeX is
  vendored because it's a library; `static/js/world-land.js` (the ISS
  tracker's coastline) and `static/js/periodic-table.js` (all 118
  elements' number/symbol/name/mass/category/phase/grid-position) are
  vendored because they're *data* — real Natural Earth and
  Bowserinator/Periodic-Table-JSON datasets respectively, each trimmed
  and (for the coastline) simplified, with the transformation and
  source documented in the file's own header comment. Same principle as
  the Anscombe/quote sourcing standards below: don't hand-approximate a
  coastline, or hand-type 118 atomic masses, any more than you'd
  hand-transcribe a digit string or invent a quote. The periodic table
  data is also deliberately capped at 118 elements — the source
  dataset's element 119 is an undiscovered, purely theoretical entry
  and was dropped rather than presented as real.

## Environment & secrets

- `.env` (git-ignored) holds `ANTHROPIC_API_KEY` and optional
  `ANTHROPIC_MODEL`; `.env.example` is the template. `load_dotenv()`
  runs at the top of `main.py`.
- `uv` manages the venv + deps (`pyproject.toml` / `uv.lock`). Deps:
  `fastapi`, `uvicorn[standard]`, `anthropic`, `python-dotenv`, `httpx`
  (direct dep for `app/iss.py`'s Open Notify polling, though it was
  already present transitively via `anthropic`).
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
8. **`100vh` is a lie on iOS Safari.** It's sized against the layout
   viewport (address bar included), not what's actually visible — with
   `overflow: hidden` on `.dash`, that extra height just gets silently
   clipped off the bottom. This was reported as "the bottom row gets
   cut off in Guided Access." Fixed with `height: 100dvh` (after a
   `100vh` fallback line, since older browsers just ignore the
   `dvh` line and keep the one before it) on both `.dash` and the
   settings modal. Also added `env(safe-area-inset-*)` padding on
   `.dash` and `viewport-fit=cover` on the meta viewport tag for
   notches/home-indicators — don't remove either without re-testing on
   an actual notched/Guided-Access device, since desktop browsers can't
   reproduce the bug that motivated them.
9. **Two copies of the same breakpoint will eventually disagree.** The
   3-row responsive grid (see widget-slot system above) needs the exact
   same min-width/min-height numbers in both `styles.css` (a media
   query) and `app.js` (a `matchMedia` string) because CSS can't tell
   JS how many grid cells it decided to show. There's no build-time
   check tying these together — if you change one, grep for the other
   number and change it too.
10. **Open Notify (the ISS API) doesn't reliably serve HTTPS** — an
    `https://api.open-notify.org/...` request fails outright in this
    environment. `app/iss.py` deliberately uses plain `http://`; don't
    "fix" it to `https://` without first confirming the API actually
    supports it from wherever the server is deployed.

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
