"""In-memory statistical simulations that back the dashboard widgets.

A single background task advances every simulation on a fixed tick so all
connected displays (there's normally just the one Pi) see the same live
state rather than each client running its own random sequence.
"""

from __future__ import annotations

import asyncio
import math
import random
from collections import deque

TICK_SECONDS = 0.5

# How much history each time-series widget keeps, in ticks.
COIN_HISTORY_LEN = 90
WALK_HISTORY_LEN = 140
COLLATZ_TRAIL_LEN = 24
RECENT_RUNS_LEN = 8


class CoinFlipSim:
    """Law of Large Numbers: running proportion of heads over many flips."""

    def __init__(self) -> None:
        self.flips = 0
        self.heads = 0
        self.history: deque[float] = deque(maxlen=COIN_HISTORY_LEN)

    def tick(self) -> None:
        for _ in range(4):
            self.flips += 1
            if random.random() < 0.5:
                self.heads += 1
        self.history.append(self.proportion)

    def reset(self) -> None:
        self.__init__()

    @property
    def proportion(self) -> float:
        return self.heads / self.flips if self.flips else 0.5

    def snapshot(self) -> dict:
        return {
            "flips": self.flips,
            "heads": self.heads,
            "proportion": round(self.proportion, 4),
            "history": [round(v, 4) for v in self.history],
        }


class DiceSumSim:
    """Central Limit Theorem: histogram of sums of 3d6 approaching a bell curve."""

    FACES = 6
    DICE = 3
    MIN_SUM = DICE
    MAX_SUM = DICE * FACES

    def __init__(self) -> None:
        self.rolls = 0
        self.histogram = {s: 0 for s in range(self.MIN_SUM, self.MAX_SUM + 1)}

    def tick(self) -> None:
        total = sum(random.randint(1, self.FACES) for _ in range(self.DICE))
        self.histogram[total] += 1
        self.rolls += 1

    def reset(self) -> None:
        self.__init__()

    def snapshot(self) -> dict:
        return {
            "rolls": self.rolls,
            "histogram": {str(k): v for k, v in self.histogram.items()},
        }


class RandomWalkSim:
    """A simple 1D random walk (discrete Brownian motion)."""

    def __init__(self) -> None:
        self.position = 0.0
        self.steps = 0
        self.history: deque[float] = deque(maxlen=WALK_HISTORY_LEN)
        self.history.append(self.position)

    def tick(self) -> None:
        self.position += random.gauss(0, 1)
        self.steps += 1
        self.history.append(self.position)

    def reset(self) -> None:
        self.__init__()

    def snapshot(self) -> dict:
        return {
            "position": round(self.position, 3),
            "steps": self.steps,
            "history": [round(v, 3) for v in self.history],
        }


class CollatzSim:
    """Steps a hailstone (Collatz) sequence to completion, then starts a new one."""

    def __init__(self) -> None:
        self.start = random.randint(2, 9999)
        self.current = self.start
        self.step = 0
        self.trail: deque[int] = deque(maxlen=COLLATZ_TRAIL_LEN)
        self.trail.append(self.current)
        self.longest_start = self.start
        self.longest_steps = 0
        self.recent_runs: deque[dict] = deque(maxlen=RECENT_RUNS_LEN)

    def tick(self) -> None:
        if self.current == 1:
            self.recent_runs.appendleft({"start": self.start, "steps": self.step})
            if self.step > self.longest_steps:
                self.longest_steps = self.step
                self.longest_start = self.start
            self.start = random.randint(2, 9999)
            self.current = self.start
            self.step = 0
            self.trail.clear()
            self.trail.append(self.current)
            return

        if self.current % 2 == 0:
            self.current //= 2
        else:
            self.current = 3 * self.current + 1
        self.step += 1
        self.trail.append(self.current)

    def reset(self) -> None:
        self.__init__()

    def snapshot(self) -> dict:
        return {
            "start": self.start,
            "current": self.current,
            "step": self.step,
            "trail": list(self.trail),
            "longest_start": self.longest_start,
            "longest_steps": self.longest_steps,
            "recent_runs": list(self.recent_runs),
        }


class MontyHallSim:
    """Plays the Monty Hall problem many times, comparing 'stay' vs 'switch'.

    The host's reveal never changes who wins: staying wins iff your first
    pick was the car; switching wins iff it wasn't. So each trial only needs
    a car position and a pick, no explicit door-opening — but the payoff is
    the same live convergence toward 1/3 vs 2/3.
    """

    def __init__(self) -> None:
        self.games = 0
        self.stay_wins = 0
        self.switch_wins = 0

    def tick(self) -> None:
        for _ in range(3):
            car = random.randint(0, 2)
            pick = random.randint(0, 2)
            self.games += 1
            if pick == car:
                self.stay_wins += 1
            else:
                self.switch_wins += 1

    def reset(self) -> None:
        self.__init__()

    def snapshot(self) -> dict:
        return {
            "games": self.games,
            "stay_rate": round(self.stay_wins / self.games, 4) if self.games else 1 / 3,
            "switch_rate": round(self.switch_wins / self.games, 4) if self.games else 2 / 3,
        }


class GaltonBoardSim:
    """A live 'bean machine': each ball bounces left or right off ROWS rows
    of pegs — a coin flip per row — and lands in one of ROWS+1 bins. That's
    exactly a Binomial(ROWS, 0.5) draw, so the bins slowly build up into a
    binomial (and, as more balls fall, distinctly bell-shaped) histogram.
    """

    ROWS = 8

    def __init__(self) -> None:
        self.bins = [0] * (self.ROWS + 1)
        self.total = 0
        self.last_bin = self.ROWS // 2

    def tick(self) -> None:
        for _ in range(2):
            bin_index = sum(random.randint(0, 1) for _ in range(self.ROWS))
            self.bins[bin_index] += 1
            self.total += 1
            self.last_bin = bin_index

    def reset(self) -> None:
        self.__init__()

    def snapshot(self) -> dict:
        return {"bins": list(self.bins), "total": self.total, "last_bin": self.last_bin}


class BenfordSim:
    """Draws numbers whose *exponent* is uniform across several orders of
    magnitude (10^Uniform(0, 6)) — the textbook mechanism behind Benford's
    Law — and tracks how often each leading digit (1-9) comes up against
    the predicted P(d) = log10(1 + 1/d) curve.
    """

    MAGNITUDE_SPAN = 6

    def __init__(self) -> None:
        self.counts = [0] * 10  # index 0 unused, digits are 1-9
        self.total = 0

    def tick(self) -> None:
        for _ in range(3):
            value = 10 ** random.uniform(0, self.MAGNITUDE_SPAN)
            exponent = math.floor(math.log10(value))
            leading = int(value / (10**exponent))
            leading = min(max(leading, 1), 9)  # guard rare float edge cases
            self.counts[leading] += 1
            self.total += 1

    def reset(self) -> None:
        self.__init__()

    def snapshot(self) -> dict:
        return {"counts": self.counts[1:], "total": self.total}


class SimulationHub:
    """Owns every simulation and the background loop that advances them."""

    RESETTABLE = ("coin", "dice", "walk", "collatz", "monty", "galton", "benford")

    def __init__(self) -> None:
        self.coin = CoinFlipSim()
        self.dice = DiceSumSim()
        self.walk = RandomWalkSim()
        self.collatz = CollatzSim()
        self.monty = MontyHallSim()
        self.galton = GaltonBoardSim()
        self.benford = BenfordSim()
        self._task: asyncio.Task | None = None

    async def _run(self) -> None:
        while True:
            self.coin.tick()
            self.dice.tick()
            self.walk.tick()
            self.collatz.tick()
            self.monty.tick()
            self.galton.tick()
            self.benford.tick()
            await asyncio.sleep(TICK_SECONDS)

    def start(self) -> None:
        if self._task is None:
            self._task = asyncio.create_task(self._run())

    def stop(self) -> None:
        if self._task is not None:
            self._task.cancel()
            self._task = None

    def reset(self, name: str) -> None:
        if name not in self.RESETTABLE:
            raise KeyError(f"unknown simulation: {name!r}")
        getattr(self, name).reset()

    def snapshot(self) -> dict:
        return {
            "coin": self.coin.snapshot(),
            "dice": self.dice.snapshot(),
            "walk": self.walk.snapshot(),
            "collatz": self.collatz.snapshot(),
            "monty": self.monty.snapshot(),
            "galton": self.galton.snapshot(),
            "benford": self.benford.snapshot(),
        }
