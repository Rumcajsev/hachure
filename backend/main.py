import sys
from pathlib import Path
from dotenv import load_dotenv
load_dotenv(Path(__file__).parent / '.env', override=True)

from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from routers import generate, route, export

_port = 8000      # overridden by --port arg
_dist: Path | None = None  # overridden by --dist-dir arg


@asynccontextmanager
async def lifespan(app: FastAPI):
    if _dist and _dist.exists():
        app.mount("/", StaticFiles(directory=_dist, html=True), name="static")
    print(f"IG2_READY:{_port}", flush=True)
    yield


app = FastAPI(title="IG2 Hex Map Generator", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(generate.router, prefix="/api/generate")
app.include_router(route.router, prefix="/api/route")
app.include_router(export.router, prefix="/api/export")


@app.get("/health")
async def health() -> dict:
    return {"status": "ok"}


if __name__ == "__main__":
    import argparse
    import socket
    import uvicorn

    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=None)
    parser.add_argument("--dist-dir", type=str, default=None)
    args = parser.parse_args()

    if args.port:
        _port = args.port
    else:
        with socket.socket() as s:
            s.bind(("127.0.0.1", 0))
            _port = s.getsockname()[1]

    if args.dist_dir:
        _dist = Path(args.dist_dir)

    uvicorn.run(app, host="127.0.0.1", port=_port, log_config=None, access_log=False)
