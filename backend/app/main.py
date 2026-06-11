import json

from fastapi import FastAPI, BackgroundTasks, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

from app.db import init_db
from app import refresh
from app.presets import get_presets
from app.screen import run_technical_screen
from app.kline_service import get_stock_kline

app = FastAPI(title="i'mRich 选股器")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def _startup():
    init_db()


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/presets")
def presets():
    return get_presets()


@app.post("/refresh/kline", status_code=202)
def refresh_kline(background: BackgroundTasks):
    background.add_task(refresh.run_kline_refresh)
    return {"status": "accepted"}


@app.get("/refresh/status")
def refresh_status():
    def _grp(g):
        return {"status": g.status, "updatedAt": g.updatedAt,
                "steps": [vars(s) for s in g.steps]}
    return {k: _grp(v) for k, v in refresh.STATE.items()}


@app.get("/screen")
def screen(preset: str, params: str = Query(default="{}")):
    try:
        parsed = json.loads(params) if params else {}
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="params 不是合法 JSON")
    try:
        return run_technical_screen(preset, parsed)
    except KeyError as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.get("/stock/{code}/kline")
def stock_kline(code: str, period: str = "day"):
    try:
        return get_stock_kline(code, period)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
