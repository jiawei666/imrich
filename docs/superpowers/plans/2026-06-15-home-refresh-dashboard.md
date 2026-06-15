# 首页数据更新看板 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 新增"首页"集中展示全部 7 个数据更新任务的状态与触发入口，提供"一键更新全部"按依赖图分阶段并发执行，去掉 TopBar 原有刷新按钮和 activity pills。

**Architecture:** 后端拆分 `run_kline_refresh` 为 `run_stock_list_refresh`/`run_kline_data_refresh`，删除 `run_fundamental_refresh`，新增 `run_full_refresh` 三阶段编排；前端 App.tsx 瘦身为外壳，新增 HomePage（自含 SSE 订阅 + 7 卡片看板）和 ScreenPage（承接原选股逻辑），Sidebar 改为受控组件，删除 TopBar/Activity 相关代码。

**Tech Stack:** FastAPI + SQLAlchemy（后端）、React 19 + Vite + Tailwind v4 + lucide-react（前端）

---

## File Structure

| Action | Path | Responsibility |
|--------|------|----------------|
| Modify | `backend/app/refresh.py` | 拆分 run_kline_refresh → run_stock_list_refresh + run_kline_data_refresh；删除 run_fundamental_refresh；新增 run_full_refresh + STATE["all"] |
| Modify | `backend/app/main.py` | 新增 /refresh/stock-list、/refresh/all；改 /refresh/kline；删 /refresh/fundamental；全部 /refresh/* POST 加 409 守卫 |
| Modify | `backend/app/meta.py` | researchReports 增加 stage2UpdatedAt |
| Modify | `backend/tests/test_refresh.py` | 拆分为 run_stock_list_refresh / run_kline_data_refresh 各自的测试 |
| Modify | `backend/tests/test_refresh_fundamental.py` | 4 处 run_fundamental_refresh → run_full_refresh |
| Modify | `backend/tests/test_refresh_stream.py` | 快照断言增加 "all" 字段 |
| Modify | `backend/tests/test_api.py` | 端点测试同步调整 |
| Modify | `backend/tests/test_meta.py` | 增加 stage2UpdatedAt 断言 |
| Modify | `frontend/src/types.ts` | RefreshStatus 增加 all；删除 ActivityStatus/ActivityItem；MetaResponse.researchReports 增加 stage2UpdatedAt |
| Modify | `frontend/src/lib/api.ts` | 删 refreshFundamental；改 refreshKline；增 refreshStockList/refreshAll |
| Modify | `frontend/src/components/layout/Sidebar.tsx` | 改为受控组件，新增首页图标 |
| Modify | `frontend/src/components/technical/TechnicalScreenView.tsx` | 删除 onActivity prop 及调用 |
| Modify | `frontend/src/App.tsx` | 瘦身为外壳 |
| Create | `frontend/src/components/layout/PageHeader.tsx` | 共享头部组件（仅 title） |
| Create | `frontend/src/pages/HomePage.tsx` | 首页数据更新看板 |
| Create | `frontend/src/pages/ScreenPage.tsx` | 选股页（承接 App.tsx 选股逻辑） |
| Delete | `frontend/src/components/layout/TopBar.tsx` | 被 PageHeader 取代 |

---

### Task 1: 后端 — 拆分 run_kline_refresh 为两个独立函数

**Files:**
- Modify: `backend/app/refresh.py:94-211`
- Modify: `backend/tests/test_refresh.py`

- [ ] **Step 1: 编写 run_stock_list_refresh 和 run_kline_data_refresh 的失败测试**

在 `backend/tests/test_refresh.py` 中，将现有的 3 个 `run_kline_refresh` 测试拆分为 5 个：

```python
import pandas as pd

from app.db import init_db, SessionLocal
from app.models import Stock, KlineDay, KlineWeek
from app import refresh


def _fake_kline(code):
    dates = pd.date_range("2025-01-06", periods=10, freq="D")
    return pd.DataFrame({
        "date": dates,
        "open": [10.0 + i for i in range(10)],
        "close": [10.5 + i for i in range(10)],
        "high": [11.0 + i for i in range(10)],
        "low": [9.5 + i for i in range(10)],
        "volume": [1000.0] * 10,
    })


def test_stock_list_refresh_writes_stocks(db_path):
    init_db()
    refresh.reset_state()
    constituents = lambda: [
        {"code": "sz000001", "name": "平安银行", "market_cap": 5000.0},
        {"code": "sz300750", "name": "宁德时代", "market_cap": 10000.0},
    ]
    refresh.run_stock_list_refresh(constituents_fn=constituents)
    with SessionLocal() as s:
        assert s.query(Stock).count() == 2
    step = refresh.STATE["kline"].steps[0]
    assert step.status == "done"
    assert step.progress == 100


def test_stock_list_refresh_softdeletes_missing_stock(db_path):
    init_db()
    refresh.reset_state()
    with SessionLocal() as s:
        s.add(Stock(code="sz000002", name="退市股", is_st=False, is_bj=False))
        s.commit()
    constituents = lambda: [{"code": "sz000001", "name": "平安银行", "market_cap": 5000.0}]
    refresh.run_stock_list_refresh(constituents_fn=constituents)
    with SessionLocal() as s:
        assert s.get(Stock, "sz000002").delisted_at is not None
        assert s.get(Stock, "sz000001").delisted_at is None


def test_kline_data_refresh_writes_kline(db_path):
    init_db()
    refresh.reset_state()
    # 先写入股票列表
    with SessionLocal() as s:
        s.add(Stock(code="sz000001", name="平安银行"))
        s.commit()
    refresh.run_kline_data_refresh(kline_fn=_fake_kline)
    with SessionLocal() as s:
        assert s.query(KlineDay).filter_by(code="sz000001").count() == 10
        assert s.query(KlineWeek).filter_by(code="sz000001").count() >= 2
    step = refresh.STATE["kline"].steps[1]
    assert step.status == "done"
    assert step.progress == 100


def test_kline_data_refresh_marks_kline_group_done_when_both_steps_done(db_path):
    init_db()
    refresh.reset_state()
    with SessionLocal() as s:
        s.add(Stock(code="sz000001", name="平安银行"))
        s.commit()
    # 先完成 step0
    refresh.run_stock_list_refresh(constituents_fn=lambda: [{"code": "sz000001", "name": "平安银行", "market_cap": 5000.0}])
    assert refresh.STATE["kline"].steps[0].status == "done"
    # 再完成 step1，此时 kline 整体应标记 done
    refresh.run_kline_data_refresh(kline_fn=_fake_kline)
    assert refresh.STATE["kline"].status == "done"
    assert refresh.STATE["kline"].updatedAt is not None


def test_kline_data_refresh_is_full_refetch(db_path):
    init_db()
    refresh.reset_state()
    with SessionLocal() as s:
        s.add(Stock(code="sz000001", name="平安银行"))
        s.commit()
    refresh.run_kline_data_refresh(kline_fn=_fake_kline)
    refresh.run_kline_data_refresh(kline_fn=_fake_kline)
    with SessionLocal() as s:
        assert s.query(KlineDay).filter_by(code="sz000001").count() == 10
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd backend && source venv/bin/activate && pytest tests/test_refresh.py -v`
Expected: FAIL — `run_stock_list_refresh` 和 `run_kline_data_refresh` 不存在

- [ ] **Step 3: 实现 run_stock_list_refresh 和 run_kline_data_refresh**

在 `backend/app/refresh.py` 中，将 `run_kline_refresh`（第 94-211 行）替换为两个新函数。在替换之前，先在文件顶部确认已有 `from app.models import Stock` 等必要 import。

删除整个 `run_kline_refresh` 函数（第 94-211 行），在其位置插入：

```python
def run_stock_list_refresh(constituents_fn=None):
    """独立执行步骤1：股票列表 diff（分页抓取 + 写库 + 退市软删除）。"""
    if constituents_fn is None:
        from app.data.fetch_kline import get_constituents
        constituents_fn = "default"

    group = STATE["kline"]
    step = group.steps[0]
    if step.status == "running":
        return
    step.status = "running"
    step.error = None
    started = time.time()

    try:
        if constituents_fn == "default":
            from app.data.fetch_kline import get_constituents
            def _on_page(current, total):
                if total > 0:
                    step.total = total
                    step.done = current
                    step.progress = int(current / total * 100)
                    step.elapsed = _fmt(time.time() - started)
            constituents_fn = lambda: get_constituents(DEFAULT_MIN_CAP, progress_callback=_on_page)

        rows = constituents_fn()
        step.total = step.done = len(rows)
        step.progress = 100
        step.elapsed = _fmt(time.time() - started)
        now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        with SessionLocal() as s:
            current_codes = set()
            for r in tqdm(rows, desc="股票列表写库"):
                if _cancel_flag:
                    step.status = "done"
                    step.error = "服务关闭，任务中断"
                    return
                current_codes.add(r["code"])
                obj = s.get(Stock, r["code"])
                if obj is None:
                    obj = Stock(code=r["code"], is_bj=r["code"].startswith("bj"))
                    s.add(obj)
                obj.name = r["name"]
                obj.market_cap = r.get("market_cap")
                obj.is_bj = r["code"].startswith("bj")
                obj.delisted_at = None
                obj.updated_at = now
            for obj in s.query(Stock).all():
                if obj.code not in current_codes and obj.delisted_at is None:
                    obj.delisted_at = now
            s.commit()
        step.status = "done"
    except Exception as e:
        step.status = "error"
        step.error = str(e)
        raise


def run_kline_data_refresh(kline_fn=None):
    """独立执行步骤2：K线全量重抓 + 周/月/季K重采样。依赖步骤1完成（或已有股票数据）。"""
    if kline_fn is None:
        from app.data.fetch_kline import get_kline_ak_tx
        kline_fn = lambda code: get_kline_ak_tx(code, "", "")

    group = STATE["kline"]
    step = group.steps[1]
    if step.status == "running":
        return
    step.status = "running"
    step.error = None

    try:
        with SessionLocal() as s:
            active = [obj.code for obj in s.query(Stock).filter(Stock.delisted_at.is_(None)).all()]

        step.total = len(active)
        step.done = 0
        step.progress = 0
        t0 = time.time()
        for i, code in enumerate(tqdm(active, desc="K线数据刷新（日+周+月+季）"), 1):
            if _cancel_flag:
                step.status = "done"
                step.error = "服务关闭，任务中断"
                return
            df = kline_fn(code)
            with SessionLocal() as s:
                s.query(KlineDay).filter_by(code=code).delete()
                if df is not None and not df.empty:
                    s.bulk_save_objects([
                        KlineDay(code=code, date=pd.Timestamp(row.date).strftime("%Y-%m-%d"),
                                 open=float(row.open), close=float(row.close),
                                 high=float(row.high), low=float(row.low),
                                 volume=float(row.volume))
                        for row in df.itertuples(index=False)
                    ])
                for period, model in _PERIOD_MODELS.items():
                    s.query(model).filter_by(code=code).delete()
                    if df is not None and not df.empty:
                        rs = resample_ohlcv(df, period)
                        s.bulk_save_objects([
                            model(code=code, date=row.date, open=float(row.open),
                                  close=float(row.close), high=float(row.high),
                                  low=float(row.low), volume=float(row.volume))
                            for row in rs.itertuples(index=False)
                        ])
                s.commit()
            step.done = i
            step.progress = int(i / step.total * 100) if step.total else 100
            step.elapsed = _fmt(time.time() - t0)

        step.status = "done"
        # 两步都完成才标记 kline 整体 done
        if group.steps[0].status == "done":
            group.status = "done"
            group.updatedAt = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    except Exception as e:
        step.status = "error"
        step.error = str(e)
        raise
```

- [ ] **Step 4: 运行测试确认通过**

Run: `cd backend && source venv/bin/activate && pytest tests/test_refresh.py -v`
Expected: 5 passed

- [ ] **Step 5: 提交**

```bash
git add backend/app/refresh.py backend/tests/test_refresh.py
git commit -m "refactor: split run_kline_refresh into run_stock_list_refresh + run_kline_data_refresh"
```

---

### Task 2: 后端 — STATE 增加 "all" 分组 + 快照测试更新

**Files:**
- Modify: `backend/app/refresh.py:59-67`
- Modify: `backend/tests/test_refresh_stream.py`

- [ ] **Step 1: 编写失败测试**

在 `backend/tests/test_refresh_stream.py` 的 `test_get_status_snapshot` 中增加断言：

```python
def test_get_status_snapshot(client):
    refresh.reset_state()
    snapshot = refresh.get_status_snapshot()
    assert "kline" in snapshot
    assert "fundamental" in snapshot
    assert "all" in snapshot
    assert snapshot["kline"]["status"] == "idle"
    assert isinstance(snapshot["kline"]["steps"], list)
    assert len(snapshot["kline"]["steps"]) == 2
    assert len(snapshot["fundamental"]["steps"]) == 5
    assert len(snapshot["all"]["steps"]) == 0
    assert snapshot["all"]["status"] == "idle"
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd backend && source venv/bin/activate && pytest tests/test_refresh_stream.py::test_get_status_snapshot -v`
Expected: FAIL — `"all" not in snapshot`

- [ ] **Step 3: 在 _new_state() 中增加 "all" 分组**

修改 `backend/app/refresh.py` 第 59-67 行的 `_new_state()`：

```python
def _new_state():
    return {
        "kline": RefreshGroup(steps=[
            RefreshStep("股票列表"), RefreshStep("K线数据（日+周+月+季）")]),
        "fundamental": RefreshGroup(steps=[
            RefreshStep("财报数据"), RefreshStep("业绩预告快报"),
            RefreshStep("行业与指数数据"), RefreshStep("研报元数据"),
            RefreshStep("研报PDF解析")]),
        "all": RefreshGroup(),
    }
```

- [ ] **Step 4: 运行测试确认通过**

Run: `cd backend && source venv/bin/activate && pytest tests/test_refresh_stream.py -v`
Expected: 5 passed

- [ ] **Step 5: 提交**

```bash
git add backend/app/refresh.py backend/tests/test_refresh_stream.py
git commit -m "feat: add STATE['all'] RefreshGroup for full-refresh orchestration"
```

---

### Task 3: 后端 — 实现 run_full_refresh + 转换 test_refresh_fundamental.py

**Files:**
- Modify: `backend/app/refresh.py:575-616`
- Modify: `backend/tests/test_refresh_fundamental.py`

- [ ] **Step 1: 编写失败测试**

在 `backend/tests/test_refresh_fundamental.py` 中，将 4 处 `run_fundamental_refresh` 调用改为 `run_full_refresh`。

（1）第 13 行 `test_run_fundamental_refresh_marks_done` → `test_run_full_refresh_marks_done`：

```python
def test_run_full_refresh_marks_done(db_path):
    init_db()
    refresh.reset_state()

    refresh.run_full_refresh(
        financial_fn=lambda rd: [
            {
                "code": "sz000001",
                "report_date": "2025-03-31",
                "net_profit": 1.0e9,
                "net_profit_yoy": 60.0,
                "revenue": 5.0e9,
                "revenue_yoy": 30.0,
                "gross_margin": 25.0,
            }
        ],
        forecast_fn=lambda rd: [
            {
                "code": "sz000001",
                "report_date": "2025-03-31",
                "source": "forecast",
                "indicator": "净利润",
                "change_desc": "预增",
                "change_pct": 80.0,
                "forecast_value": 1.2e9,
                "prior_value": 6.6e8,
                "notice_date": "2025-04-10",
            }
        ],
        express_fn=lambda rd: [
            {
                "code": "sz000001",
                "report_date": "2025-03-31",
                "source": "express",
                "net_profit": 1.1e9,
                "net_profit_yoy": 65.0,
                "revenue": 5.2e9,
                "revenue_yoy": 32.0,
                "notice_date": "2025-04-12",
            }
        ],
        industries_fn=lambda: [{"code": "850111", "name": "银行", "parent_name": "金融"}],
        industry_hist_fn=lambda code: pd.DataFrame(
            [{"date": "2025-01-02", "open": 100.0, "close": 101.0, "high": 102.0, "low": 99.0, "volume": 1000.0}]
        ),
        constituents_fn=lambda code: ["sz000001"],
        industries_first_fn=lambda: [],
        index_constituents_fn=lambda code: [],
    )

    group = refresh.STATE["fundamental"]
    assert group.status == "done"
    assert group.updatedAt is not None
    assert all(step.progress == 100 for step in group.steps[:3])

    # run_full_refresh 额外维护 STATE["all"]
    all_group = refresh.STATE["all"]
    assert all_group.status == "done"
    assert all_group.updatedAt is not None

    with SessionLocal() as s:
        assert s.query(FinancialReport).count() == 1
        assert s.query(Forecast).count() == 2
        assert s.query(IndustryIndex).count() == 1
        stock = s.get(Stock, "sz000001")
        assert stock is not None
        assert stock.industry == "银行"
        assert stock.parent_industry == "金融"
```

（2）第 78 行 `test_run_fundamental_refresh_marks_error_on_exception` → `test_run_full_refresh_marks_error_on_exception`：

```python
def test_run_full_refresh_marks_error_on_exception(db_path):
    init_db()
    refresh.reset_state()

    def boom(rd):
        raise RuntimeError("boom")

    with pytest.raises(RuntimeError):
        refresh.run_full_refresh(
            financial_fn=boom,
            forecast_fn=lambda rd: [],
            express_fn=lambda rd: [],
            industries_fn=lambda: [],
            industry_hist_fn=lambda code: pd.DataFrame(),
            constituents_fn=lambda code: [],
            industries_first_fn=lambda: [],
            index_constituents_fn=lambda code: [],
        )
    assert refresh.STATE["fundamental"].status == "error"
    assert refresh.STATE["all"].status == "error"
```

（3）第 615 行 `test_run_fundamental_refresh_can_include_research_steps` → `test_run_full_refresh_can_include_research_steps`：

```python
def test_run_full_refresh_can_include_research_steps(db_path, tmp_path):
    init_db()
    refresh.reset_state()

    with SessionLocal() as s:
        s.add(Stock(code="sz000001", name="平安银行"))
        s.commit()

    target = tmp_path / "r1.pdf"
    target.write_bytes(b"fake")

    refresh.run_full_refresh(
        financial_fn=lambda rd: [
            {
                "code": "sz000001",
                "report_date": "2025-03-31",
                "net_profit": 1.0e9,
                "net_profit_yoy": 60.0,
                "revenue": 5.0e9,
                "revenue_yoy": 30.0,
                "gross_margin": 25.0,
            }
        ],
        forecast_fn=lambda rd: [],
        express_fn=lambda rd: [],
        industries_fn=lambda: [],
        industry_hist_fn=lambda code: pd.DataFrame(),
        constituents_fn=lambda code: [],
        industries_first_fn=lambda: [],
        index_constituents_fn=lambda code: [],
        research_meta_fn=lambda code: [
            {
                "report_id": "R1",
                "code": "sz000001",
                "name": "平安银行",
                "title": "订单饱满",
                "org": "测试证券",
                "published_at": datetime.now().strftime("%Y-%m-%d"),
                "summary": "",
                "pdf_url": "u1",
            }
        ],
        research_download_fn=lambda url, directory: str(target),
        research_parse_fn=lambda path: "订单饱满正文",
        research_directory=tmp_path,
    )

    group = refresh.STATE["fundamental"]
    assert group.steps[3].progress == 100
    assert group.steps[4].progress == 100
    assert refresh.STATE["all"].status == "done"
```

（4）第 707 行 `test_run_fundamental_refresh_populates_index_constituents` → `test_run_full_refresh_populates_index_constituents`：

```python
def test_run_full_refresh_populates_index_constituents(db_path):
    init_db()
    refresh.reset_state()

    refresh.run_full_refresh(
        financial_fn=lambda rd: [],
        forecast_fn=lambda rd: [],
        express_fn=lambda rd: [],
        industries_fn=lambda: [],
        industry_hist_fn=lambda code: pd.DataFrame(),
        constituents_fn=lambda code: [],
        industries_first_fn=lambda: [],
        index_constituents_fn=lambda code: ["sz000001"],
    )

    with SessionLocal() as s:
        rows = s.query(IndexConstituent).all()
        assert len(rows) > 0
        assert {r.stock_code for r in rows} == {"sz000001"}
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd backend && source venv/bin/activate && pytest tests/test_refresh_fundamental.py -v -k "run_full_refresh"`
Expected: FAIL — `run_full_refresh` 不存在

- [ ] **Step 3: 实现 run_full_refresh 并删除 run_fundamental_refresh**

在 `backend/app/refresh.py` 中，删除 `run_fundamental_refresh`（第 575-616 行），在其位置插入：

```python
def run_full_refresh(
    constituents_fn=None, kline_fn=None,
    financial_fn=None, forecast_fn=None, express_fn=None,
    industries_fn=None, industry_hist_fn=None, industry_constituents_fn=None,
    industries_first_fn=None, index_constituents_fn=None,
    research_meta_fn=None,
    research_download_fn=None, research_parse_fn=None,
    research_directory=None,
) -> None:
    """一键更新全部：按依赖图分三阶段并发执行 7 个任务。

    阶段1（并行）: ①股票列表 ③财报 ④预告快报 ⑤行业指数
    阶段2（①完成后并行）: ②K线数据 ⑥研报元数据
    阶段3（⑥完成后）: ⑦研报PDF解析
    """
    group = STATE["all"]
    if group.status == "running":
        return
    group.status = "running"
    group.error = None
    try:
        from concurrent.futures import ThreadPoolExecutor, as_completed
        with ThreadPoolExecutor(max_workers=7) as pool:
            all_futures = []
            # 阶段1：无依赖，并行提交
            stock_list_fut = pool.submit(run_stock_list_refresh, constituents_fn)
            all_futures += [
                stock_list_fut,
                pool.submit(run_financial_refresh, financial_fn),
                pool.submit(run_forecasts_refresh, forecast_fn, express_fn),
                pool.submit(run_industry_refresh, industries_fn, industry_hist_fn, industry_constituents_fn, industries_first_fn, index_constituents_fn),
            ]
            # 阶段2：① 完成后提交
            stock_list_fut.exception()  # 阻塞等待①（成功或失败都继续）
            research_meta_fut = pool.submit(run_research_meta_refresh, research_meta_fn)
            all_futures += [
                pool.submit(run_kline_data_refresh, kline_fn),
                research_meta_fut,
            ]
            # 阶段3：⑥ 完成后提交
            research_meta_fut.exception()
            all_futures.append(
                pool.submit(run_research_pdfs_refresh, research_download_fn, research_parse_fn, research_directory)
            )
            errors = []
            for fut in as_completed(all_futures):
                exc = fut.exception()
                if exc is not None:
                    errors.append(exc)
        if errors:
            raise errors[0]
        group.status = "done"
        group.updatedAt = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    except Exception as e:
        group.status = "error"
        group.error = str(e)
        raise
```

- [ ] **Step 4: 运行测试确认通过**

Run: `cd backend && source venv/bin/activate && pytest tests/test_refresh_fundamental.py tests/test_refresh.py tests/test_refresh_stream.py -v`
Expected: ALL passed

- [ ] **Step 5: 提交**

```bash
git add backend/app/refresh.py backend/tests/test_refresh_fundamental.py
git commit -m "feat: add run_full_refresh with 3-stage dependency-aware orchestration"
```

---

### Task 4: 后端 — meta.py 增加 stage2UpdatedAt + 测试

**Files:**
- Modify: `backend/app/meta.py`
- Modify: `backend/tests/test_meta.py`

- [ ] **Step 1: 编写失败测试**

在 `backend/tests/test_meta.py` 的 `test_get_meta_reports_latest_timestamps` 末尾增加断言：

```python
assert meta["researchReports"]["stage2UpdatedAt"] == "2026-06-02 10:00:00"
```

（测试中已有 `ResearchReport(report_id="R1", ..., stage="parsed", updated_at="2026-06-02 10:00:00")` 的种子数据。）

- [ ] **Step 2: 运行测试确认失败**

Run: `cd backend && source venv/bin/activate && pytest tests/test_meta.py -v`
Expected: FAIL — `KeyError: 'stage2UpdatedAt'`

- [ ] **Step 3: 实现 stage2UpdatedAt**

修改 `backend/app/meta.py`，在 `get_meta()` 函数中，`return` 之前增加查询：

```python
research_stage2_updated = (
    s.query(ResearchReport.updated_at)
    .filter(ResearchReport.stage == "parsed")
    .order_by(ResearchReport.updated_at.desc())
    .limit(1)
    .scalar()
)
```

并修改 return dict 中 `researchReports` 的值：

```python
"researchReports": {"stage1UpdatedAt": research_updated, "stage2UpdatedAt": research_stage2_updated, "stage2CandidateCount": parsed_count},
```

完整修改后的 `get_meta` 函数：

```python
def get_meta() -> dict:
    with SessionLocal() as s:
        stock_updated = s.query(Stock.updated_at).order_by(Stock.updated_at.desc()).limit(1).scalar()
        kline_date = s.query(KlineDay.date).order_by(KlineDay.date.desc()).limit(1).scalar()
        financial = (
            s.query(FinancialReport.report_date, FinancialReport.updated_at)
            .order_by(FinancialReport.report_date.desc(), FinancialReport.updated_at.desc())
            .first()
        )
        forecast_updated = s.query(Forecast.updated_at).order_by(Forecast.updated_at.desc()).limit(1).scalar()
        industry_date = s.query(IndustryIndex.date).order_by(IndustryIndex.date.desc()).limit(1).scalar()
        research_updated = s.query(ResearchReport.updated_at).order_by(ResearchReport.updated_at.desc()).limit(1).scalar()
        research_stage2_updated = (
            s.query(ResearchReport.updated_at)
            .filter(ResearchReport.stage == "parsed")
            .order_by(ResearchReport.updated_at.desc())
            .limit(1)
            .scalar()
        )
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
        "researchReports": {"stage1UpdatedAt": research_updated, "stage2UpdatedAt": research_stage2_updated, "stage2CandidateCount": parsed_count},
    }
```

- [ ] **Step 4: 运行测试确认通过**

Run: `cd backend && source venv/bin/activate && pytest tests/test_meta.py -v`
Expected: 1 passed

- [ ] **Step 5: 提交**

```bash
git add backend/app/meta.py backend/tests/test_meta.py
git commit -m "feat: add stage2UpdatedAt to meta endpoint for research PDF parsing"
```

---

### Task 5: 后端 — main.py 端点改动 + test_api.py 同步

**Files:**
- Modify: `backend/app/main.py:54-76`
- Modify: `backend/tests/test_api.py:57-73`

- [ ] **Step 1: 编写失败测试**

在 `backend/tests/test_api.py` 中：

替换 `test_refresh_kline_triggers_background`（第 57-64 行）：

```python
def test_refresh_kline_triggers_background(client, monkeypatch):
    refresh.reset_state()
    called = {}
    monkeypatch.setattr(refresh, "run_kline_data_refresh",
                        lambda *a, **k: called.setdefault("ran", True))
    r = client.post("/refresh/kline")
    assert r.status_code in (200, 202)
    assert called.get("ran") is True
```

替换 `test_refresh_fundamental_triggers_background`（第 67-73 行）为两个新测试：

```python
def test_refresh_stock_list_triggers_background(client, monkeypatch):
    refresh.reset_state()
    called = {}
    monkeypatch.setattr(refresh, "run_stock_list_refresh",
                        lambda *a, **k: called.setdefault("ran", True))
    r = client.post("/refresh/stock-list")
    assert r.status_code in (200, 202)
    assert called.get("ran") is True


def test_refresh_all_triggers_background(client, monkeypatch):
    refresh.reset_state()
    called = {}
    monkeypatch.setattr(refresh, "run_full_refresh",
                        lambda *a, **k: called.setdefault("ran", True))
    r = client.post("/refresh/all")
    assert r.status_code in (200, 202)
    assert called.get("ran") is True
```

新增 409 守卫测试：

```python
def test_refresh_rejected_when_all_running(client, monkeypatch):
    refresh.reset_state()
    refresh.STATE["all"].status = "running"
    r = client.post("/refresh/kline")
    assert r.status_code == 409
    r = client.post("/refresh/stock-list")
    assert r.status_code == 409
    r = client.post("/refresh/all")
    assert r.status_code == 409
    r = client.post("/refresh/fundamental/financial")
    assert r.status_code == 409
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd backend && source venv/bin/activate && pytest tests/test_api.py -v -k "refresh"`
Expected: FAIL — 新端点不存在，`run_kline_data_refresh` 未被 monkeypatch

- [ ] **Step 3: 修改 main.py 端点**

修改 `backend/app/main.py`：

（1）删除 `POST /refresh/fundamental`（第 64-76 行）

（2）替换 `POST /refresh/kline`（第 54-61 行）为：

```python
@app.post("/refresh/kline", status_code=202)
async def refresh_kline():
    if refresh.STATE["all"].status == "running":
        raise HTTPException(status_code=409, detail="全部更新中，请稍候")
    t = asyncio.create_task(asyncio.to_thread(refresh.run_kline_data_refresh))
    _refresh_tasks.add(t)
    t.add_done_callback(_refresh_tasks.discard)
    return {"status": "accepted"}
```

（3）在 `/refresh/kline` 后面新增两个端点：

```python
@app.post("/refresh/stock-list", status_code=202)
async def refresh_stock_list():
    if refresh.STATE["all"].status == "running":
        raise HTTPException(status_code=409, detail="全部更新中，请稍候")
    t = asyncio.create_task(asyncio.to_thread(refresh.run_stock_list_refresh))
    _refresh_tasks.add(t)
    t.add_done_callback(_refresh_tasks.discard)
    return {"status": "accepted"}


@app.post("/refresh/all", status_code=202)
async def refresh_all():
    if refresh.STATE["all"].status == "running":
        raise HTTPException(status_code=409, detail="全部更新中，请稍候")
    t = asyncio.create_task(
        asyncio.to_thread(
            refresh.run_full_refresh,
            research_meta_fn=fetch_research_metadata,
            research_download_fn=download_pdf,
            research_parse_fn=parse_pdf_text,
        )
    )
    _refresh_tasks.add(t)
    t.add_done_callback(_refresh_tasks.discard)
    return {"status": "accepted"}
```

（4）在 `refresh_fundamental_step`（第 89 行函数）开头增加 409 守卫：

```python
@app.post("/refresh/fundamental/{step}", status_code=202)
async def refresh_fundamental_step(step: str):
    """单步刷新基本面数据。"""
    # 全部更新中的守卫
    if refresh.STATE["all"].status == "running":
        raise HTTPException(status_code=409, detail="全部更新中，请稍候")
    # 依赖检查（先从数据库回填 STATE，避免进程重启后误判）
    # ... 后续代码不变
```

- [ ] **Step 4: 运行测试确认通过**

Run: `cd backend && source venv/bin/activate && pytest tests/test_api.py tests/test_refresh.py tests/test_refresh_fundamental.py tests/test_refresh_stream.py tests/test_meta.py -v`
Expected: ALL passed

- [ ] **Step 5: 提交**

```bash
git add backend/app/main.py backend/tests/test_api.py
git commit -m "feat: add /refresh/stock-list and /refresh/all endpoints, add 409 guard, remove /refresh/fundamental"
```

---

### Task 6: 前端 — types.ts 更新

**Files:**
- Modify: `frontend/src/types.ts`

- [ ] **Step 1: 更新 RefreshStatus 增加 all，删除 ActivityStatus/ActivityItem，更新 MetaResponse**

修改 `frontend/src/types.ts`：

（1）`RefreshStatus`（第 147-150 行）增加 `all`：

```typescript
export interface RefreshStatus {
  kline: RefreshGroup
  fundamental: RefreshGroup
  all: RefreshGroup
}
```

（2）删除 `ActivityStatus`（第 152-153 行）和 `ActivityItem`（第 155-160 行）：

删除以下内容：
```typescript
/** TopBar 实时动态：后台任务（如技术面筛选）的进行中/完成状态 */
export type ActivityStatus = 'running' | 'done' | 'error'

export interface ActivityItem {
  id: string
  label: string
  status: ActivityStatus
  detail?: string
}
```

（3）`MetaResponse.researchReports`（第 174 行）增加 `stage2UpdatedAt`：

```typescript
researchReports: { stage1UpdatedAt: string | null; stage2UpdatedAt: string | null; stage2CandidateCount: number }
```

- [ ] **Step 2: 验证构建**

Run: `cd frontend && npm run build`
Expected: 可能因其他文件引用已删除的类型而报错——将在后续 Task 修复

- [ ] **Step 3: 提交**

```bash
git add frontend/src/types.ts
git commit -m "refactor: add RefreshStatus.all, remove ActivityStatus/ActivityItem, add stage2UpdatedAt"
```

---

### Task 7: 前端 — api.ts 更新

**Files:**
- Modify: `frontend/src/lib/api.ts`

- [ ] **Step 1: 更新 api.ts**

修改 `frontend/src/lib/api.ts`：

（1）删除 `refreshFundamental`（第 42-46 行）

（2）修改 `refreshKline`（第 37-41 行），去掉 `reloadStockList` 参数：

```typescript
  refreshKline: async () => {
    const r = await fetch(`${BASE}/refresh/kline`, { method: 'POST' })
    if (!r.ok) {
      const body = await r.json().catch(() => ({}))
      throw new Error(body.detail || `${r.status}`)
    }
    return r.json()
  },
```

（3）在 `refreshKline` 后新增两个方法：

```typescript
  refreshStockList: async () => {
    const r = await fetch(`${BASE}/refresh/stock-list`, { method: 'POST' })
    if (!r.ok) {
      const body = await r.json().catch(() => ({}))
      throw new Error(body.detail || `${r.status}`)
    }
    return r.json()
  },
  refreshAll: async () => {
    const r = await fetch(`${BASE}/refresh/all`, { method: 'POST' })
    if (!r.ok) {
      const body = await r.json().catch(() => ({}))
      throw new Error(body.detail || `${r.status}`)
    }
    return r.json()
  },
```

- [ ] **Step 2: 验证构建**

Run: `cd frontend && npm run build`
Expected: 仍可能因 App.tsx 引用已删除方法而报错——将在后续 Task 修复

- [ ] **Step 3: 提交**

```bash
git add frontend/src/lib/api.ts
git commit -m "refactor: remove refreshFundamental, simplify refreshKline, add refreshStockList/refreshAll"
```

---

### Task 8: 前端 — 创建 PageHeader.tsx

**Files:**
- Create: `frontend/src/components/layout/PageHeader.tsx`

- [ ] **Step 1: 创建 PageHeader 组件**

创建 `frontend/src/components/layout/PageHeader.tsx`：

```tsx
export function PageHeader({ title }: { title: string }) {
  return (
    <header className="relative z-50 flex h-16 shrink-0 items-center border-b border-line bg-cream/80 px-6 backdrop-blur">
      <h1 className="text-[15px] font-semibold text-ink">{title}</h1>
    </header>
  )
}
```

- [ ] **Step 2: 验证构建**

Run: `cd frontend && npx tsc --noEmit`
Expected: 无类型错误

- [ ] **Step 3: 提交**

```bash
git add frontend/src/components/layout/PageHeader.tsx
git commit -m "feat: add PageHeader shared component"
```

---

### Task 9: 前端 — 创建 HomePage.tsx

**Files:**
- Create: `frontend/src/pages/HomePage.tsx`

- [ ] **Step 1: 创建 HomePage 组件**

创建 `frontend/src/pages/HomePage.tsx`：

```tsx
import { useEffect, useRef, useState } from 'react'
import { AlertCircle, Check, Loader2, RotateCw } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ProgressBar } from '@/components/ui/progress'
import { PageHeader } from '@/components/layout/PageHeader'
import { api } from '@/lib/api'
import type { MetaResponse, RefreshStatus, RefreshStep } from '@/types'

/* ─── 配置 ─── */

interface RefreshTaskConfig {
  key: string
  label: string
  step: (status: RefreshStatus) => RefreshStep
  updatedAt: (meta: MetaResponse) => string | null
  trigger: () => Promise<unknown>
  dependsOn?: string[]
}

const TASKS: RefreshTaskConfig[] = [
  {
    key: 'stock-list',
    label: '股票列表',
    step: (s) => s.kline.steps[0],
    updatedAt: (m) => m.stockList.updatedAt,
    trigger: () => api.refreshStockList(),
  },
  {
    key: 'kline-data',
    label: 'K线数据（日+周+月+季）',
    step: (s) => s.kline.steps[1],
    updatedAt: (m) => m.klineDay.updatedAt,
    trigger: () => api.refreshKline(),
    dependsOn: ['stock-list'],
  },
  {
    key: 'financial',
    label: '财报数据',
    step: (s) => s.fundamental.steps[0],
    updatedAt: (m) => m.financialReports.updatedAt,
    trigger: () => api.refreshFundamentalStep('financial'),
  },
  {
    key: 'forecasts',
    label: '业绩预告快报',
    step: (s) => s.fundamental.steps[1],
    updatedAt: (m) => m.forecasts.updatedAt,
    trigger: () => api.refreshFundamentalStep('forecasts'),
  },
  {
    key: 'industry',
    label: '行业与指数数据',
    step: (s) => s.fundamental.steps[2],
    updatedAt: (m) => m.industryIndex.updatedAt,
    trigger: () => api.refreshFundamentalStep('industry'),
  },
  {
    key: 'research-meta',
    label: '研报元数据',
    step: (s) => s.fundamental.steps[3],
    updatedAt: (m) => m.researchReports.stage1UpdatedAt,
    trigger: () => api.refreshFundamentalStep('research-meta'),
    dependsOn: ['stock-list'],
  },
  {
    key: 'research-pdfs',
    label: '研报PDF解析',
    step: (s) => s.fundamental.steps[4],
    updatedAt: (m) => m.researchReports.stage2UpdatedAt,
    trigger: () => api.refreshFundamentalStep('research-pdfs'),
    dependsOn: ['research-meta'],
  },
]

const STAGES = [
  { title: '阶段1 · 无依赖，可并行', keys: ['stock-list', 'financial', 'forecasts', 'industry'] },
  { title: '阶段2 · 依赖股票列表完成', keys: ['kline-data', 'research-meta'] },
  { title: '阶段3 · 依赖研报元数据完成', keys: ['research-pdfs'] },
]

/* ─── 辅助 ─── */

function isStepDone(step: RefreshStep): boolean {
  return step.status === 'done' || (step.status === 'idle' && step.total > 0)
}

function StatusBadge({ step }: { step: RefreshStep }) {
  if (step.status === 'running') {
    return (
      <span className="flex items-center gap-1.5 text-[12px] text-brand">
        <Loader2 className="size-3.5 animate-spin" />
        {step.progress}%
      </span>
    )
  }
  if (step.status === 'error') {
    return (
      <span className="flex items-center gap-1 text-[12px] text-down" title={step.error ?? undefined}>
        <AlertCircle className="size-3.5" />
        失败
      </span>
    )
  }
  if (isStepDone(step)) {
    return (
      <span className="flex items-center gap-1 text-[12px] text-up">
        <Check className="size-3.5" />
        已完成
      </span>
    )
  }
  return <span className="text-[12px] text-ink-faint">待执行</span>
}

/* ─── 任务卡片 ─── */

function TaskCard({
  config,
  status,
  meta,
  allRunning,
  onRefresh,
}: {
  config: RefreshTaskConfig
  status: RefreshStatus | undefined
  meta: MetaResponse | undefined
  allRunning: boolean
  onRefresh: (key: string) => void
}) {
  const step = status ? config.step(status) : { status: 'idle' as const, error: null, progress: 0, done: 0, total: 0 }
  const running = step.status === 'running'
  const updatedAt = meta ? config.updatedAt(meta) : null

  // 依赖检查
  let blockedDep: string | null = null
  if (config.dependsOn && status) {
    for (const depKey of config.dependsOn) {
      const depConfig = TASKS.find((t) => t.key === depKey)
      if (depConfig && !isStepDone(depConfig.step(status))) {
        blockedDep = depConfig.label
        break
      }
    }
  }

  const disabled = running || allRunning || !!blockedDep
  const title = allRunning
    ? '全部更新中，请稍候'
    : blockedDep
      ? `请先完成：${blockedDep}`
      : running
        ? '正在执行中'
        : `刷新${config.label}`

  return (
    <Card className="flex flex-col">
      <CardHeader>
        <CardTitle className="text-[13px]">{config.label}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col justify-between gap-3">
        <div className="flex items-center justify-between">
          <StatusBadge step={step} />
          {updatedAt && <span className="text-[11px] text-ink-faint tnum">{updatedAt}</span>}
        </div>
        {running && <ProgressBar value={step.progress} className="h-1.5" />}
        <Button
          variant="outline"
          size="sm"
          disabled={disabled}
          title={title}
          onClick={() => onRefresh(config.key)}
          className="self-start"
        >
          <RotateCw className={`size-3.5 ${running ? 'animate-spin' : ''}`} />
          刷新
        </Button>
      </CardContent>
    </Card>
  )
}

/* ─── 主组件 ─── */

export function HomePage() {
  const [status, setStatus] = useState<RefreshStatus | undefined>(undefined)
  const [meta, setMeta] = useState<MetaResponse | undefined>(undefined)

  const prevStatusRef = useRef<Record<string, string>>({})

  const reloadMeta = () => api.meta().then(setMeta).catch(() => setMeta(undefined))

  useEffect(() => {
    api.meta().then(setMeta).catch(() => setMeta(undefined))
  }, [])

  // SSE 订阅
  useEffect(() => {
    const close = api.refreshStatusStream((s) => {
      setStatus(s)
      // 任意 step 从 running 变为非 running 时刷新 meta
      const prev = prevStatusRef.current
      for (const groupKey of ['kline', 'fundamental', 'all'] as const) {
        const group = s[groupKey]
        for (let i = 0; i < group.steps.length; i++) {
          const stepKey = `${groupKey}.${i}`
          if (prev[stepKey] === 'running' && group.steps[i].status !== 'running') {
            reloadMeta()
          }
          prev[stepKey] = group.steps[i].status
        }
        // all 组本身
        const allKey = `${groupKey}._status`
        if (prev[allKey] === 'running' && group.status !== 'running') {
          reloadMeta()
        }
        prev[allKey] = group.status
      }
    })
    return close
  }, [])

  const allRunning = status?.all.status === 'running'

  const handleRefresh = async (key: string) => {
    const config = TASKS.find((t) => t.key === key)
    if (!config) return
    try {
      await config.trigger()
    } catch {
      // 409 等错误静默处理
    }
  }

  const handleRefreshAll = async () => {
    try {
      await api.refreshAll()
    } catch {
      // 409 等错误静默处理
    }
  }

  return (
    <div className="flex min-w-0 flex-1 flex-col">
      <PageHeader title="数据更新" />
      <main className="flex-1 overflow-y-auto p-6">
        {/* 摘要卡 */}
        <Card className="mb-6">
          <CardContent className="flex items-center justify-between py-4">
            <div className="flex items-center gap-3">
              {allRunning ? (
                <>
                  <Loader2 className="size-5 animate-spin text-brand" />
                  <span className="text-sm text-brand">全部更新中...</span>
                </>
              ) : status?.all.status === 'error' ? (
                <>
                  <AlertCircle className="size-5 text-down" />
                  <span className="text-sm text-down">{status.all.error ?? '更新失败'}</span>
                </>
              ) : (
                <span className="text-sm text-ink-soft">
                  {status?.all.updatedAt ? `上次一键更新于 ${status.all.updatedAt}` : '暂无一键更新记录'}
                </span>
              )}
            </div>
            <Button
              variant="primary"
              size="sm"
              disabled={allRunning}
              onClick={handleRefreshAll}
              title={allRunning ? '全部更新中，请稍候' : '一键更新全部'}
            >
              <RotateCw className={`size-3.5 ${allRunning ? 'animate-spin' : ''}`} />
              一键更新全部
            </Button>
          </CardContent>
        </Card>

        {/* 阶段列表 */}
        {STAGES.map((stage) => (
          <div key={stage.title} className="mb-5">
            <h2 className="mb-3 text-[12px] font-medium text-ink-soft">{stage.title}</h2>
            <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
              {TASKS.filter((t) => stage.keys.includes(t.key)).map((config) => (
                <TaskCard
                  key={config.key}
                  config={config}
                  status={status}
                  meta={meta}
                  allRunning={allRunning}
                  onRefresh={handleRefresh}
                />
              ))}
            </div>
          </div>
        ))}
      </main>
    </div>
  )
}
```

- [ ] **Step 2: 验证构建**

Run: `cd frontend && npx tsc --noEmit`
Expected: 可能因 App.tsx 还未更新而有引用错误——将在后续 Task 修复

- [ ] **Step 3: 提交**

```bash
git add frontend/src/pages/HomePage.tsx
git commit -m "feat: add HomePage with 7-card refresh dashboard"
```

---

### Task 10: 前端 — 创建 ScreenPage.tsx

**Files:**
- Create: `frontend/src/pages/ScreenPage.tsx`

- [ ] **Step 1: 创建 ScreenPage 组件**

创建 `frontend/src/pages/ScreenPage.tsx`：

```tsx
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { Card } from '@/components/ui/card'
import { FilterDrawer } from '@/components/ui/filter-drawer'
import { FilterPanel, type FilterState } from '@/components/screener/FilterPanel'
import { FundamentalCandidateListCard } from '@/components/screener/FundamentalCandidateListCard'
import { StockDetailPanel } from '@/components/detail/StockDetailPanel'
import { TechnicalScreenView, type TechnicalScreenViewHandle } from '@/components/technical/TechnicalScreenView'
import { PageHeader } from '@/components/layout/PageHeader'
import { STOCK_DETAIL } from '@/data/mock'
import { api } from '@/lib/api'
import { STRATEGY_CATEGORY, type Candidate, type IndexInfo, type MetaResponse, type Preset, type StockDetail, type StrategyId } from '@/types'

export interface ScreenPageHandle {
  toggleFilter: () => void
}

export const ScreenPage = forwardRef<ScreenPageHandle, { strategy: StrategyId }>(
  function ScreenPage({ strategy }, ref) {
    const [selectedCode, setSelectedCode] = useState<string>('')
    const [presets, setPresets] = useState<Preset[]>([])
    const [stockDetail, setStockDetail] = useState<StockDetail>(STOCK_DETAIL)
    const [detailError, setDetailError] = useState<string | null>(null)
    const [detailLoading, setDetailLoading] = useState(false)

    // 基本面专属状态
    const [filterOpen, setFilterOpen] = useState(false)
    const [paramValues, setParamValues] = useState<FilterState>({})
    const [screenItems, setScreenItems] = useState<Candidate[]>([])
    const [screenTotal, setScreenTotal] = useState(0)
    const [screenUpdatedAt, setScreenUpdatedAt] = useState<string | null>(null)
    const [screening, setScreening] = useState(false)
    const [indexList, setIndexList] = useState<IndexInfo[]>([])
    const [indexConstituentMap, setIndexConstituentMap] = useState<Record<string, Set<string>>>({})
    const [selectedCandidate, setSelectedCandidate] = useState<Candidate | null>(null)

    const technicalRef = useRef<TechnicalScreenViewHandle>(null)

    const isTechnical = STRATEGY_CATEGORY[strategy] === 'technical'
    const activePreset = presets.find((p) => p.id === strategy) ?? null

    useImperativeHandle(ref, () => ({
      toggleFilter: () => {
        if (isTechnical) {
          technicalRef.current?.toggleFilter()
        } else {
          setFilterOpen((v) => !v)
        }
      },
    }))

    useEffect(() => {
      api.presets().then(setPresets).catch(() => setPresets([]))
    }, [])

    // 基本面：运行筛选
    const runScreen = useCallback(async () => {
      setScreening(true)
      setFilterOpen(false)
      try {
        const res = await api.screenFundamentalResult(strategy, paramValues)
        setScreenItems(res.items)
        setScreenTotal(res.total)
        setScreenUpdatedAt(res.updatedAt)
        if (res.items[0]) {
          setSelectedCode(res.items[0].code)
          setSelectedCandidate(res.items[0])
        }
      } catch {
        setScreenItems([])
        setScreenTotal(0)
      } finally {
        setScreening(false)
      }
    }, [strategy, paramValues])

    // 基本面：加载上次结果 + 指数列表
    const loadFundamentalCached = useCallback(async (preset: Preset) => {
      const defaults = Object.fromEntries(preset.params.map((p) => [p.key, p.value]))
      setParamValues(defaults)
      setSelectedCandidate(null)
      setScreening(true)
      try {
        const res = await api.screenFundamentalResult(preset.id)
        setScreenItems(res.items)
        setScreenTotal(res.total)
        setScreenUpdatedAt(res.updatedAt)
        if (res.items[0]) {
          setSelectedCode(res.items[0].code)
          setSelectedCandidate(res.items[0])
        } else {
          setSelectedCode('')
        }
      } catch {
        setScreenItems([])
        setScreenTotal(0)
        setSelectedCode('')
      } finally {
        setScreening(false)
      }
    }, [])

    const loadIndexData = useCallback(async () => {
      try {
        const indices = await api.listIndices()
        setIndexList(indices)
        const map: Record<string, Set<string>> = {}
        for (const idx of indices) {
          map[idx.indexCode] = new Set(idx.stockCodes)
        }
        setIndexConstituentMap(map)
      } catch {
        setIndexList([])
      }
    }, [])

    // 切换策略时重置基本面状态
    useEffect(() => {
      if (!isTechnical && activePreset) {
        setFilterOpen(false)
        loadFundamentalCached(activePreset)
        loadIndexData()
      }
    }, [isTechnical, activePreset, loadFundamentalCached, loadIndexData])

    useEffect(() => {
      if (isTechnical || !selectedCode) return
      let cancelled = false
      setDetailLoading(true)
      api.stockDetail(selectedCode)
        .then((detail) => {
          if (cancelled) return
          setStockDetail(detail)
          setDetailError(null)
        })
        .catch(() => { if (!cancelled) setDetailError('详情加载失败') })
        .finally(() => { if (!cancelled) setDetailLoading(false) })
      return () => { cancelled = true }
    }, [isTechnical, selectedCode])

    return (
      <div className="flex min-w-0 flex-1 flex-col">
        <PageHeader title={activePreset?.name ?? ''} />
        {isTechnical ? (
          <TechnicalScreenView
            ref={technicalRef}
            strategy={strategy}
            preset={activePreset}
          />
        ) : (
          <div className="relative flex flex-1 overflow-hidden">
            <FilterDrawer open={filterOpen} onClose={() => setFilterOpen(false)} title={activePreset?.name ?? '筛选参数'}>
              {activePreset && (
                <FilterPanel
                  preset={activePreset}
                  paramValues={paramValues}
                  onParamChange={(k, v) => setParamValues((s) => ({ ...s, [k]: v }))}
                  onApply={runScreen}
                  loading={screening}
                />
              )}
            </FilterDrawer>

            <main className="grid flex-1 grid-cols-1 gap-5 overflow-hidden p-6 2xl:grid-cols-[minmax(0,0.85fr)_minmax(0,1fr)]">
              <div className="flex min-h-0 flex-col">
                <FundamentalCandidateListCard
                  items={screenItems}
                  total={screenTotal}
                  updatedAt={screenUpdatedAt}
                  selectedCode={selectedCode}
                  onSelectCode={(code, _name) => { setSelectedCode(code); setSelectedCandidate(screenItems.find(i => i.code === code) ?? null) }}
                  indices={indexList}
                  indexConstituentMap={indexConstituentMap}
                  showDrawdown={strategy === 'oversold-bluechip'}
                  loading={screening}
                />
              </div>
              <div className="overflow-y-auto">
                {selectedCode && detailError && <div className="mb-3 text-sm text-red-600">{detailError}</div>}
                {selectedCode ? (
                  <StockDetailPanel
                    detail={stockDetail}
                    candidate={selectedCandidate}
                    onClose={() => setSelectedCode('')}
                    loading={detailLoading}
                  />
                ) : (
                  <Card className="flex h-full items-center justify-center text-sm text-ink-faint">
                    请选择候选股票查看详情
                  </Card>
                )}
              </div>
            </main>
          </div>
        )}
      </div>
    )
  }
)
```

- [ ] **Step 2: 验证构建**

Run: `cd frontend && npx tsc --noEmit`
Expected: 可能因 App.tsx 还未更新而有引用错误

- [ ] **Step 3: 提交**

```bash
git add frontend/src/pages/ScreenPage.tsx
git commit -m "feat: add ScreenPage extracting screen logic from App.tsx"
```

---

### Task 11: 前端 — 更新 Sidebar.tsx 为受控组件

**Files:**
- Modify: `frontend/src/components/layout/Sidebar.tsx`

- [ ] **Step 1: 重写 Sidebar 为受控组件**

替换 `frontend/src/components/layout/Sidebar.tsx` 全部内容：

```tsx
import { LineChart, Home, Star, Layers, Activity, Settings } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Wordmark } from './Logo'

const NAV = [
  { key: 'home', label: '首页', icon: Home },
  { key: 'screen', label: '选股', icon: LineChart },
  { key: 'watchlist', label: '自选股', icon: Star },
  { key: 'strategy', label: '策略库', icon: Layers },
  { key: 'backtest', label: '回测', icon: Activity },
  { key: 'settings', label: '设置', icon: Settings },
]

export function Sidebar({
  active,
  onNavigate,
}: {
  active: 'home' | 'screen'
  onNavigate: (key: 'home' | 'screen') => void
}) {
  return (
    <aside className="flex w-[76px] shrink-0 flex-col items-center border-r border-line bg-paper/60 py-5">
      <nav className="flex flex-1 flex-col items-center gap-1.5">
        {NAV.map(({ key, label, icon: Icon }) => {
          const on = key === active
          return (
            <button
              key={key}
              onClick={() => {
                if (key === 'home' || key === 'screen') onNavigate(key)
              }}
              className={cn(
                'group flex w-[60px] cursor-pointer flex-col items-center gap-1 rounded-xl py-2 transition-colors duration-200',
                on
                  ? 'bg-brand-soft text-brand-strong'
                  : 'text-ink-faint hover:bg-paper-2 hover:text-ink'
              )}
            >
              <Icon className="size-[19px]" strokeWidth={on ? 2.2 : 1.8} />
              <span className="text-[11px] font-medium">{label}</span>
            </button>
          )
        })}
      </nav>
      <div className="mt-4 w-[60px]">
        <Wordmark className="w-full" />
      </div>
    </aside>
  )
}
```

- [ ] **Step 2: 验证构建**

Run: `cd frontend && npx tsc --noEmit`
Expected: Sidebar 不再被 App.tsx 正确调用，但类型本身无错

- [ ] **Step 3: 提交**

```bash
git add frontend/src/components/layout/Sidebar.tsx
git commit -m "refactor: Sidebar to controlled component with home/screen navigation"
```

---

### Task 12: 前端 — 重写 App.tsx 为瘦外壳

**Files:**
- Modify: `frontend/src/App.tsx`

- [ ] **Step 1: 重写 App.tsx**

替换 `frontend/src/App.tsx` 全部内容：

```tsx
import { useRef, useState } from 'react'
import { Sidebar } from '@/components/layout/Sidebar'
import { StrategySidebar } from '@/components/layout/StrategySidebar'
import { HomePage } from '@/pages/HomePage'
import { ScreenPage, type ScreenPageHandle } from '@/pages/ScreenPage'
import type { StrategyId } from '@/types'

export default function App() {
  const [view, setView] = useState<'home' | 'screen'>('home')
  const [strategy, setStrategy] = useState<StrategyId>('super-growth')
  const screenPageRef = useRef<ScreenPageHandle>(null)

  return (
    <div className="flex h-screen overflow-hidden bg-cream text-ink">
      <Sidebar active={view} onNavigate={setView} />
      {view === 'screen' && (
        <StrategySidebar
          strategy={strategy}
          onSelect={(s) => { setStrategy(s); setView('screen') }}
          onFilterClick={() => screenPageRef.current?.toggleFilter()}
        />
      )}
      {view === 'home' ? <HomePage /> : <ScreenPage ref={screenPageRef} strategy={strategy} />}
    </div>
  )
}
```

- [ ] **Step 2: 验证构建**

Run: `cd frontend && npm run build`
Expected: 构建成功（TopBar 引用已移除，但 TopBar.tsx 文件仍存在——不影响构建，下个 Task 删除）

- [ ] **Step 3: 提交**

```bash
git add frontend/src/App.tsx
git commit -m "refactor: App.tsx to thin shell with home/screen view switching"
```

---

### Task 13: 前端 — 删除 TopBar.tsx

**Files:**
- Delete: `frontend/src/components/layout/TopBar.tsx`

- [ ] **Step 1: 删除 TopBar.tsx**

Run: `rm frontend/src/components/layout/TopBar.tsx`

- [ ] **Step 2: 验证构建 + lint**

Run: `cd frontend && npm run build && npm run lint`
Expected: 构建成功，无 lint 错误

- [ ] **Step 3: 提交**

```bash
git add -A
git commit -m "chore: delete TopBar.tsx replaced by PageHeader"
```

---

### Task 14: 前端 — 清理 TechnicalScreenView.tsx 的 onActivity

**Files:**
- Modify: `frontend/src/components/technical/TechnicalScreenView.tsx`

- [ ] **Step 1: 移除 onActivity prop 及所有调用**

修改 `frontend/src/components/technical/TechnicalScreenView.tsx`：

（1）第 9 行 import 中删除 `ActivityStatus`：

```typescript
import type { Kline, KlineTimeframe, Preset, StrategyId, StockRow, ScreenSnapshotMeta, StockSortField, SortOrder } from '@/types'
```

（2）第 17-25 行组件签名中删除 `onActivity` prop：

```typescript
export const TechnicalScreenView = forwardRef<TechnicalScreenViewHandle, {
  strategy: StrategyId
  preset: Preset | null
}>(function TechnicalScreenView({
  strategy,
  preset,
}, ref) {
```

（3）删除第 183-184 行 `const label = ...` 和 `onActivity('technical-screen', 'running', label)` 调用：

```typescript
  const runScreenFn = useMemo(() => async () => {
    if (screeningRef.current) return
    screeningRef.current = true
    setScreening(true)
    setFilterOpen(false)
    try {
      const res = await api.screenResult({ preset: strategy, params: paramValues })
      setStockData(res.items)
      setStockTotal(res.total)
      setDataSource('screen')
      setSelectedHistoryDate(null)
      setSearchQuery('')
      if (res.items[0]) {
        setSelectedCode(res.items[0].code)
        setSelectedName(res.items[0].name)
      }
      // 刷新历史列表
      loadHistoryList()
    } catch {
      setStockData([])
      setStockTotal(0)
      setDataSource('screen')
    } finally {
      screeningRef.current = false
      setScreening(false)
    }
  }, [strategy, paramValues, preset, loadHistoryList])
```

（4）更新 useMemo 依赖数组：删除 `onActivity`，最终为 `[strategy, paramValues, preset, loadHistoryList]`

- [ ] **Step 2: 验证构建**

Run: `cd frontend && npm run build`
Expected: 构建成功

- [ ] **Step 3: 提交**

```bash
git add frontend/src/components/technical/TechnicalScreenView.tsx
git commit -m "refactor: remove onActivity prop from TechnicalScreenView"
```

---

### Task 15: 前端 — 全量验证 + CLAUDE.md 更新

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: 全量前端验证**

Run: `cd frontend && npm run build && npm run lint`
Expected: 构建成功，lint 无错误

- [ ] **Step 2: 全量后端验证**

Run: `cd backend && source venv/bin/activate && pytest -v`
Expected: ALL tests passed

- [ ] **Step 3: 更新 CLAUDE.md**

更新 `CLAUDE.md` 的"前端结构"段落（第 72-80 行），替换为：

```markdown
### 前端结构

`src/App.tsx` 是瘦身外壳，只持有跨页面共享状态：`view`（`'home' | 'screen'`，默认 `'home'`）和 `strategy`（`StrategyId`）。渲染结构：`Sidebar`（受控）+ `StrategySidebar`（仅 screen 视图）+ `HomePage` / `ScreenPage`。

- `src/pages/HomePage.tsx`：首页数据更新看板。自包含组件，自己订阅 `/refresh/status` SSE 并拉取 `/meta`。7 个任务卡片（配置数组 `TASKS` 驱动）+ 摘要卡（"一键更新全部"）。
- `src/pages/ScreenPage.tsx`：选股页，承接原 App.tsx 中选股相关的全部状态与 JSX。`forwardRef` 暴露 `toggleFilter()`。根据策略类别渲染 `TechnicalScreenView` 或基本面三段式布局。
- `src/components/layout/PageHeader.tsx`：共享头部组件（仅 `title: string`），替代原 `TopBar.tsx`。
- 所有后端调用集中在 `src/lib/api.ts`；类型定义在 `src/types.ts`。
- 刷新相关端点：`POST /refresh/stock-list`、`POST /refresh/kline`、`POST /refresh/all`、`POST /refresh/fundamental/{step}`。当 `STATE["all"].status == "running"` 时所有 `/refresh/*` POST 返回 409。
- UI 组件库为本地 shadcn 风格（`src/components/ui/`，基于 Radix + class-variance-authority），图表用 echarts-for-react。
```

- [ ] **Step 4: 提交**

```bash
git add CLAUDE.md
git commit -m "docs: update CLAUDE.md frontend structure and refresh endpoints"
```
