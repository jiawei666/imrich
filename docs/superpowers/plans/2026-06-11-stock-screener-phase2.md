# i'mRich 选股器 · 阶段2（基本面数据层）实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 落地基本面数据层——新增 `financial_reports`/`forecasts`/`industry_index` 三张表及其 akshare 增量抓取，并交付信号库中与本阶段相关的9个纯函数信号（业绩大增/业绩超预期/业绩创新高、股价创新高、行业指数创新高、低位错杀，及业绩持续下滑/股价创新低/行业景气下行3个避雷信号），为阶段3组装策略1/2打好地基。

**Architecture:** 复用阶段1已搭好的 SQLite + SQLAlchemy + FastAPI 骨架。新增 `app/data/fetch_fundamental.py` 封装 akshare 的 `stock_yjbb_em`（财报）/`stock_yjyg_em`（业绩预告）/`stock_yjkb_em`（业绩快报）/`sw_index_second_info`（申万二级行业列表）/`index_hist_sw`（申万指数历史）/`index_component_sw`（申万指数成分股）。新增 `app/signals.py` 存放纯函数信号（输入财报/行情序列，输出布尔值），不依赖 DB，用固定样本单测，覆盖阈值边界。`app/refresh.py` 新增 `run_fundamental_refresh`，对应 `/refresh/status` 中 `fundamental` 分组已有的前3个 step（财报数据/业绩预告快报/申万行业指数），沿用"按 `report_date` 判断这一期是否已抓取"的增量策略（与阶段1"按指数代码增量追加最新交易日"思路一致）。申万行业指数刷新时顺带通过 `index_component_sw` 把 `Stock.industry` 填充为申万二级行业名（与 `industry_index.name` 同源，为阶段3"板块效应"信号的 `industry_sw2` 维度打基础）。

**Tech Stack:** 沿用阶段1 venv（`backend/venv`，Python 3.9.19）与已安装依赖，无需新增包。测试继续严格 TDD（pytest，先写失败测试，akshare 调用全部 monkeypatch，不依赖真实网络）。本阶段**不涉及前端改动**。

---

## 文件结构

| 文件 | 操作 | 职责 |
|---|---|---|
| `backend/app/models.py` | 改 | 新增 `FinancialReport`/`Forecast`/`IndustryIndex` ORM 模型 |
| `backend/app/data/fetch_fundamental.py` | 建 | akshare 财报/预告快报/申万行业数据抓取封装 |
| `backend/app/signals.py` | 建 | 9个信号纯函数 + 单季净利润推导辅助函数 |
| `backend/app/refresh.py` | 改 | 新增 `run_fundamental_refresh` 及3个子步骤、`_latest_report_date` |
| `backend/app/main.py` | 改 | 新增 `POST /refresh/fundamental` |
| `backend/tests/test_models.py` | 改 | 新增三张表的建表/插入测试 |
| `backend/tests/test_fetch_fundamental.py` | 建 | akshare 抓取封装测试 |
| `backend/tests/test_signals.py` | 建 | 9个信号纯函数测试 |
| `backend/tests/test_refresh_fundamental.py` | 建 | `run_fundamental_refresh` 及子步骤测试 |
| `backend/tests/test_api.py` | 改 | 新增 `/refresh/fundamental` 端点测试 |

---

# 后端

## Task 1: ORM 模型 — `FinancialReport` / `Forecast` / `IndustryIndex`

**Files:**
- Modify: `backend/app/models.py`
- Test: `backend/tests/test_models.py`

- [ ] **Step 1: 写失败测试**

在 `backend/tests/test_models.py` 末尾追加：

```python
def test_fundamental_tables_created(db_path):
    from sqlalchemy import inspect
    from app.db import init_db, engine
    init_db()
    names = set(inspect(engine).get_table_names())
    assert {"financial_reports", "forecasts", "industry_index"} <= names


def test_insert_fundamental_rows(db_path):
    from app.db import init_db, SessionLocal
    from app.models import FinancialReport, Forecast, IndustryIndex
    init_db()
    with SessionLocal() as s:
        s.add(FinancialReport(code="sz000001", report_date="2025-03-31",
                               net_profit=1.0e9, net_profit_yoy=60.0,
                               revenue=5.0e9, revenue_yoy=30.0, gross_margin=25.0,
                               updated_at="2025-04-20 10:00:00"))
        s.add(Forecast(code="sz000001", report_date="2025-03-31", source="forecast",
                        indicator="净利润", change_desc="预增", change_pct=80.0,
                        forecast_value=1.2e9, prior_value=6.6e8,
                        notice_date="2025-04-10", updated_at="2025-04-20 10:00:00"))
        s.add(IndustryIndex(code="850111", name="银行", date="2025-01-02",
                             open=100.0, close=101.0, high=102.0, low=99.0, volume=1000.0))
        s.commit()
    with SessionLocal() as s:
        fr = s.query(FinancialReport).filter_by(code="sz000001").one()
        assert fr.net_profit_yoy == 60.0
        fc = s.query(Forecast).filter_by(code="sz000001").one()
        assert fc.source == "forecast" and fc.change_pct == 80.0
        ii = s.query(IndustryIndex).filter_by(code="850111").one()
        assert ii.name == "银行" and ii.close == 101.0
```

- [ ] **Step 2: 运行确认失败**

Run: `cd backend && ./venv/bin/pytest tests/test_models.py -v`
Expected: FAIL（`FinancialReport`/`Forecast`/`IndustryIndex` 未定义）。

- [ ] **Step 3: 实现模型**

在 `backend/app/models.py` 末尾追加：

```python
class FinancialReport(Base):
    """单期财报数据（来自 stock_yjbb_em，按 report_date 增量写入）。"""
    __tablename__ = "financial_reports"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    code: Mapped[str] = mapped_column(String, index=True)
    report_date: Mapped[str] = mapped_column(String)  # 'YYYY-MM-DD'，仅 03-31/06-30/09-30/12-31
    net_profit: Mapped[Optional[float]] = mapped_column(Float, nullable=True)  # 累计净利润，元
    net_profit_yoy: Mapped[Optional[float]] = mapped_column(Float, nullable=True)  # 累计净利润同比，%
    revenue: Mapped[Optional[float]] = mapped_column(Float, nullable=True)  # 累计营业总收入，元
    revenue_yoy: Mapped[Optional[float]] = mapped_column(Float, nullable=True)  # 累计营收同比，%
    gross_margin: Mapped[Optional[float]] = mapped_column(Float, nullable=True)  # 销售毛利率，%
    updated_at: Mapped[Optional[str]] = mapped_column(String, nullable=True)

    __table_args__ = (
        UniqueConstraint("code", "report_date", name="uq_financial_report"),
        Index("ix_financial_reports_code_date", "code", "report_date"),
    )


class Forecast(Base):
    """业绩预告（stock_yjyg_em, source='forecast'）/ 业绩快报（stock_yjkb_em, source='express'）。"""
    __tablename__ = "forecasts"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    code: Mapped[str] = mapped_column(String, index=True)
    report_date: Mapped[str] = mapped_column(String)  # 'YYYY-MM-DD'
    source: Mapped[str] = mapped_column(String)  # 'forecast' | 'express'
    indicator: Mapped[Optional[str]] = mapped_column(String, nullable=True)  # 预测指标（仅forecast）
    change_desc: Mapped[Optional[str]] = mapped_column(String, nullable=True)  # 业绩变动（仅forecast）
    change_pct: Mapped[Optional[float]] = mapped_column(Float, nullable=True)  # 业绩变动幅度，%（仅forecast）
    forecast_value: Mapped[Optional[float]] = mapped_column(Float, nullable=True)  # 预测数值（仅forecast）
    prior_value: Mapped[Optional[float]] = mapped_column(Float, nullable=True)  # 上年同期值（仅forecast）
    net_profit: Mapped[Optional[float]] = mapped_column(Float, nullable=True)  # 净利润，元（仅express）
    net_profit_yoy: Mapped[Optional[float]] = mapped_column(Float, nullable=True)  # 净利润同比，%（仅express）
    revenue: Mapped[Optional[float]] = mapped_column(Float, nullable=True)  # 营业收入，元（仅express）
    revenue_yoy: Mapped[Optional[float]] = mapped_column(Float, nullable=True)  # 营收同比，%（仅express）
    notice_date: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    updated_at: Mapped[Optional[str]] = mapped_column(String, nullable=True)

    __table_args__ = (
        UniqueConstraint("code", "report_date", "source", name="uq_forecast"),
        Index("ix_forecasts_code_date", "code", "report_date"),
    )


class IndustryIndex(Base):
    """申万二级行业指数日线（index_hist_sw，按指数代码增量追加最新交易日）。"""
    __tablename__ = "industry_index"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    code: Mapped[str] = mapped_column(String, index=True)  # 申万二级行业代码，如 '850111'
    name: Mapped[str] = mapped_column(String)  # 行业名称，如 '银行'
    date: Mapped[str] = mapped_column(String)  # 'YYYY-MM-DD'
    open: Mapped[float] = mapped_column(Float)
    close: Mapped[float] = mapped_column(Float)
    high: Mapped[float] = mapped_column(Float)
    low: Mapped[float] = mapped_column(Float)
    volume: Mapped[float] = mapped_column(Float)

    __table_args__ = (
        UniqueConstraint("code", "date", name="uq_industry_index"),
        Index("ix_industry_index_code_date", "code", "date"),
    )
```

- [ ] **Step 4: 运行确认通过**

Run: `cd backend && ./venv/bin/pytest tests/test_models.py -v`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
cd backend && git add app/models.py tests/test_models.py && git commit -m "feat(backend): 新增财报/预告快报/申万行业指数模型"
```

---

## Task 2: 财报抓取 — `fetch_financial_reports`

**Files:**
- Create: `backend/app/data/fetch_fundamental.py`
- Test: `backend/tests/test_fetch_fundamental.py`

- [ ] **Step 1: 写失败测试**

`backend/tests/test_fetch_fundamental.py`:

```python
import pandas as pd

from app.data import fetch_fundamental as ff


def test_fetch_financial_reports_parses_yjbb(monkeypatch):
    fake = pd.DataFrame({
        "股票代码": ["000001", "300750"],
        "股票简称": ["平安银行", "宁德时代"],
        "净利润-净利润": [1.0e9, 5.0e9],
        "净利润-同比增长": [60.0, 52.3],
        "营业总收入-营业总收入": [5.0e9, 2.0e10],
        "营业总收入-同比增长": [30.0, 28.7],
        "销售毛利率": [25.0, 22.1],
    })
    monkeypatch.setattr(ff.ak, "stock_yjbb_em", lambda date: fake)
    rows = ff.fetch_financial_reports("20250331")
    assert rows[0]["code"] == "sz000001"
    assert rows[0]["net_profit_yoy"] == 60.0
    assert rows[1]["code"] == "sz300750"
    assert rows[1]["revenue_yoy"] == 28.7


def test_fetch_financial_reports_handles_nan(monkeypatch):
    fake = pd.DataFrame({
        "股票代码": ["000001"],
        "股票简称": ["平安银行"],
        "净利润-净利润": [float("nan")],
        "净利润-同比增长": [float("nan")],
        "营业总收入-营业总收入": [5.0e9],
        "营业总收入-同比增长": [30.0],
        "销售毛利率": [float("nan")],
    })
    monkeypatch.setattr(ff.ak, "stock_yjbb_em", lambda date: fake)
    rows = ff.fetch_financial_reports("20250331")
    assert rows[0]["net_profit"] is None
    assert rows[0]["net_profit_yoy"] is None
    assert rows[0]["gross_margin"] is None
```

- [ ] **Step 2: 运行确认失败**

Run: `cd backend && ./venv/bin/pytest tests/test_fetch_fundamental.py -v`
Expected: FAIL（`app.data.fetch_fundamental` 不存在）。

- [ ] **Step 3: 实现**

`backend/app/data/fetch_fundamental.py`:

```python
from __future__ import annotations

import logging
from typing import List, Optional

import pandas as pd
import akshare as ak  # type: ignore

from app.data.fetch_kline import normalize_stock_code_for_sina

logger = logging.getLogger(__name__)


def _to_float(value: object) -> Optional[float]:
    try:
        if value is None or pd.isna(value):  # type: ignore[arg-type]
            return None
    except (TypeError, ValueError):
        pass
    try:
        return float(value)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return None


def _norm_code(raw: object) -> str:
    return normalize_stock_code_for_sina(str(raw).zfill(6))


def fetch_financial_reports(report_date: str) -> List[dict]:
    """report_date: 'YYYYMMDD'（仅 0331/0630/0930/1231 合法）。返回每只股票当期累计财报数据。"""
    df = ak.stock_yjbb_em(date=report_date)
    rows: List[dict] = []
    for _, r in df.iterrows():
        rows.append({
            "code": _norm_code(r["股票代码"]),
            "net_profit": _to_float(r["净利润-净利润"]),
            "net_profit_yoy": _to_float(r["净利润-同比增长"]),
            "revenue": _to_float(r["营业总收入-营业总收入"]),
            "revenue_yoy": _to_float(r["营业总收入-同比增长"]),
            "gross_margin": _to_float(r["销售毛利率"]),
        })
    return rows
```

- [ ] **Step 4: 运行确认通过**

Run: `cd backend && ./venv/bin/pytest tests/test_fetch_fundamental.py -v`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
cd backend && git add app/data/fetch_fundamental.py tests/test_fetch_fundamental.py && git commit -m "feat(backend): 财报数据抓取（stock_yjbb_em）"
```

---

## Task 3: 业绩预告 / 业绩快报抓取

**Files:**
- Modify: `backend/app/data/fetch_fundamental.py`
- Test: `backend/tests/test_fetch_fundamental.py`

- [ ] **Step 1: 写失败测试**

在 `backend/tests/test_fetch_fundamental.py` 末尾追加：

```python
def test_fetch_forecasts_parses_yjyg(monkeypatch):
    fake = pd.DataFrame({
        "股票代码": ["000001"],
        "股票简称": ["平安银行"],
        "预测指标": ["净利润"],
        "业绩变动": ["预增"],
        "业绩变动幅度": [80.0],
        "预测数值": [1.2e9],
        "上年同期值": [6.6e8],
        "公告日期": ["2025-04-10"],
    })
    monkeypatch.setattr(ff.ak, "stock_yjyg_em", lambda date: fake)
    rows = ff.fetch_forecasts("20250331")
    assert rows[0]["code"] == "sz000001"
    assert rows[0]["source"] == "forecast"
    assert rows[0]["change_pct"] == 80.0
    assert rows[0]["notice_date"] == "2025-04-10"


def test_fetch_express_reports_parses_yjkb(monkeypatch):
    fake = pd.DataFrame({
        "股票代码": ["000001"],
        "股票简称": ["平安银行"],
        "净利润-净利润": [1.1e9],
        "净利润-同比增长": [65.0],
        "营业收入-营业收入": [5.2e9],
        "营业收入-同比增长": [32.0],
        "公告日期": ["2025-04-12"],
    })
    monkeypatch.setattr(ff.ak, "stock_yjkb_em", lambda date: fake)
    rows = ff.fetch_express_reports("20250331")
    assert rows[0]["code"] == "sz000001"
    assert rows[0]["source"] == "express"
    assert rows[0]["net_profit_yoy"] == 65.0
    assert rows[0]["revenue_yoy"] == 32.0
```

- [ ] **Step 2: 运行确认失败**

Run: `cd backend && ./venv/bin/pytest tests/test_fetch_fundamental.py -v`
Expected: FAIL（`fetch_forecasts`/`fetch_express_reports` 不存在）。

- [ ] **Step 3: 实现**

在 `backend/app/data/fetch_fundamental.py` 末尾追加：

```python
def fetch_forecasts(report_date: str) -> List[dict]:
    """业绩预告（stock_yjyg_em）。"""
    df = ak.stock_yjyg_em(date=report_date)
    rows: List[dict] = []
    for _, r in df.iterrows():
        rows.append({
            "code": _norm_code(r["股票代码"]),
            "source": "forecast",
            "indicator": str(r["预测指标"]) if pd.notna(r["预测指标"]) else None,
            "change_desc": str(r["业绩变动"]) if pd.notna(r["业绩变动"]) else None,
            "change_pct": _to_float(r["业绩变动幅度"]),
            "forecast_value": _to_float(r["预测数值"]),
            "prior_value": _to_float(r["上年同期值"]),
            "notice_date": str(r["公告日期"]) if pd.notna(r["公告日期"]) else None,
        })
    return rows


def fetch_express_reports(report_date: str) -> List[dict]:
    """业绩快报（stock_yjkb_em）。"""
    df = ak.stock_yjkb_em(date=report_date)
    rows: List[dict] = []
    for _, r in df.iterrows():
        rows.append({
            "code": _norm_code(r["股票代码"]),
            "source": "express",
            "net_profit": _to_float(r["净利润-净利润"]),
            "net_profit_yoy": _to_float(r["净利润-同比增长"]),
            "revenue": _to_float(r["营业收入-营业收入"]),
            "revenue_yoy": _to_float(r["营业收入-同比增长"]),
            "notice_date": str(r["公告日期"]) if pd.notna(r["公告日期"]) else None,
        })
    return rows
```

- [ ] **Step 4: 运行确认通过**

Run: `cd backend && ./venv/bin/pytest tests/test_fetch_fundamental.py -v`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
cd backend && git add app/data/fetch_fundamental.py tests/test_fetch_fundamental.py && git commit -m "feat(backend): 业绩预告/快报抓取（stock_yjyg_em/stock_yjkb_em）"
```

---

## Task 4: 申万二级行业列表 / 指数历史 / 成分股抓取

**Files:**
- Modify: `backend/app/data/fetch_fundamental.py`
- Test: `backend/tests/test_fetch_fundamental.py`

- [ ] **Step 1: 写失败测试**

在 `backend/tests/test_fetch_fundamental.py` 末尾追加：

```python
def test_get_sw_industries(monkeypatch):
    fake = pd.DataFrame({"行业代码": ["850111", "850111"], "行业名称": ["银行", "银行"]}).iloc[[0]]
    fake = pd.DataFrame({"行业代码": ["850111", "850221"], "行业名称": ["银行", "白色家电"]})
    monkeypatch.setattr(ff.ak, "sw_index_second_info", lambda: fake)
    out = ff.get_sw_industries()
    assert out == [{"code": "850111", "name": "银行"}, {"code": "850221", "name": "白色家电"}]


def test_get_industry_index_hist(monkeypatch):
    fake = pd.DataFrame({
        "代码": ["850111", "850111"],
        "日期": ["2025-01-02", "2025-01-03"],
        "收盘": [101.0, 102.0],
        "开盘": [100.0, 101.0],
        "最高": [102.0, 103.0],
        "最低": [99.0, 100.0],
        "成交量": [1000.0, 1100.0],
        "成交额": [1.0e8, 1.1e8],
    })
    monkeypatch.setattr(ff.ak, "index_hist_sw", lambda symbol, period: fake)
    out = ff.get_industry_index_hist("850111")
    assert list(out.columns) == ["date", "open", "close", "high", "low", "volume"]
    assert out.iloc[0]["close"] == 101.0


def test_get_industry_index_hist_empty(monkeypatch):
    monkeypatch.setattr(ff.ak, "index_hist_sw",
                        lambda symbol, period: pd.DataFrame(
                            columns=["代码", "日期", "收盘", "开盘", "最高", "最低", "成交量", "成交额"]))
    out = ff.get_industry_index_hist("850111")
    assert out.empty
    assert list(out.columns) == ["date", "open", "close", "high", "low", "volume"]


def test_get_industry_constituents(monkeypatch):
    fake = pd.DataFrame({"证券代码": ["000001", "600000"], "证券名称": ["平安银行", "浦发银行"]})
    monkeypatch.setattr(ff.ak, "index_component_sw", lambda symbol: fake)
    out = ff.get_industry_constituents("850111")
    assert out == ["sz000001", "sh600000"]
```

- [ ] **Step 2: 运行确认失败**

Run: `cd backend && ./venv/bin/pytest tests/test_fetch_fundamental.py -v`
Expected: FAIL（`get_sw_industries`/`get_industry_index_hist`/`get_industry_constituents` 不存在）。

- [ ] **Step 3: 实现**

在 `backend/app/data/fetch_fundamental.py` 末尾追加：

```python
def get_sw_industries() -> List[dict]:
    """申万二级行业列表：[{code, name}]。"""
    df = ak.sw_index_second_info()
    return [{"code": str(r["行业代码"]), "name": str(r["行业名称"])} for _, r in df.iterrows()]


def get_industry_index_hist(code: str) -> pd.DataFrame:
    """单个申万指数的历史日线，列：date, open, close, high, low, volume。"""
    df = ak.index_hist_sw(symbol=code, period="day")
    if df.empty:
        return pd.DataFrame(columns=["date", "open", "close", "high", "low", "volume"])
    out = df.rename(columns={"日期": "date", "开盘": "open", "收盘": "close",
                              "最高": "high", "最低": "low", "成交量": "volume"})
    out["date"] = out["date"].astype(str)
    return out[["date", "open", "close", "high", "low", "volume"]].reset_index(drop=True)


def get_industry_constituents(code: str) -> List[str]:
    """该申万指数的成分股代码（带 sh/sz/bj 前缀）。"""
    df = ak.index_component_sw(symbol=code)
    return [_norm_code(c) for c in df["证券代码"]]
```

- [ ] **Step 4: 运行确认通过**

Run: `cd backend && ./venv/bin/pytest tests/test_fetch_fundamental.py -v`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
cd backend && git add app/data/fetch_fundamental.py tests/test_fetch_fundamental.py && git commit -m "feat(backend): 申万二级行业列表/指数历史/成分股抓取"
```

---

## Task 5: 信号纯函数（一）— 单季净利润推导 + 业绩大增 + 业绩创新高

**Files:**
- Create: `backend/app/signals.py`
- Test: `backend/tests/test_signals.py`

- [ ] **Step 1: 写失败测试**

`backend/tests/test_signals.py`:

```python
from app.signals import (
    compute_single_quarter_series,
    is_high_growth,
    is_profit_new_high,
)


def test_compute_single_quarter_series_derives_q2_q3_q4_by_diff():
    dates = ["2024-03-31", "2024-06-30", "2024-09-30", "2024-12-31", "2025-03-31"]
    cumulative = [10.0, 25.0, 45.0, 70.0, 15.0]
    out = compute_single_quarter_series(dates, cumulative)
    assert out == [10.0, 15.0, 20.0, 25.0, 15.0]


def test_compute_single_quarter_series_propagates_none():
    dates = ["2024-03-31", "2024-06-30"]
    cumulative = [10.0, None]
    assert compute_single_quarter_series(dates, cumulative) == [10.0, None]


def test_is_high_growth_threshold():
    assert is_high_growth(60.0) is True
    assert is_high_growth(50.0) is False  # 严格大于
    assert is_high_growth(40.0) is False
    assert is_high_growth(None) is False
    assert is_high_growth(120.0, threshold=100.0) is True


def test_is_profit_new_high():
    assert is_profit_new_high([10.0, 12.0, 15.0]) is True
    assert is_profit_new_high([10.0, 15.0, 12.0]) is False
    assert is_profit_new_high([10.0, None, 15.0]) is True  # 最新值15 = 历史(10,15)新高
    assert is_profit_new_high([]) is False
    assert is_profit_new_high([10.0, None]) is False  # 最新值缺失，无法判断
```

- [ ] **Step 2: 运行确认失败**

Run: `cd backend && ./venv/bin/pytest tests/test_signals.py -v`
Expected: FAIL（`app.signals` 不存在）。

- [ ] **Step 3: 实现**

`backend/app/signals.py`:

```python
from __future__ import annotations

from typing import List, Optional


def compute_single_quarter_series(
    report_dates: List[str], cumulative: List[Optional[float]],
) -> List[Optional[float]]:
    """累计值 -> 单季值：Q1（'-03-31'）直接取累计值；Q2/Q3/Q4 = 当期累计 - 上一期累计。

    要求 report_dates 按时间升序排列、与 cumulative 一一对应。
    """
    out: List[Optional[float]] = []
    for i, rd in enumerate(report_dates):
        if i == 0 or rd.endswith("-03-31"):
            out.append(cumulative[i])
        elif cumulative[i] is None or cumulative[i - 1] is None:
            out.append(None)
        else:
            out.append(cumulative[i] - cumulative[i - 1])
    return out


def is_high_growth(yoy_pct: Optional[float], threshold: float = 50.0) -> bool:
    """信号1：业绩大增——单季归母净利润同比增长 > 阈值（默认50%）。"""
    return yoy_pct is not None and yoy_pct > threshold


def is_profit_new_high(profit_series: List[Optional[float]]) -> bool:
    """信号3：业绩创新高——单季/TTM净利润 = 历史新高。"""
    if not profit_series or profit_series[-1] is None:
        return False
    history = [v for v in profit_series if v is not None]
    return profit_series[-1] >= max(history)
```

- [ ] **Step 4: 运行确认通过**

Run: `cd backend && ./venv/bin/pytest tests/test_signals.py -v`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
cd backend && git add app/signals.py tests/test_signals.py && git commit -m "feat(backend): 信号库——单季净利润推导/业绩大增/业绩创新高"
```

---

## Task 6: 信号纯函数（二）— 业绩超预期

**Files:**
- Modify: `backend/app/signals.py`
- Test: `backend/tests/test_signals.py`

- [ ] **Step 1: 写失败测试**

在 `backend/tests/test_signals.py` 末尾追加：

```python
from app.signals import is_beat_expectation_by_history, is_beat_expectation_by_forecast


def test_is_beat_expectation_by_history_uses_median():
    # 历史中枢（中位数）= 30；当期35 > 30 → True
    assert is_beat_expectation_by_history(35.0, [20.0, 30.0, 40.0]) is True
    assert is_beat_expectation_by_history(25.0, [20.0, 30.0, 40.0]) is False
    assert is_beat_expectation_by_history(35.0, []) is False
    assert is_beat_expectation_by_history(None, [20.0, 30.0]) is False


def test_is_beat_expectation_by_forecast_threshold():
    assert is_beat_expectation_by_forecast(80.0) is True
    assert is_beat_expectation_by_forecast(40.0) is False
    assert is_beat_expectation_by_forecast(None) is False
    assert is_beat_expectation_by_forecast(60.0, threshold=50.0) is True
```

- [ ] **Step 2: 运行确认失败**

Run: `cd backend && ./venv/bin/pytest tests/test_signals.py -v`
Expected: FAIL（`is_beat_expectation_by_history`/`is_beat_expectation_by_forecast` 不存在）。

- [ ] **Step 3: 实现**

在 `backend/app/signals.py` 末尾追加：

```python
def is_beat_expectation_by_history(
    current_yoy: Optional[float], history_yoys: List[Optional[float]],
) -> bool:
    """信号2（财报口径）：当期同比增速 > 历史同比增速中枢（中位数）。"""
    history = sorted(v for v in history_yoys if v is not None)
    if current_yoy is None or not history:
        return False
    mid = len(history) // 2
    if len(history) % 2 == 1:
        center = history[mid]
    else:
        center = (history[mid - 1] + history[mid]) / 2
    return current_yoy > center


def is_beat_expectation_by_forecast(change_pct: Optional[float], threshold: float = 50.0) -> bool:
    """信号2（预告/快报口径）：业绩变动幅度 > 阈值（默认50%）即视为超预期的代理判断。"""
    return change_pct is not None and change_pct > threshold
```

- [ ] **Step 4: 运行确认通过**

Run: `cd backend && ./venv/bin/pytest tests/test_signals.py -v`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
cd backend && git add app/signals.py tests/test_signals.py && git commit -m "feat(backend): 信号库——业绩超预期（财报口径+预告快报口径）"
```

---

## Task 7: 信号纯函数（三）— 股价/行业指数新高新低 + 低位错杀

**Files:**
- Modify: `backend/app/signals.py`
- Test: `backend/tests/test_signals.py`

- [ ] **Step 1: 写失败测试**

在 `backend/tests/test_signals.py` 末尾追加：

```python
from app.signals import (
    is_price_new_high,
    is_price_new_low,
    is_industry_index_new_high,
    is_oversold_quality,
)


def test_is_price_new_high_within_tolerance():
    # 历史最高100，当前97 -> 距高3% < 5% -> True
    assert is_price_new_high([80.0, 100.0, 97.0]) is True
    # 当前90 -> 距高10% > 5% -> False
    assert is_price_new_high([80.0, 100.0, 90.0]) is False
    # 当前刚好创新高
    assert is_price_new_high([80.0, 90.0, 100.0]) is True
    assert is_price_new_high([]) is False


def test_is_price_new_low():
    assert is_price_new_low([10.0, 9.0, 8.0]) is True
    assert is_price_new_low([10.0, 8.0, 9.0]) is False
    assert is_price_new_low([]) is False


def test_is_industry_index_new_high_strict():
    # 行业指数：严格新高（容差0）
    assert is_industry_index_new_high([100.0, 105.0, 110.0]) is True
    assert is_industry_index_new_high([100.0, 110.0, 105.0]) is False


def test_is_oversold_quality():
    # 一年高100，当前60 -> 回撤40% > 35%，且净利润同比 > 0 -> True
    closes = [100.0] + [60.0] * 10
    assert is_oversold_quality(closes, current_yoy=10.0) is True
    # 回撤不够
    closes2 = [100.0] + [70.0] * 10
    assert is_oversold_quality(closes2, current_yoy=10.0) is False
    # 业绩不行
    assert is_oversold_quality(closes, current_yoy=-5.0) is False
    assert is_oversold_quality(closes, current_yoy=None) is False
```

- [ ] **Step 2: 运行确认失败**

Run: `cd backend && ./venv/bin/pytest tests/test_signals.py -v`
Expected: FAIL（对应函数不存在）。

- [ ] **Step 3: 实现**

在 `backend/app/signals.py` 末尾追加：

```python
def is_near_high(series: List[float], tolerance: float = 0.0) -> bool:
    """最新值是否达到/接近历史最高值（tolerance=0.05 表示距高5%以内）。"""
    if not series:
        return False
    high = max(series)
    if high <= 0:
        return False
    return series[-1] >= high * (1 - tolerance)


def is_near_low(series: List[float], tolerance: float = 0.0) -> bool:
    """最新值是否达到/接近历史最低值。"""
    if not series:
        return False
    low = min(series)
    return series[-1] <= low * (1 + tolerance)


def is_price_new_high(closes: List[float], tolerance: float = 0.05) -> bool:
    """信号4：股价创历史新高/近一年新高（距高<5%）。"""
    return is_near_high(closes, tolerance)


def is_price_new_low(closes: List[float]) -> bool:
    """信号11（避雷）：股价创历史新低。"""
    return is_near_low(closes, tolerance=0.0)


def is_industry_index_new_high(closes: List[float]) -> bool:
    """信号7：申万行业指数创历史/阶段新高。"""
    return is_near_high(closes, tolerance=0.0)


def is_oversold_quality(
    closes: List[float], current_yoy: Optional[float], drawdown_threshold: float = 0.35,
) -> bool:
    """信号9（策略2硬过滤）：距一年高回撤 > 阈值（默认35%）且净利润同比 > 0。"""
    if not closes or current_yoy is None:
        return False
    high = max(closes)
    if high <= 0:
        return False
    drawdown = (high - closes[-1]) / high
    return drawdown > drawdown_threshold and current_yoy > 0
```

- [ ] **Step 4: 运行确认通过**

Run: `cd backend && ./venv/bin/pytest tests/test_signals.py -v`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
cd backend && git add app/signals.py tests/test_signals.py && git commit -m "feat(backend): 信号库——股价/行业指数新高新低+低位错杀"
```

---

## Task 8: 信号纯函数（四）— 避雷信号：业绩持续下滑 + 行业景气下行

**Files:**
- Modify: `backend/app/signals.py`
- Test: `backend/tests/test_signals.py`

- [ ] **Step 1: 写失败测试**

在 `backend/tests/test_signals.py` 末尾追加：

```python
from app.signals import is_profit_declining, is_industry_declining


def test_is_profit_declining_needs_two_consecutive_drops():
    # 60 -> 50 -> 30：连续两次下滑 -> True
    assert is_profit_declining([60.0, 50.0, 30.0]) is True
    # 30 -> 50 -> 60：持续上升 -> False
    assert is_profit_declining([30.0, 50.0, 60.0]) is False
    # 60 -> 70 -> 30：仅最后一次下滑 -> False（未连续两次）
    assert is_profit_declining([60.0, 70.0, 30.0]) is False
    # 数据不足
    assert is_profit_declining([60.0, 50.0]) is False
    assert is_profit_declining([]) is False


def test_is_profit_declining_custom_consecutive():
    assert is_profit_declining([80.0, 60.0, 40.0, 20.0], consecutive=3) is True
    assert is_profit_declining([80.0, 60.0, 65.0, 20.0], consecutive=3) is False


def test_is_industry_declining():
    # 当期增速为负 -> True
    assert is_industry_declining([10.0, -5.0]) is True
    # 增速仍为正但环比下行 -> True（"下行"）
    assert is_industry_declining([10.0, 5.0]) is True
    # 增速为正且上行 -> False
    assert is_industry_declining([5.0, 10.0]) is False
    assert is_industry_declining([]) is False
```

- [ ] **Step 2: 运行确认失败**

Run: `cd backend && ./venv/bin/pytest tests/test_signals.py -v`
Expected: FAIL（`is_profit_declining`/`is_industry_declining` 不存在）。

- [ ] **Step 3: 实现**

在 `backend/app/signals.py` 末尾追加：

```python
def is_profit_declining(yoy_series: List[Optional[float]], consecutive: int = 2) -> bool:
    """信号10（避雷）：净利润同比增速连续 ≥consecutive 个报告期下滑（默认2）。"""
    series = [v for v in yoy_series if v is not None]
    if len(series) < consecutive + 1:
        return False
    tail = series[-(consecutive + 1):]
    return all(tail[i + 1] < tail[i] for i in range(consecutive))


def is_industry_declining(industry_yoy_series: List[Optional[float]]) -> bool:
    """信号12（策略2避雷）：行业整体净利润增速为负，或环比下行。"""
    series = [v for v in industry_yoy_series if v is not None]
    if not series:
        return False
    if series[-1] < 0:
        return True
    return len(series) >= 2 and series[-1] < series[-2]
```

- [ ] **Step 4: 运行确认通过**

Run: `cd backend && ./venv/bin/pytest tests/test_signals.py -v`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
cd backend && git add app/signals.py tests/test_signals.py && git commit -m "feat(backend): 信号库——业绩持续下滑/行业景气下行避雷信号"
```

---

## Task 9: 任务组B step1 — 财报数据增量刷新

**Files:**
- Modify: `backend/app/refresh.py`
- Test: `backend/tests/test_refresh_fundamental.py`

`_latest_report_date(today)` 计算"最近一个已过去的财报截止日"（0331/0630/0930/1231之一），`_refresh_financial_reports` 按该 `report_date` 判断是否已抓取（已存在则跳过，不存在则全量拉取写入）。

- [ ] **Step 1: 写失败测试**

`backend/tests/test_refresh_fundamental.py`:

```python
from datetime import date

from app.db import init_db, SessionLocal
from app.models import FinancialReport
from app import refresh


def test_latest_report_date():
    assert refresh._latest_report_date(date(2026, 6, 11)) == "20260331"
    assert refresh._latest_report_date(date(2026, 7, 15)) == "20260630"
    assert refresh._latest_report_date(date(2026, 1, 15)) == "20251231"
    assert refresh._latest_report_date(date(2026, 12, 31)) == "20261231"
    assert refresh._latest_report_date(date(2026, 3, 31)) == "20260331"


def test_refresh_financial_reports_inserts_rows(db_path):
    init_db()
    refresh.reset_state()
    rd = refresh._latest_report_date()

    def fetch_fn(report_date):
        assert report_date == rd
        return [
            {"code": "sz000001", "net_profit": 1.0e9, "net_profit_yoy": 60.0,
             "revenue": 5.0e9, "revenue_yoy": 30.0, "gross_margin": 25.0},
        ]

    refresh._refresh_financial_reports(refresh.STATE["fundamental"], fetch_fn)

    with SessionLocal() as s:
        rows = s.query(FinancialReport).filter_by(code="sz000001").all()
    assert len(rows) == 1
    assert rows[0].report_date == refresh._report_date_str(rd)
    assert rows[0].net_profit_yoy == 60.0

    step = refresh.STATE["fundamental"].steps[0]
    assert step.done == step.total == 1
    assert step.progress == 100


def test_refresh_financial_reports_skips_if_already_present(db_path):
    init_db()
    refresh.reset_state()
    calls = {"n": 0}

    def fetch_fn(report_date):
        calls["n"] += 1
        return [{"code": "sz000001", "net_profit": 1.0, "net_profit_yoy": 1.0,
                  "revenue": 1.0, "revenue_yoy": 1.0, "gross_margin": 1.0}]

    refresh._refresh_financial_reports(refresh.STATE["fundamental"], fetch_fn)
    refresh._refresh_financial_reports(refresh.STATE["fundamental"], fetch_fn)
    assert calls["n"] == 1
    with SessionLocal() as s:
        assert s.query(FinancialReport).filter_by(code="sz000001").count() == 1
```

- [ ] **Step 2: 运行确认失败**

Run: `cd backend && ./venv/bin/pytest tests/test_refresh_fundamental.py -v`
Expected: FAIL（`_latest_report_date`/`_refresh_financial_reports`/`_report_date_str` 不存在）。

- [ ] **Step 3: 实现**

在 `backend/app/refresh.py` 顶部的 `from datetime import datetime` 改为：

```python
from datetime import date, datetime
```

在 `backend/app/refresh.py` 末尾追加：

```python
def _latest_report_date(today: Optional[date] = None) -> str:
    """返回最近一个已过去的财报截止日（0331/0630/0930/1231），格式 'YYYYMMDD'。"""
    today = today or date.today()
    candidates = [date(today.year, 3, 31), date(today.year, 6, 30),
                  date(today.year, 9, 30), date(today.year, 12, 31)]
    passed = [d for d in candidates if d <= today]
    target = max(passed) if passed else date(today.year - 1, 12, 31)
    return target.strftime("%Y%m%d")


def _report_date_str(report_date: str) -> str:
    """'YYYYMMDD' -> 'YYYY-MM-DD'。"""
    return f"{report_date[:4]}-{report_date[4:6]}-{report_date[6:]}"


def _refresh_financial_reports(group: RefreshGroup, fetch_fn: Callable[[str], list]) -> None:
    """任务组B step1：按 report_date 判断财报数据是否已抓取，未抓取则全量拉取写入。"""
    from app.models import FinancialReport

    step = group.steps[0]
    t0 = time.time()
    report_date = _latest_report_date()
    rd = _report_date_str(report_date)

    with SessionLocal() as s:
        already = s.query(FinancialReport).filter_by(report_date=rd).count()

    if already == 0:
        rows = fetch_fn(report_date)
        now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        with SessionLocal() as s:
            for r in rows:
                s.add(FinancialReport(
                    code=r["code"], report_date=rd,
                    net_profit=r["net_profit"], net_profit_yoy=r["net_profit_yoy"],
                    revenue=r["revenue"], revenue_yoy=r["revenue_yoy"],
                    gross_margin=r["gross_margin"], updated_at=now,
                ))
            s.commit()
        step.total = step.done = len(rows)
    else:
        step.total = step.done = already

    step.progress = 100
    step.elapsed = _fmt(time.time() - t0)
```

- [ ] **Step 4: 运行确认通过**

Run: `cd backend && ./venv/bin/pytest tests/test_refresh_fundamental.py -v`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
cd backend && git add app/refresh.py tests/test_refresh_fundamental.py && git commit -m "feat(backend): 任务组B step1——财报数据增量刷新"
```

---

## Task 10: 任务组B step2 — 业绩预告/快报增量刷新

**Files:**
- Modify: `backend/app/refresh.py`
- Test: `backend/tests/test_refresh_fundamental.py`

- [ ] **Step 1: 写失败测试**

在 `backend/tests/test_refresh_fundamental.py` 末尾追加：

```python
from app.models import Forecast


def test_refresh_forecasts_inserts_both_sources(db_path):
    init_db()
    refresh.reset_state()
    rd = refresh._latest_report_date()

    def forecast_fn(report_date):
        assert report_date == rd
        return [{"code": "sz000001", "source": "forecast", "indicator": "净利润",
                  "change_desc": "预增", "change_pct": 80.0,
                  "forecast_value": 1.2e9, "prior_value": 6.6e8, "notice_date": "2025-04-10"}]

    def express_fn(report_date):
        return [{"code": "sz300750", "source": "express", "net_profit": 5.0e9,
                  "net_profit_yoy": 52.3, "revenue": 2.0e10, "revenue_yoy": 28.7,
                  "notice_date": "2025-04-12"}]

    refresh._refresh_forecasts(refresh.STATE["fundamental"], forecast_fn, express_fn)

    with SessionLocal() as s:
        f1 = s.query(Forecast).filter_by(code="sz000001").one()
        assert f1.source == "forecast" and f1.change_pct == 80.0
        f2 = s.query(Forecast).filter_by(code="sz300750").one()
        assert f2.source == "express" and f2.net_profit_yoy == 52.3

    step = refresh.STATE["fundamental"].steps[1]
    assert step.done == step.total == 2


def test_refresh_forecasts_skips_if_already_present(db_path):
    init_db()
    refresh.reset_state()
    calls = {"n": 0}

    def forecast_fn(report_date):
        calls["n"] += 1
        return [{"code": "sz000001", "source": "forecast", "indicator": "净利润",
                  "change_desc": "预增", "change_pct": 80.0,
                  "forecast_value": 1.2e9, "prior_value": 6.6e8, "notice_date": "2025-04-10"}]

    def express_fn(report_date):
        return []

    refresh._refresh_forecasts(refresh.STATE["fundamental"], forecast_fn, express_fn)
    refresh._refresh_forecasts(refresh.STATE["fundamental"], forecast_fn, express_fn)
    assert calls["n"] == 1
```

- [ ] **Step 2: 运行确认失败**

Run: `cd backend && ./venv/bin/pytest tests/test_refresh_fundamental.py -v`
Expected: FAIL（`_refresh_forecasts` 不存在）。

- [ ] **Step 3: 实现**

在 `backend/app/refresh.py` 末尾追加：

```python
def _refresh_forecasts(
    group: RefreshGroup,
    forecast_fn: Callable[[str], list],
    express_fn: Callable[[str], list],
) -> None:
    """任务组B step2：按 report_date 判断业绩预告/快报是否已抓取，未抓取则拉取写入。"""
    from app.models import Forecast

    step = group.steps[1]
    t0 = time.time()
    report_date = _latest_report_date()
    rd = _report_date_str(report_date)

    with SessionLocal() as s:
        already = s.query(Forecast).filter_by(report_date=rd).count()

    if already == 0:
        rows = forecast_fn(report_date) + express_fn(report_date)
        now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        with SessionLocal() as s:
            for r in rows:
                s.add(Forecast(
                    code=r["code"], report_date=rd, source=r["source"],
                    indicator=r.get("indicator"), change_desc=r.get("change_desc"),
                    change_pct=r.get("change_pct"), forecast_value=r.get("forecast_value"),
                    prior_value=r.get("prior_value"), net_profit=r.get("net_profit"),
                    net_profit_yoy=r.get("net_profit_yoy"), revenue=r.get("revenue"),
                    revenue_yoy=r.get("revenue_yoy"), notice_date=r.get("notice_date"),
                    updated_at=now,
                ))
            s.commit()
        step.total = step.done = len(rows)
    else:
        step.total = step.done = already

    step.progress = 100
    step.elapsed = _fmt(time.time() - t0)
```

- [ ] **Step 4: 运行确认通过**

Run: `cd backend && ./venv/bin/pytest tests/test_refresh_fundamental.py -v`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
cd backend && git add app/refresh.py tests/test_refresh_fundamental.py && git commit -m "feat(backend): 任务组B step2——业绩预告/快报增量刷新"
```

---

## Task 11: 任务组B step3 — 申万行业指数增量刷新 + Stock.industry 填充

**Files:**
- Modify: `backend/app/refresh.py`
- Test: `backend/tests/test_refresh_fundamental.py`

- [ ] **Step 1: 写失败测试**

在 `backend/tests/test_refresh_fundamental.py` 末尾追加：

```python
import pandas as pd

from app.models import Stock, IndustryIndex


def test_refresh_industry_index_appends_new_rows_and_maps_industry(db_path):
    init_db()
    refresh.reset_state()
    with SessionLocal() as s:
        s.add(Stock(code="sz000001", name="平安银行", is_st=False, is_bj=False))
        s.commit()

    industries_fn = lambda: [{"code": "850111", "name": "银行"}]

    def hist_fn(code):
        return pd.DataFrame({
            "date": ["2025-01-02", "2025-01-03"],
            "open": [100.0, 101.0], "close": [101.0, 102.0],
            "high": [102.0, 103.0], "low": [99.0, 100.0],
            "volume": [1000.0, 1100.0],
        })

    constituents_fn = lambda code: ["sz000001"]

    refresh._refresh_industry_index(refresh.STATE["fundamental"], industries_fn, hist_fn, constituents_fn)

    with SessionLocal() as s:
        rows = s.query(IndustryIndex).filter_by(code="850111").order_by(IndustryIndex.date).all()
        assert [r.date for r in rows] == ["2025-01-02", "2025-01-03"]
        assert s.get(Stock, "sz000001").industry == "银行"

    step = refresh.STATE["fundamental"].steps[2]
    assert step.done == step.total == 1


def test_refresh_industry_index_only_appends_newer_dates(db_path):
    init_db()
    refresh.reset_state()
    with SessionLocal() as s:
        s.add(Stock(code="sz000001", name="平安银行", is_st=False, is_bj=False))
        s.commit()

    industries_fn = lambda: [{"code": "850111", "name": "银行"}]
    constituents_fn = lambda code: ["sz000001"]

    first_hist = pd.DataFrame({
        "date": ["2025-01-02", "2025-01-03"],
        "open": [100.0, 101.0], "close": [101.0, 102.0],
        "high": [102.0, 103.0], "low": [99.0, 100.0],
        "volume": [1000.0, 1100.0],
    })
    refresh._refresh_industry_index(refresh.STATE["fundamental"], industries_fn,
                                     lambda code: first_hist, constituents_fn)

    second_hist = pd.DataFrame({
        "date": ["2025-01-02", "2025-01-03", "2025-01-06"],
        "open": [100.0, 101.0, 102.0], "close": [101.0, 102.0, 103.0],
        "high": [102.0, 103.0, 104.0], "low": [99.0, 100.0, 101.0],
        "volume": [1000.0, 1100.0, 1200.0],
    })
    refresh._refresh_industry_index(refresh.STATE["fundamental"], industries_fn,
                                     lambda code: second_hist, constituents_fn)

    with SessionLocal() as s:
        rows = s.query(IndustryIndex).filter_by(code="850111").order_by(IndustryIndex.date).all()
        assert [r.date for r in rows] == ["2025-01-02", "2025-01-03", "2025-01-06"]
```

- [ ] **Step 2: 运行确认失败**

Run: `cd backend && ./venv/bin/pytest tests/test_refresh_fundamental.py -v`
Expected: FAIL（`_refresh_industry_index` 不存在）。

- [ ] **Step 3: 实现**

在 `backend/app/refresh.py` 末尾追加：

```python
def _refresh_industry_index(
    group: RefreshGroup,
    industries_fn: Callable[[], list],
    hist_fn: Callable[[str], pd.DataFrame],
    constituents_fn: Callable[[str], list],
) -> None:
    """任务组B step3：逐申万二级行业，按指数代码增量追加最新交易日；
    并用成分股列表把 Stock.industry 填充为该行业名称。"""
    from app.models import IndustryIndex

    step = group.steps[2]
    t0 = time.time()
    industries = industries_fn()
    step.total = len(industries)

    for i, ind in enumerate(industries, 1):
        code, name = ind["code"], ind["name"]

        with SessionLocal() as s:
            last = (s.query(IndustryIndex.date).filter_by(code=code)
                    .order_by(IndustryIndex.date.desc()).first())
        last_date = last[0] if last else None

        hist = hist_fn(code)
        if not hist.empty:
            new_rows = hist[hist["date"] > last_date] if last_date else hist
            if not new_rows.empty:
                with SessionLocal() as s:
                    for row in new_rows.itertuples(index=False):
                        s.add(IndustryIndex(
                            code=code, name=name, date=row.date,
                            open=float(row.open), close=float(row.close),
                            high=float(row.high), low=float(row.low),
                            volume=float(row.volume),
                        ))
                    s.commit()

        constituents = constituents_fn(code)
        if constituents:
            with SessionLocal() as s:
                for stock_code in constituents:
                    stock = s.get(Stock, stock_code)
                    if stock is not None:
                        stock.industry = name
                s.commit()

        step.done = i
        step.progress = int(i / step.total * 100) if step.total else 100
        step.elapsed = _fmt(time.time() - t0)
```

- [ ] **Step 4: 运行确认通过**

Run: `cd backend && ./venv/bin/pytest tests/test_refresh_fundamental.py -v`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
cd backend && git add app/refresh.py tests/test_refresh_fundamental.py && git commit -m "feat(backend): 任务组B step3——申万行业指数增量刷新+Stock.industry填充"
```

---

## Task 12: `run_fundamental_refresh` 编排 + `POST /refresh/fundamental` 端点

**Files:**
- Modify: `backend/app/refresh.py`
- Modify: `backend/app/main.py`
- Test: `backend/tests/test_refresh_fundamental.py`
- Test: `backend/tests/test_api.py`

- [ ] **Step 1: 写失败测试**

在 `backend/tests/test_refresh_fundamental.py` 末尾追加：

```python
def test_run_fundamental_refresh_marks_done(db_path):
    init_db()
    refresh.reset_state()
    with SessionLocal() as s:
        s.add(Stock(code="sz000001", name="平安银行", is_st=False, is_bj=False))
        s.commit()

    empty_df = pd.DataFrame(columns=["date", "open", "close", "high", "low", "volume"])

    refresh.run_fundamental_refresh(
        financial_fn=lambda rd: [],
        forecast_fn=lambda rd: [],
        express_fn=lambda rd: [],
        industries_fn=lambda: [],
        industry_hist_fn=lambda code: empty_df,
        constituents_fn=lambda code: [],
    )

    group = refresh.STATE["fundamental"]
    assert group.status == "done"
    assert group.updatedAt is not None


def test_run_fundamental_refresh_marks_error_on_exception(db_path):
    init_db()
    refresh.reset_state()

    def boom(rd):
        raise RuntimeError("boom")

    import pytest
    with pytest.raises(RuntimeError):
        refresh.run_fundamental_refresh(
            financial_fn=boom, forecast_fn=lambda rd: [], express_fn=lambda rd: [],
            industries_fn=lambda: [], industry_hist_fn=lambda code: pd.DataFrame(),
            constituents_fn=lambda code: [],
        )
    assert refresh.STATE["fundamental"].status == "error"
```

在 `backend/tests/test_api.py` 末尾追加：

```python
def test_refresh_fundamental_triggers_background(client, monkeypatch):
    refresh.reset_state()
    called = {}
    monkeypatch.setattr(refresh, "run_fundamental_refresh",
                        lambda *a, **k: called.setdefault("ran", True))
    r = client.post("/refresh/fundamental")
    assert r.status_code in (200, 202)
    assert called.get("ran") is True
```

- [ ] **Step 2: 运行确认失败**

Run: `cd backend && ./venv/bin/pytest tests/test_refresh_fundamental.py tests/test_api.py -v`
Expected: FAIL（`run_fundamental_refresh` 不存在 / `/refresh/fundamental` 404）。

- [ ] **Step 3: 实现**

在 `backend/app/refresh.py` 末尾追加：

```python
def run_fundamental_refresh(
    financial_fn: Optional[Callable[[str], list]] = None,
    forecast_fn: Optional[Callable[[str], list]] = None,
    express_fn: Optional[Callable[[str], list]] = None,
    industries_fn: Optional[Callable[[], list]] = None,
    industry_hist_fn: Optional[Callable[[str], pd.DataFrame]] = None,
    constituents_fn: Optional[Callable[[str], list]] = None,
) -> None:
    """任务组B（阶段2部分）：财报数据 / 业绩预告快报 / 申万行业指数。"""
    if financial_fn is None:
        from app.data.fetch_fundamental import fetch_financial_reports
        financial_fn = fetch_financial_reports
    if forecast_fn is None:
        from app.data.fetch_fundamental import fetch_forecasts
        forecast_fn = fetch_forecasts
    if express_fn is None:
        from app.data.fetch_fundamental import fetch_express_reports
        express_fn = fetch_express_reports
    if industries_fn is None:
        from app.data.fetch_fundamental import get_sw_industries
        industries_fn = get_sw_industries
    if industry_hist_fn is None:
        from app.data.fetch_fundamental import get_industry_index_hist
        industry_hist_fn = get_industry_index_hist
    if constituents_fn is None:
        from app.data.fetch_fundamental import get_industry_constituents
        constituents_fn = get_industry_constituents

    group = STATE["fundamental"]
    group.status = "running"
    try:
        _refresh_financial_reports(group, financial_fn)
        _refresh_forecasts(group, forecast_fn, express_fn)
        _refresh_industry_index(group, industries_fn, industry_hist_fn, constituents_fn)
        group.status = "done"
        group.updatedAt = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    except Exception:
        group.status = "error"
        raise
```

在 `backend/app/main.py` 中，紧跟 `refresh_kline` 端点之后追加：

```python
@app.post("/refresh/fundamental", status_code=202)
def refresh_fundamental(background: BackgroundTasks):
    background.add_task(refresh.run_fundamental_refresh)
    return {"status": "accepted"}
```

- [ ] **Step 4: 运行确认通过**

Run: `cd backend && ./venv/bin/pytest tests/test_refresh_fundamental.py tests/test_api.py -v`
Expected: PASS

- [ ] **Step 5: 全量回归**

Run: `cd backend && ./venv/bin/pytest -q`
Expected: 全部通过（阶段1的39个用例 + 阶段2新增用例）。

- [ ] **Step 6: 提交**

```bash
cd backend && git add app/refresh.py app/main.py tests/test_refresh_fundamental.py tests/test_api.py && git commit -m "feat(backend): 任务组B编排（run_fundamental_refresh）+ POST /refresh/fundamental"
```

---

## 阶段2 完成标准

- [ ] `financial_reports`/`forecasts`/`industry_index` 三张表建表成功，可插入查询。
- [ ] `app/data/fetch_fundamental.py` 6个抓取函数均有 mock 测试覆盖（不依赖真实网络）。
- [ ] `app/signals.py` 9个信号纯函数（对应 spec 信号#1/2/3/4/7/9/10/11/12）+ 1个单季推导辅助函数，固定样本测试覆盖阈值边界。
- [ ] `run_fundamental_refresh` 完成 `/refresh/status` 中 `fundamental` 分组前3个 step（财报数据/业绩预告快报/申万行业指数）的进度更新，按 `report_date`/指数代码增量判断。
- [ ] `POST /refresh/fundamental` 端点可用（后台任务）。
- [ ] `cd backend && ./venv/bin/pytest -q` 全量通过。
