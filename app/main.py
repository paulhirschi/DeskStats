from contextlib import asynccontextmanager
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse, Response
from fastapi.staticfiles import StaticFiles

from app.qotd import QOTDError, get_daily_question
from app.simulations import SimulationHub

BASE_DIR = Path(__file__).resolve().parent.parent
STATIC_DIR = BASE_DIR / "static"

load_dotenv(BASE_DIR / ".env")

hub = SimulationHub()


class NoCacheStaticFiles(StaticFiles):
    """This app's own JS/CSS/HTML change often during development (and any
    time you tweak the dashboard later); browsers otherwise hang onto their
    cached copies stubbornly enough that a plain reload can silently keep
    serving stale code. Vendored third-party assets (KaTeX) are unaffected
    since they're never edited."""

    def file_response(self, *args, **kwargs) -> Response:
        response = super().file_response(*args, **kwargs)
        response.headers["Cache-Control"] = "no-cache"
        return response


@asynccontextmanager
async def lifespan(app: FastAPI):
    hub.start()
    yield
    hub.stop()


app = FastAPI(title="Desk Dashboard", lifespan=lifespan)
app.mount("/static", NoCacheStaticFiles(directory=STATIC_DIR), name="static")


@app.get("/")
async def index() -> Response:
    response = FileResponse(STATIC_DIR / "index.html")
    response.headers["Cache-Control"] = "no-cache"
    return response


@app.get("/api/snapshot")
async def snapshot() -> dict:
    return hub.snapshot()


@app.get("/api/qotd/{qtype}")
async def qotd(qtype: str, difficulty: str = "medium") -> dict:
    try:
        return await get_daily_question(qtype, difficulty)
    except QOTDError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
