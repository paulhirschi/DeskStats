"""Tracks the ISS's live position (and current spacefarers) via the free
Open Notify API — the dashboard's one widget backed by real-world data
rather than a local simulation.

Runs its own slow background poll (separate from SimulationHub's fast
0.5s tick) since hitting a third-party API that often would be rude and
pointless — the ISS barely moves position-to-position at sub-second
scale anyway. A network hiccup just leaves the last-known-good position
in place until the next successful poll rather than erroring the widget.
"""

from __future__ import annotations

import asyncio
import time
from collections import deque

import httpx

# Open Notify doesn't support HTTPS reliably — plain HTTP is what its own
# docs and every known client use.
ISS_POSITION_URL = "http://api.open-notify.org/iss-now.json"
ISS_ASTROS_URL = "http://api.open-notify.org/astros.json"

POSITION_POLL_SECONDS = 5
ASTROS_POLL_SECONDS = 600  # crew rosters change on the order of months, not minutes
TRAIL_LEN = 30  # ~2.5 minutes of ground-track history at the position poll rate


class ISSTracker:
    def __init__(self) -> None:
        self.latitude = 0.0
        self.longitude = 0.0
        self.trail: deque[tuple[float, float]] = deque(maxlen=TRAIL_LEN)
        self.people: list[dict] = []
        self._task: asyncio.Task | None = None
        self._astros_last_fetch = 0.0

    async def _poll_position(self, client: httpx.AsyncClient) -> None:
        resp = await client.get(ISS_POSITION_URL, timeout=5)
        resp.raise_for_status()
        pos = resp.json()["iss_position"]
        self.latitude = float(pos["latitude"])
        self.longitude = float(pos["longitude"])
        self.trail.append((self.latitude, self.longitude))

    async def _poll_astros(self, client: httpx.AsyncClient) -> None:
        resp = await client.get(ISS_ASTROS_URL, timeout=5)
        resp.raise_for_status()
        data = resp.json()
        self.people = [{"name": p["name"], "craft": p["craft"]} for p in data["people"]]

    async def _run(self) -> None:
        async with httpx.AsyncClient() as client:
            while True:
                try:
                    await self._poll_position(client)
                except (httpx.HTTPError, KeyError, ValueError):
                    pass  # transient network/API hiccup — keep serving the last fix
                now = time.monotonic()
                if now - self._astros_last_fetch > ASTROS_POLL_SECONDS:
                    try:
                        await self._poll_astros(client)
                        self._astros_last_fetch = now
                    except (httpx.HTTPError, KeyError, ValueError):
                        pass
                await asyncio.sleep(POSITION_POLL_SECONDS)

    def start(self) -> None:
        if self._task is None:
            self._task = asyncio.create_task(self._run())

    def stop(self) -> None:
        if self._task is not None:
            self._task.cancel()
            self._task = None

    def snapshot(self) -> dict:
        return {
            "latitude": round(self.latitude, 4),
            "longitude": round(self.longitude, 4),
            "trail": [[round(lat, 4), round(lon, 4)] for lat, lon in self.trail],
            "people": self.people,
            "people_count": len(self.people),
        }
