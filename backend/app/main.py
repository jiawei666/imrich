import asyncio
import json

from fastapi import FastAPI, BackgroundTasks, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse

from app.db import init_db
from app import refresh
from app.data.fetch_research import download_pdf, fetch_research_metadata, parse_pdf_text
from app.schemas import StockListResponse, StockListItem, StockSearchItem, StockSearchResponse
from app.presets import get_presets
from app.screen import run_screen
from app.kline_service import get_stock_kline
from app.stock_detail import get_stock_detail
from app.meta import get_meta

app = FastAPI(title="i'mRich 选股器")

# 跟踪异步任务，便于关闭时取消
_refresh_tasks: "set[asyncio.Task]" = set()


@app.on_event("shutdown")
def _shutdown():
    """通知正在运行的同步刷新任务退出，然后取消异步任务。"""
    refresh.request_cancel()
    for t in list(_refresh_tasks):
        t.cancel()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:5174", "http://127.0.0.1:5173", "http://127.0.0.1:5174"],
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
async def refresh_kline(reload_stock_list: bool = Query(True)):
    t = asyncio.create_task(
        asyncio.to_thread(refresh.run_kline_refresh, reload_stock_list=reload_stock_list)
    )
    _refresh_tasks.add(t)
    t.add_done_callback(_refresh_tasks.discard)
    return {"status": "accepted"}


@app.post("/refresh/fundamental", status_code=202)
async def refresh_fundamental():
    t = asyncio.create_task(
        asyncio.to_thread(
            refresh.run_fundamental_refresh,
            research_meta_fn=fetch_research_metadata,
            research_download_fn=download_pdf,
            research_parse_fn=parse_pdf_text,
        )
    )
    _refresh_tasks.add(t)
    t.add_done_callback(_refresh_tasks.discard)
    return {"status": "accepted"}


FUNDAMENTAL_STEP_DEPS = {
    "research-pdfs": ("research-meta", "请先刷新研报元数据"),
}

FUNDAMENTAL_STEP_MAP = {
    "financial": 0, "forecasts": 1, "industry": 2,
    "research-meta": 3, "research-pdfs": 4,
}


@app.post("/refresh/fundamental/{step}", status_code=202)
async def refresh_fundamental_step(step: str):
    """单步刷新基本面数据。"""
    # 依赖检查
    if step in FUNDAMENTAL_STEP_DEPS:
        dep_step, msg = FUNDAMENTAL_STEP_DEPS[step]
        dep_idx = FUNDAMENTAL_STEP_MAP.get(dep_step)
        if dep_idx is not None and refresh.STATE["fundamental"].steps[dep_idx].status != "done":
            raise HTTPException(status_code=409, detail=msg)

    # 步骤名检查
    idx = FUNDAMENTAL_STEP_MAP.get(step)
    if idx is None:
        raise HTTPException(status_code=404, detail=f"未知步骤: {step}")

    # 重复触发检查
    if refresh.STATE["fundamental"].steps[idx].status == "running":
        raise HTTPException(status_code=409, detail="该步骤正在执行中")

    # 分发执行
    dispatch = {
        "financial": lambda: refresh.run_financial_refresh(),
        "forecasts": lambda: refresh.run_forecasts_refresh(),
        "industry": lambda: refresh.run_industry_refresh(),
        "research-meta": lambda: refresh.run_research_meta_refresh(),
        "research-pdfs": lambda: refresh.run_research_pdfs_refresh(
            research_download_fn=download_pdf,
            research_parse_fn=parse_pdf_text,
        ),
    }
    t = asyncio.create_task(asyncio.to_thread(dispatch[step]))
    _refresh_tasks.add(t)
    t.add_done_callback(_refresh_tasks.discard)
    return {"status": "accepted"}


@app.get("/refresh/status")
def refresh_status():
    return refresh.get_status_snapshot()


@app.get("/refresh/status/stream")
async def refresh_status_stream(request: Request):
    async def gen():
        last = None
        while True:
            if await request.is_disconnected():
                break
            snapshot = refresh.get_status_snapshot()
            if snapshot != last:
                yield f"data: {json.dumps(snapshot)}\n\n"
                last = snapshot
            else:
                yield ": ping\n\n"
            await asyncio.sleep(0.5)
    return StreamingResponse(gen(), media_type="text/event-stream")


@app.get("/meta")
def meta():
    return get_meta()


@app.get("/indices")
def list_indices():
    from app.models import IndexConstituent
    from app.db import SessionLocal
    with SessionLocal() as s:
        rows = s.query(IndexConstituent).all()
    indices: dict[str, dict] = {}
    for r in rows:
        index = indices.setdefault(r.index_code, {"indexCode": r.index_code, "indexName": r.index_name, "stockCodes": []})
        index["stockCodes"].append(r.stock_code)
    return list(indices.values())


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


@app.get("/screen/history")
def screen_history(preset: str):
    from app.screen import list_screen_snapshots
    return list_screen_snapshots(preset)


@app.get("/screen/history/{date}")
def screen_history_detail(date: str, preset: str):
    from app.screen import get_screen_snapshot
    result = get_screen_snapshot(preset, date)
    if result is None:
        raise HTTPException(status_code=404, detail="未找到该日期的筛选结果")
    return result


@app.get("/screen/result")
def screen_result(
    preset: str,
    params: str = Query(default=None),
    history_date: str = Query(default=None, alias="history_date"),
):
    from app.screen import run_screen_result
    try:
        parsed = json.loads(params) if params else None
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="params 不是合法 JSON")
    if parsed is not None and history_date is not None:
        raise HTTPException(status_code=400, detail="params 和 history_date 不可同时传入")
    try:
        return run_screen_result(preset, parsed, history_date)
    except KeyError as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.get("/screen/fundamental/result")
def fundamental_screen_result(preset: str, params: str = Query(default=None)):
    from app.screen import run_fundamental_screen_result
    try:
        parsed = json.loads(params) if params else None
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="params 不是合法 JSON")
    try:
        return run_fundamental_screen_result(preset, parsed)
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


@app.get("/stocks/search", response_model=StockSearchResponse)
def stock_search(
    q: str = Query(..., min_length=1),
    page: int = Query(1, ge=1),
    page_size: int = Query(30, ge=1, le=100),
):
    from app.db import SessionLocal
    from app.models import Stock, KlineDay

    with SessionLocal() as s:
        base_q = s.query(Stock).filter(
            Stock.delisted_at.is_(None),
            (Stock.code.contains(q)) | (Stock.name.contains(q)),
        )
        total = base_q.count()
        rows = base_q.offset((page - 1) * page_size).limit(page_size).all()

        # 获取最新收盘价
        codes = [r.code for r in rows]
        latest_close: dict[str, float] = {}
        if codes:
            kline_rows = (s.query(KlineDay.code, KlineDay.close)
                          .filter(KlineDay.code.in_(codes))
                          .order_by(KlineDay.code, KlineDay.date.desc())
                          .all())
            seen: set[str] = set()
            for kr in kline_rows:
                if kr.code not in seen:
                    seen.add(kr.code)
                    latest_close[kr.code] = kr.close

        items = []
        for r in rows:
            items.append(StockSearchItem(
                code=r.code,
                name=r.name,
                close=round(latest_close[r.code], 2) if r.code in latest_close else None,
                pct_chg=None,
            ))

    return StockSearchResponse(total=total, page=page, pageSize=page_size, data=items)


@app.get("/stocks", response_model=StockListResponse)
def stock_list(
    q: str = Query(default="", max_length=50),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=200),
    sort_by: str = Query("code", pattern=r"^(code|name|market_cap)$"),
    sort_order: str = Query("asc", pattern=r"^(asc|desc)$"),
):
    from app.db import SessionLocal
    from app.models import Stock, KlineDay
    from sqlalchemy import desc as sa_desc

    with SessionLocal() as s:
        base_q = s.query(Stock).filter(Stock.delisted_at.is_(None))
        if q:
            base_q = base_q.filter(
                (Stock.code.contains(q)) | (Stock.name.contains(q))
            )
        total = base_q.count()

        sort_col = getattr(Stock, sort_by)
        if sort_order == "desc":
            sort_col = sa_desc(sort_col)
        else:
            sort_col = sort_col.asc()

        rows = base_q.order_by(sort_col).offset((page - 1) * page_size).limit(page_size).all()

        # 获取这些股票的最新日K收盘价和前一日收盘价
        codes = [r.code for r in rows]
        latest_close: dict[str, float] = {}
        pct_chg_map: dict[str, float] = {}
        if codes:
            # 查询所有相关K线，按日期倒序
            kline_rows = (s.query(KlineDay.code, KlineDay.close, KlineDay.date)
                          .filter(KlineDay.code.in_(codes))
                          .order_by(KlineDay.code, KlineDay.date.desc())
                          .all())
            # 每只股票取最新两条
            per_code: dict[str, list] = {}
            for kr in kline_rows:
                per_code.setdefault(kr.code, []).append(kr)
            for code, krs in per_code.items():
                if krs:
                    latest_close[code] = krs[0].close
                if len(krs) >= 2 and krs[1].close and krs[1].close > 0:
                    pct_chg_map[code] = round((krs[0].close - krs[1].close) / krs[1].close * 100, 2)

        items = []
        for r in rows:
            item = StockListItem.model_validate(r)
            if r.code in latest_close:
                item.close = round(latest_close[r.code], 2)
            if r.code in pct_chg_map:
                item.pct_chg = pct_chg_map[r.code]
            items.append(item)

    return StockListResponse(
        total=total,
        page=page,
        pageSize=page_size,
        data=items,
    )
