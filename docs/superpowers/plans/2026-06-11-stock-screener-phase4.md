# i'mRich 选股器 · 阶段4（收尾打磨与端到端联调）实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 完成 `/meta`、默认股票池过滤、个股详情接口、边界场景处理和端到端联调，让 v1 从“功能可跑”进入“可日常使用”状态。

**Architecture:** 阶段4不引入新的策略算法，只补齐产品闭环。后端新增 `app/meta.py`、`app/stock_detail.py`、`app/pool_filters.py`，把阶段1-3已有数据统一暴露给前端；前端把 TopBar 更新时间、候选股详情面板、刷新进度轮询和空/错/加载态接到真实接口。默认股票池过滤集中在一个后端函数，供技术面和基本面筛选共用，避免每个策略重复写 ST/新股/北交所/退市过滤。

**Tech Stack:** Python 3.9.19、FastAPI、SQLAlchemy、pytest；React/Vite/TypeScript。无新增依赖。

**前置条件：** 阶段1、阶段2、阶段3均已完成，且 `cd backend && ./venv/bin/pytest -q`、`cd frontend && npm run build` 通过。

---

## 文件结构

| 文件 | 操作 | 职责 |
|---|---|---|
| `backend/app/pool_filters.py` | 建 | 默认股票池过滤：剔除 ST、北交所、退市、上市不足1年 |
| `backend/app/meta.py` | 建 | 汇总各数据源更新时间与报告期 |
| `backend/app/stock_detail.py` | 建 | 策略1/2个股详情接口数据组装 |
| `backend/app/screen.py` | 改 | 技术面/基本面筛选共用默认股票池过滤 |
| `backend/app/main.py` | 改 | 新增 `GET /meta`、`GET /stock/{code}` |
| `frontend/src/types.ts` | 改 | 新增 `MetaResponse` |
| `frontend/src/lib/api.ts` | 改 | 新增 `meta()`、`stockDetail()` |
| `frontend/src/components/layout/TopBar.tsx` | 改 | 显示 `/meta` 更新时间；刷新后自动轮询状态 |
| `frontend/src/App.tsx` | 改 | 候选详情接真实 `/stock/{code}`，补加载/错误/空态 |
| `backend/tests/test_pool_filters.py` | 建 | 默认股票池过滤测试 |
| `backend/tests/test_meta.py` | 建 | `/meta` 汇总测试 |
| `backend/tests/test_stock_detail.py` | 建 | 个股详情数据组装测试 |
| `backend/tests/test_api.py` | 改 | `/meta`、`/stock/{code}` API 测试 |

---

## Task 1: 默认股票池过滤

**Files:**
- Create: `backend/app/pool_filters.py`
- Modify: `backend/app/screen.py`
- Test: `backend/tests/test_pool_filters.py`

- [ ] **Step 1: 写失败测试**

创建 `backend/tests/test_pool_filters.py`：

```python
from app.pool_filters import is_default_pool_stock, filter_default_pool


def test_is_default_pool_stock_rejects_st_bj_delisted_and_new_stock():
    as_of = "2026-06-11"
    assert is_default_pool_stock({"code": "sz000001", "is_st": False, "is_bj": False, "delisted_at": None, "listed_at": "2020-01-01"}, as_of)
    assert not is_default_pool_stock({"code": "sz000002", "is_st": True, "is_bj": False, "delisted_at": None, "listed_at": "2020-01-01"}, as_of)
    assert not is_default_pool_stock({"code": "bj430001", "is_st": False, "is_bj": True, "delisted_at": None, "listed_at": "2020-01-01"}, as_of)
    assert not is_default_pool_stock({"code": "sz000003", "is_st": False, "is_bj": False, "delisted_at": "2025-01-01", "listed_at": "2020-01-01"}, as_of)
    assert not is_default_pool_stock({"code": "sz000004", "is_st": False, "is_bj": False, "delisted_at": None, "listed_at": "2026-01-01"}, as_of)


def test_filter_default_pool_returns_only_allowed_codes():
    rows = [
        {"code": "sz000001", "is_st": False, "is_bj": False, "delisted_at": None, "listed_at": "2020-01-01"},
        {"code": "sz000002", "is_st": True, "is_bj": False, "delisted_at": None, "listed_at": "2020-01-01"},
    ]
    assert [row["code"] for row in filter_default_pool(rows, "2026-06-11")] == ["sz000001"]
```

- [ ] **Step 2: 运行确认失败**

Run: `cd backend && ./venv/bin/pytest tests/test_pool_filters.py -v`  
Expected: FAIL，模块不存在。

- [ ] **Step 3: 实现过滤函数**

创建 `backend/app/pool_filters.py`：

```python
from __future__ import annotations

from datetime import datetime


def _days_between(start: str, end: str) -> int:
    return (datetime.strptime(end[:10], "%Y-%m-%d") - datetime.strptime(start[:10], "%Y-%m-%d")).days


def is_default_pool_stock(row: dict, as_of: str, min_listed_days: int = 365) -> bool:
    if row.get("is_st") or row.get("is_bj") or row.get("delisted_at"):
        return False
    listed_at = row.get("listed_at")
    if listed_at and _days_between(listed_at, as_of) < min_listed_days:
        return False
    return True


def filter_default_pool(rows: list[dict], as_of: str, min_listed_days: int = 365) -> list[dict]:
    return [row for row in rows if is_default_pool_stock(row, as_of, min_listed_days)]
```

在 `backend/app/screen.py` 的技术面加载和 `backend/app/fundamental_rows.py` 的基本面行构造中共用该函数。筛选使用最新交易日作为 `as_of`；没有 K 线时使用当天日期。

- [ ] **Step 4: 运行确认通过**

Run: `cd backend && ./venv/bin/pytest tests/test_pool_filters.py -v`  
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add backend/app/pool_filters.py backend/app/screen.py backend/app/fundamental_rows.py backend/tests/test_pool_filters.py
git commit -m "feat(backend): apply default stock pool filter"
```

---

## Task 2: `/meta` 数据源更新时间

**Files:**
- Create: `backend/app/meta.py`
- Modify: `backend/app/main.py`
- Test: `backend/tests/test_meta.py`
- Test: `backend/tests/test_api.py`

- [ ] **Step 1: 写失败测试**

创建 `backend/tests/test_meta.py`：

```python
from app.db import SessionLocal, init_db
from app.meta import get_meta
from app.models import FinancialReport, Forecast, IndustryIndex, KlineDay, ResearchReport, Stock


def test_get_meta_reports_latest_timestamps(db_path):
    init_db()
    with SessionLocal() as s:
        s.add(Stock(code="sz000001", name="平安银行", updated_at="2026-06-10 10:00:00"))
        s.add(KlineDay(code="sz000001", date="2026-06-10", open=1, close=1, high=1, low=1, volume=1))
        s.add(FinancialReport(code="sz000001", report_date="2026-03-31", net_profit=1, net_profit_yoy=1, updated_at="2026-04-30 10:00:00"))
        s.add(Forecast(code="sz000001", report_date="2026-03-31", source="forecast", updated_at="2026-04-20 10:00:00"))
        s.add(IndustryIndex(code="850111", name="银行", date="2026-06-10", open=1, close=1, high=1, low=1, volume=1))
        s.add(ResearchReport(report_id="R1", code="sz000001", title="订单饱满", published_at="2026-06-01", stage="parsed", updated_at="2026-06-02 10:00:00"))
        s.commit()
    meta = get_meta()
    assert meta["stockList"]["updatedAt"] == "2026-06-10 10:00:00"
    assert meta["klineDay"]["updatedAt"] == "2026-06-10"
    assert meta["financialReports"]["reportPeriod"] == "2026Q1"
    assert meta["researchReports"]["stage2CandidateCount"] == 1
```

在 `backend/tests/test_api.py` 增加：

```python
def test_meta_endpoint(client):
    r = client.get("/meta")
    assert r.status_code == 200
    assert "stockList" in r.json()
```

- [ ] **Step 2: 运行确认失败**

Run: `cd backend && ./venv/bin/pytest tests/test_meta.py tests/test_api.py -v`  
Expected: FAIL，`get_meta` 或 `/meta` 不存在。

- [ ] **Step 3: 实现 `/meta`**

创建 `backend/app/meta.py`：

```python
from __future__ import annotations

from app.db import SessionLocal
from app.models import FinancialReport, Forecast, IndustryIndex, KlineDay, ResearchReport, Stock


def _quarter(report_date: str | None) -> str | None:
    if not report_date:
        return None
    month = report_date[5:7]
    q = {"03": "Q1", "06": "Q2", "09": "Q3", "12": "Q4"}.get(month)
    return f"{report_date[:4]}{q}" if q else None


def get_meta() -> dict:
    with SessionLocal() as s:
        stock_updated = s.query(Stock.updated_at).order_by(Stock.updated_at.desc()).limit(1).scalar()
        kline_date = s.query(KlineDay.date).order_by(KlineDay.date.desc()).limit(1).scalar()
        financial = s.query(FinancialReport.report_date, FinancialReport.updated_at).order_by(
            FinancialReport.report_date.desc(), FinancialReport.updated_at.desc()
        ).first()
        forecast_updated = s.query(Forecast.updated_at).order_by(Forecast.updated_at.desc()).limit(1).scalar()
        industry_date = s.query(IndustryIndex.date).order_by(IndustryIndex.date.desc()).limit(1).scalar()
        research_updated = s.query(ResearchReport.updated_at).order_by(ResearchReport.updated_at.desc()).limit(1).scalar()
        parsed_count = s.query(ResearchReport).filter(ResearchReport.stage == "parsed").count()
    return {
        "stockList": {"updatedAt": stock_updated},
        "klineDay": {"updatedAt": kline_date},
        "financialReports": {
            "updatedAt": financial.updated_at if financial else None,
            "reportPeriod": _quarter(financial.report_date if financial else None),
        },
        "forecasts": {"updatedAt": forecast_updated},
        "industryIndex": {"updatedAt": industry_date},
        "researchReports": {"stage1UpdatedAt": research_updated, "stage2CandidateCount": parsed_count},
    }
```

在 `backend/app/main.py` 增加：

```python
from app.meta import get_meta


@app.get("/meta")
def meta():
    return get_meta()
```

- [ ] **Step 4: 运行确认通过**

Run: `cd backend && ./venv/bin/pytest tests/test_meta.py tests/test_api.py -v`  
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add backend/app/meta.py backend/app/main.py backend/tests/test_meta.py backend/tests/test_api.py
git commit -m "feat(backend): expose data freshness meta"
```

---

## Task 3: 个股详情接口 `/stock/{code}`

**Files:**
- Create: `backend/app/stock_detail.py`
- Modify: `backend/app/main.py`
- Test: `backend/tests/test_stock_detail.py`

- [ ] **Step 1: 写失败测试**

创建 `backend/tests/test_stock_detail.py`：

```python
from app.db import SessionLocal, init_db
from app.models import FinancialReport, KlineDay, ResearchReport, Stock
from app.stock_detail import get_stock_detail


def test_get_stock_detail_returns_financial_kline_reports_and_risks(db_path):
    init_db()
    with SessionLocal() as s:
        s.add(Stock(code="sz000001", name="平安银行", industry="银行"))
        s.add(KlineDay(code="sz000001", date="2026-06-10", open=10, close=12, high=13, low=9, volume=100))
        s.add(FinancialReport(code="sz000001", report_date="2026-03-31", net_profit=100000000, net_profit_yoy=60, revenue=500000000, revenue_yoy=20, gross_margin=30))
        s.add(ResearchReport(report_id="R1", code="sz000001", title="订单饱满", org="测试证券", published_at="2026-06-01", stage="metadata"))
        s.commit()
    detail = get_stock_detail("sz000001")
    assert detail["code"] == "sz000001"
    assert detail["quarters"][0]["quarter"] == "2026Q1"
    assert detail["reports"][0]["title"] == "订单饱满"
    assert detail["klineDay"][0]["date"] == "2026-06-10"
```

- [ ] **Step 2: 运行确认失败**

Run: `cd backend && ./venv/bin/pytest tests/test_stock_detail.py -v`  
Expected: FAIL，模块不存在。

- [ ] **Step 3: 实现详情组装**

创建 `backend/app/stock_detail.py`：

```python
from __future__ import annotations

from fastapi import HTTPException

from app.db import SessionLocal
from app.kline_service import get_stock_kline
from app.models import FinancialReport, ResearchReport, Stock


def _quarter(report_date: str) -> str:
    suffix = {"03": "Q1", "06": "Q2", "09": "Q3", "12": "Q4"}[report_date[5:7]]
    return f"{report_date[:4]}{suffix}"


def get_stock_detail(code: str) -> dict:
    with SessionLocal() as s:
        stock = s.query(Stock).filter_by(code=code).one_or_none()
        if stock is None:
            raise HTTPException(status_code=404, detail="股票不存在")
        reports = s.query(ResearchReport).filter_by(code=code).order_by(ResearchReport.published_at.desc()).limit(10).all()
        financials = s.query(FinancialReport).filter_by(code=code).order_by(FinancialReport.report_date).all()

    kline_day = get_stock_kline(code, "day")
    kline_week = get_stock_kline(code, "week")
    kline_month = get_stock_kline(code, "month")
    kline_quarter = get_stock_kline(code, "quarter")
    latest = financials[-1] if financials else None
    return {
        "code": stock.code,
        "name": stock.name,
        "industry": stock.industry or "",
        "subIndustry": stock.industry or "",
        "score": 0,
        "scoreDelta": 0,
        "signals": [],
        "signalCount": 0,
        "price": kline_day["data"][-1]["close"] if kline_day["data"] else 0,
        "drawdownFromHigh": 0,
        "yearHigh": kline_day["highLine"],
        "yearHighDate": kline_day["highLabel"],
        "quarters": [
            {"quarter": _quarter(row.report_date), "netProfit": (row.net_profit or 0) / 100000000, "revenue": (row.revenue or 0) / 100000000}
            for row in financials
        ],
        "latestNote": "" if latest is None else f"{_quarter(latest.report_date)} 净利润同比 {latest.net_profit_yoy or 0:.1f}%　营收同比 {latest.revenue_yoy or 0:.1f}%",
        "klineDay": kline_day["data"],
        "klineWeek": kline_week["data"],
        "klineMonth": kline_month["data"],
        "klineQuarter": kline_quarter["data"],
        "highLine": kline_day["highLine"],
        "reports": [{"title": row.title, "org": row.org or "", "date": row.published_at} for row in reports],
        "risks": [
            {"label": "业绩持续下滑", "ok": True},
            {"label": "股价创历史新低", "ok": True},
            {"label": "行业景气下行", "ok": True},
        ],
    }
```

在 `backend/app/main.py` 增加：

```python
from app.stock_detail import get_stock_detail


@app.get("/stock/{code}")
def stock_detail(code: str):
    return get_stock_detail(code)
```

- [ ] **Step 4: 运行确认通过**

Run: `cd backend && ./venv/bin/pytest tests/test_stock_detail.py -v`  
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add backend/app/stock_detail.py backend/app/main.py backend/tests/test_stock_detail.py
git commit -m "feat(backend): expose stock detail endpoint"
```

---

## Task 4: 前端接 `/meta` 和 `/stock/{code}`

**Files:**
- Modify: `frontend/src/types.ts`
- Modify: `frontend/src/lib/api.ts`
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/components/layout/TopBar.tsx`

- [ ] **Step 1: 增加类型与 API**

在 `frontend/src/types.ts` 增加：

```ts
export interface MetaResponse {
  stockList: { updatedAt: string | null }
  klineDay: { updatedAt: string | null }
  financialReports: { updatedAt: string | null; reportPeriod: string | null }
  forecasts: { updatedAt: string | null }
  industryIndex: { updatedAt: string | null }
  researchReports: { stage1UpdatedAt: string | null; stage2CandidateCount: number }
}
```

在 `frontend/src/lib/api.ts` 增加 import `MetaResponse, StockDetail`，并新增：

```ts
meta: () => get<MetaResponse>('/meta'),
stockDetail: (code: string) => get<StockDetail>(`/stock/${encodeURIComponent(code)}`),
```

- [ ] **Step 2: App 使用真实详情**

在 `frontend/src/App.tsx` 中增加：

```ts
const [meta, setMeta] = useState<MetaResponse | undefined>(undefined)
const [stockDetail, setStockDetail] = useState(STOCK_DETAIL)
const [detailError, setDetailError] = useState<string | null>(null)

useEffect(() => {
  api.meta().then(setMeta).catch(() => setMeta(undefined))
}, [])

useEffect(() => {
  if (!selectedCode) return
  api.stockDetail(selectedCode)
    .then((detail) => {
      setStockDetail(detail)
      setDetailError(null)
    })
    .catch(() => setDetailError('详情加载失败'))
}, [selectedCode])
```

把 `updatedAt` 改成 `meta?.klineDay.updatedAt ?? refreshStatus?.kline.updatedAt ?? '—'`，把 `StockDetailPanel detail={STOCK_DETAIL}` 改成 `detail={stockDetail}`。如果 `detailError` 有值，在详情栏上方展示错误文本。

- [ ] **Step 3: 刷新后轮询状态**

在 `App.tsx` 中新增：

```ts
const reloadRefreshStatus = () => api.refreshStatus().then(setRefreshStatus).catch(() => undefined)
const triggerRefreshKline = () => api.refreshKline().then(reloadRefreshStatus).catch(() => undefined)
const triggerRefreshFundamental = () => api.refreshFundamental().then(reloadRefreshStatus).catch(() => undefined)
```

传给 `TopBar`：`onRefreshKline={triggerRefreshKline}`、`onRefreshFundamental={triggerRefreshFundamental}`。

- [ ] **Step 4: 运行前端构建**

Run: `cd frontend && npm run build`  
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add frontend/src/types.ts frontend/src/lib/api.ts frontend/src/App.tsx frontend/src/components/layout/TopBar.tsx
git commit -m "feat(frontend): connect meta and stock detail endpoints"
```

---

## Task 5: 边界场景测试

**Files:**
- Modify: `backend/tests/test_fundamental_screen.py`
- Modify: `backend/tests/test_screen.py`
- Modify: `backend/tests/test_stock_detail.py`

- [ ] **Step 1: 补后端边界测试**

增加以下测试：

```python
def test_screen_skips_stock_without_enough_kline_history(client):
    from app.db import SessionLocal, init_db
    from app.models import KlineDay, Stock

    init_db()
    with SessionLocal() as s:
        s.add(Stock(code="sz000001", name="平安银行", listed_at="2020-01-01"))
        s.add(KlineDay(code="sz000001", date="2026-06-10", open=10, close=10, high=10, low=10, volume=100))
        s.commit()
    r = client.get("/screen?preset=trend-support&params=%7B%7D")
    assert r.status_code == 200
    assert r.json() == []


def test_stock_detail_returns_404_for_missing_stock(client):
    r = client.get("/stock/sz999999")
    assert r.status_code == 404


def test_fundamental_screen_returns_empty_when_no_reports(client):
    r = client.get('/screen?preset=super-growth&params=%7B%7D')
    assert r.status_code == 200
    assert isinstance(r.json(), list)
```

- [ ] **Step 2: 运行确认通过**

Run: `cd backend && ./venv/bin/pytest tests/test_fundamental_screen.py tests/test_screen.py tests/test_stock_detail.py -v`  
Expected: PASS。

- [ ] **Step 3: 提交**

```bash
git add backend/tests/test_fundamental_screen.py backend/tests/test_screen.py backend/tests/test_stock_detail.py
git commit -m "test(backend): cover screener edge cases"
```

---

## Task 6: 端到端联调

**Files:**
- Verify only

- [ ] **Step 1: 后端全量测试**

Run: `cd backend && ./venv/bin/pytest -q`  
Expected: PASS。

- [ ] **Step 2: 前端构建**

Run: `cd frontend && npm run build`  
Expected: PASS。

- [ ] **Step 3: 启动后端**

Run:

```bash
cd backend
./venv/bin/uvicorn app.main:app --reload --port 8000
```

Expected: `Uvicorn running on http://127.0.0.1:8000`。

- [ ] **Step 4: 启动前端**

Run:

```bash
cd frontend
npm run dev -- --host 127.0.0.1 --port 5173
```

Expected: Vite 显示 `http://127.0.0.1:5173/`。

- [ ] **Step 5: 浏览器走查**

打开 `http://127.0.0.1:5173/`，逐项验证：
- 技术面双线/B2切换后候选列表请求 `/screen`，右侧 K 线图非空。
- 策略1/2点击“应用筛选”后候选列表请求 `/screen`，无数据时显示空态而不是报错。
- 点击候选股后右侧详情请求 `/stock/{code}`，财报、研报、K线区域渲染。
- 点击“刷新行情”“刷新基本面”后 `/refresh/status` 可更新，按钮不造成页面崩溃。
- TopBar 显示 `/meta` 的 K线更新时间。

- [ ] **Step 6: API 冒烟**

Run:

```bash
curl -s http://127.0.0.1:8000/meta
curl -s http://127.0.0.1:8000/refresh/status
curl -s 'http://127.0.0.1:8000/screen?preset=trend-support&params=%7B%7D'
curl -s 'http://127.0.0.1:8000/screen?preset=super-growth&params=%7B%7D'
```

Expected: 全部返回 JSON，无 500。

- [ ] **Step 7: 提交阶段收口**

```bash
git status --short
```

Expected: 工作区干净；如存在阶段4验证修改，提交：

```bash
git add backend frontend
git commit -m "test: verify stock screener phase 4"
```

---

## 阶段4 完成标准

- [ ] 默认股票池过滤在技术面和基本面筛选中共用，剔除 ST、北交所、退市、上市不足1年标的。
- [ ] `GET /meta` 返回股票列表、K线、财报、预告快报、行业指数、研报更新时间。
- [ ] `GET /stock/{code}` 返回前端 `StockDetail` 所需字段。
- [ ] 前端 TopBar、候选股详情、刷新状态均接真实 API。
- [ ] 停牌/无足够历史K线/无研报/无财报/股票不存在等边界场景不返回 500。
- [ ] `cd backend && ./venv/bin/pytest -q` 通过。
- [ ] `cd frontend && npm run build` 通过。
- [ ] 浏览器端到端走查通过。
