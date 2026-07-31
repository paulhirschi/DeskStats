// Desk Stats dashboard — polls the FastAPI backend for the live simulations
// (coin flips, dice sums, random walk, Collatz) and runs a couple of
// self-contained client-side widgets (Ulam spiral, pi digits, fun facts).

const POLL_MS = 1000;

/* ── Theme toggle ─────────────────────────────────────────── */
const THEME_KEY = "desk-dashboard-theme";
const root = document.documentElement;
const themeToggle = document.getElementById("theme-toggle");
const themeIcon = document.getElementById("theme-icon");

const MOON_PATH = "M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79Z";
const SUN_PATH =
  "M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10ZM12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42";

function applyTheme(theme) {
  root.setAttribute("data-theme", theme);
  themeIcon.innerHTML = `<path d="${theme === "dark" ? MOON_PATH : SUN_PATH}"/>`;
}

applyTheme(localStorage.getItem(THEME_KEY) || "dark");

themeToggle.addEventListener("click", () => {
  const next = root.getAttribute("data-theme") === "dark" ? "light" : "dark";
  localStorage.setItem(THEME_KEY, next);
  applyTheme(next);
});

/* ── Clock ────────────────────────────────────────────────── */
const clockTime = document.getElementById("clock-time");
const clockDate = document.getElementById("clock-date");

function tickClock() {
  const now = new Date();
  clockTime.textContent = now.toLocaleTimeString([], { hour12: false });
  clockDate.textContent = now.toLocaleDateString([], {
    weekday: "long",
    month: "short",
    day: "numeric",
  });
}
tickClock();
setInterval(tickClock, 1000);

/* ── SVG chart helpers ────────────────────────────────────── */
function ns(tag) {
  return document.createElementNS("http://www.w3.org/2000/svg", tag);
}

function renderLineChart(svg, values, refValue = null) {
  const { width: W, height: H } = svg.viewBox.baseVal;
  svg.innerHTML = "";
  if (values.length < 2) return;

  const padY = H * 0.12;
  let min = Math.min(...values);
  let max = Math.max(...values);
  if (refValue !== null) {
    min = Math.min(min, refValue);
    max = Math.max(max, refValue);
  }
  if (max - min < 1e-9) {
    max += 1;
    min -= 1;
  }
  const span = max - min;
  const x = (i) => (i / (values.length - 1)) * W;
  const y = (v) => H - padY - ((v - min) / span) * (H - 2 * padY);

  if (refValue !== null) {
    const line = ns("line");
    line.setAttribute("x1", 0);
    line.setAttribute("x2", W);
    line.setAttribute("y1", y(refValue));
    line.setAttribute("y2", y(refValue));
    line.setAttribute("class", "chart-ref");
    svg.appendChild(line);
  }

  const points = values.map((v, i) => `${x(i)},${y(v)}`).join(" ");
  const poly = ns("polyline");
  poly.setAttribute("points", points);
  poly.setAttribute("class", "chart-line");
  svg.appendChild(poly);
}

function renderBarChart(svg, histogram) {
  const { width: W, height: H } = svg.viewBox.baseVal;
  svg.innerHTML = "";
  const keys = Object.keys(histogram).sort((a, b) => Number(a) - Number(b));
  const counts = keys.map((k) => histogram[k]);
  const max = Math.max(1, ...counts);
  const axisY = H - 14;
  const gap = 3;
  const barW = (W - gap * (keys.length - 1)) / keys.length;

  keys.forEach((k, i) => {
    const h = (counts[i] / max) * (axisY - 6);
    const bx = i * (barW + gap);
    const rect = ns("rect");
    rect.setAttribute("x", bx);
    rect.setAttribute("y", axisY - h);
    rect.setAttribute("width", barW);
    rect.setAttribute("height", h);
    rect.setAttribute("class", "chart-bar");
    svg.appendChild(rect);

    if (i === 0 || i === keys.length - 1 || k === "10" || k === "11") {
      const label = ns("text");
      label.setAttribute("x", bx + barW / 2);
      label.setAttribute("y", H - 2);
      label.setAttribute("text-anchor", "middle");
      label.setAttribute("font-size", "8");
      label.setAttribute("fill", "var(--muted)");
      label.textContent = k;
      svg.appendChild(label);
    }
  });

  const axis = ns("line");
  axis.setAttribute("x1", 0);
  axis.setAttribute("x2", W);
  axis.setAttribute("y1", axisY);
  axis.setAttribute("y2", axisY);
  axis.setAttribute("class", "chart-bar-axis");
  svg.appendChild(axis);
}

// Theoretical Benford's Law probability for each leading digit 1-9.
const BENFORD_CURVE = [1, 2, 3, 4, 5, 6, 7, 8, 9].map((d) => Math.log10(1 + 1 / d));

function renderBenfordChart(svg, counts) {
  const { width: W, height: H } = svg.viewBox.baseVal;
  svg.innerHTML = "";
  const total = counts.reduce((a, b) => a + b, 0) || 1;
  const observed = counts.map((c) => c / total);
  const maxVal = Math.max(...observed, ...BENFORD_CURVE) * 1.15;
  const padL = 4,
    padT = 6,
    padB = 14;
  const plotW = W - padL * 2;
  const plotH = H - padT - padB;
  const axisY = padT + plotH;
  const barW = (plotW / 9) * 0.55;
  const X = (i) => padL + (plotW / 9) * (i + 0.5);
  const Y = (v) => padT + (1 - v / maxVal) * plotH;

  for (let i = 0; i < 9; i++) {
    const h = (observed[i] / maxVal) * plotH;
    const rect = ns("rect");
    rect.setAttribute("x", X(i) - barW / 2);
    rect.setAttribute("y", axisY - h);
    rect.setAttribute("width", barW);
    rect.setAttribute("height", h);
    rect.setAttribute("class", "chart-bar");
    svg.appendChild(rect);

    const label = ns("text");
    label.setAttribute("x", X(i));
    label.setAttribute("y", H - 2);
    label.setAttribute("text-anchor", "middle");
    label.setAttribute("font-size", "8");
    label.setAttribute("fill", "var(--muted)");
    label.textContent = i + 1;
    svg.appendChild(label);
  }

  const curvePts = BENFORD_CURVE.map((v, i) => `${X(i)},${Y(v)}`).join(" ");
  const poly = ns("polyline");
  poly.setAttribute("points", curvePts);
  poly.setAttribute("fill", "none");
  poly.setAttribute("stroke", "var(--c-num)");
  poly.setAttribute("stroke-width", "2");
  svg.appendChild(poly);

  const axis = ns("line");
  axis.setAttribute("x1", 0);
  axis.setAttribute("x2", W);
  axis.setAttribute("y1", axisY);
  axis.setAttribute("y2", axisY);
  axis.setAttribute("class", "chart-bar-axis");
  svg.appendChild(axis);
}

// Galton board: pegs and bars are created once and only ever have their
// position/size attributes updated afterward — clearing and rebuilding
// the SVG every poll (like the other bar charts do) would also destroy
// and recreate the ball, breaking the cx/cy transition that makes it fall.
function setupGaltonBoard(svg) {
  const { width: W, height: H } = svg.viewBox.baseVal;
  const ROWS = 8;
  const pegDX = 16;
  const pegDY = 6;
  const pegTop = 6;
  const centerX = W / 2;
  const binsBottomY = H - 4;
  const binsTopMax = pegTop + (ROWS - 1) * pegDY + 20;
  const maxBarHeight = binsBottomY - binsTopMax;
  const pegStartXBottom = centerX - ((ROWS - 1) * pegDX) / 2;
  const binCenterX = (i) => pegStartXBottom - pegDX / 2 + i * pegDX;

  for (let row = 0; row < ROWS; row++) {
    const pegsInRow = row + 1;
    const rowWidth = (pegsInRow - 1) * pegDX;
    const startX = centerX - rowWidth / 2;
    const y = pegTop + row * pegDY;
    for (let j = 0; j < pegsInRow; j++) {
      const peg = ns("circle");
      peg.setAttribute("cx", startX + j * pegDX);
      peg.setAttribute("cy", y);
      peg.setAttribute("r", 1.3);
      peg.setAttribute("class", "galton-peg");
      svg.appendChild(peg);
    }
  }

  const axis = ns("line");
  axis.setAttribute("x1", 0);
  axis.setAttribute("x2", W);
  axis.setAttribute("y1", binsBottomY);
  axis.setAttribute("y2", binsBottomY);
  axis.setAttribute("class", "chart-bar-axis");
  svg.appendChild(axis);

  const barWidth = pegDX * 0.72;
  const bars = [];
  for (let i = 0; i < ROWS + 1; i++) {
    const rect = ns("rect");
    rect.setAttribute("class", "chart-bar");
    rect.setAttribute("x", binCenterX(i) - barWidth / 2);
    rect.setAttribute("y", binsBottomY);
    rect.setAttribute("width", barWidth);
    rect.setAttribute("height", 0);
    svg.appendChild(rect);
    bars.push(rect);
  }

  const ball = ns("circle");
  ball.setAttribute("r", 3);
  ball.setAttribute("class", "galton-ball");
  ball.setAttribute("cx", centerX);
  ball.setAttribute("cy", pegTop - 4);
  svg.appendChild(ball);

  let lastTotal = -1;

  return function render(data) {
    const counts = data.bins;
    const maxCount = Math.max(1, ...counts);
    counts.forEach((count, i) => {
      const h = (count / maxCount) * maxBarHeight;
      bars[i].setAttribute("y", binsBottomY - h);
      bars[i].setAttribute("height", h);
    });

    if (data.total !== lastTotal) {
      lastTotal = data.total;
      const landedHeight = (counts[data.last_bin] / maxCount) * maxBarHeight;
      const targetX = binCenterX(data.last_bin);
      const targetY = binsBottomY - landedHeight;

      ball.style.transitionDuration = "0s";
      ball.setAttribute("cx", centerX);
      ball.setAttribute("cy", pegTop - 4);
      ball.getBoundingClientRect(); // force reflow so the reset above doesn't itself animate
      ball.style.transitionDuration = "0.85s";
      ball.setAttribute("cx", targetX);
      ball.setAttribute("cy", targetY);
    }
  };
}

/* ── Snapshot polling (coin / dice / walk / collatz) ─────── */
const coinProportion = document.getElementById("coin-proportion");
const coinHeads = document.getElementById("coin-heads");
const coinFlips = document.getElementById("coin-flips");
const coinChart = document.getElementById("coin-chart");

const diceChart = document.getElementById("dice-chart");
const diceRolls = document.getElementById("dice-rolls");

const walkChart = document.getElementById("walk-chart");
const walkPosition = document.getElementById("walk-position");
const walkSteps = document.getElementById("walk-steps");

const collatzCurrent = document.getElementById("collatz-current");
const collatzStart = document.getElementById("collatz-start");
const collatzStep = document.getElementById("collatz-step");
const collatzLongest = document.getElementById("collatz-longest");
const collatzTrail = document.getElementById("collatz-trail");

const montyStayRate = document.getElementById("monty-stay-rate");
const montySwitchRate = document.getElementById("monty-switch-rate");
const montyBarStay = document.getElementById("monty-bar-stay");
const montyBarSwitch = document.getElementById("monty-bar-switch");
const montyGames = document.getElementById("monty-games");

const galtonTotal = document.getElementById("galton-total");
const renderGaltonBoard = setupGaltonBoard(document.getElementById("galton-chart"));

const benfordChart = document.getElementById("benford-chart");
const benfordTotal = document.getElementById("benford-total");

function renderSnapshot(data) {
  const { coin, dice, walk, collatz, monty, galton, benford } = data;

  coinProportion.textContent = coin.proportion.toFixed(4);
  coinHeads.textContent = coin.heads.toLocaleString();
  coinFlips.textContent = coin.flips.toLocaleString();
  renderLineChart(coinChart, coin.history, 0.5);

  diceRolls.textContent = dice.rolls.toLocaleString();
  renderBarChart(diceChart, dice.histogram);

  walkPosition.textContent = walk.position.toFixed(3);
  walkSteps.textContent = walk.steps.toLocaleString();
  renderLineChart(walkChart, walk.history, 0);

  collatzCurrent.textContent = collatz.current.toLocaleString();
  collatzStart.textContent = collatz.start.toLocaleString();
  collatzStep.textContent = collatz.step.toLocaleString();
  collatzLongest.textContent =
    collatz.longest_steps > 0
      ? `${collatz.longest_start.toLocaleString()} → ${collatz.longest_steps} steps`
      : "–";
  collatzTrail.innerHTML = "";
  collatz.trail.forEach((v) => {
    const chip = document.createElement("span");
    chip.className = "trail-chip";
    chip.textContent = v.toLocaleString();
    collatzTrail.appendChild(chip);
  });

  montyStayRate.textContent = `${(monty.stay_rate * 100).toFixed(1)}%`;
  montySwitchRate.textContent = `${(monty.switch_rate * 100).toFixed(1)}%`;
  montyBarStay.style.width = `${monty.stay_rate * 100}%`;
  montyBarSwitch.style.width = `${monty.switch_rate * 100}%`;
  montyGames.textContent = monty.games.toLocaleString();

  galtonTotal.textContent = galton.total.toLocaleString();
  renderGaltonBoard(galton);

  benfordTotal.textContent = benford.total.toLocaleString();
  renderBenfordChart(benfordChart, benford.counts);
}

async function pollSnapshot() {
  try {
    const res = await fetch("/api/snapshot");
    if (!res.ok) return;
    renderSnapshot(await res.json());
  } catch (err) {
    // Server likely restarting — just try again next tick.
  }
}
pollSnapshot();
setInterval(pollSnapshot, POLL_MS);

// Reset buttons in each LIVE card-head — resets that sim's state on the
// server (so every connected display picks it up) and repaints immediately
// instead of waiting for the next poll tick.
const RESET_BUTTON_IDS = {
  coin: "coin-reset",
  dice: "dice-reset",
  walk: "walk-reset",
  collatz: "collatz-reset",
  monty: "monty-reset",
  galton: "galton-reset",
  benford: "benford-reset",
};

Object.entries(RESET_BUTTON_IDS).forEach(([name, id]) => {
  const btn = document.getElementById(id);
  if (!btn) return;
  btn.addEventListener("click", async () => {
    try {
      const res = await fetch(`/api/reset/${name}`, { method: "POST" });
      if (res.ok) renderSnapshot(await res.json());
    } catch (err) {
      // Server likely restarting — next poll will pick up the real state.
    }
  });
});

/* ── Ulam spiral (client-side, computed once) ────────────── */
function sieve(n) {
  const isPrime = new Uint8Array(n + 1).fill(1);
  isPrime[0] = isPrime[1] = 0;
  for (let i = 2; i * i <= n; i++) {
    if (isPrime[i]) {
      for (let j = i * i; j <= n; j += i) isPrime[j] = 0;
    }
  }
  return isPrime;
}

function ulamCoords(n) {
  const coords = [[0, 0]];
  let x = 0,
    y = 0,
    dx = 1,
    dy = 0,
    stepLen = 1,
    stepCount = 0,
    turns = 0;
  for (let i = 2; i <= n; i++) {
    x += dx;
    y += dy;
    coords.push([x, y]);
    stepCount++;
    if (stepCount === stepLen) {
      stepCount = 0;
      [dx, dy] = [-dy, dx];
      turns++;
      if (turns % 2 === 0) stepLen++;
    }
  }
  return coords;
}

function drawUlamSpiral() {
  const canvas = document.getElementById("ulam-canvas");
  const wrap = canvas.parentElement;
  const dpr = window.devicePixelRatio || 1;
  const cssW = wrap.clientWidth;
  const cssH = wrap.clientHeight;
  if (cssW === 0 || cssH === 0) return; // not currently in a visible slot
  canvas.width = cssW * dpr;
  canvas.height = cssH * dpr;
  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const gridSize = 29; // odd, so the spiral centers cleanly
  const n = gridSize * gridSize;
  const cell = Math.floor(Math.min(cssW, cssH) / gridSize);
  const originX = cssW / 2;
  const originY = cssH / 2;

  const isPrime = sieve(n);
  const coords = ulamCoords(n);
  const styles = getComputedStyle(document.documentElement);
  const cComposite = styles.getPropertyValue("--hair2").trim();
  const cPrime = styles.getPropertyValue("--accent").trim();
  const cOne = styles.getPropertyValue("--ink").trim();

  let primeCount = 0;
  for (let i = 0; i < n; i++) {
    const num = i + 1;
    const [gx, gy] = coords[i];
    const px = originX + gx * cell - cell / 2;
    const py = originY - gy * cell - cell / 2;
    if (num === 1) {
      ctx.fillStyle = cOne;
    } else if (isPrime[num]) {
      ctx.fillStyle = cPrime;
      primeCount++;
    } else {
      ctx.fillStyle = cComposite;
    }
    const pad = 0.5;
    ctx.fillRect(px + pad, py + pad, cell - pad * 2, cell - pad * 2);
  }

  document.getElementById("ulam-count").textContent = primeCount.toLocaleString();
  document.getElementById("ulam-total").textContent = n.toLocaleString();
}

drawUlamSpiral();
window.addEventListener("resize", () => {
  clearTimeout(window.__ulamResizeT);
  window.__ulamResizeT = setTimeout(drawUlamSpiral, 200);
});
// Redraw when the theme flips so prime/composite colors stay in sync.
themeToggle.addEventListener("click", () => setTimeout(drawUlamSpiral, 0));

/* ── Constant, digit by digit ─────────────────────────────────
   Picker in the card header swaps which constant is ticking out; the
   choice is remembered per browser, like everything else on this
   dashboard. All five digit strings are computed with arbitrary-precision
   decimal arithmetic (Python's `decimal`, not hand-transcribed) to avoid
   the kind of transposition error that's easy to make copying 100 digits
   by hand — tau = 2×pi exactly, sqrt2/phi via Decimal.sqrt(). */
const CONSTANT_DIGITS = {
  pi: "3.14159265358979323846264338327950288419716939937510582097494459230781640628620899862803482534211706798",
  e: "2.7182818284590452353602874713526624977572470936999595749669676277240766303535475945713821785251664274",
  tau: "6.2831853071795864769252867665590057683943387987502116419498891846156328125724179972560696506842341359",
  phi: "1.6180339887498948482045868343656381177203091798057628621354486227052604628189024497072072041893911374",
  sqrt2: "1.4142135623730950488016887242096980785696718753769480731766797379907324784621070388503875343276415727",
};
const CONSTANT_STORAGE_KEY = "desk-dashboard-constant";
const constantDisplay = document.getElementById("pi-display");
const constantPicker = document.getElementById("constant-picker");
let activeConstant = CONSTANT_DIGITS[localStorage.getItem(CONSTANT_STORAGE_KEY)] ? localStorage.getItem(CONSTANT_STORAGE_KEY) : "pi";
let constantIndex = 1;

function paintConstantButtons() {
  constantPicker.querySelectorAll(".pill-btn").forEach((btn) => {
    btn.classList.toggle("is-active", btn.dataset.constant === activeConstant);
  });
}

function tickConstant() {
  const digits = CONSTANT_DIGITS[activeConstant];
  if (constantIndex >= digits.length) {
    constantDisplay.textContent = digits[0];
    constantIndex = 1;
    return;
  }
  constantIndex++;
  constantDisplay.textContent = digits.slice(0, constantIndex);
}

constantPicker.querySelectorAll(".pill-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    if (btn.dataset.constant === activeConstant) return;
    activeConstant = btn.dataset.constant;
    localStorage.setItem(CONSTANT_STORAGE_KEY, activeConstant);
    constantIndex = 1;
    constantDisplay.textContent = CONSTANT_DIGITS[activeConstant][0];
    paintConstantButtons();
  });
});

paintConstantButtons();
constantDisplay.textContent = CONSTANT_DIGITS[activeConstant][0];
setInterval(tickConstant, 1000);

/* ── Fun fact rotator ─────────────────────────────────────── */
const FACTS = [
  "The Birthday Paradox: in a room of just 23 people, there's a 50% chance two share a birthday.",
  "Benford's Law: in many real-world datasets, the leading digit is 1 about 30% of the time — far more often than 9.",
  "A p-value is the probability of data this extreme if the null hypothesis were true. It is not the probability the null hypothesis is true.",
  "The Central Limit Theorem: sums of almost any independent random variables converge toward a normal distribution, whatever the originals looked like.",
  "Simpson's Paradox: a trend can appear in several groups of data yet reverse when the groups are combined.",
  "The Riemann Hypothesis, unsolved since 1859, concerns where the zeros of the zeta function lie — a $1M Millennium Prize awaits a proof.",
  "Euler's number e is the unique base where the derivative of eˣ is itself — it falls out of compound interest taken to the limit.",
  "The Monty Hall problem: switching doors doubles your odds of winning, from 1/3 to 2/3 — most people's intuition says otherwise.",
  "A random walk in 1D or 2D returns to its starting point infinitely often with probability 1 — in 3D, it almost surely wanders off forever.",
  "The Collatz Conjecture: halve even numbers, triple-and-add-one odd ones. Every number ever tested reaches 1 — but no one has proven it always will.",
  "Euclid proved there are infinitely many primes around 300 BC, with a short and still-beautiful proof by contradiction.",
  "Bayes' theorem turns a prior belief into a posterior belief once you see evidence — the mathematical backbone of most modern machine learning.",
  "The Law of Large Numbers guarantees the average of many trials converges to the expected value — but says nothing about how many trials is 'many'.",
  "The 0.05 significance threshold was popularized by Ronald Fisher in the 1920s largely as a convenient rule of thumb, not a law of nature.",
  "The normal distribution's bell curve shows up everywhere because of the Central Limit Theorem — not because nature 'prefers' it.",
  "Correlation is not causation: ice cream sales and drowning deaths both rise in summer. The hidden variable is heat, not ice cream.",
  "The Fibonacci sequence — 1, 1, 2, 3, 5, 8, 13… — shows up in sunflower seed spirals, pinecones, and nautilus shells.",
  "A standard deck of 52 cards can be shuffled into roughly 8×10^67 possible orders — more than the number of atoms on Earth.",
  "The Four Color Theorem says any map needs just 4 colors so no adjacent regions match. It was the first major theorem proved with a computer, in 1976.",
  "Gödel's Incompleteness Theorems show that any sufficiently powerful axiomatic system contains true statements it can never prove.",
];
const factText = document.getElementById("fact-text");
let factIndex = Math.floor(Math.random() * FACTS.length);

function showFact() {
  factText.classList.add("is-fading");
  setTimeout(() => {
    factIndex = (factIndex + 1) % FACTS.length;
    factText.textContent = FACTS[factIndex];
    factText.classList.remove("is-fading");
  }, 300);
}
factText.textContent = FACTS[factIndex];
setInterval(showFact, 9000);

/* ── Quote ─────────────────────────────────────────────────────
   A hardcoded pool — favorite people first (a handful of verified lines
   each), then a broader set of math/stats/Enlightenment/Renaissance/
   philosophy-of-science quotes. Purely client-side: a random quote on
   load, and the shuffle button in the card header picks a new random one
   (never repeating the one currently showing) on demand. */
const QUOTES = [
  // ── Favorites ──────────────────────────────────────────────
  { text: "You have power over your mind – not outside events. Realize this, and you will find strength.", author: "Marcus Aurelius", source: "Meditations" },
  { text: "Waste no more time arguing about what a good man should be. Be one.", author: "Marcus Aurelius", source: "Meditations" },
  { text: "The happiness of your life depends upon the quality of your thoughts.", author: "Marcus Aurelius", source: "Meditations" },
  { text: "It is not death that a man should fear, but he should fear never beginning to live.", author: "Marcus Aurelius", source: "Meditations" },

  { text: "Look for the helpers. You will always find people who are helping.", author: "Fred Rogers" },
  { text: "There are three ways to ultimate success: the first way is to be kind, the second way is to be kind, and the third way is to be kind.", author: "Fred Rogers" },
  { text: "You don't have to do anything sensational for people to love you.", author: "Fred Rogers" },
  { text: "Anything that's human is mentionable, and anything that is mentionable can be more manageable.", author: "Fred Rogers" },

  { text: "We are a way for the cosmos to know itself.", author: "Carl Sagan", source: "Cosmos" },
  { text: "Extraordinary claims require extraordinary evidence.", author: "Carl Sagan", source: "Cosmos" },
  { text: "We are made of star-stuff.", author: "Carl Sagan", source: "Cosmos" },
  { text: "It is far better to grasp the universe as it really is than to persist in delusion, however satisfying and reassuring.", author: "Carl Sagan", source: "The Demon-Haunted World" },

  { text: "Yes we can.", author: "Barack Obama" },
  { text: "Change will not come if we wait for some other person or some other time. We are the ones we've been waiting for.", author: "Barack Obama" },
  { text: "The best way to not feel hopeless is to get up and do something.", author: "Barack Obama" },
  { text: "If you're walking down the right path and you're willing to keep walking, eventually you'll make progress.", author: "Barack Obama" },

  { text: "These are the times that try men's souls.", author: "Thomas Paine", source: "The American Crisis" },
  { text: "The world is my country, all mankind are my brethren, and to do good is my religion.", author: "Thomas Paine", source: "Rights of Man" },
  { text: "To argue with a man who has renounced the use and authority of reason is like administering medicine to the dead.", author: "Thomas Paine", source: "The American Crisis" },
  { text: "A long habit of not thinking a thing wrong gives it a superficial appearance of being right.", author: "Thomas Paine", source: "Common Sense" },

  { text: "The whole problem with the world is that fools and fanatics are always so certain of themselves, and wiser people so full of doubts.", author: "Bertrand Russell" },
  { text: "The point of philosophy is to start with something so simple as not to seem worth stating, and to end with something so paradoxical that no one will believe it.", author: "Bertrand Russell" },
  { text: "Do not fear to be eccentric in opinion, for every opinion now accepted was once eccentric.", author: "Bertrand Russell", source: "The Conquest of Happiness" },
  { text: "The good life is one inspired by love and guided by knowledge.", author: "Bertrand Russell", source: "What I Believe" },

  { text: "Everyone you will ever meet knows something you don't.", author: "Bill Nye" },
  { text: "Science rules!", author: "Bill Nye", source: "Bill Nye the Science Guy" },

  { text: "We don't make mistakes, we just have happy accidents.", author: "Bob Ross", source: "The Joy of Painting" },
  { text: "Talent is a pursued interest. Anything that you're willing to practice, you can do.", author: "Bob Ross", source: "The Joy of Painting" },
  { text: "You need the dark in order to show the light.", author: "Bob Ross", source: "The Joy of Painting" },
  { text: "There's nothing wrong with having a tree as a friend.", author: "Bob Ross", source: "The Joy of Painting" },

  // ── Math, stats, Enlightenment, Renaissance & philosophy of science ──
  { text: "Mathematics is the language with which God has written the universe.", author: "Galileo Galilei" },
  { text: "If I have seen further, it is by standing on the shoulders of giants.", author: "Isaac Newton" },
  { text: "I think, therefore I am.", author: "René Descartes", source: "Discourse on the Method" },
  { text: "The heart has its reasons which reason knows nothing of.", author: "Blaise Pascal", source: "Pensées" },
  { text: "Common sense is not so common.", author: "Voltaire", source: "Dictionnaire philosophique" },
  { text: "Dare to know! Have the courage to use your own understanding.", author: "Immanuel Kant", source: "What Is Enlightenment?" },
  { text: "Learning never exhausts the mind.", author: "Leonardo da Vinci" },
  { text: "Mathematics is the queen of the sciences.", author: "Carl Friedrich Gauss" },
  { text: "Science is built up with facts, as a house is with stones. But a collection of facts is no more a science than a heap of stones is a house.", author: "Henri Poincaré", source: "Science and Hypothesis" },
  { text: "Whenever a theory appears to you as the only possible one, take this as a sign that you have neither understood the theory nor the problem which it was intended to solve.", author: "Karl Popper", source: "Conjectures and Refutations" },
  { text: "The Analytical Engine has no pretensions whatever to originate anything. It can do whatever we know how to order it to perform.", author: "Ada Lovelace", source: "Notes on the Analytical Engine" },
  { text: "The first principle is that you must not fool yourself — and you are the easiest person to fool.", author: "Richard Feynman", source: "Cargo Cult Science" },
  { text: "A wise man proportions his belief to the evidence.", author: "David Hume", source: "An Enquiry Concerning Human Understanding" },
  { text: "Knowledge is power.", author: "Francis Bacon", source: "Meditationes Sacrae" },
  { text: "I have striven not to laugh at human actions, not to weep at them, nor to hate them, but to understand them.", author: "Baruch Spinoza", source: "Tractatus Politicus" },
  { text: "The theory of probabilities is at bottom nothing but common sense reduced to calculation.", author: "Pierre-Simon Laplace", source: "Théorie Analytique des Probabilités" },
  { text: "In mathematics you don't understand things. You just get used to them.", author: "John von Neumann" },
  { text: "To call in the statistician after the experiment is done may be no more than asking him to perform a post-mortem examination: he may be able to say what the experiment died of.", author: "Ronald Fisher", source: "Indian Statistical Congress, 1938" },

  // ── Awesome women in STEM, philosophy & beyond ──────────────
  { text: "Nothing in life is to be feared, it is only to be understood. Now is the time to understand more, so that we may fear less.", author: "Marie Curie" },
  { text: "One never notices what has been done; one can only see what remains to be done.", author: "Marie Curie", source: "letter to her brother Józef, 1894" },
  { text: "I was taught that the way of progress was neither swift nor easy.", author: "Marie Curie", source: "Pierre Curie" },

  { text: "Like what you do, and then you will do your best.", author: "Katherine Johnson" },
  { text: "I like to learn. That's an art and a science.", author: "Katherine Johnson" },

  { text: "The beauty of mathematics only shows itself to its more patient followers.", author: "Maryam Mirzakhani" },
  { text: "I don't think that all mathematicians should have the same mind. I think it is actually great that people think so differently.", author: "Maryam Mirzakhani" },

  { text: "Life need not be easy, provided only that it is not empty.", author: "Lise Meitner" },
  { text: "I have to thank physics for the fact that during the most difficult years of my life, I could take refuge in it.", author: "Lise Meitner" },

  { text: "The most dangerous phrase in the language is, 'We've always done it this way.'", author: "Grace Hopper" },
  { text: "My methods are really methods of working and thinking; this is why they have crept in everywhere anonymously.", author: "Emmy Noether" },
  { text: "It is impossible to be a mathematician without being a poet in soul.", author: "Sofia Kovalevskaya" },
  { text: "Science and everyday life cannot and should not be separated.", author: "Rosalind Franklin" },
  { text: "In nature nothing exists alone.", author: "Rachel Carson", source: "Silent Spring" },
  { text: "What you do makes a difference, and you have to decide what kind of difference you want to make.", author: "Jane Goodall" },
  { text: "One is not born, but rather becomes, a woman.", author: "Simone de Beauvoir", source: "The Second Sex" },
  { text: "Attention is the rarest and purest form of generosity.", author: "Simone Weil", source: "Gravity and Grace" },
  { text: "I do not wish women to have power over men, but over themselves.", author: "Mary Wollstonecraft", source: "A Vindication of the Rights of Woman" },
  { text: "I attribute my success to this: I never gave or took an excuse.", author: "Florence Nightingale" },
  { text: "One child, one teacher, one book, one pen can change the world.", author: "Malala Yousafzai", source: "United Nations speech, 2013" },
  { text: "There is only one thing worse than coming home from the lab to a sink full of dirty dishes, and that is not going to the lab at all!", author: "Chien-Shiung Wu" },
];

function setupQuoteWidget() {
  const textEl = document.getElementById("quote-text");
  const authorEl = document.getElementById("quote-author");
  const shuffleBtn = document.getElementById("quote-shuffle");
  let index = Math.floor(Math.random() * QUOTES.length);

  function render() {
    const q = QUOTES[index];
    textEl.textContent = `“${q.text}”`;
    authorEl.textContent = q.source ? `— ${q.author}, ${q.source}` : `— ${q.author}`;
  }

  shuffleBtn.addEventListener("click", () => {
    if (QUOTES.length > 1) {
      let next;
      do {
        next = Math.floor(Math.random() * QUOTES.length);
      } while (next === index);
      index = next;
    }
    render();
  });

  render();
}
setupQuoteWidget();

/* ── Bayes' theorem / positive predictive value ──────────────
   Deterministic — no backend needed. Cycles through real-world-ish
   screening scenarios to show how a low base rate can dominate an
   otherwise "accurate" test (the base-rate fallacy), the same idea as
   paulhirschi.com/projects/positive-predictive-values. */
function ppv(prevalence, sens, spec) {
  const truePos = sens * prevalence;
  const falsePos = (1 - spec) * (1 - prevalence);
  return truePos / (truePos + falsePos);
}

const BAYES_SCENARIOS = [
  { name: "rare disease screening", prevalence: 0.001, sens: 0.99, spec: 0.95, maxPrev: 0.02 },
  { name: "mammography screening", prevalence: 0.01, sens: 0.9, spec: 0.91, maxPrev: 0.05 },
  { name: "airport security screening", prevalence: 0.0001, sens: 0.95, spec: 0.95, maxPrev: 0.005 },
  { name: "covid rapid antigen test", prevalence: 0.05, sens: 0.85, spec: 0.98, maxPrev: 0.2 },
  { name: "workplace drug test", prevalence: 0.02, sens: 0.95, spec: 0.9, maxPrev: 0.1 },
  { name: "email spam filter", prevalence: 0.2, sens: 0.98, spec: 0.95, maxPrev: 0.5 },
];

const bayesChart = document.getElementById("bayes-chart");
const bayesScenarioEl = document.getElementById("bayes-scenario");
const bayesAnnotationEl = document.getElementById("bayes-annotation");
const bayesSpecsEl = document.getElementById("bayes-specs");

function drawBayesChart(svg, scenario) {
  const { width: W, height: H } = svg.viewBox.baseVal;
  svg.innerHTML = "";
  const padL = 2,
    padR = 2,
    padT = 6,
    padB = 4;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;
  const N = 40;

  const X = (p) => padL + (p / scenario.maxPrev) * plotW;
  const Y = (v) => padT + (1 - v) * plotH;

  const pts = [];
  for (let i = 0; i <= N; i++) {
    const p = (i / N) * scenario.maxPrev;
    pts.push([X(p), Y(ppv(p, scenario.sens, scenario.spec))]);
  }

  const area = ns("polygon");
  const areaPts = [`${X(0)},${Y(0)}`, ...pts.map(([x, y]) => `${x},${y}`), `${X(scenario.maxPrev)},${Y(0)}`];
  area.setAttribute("points", areaPts.join(" "));
  area.setAttribute("fill", "var(--accent-soft)");
  svg.appendChild(area);

  const poly = ns("polyline");
  poly.setAttribute("points", pts.map(([x, y]) => `${x},${y}`).join(" "));
  poly.setAttribute("class", "chart-line");
  svg.appendChild(poly);

  const markerVal = ppv(scenario.prevalence, scenario.sens, scenario.spec);
  const mx = X(scenario.prevalence);
  const my = Y(markerVal);

  const vGuide = ns("line");
  vGuide.setAttribute("x1", mx);
  vGuide.setAttribute("x2", mx);
  vGuide.setAttribute("y1", my);
  vGuide.setAttribute("y2", padT + plotH);
  vGuide.setAttribute("class", "chart-ref");
  svg.appendChild(vGuide);

  const hGuide = ns("line");
  hGuide.setAttribute("x1", padL);
  hGuide.setAttribute("x2", mx);
  hGuide.setAttribute("y1", my);
  hGuide.setAttribute("y2", my);
  hGuide.setAttribute("class", "chart-ref");
  svg.appendChild(hGuide);

  const dot = ns("circle");
  dot.setAttribute("cx", mx);
  dot.setAttribute("cy", my);
  dot.setAttribute("r", 3.5);
  dot.setAttribute("fill", "var(--bg)");
  dot.setAttribute("stroke", "var(--accent)");
  dot.setAttribute("stroke-width", 2);
  svg.appendChild(dot);

  return markerVal;
}

let bayesIndex = 0;
function showBayesScenario() {
  const scenario = BAYES_SCENARIOS[bayesIndex];
  const markerVal = drawBayesChart(bayesChart, scenario);
  bayesScenarioEl.textContent = scenario.name;
  bayesAnnotationEl.textContent = `${(scenario.prevalence * 100).toFixed(2).replace(/\.?0+$/, "")}% base rate → ${(
    markerVal * 100
  ).toFixed(1)}% PPV`;
  bayesSpecsEl.textContent = `sens ${Math.round(scenario.sens * 100)}% · spec ${Math.round(scenario.spec * 100)}%`;
}

function cycleBayesScenario() {
  [bayesScenarioEl, bayesAnnotationEl].forEach((el) => el.classList.add("is-fading"));
  setTimeout(() => {
    bayesIndex = (bayesIndex + 1) % BAYES_SCENARIOS.length;
    showBayesScenario();
    [bayesScenarioEl, bayesAnnotationEl].forEach((el) => el.classList.remove("is-fading"));
  }, 300);
}
showBayesScenario();
setInterval(cycleBayesScenario, 7000);
window.addEventListener("resize", () => showBayesScenario());
themeToggle.addEventListener("click", () => setTimeout(showBayesScenario, 0));

/* ── Anscombe's Quartet ───────────────────────────────────────
   The real 1973 Anscombe datasets (F.J. Anscombe, "Graphs in Statistical
   Analysis") — four wildly different point clouds that share the same
   mean, variance, correlation, and regression line to 2-3 decimal
   places. The regression line and stats are computed live from whichever
   dataset is showing (not hardcoded), so the fact that they barely move
   between datasets is the demonstration, not an assumption. Points reuse
   the same SVG circles across switches (see CSS `transition: cx, cy`) so
   they visibly glide into their new shape instead of jump-cutting. */
const ANSCOMBE_X = [10, 8, 13, 9, 11, 14, 6, 4, 12, 7, 5];
const ANSCOMBE_Y1 = [8.04, 6.95, 7.58, 8.81, 8.33, 9.96, 7.24, 4.26, 10.84, 4.82, 5.68];
const ANSCOMBE_Y2 = [9.14, 8.14, 8.74, 8.77, 9.26, 8.1, 6.13, 3.1, 9.13, 7.26, 4.74];
const ANSCOMBE_Y3 = [7.46, 6.77, 12.74, 7.11, 7.81, 8.84, 6.08, 5.39, 8.15, 6.42, 5.73];
const ANSCOMBE_X4 = [8, 8, 8, 8, 8, 8, 8, 19, 8, 8, 8];
const ANSCOMBE_Y4 = [6.58, 5.76, 7.71, 8.84, 8.47, 7.04, 5.25, 12.5, 5.56, 7.91, 6.89];

const ANSCOMBE_DATASETS = [
  {
    label: "dataset I — roughly linear, ordinary scatter",
    points: ANSCOMBE_X.map((x, i) => ({ x, y: ANSCOMBE_Y1[i] })),
  },
  {
    label: "dataset II — a clean curve, not a line",
    points: ANSCOMBE_X.map((x, i) => ({ x, y: ANSCOMBE_Y2[i] })),
  },
  {
    label: "dataset III — perfectly linear but for one outlier",
    points: ANSCOMBE_X.map((x, i) => ({ x, y: ANSCOMBE_Y3[i] })),
  },
  {
    label: "dataset IV — no trend at all except one leverage point",
    points: ANSCOMBE_X4.map((x, i) => ({ x, y: ANSCOMBE_Y4[i] })),
  },
];

function linearRegression(points) {
  const n = points.length;
  const meanX = points.reduce((s, p) => s + p.x, 0) / n;
  const meanY = points.reduce((s, p) => s + p.y, 0) / n;
  let num = 0,
    denX = 0,
    denY = 0;
  points.forEach((p) => {
    const dx = p.x - meanX;
    const dy = p.y - meanY;
    num += dx * dy;
    denX += dx * dx;
    denY += dy * dy;
  });
  const slope = num / denX;
  const intercept = meanY - slope * meanX;
  const r = num / Math.sqrt(denX * denY);
  return { slope, intercept, meanX, meanY, r };
}

function setupAnscombeWidget() {
  const svg = document.getElementById("anscombe-chart");
  const labelEl = document.getElementById("anscombe-label");
  const statsEl = document.getElementById("anscombe-stats");
  const picker = document.getElementById("anscombe-picker");
  const { width: W, height: H } = svg.viewBox.baseVal;
  const padL = 6,
    padR = 6,
    padT = 8,
    padB = 6;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;
  const X_MIN = 2,
    X_MAX = 20,
    Y_MIN = 2,
    Y_MAX = 14;
  const X = (x) => padL + ((x - X_MIN) / (X_MAX - X_MIN)) * plotW;
  const Y = (y) => padT + (1 - (y - Y_MIN) / (Y_MAX - Y_MIN)) * plotH;

  const axisX = ns("line");
  axisX.setAttribute("x1", X(X_MIN));
  axisX.setAttribute("x2", X(X_MAX));
  axisX.setAttribute("y1", Y(Y_MIN));
  axisX.setAttribute("y2", Y(Y_MIN));
  axisX.setAttribute("class", "chart-bar-axis");
  svg.appendChild(axisX);

  const regressionLine = ns("line");
  regressionLine.setAttribute("class", "chart-line anscombe-line");
  svg.appendChild(regressionLine);

  const circles = ANSCOMBE_DATASETS[0].points.map(() => {
    const c = ns("circle");
    c.setAttribute("r", 3);
    c.setAttribute("class", "anscombe-point");
    svg.appendChild(c);
    return c;
  });

  let index = 0;
  let cycleTimer = null;

  function render() {
    const ds = ANSCOMBE_DATASETS[index];
    const stats = linearRegression(ds.points);

    regressionLine.setAttribute("x1", X(X_MIN));
    regressionLine.setAttribute("y1", Y(stats.intercept + stats.slope * X_MIN));
    regressionLine.setAttribute("x2", X(X_MAX));
    regressionLine.setAttribute("y2", Y(stats.intercept + stats.slope * X_MAX));

    ds.points.forEach((p, i) => {
      circles[i].setAttribute("cx", X(p.x));
      circles[i].setAttribute("cy", Y(p.y));
    });

    labelEl.textContent = ds.label;
    statsEl.textContent = `mean x=${stats.meanX.toFixed(2)} · mean y=${stats.meanY.toFixed(2)} · r=${stats.r.toFixed(3)}`;
    picker.querySelectorAll(".pill-btn").forEach((btn) => {
      btn.classList.toggle("is-active", Number(btn.dataset.set) === index);
    });
  }

  function scheduleCycle() {
    clearInterval(cycleTimer);
    cycleTimer = setInterval(() => {
      index = (index + 1) % ANSCOMBE_DATASETS.length;
      render();
    }, 8000);
  }

  picker.querySelectorAll(".pill-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      index = Number(btn.dataset.set);
      render();
      scheduleCycle(); // manual pick shouldn't get immediately overridden by a pending auto-tick
    });
  });

  render();
  scheduleCycle();
}
setupAnscombeWidget();

/* ── Distribution showdown ────────────────────────────────────
   Also deterministic: exact PDFs/PMFs, not sampled histograms, so the
   comparison stays crisp at this size. Cycles through a few classic
   "compare the shapes" stats lessons. */
function normalPDF(x, mu, sigma) {
  return Math.exp(-0.5 * ((x - mu) / sigma) ** 2) / (sigma * Math.sqrt(2 * Math.PI));
}
function uniformPDF(x, a, b) {
  return x >= a && x <= b ? 1 / (b - a) : 0;
}
function laplacePDF(x, mu, b) {
  return Math.exp(-Math.abs(x - mu) / b) / (2 * b);
}
function exponentialPDF(x, lambda) {
  return x >= 0 ? lambda * Math.exp(-lambda * x) : 0;
}
function logFactorial(n) {
  let s = 0;
  for (let i = 2; i <= n; i++) s += Math.log(i);
  return s;
}
function poissonPMF(k, lambda) {
  return Math.exp(k * Math.log(lambda) - lambda - logFactorial(k));
}

const DIST_SCENARIOS = [
  {
    kind: "lines",
    xmin: -4,
    xmax: 4,
    a: { label: "normal(0, 1)", color: "var(--accent)", fn: (x) => normalPDF(x, 0, 1) },
    b: {
      label: "uniform(±√3)",
      color: "var(--c-num)",
      fn: (x) => uniformPDF(x, -Math.sqrt(3), Math.sqrt(3)),
    },
    caption: "same mean (0) and variance (1) — but nothing else about them matches.",
  },
  {
    kind: "lines",
    xmin: -4,
    xmax: 4,
    a: { label: "normal(0, 1)", color: "var(--accent)", fn: (x) => normalPDF(x, 0, 1) },
    b: { label: "laplace(0, b=0.71)", color: "var(--c-num)", fn: (x) => laplacePDF(x, 0, 1 / Math.sqrt(2)) },
    caption: "laplace's sharp peak and heavy tails make outliers far less 'surprising'.",
  },
  {
    kind: "bar-plus-line",
    kmin: 0,
    kmax: 12,
    bars: { label: "poisson(λ=4)", color: "var(--accent)", pmf: (k) => poissonPMF(k, 4) },
    line: { label: "normal(μ=4, σ=2)", color: "var(--c-num)", fn: (x) => normalPDF(x, 4, 2) },
    caption: "even at λ=4, a normal curve is already a decent stand-in.",
  },
  {
    kind: "lines",
    xmin: 0,
    xmax: 6,
    a: { label: "exponential(λ=1)", color: "var(--accent)", fn: (x) => exponentialPDF(x, 1) },
    b: { label: "normal(1, 1)", color: "var(--c-num)", fn: (x) => normalPDF(x, 1, 1) },
    caption: "same mean of 1 — one decays memorylessly, the other is symmetric.",
  },
];

const distChart = document.getElementById("dist-chart");
const distLegend = document.getElementById("dist-legend");
const distCaption = document.getElementById("dist-caption");

function drawDistChart(svg, sc) {
  const { width: W, height: H } = svg.viewBox.baseVal;
  svg.innerHTML = "";
  const padL = 2,
    padR = 2,
    padT = 6,
    padB = 4;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;

  if (sc.kind === "lines") {
    const N = 60;
    const xs = Array.from({ length: N + 1 }, (_, i) => sc.xmin + (i / N) * (sc.xmax - sc.xmin));
    const ya = xs.map(sc.a.fn);
    const yb = xs.map(sc.b.fn);
    const maxY = Math.max(...ya, ...yb) * 1.08;
    const X = (x) => padL + ((x - sc.xmin) / (sc.xmax - sc.xmin)) * plotW;
    const Y = (y) => padT + (1 - y / maxY) * plotH;

    [ya, yb].forEach((ys, idx) => {
      const color = idx === 0 ? sc.a.color : sc.b.color;
      const pts = xs.map((x, i) => `${X(x)},${Y(ys[i])}`).join(" ");
      const poly = ns("polyline");
      poly.setAttribute("points", pts);
      poly.setAttribute("fill", "none");
      poly.setAttribute("stroke", color);
      poly.setAttribute("stroke-width", "2");
      svg.appendChild(poly);
    });
  } else if (sc.kind === "bar-plus-line") {
    const ks = [];
    for (let k = sc.kmin; k <= sc.kmax; k++) ks.push(k);
    const barVals = ks.map(sc.bars.pmf);
    const N = 60;
    const xs = Array.from({ length: N + 1 }, (_, i) => sc.kmin + (i / N) * (sc.kmax - sc.kmin));
    const lineVals = xs.map(sc.line.fn);
    const maxY = Math.max(...barVals, ...lineVals) * 1.15;
    const X = (x) => padL + ((x - sc.kmin) / (sc.kmax - sc.kmin)) * plotW;
    const Y = (y) => padT + (1 - y / maxY) * plotH;

    const barW = (plotW / ks.length) * 0.55;
    ks.forEach((k, i) => {
      const x = X(k) - barW / 2;
      const y = Y(barVals[i]);
      const rect = ns("rect");
      rect.setAttribute("x", x);
      rect.setAttribute("y", y);
      rect.setAttribute("width", barW);
      rect.setAttribute("height", padT + plotH - y);
      rect.setAttribute("fill", sc.bars.color);
      rect.setAttribute("opacity", "0.85");
      svg.appendChild(rect);
    });

    const pts = xs.map((x, i) => `${X(x)},${Y(lineVals[i])}`).join(" ");
    const poly = ns("polyline");
    poly.setAttribute("points", pts);
    poly.setAttribute("fill", "none");
    poly.setAttribute("stroke", sc.line.color);
    poly.setAttribute("stroke-width", "2");
    svg.appendChild(poly);
  }
}

let distIndex = 0;
function showDistScenario() {
  const sc = DIST_SCENARIOS[distIndex];
  drawDistChart(distChart, sc);
  const seriesA = sc.a || sc.bars;
  const seriesB = sc.b || sc.line;
  distLegend.innerHTML = "";
  [seriesA, seriesB].forEach((series) => {
    const item = document.createElement("span");
    item.className = "legend-item";
    const dot = document.createElement("span");
    dot.className = "legend-dot";
    dot.style.background = series.color;
    item.appendChild(dot);
    item.appendChild(document.createTextNode(series.label));
    distLegend.appendChild(item);
  });
  distCaption.textContent = sc.caption;
}

function cycleDistScenario() {
  [distLegend, distCaption].forEach((el) => el.classList.add("is-fading"));
  setTimeout(() => {
    distIndex = (distIndex + 1) % DIST_SCENARIOS.length;
    showDistScenario();
    [distLegend, distCaption].forEach((el) => el.classList.remove("is-fading"));
  }, 300);
}
showDistScenario();
setInterval(cycleDistScenario, 7500);
window.addEventListener("resize", () => showDistScenario());
themeToggle.addEventListener("click", () => setTimeout(showDistScenario, 0));

/* ── "X of the day" widgets ───────────────────────────────────
   All five (Integral, Derivative, Probability, Stat, Number) are
   generated by Claude once per calendar day — see setupDailyQA and
   setupDailyValueFact below. */

// Same "the button is the field" trick as the chess-puzzle reveal on
// paulhirschi.com/about: no separate answer area, the button just swaps
// its own label (and its eye icon) when tapped or clicked.
const EYE_PATH = "M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8Z";
const EYE_CIRCLE = '<circle cx="12" cy="12" r="3"/>';
const EYE_OFF_PATH =
  "M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24";
const EYE_OFF_LINE = '<line x1="1" y1="1" x2="23" y2="23"/>';

function eyeIconSvg(revealed) {
  const inner = revealed ? `<path d="${EYE_OFF_PATH}"/>${EYE_OFF_LINE}` : `<path d="${EYE_PATH}"/>${EYE_CIRCLE}`;
  return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`;
}

// KaTeX auto-render delimiters: $$...$$ (display) checked before $...$
// (inline), per KaTeX's own recommended config.
const KATEX_DELIMITERS = [
  { left: "$$", right: "$$", display: true },
  { left: "$", right: "$", display: false },
];
function renderMath(el) {
  if (window.renderMathInElement) {
    renderMathInElement(el, { delimiters: KATEX_DELIMITERS, throwOnError: false });
  }
}

// Scales a rendered KaTeX expression's font-size so it fills as much of
// `boxEl` as it can without overflowing, instead of sitting at a fixed
// size regardless of how short/long the generated equation is. Works by
// measuring the natural (1em) render, then solving for the font-size
// that would make it fill the box — KaTeX's own internal layout is
// entirely em-relative, so scaling font-size scales the whole formula.
function fitMathToBox(mathHostEl, boxEl, { margin = 0.88, minScale = 0.65, maxScale = 3.5 } = {}) {
  mathHostEl.style.fontSize = "";
  const mathEl = mathHostEl.querySelector(".katex-display, .katex");
  if (!mathEl) return;
  const contentRect = mathEl.getBoundingClientRect();
  const boxRect = boxEl.getBoundingClientRect();
  if (!contentRect.width || !contentRect.height || !boxRect.width || !boxRect.height) return;
  let scale = Math.min(boxRect.width / contentRect.width, boxRect.height / contentRect.height) * margin;
  scale = Math.min(Math.max(scale, minScale), maxScale);
  mathHostEl.style.fontSize = `${scale}em`;
}

// setupDailyQA (below) calls into these whenever a math-fit widget's
// content changes size for a reason it can't see directly: the window
// resizing, the theme flipping (fonts/metrics can shift slightly), or
// the settings picker moving the widget into a slot it wasn't in before
// (its container goes from zero-size to real size in one jump).
const mathFitRefreshers = [];

const QOTD_CACHE_PREFIX = "desk-dashboard-qotd-";
const QOTD_DIFFICULTY_PREFIX = "desk-dashboard-qotd-difficulty-";
const QOTD_RETRY_COOLDOWN_MS = 5 * 60 * 1000;
const DIFFICULTIES = ["easy", "medium", "hard"];

function localDateKey(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function loadDifficulty(qtype) {
  const saved = localStorage.getItem(QOTD_DIFFICULTY_PREFIX + qtype);
  return DIFFICULTIES.includes(saved) ? saved : "medium";
}

// Integral/Derivative/Probability/Stat "of the day": generated once per
// calendar day, per difficulty, by Claude (see app/qotd.py) — each is
// cached in localStorage keyed by widget type *and* difficulty, with the
// generation date stored inside. Switching difficulty on a widget you've
// already solved today for another difficulty is instant (no fetch); a
// difficulty seen for the first time today fetches once and is cached
// from then on. Neither picking the widget in the settings modal nor it
// simply being on screen ever triggers a fetch by itself.
function setupDailyQA(qtype, promptEl, revealBtn, mathBoxEl, difficultyPickerEl) {
  const textEl = revealBtn.querySelector(".qotd-reveal-text");
  const iconEl = revealBtn.querySelector(".qotd-reveal-icon-wrap");
  let difficulty = loadDifficulty(qtype);
  let revealed = false;
  let currentAnswer = "";
  let isFetching = false;
  let lastAttempt = 0;

  function cacheKey() {
    return `${QOTD_CACHE_PREFIX}${qtype}-${difficulty}`;
  }

  function refit() {
    if (!mathBoxEl) return;
    // Fit the button first: its height (answer shown vs. "Show solution")
    // determines how much vertical space is actually left for the prompt
    // above it, so the prompt must be measured after the button settles.
    if (revealed) fitMathToBox(textEl, revealBtn, { maxScale: 2.2 });
    fitMathToBox(promptEl, mathBoxEl);
  }

  function paintDifficultyButtons() {
    if (!difficultyPickerEl) return;
    difficultyPickerEl.querySelectorAll(".difficulty-btn").forEach((btn) => {
      btn.classList.toggle("is-active", btn.dataset.level === difficulty);
    });
  }

  function paintButton() {
    revealBtn.classList.toggle("is-revealed", revealed);
    iconEl.innerHTML = eyeIconSvg(revealed);
    if (revealed) {
      textEl.textContent = currentAnswer;
      renderMath(textEl);
    } else {
      textEl.style.fontSize = "";
      textEl.textContent = "Show solution";
    }
    // The button changing height (answer vs. "Show solution") changes how
    // much space is left for the prompt above it, so both need refitting.
    refit();
  }

  function showItem(item) {
    promptEl.textContent = item.prompt;
    renderMath(promptEl);
    currentAnswer = item.answer;
    revealed = false;
    paintButton(); // also fits the prompt, via refit()
  }

  async function fetchAndShow() {
    if (isFetching) return;
    isFetching = true;
    lastAttempt = Date.now();
    const fetchedForDifficulty = difficulty;
    try {
      const res = await fetch(`/api/qotd/${qtype}?difficulty=${difficulty}`);
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error((body && body.detail) || `HTTP ${res.status}`);
      localStorage.setItem(`${QOTD_CACHE_PREFIX}${qtype}-${fetchedForDifficulty}`, JSON.stringify(body));
      if (fetchedForDifficulty === difficulty) showItem(body);
    } catch (err) {
      if (fetchedForDifficulty === difficulty) {
        promptEl.textContent = `Couldn't load today's question: ${err.message}`;
      }
    } finally {
      isFetching = false;
    }
  }

  function render() {
    const today = localDateKey();
    let cached = null;
    try {
      cached = JSON.parse(localStorage.getItem(cacheKey()));
    } catch (err) {
      cached = null;
    }
    if (cached && cached.date === today && cached.prompt && cached.answer) {
      showItem(cached);
      return;
    }
    if (isFetching || Date.now() - lastAttempt < QOTD_RETRY_COOLDOWN_MS) return;
    revealed = false;
    paintButton();
    promptEl.textContent = "Loading today's question…";
    fetchAndShow();
  }

  revealBtn.addEventListener("click", () => {
    revealed = !revealed;
    paintButton();
  });

  if (difficultyPickerEl) {
    difficultyPickerEl.querySelectorAll(".difficulty-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        if (btn.dataset.level === difficulty) return;
        difficulty = btn.dataset.level;
        localStorage.setItem(QOTD_DIFFICULTY_PREFIX + qtype, difficulty);
        paintDifficultyButtons();
        lastAttempt = 0; // a deliberate switch shouldn't wait out another difficulty's cooldown
        render();
      });
    });
    paintDifficultyButtons();
  }

  if (mathBoxEl) {
    mathFitRefreshers.push(refit);
    window.addEventListener("resize", refit);
    themeToggle.addEventListener("click", () => setTimeout(refit, 0));
  }

  render();
  setInterval(render, 60000); // catches the midnight rollover, retries on failure
}

// Number of the Day: same Claude-backed, once-a-day, localStorage-cached
// pattern as setupDailyQA, but there's no reveal step — the value and
// its fact both show immediately, so it's a plain fetch-and-paint.
function setupDailyValueFact(qtype, valueEl, factEl) {
  const cacheKey = QOTD_CACHE_PREFIX + qtype;
  let isFetching = false;
  let lastAttempt = 0;

  function showItem(item) {
    valueEl.textContent = item.prompt;
    renderMath(valueEl);
    factEl.textContent = item.answer;
    renderMath(factEl);
  }

  async function fetchAndShow() {
    if (isFetching) return;
    isFetching = true;
    lastAttempt = Date.now();
    try {
      const res = await fetch(`/api/qotd/${qtype}`);
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error((body && body.detail) || `HTTP ${res.status}`);
      localStorage.setItem(cacheKey, JSON.stringify(body));
      showItem(body);
    } catch (err) {
      valueEl.textContent = "–";
      factEl.textContent = `Couldn't load today's number: ${err.message}`;
    } finally {
      isFetching = false;
    }
  }

  function render() {
    const today = localDateKey();
    let cached = null;
    try {
      cached = JSON.parse(localStorage.getItem(cacheKey));
    } catch (err) {
      cached = null;
    }
    if (cached && cached.date === today && cached.prompt && cached.answer) {
      showItem(cached);
      return;
    }
    if (isFetching || Date.now() - lastAttempt < QOTD_RETRY_COOLDOWN_MS) return;
    valueEl.textContent = "···";
    factEl.textContent = "Loading today's number…";
    fetchAndShow();
  }

  render();
  setInterval(render, 60000); // catches the midnight rollover, retries on failure
}

setupDailyQA(
  "integral",
  document.getElementById("integral-prompt"),
  document.getElementById("integral-reveal"),
  document.querySelector("#card-integral .qotd-prompt-center"),
  document.getElementById("integral-difficulty")
);
setupDailyQA(
  "derivative",
  document.getElementById("derivative-prompt"),
  document.getElementById("derivative-reveal"),
  document.querySelector("#card-derivative .qotd-prompt-center"),
  document.getElementById("derivative-difficulty")
);
setupDailyQA(
  "diffeq",
  document.getElementById("diffeq-prompt"),
  document.getElementById("diffeq-reveal"),
  document.querySelector("#card-diffeq .qotd-prompt-center"),
  document.getElementById("diffeq-difficulty")
);
setupDailyQA(
  "probability",
  document.getElementById("probability-prompt"),
  document.getElementById("probability-reveal"),
  null,
  document.getElementById("probability-difficulty")
);
setupDailyQA(
  "stat",
  document.getElementById("stat-prompt"),
  document.getElementById("stat-reveal"),
  null,
  document.getElementById("stat-difficulty")
);
setupDailyValueFact("numday", document.getElementById("numday-value"), document.getElementById("numday-fact"));

/* ── Widget layout: 6 fixed slots, 14 possible widgets ───────
   Every widget's card element lives in #widget-pool at all times (so its
   ids/timers keep working even while it's not on screen); this section
   just moves the chosen 6 cards into the visible slots and remembers the
   choice in localStorage. */
const WIDGETS = [
  { id: "coin", label: "Law of Large Numbers" },
  { id: "bayes", label: "Bayes Theorem · PPV" },
  { id: "anscombe", label: "Anscombe's Quartet" },
  { id: "walk", label: "Random Walk" },
  { id: "ulam", label: "Ulam Spiral" },
  { id: "collatz", label: "Collatz Conjecture" },
  { id: "monty", label: "Monty Hall Problem" },
  { id: "dist", label: "Distribution Showdown" },
  { id: "dice", label: "Central Limit Theorem" },
  { id: "galton", label: "Galton Board" },
  { id: "benford", label: "Benford's Law" },
  { id: "fact", label: "Digit by Digit" },
  { id: "quote", label: "Quote" },
  { id: "integral", label: "Integral of the Day" },
  { id: "derivative", label: "Derivative of the Day" },
  { id: "diffeq", label: "Differential Equation of the Day" },
  { id: "probability", label: "Probability Question of the Day" },
  { id: "stat", label: "Stat Question of the Day" },
  { id: "numday", label: "Number of the Day" },
];
const WIDGET_IDS = WIDGETS.map((w) => w.id);
// First 6 are the original default; the last 3 are only ever placed
// once a screen is tall/wide enough to show the 3rd row (see below) —
// they still get remembered in localStorage even while hidden, though,
// so shrinking back down and growing again doesn't lose the choice.
const DEFAULT_LAYOUT = ["coin", "bayes", "walk", "collatz", "dice", "fact", "monty", "quote", "numday"];
const LAYOUT_KEY = "desk-dashboard-layout";
const MAX_SLOTS = 9;

// Kept in sync with the identical min-width/min-height media query in
// styles.css — that one decides how the grid *looks* (2 vs. 3 rows),
// this one decides how many widgets app.js actually places into it.
const THREE_ROW_QUERY = "(min-width: 960px) and (min-height: 760px)";
const threeRowMedia = window.matchMedia(THREE_ROW_QUERY);
function getSlotCount() {
  return threeRowMedia.matches ? MAX_SLOTS : 6;
}

function loadLayout() {
  let saved = null;
  try {
    saved = JSON.parse(localStorage.getItem(LAYOUT_KEY));
  } catch (err) {
    saved = null;
  }
  let result = Array.isArray(saved) ? saved.filter((id) => WIDGET_IDS.includes(id)) : [];
  result = [...new Set(result)];
  const fillPool = [...DEFAULT_LAYOUT, ...WIDGET_IDS].filter((id) => !result.includes(id));
  while (result.length < MAX_SLOTS && fillPool.length) result.push(fillPool.shift());
  return result.slice(0, MAX_SLOTS);
}

let layout = loadLayout();
const widgetPool = document.getElementById("widget-pool");

function applyLayout() {
  // appendChild only moves a node, it never clears what's already sitting
  // in the destination — so every widget goes back to the pool first,
  // which empties every slot, before the currently-visible ones are
  // placed again. `layout` always holds up to MAX_SLOTS entries even
  // when only 6 are on screen — the rest just stay parked in the pool.
  const visibleCount = getSlotCount();
  const visible = layout.slice(0, visibleCount);
  WIDGET_IDS.forEach((id) => {
    const cardEl = document.querySelector(`[data-widget="${id}"]`);
    if (cardEl) widgetPool.appendChild(cardEl);
  });
  visible.forEach((widgetId, slotIndex) => {
    const slotEl = document.querySelector(`.slot[data-slot="${slotIndex}"]`);
    const cardEl = document.querySelector(`[data-widget="${widgetId}"]`);
    if (slotEl && cardEl) slotEl.appendChild(cardEl);
  });
  localStorage.setItem(LAYOUT_KEY, JSON.stringify(layout));
  // Canvas/math-fit widgets need real container dimensions, only
  // available once actually seated in a slot — redraw/refit now that
  // they've landed (harmless no-ops for whichever aren't shown).
  if (visible.includes("ulam")) drawUlamSpiral();
  mathFitRefreshers.forEach((fn) => fn());
}

/* ── Settings modal ───────────────────────────────────────── */
const settingsToggle = document.getElementById("settings-toggle");
const settingsOverlay = document.getElementById("settings-overlay");
const settingsClose = document.getElementById("settings-close");
const settingsSlots = document.getElementById("settings-slots");
const settingsReset = document.getElementById("settings-reset");

function setSlotWidget(slotIndex, widgetId) {
  const existingIndex = layout.indexOf(widgetId);
  if (existingIndex !== -1 && existingIndex !== slotIndex) {
    // Already showing elsewhere — swap the two slots rather than duplicate.
    layout[existingIndex] = layout[slotIndex];
  }
  layout[slotIndex] = widgetId;
  applyLayout();
  refreshSettingsUI();
}

function buildSettingsUI() {
  settingsSlots.innerHTML = "";
  for (let i = 0; i < getSlotCount(); i++) {
    const row = document.createElement("div");
    row.className = "slot-row";

    const label = document.createElement("span");
    label.className = "slot-label";
    label.textContent = `Slot ${i + 1}`;

    const select = document.createElement("select");
    select.className = "slot-select";
    WIDGETS.forEach((w) => {
      const opt = document.createElement("option");
      opt.value = w.id;
      opt.textContent = w.label;
      select.appendChild(opt);
    });
    select.value = layout[i];
    select.addEventListener("change", () => setSlotWidget(i, select.value));

    row.appendChild(label);
    row.appendChild(select);
    settingsSlots.appendChild(row);
  }
}

function refreshSettingsUI() {
  settingsSlots.querySelectorAll(".slot-select").forEach((select, i) => {
    select.value = layout[i];
  });
}

function openSettings() {
  buildSettingsUI();
  settingsOverlay.hidden = false;
}
function closeSettings() {
  settingsOverlay.hidden = true;
}

settingsToggle.addEventListener("click", openSettings);
settingsClose.addEventListener("click", closeSettings);
settingsOverlay.addEventListener("click", (e) => {
  if (e.target === settingsOverlay) closeSettings();
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !settingsOverlay.hidden) closeSettings();
});
settingsReset.addEventListener("click", () => {
  layout = [...DEFAULT_LAYOUT];
  applyLayout();
  refreshSettingsUI();
});

// Crossing the 3-row breakpoint (e.g. rotating a tablet, or just
// resizing the window) changes how many slots are actually on screen —
// re-run the same placement logic so the 3rd row's widgets slide in or
// get parked back in the pool. If the picker happens to be open, its
// row count is stale until next opened, which is a fine trade-off.
threeRowMedia.addEventListener("change", applyLayout);

applyLayout();
