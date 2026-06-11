# i'mRich 选股器 · 阶段3（研报爬虫 + 策略1/2组装）实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 补齐研报数据层、研报关键词/板块效应/α地位信号，并组装策略1「创新高超级成长」与策略2「低位错杀蓝筹」，让 `/screen?preset=super-growth|oversold-bluechip` 第一次端到端可用。

**Architecture:** 本阶段建立在阶段2已完成的 `FinancialReport`/`Forecast`/`IndustryIndex`、`app/signals.py` 与 `run_fundamental_refresh` 之上。新增 `ResearchReport` 表、`app/data/fetch_research.py` 研报抓取封装、`app/fundamental_screen.py` 策略1/2引擎，并扩展 `/presets`、`/screen`、`/refresh/fundamental`。研报 Stage1 只抓元数据并做标题/摘要关键词匹配；Stage2 只对候选池下载 PDF 并解析正文，避免全市场 PDF 爬取。

**Tech Stack:** Python 3.9.19、FastAPI、SQLAlchemy、pandas、pytest。新增依赖 `pdfplumber`（PDF正文解析）和 `requests`（PDF下载；如阶段1/2已安装则不重复安装）。前端沿用现有 React/Vite 结构，仅把策略1/2从 mock 数据接到真实 API。

**前置条件：** 阶段2必须已实现并通过 `cd backend && ./venv/bin/pytest -q`。如果当前工作区仍缺少 `backend/app/data/fetch_fundamental.py`、`backend/app/signals.py` 或 `POST /refresh/fundamental`，先执行阶段2计划。

---

## 文件结构

| 文件 | 操作 | 职责 |
|---|---|---|
| `backend/requirements.txt` | 改 | 增加 `pdfplumber`、`requests` |
| `backend/app/models.py` | 改 | 新增 `ResearchReport` ORM 模型 |
| `backend/app/data/fetch_research.py` | 建 | 东财研报 Stage1 元数据抓取、PDF下载、PDF正文解析 |
| `backend/app/research_signals.py` | 建 | 研报关键词命中、板块效应、α地位信号 |
| `backend/app/fundamental_screen.py` | 建 | 策略1/2候选筛选、避雷、打分、排序 |
| `backend/app/presets.py` | 改 | 增加 `super-growth`、`oversold-bluechip` 参数 schema |
| `backend/app/screen.py` | 改 | 按 preset category 分发 fundamental/technical |
| `backend/app/refresh.py` | 改 | 补齐 fundamental 分组的研报 Stage1 / Stage2 steps |
| `backend/app/main.py` | 改 | `/screen` 支持策略1/2；`/refresh/fundamental` 调用完整版 |
| `frontend/src/lib/api.ts` | 改 | 增加 `screenFundamental` |
| `frontend/src/App.tsx` | 改 | 策略1/2视图接真实候选列表 |
| `backend/tests/test_research_models.py` | 建 | 研报表建表/唯一约束测试 |
| `backend/tests/test_fetch_research.py` | 建 | 研报抓取/PDF解析 mock 测试 |
| `backend/tests/test_research_signals.py` | 建 | 关键词、板块效应、α地位信号测试 |
| `backend/tests/test_fundamental_screen.py` | 建 | 策略1/2硬过滤、避雷、打分测试 |
| `backend/tests/test_api.py` | 改 | `/presets`、`/screen` 策略1/2 API 测试 |

---

## Task 1: 研报表与依赖

**Files:**
- Modify: `backend/requirements.txt`
- Modify: `backend/app/models.py`
- Test: `backend/tests/test_research_models.py`

- [ ] **Step 1: 写失败测试**

创建 `backend/tests/test_research_models.py`：

```python
import pytest
from sqlalchemy.exc import IntegrityError

from app.db import SessionLocal, init_db
from app.models import ResearchReport


def test_research_reports_table_accepts_stage1_and_stage2_rows(db_path):
    init_db()
    with SessionLocal() as s:
        s.add(ResearchReport(
            report_id="em-1", code="sz000001", name="平安银行",
            title="订单饱满，业绩超预期", org="测试证券", published_at="2025-06-01",
            summary="新产品放量，国产替代加速", pdf_url="https://example.test/a.pdf",
            pdf_path=None, content_text=None, stage="metadata",
            updated_at="2025-06-02 10:00:00",
        ))
        s.commit()
        row = s.query(ResearchReport).filter_by(report_id="em-1").one()
        row.stage = "parsed"
        row.pdf_path = "data/research/em-1.pdf"
        row.content_text = "正文：订单饱满，产能扩张。"
        s.commit()

    with SessionLocal() as s:
        row = s.query(ResearchReport).filter_by(report_id="em-1").one()
        assert row.stage == "parsed"
        assert "产能扩张" in row.content_text


def test_research_report_id_is_unique(db_path):
    init_db()
    with SessionLocal() as s:
        s.add(ResearchReport(report_id="dup", code="sz000001", title="a", published_at="2025-06-01", stage="metadata"))
        s.add(ResearchReport(report_id="dup", code="sz000001", title="b", published_at="2025-06-02", stage="metadata"))
        with pytest.raises(IntegrityError):
            s.commit()
```

- [ ] **Step 2: 运行确认失败**

Run: `cd backend && ./venv/bin/pytest tests/test_research_models.py -v`  
Expected: FAIL，`ResearchReport` 未定义。

- [ ] **Step 3: 增加依赖与模型**

在 `backend/requirements.txt` 增加：

```text
pdfplumber
requests
```

在 `backend/app/models.py` 末尾追加：

```python
class ResearchReport(Base):
    """东财研报：Stage1 元数据 + Stage2 候选池 PDF 正文。"""
    __tablename__ = "research_reports"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    report_id: Mapped[str] = mapped_column(String, unique=True, index=True)
    code: Mapped[str] = mapped_column(String, index=True)
    name: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    title: Mapped[str] = mapped_column(String)
    org: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    published_at: Mapped[str] = mapped_column(String, index=True)
    summary: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    pdf_url: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    pdf_path: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    content_text: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    stage: Mapped[str] = mapped_column(String, default="metadata")  # metadata | parsed
    updated_at: Mapped[Optional[str]] = mapped_column(String, nullable=True)

    __table_args__ = (
        Index("ix_research_reports_code_date", "code", "published_at"),
    )
```

- [ ] **Step 4: 运行确认通过**

Run: `cd backend && ./venv/bin/pip install -r requirements.txt && ./venv/bin/pytest tests/test_research_models.py -v`  
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add backend/requirements.txt backend/app/models.py backend/tests/test_research_models.py
git commit -m "feat(backend): add research report storage"
```

---

## Task 2: 研报抓取封装

**Files:**
- Create: `backend/app/data/fetch_research.py`
- Test: `backend/tests/test_fetch_research.py`

- [ ] **Step 1: 写失败测试**

创建 `backend/tests/test_fetch_research.py`：

```python
from pathlib import Path

import pandas as pd

from app.data.fetch_research import fetch_research_metadata, parse_research_row, download_pdf, parse_pdf_text


def test_parse_research_row_normalizes_fields():
    row = {
        "报告ID": "R1", "股票代码": "000001", "股票简称": "平安银行",
        "报告名称": "订单饱满，业绩超预期", "机构名称": "测试证券",
        "发布日期": "2025-06-01", "摘要": "国产替代", "PDF地址": "https://example.test/r1.pdf",
    }
    parsed = parse_research_row(row)
    assert parsed == {
        "report_id": "R1", "code": "sz000001", "name": "平安银行",
        "title": "订单饱满，业绩超预期", "org": "测试证券",
        "published_at": "2025-06-01", "summary": "国产替代",
        "pdf_url": "https://example.test/r1.pdf",
    }


def test_fetch_research_metadata_uses_injected_akshare():
    df = pd.DataFrame([{
        "报告ID": "R1", "股票代码": "600000", "股票简称": "浦发银行",
        "报告名称": "行业复苏", "机构名称": "测试证券",
        "发布日期": "2025-06-02", "摘要": "", "PDF地址": "",
    }])
    rows = fetch_research_metadata(lambda: df)
    assert rows[0]["code"] == "sh600000"
    assert rows[0]["title"] == "行业复苏"


def test_download_pdf_writes_bytes(tmp_path):
    class Resp:
        content = b"%PDF-1.4 fake"
        def raise_for_status(self):
            return None
    out = download_pdf("https://example.test/r1.pdf", tmp_path, get_fn=lambda url, timeout: Resp())
    assert Path(out).read_bytes() == b"%PDF-1.4 fake"


def test_parse_pdf_text_uses_injected_parser(tmp_path):
    pdf = tmp_path / "r1.pdf"
    pdf.write_bytes(b"fake")
    text = parse_pdf_text(str(pdf), parser_fn=lambda path: ["第一页", "第二页"])
    assert text == "第一页\n第二页"
```

- [ ] **Step 2: 运行确认失败**

Run: `cd backend && ./venv/bin/pytest tests/test_fetch_research.py -v`  
Expected: FAIL，模块不存在。

- [ ] **Step 3: 实现抓取封装**

创建 `backend/app/data/fetch_research.py`：

```python
from __future__ import annotations

from pathlib import Path
from typing import Callable, Iterable, Optional

import pandas as pd
import requests


def normalize_stock_code(raw_code: str) -> str:
    code = str(raw_code).strip()
    if code.startswith(("sh", "sz", "bj")):
        return code
    if code.startswith(("6", "9")):
        return f"sh{code}"
    if code.startswith(("4", "8")):
        return f"bj{code}"
    return f"sz{code}"


def parse_research_row(row: dict) -> dict:
    raw_code = str(row.get("股票代码") or row.get("code") or "").zfill(6)
    return {
        "report_id": str(row.get("报告ID") or row.get("report_id")),
        "code": normalize_stock_code(raw_code),
        "name": str(row.get("股票简称") or row.get("name") or ""),
        "title": str(row.get("报告名称") or row.get("title") or ""),
        "org": str(row.get("机构名称") or row.get("org") or ""),
        "published_at": str(row.get("发布日期") or row.get("published_at") or "")[:10],
        "summary": str(row.get("摘要") or row.get("summary") or ""),
        "pdf_url": str(row.get("PDF地址") or row.get("pdf_url") or ""),
    }


def fetch_research_metadata(ak_fn: Optional[Callable[[], pd.DataFrame]] = None) -> list[dict]:
    if ak_fn is None:
        import akshare as ak
        ak_fn = ak.stock_research_report_em
    df = ak_fn()
    return [parse_research_row(row) for row in df.to_dict("records")]


def download_pdf(
    url: str,
    directory: Path,
    get_fn: Callable = requests.get,
    timeout: int = 20,
) -> str:
    directory.mkdir(parents=True, exist_ok=True)
    filename = url.rstrip("/").split("/")[-1] or "research.pdf"
    if not filename.lower().endswith(".pdf"):
        filename = f"{filename}.pdf"
    path = directory / filename
    resp = get_fn(url, timeout=timeout)
    resp.raise_for_status()
    path.write_bytes(resp.content)
    return str(path)


def parse_pdf_text(path: str, parser_fn: Optional[Callable[[str], Iterable[str]]] = None) -> str:
    if parser_fn is None:
        import pdfplumber
        def parser_fn(pdf_path: str) -> Iterable[str]:
            with pdfplumber.open(pdf_path) as pdf:
                return [page.extract_text() or "" for page in pdf.pages]
    return "\n".join(part for part in parser_fn(path) if part)
```

- [ ] **Step 4: 运行确认通过**

Run: `cd backend && ./venv/bin/pytest tests/test_fetch_research.py -v`  
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add backend/app/data/fetch_research.py backend/tests/test_fetch_research.py
git commit -m "feat(backend): add research metadata and pdf helpers"
```

---

## Task 3: 研报信号函数

**Files:**
- Create: `backend/app/research_signals.py`
- Test: `backend/tests/test_research_signals.py`

- [ ] **Step 1: 写失败测试**

创建 `backend/tests/test_research_signals.py`：

```python
from app.research_signals import keyword_hits, has_research_keyword, sector_effect, alpha_rank


def test_keyword_hits_maps_text_to_signal_keys():
    hits = keyword_hits("订单饱满，产能扩张，新产品发布，国产替代，行业复苏，估值修复")
    assert hits == ["orderFull", "capexExpand", "newProduct", "domesticSub", "industryRecover", "valuationRepair"]


def test_has_research_keyword_checks_title_summary_and_content():
    reports = [
        {"published_at": "2025-01-01", "title": "普通点评", "summary": "", "content_text": ""},
        {"published_at": "2025-06-01", "title": "业绩超预期", "summary": "订单饱满", "content_text": ""},
    ]
    assert has_research_keyword(reports, as_of="2025-06-15", window_days=30) is True
    assert has_research_keyword(reports, as_of="2025-06-15", window_days=7) is False


def test_sector_effect_counts_same_industry_hits():
    rows = [
        {"code": "sz000001", "industry": "银行", "high_growth": True, "research_hit": True},
        {"code": "sz000002", "industry": "银行", "high_growth": True, "research_hit": True},
        {"code": "sz000003", "industry": "银行", "high_growth": True, "research_hit": True},
        {"code": "sz000004", "industry": "电子", "high_growth": True, "research_hit": True},
    ]
    assert sector_effect("银行", rows, threshold=3) is True
    assert sector_effect("电子", rows, threshold=3) is False


def test_alpha_rank_uses_industry_percentile():
    rows = [
        {"code": "a", "industry": "电子", "return_pct": 30, "market_cap": 100, "net_profit_yoy": 60},
        {"code": "b", "industry": "电子", "return_pct": 10, "market_cap": 300, "net_profit_yoy": 20},
        {"code": "c", "industry": "电子", "return_pct": 5, "market_cap": 100, "net_profit_yoy": 10},
    ]
    assert alpha_rank("a", rows, top_n=1) is True
    assert alpha_rank("b", rows, top_n=1) is False
```

- [ ] **Step 2: 运行确认失败**

Run: `cd backend && ./venv/bin/pytest tests/test_research_signals.py -v`  
Expected: FAIL，模块不存在。

- [ ] **Step 3: 实现信号函数**

创建 `backend/app/research_signals.py`：

```python
from __future__ import annotations

from datetime import date, datetime, timedelta


KEYWORD_TO_SIGNAL = [
    ("订单饱满", "orderFull"),
    ("产能扩张", "capexExpand"),
    ("新产品", "newProduct"),
    ("国产替代", "domesticSub"),
    ("行业复苏", "industryRecover"),
    ("估值修复", "valuationRepair"),
]


def _to_date(value: str) -> date:
    return datetime.strptime(value[:10], "%Y-%m-%d").date()


def keyword_hits(text: str) -> list[str]:
    return [signal for keyword, signal in KEYWORD_TO_SIGNAL if keyword in (text or "")]


def has_research_keyword(reports: list[dict], as_of: str, window_days: int = 90) -> bool:
    cutoff = _to_date(as_of) - timedelta(days=window_days)
    for report in reports:
        published = _to_date(report["published_at"])
        if published < cutoff or published > _to_date(as_of):
            continue
        text = "\n".join([report.get("title") or "", report.get("summary") or "", report.get("content_text") or ""])
        if keyword_hits(text):
            return True
    return False


def sector_effect(industry: str, rows: list[dict], threshold: int = 3) -> bool:
    count = sum(
        1 for row in rows
        if row.get("industry") == industry and row.get("high_growth") and row.get("research_hit")
    )
    return count >= threshold


def alpha_rank(code: str, rows: list[dict], top_n: int = 3) -> bool:
    target = next((row for row in rows if row.get("code") == code), None)
    if target is None:
        return False
    peers = [row for row in rows if row.get("industry") == target.get("industry")]
    ranked = sorted(
        peers,
        key=lambda row: (row.get("return_pct") or 0, row.get("net_profit_yoy") or 0, row.get("market_cap") or 0),
        reverse=True,
    )
    return code in [row.get("code") for row in ranked[:top_n]]
```

- [ ] **Step 4: 运行确认通过**

Run: `cd backend && ./venv/bin/pytest tests/test_research_signals.py -v`  
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add backend/app/research_signals.py backend/tests/test_research_signals.py
git commit -m "feat(backend): add research-derived signals"
```

---

## Task 4: 策略1/2引擎

**Files:**
- Create: `backend/app/fundamental_screen.py`
- Modify: `backend/app/screen.py`
- Test: `backend/tests/test_fundamental_screen.py`

- [ ] **Step 1: 写失败测试**

创建 `backend/tests/test_fundamental_screen.py`：

```python
from app.fundamental_screen import score_candidate, run_fundamental_screen_from_rows


def test_score_candidate_adds_weighted_signals_and_caps_at_100():
    row = {
        "signals": ["highGrowth", "newHigh", "beatExpect", "sectorEffect", "industryNewHigh", "alpha", "orderFull"],
        "netProfitYoY": 80,
        "revenueYoY": 40,
    }
    assert score_candidate(row) == 100.0


def test_super_growth_requires_growth_new_high_and_research_keyword():
    rows = [{
        "code": "sz000001", "name": "平安银行", "industry": "银行",
        "high_growth": True, "beat_expect": True, "profit_record": True,
        "price_new_high": True, "industry_new_high": True, "research_signals": ["orderFull"],
        "sector_effect": True, "alpha": True, "oversold": False,
        "risk_profit_decline": False, "risk_price_new_low": False, "risk_industry_down": False,
        "netProfitYoY": 70, "revenueYoY": 30,
    }]
    out = run_fundamental_screen_from_rows("super-growth", rows, {})
    assert out[0]["code"] == "sz000001"
    assert "highGrowth" in out[0]["signals"]
    assert "orderFull" in out[0]["signals"]


def test_oversold_bluechip_rejects_industry_down_risk():
    rows = [{
        "code": "sz000001", "name": "平安银行", "industry": "银行",
        "high_growth": False, "beat_expect": False, "profit_record": False,
        "price_new_high": False, "industry_new_high": False, "research_signals": ["valuationRepair"],
        "sector_effect": False, "alpha": False, "oversold": True,
        "risk_profit_decline": False, "risk_price_new_low": False, "risk_industry_down": True,
        "netProfitYoY": 10, "revenueYoY": 5,
    }]
    assert run_fundamental_screen_from_rows("oversold-bluechip", rows, {}) == []
```

- [ ] **Step 2: 运行确认失败**

Run: `cd backend && ./venv/bin/pytest tests/test_fundamental_screen.py -v`  
Expected: FAIL，模块不存在。

- [ ] **Step 3: 实现纯行引擎**

创建 `backend/app/fundamental_screen.py`：

```python
from __future__ import annotations

from typing import Any


WEIGHTS = {
    "highGrowth": 22, "newHigh": 18, "beatExpect": 16,
    "sectorEffect": 12, "industryNewHigh": 10, "alpha": 12,
    "orderFull": 5, "capexExpand": 5, "newProduct": 5,
    "domesticSub": 5, "industryRecover": 5, "valuationRepair": 5,
}


def _display_signals(row: dict) -> list[str]:
    signals: list[str] = []
    if row.get("high_growth"):
        signals.append("highGrowth")
    if row.get("price_new_high"):
        signals.append("newHigh")
    if row.get("beat_expect"):
        signals.append("beatExpect")
    if row.get("sector_effect"):
        signals.append("sectorEffect")
    if row.get("industry_new_high"):
        signals.append("industryNewHigh")
    if row.get("alpha"):
        signals.append("alpha")
    signals.extend(row.get("research_signals") or [])
    return list(dict.fromkeys(signals))


def score_candidate(row: dict) -> float:
    raw = sum(WEIGHTS.get(signal, 0) for signal in row.get("signals", []))
    raw += min(max((row.get("netProfitYoY") or 0) - 50, 0), 20) * 0.2
    raw += min(max((row.get("revenueYoY") or 0) - 20, 0), 20) * 0.1
    return round(min(raw, 100), 1)


def _has_common_risk(row: dict) -> bool:
    return bool(row.get("risk_profit_decline") or row.get("risk_price_new_low"))


def _candidate(row: dict) -> dict:
    signals = _display_signals(row)
    scored = {**row, "signals": signals}
    visible = signals[:6]
    return {
        "code": row["code"],
        "name": row.get("name") or row["code"],
        "industry": row.get("industry") or "",
        "score": score_candidate(scored),
        "signals": visible,
        "extraSignals": max(len(signals) - len(visible), 0),
        "netProfitYoY": float(row.get("netProfitYoY") or 0),
        "revenueYoY": float(row.get("revenueYoY") or 0),
    }


def run_fundamental_screen_from_rows(preset_id: str, rows: list[dict], params: dict[str, Any]) -> list[dict]:
    out: list[dict] = []
    for row in rows:
        if _has_common_risk(row):
            continue
        if preset_id == "super-growth":
            if not (row.get("high_growth") and row.get("price_new_high") and row.get("research_signals")):
                continue
        elif preset_id == "oversold-bluechip":
            if row.get("risk_industry_down") or not row.get("oversold"):
                continue
        else:
            raise KeyError(f"未知基本面预设: {preset_id}")
        out.append(_candidate(row))
    out.sort(key=lambda item: (item["score"], item["code"]), reverse=True)
    return out


def run_fundamental_screen(preset_id: str, params: dict[str, Any]) -> list[dict]:
    from app.fundamental_rows import build_fundamental_rows
    return run_fundamental_screen_from_rows(preset_id, build_fundamental_rows(params), params)
```

同时创建 `backend/app/fundamental_rows.py`：

```python
from __future__ import annotations

from app.db import SessionLocal
from app.models import FinancialReport, KlineDay, ResearchReport, Stock
from app.research_signals import keyword_hits
from app.signals import (
    beat_expect,
    high_growth,
    industry_new_high,
    low_position_oversold,
    price_new_high,
    risk_industry_down,
    risk_price_new_low,
    risk_profit_decline,
)


def _latest_by_code(rows, attr: str = "report_date") -> dict[str, object]:
    out = {}
    for row in rows:
        code = row.code
        if code not in out or getattr(row, attr) > getattr(out[code], attr):
            out[code] = row
    return out


def build_fundamental_rows(params: dict) -> list[dict]:
    with SessionLocal() as s:
        stocks = s.query(Stock).filter(Stock.delisted_at.is_(None)).all()
        reports = s.query(FinancialReport).all()
        research = s.query(ResearchReport).all()
        klines = s.query(KlineDay).order_by(KlineDay.code, KlineDay.date).all()

    latest_report = _latest_by_code(reports)
    reports_by_code: dict[str, list] = {}
    research_by_code: dict[str, list] = {}
    klines_by_code: dict[str, list] = {}
    for row in reports:
        reports_by_code.setdefault(row.code, []).append(row)
    for row in research:
        research_by_code.setdefault(row.code, []).append(row)
    for row in klines:
        klines_by_code.setdefault(row.code, []).append(row)

    out = []
    for stock in stocks:
        financial = latest_report.get(stock.code)
        if financial is None:
            continue
        stock_reports = research_by_code.get(stock.code, [])
        text = "\n".join([f"{r.title}\n{r.summary or ''}\n{r.content_text or ''}" for r in stock_reports])
        research_signals = keyword_hits(text)
        stock_klines = klines_by_code.get(stock.code, [])
        out.append({
            "code": stock.code,
            "name": stock.name,
            "industry": stock.industry or "",
            "high_growth": high_growth(financial),
            "beat_expect": beat_expect(financial, reports_by_code.get(stock.code, [])),
            "profit_record": financial.net_profit == max((r.net_profit or 0) for r in reports_by_code.get(stock.code, [financial])),
            "price_new_high": price_new_high(stock_klines),
            "industry_new_high": industry_new_high(stock.industry or ""),
            "research_signals": research_signals,
            "sector_effect": False,
            "alpha": False,
            "oversold": low_position_oversold(stock_klines, financial),
            "risk_profit_decline": risk_profit_decline(reports_by_code.get(stock.code, [])),
            "risk_price_new_low": risk_price_new_low(stock_klines),
            "risk_industry_down": risk_industry_down(stock.industry or ""),
            "netProfitYoY": financial.net_profit_yoy or 0,
            "revenueYoY": financial.revenue_yoy or 0,
        })
    return out
```

- [ ] **Step 4: 运行确认通过**

Run: `cd backend && ./venv/bin/pytest tests/test_fundamental_screen.py -v`  
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add backend/app/fundamental_screen.py backend/app/fundamental_rows.py backend/tests/test_fundamental_screen.py
git commit -m "feat(backend): add fundamental strategy engine"
```

---

## Task 5: `/presets` 与 `/screen` 接入策略1/2

**Files:**
- Modify: `backend/app/presets.py`
- Modify: `backend/app/screen.py`
- Modify: `backend/app/main.py`
- Test: `backend/tests/test_api.py`

- [ ] **Step 1: 写失败测试**

在 `backend/tests/test_api.py` 增加：

```python
def test_presets_include_fundamental_and_technical(client):
    ids = {row["id"]: row for row in client.get("/presets").json()}
    assert ids["super-growth"]["category"] == "fundamental"
    assert ids["oversold-bluechip"]["category"] == "fundamental"
    assert ids["trend-support"]["category"] == "technical"
    assert ids["b2"]["category"] == "technical"


def test_screen_dispatches_fundamental_strategy(client, monkeypatch):
    from app import screen as screen_module
    monkeypatch.setattr(screen_module, "run_fundamental_screen", lambda preset, params: [{"code": "sz000001"}])
    r = client.get('/screen?preset=super-growth&params={"keywordWindow":90}')
    assert r.status_code == 200
    assert r.json() == [{"code": "sz000001"}]
```

- [ ] **Step 2: 运行确认失败**

Run: `cd backend && ./venv/bin/pytest tests/test_api.py -v`  
Expected: FAIL，预设缺少策略1/2或 `/screen` 未分发。

- [ ] **Step 3: 实现预设与分发**

扩展 `backend/app/presets.py`：

```python
_FUNDAMENTAL_PRESETS = [
    {
        "id": "super-growth", "category": "fundamental", "name": "创新高超级成长",
        "params": [
            {"key": "netProfitYoY", "label": "净利润同比下限", "value": 50, "min": 0, "max": 200, "step": 5, "unit": "%"},
            {"key": "revenueYoY", "label": "营收同比下限", "value": 20, "min": 0, "max": 200, "step": 5, "unit": "%"},
            {"key": "keywordWindow", "label": "研报关键词时间窗", "value": 90, "min": 30, "max": 180, "step": 30, "unit": "日"},
        ],
    },
    {
        "id": "oversold-bluechip", "category": "fundamental", "name": "低位错杀蓝筹",
        "params": [
            {"key": "drawdownMin", "label": "距一年高回撤下限", "value": 35, "min": 10, "max": 80, "step": 5, "unit": "%"},
            {"key": "netProfitYoY", "label": "净利润同比下限", "value": 0, "min": -50, "max": 100, "step": 5, "unit": "%"},
            {"key": "keywordWindow", "label": "研报关键词时间窗", "value": 90, "min": 30, "max": 180, "step": 30, "unit": "日"},
        ],
    },
]
```

让 `get_presets()` 先返回 `_FUNDAMENTAL_PRESETS`，再返回已有技术面预设。扩展 `backend/app/screen.py`：

```python
from app.fundamental_screen import run_fundamental_screen


FUNDAMENTAL_PRESETS = {"super-growth", "oversold-bluechip"}
TECHNICAL_PRESETS = {"trend-support", "b2"}


def run_screen(preset_id: str, params: Dict[str, Any]) -> List[dict]:
    if preset_id in FUNDAMENTAL_PRESETS:
        return run_fundamental_screen(preset_id, params)
    if preset_id in TECHNICAL_PRESETS:
        return run_technical_screen(preset_id, params)
    raise KeyError(f"未知预设: {preset_id}")
```

在 `backend/app/main.py` 的 `/screen` 中调用 `run_screen(preset, parsed)`。

- [ ] **Step 4: 运行确认通过**

Run: `cd backend && ./venv/bin/pytest tests/test_api.py -v`  
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add backend/app/presets.py backend/app/screen.py backend/app/main.py backend/tests/test_api.py
git commit -m "feat(backend): expose fundamental screen presets"
```

---

## Task 6: 刷新任务组B补齐研报 Stage1/Stage2

**Files:**
- Modify: `backend/app/refresh.py`
- Test: `backend/tests/test_refresh_fundamental.py`

- [ ] **Step 1: 写失败测试**

在 `backend/tests/test_refresh_fundamental.py` 增加：

```python
def test_refresh_research_metadata_upserts_stage1(db_path):
    from app.db import SessionLocal, init_db
    from app.models import ResearchReport
    from app.refresh import refresh_research_metadata

    init_db()
    refresh_research_metadata(lambda: [{
        "report_id": "R1", "code": "sz000001", "name": "平安银行",
        "title": "订单饱满", "org": "测试证券", "published_at": "2025-06-01",
        "summary": "", "pdf_url": "https://example.test/r1.pdf",
    }])
    with SessionLocal() as s:
        row = s.query(ResearchReport).filter_by(report_id="R1").one()
        assert row.stage == "metadata"


def test_refresh_research_pdfs_only_parses_candidate_pool(db_path, tmp_path):
    from app.db import SessionLocal, init_db
    from app.models import ResearchReport
    from app.refresh import refresh_research_pdfs

    init_db()
    with SessionLocal() as s:
        s.add(ResearchReport(report_id="R1", code="sz000001", title="a", published_at="2025-06-01", pdf_url="u1", stage="metadata"))
        s.add(ResearchReport(report_id="R2", code="sz000002", title="b", published_at="2025-06-01", pdf_url="u2", stage="metadata"))
        s.commit()
    refresh_research_pdfs(
        candidate_codes=["sz000001"], directory=tmp_path,
        download_fn=lambda url, directory: str(tmp_path / "r1.pdf"),
        parse_fn=lambda path: "订单饱满正文",
    )
    with SessionLocal() as s:
        assert s.query(ResearchReport).filter_by(report_id="R1").one().stage == "parsed"
        assert s.query(ResearchReport).filter_by(report_id="R2").one().stage == "metadata"
```

- [ ] **Step 2: 运行确认失败**

Run: `cd backend && ./venv/bin/pytest tests/test_refresh_fundamental.py -v`  
Expected: FAIL，刷新函数不存在。

- [ ] **Step 3: 实现研报刷新函数**

在 `backend/app/refresh.py` 追加 `refresh_research_metadata` 和 `refresh_research_pdfs`，并在 `run_fundamental_refresh` 的财报/预告/行业指数之后执行：

```python
refresh_research_metadata()
candidate_codes = [row["code"] for row in run_fundamental_screen("super-growth", {})[:200]]
candidate_codes += [row["code"] for row in run_fundamental_screen("oversold-bluechip", {})[:200]]
refresh_research_pdfs(sorted(set(candidate_codes)))
```

实现要求：
- Stage1 按 `report_id` upsert，不重复插入。
- Stage2 只处理 `candidate_codes` 内、`stage != "parsed"` 且有 `pdf_url` 的记录。
- 每处理一条更新 `/refresh/status` 中 `研报-全市场元数据` 或 `研报-候选池解析` 的 `done/total/progress`。
- 出错时当前任务组状态置为 `error` 并继续抛出异常，保持阶段2已有错误语义。

- [ ] **Step 4: 运行确认通过**

Run: `cd backend && ./venv/bin/pytest tests/test_refresh_fundamental.py -v`  
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add backend/app/refresh.py backend/tests/test_refresh_fundamental.py
git commit -m "feat(backend): add research refresh stages"
```

---

## Task 7: 前端策略1/2接真实 API

**Files:**
- Modify: `frontend/src/lib/api.ts`
- Modify: `frontend/src/App.tsx`

- [ ] **Step 1: 增加 API 方法**

在 `frontend/src/lib/api.ts` 的 import 中加入 `Candidate`，并在 `api` 对象中增加：

```ts
screenFundamental: (preset: string, params: Record<string, unknown> = {}) =>
  get<Candidate[]>(
    `/screen?preset=${encodeURIComponent(preset)}&params=${encodeURIComponent(JSON.stringify(params))}`,
  ),
```

- [ ] **Step 2: App 状态接入**

在 `frontend/src/App.tsx` 增加：

```ts
const [candidates, setCandidates] = useState(CANDIDATES)
const [loadingCandidates, setLoadingCandidates] = useState(false)

const loadFundamental = () => {
  setLoadingCandidates(true)
  api.screenFundamental(strategy, filter)
    .then(setCandidates)
    .catch(() => setCandidates([]))
    .finally(() => setLoadingCandidates(false))
}

useEffect(() => {
  if (!isTechnical) loadFundamental()
}, [strategy])
```

把 `FilterPanel` 的 `onApply={() => {}}` 改成 `onApply={loadFundamental}`，把 `CandidateResults candidates={CANDIDATES}` 改成 `CandidateResults candidates={candidates}`。如果 `loadingCandidates` 为 true，在 `CandidateResults` 上方渲染一行 `text-sm text-ink-soft` 的「正在筛选候选股...」。

- [ ] **Step 3: 运行前端类型检查**

Run: `cd frontend && npm run build`  
Expected: PASS。

- [ ] **Step 4: 提交**

```bash
git add frontend/src/lib/api.ts frontend/src/App.tsx
git commit -m "feat(frontend): connect fundamental screen to api"
```

---

## Task 8: 阶段3回归

**Files:**
- Verify only

- [ ] **Step 1: 后端全量测试**

Run: `cd backend && ./venv/bin/pytest -q`  
Expected: PASS。

- [ ] **Step 2: 前端构建**

Run: `cd frontend && npm run build`  
Expected: PASS。

- [ ] **Step 3: 手动 API 冒烟**

Run:

```bash
cd backend
./venv/bin/uvicorn app.main:app --reload
```

另一个终端执行：

```bash
curl -s 'http://127.0.0.1:8000/presets'
curl -s 'http://127.0.0.1:8000/screen?preset=super-growth&params=%7B%7D'
curl -s 'http://127.0.0.1:8000/screen?preset=oversold-bluechip&params=%7B%7D'
```

Expected: 三个请求均返回 JSON；无 500。

- [ ] **Step 4: 提交阶段收口**

```bash
git status --short
```

Expected: 工作区干净；如果只有本阶段文件改动未提交，提交：

```bash
git add backend frontend
git commit -m "test: verify stock screener phase 3"
```

---

## 阶段3 完成标准

- [ ] `research_reports` 表可存 Stage1 元数据和 Stage2 PDF 正文。
- [ ] 研报 Stage1 支持全市场元数据 upsert，Stage2 只解析候选池 PDF。
- [ ] 研报关键词命中、板块效应、α地位三个信号有固定样本单测。
- [ ] `/presets` 返回策略1/2/双线/B2 四个策略。
- [ ] `/screen?preset=super-growth` 和 `/screen?preset=oversold-bluechip` 返回 `Candidate[]`。
- [ ] 策略1/2前端视图不再只使用 mock 候选列表。
- [ ] `cd backend && ./venv/bin/pytest -q` 通过。
- [ ] `cd frontend && npm run build` 通过。
