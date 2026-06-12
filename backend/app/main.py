import json

from fastapi import FastAPI, BackgroundTasks, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

from app.db import init_db
from app import refresh
from app.data.fetch_research import download_pdf, fetch_research_metadata, parse_pdf_text
from app.schemas import StockListResponse, StockListItem
from app.presets import get_presets
from app.screen import run_screen
from app.kline_service import get_stock_kline
from app.stock_detail import get_stock_detail
from app.fundamental_screen import run_fundamental_screen
from app.meta import get_meta

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
def refresh_kline(background: BackgroundTasks, reload_stock_list: bool = Query(True)):
    background.add_task(refresh.run_kline_refresh, reload_stock_list=reload_stock_list)
    return {"status": "accepted"}


@app.post("/refresh/fundamental", status_code=202)
def refresh_fundamental(background: BackgroundTasks):
    background.add_task(
        refresh.run_fundamental_refresh,
        research_meta_fn=fetch_research_metadata,
        candidate_screen_fn=run_fundamental_screen,
        research_download_fn=download_pdf,
        research_parse_fn=parse_pdf_text,
    )
    return {"status": "accepted"}


@app.get("/refresh/status")
def refresh_status():
    return refresh.get_status_snapshot()


@app.get("/meta")
def meta():
    return get_meta()


@app.get("/screen")
def screen(preset: str, params: str = Query(default="{}")):
    try:
        parsed = json.loads(params) if params else {}
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="params 不是合法 JSON")
    try:
        return run_screen(preset, parsed)
    except KeyError as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.get("/stock/{code}/kline")
def stock_kline(code: str, period: str = "day"):
    try:
        return get_stock_kline(code, period)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.get("/stock/{code}")
def stock_detail(code: str):
    return get_stock_detail(code)


@app.get("/stocks", response_model=StockListResponse)
def stock_list(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=200),
    sort_by: str = Query("code", pattern=r"^(code|name|market_cap)$"),
    sort_order: str = Query("asc", pattern=r"^(asc|desc)$"),
):
    from app.db import SessionLocal
    from app.models import Stock
    from sqlalchemy import desc as sa_desc

    with SessionLocal() as s:
        base_q = s.query(Stock).filter(Stock.delisted_at.is_(None))
        total = base_q.count()

        sort_col = getattr(Stock, sort_by)
        if sort_order == "desc":
            sort_col = sa_desc(sort_col)
        else:
            sort_col = sort_col.asc()

        rows = base_q.order_by(sort_col).offset((page - 1) * page_size).limit(page_size).all()

    return StockListResponse(
        total=total,
        page=page,
        pageSize=page_size,
        data=[StockListItem.model_validate(r) for r in rows],
    )
