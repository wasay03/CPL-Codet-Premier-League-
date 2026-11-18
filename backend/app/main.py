import logging
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import APIRouter, FastAPI, Request
from fastapi.responses import FileResponse, JSONResponse, Response
from fastapi.staticfiles import StaticFiles

from .config import get_settings
from .engine.auction import AuctionError
from .routers import auction, auth, images, me, players, settings, teams, users
from .routers.deps import engine_for
from .ws import endpoint as ws_endpoint

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")


@asynccontextmanager
async def lifespan(app: FastAPI):
    if get_settings().jwt_secret.startswith("dev-secret"):
        logging.getLogger("cpl").warning("JWT_SECRET is the development default; set it in production")
    engine = engine_for(app)
    await engine.recover()
    yield
    await engine.shutdown()


app = FastAPI(title="CPL Auction", version="1.0.0", lifespan=lifespan, docs_url="/docs")


@app.exception_handler(AuctionError)
async def auction_error_handler(_: Request, exc: AuctionError) -> JSONResponse:
    return JSONResponse({"detail": exc.message, "code": exc.code}, status_code=exc.status)


api = APIRouter(prefix="/api")


@api.get("/health")
async def health() -> dict:
    return {"ok": True}


for module in (auth, me, images, teams, players, settings, users, auction):
    api.include_router(module.router)

app.include_router(api)
app.include_router(ws_endpoint.router)

# Serve the built React app (copied to ./static by the Dockerfile) with SPA fallback.
_static = Path(get_settings().static_dir)
if (_static / "index.html").exists():
    if (_static / "assets").is_dir():
        app.mount("/assets", StaticFiles(directory=_static / "assets"), name="assets")

    @app.get("/{path:path}", include_in_schema=False)
    async def spa(path: str) -> Response:
        candidate = (_static / path).resolve()
        if path and candidate.is_file() and _static.resolve() in candidate.parents:
            return FileResponse(candidate)
        if path.startswith("api/"):
            return JSONResponse({"detail": "Not found"}, status_code=404)
        return FileResponse(_static / "index.html", headers={"Cache-Control": "no-cache"})
