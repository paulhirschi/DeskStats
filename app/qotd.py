"""'X of the Day' question generation via the Claude API.

Five types (integral, derivative, diffeq, probability, stat) each come in
three difficulty levels (easy/medium/hard), chosen per-widget from the
dashboard and remembered client-side. Number of the Day is a sixth type
with no difficulty axis — it's a fact, not something to solve.

Each (type, difficulty) pair gets one freshly-generated item per calendar
day. This module owns the prompts, the forced-tool-call schema that keeps
Claude's output structured and parseable, and a tiny in-memory cache so a
given day's question is only ever generated once no matter how many times
(or from how many clients) it's requested — the frontend also caches the
result in localStorage, so in the common case this module isn't even
called after the first request for a given type+difficulty that day.
"""

from __future__ import annotations

import os
from datetime import date

from anthropic import AsyncAnthropic

DEFAULT_MODEL = "claude-haiku-4-5-20251001"
DIFFICULTIES = ("easy", "medium", "hard")

SUBMIT_TOOL = {
    "name": "submit_question",
    "description": "Submit today's generated question and its answer.",
    "input_schema": {
        "type": "object",
        "properties": {
            "prompt_latex": {
                "type": "string",
                "description": (
                    "The question, as plain text with any math delimited by $...$ (inline) "
                    "or $$...$$ (display). No markdown headers, no surrounding commentary."
                ),
            },
            "answer_latex": {
                "type": "string",
                "description": (
                    "The complete, correct answer with justification, as plain text with "
                    "math delimited by $...$ or $$...$$."
                ),
            },
        },
        "required": ["prompt_latex", "answer_latex"],
    },
}

# Templates for the four difficulty-aware types. %%DIFFICULTY_GUIDANCE%% is
# swapped for the matching entry in DIFFICULTY_GUIDANCE below (a plain
# string replace, not str.format — these templates are full of literal
# LaTeX braces that would otherwise need escaping).
QOTD_TEMPLATES: dict[str, str] = {
    "integral": """Generate today's "Integral of the Day": one indefinite integral problem.

Guidelines:
- %%DIFFICULTY_GUIDANCE%%
- Avoid the most overused textbook examples (e.g. ∫x·e^x dx, ∫x·sin(x) dx) — prefer something a little less common at the same difficulty level when reasonable.
- prompt_latex: ONLY the integral itself, as LaTeX display math, e.g. "$$\\int 2x\\,e^{x^2}\\,dx$$". No surrounding text.
- answer_latex: the fully worked antiderivative plus the constant of integration, as LaTeX display math, followed by a short plain-English note (under 10 words) naming the technique, e.g. "$$e^{x^2} + C$$ — substitution, $u = x^2$".
- Double-check your work: differentiate your proposed answer and confirm it equals the original integrand exactly before responding.""",
    "derivative": """Generate today's "Derivative of the Day": one differentiation problem.

Guidelines:
- %%DIFFICULTY_GUIDANCE%%
- Avoid the most overused textbook examples (e.g. d/dx[x·e^x], d/dx[sin(x^2)]) — prefer something a little less common at the same difficulty level when reasonable.
- prompt_latex: ONLY the expression to differentiate, as LaTeX display math, e.g. "$$\\frac{d}{dx}\\left[x^2 \\ln x\\right]$$". No surrounding text.
- answer_latex: the fully simplified derivative, as LaTeX display math, followed by a short plain-English note (under 10 words) naming the rule used, e.g. "$$2x\\ln x + x$$ — product rule".
- Double-check your work before responding: re-derive it and confirm the simplification is correct.""",
    "probability": """Generate today's "Probability Question of the Day" for a data scientist who already knows the basics — they are bored by questions like "what's the probability of drawing an ace from a deck?"

Guidelines:
- %%DIFFICULTY_GUIDANCE%%
- It must be a single, self-contained, unambiguous question solvable with a clear numeric or short symbolic answer — not open-ended.
- Vary the topic/style from common textbook staples where you reasonably can, while keeping it well-known-puzzle quality rather than obscure or contrived.
- prompt_latex: the question as natural English prose, with any formulas or notation inline using $...$, e.g. "You flip a coin repeatedly... what's $P(\\text{heads})$...". Keep it to 1-3 sentences.
- answer_latex: the correct final answer stated clearly up front (e.g. as "$1/3$"), followed by a concise (2-3 sentence) explanation of why, with inline $...$ for any math.
- Double-check that your stated answer is actually correct by re-deriving it before responding — probability puzzles are notorious for tempting wrong answers.""",
    "stat": """Generate today's "Stat Question of the Day" — a conceptual statistics question, distinct from pure probability puzzles, aimed at a data scientist.

Guidelines:
- %%DIFFICULTY_GUIDANCE%%
- Frame it as a short, concrete scenario (not an abstract definition question) that tests whether the reader understands the concept correctly, similar in spirit to: "A drug trial reports p = 0.03. What does that actually mean?"
- Vary the specific concept/scenario from common examples where you reasonably can.
- prompt_latex: the scenario/question as natural English prose, 1-3 sentences, with any notation inline using $...$ if needed.
- answer_latex: the correct explanation, 2-4 sentences, clear and precise, gently correcting the natural misconception where relevant.
- Make sure the explanation is statistically accurate and precise before responding.""",
    "diffeq": """Generate today's "Differential Equation of the Day": one ordinary differential equation to solve.

Guidelines:
- %%DIFFICULTY_GUIDANCE%%
- Avoid the most overused textbook examples (e.g. a bare $y' = y$, or $y'' + y = 0$ with no twist) — prefer something a little less common at the same difficulty level when reasonable.
- prompt_latex: ONLY the differential equation itself (plus an initial/boundary condition if one is needed or makes it more concrete), as LaTeX display math, e.g. "$$\\frac{dy}{dx} + 2y = e^{-x}$$". No surrounding text.
- answer_latex: the general solution (or particular solution, if a condition was given), as LaTeX display math, followed by a short plain-English note (under 10 words) naming the technique, e.g. "$$y = e^{-x}(x + C)$$ — integrating factor".
- Double-check your work: substitute your proposed solution back into the original equation and confirm it satisfies it exactly before responding.""",
}

DIFFICULTY_GUIDANCE: dict[str, dict[str, str]] = {
    "integral": {
        "easy": "EASY difficulty: a single straightforward technique — basic u-substitution, a standard trig/exponential integral, or a simple composite power rule — resolving in 1-2 lines. Approachable right after a first calculus course.",
        "medium": "MEDIUM difficulty: harder than a basic power-rule integral, but solvable in 2-4 lines using ONE core technique (u-substitution, integration by parts, a trig identity, partial fractions, or a standard trig/exponential integral). Avoid multi-step reduction formulas or anything requiring more than one nontrivial technique combined.",
        "hard": "HARD difficulty: requires combining two techniques (e.g. substitution then parts, or a trig identity then partial fractions), or a less common integral (inverse trig combinations, hyperbolic functions, a reduction formula, or a non-obvious substitution). Should still have a clean closed-form answer, but genuinely challenge someone comfortable with standard calculus.",
    },
    "derivative": {
        "easy": "EASY difficulty: a single application of one basic rule — chain rule OR product rule alone, not combined — resolving in 1-2 lines.",
        "medium": "MEDIUM difficulty: requires the product rule, quotient rule, chain rule, implicit differentiation, or logarithmic differentiation — not a bare power-rule term. Should resolve in 2-4 lines, not a long chain of nested rules.",
        "hard": "HARD difficulty: requires combining multiple rules (e.g. a chain rule nested inside a quotient rule, or logarithmic differentiation on a product of several factors), or implicit differentiation on a more involved relation. Should still simplify to a clean closed form but take real care to work through.",
    },
    "probability": {
        "easy": "EASY difficulty: still more interesting than 'probability of an ace,' but a single clear insight or well-known named result (a straightforward symmetry/complement argument, or a simple well-known paradox) that's quick to verify.",
        "medium": 'MEDIUM difficulty and genuinely interesting: aim for something with a counter-intuitive or "aha" answer — in the spirit of the Monty Hall problem, the birthday paradox, Bayes\' theorem surprises, Penney\'s game, symmetry arguments, geometric probability, or a clean conditional-probability trick. Avoid straightforward single-step counting problems.',
        "hard": "HARD difficulty: requires multi-step reasoning — combining conditional probability with a counting argument, a less commonly known puzzle, or a result that even people comfortable with probability find genuinely surprising. Should still resolve to a single clean numeric/symbolic answer, but take real thought to solve.",
    },
    "stat": {
        "easy": "EASY difficulty: a single, well-known concept explained through one clear, common scenario (e.g. a plain correlation-vs-causation example) — the kind of thing someone who's taken one stats course should get with a moment's thought.",
        "medium": "MEDIUM difficulty, focused on statistical REASONING and common misconceptions rather than probability combinatorics: e.g. p-values and significance, confidence intervals, regression to the mean, correlation vs. causation, sampling bias, multiple comparisons, bias-variance / overfitting, statistical vs. practical significance, effect size, or Simpson's paradox.",
        "hard": "HARD difficulty: a subtler or compound misconception — e.g. interaction effects muddying a Simpson's paradox, the multiple-comparisons problem in a non-obvious setting, or a scenario where two plausible-sounding statistical arguments conflict and only one holds up. Should require real thought, not just naming a familiar term.",
    },
    "diffeq": {
        "easy": "EASY difficulty: a separable first-order ODE, or a first-order linear ODE solvable by direct integration or one straightforward application of an integrating factor. Resolves in 2-3 lines — approachable right after a first ODE lecture.",
        "medium": "MEDIUM difficulty: a first-order linear ODE requiring an integrating factor with a non-trivial right-hand side, OR a second-order linear homogeneous ODE with constant coefficients (distinct real, repeated, or complex roots). Solvable in 3-5 lines with one core technique.",
        "hard": "HARD difficulty: a second-order linear NON-homogeneous ODE with constant coefficients requiring undetermined coefficients or variation of parameters, OR a first-order ODE requiring a clever substitution (Bernoulli, or homogeneous-in-x-and-y). Should still have a clean closed-form solution, but genuinely challenge someone comfortable with a first ODE course.",
    },
}

# Number of the Day has no difficulty axis — it's a fact, not a problem.
NUMDAY_PROMPT = """Generate today's "Number of the Day" for a data scientist who loves math trivia — think Ramanujan's taxicab number, perfect numbers, amicable pairs, cyclic numbers, famous constants (e, φ, γ), Munchausen numbers, RSA/cryptography numbers, or similar "huh, neat" facts from number theory, combinatorics, or famous equations.

Guidelines:
- Pick ONE specific number, numeric pair, or famous constant/expression with a genuinely interesting, verifiable mathematical property. Range widely across categories — don't default to the most overused examples (1729, 42, the golden ratio) every time; there are hundreds of good options, so surprise a repeat visitor.
- prompt_latex: JUST the number/expression itself, formatted for display — e.g. "$1{,}729$", "$220$ & $284$", "$e^{i\\pi} + 1$", "$\\varphi \\approx 1.618$". Use $...$ for math notation; plain digits/commas as plain text are fine too.
- answer_latex: one or two sentences explaining what's special about it, precise and correct, with inline $...$ for any formulas.
- Double-check the fact is mathematically accurate before responding — don't state a property that doesn't actually hold."""

# Higher temperature = more variety in which problem/number gets picked;
# lower = more conservative and (a little) less prone to a shaky
# arithmetic slip. Calculus needs to be exactly right, so it leans lower;
# the others are graded on "interesting and correct," not "unique," so
# they lean into Claude's max temperature for real day-to-day variety.
QOTD_TEMPERATURES: dict[str, float] = {
    "integral": 0.8,
    "derivative": 0.8,
    "diffeq": 0.8,
    "probability": 1.0,
    "stat": 1.0,
    "numday": 1.0,
}


def _build_prompt(qtype: str, difficulty: str) -> str:
    guidance = DIFFICULTY_GUIDANCE[qtype][difficulty]
    return QOTD_TEMPLATES[qtype].replace("%%DIFFICULTY_GUIDANCE%%", guidance)


class QOTDError(Exception):
    """Raised when a question can't be produced (missing key, API failure, ...)."""


_client: AsyncAnthropic | None = None
_cache: dict[tuple[str, str, str], dict] = {}  # (qtype, difficulty, date) -> result


def _get_client() -> AsyncAnthropic | None:
    global _client
    if _client is None:
        api_key = os.environ.get("ANTHROPIC_API_KEY")
        if not api_key:
            return None
        _client = AsyncAnthropic(api_key=api_key)
    return _client


async def get_daily_question(qtype: str, difficulty: str = "medium") -> dict:
    if qtype == "numday":
        prompt_text = NUMDAY_PROMPT
        difficulty = "none"
    elif qtype in QOTD_TEMPLATES:
        if difficulty not in DIFFICULTIES:
            difficulty = "medium"
        prompt_text = _build_prompt(qtype, difficulty)
    else:
        raise QOTDError(f"unknown question type: {qtype!r}")

    today = date.today().isoformat()
    cache_key = (qtype, difficulty, today)
    if cache_key in _cache:
        return _cache[cache_key]

    client = _get_client()
    if client is None:
        raise QOTDError("ANTHROPIC_API_KEY is not set on the server")

    model = os.environ.get("ANTHROPIC_MODEL", DEFAULT_MODEL)
    try:
        response = await client.messages.create(
            model=model,
            max_tokens=1024,
            temperature=QOTD_TEMPERATURES.get(qtype, 1.0),
            tools=[SUBMIT_TOOL],
            tool_choice={"type": "tool", "name": "submit_question"},
            messages=[{"role": "user", "content": prompt_text}],
        )
    except Exception as exc:  # noqa: BLE001 — surface any SDK/network failure uniformly
        raise QOTDError(f"Claude API request failed: {exc}") from exc

    tool_use = next((block for block in response.content if block.type == "tool_use"), None)
    if tool_use is None:
        raise QOTDError("Claude did not return a structured answer")

    prompt_latex = (tool_use.input.get("prompt_latex") or "").strip()
    answer_latex = (tool_use.input.get("answer_latex") or "").strip()
    if not prompt_latex or not answer_latex:
        # Most often a max_tokens cutoff mid-generation. Don't cache a
        # broken result — the next request (client retries with a
        # cooldown) will simply try generating again.
        raise QOTDError("Claude returned an incomplete question — try again shortly")

    result = {"date": today, "difficulty": difficulty, "prompt": prompt_latex, "answer": answer_latex}
    _cache[cache_key] = result
    return result
