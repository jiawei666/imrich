# 基本面策略页面重构 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 重构基本面策略筛选参数/打分/结果存储/前端 UI，使两个策略差异化、参数后生效、结果持久化，并新增行业表、宽基指数成分股表、单季度图表。

**Architecture:** 后端新增 `Industry`/`FundamentalCandidate`/`IndexConstituent` 三张表；`build_fundamental_rows` 接入动态阈值参数；`run_fundamental_screen_result` 读写独立结果表并暴露新接口；前端 `FilterPanel` 改为按 `preset.params` 动态渲染并移入左侧抽屉，结果列表新建独立组件带名称搜索/指数过滤/客户端排序；`StockDetail` 占位字段移至前端 `candidate` prop。

**Tech Stack:** Python/FastAPI/SQLAlchemy, React 19/TypeScript/Vite/Tailwind v4, SQLite

---

## 文件结构总览

新文件：
- `backend/tests/test_fundamental_candidate.py` — 新结果表读写测试

改动文件：
- `backend/app/models.py:1-152` — 新增 `Industry`、`FundamentalCandidate`、`IndexConstituent`
- `backend/app/data/fetch_fundamental.py:100-126` — 扩展现有抓取函数 + 新增加指数成分股抓取
- `backend/app/refresh.py:311-358` — 写 `Industry` 表 + 新增加指数成分股刷新
- `backend/app/presets.py:1-81` — 调整两个基本策略 params + `industry` 动态 options
- `backend/app/signals.py:84-95` — `low_position_oversold` 加 `yoy_threshold`
- `backend/app/fundamental_rows.py:38-132` — 阈值参数接入、行业过滤、`drawdown_from_high`
- `backend/app/fundamental_screen.py:1-95` — `_candidate`/`_display_signals`/`WEIGHTS` 扩展
- `backend/app/screen.py:153-208` — 新增 `run_fundamental_screen_result`
- `backend/app/main.py:155-199` — 新增 `/screen/fundamental/result` 路由
- `backend/app/stock_detail.py:1-57` — 单季度序列 + 移除占位字段
- `backend/tests/test_signals.py:61-67` — 新增 `low_position_oversold` yoy 阈值测试
- `backend/tests/test_fundamental_screen.py:1-63` — 新增 `oversold` 信号/risks/drawdownFromHigh 测试
- `backend/tests/test_fetch_fundamental.py:78-157` — 新增加指数成分股抓取测试
- `backend/tests/test_presets.py:1-33` — 验证新参数正确返回
- `frontend/src/types.ts:1-234` — `SignalKey`/`PresetParam`/`Candidate`/`QuarterPoint`/`StockDetail` 调整
- `frontend/src/lib/api.ts:53-111` — 新增 `screenFundamentalResult`
- `frontend/src/components/screener/FilterPanel.tsx` — 改为动态渲染 + 抽屉
- `frontend/src/components/screener/CandidateResults.tsx` — 替换为新结果列表组件
- `frontend/src/components/detail/StockDetailPanel.tsx` — 接 `candidate` prop
- `frontend/src/components/detail/ProfitRevenueChart.tsx` — 单季度/累计切换
- `frontend/src/data/signals.ts` — 删除 `KEYWORDS`
- `frontend/src/data/mock.ts` — 同步类型变更
- `frontend/src/App.tsx` — 基本面页面整体布局

---

### Task 1: 新增 `low_position_oversold` 的 `yoy_threshold` 参数

**Files:**
- Modify: `backend/app/signals.py:84-95`
- Modify: `backend/tests/test_signals.py:61-67`

- [ ] **Step 1: 更新 `low_position_oversold` 函数签名**

```python
def low_position_oversold(
    closes: list[float],
    current_yoy: Optional[float],
    drawdown_threshold: float = 0.35,
    yoy_threshold: float = 0.0,
) -> bool:
    if not closes or current_yoy is None or current_yoy <= yoy_threshold:
        return False
    peak = max(closes)
    if peak <= 0:
        return False
    drawdown = 1 - closes[-1] / peak
    return drawdown > drawdown_threshold
```

- [ ] **Step 2: 新增测试**

```python
def test_low_position_oversold_yoy_threshold():
    closes = [100.0] + [60.0] * 10
    assert low_position_oversold(closes, 15.0, yoy_threshold=10.0) is True
    assert low_position_oversold(closes, 15.0, yoy_threshold=20.0) is False
    assert low_position_oversold(closes, 0.0, yoy_threshold=0.0) is False
```

- [ ] **Step 3: 运行测试验证通过**

```bash
cd backend && source venv/bin/activate && pytest tests/test_signals.py -v
```
Expected: 全部 PASS

- [ ] **Step 4: Commit**

```bash
git add backend/app/signals.py backend/tests/test_signals.py
git commit -m "feat: low_position_oversold 新增 yoy_threshold 参数"
```

---

### Task 2: 新增 `Industry`/`FundamentalCandidate`/`IndexConstituent` 数据模型

**Files:**
- Modify: `backend/app/models.py:99-152`

- [ ] **Step 1: 在 `IndustryIndex` 类之后添加三个新模型**

```python
class Industry(Base):
    __tablename__ = "industries"

    code: Mapped[str] = mapped_column(String, primary_key=True)
    name: Mapped[str] = mapped_column(String)
    level: Mapped[int] = mapped_column(Integer)
    parent_name: Mapped[Optional[str]] = mapped_column(String, nullable=True)


class FundamentalCandidate(Base):
    __tablename__ = "fundamental_candidates"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    preset_id: Mapped[str] = mapped_column(String, index=True)
    code: Mapped[str] = mapped_column(String, index=True)
    name: Mapped[str] = mapped_column(String)
    industry: Mapped[str] = mapped_column(String, default="")
    score: Mapped[float] = mapped_column(Float)
    signals: Mapped[str] = mapped_column(String)
    extra_signals: Mapped[int] = mapped_column(Integer, default=0)
    net_profit_yoy: Mapped[float] = mapped_column(Float)
    revenue_yoy: Mapped[float] = mapped_column(Float)
    drawdown_from_high: Mapped[float] = mapped_column(Float)
    risks: Mapped[str] = mapped_column(String)
    params_json: Mapped[str] = mapped_column(String)
    rank: Mapped[int] = mapped_column(Integer)
    updated_at: Mapped[str] = mapped_column(String)

    __table_args__ = (
        Index("ix_fc_preset_code", "preset_id", "code"),
    )


class IndexConstituent(Base):
    __tablename__ = "index_constituents"

    index_code: Mapped[str] = mapped_column(String, primary_key=True)
    stock_code: Mapped[str] = mapped_column(String, primary_key=True)
    index_name: Mapped[str] = mapped_column(String)
```

- [ ] **Step 2: 运行已有测试确保新模型不破坏现有功能**

```bash
cd backend && source venv/bin/activate && pytest tests/test_models.py tests/test_db.py -v
```
Expected: 全部 PASS（自动建表兼容）

- [ ] **Step 3: Commit**

```bash
git add backend/app/models.py
git commit -m "feat: 新增 Industry/FundamentalCandidate/IndexConstituent 数据模型"
```

---

### Task 3: 扩展 `_candidate()` 输出 + `_display_signals` 新增 `oversold` + `WEIGHTS` 更新

**Files:**
- Modify: `backend/app/fundamental_screen.py:6-71`
- Modify: `backend/tests/test_fundamental_screen.py:1-63`

- [ ] **Step 1: 更新 `WEIGHTS` 和 `_display_signals`**

```python
WEIGHTS = {
    "highGrowth": 22,
    "newHigh": 18,
    "beatExpect": 16,
    "oversold": 15,
    "sectorEffect": 12,
    "industryNewHigh": 10,
    "alpha": 12,
    "orderFull": 5,
    "capexExpand": 5,
    "newProduct": 5,
    "domesticSub": 5,
    "industryRecover": 5,
    "valuationRepair": 5,
}


def _display_signals(row: dict) -> list[str]:
    signals: list[str] = []
    if row.get("high_growth"):
        signals.append("highGrowth")
    if row.get("price_new_high"):
        signals.append("newHigh")
    if row.get("beat_expect"):
        signals.append("beatExpect")
    if row.get("oversold"):
        signals.append("oversold")
    if row.get("sector_effect"):
        signals.append("sectorEffect")
    if row.get("industry_new_high"):
        signals.append("industryNewHigh")
    if row.get("alpha"):
        signals.append("alpha")
    signals.extend(row.get("research_signals") or [])
    return list(dict.fromkeys(signals))
```

- [ ] **Step 2: 更新 `_candidate()` 增加 `risks` 和 `drawdownFromHigh`**

```python
def _candidate(row: dict) -> dict:
    signals = _display_signals(row)
    scored = {**row, "signals": signals}
    research = [signal for signal in signals if signal in (row.get("research_signals") or [])]
    core = [signal for signal in signals if signal not in research]
    visible = core[:5]
    if research:
        visible.extend(research[: max(0, 6 - len(visible))])
    if len(visible) < 6:
        visible.extend(core[5 : 5 + (6 - len(visible))])
    visible = visible[:6]
    return {
        "code": row["code"],
        "name": row.get("name") or row["code"],
        "industry": row.get("industry") or "",
        "score": score_candidate(scored),
        "signals": visible,
        "extraSignals": max(len(signals) - len(visible), 0),
        "netProfitYoY": float(row.get("netProfitYoY") or 0),
        "revenueYoY": float(row.get("revenueYoY") or 0),
        "risks": [
            {"label": "业绩持续下滑", "ok": not row.get("risk_profit_decline")},
            {"label": "股价创历史新低", "ok": not row.get("risk_price_new_low")},
            {"label": "行业景气下行", "ok": not row.get("risk_industry_down")},
        ],
        "drawdownFromHigh": round(float(row.get("drawdown_from_high") or 0), 4),
    }
```

- [ ] **Step 3: 更新现有测试适配新字段，增加 `oversold` 信号测试**

```python
from app.fundamental_screen import run_fundamental_screen_from_rows, score_candidate


def test_score_candidate_adds_weighted_signals_and_caps_at_100():
    row = {
        "signals": ["highGrowth", "newHigh", "beatExpect", "oversold", "sectorEffect", "industryNewHigh", "alpha"],
        "netProfitYoY": 80,
        "revenueYoY": 40,
    }
    assert score_candidate(row) == 100.0


def test_super_growth_requires_growth_new_high_and_research_keyword():
    rows = [
        {
            "code": "sz000001",
            "name": "平安银行",
            "industry": "银行",
            "high_growth": True,
            "beat_expect": True,
            "profit_record": True,
            "price_new_high": True,
            "industry_new_high": True,
            "research_signals": ["orderFull"],
            "sector_effect": True,
            "alpha": True,
            "oversold": False,
            "risk_profit_decline": False,
            "risk_price_new_low": False,
            "risk_industry_down": False,
            "netProfitYoY": 70,
            "revenueYoY": 30,
            "drawdown_from_high": 0.05,
        }
    ]
    out = run_fundamental_screen_from_rows("super-growth", rows, {})
    assert out[0]["code"] == "sz000001"
    assert "highGrowth" in out[0]["signals"]
    assert "orderFull" in out[0]["signals"]
    assert out[0]["risks"][0]["ok"] is True
    assert out[0]["drawdownFromHigh"] == 0.05


def test_oversold_signal_included():
    rows = [
        {
            "code": "sz000001",
            "name": "平安银行",
            "industry": "银行",
            "high_growth": False,
            "beat_expect": False,
            "profit_record": False,
            "price_new_high": False,
            "industry_new_high": False,
            "research_signals": ["valuationRepair"],
            "sector_effect": False,
            "alpha": False,
            "oversold": True,
            "risk_profit_decline": False,
            "risk_price_new_low": False,
            "risk_industry_down": False,
            "netProfitYoY": 10,
            "revenueYoY": 5,
            "drawdown_from_high": 0.42,
        }
    ]
    out = run_fundamental_screen_from_rows("oversold-bluechip", rows, {})
    assert len(out) == 1
    assert "oversold" in out[0]["signals"]
    assert "valuationRepair" in out[0]["signals"]


def test_oversold_bluechip_rejects_industry_down_risk():
    rows = [
        {
            "code": "sz000001",
            "name": "平安银行",
            "industry": "银行",
            "high_growth": False,
            "beat_expect": False,
            "profit_record": False,
            "price_new_high": False,
            "industry_new_high": False,
            "research_signals": ["valuationRepair"],
            "sector_effect": False,
            "alpha": False,
            "oversold": True,
            "risk_profit_decline": False,
            "risk_price_new_low": False,
            "risk_industry_down": True,
            "netProfitYoY": 10,
            "revenueYoY": 5,
            "drawdown_from_high": 0.42,
        }
    ]
    assert run_fundamental_screen_from_rows("oversold-bluechip", rows, {}) == []


def test_candidate_risks_mapped_correctly():
    rows = [
        {
            "code": "sz000001",
            "name": "平安银行",
            "industry": "银行",
            "high_growth": True,
            "beat_expect": False,
            "profit_record": False,
            "price_new_high": True,
            "industry_new_high": False,
            "research_signals": ["orderFull"],
            "sector_effect": False,
            "alpha": False,
            "oversold": False,
            "risk_profit_decline": True,
            "risk_price_new_low": False,
            "risk_industry_down": True,
            "netProfitYoY": 70,
            "revenueYoY": 30,
            "drawdown_from_high": 0.05,
        }
    ]
    out = run_fundamental_screen_from_rows("super-growth", rows, {})
    risks = out[0]["risks"]
    assert risks[0] == {"label": "业绩持续下滑", "ok": False}
    assert risks[2] == {"label": "行业景气下行", "ok": False}
```

- [ ] **Step 4: 运行测试验证**

```bash
cd backend && source venv/bin/activate && pytest tests/test_fundamental_screen.py -v
```
Expected: 全部 PASS

- [ ] **Step 5: Commit**

```bash
git add backend/app/fundamental_screen.py backend/tests/test_fundamental_screen.py
git commit -m "feat: _candidate 新增 risks/drawdownFromHigh; 新增 oversold 信号; WEIGHTS 扩展"
```

---

### Task 4: `build_fundamental_rows` 接入动态阈值 + 行业过滤 + `drawdown_from_high`

**Files:**
- Modify: `backend/app/fundamental_rows.py:38-132`

- [ ] **Step 1: 修改调用处接入阈值参数和 `drawdown_from_high`**

修改 `build_fundamental_rows` 中构造 row 的部分（约 104-126 行）：

```python
        industry_hist = industry_by_name.get(stock.industry or "", [])
        industry_closes = [float(row.close) for row in industry_hist]
        drawdown_from_high = 0.0
        if closes:
            peak = max(closes)
            if peak > 0:
                drawdown_from_high = 1 - closes[-1] / peak
        rows.append(
            {
                "code": stock.code,
                "name": stock.name,
                "industry": stock.industry or "",
                "high_growth": high_growth(financial.net_profit_yoy, threshold=float(params.get("netProfitYoY", 50))),
                "beat_expect": beat_expect(financial.net_profit_yoy, history_yoys=yoy_history, forecast_change_pct=forecast_change),
                "profit_record": profit_new_high([row.net_profit for row in report_history]),
                "price_new_high": price_new_high(closes),
                "industry_new_high": industry_new_high(industry_closes),
                "research_signals": keyword_hits(text),
                "research_hit": research_hit,
                "sector_effect": False,
                "alpha": False,
                "oversold": low_position_oversold(
                    closes, financial.net_profit_yoy,
                    drawdown_threshold=float(params.get("drawdownMin", 35)) / 100,
                    yoy_threshold=float(params.get("netProfitYoY", 0)),
                ),
                "risk_profit_decline": risk_profit_decline(report_history),
                "risk_price_new_low": risk_price_new_low(closes),
                "risk_industry_down": risk_industry_down(industry_closes),
                "netProfitYoY": financial.net_profit_yoy or 0,
                "revenueYoY": financial.revenue_yoy or 0,
                "market_cap": stock.market_cap or 0,
                "return_pct": ((closes[-1] - closes[0]) / closes[0] * 100) if len(closes) >= 2 and closes[0] else 0,
                "drawdown_from_high": drawdown_from_high,
            }
        )

    # 行业过滤（在 sector_effect/alpha 计算之前）
    if params.get("industry"):
        rows = [r for r in rows if r["industry"] == params["industry"]]

    for row in rows:
        row["sector_effect"] = sector_effect(row["industry"], rows)
        row["alpha"] = alpha_rank(row["code"], rows)
    return rows
```

- [ ] **Step 2: 运行已有单测确保兼容**

```bash
cd backend && source venv/bin/activate && pytest tests/test_fundamental_screen.py -v
```
Expected: 全部 PASS

- [ ] **Step 3: Commit**

```bash
git add backend/app/fundamental_rows.py
git commit -m "feat: build_fundamental_rows 接入动态阈值、行业过滤、drawdown_from_high"
```

---

### Task 5: `run_fundamental_screen_from_rows` 增加 `revenueYoY` 过滤条件

**Files:**
- Modify: `backend/app/fundamental_screen.py:74-88`

- [ ] **Step 1: 修改 super-growth 过滤逻辑**

```python
def run_fundamental_screen_from_rows(preset_id: str, rows: list[dict], params: dict[str, Any]) -> list[dict]:
    out: list[dict] = []
    for row in rows:
        if _has_common_risk(row):
            continue
        if preset_id == "super-growth":
            if not (
                row.get("high_growth") and row.get("price_new_high") and row.get("research_signals")
                and (row.get("revenueYoY") or 0) > params.get("revenueYoY", 20)
            ):
                continue
        elif preset_id == "oversold-bluechip":
            if row.get("risk_industry_down") or not row.get("oversold"):
                continue
        else:
            raise KeyError(f"未知基本面预设: {preset_id}")
        out.append(_candidate(row))
    out.sort(key=lambda item: (item["score"], item["code"]), reverse=True)
    return out
```

- [ ] **Step 2: 运行测试**

```bash
cd backend && source venv/bin/activate && pytest tests/test_fundamental_screen.py -v
```
Expected: 全部 PASS（现有 super-growth 测试里 `revenueYoY=30 > params默认20`，仍通过）

- [ ] **Step 3: Commit**

```bash
git add backend/app/fundamental_screen.py
git commit -m "feat: super-growth 增加 revenueYoY 过滤条件"
```

---

### Task 6: 调整 `presets.py` 策略参数 + `industry` 动态 options

**Files:**
- Modify: `backend/app/presets.py:58-81`

- [ ] **Step 1: 更新 `_FUNDAMENTAL_PRESETS`**

```python
_FUNDAMENTAL_PRESETS = [
    {
        "id": "super-growth", "category": "fundamental", "name": "创新高超级成长",
        "params": [
            {"key": "netProfitYoY", "label": "净利润同比下限", "value": 50, "min": 0, "max": 200, "step": 5, "unit": "%"},
            {"key": "revenueYoY", "label": "营收同比下限", "value": 20, "min": 0, "max": 200, "step": 5, "unit": "%"},
            {"key": "keywordWindow", "label": "研报关键词时间窗", "value": 90, "min": 30, "max": 180, "step": 30, "unit": "日"},
            {"key": "industry", "label": "行业过滤", "value": "", "type": "select", "options": []},
        ],
    },
    {
        "id": "oversold-bluechip", "category": "fundamental", "name": "低位错杀蓝筹",
        "params": [
            {"key": "drawdownMin", "label": "距一年高回撤下限", "value": 35, "min": 10, "max": 80, "step": 5, "unit": "%"},
            {"key": "netProfitYoY", "label": "净利润同比下限", "value": 0, "min": -50, "max": 100, "step": 5, "unit": "%"},
            {"key": "keywordWindow", "label": "研报关键词时间窗", "value": 90, "min": 30, "max": 180, "step": 30, "unit": "日"},
            {"key": "industry", "label": "行业过滤", "value": "", "type": "select", "options": []},
        ],
    },
]
```

- [ ] **Step 2: 在 `get_presets()` 中为 `industry` 参数填充运行时 options**

在 `app/presets.py` 顶部的 `get_presets()` 函数中（需确认现有位置后修改），在返回前遍历 fundamental presets 中的 `industry` 参数：

```python
def get_presets():
    from app.db import SessionLocal
    from app.models import Industry

    presets = _TECHNICAL_PRESETS + _FUNDAMENTAL_PRESETS

    # 为 industry 参数填充运行时选项
    with SessionLocal() as s:
        rows = s.query(Industry).filter_by(level=2).order_by(Industry.parent_name, Industry.name).all()
    industry_options = [
        {"value": row.name, "label": row.name, "group": row.parent_name or ""}
        for row in rows
    ] if rows else [
        {"value": "银行", "label": "银行", "group": "金融服务"},
        {"value": "电力设备", "label": "电力设备", "group": "制造业"},
    ]  # 兜底：DB 空时给几个示例选项

    for p in presets:
        if p["category"] == "fundamental":
            for param in p["params"]:
                if param["key"] == "industry":
                    param["options"] = [{"value": "", "label": "全部行业"}] + industry_options
    return presets
```

- [ ] **Step 3: 运行 presets 测试**

```bash
cd backend && source venv/bin/activate && pytest tests/test_presets.py -v
```
Expected: 若测试失败（industry 参数带 type/options 新字段），更新 `test_presets.py` 的 `test_get_presets_returns_fundamental_and_technical` 以适配新字段。

- [ ] **Step 4: Commit**

```bash
git add backend/app/presets.py backend/tests/test_presets.py
git commit -m "feat: presets 调整参数字段 + industry 动态 options"
```

---

### Task 7: 新增宽基指数成分股抓取函数

**Files:**
- Modify: `backend/app/data/fetch_fundamental.py:100-127`
- Modify: `backend/tests/test_fetch_fundamental.py:157+`

- [ ] **Step 1: 在 `fetch_fundamental.py` 末尾添加抓取函数**

```python
def get_index_constituents(index_code: str) -> list[str]:
    """拉取中证指数成分股列表，返回带市场前缀的 stock_code 列表"""
    df = _retry(lambda: ak.index_stock_cons_csindex(symbol=index_code))
    codes: list[str] = []
    for _, r in df.iterrows():
        raw = str(r["成分券代码"])
        code = raw.zfill(6)
        if code.startswith(("6", "9")):
            codes.append(f"sh{code}")
        else:
            codes.append(f"sz{code}")
    return codes


# 预定义的中证系宽基指数列表
CS_INDEX_LIST = [
    ("000300", "沪深300"),
    ("000905", "中证500"),
    ("000852", "中证1000"),
    ("000688", "科创50"),
    ("000016", "上证50"),
]
```

`_norm_code` 函数已经可以处理代码标准化逻辑，直接使用 `_retry` 作为重试装饰器（现有模式）。

- [ ] **Step 2: 新增测试**

```python
def test_get_index_constituents_returns_codes(monkeypatch):
    import pandas as pd
    from app.data.fetch_fundamental import get_index_constituents

    def fake_cons(symbol):
        return pd.DataFrame([{"成分券代码": "000001"}, {"成分券代码": "600519"}])

    monkeypatch.setattr("akshare.index_stock_cons_csindex", fake_cons)
    codes = get_index_constituents("000300")
    assert "sz000001" in codes
    assert "sh600519" in codes


def test_get_index_constituents_retries_on_transient_error(monkeypatch):
    from app.data.fetch_fundamental import get_index_constituents

    call_count = [0]

    def flaky(symbol):
        call_count[0] += 1
        if call_count[0] < 2:
            raise ConnectionError("transient")
        import pandas as pd
        return pd.DataFrame([{"成分券代码": "000001"}])

    monkeypatch.setattr("akshare.index_stock_cons_csindex", flaky)
    codes = get_index_constituents("000300")
    assert "sz000001" in codes
```

- [ ] **Step 3: 运行测试**

```bash
cd backend && source venv/bin/activate && pytest tests/test_fetch_fundamental.py::test_get_index_constituents_returns_codes tests/test_fetch_fundamental.py::test_get_index_constituents_retries_on_transient_error -v
```
Expected: 全部 PASS

- [ ] **Step 4: Commit**

```bash
git add backend/app/data/fetch_fundamental.py backend/tests/test_fetch_fundamental.py
git commit -m "feat: 新增宽基指数成分股抓取函数"
```

---

### Task 8: 行业数据刷新扩展（一级行业 + 二级行业 parent_name + 宽基指数成分股）

**Files:**
- Modify: `backend/app/data/fetch_fundamental.py:100-104`
- Modify: `backend/app/refresh.py:311-358`

- [ ] **Step 1: 扩展 `get_sw_industries` 返回 `parent_name`，新增 `get_sw_industries_first`**

```python
def get_sw_industries_first() -> list[dict]:
    """一级行业列表。"""
    df = ak.sw_index_first_info()
    return [{"code": str(r["行业代码"]).removesuffix(".SI"), "name": str(r["行业名称"])} for _, r in df.iterrows()]


def get_sw_industries() -> list[dict]:
    """二级行业列表（含 parent_name）。"""
    df = ak.sw_index_second_info()
    return [
        {
            "code": str(r["行业代码"]).removesuffix(".SI"),
            "name": str(r["行业名称"]),
            "parent_name": str(r["上级行业"]),
        }
        for _, r in df.iterrows()
    ]
```

- [ ] **Step 2: 修改 `_refresh_industry_index` 写入 `Industry` 表**

在 `_refresh_industry_index` 函数开头（`step = group.steps[2]` 之前），插入写 `Industry` 表的逻辑：

```python
def _refresh_industry_index(
    group: RefreshGroup,
    industries_fn: Callable[[], list],
    industry_hist_fn: Callable[[str], pd.DataFrame],
    constituents_fn: Callable[[str], list],
) -> None:
    step = group.steps[2]

    # 写入一级行业
    from app.data.fetch_fundamental import get_sw_industries_first
    try:
        first_industries = get_sw_industries_first()
        with SessionLocal() as s:
            for ind in first_industries:
                obj = s.get(Industry, ind["code"])
                if obj is None:
                    obj = Industry(code=ind["code"])
                    s.add(obj)
                obj.name = ind["name"]
                obj.level = 1
                obj.parent_name = None
            s.commit()
    except Exception:
        logger.warning("一级行业写入失败", exc_info=True)

    # 写入二级行业
    industries = industries_fn()
    try:
        with SessionLocal() as s:
            for ind in industries:
                obj = s.get(Industry, ind["code"])
                if obj is None:
                    obj = Industry(code=ind["code"])
                    s.add(obj)
                obj.name = ind["name"]
                obj.level = 2
                obj.parent_name = ind.get("parent_name")
            s.commit()
    except Exception:
        logger.warning("行业维度表写入失败", exc_info=True)

    step.total = len(industries)
    step.done = 0
    step.progress = 0
    # ... 后续逐行业抓取历史保持不变
```

- [ ] **Step 3: 新增宽基指数成分股刷新函数**

在 `app/refresh.py` 中新增：

```python
def _refresh_index_constituents() -> None:
    """刷新宽基指数成分股（中证系）。"""
    from app.data.fetch_fundamental import get_index_constituents, CS_INDEX_LIST
    from app.models import IndexConstituent

    with SessionLocal() as s:
        for index_code, index_name in CS_INDEX_LIST:
            try:
                codes = get_index_constituents(index_code)
            except Exception:
                logger.warning("宽基指数 %s 成分股抓取失败", index_code, exc_info=True)
                continue
            s.query(IndexConstituent).filter_by(index_code=index_code).delete()
            for code in codes:
                s.add(IndexConstituent(index_code=index_code, stock_code=code, index_name=index_name))
            s.commit()
```

在 `run_fundamental_refresh` 中，`run_industry_refresh` 完成后添加对 `_refresh_index_constituents` 的调用。考虑到这部分不是面向用户的独立步骤，可以放在 `run_industry_refresh` 函数末尾，或作为 `run_fundamental_refresh` 函数中线程池的额外任务。

最简单方案：在 `run_fundamental_refresh` 函数中，`ThreadPoolExecutor` 的 `futures` 里添加：

```python
pool.submit(_refresh_index_constituents): 0.5,
```

放在 `pool.submit(run_industry_refresh, ...)` 之后。

- [ ] **Step 4: 运行现有刷新测试确保兼容**

```bash
cd backend && source venv/bin/activate && pytest tests/test_refresh_fundamental.py -v
```
Expected: 全部 PASS

- [ ] **Step 5: Commit**

```bash
git add backend/app/data/fetch_fundamental.py backend/app/refresh.py
git commit -m "feat: 行业刷新扩展一级/二级; 新增宽基指数成分股刷新"
```

---

### Task 9: 更新 `stock_detail.py`（单季度序列 + 移除占位字段）

**Files:**
- Modify: `backend/app/stock_detail.py:1-57`
- Modify: `backend/tests/test_stock_detail.py:1-32`

- [ ] **Step 1: 修改 `get_stock_detail`**

```python
from app.signals import compute_single_quarter_series


def get_stock_detail(code: str):
    with SessionLocal() as s:
        stock = s.get(Stock, code)
        if stock is None:
            raise HTTPException(status_code=404, detail="股票不存在")
        financials = (
            s.query(FinancialReport)
            .filter_by(code=code)
            .order_by(FinancialReport.report_date)
            .all()
        )
        report_dates = [row.report_date for row in financials]
        net_profit_q = compute_single_quarter_series(
            report_dates, [row.net_profit for row in financials]
        )
        revenue_q = compute_single_quarter_series(
            report_dates, [row.revenue for row in financials]
        )

    def _quarter(report_date: str) -> str:
        y = report_date[:4]
        m = report_date[5:7]
        return f"{y}Q{int((int(m) - 1) // 3 + 1)}"

    klines = _load_klines(code)
    high_line = max((k["close"] for k in klines["day"]), default=10)
    high_label = "年内最高"

    return {
        "code": stock.code,
        "name": stock.name or stock.code,
        "industry": stock.industry or "",
        "subIndustry": stock.industry or "",
        "price": klines["day"][-1]["close"] if klines["day"] else 10,
        "yearHigh": high_line,
        "yearHighDate": max((k["date"] for k in klines["day"]), default="") if klines["day"] else "",
        "quarters": [
            {
                "quarter": _quarter(row.report_date),
                "netProfit": (row.net_profit or 0) / 1e8,
                "revenue": (row.revenue or 0) / 1e8,
                "netProfitQuarterly": (net_profit_q[i] / 1e8) if net_profit_q[i] is not None else None,
                "revenueQuarterly": (revenue_q[i] / 1e8) if revenue_q[i] is not None else None,
            }
            for i, row in enumerate(financials)
        ],
        "latestNote": financials[-1].net_profit_yoy_text if financials else "",
        "klineDay": klines["day"],
        "klineWeek": klines["week"],
        "klineMonth": klines["month"],
        "klineQuarter": klines["quarter"],
        "highLine": high_line,
        "reports": [
            {"title": r.title, "org": r.org, "date": r.published_at}
            for r in s.query(ResearchReport)
            .filter_by(code=code, stage="parsed")
            .order_by(ResearchReport.published_at.desc())
            .limit(10)
            .all()
        ],
    }
```

**移除的字段**：`score`, `scoreDelta`, `signals`, `signalCount`, `drawdownFromHigh`, `risks`。

- [ ] **Step 2: 更新测试**

```python
def test_get_stock_detail_returns_quarterly_data(db_path):
    init_db()
    with SessionLocal() as s:
        s.add(Stock(code="sz000001", name="平安银行", industry="银行"))
        s.add(KlineDay(code="sz000001", date="2026-06-10", open=10, close=12, high=13, low=9, volume=100))
        s.add(KlineWeek(code="sz000001", date="2026-06-06", open=10, close=12, high=13, low=9, volume=100))
        s.add(KlineMonth(code="sz000001", date="2026-06-01", open=10, close=12, high=13, low=9, volume=100))
        s.add(KlineQuarter(code="sz000001", date="2026-06-01", open=10, close=12, high=13, low=9, volume=100))
        s.add(FinancialReport(
            code="sz000001", report_date="2025-03-31",
            net_profit=100000000, net_profit_yoy=60,
            revenue=500000000, revenue_yoy=20, gross_margin=30,
        ))
        s.add(FinancialReport(
            code="sz000001", report_date="2025-06-30",
            net_profit=250000000, net_profit_yoy=55,
            revenue=1200000000, revenue_yoy=18, gross_margin=28,
        ))
        s.add(ResearchReport(report_id="R1", code="sz000001", title="订单饱满", org="测试证券",
                             published_at="2026-06-01", stage="parsed"))
        s.commit()
    detail = get_stock_detail("sz000001")
    assert detail["code"] == "sz000001"
    assert detail["quarters"][0]["quarter"] == "2025Q1"
    assert detail["quarters"][0]["netProfitQuarterly"] == pytest.approx(1.0)
    # Q2 单季度 = 250M - 100M = 150M → 1.5 亿
    assert detail["quarters"][1]["netProfitQuarterly"] == pytest.approx(1.5)
    assert detail["reports"][0]["title"] == "订单饱满"
    # 确保占位字段已移除
    assert "score" not in detail
    assert "signals" not in detail
    assert "risks" not in detail
```

- [ ] **Step 3: 运行测试**

```bash
cd backend && source venv/bin/activate && pytest tests/test_stock_detail.py -v
```
Expected: 全部 PASS

- [ ] **Step 4: Commit**

```bash
git add backend/app/stock_detail.py backend/tests/test_stock_detail.py
git commit -m "feat: stock_detail 接入单季度序列；移除 score/signals/risks 占位字段"
```

---

### Task 10: 新增 `run_fundamental_screen_result` + `/screen/fundamental/result` 路由

**Files:**
- Modify: `backend/app/screen.py:153-208`
- Modify: `backend/app/main.py:155-199`

- [ ] **Step 1: 在 `app/screen.py` 末尾添加函数**

```python
def run_fundamental_screen_result(preset_id: str, params: dict | None = None) -> dict:
    from app.fundamental_screen import run_fundamental_screen
    from app.models import FundamentalCandidate

    if preset_id not in FUNDAMENTAL_PRESETS:
        raise KeyError(f"未知基本面预设: {preset_id}")

    if params is None:
        with SessionLocal() as s:
            rows = (
                s.query(FundamentalCandidate)
                .filter_by(preset_id=preset_id)
                .order_by(FundamentalCandidate.rank)
                .all()
            )
        items = [
            {
                "code": r.code,
                "name": r.name,
                "industry": r.industry,
                "score": r.score,
                "signals": json.loads(r.signals),
                "extraSignals": r.extra_signals,
                "netProfitYoY": r.net_profit_yoy,
                "revenueYoY": r.revenue_yoy,
                "risks": json.loads(r.risks),
                "drawdownFromHigh": r.drawdown_from_high,
            }
            for r in rows
        ]
        updated_at = max((r.updated_at for r in rows), default=None)
    else:
        candidates = run_fundamental_screen(preset_id, params)
        params_json = json.dumps(params, sort_keys=True)
        now = datetime.now().isoformat()
        with SessionLocal() as s:
            s.query(FundamentalCandidate).filter_by(preset_id=preset_id).delete()
            for i, c in enumerate(candidates):
                s.add(FundamentalCandidate(
                    preset_id=preset_id,
                    code=c["code"],
                    name=c["name"],
                    industry=c["industry"],
                    score=c["score"],
                    signals=json.dumps(c["signals"]),
                    extra_signals=c["extraSignals"],
                    net_profit_yoy=c["netProfitYoY"],
                    revenue_yoy=c["revenueYoY"],
                    drawdown_from_high=c.get("drawdownFromHigh", 0),
                    risks=json.dumps(c.get("risks", [])),
                    params_json=params_json,
                    rank=i + 1,
                    updated_at=now,
                ))
            s.commit()
        items = candidates
        updated_at = now

    return {"items": items, "total": len(items), "updatedAt": updated_at}
```

- [ ] **Step 2: 在 `app/main.py` 添加路由**

```python
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
```

- [ ] **Step 3: 编写测试**

```python
# backend/tests/test_fundamental_candidate.py
def test_run_fundamental_screen_result_saves_and_reads(db_path):
    from app.screen import run_fundamental_screen_result
    from app.db import init_db, SessionLocal
    from app.models import Stock, FinancialReport, KlineDay

    init_db()
    with SessionLocal() as s:
        s.add(Stock(code="sz000001", name="平安银行", industry="银行"))
        s.add(FinancialReport(
            code="sz000001", report_date="2025-03-31",
            net_profit=1e9, net_profit_yoy=70, revenue=5e9, revenue_yoy=35, gross_margin=30,
        ))
        s.add(KlineDay(code="sz000001", date="2025-06-10", open=10, close=12, high=13, low=9, volume=100))
        s.commit()

    result = run_fundamental_screen_result("super-growth", {"netProfitYoY": 60, "revenueYoY": 30})
    assert result["total"] > 0
    assert result["updatedAt"] is not None

    # 不带 params 应返回上次结果
    cached = run_fundamental_screen_result("super-growth")
    assert cached["total"] == result["total"]
```

```bash
cd backend && source venv/bin/activate && pytest tests/test_fundamental_candidate.py -v
```
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add backend/app/screen.py backend/app/main.py backend/tests/test_fundamental_candidate.py
git commit -m "feat: 新增 /screen/fundamental/result 接口 + FundamentalCandidate 表读写"
```

---

### Task 11: 新增 `/indices` 接口返回宽基指数列表

**Files:**
- Modify: `backend/app/main.py:~150-152`

- [ ] **Step 1: 在 `app/main.py` 添加独立路由**

`get_meta()` 在 `app/meta.py` 中，职责单一（数据刷新状态），不适合加指数列表。新增独立接口：

```python
@app.get("/indices")
def list_indices():
    from app.models import IndexConstituent
    with SessionLocal() as s:
        rows = s.query(IndexConstituent.index_code, IndexConstituent.index_name).distinct().all()
    return [{"indexCode": r.index_code, "indexName": r.index_name} for r in rows]
```

- [ ] **Step 2: Commit**

```bash
git add backend/app/main.py
git commit -m "feat: 新增 /indices 接口返回宽基指数列表"
```

---

### Task 12: 前端类型定义更新

**Files:**
- Modify: `frontend/src/types.ts`

- [ ] **Step 1: 更新 `SignalKey`、`PresetParam`、`Candidate`、`QuarterPoint`、`StockDetail`、新增接口类型**

在 `frontend/src/types.ts` 中做如下改动：

```typescript
// SignalKey 新增
export type SignalKey =
  | 'highGrowth'
  | 'newHigh'
  | 'beatExpect'
  | 'sectorEffect'
  | 'industryNewHigh'
  | 'alpha'
  | 'orderFull'
  | 'capexExpand'
  | 'newProduct'
  | 'domesticSub'
  | 'industryRecover'
  | 'valuationRepair'
  | 'oversold' // 低位超跌

// Candidate 新增 fields
export interface Candidate {
  code: string
  name: string
  industry: string
  score: number
  signals: SignalKey[]
  extraSignals: number
  netProfitYoY: number
  revenueYoY: number
  risks: RiskItem[]
  drawdownFromHigh: number
}

// QuarterPoint 新增 fields
export interface QuarterPoint {
  quarter: string
  netProfit: number
  revenue: number
  netProfitQuarterly: number | null
  revenueQuarterly: number | null
}

// PresetParam 扩展 type/options
export interface PresetParam {
  key: string
  label: string
  type?: 'number' | 'select'
  value: number | string
  min?: number
  max?: number
  step?: number
  unit?: string
  options?: { value: string; label: string; group?: string }[]
}

// StockDetail 移除 score/scoreDelta/signals/signalCount/drawdownFromHigh/risks
export interface StockDetail {
  code: string
  name: string
  industry: string
  subIndustry: string
  price: number
  yearHigh: number
  yearHighDate: string
  quarters: QuarterPoint[]
  latestNote: string
  klineDay: Kline[]
  klineWeek: Kline[]
  klineMonth: Kline[]
  klineQuarter: Kline[]
  highLine: number
  reports: ResearchReport[]
}

// 新增
export interface FundamentalScreenResultResponse {
  items: Candidate[]
  total: number
  updatedAt: string | null
}

export interface IndexInfo {
  indexCode: string
  indexName: string
}
```

- [ ] **Step 2: 运行 TypeScript 类型检查**

```bash
cd frontend && npm run build
```
Expected: 此时可能有类型错误（因为引用 `StockDetail` 占位字段的组件还没更新），记录下所有报错，在后续前端任务中逐一修复。

- [ ] **Step 3: Commit**

```bash
git add frontend/src/types.ts
git commit -m "feat: 更新前端类型定义（SignalKey/Candidate/QuarterPoint/StockDetail/PresetParam）"
```

---

### Task 13: 前端 API 层新增 `screenFundamentalResult` + 指数列表接口

**Files:**
- Modify: `frontend/src/lib/api.ts:53-111`

- [ ] **Step 1: 添加新 API 方法**

```typescript
screenFundamentalResult: (preset: string, params?: Record<string, number | string>) => {
  const qs = new URLSearchParams()
  qs.set('preset', preset)
  if (params) qs.set('params', JSON.stringify(params))
  return get<FundamentalScreenResultResponse>(`/screen/fundamental/result?${qs.toString()}`)
},

/** 获取可用宽基指数列表 */
listIndices: () => get<IndexInfo[]>('/indices'),
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/lib/api.ts
git commit -m "feat: api 新增 screenFundamentalResult 和 listIndices"
```

---

### Task 14: `FilterPanel` 动态化 + 左侧抽屉

**Files:**
- Modify: `frontend/src/components/screener/FilterPanel.tsx:1-167`

整个组件重写。核心逻辑：

- `FilterPanel` 不再管理 `FilterState`，改为接收 `preset: Preset` prop，按 `preset.params` 动态渲染
- 移至左侧抽屉容器内（抽屉在外层 `FundamentalScreenView` 组件中管理，`FilterPanel` 本身只渲染筛选卡片内容）
- 每个 `param` 按 `type` 渲染：`'select'` → 下拉（行业过滤）；缺省 → 滑块

```tsx
import { Slider } from '@/components/ui/slider'
import type { Preset, PresetParam } from '@/types'

export function FilterPanel({
  preset,
  paramValues,
  onParamChange,
  onApply,
  loading,
}: {
  preset: Preset
  paramValues: Record<string, number | string>
  onParamChange: (key: string, value: number | string) => void
  onApply: () => void
  loading: boolean
}) {
  return (
    <div className="space-y-5">
      {preset.params.map((param) => (
        <div key={param.key} className="space-y-1.5">
          <label className="text-[11px] font-medium text-ink-soft">{param.label}</label>
          {param.type === 'select' ? (
            <select
              className="w-full rounded-md border border-line bg-paper-2 px-2 py-1 text-xs"
              value={String(paramValues[param.key] ?? param.value)}
              onChange={(e) => onParamChange(param.key, e.target.value)}
            >
              {(param.options ?? []).map((opt) =>
                opt.group ? (
                  <optgroup key={opt.group} label={opt.group}>
                    <option value={opt.value}>{opt.label}</option>
                  </optgroup>
                ) : (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                )
              )}
            </select>
          ) : (
            <>
              <Slider
                defaultValue={[Number(paramValues[param.key] ?? param.value)]}
                min={param.min ?? 0}
                max={param.max ?? 100}
                step={param.step ?? 1}
                onValueChange={([v]) => onParamChange(param.key, v)}
              />
              <div className="text-right text-[10px] text-ink-faint">
                {paramValues[param.key] ?? param.value}{param.unit ?? ''}
              </div>
            </>
          )}
        </div>
      ))}
      <button
        className="w-full rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
        onClick={onApply}
        disabled={loading}
      >
        {loading ? '筛选中...' : '运行筛选'}
      </button>
    </div>
  )
}
```

导出类型保留兼容：

```typescript
export type FilterState = Record<string, number | string>
```

（`FilterState` 不再是固定 interface，而是动态字典）

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/screener/FilterPanel.tsx
git commit -m "refactor: FilterPanel 改为按 preset.params 动态渲染"
```

---

### Task 15: 新建基本面结果列表组件 `FundamentalCandidateListCard`

**Files:**
- Create: `frontend/src/components/screener/FundamentalCandidateListCard.tsx`

新建独立组件，不修改现有 `CandidateResults.tsx`（保留向后兼容）。顶部工具栏包含名称搜索+指数过滤+排序下拉，主体为固定高度滚动列表。

```tsx
import { useState, useMemo } from 'react'
import { Search } from 'lucide-react'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import type { Candidate, SignalKey, IndexInfo, SortOrder } from '@/types'

type SortField = 'score' | 'netProfitYoY' | 'revenueYoY'

const SIGNAL_LABELS: Record<SignalKey, string> = {
  highGrowth: '业绩大增', newHigh: '创新高', beatExpect: '超预期',
  sectorEffect: '板块效应', industryNewHigh: '行业指数新高', alpha: 'α地位',
  orderFull: '订单饱满', capexExpand: '产能扩张', newProduct: '新产品',
  domesticSub: '国产替代', industryRecover: '行业复苏', valuationRepair: '估值修复',
  oversold: '低位超跌',
}

export function FundamentalCandidateListCard({
  items,
  total,
  updatedAt,
  selectedCode,
  onSelectCode,
  indices,
  indexConstituentMap,
  showDrawdown,
}: {
  items: Candidate[]
  total: number
  updatedAt: string | null
  selectedCode: string | null
  onSelectCode: (code: string, name: string) => void
  indices: IndexInfo[]
  indexConstituentMap: Record<string, Set<string>>  // indexCode → stock_codes
  showDrawdown: boolean  // oversold-bluechip 为 true
}) {
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState('')
  const [sortField, setSortField] = useState<SortField>('score')
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc')

  const filtered = useMemo(() => {
    let result = items
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      result = result.filter(i => i.name.toLowerCase().includes(q) || i.code.includes(q))
    }
    if (selectedIndex && indexConstituentMap[selectedIndex]) {
      const codes = indexConstituentMap[selectedIndex]
      result = result.filter(i => codes.has(i.code))
    }
    result = [...result].sort((a, b) => {
      const av = a[sortField] ?? 0
      const bv = b[sortField] ?? 0
      return sortOrder === 'desc' ? bv - av : av - bv
    })
    return result
  }, [items, searchQuery, selectedIndex, sortField, sortOrder])

  return (
    <Card className="flex h-full flex-col">
      <CardHeader className="shrink-0 pb-2">
        <div className="flex items-center gap-2 text-xs text-ink-soft">
          {updatedAt ? (
            <span>上次筛选: {new Date(updatedAt).toLocaleString('zh-CN')}</span>
          ) : (
            <span className="text-ink-faint">尚未运行筛选</span>
          )}
          <span className="ml-auto">共 {filtered.length} 只{filtered.length !== total ? ` / ${total}` : ''}</span>
        </div>
      </CardHeader>

      {/* 工具栏：搜索 + 指数过滤 + 排序 */}
      <div className="flex shrink-0 items-center gap-2 px-4 pb-2">
        <div className="relative flex-1">
          <Search className="absolute left-2 top-1/2 size-3 -translate-y-1/2 text-ink-faint" />
          <input
            className="w-full rounded-md border border-line bg-paper-2 py-1 pl-7 pr-2 text-xs"
            placeholder="搜索名称..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />
        </div>
        <select
          className="w-20 rounded-md border border-line bg-paper-2 px-1 py-1 text-xs"
          value={selectedIndex}
          onChange={e => setSelectedIndex(e.target.value)}
        >
          <option value="">全部指数</option>
          {indices.map(idx => (
            <option key={idx.indexCode} value={idx.indexCode}>{idx.indexName}</option>
          ))}
        </select>
        <select
          className="w-16 rounded-md border border-line bg-paper-2 px-1 py-1 text-xs"
          value={sortField}
          onChange={e => setSortField(e.target.value as SortField)}
        >
          <option value="score">得分</option>
          <option value="netProfitYoY">净利同比</option>
          <option value="revenueYoY">营收同比</option>
        </select>
        <button
          className="rounded-md border border-line px-1.5 py-1 text-xs"
          onClick={() => setSortOrder(o => o === 'desc' ? 'asc' : 'desc')}
        >
          {sortOrder === 'desc' ? '↓' : '↑'}
        </button>
      </div>

      {/* 表头 */}
      <div className="grid shrink-0 grid-cols-[minmax(0,1fr)_minmax(0,0.8fr)_minmax(0,0.8fr)_minmax(0,0.7fr)_minmax(0,1.2fr)_minmax(0,0.7fr)_minmax(0,0.7fr)] gap-1 border-y border-line px-4 py-1 text-[10px] text-ink-faint">
        <span>代码</span><span>名称</span><span>行业</span><span>得分</span><span>命中信号</span>
        <span>净利同比</span>
        {showDrawdown && <span>距高回撤</span>}
      </div>

      {/* 列表区域 */}
      <CardContent className="flex-1 overflow-y-auto p-0">
        {items.length === 0 && updatedAt === null ? (
          <div className="p-8 text-center text-sm text-ink-faint">
            尚未运行筛选，请点击左侧筛选后运行
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-8 text-center text-sm text-ink-faint">
            {searchQuery || selectedIndex ? '当前过滤条件无匹配结果' : '无候选股'}
          </div>
        ) : (
          filtered.map((item) => (
            <div
              key={item.code}
              className={`grid grid-cols-[minmax(0,1fr)_minmax(0,0.8fr)_minmax(0,0.8fr)_minmax(0,0.7fr)_minmax(0,1.2fr)_minmax(0,0.7fr)_minmax(0,0.7fr)] gap-1 cursor-pointer border-b border-line/50 px-4 py-2 text-xs hover:bg-paper-2 ${
                selectedCode === item.code ? 'bg-accent/10' : ''
              }`}
              onClick={() => onSelectCode(item.code, item.name)}
            >
              <span className="font-mono truncate">{item.code}</span>
              <span className="truncate">{item.name}</span>
              <span className="truncate text-ink-soft">{item.industry}</span>
              <span className="font-semibold text-accent">{item.score.toFixed(1)}</span>
              <span className="flex flex-wrap gap-0.5 truncate">
                {item.signals.map(s => (
                  <span key={s} className="rounded bg-accent/10 px-1 text-[9px] text-accent">{SIGNAL_LABELS[s] || s}</span>
                ))}
                {item.extraSignals > 0 && <span className="text-ink-faint">+{item.extraSignals}</span>}
              </span>
              <span>{item.netProfitYoY}%</span>
              {showDrawdown && <span>{(item.drawdownFromHigh * 100).toFixed(1)}%</span>}
            </div>
          ))
        )}
      </CardContent>
    </Card>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/screener/FundamentalCandidateListCard.tsx
git commit -m "feat: 新增基本面结果列表组件（搜索+指数过滤+排序）"
```

---

### Task 16: `StockDetailPanel` 接入 `candidate` prop

**Files:**
- Modify: `frontend/src/components/detail/StockDetailPanel.tsx:1-84`

- [ ] **Step 1: 新增 `candidate` prop 并渲染 score/signals/risks 区块**

在 `StockDetailPanel` props 中新增 `candidate?: Candidate`，当传入时渲染：

```tsx
interface StockDetailPanelProps {
  stockDetail: StockDetail | null
  candidate?: Candidate | null
  loading: boolean
}
```

在 StatCards 之前/之后插入基本面卡片（仅当 `candidate` 非空时渲染）：

```tsx
{candidate && (
  <div className="grid grid-cols-3 gap-3">
    {/* 综合得分 */}
    <Card>
      <CardContent className="pt-4">
        <div className="text-xs text-ink-soft">综合得分</div>
        <div className="text-2xl font-bold text-accent">{candidate.score.toFixed(1)}</div>
      </CardContent>
    </Card>
    {/* 命中信号 */}
    <Card className="col-span-2">
      <CardContent className="pt-4">
        <div className="text-xs text-ink-soft">命中信号</div>
        <div className="mt-1 flex flex-wrap gap-1">
          {candidate.signals.map(s => (
            <span key={s} className="rounded bg-accent/10 px-1.5 py-0.5 text-xs text-accent">
              {SIGNAL_LABELS[s] || s}
            </span>
          ))}
          {candidate.extraSignals > 0 && (
            <span className="text-xs text-ink-faint">+{candidate.extraSignals}</span>
          )}
        </div>
      </CardContent>
    </Card>
  </div>
)}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/detail/StockDetailPanel.tsx
git commit -m "feat: StockDetailPanel 接入 candidate prop 渲染 score/signals"
```

---

### Task 17: `ProfitRevenueChart` 单季度/累计切换

**Files:**
- Modify: `frontend/src/components/detail/ProfitRevenueChart.tsx:1-115`

- [ ] **Step 1: 修改 mode 状态语义和 series 数据源**

将 `mode` 改为 `'quarterly' | 'cumulative'`：

```tsx
const [mode, setMode] = useState<'quarterly' | 'cumulative'>('quarterly')

const option = useMemo(() => {
  // ...
  const netKey = mode === 'quarterly' ? 'netProfitQuarterly' : 'netProfit'
  const revKey = mode === 'quarterly' ? 'revenueQuarterly' : 'revenue'

  series: [
    {
      name: '净利润(亿)',
      type: 'bar',
      data: quarters.map(q => q[netKey] ?? null),
      // ...
    },
    {
      name: '营收(亿)',
      type: 'line',
      data: quarters.map(q => q[revKey] ?? null),
      // ...
    },
  ]
}, [quarters, mode])

// Tabs 标题去掉硬编码后缀
const title = `净利润 & 营收趋势（${mode === 'quarterly' ? '单季度' : '累计'}）`
```

Tabs 按钮：

```tsx
<TabsList>
  <TabsTrigger value="quarterly" onClick={() => setMode('quarterly')}>单季度</TabsTrigger>
  <TabsTrigger value="cumulative" onClick={() => setMode('cumulative')}>累计</TabsTrigger>
</TabsList>
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/detail/ProfitRevenueChart.tsx
git commit -m "feat: ProfitRevenueChart 真正支持单季度/累计切换"
```

---

### Task 18: `App.tsx` 基本面页面整体布局重组

**Files:**
- Modify: `frontend/src/App.tsx:1-187`

- [ ] **Step 1: 重写基本面区域为抽屉 + 结果列表 + 详情布局**

参考 `TechnicalScreenView` 的布局结构，创建 `FundamentalScreenView` 组件或直接在 `App.tsx` 中内联：

```tsx
{/* 基本面页面 */}
<div className="relative flex flex-1 overflow-hidden">
  {/* 左侧筛选抽屉 */}
  {filterOpen && (
    <div
      ref={drawerRef}
      className="absolute left-0 top-0 z-30 flex h-full w-[180px] flex-col border-r border-line bg-paper/95 px-3 py-5 shadow-lg backdrop-blur-sm"
    >
      <div className="mb-3 flex items-center justify-between">
        <span className="text-xs font-medium text-ink-soft">筛选参数</span>
        <button onClick={() => setFilterOpen(false)} className="rounded-md p-1 text-ink-faint hover:bg-paper-2">
          <X className="size-3.5" />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto">
        <FilterPanel
          preset={activePreset}
          paramValues={paramValues}
          onParamChange={(k, v) => setParamValues(s => ({ ...s, [k]: v }))}
          onApply={runScreen}
          loading={screening}
        />
      </div>
    </div>
  )}

  {/* 主区域：结果列表 + 详情 */}
  <main className="grid flex-1 grid-cols-1 gap-5 overflow-hidden p-6 2xl:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
    <div className="flex min-h-0 flex-col">
      <FundamentalCandidateListCard
        items={screenItems}
        total={screenTotal}
        updatedAt={screenUpdatedAt}
        selectedCode={selectedCode}
        onSelectCode={(code, name) => { setSelectedCode(code); setSelectedName(name) }}
        indices={indexList}
        indexConstituentMap={indexConstituentMap}
        showDrawdown={strategy === 'oversold-bluechip'}
      />
    </div>
    <div className="overflow-y-auto">
      <StockDetailPanel
        stockDetail={stockDetail}
        candidate={selectedCandidate}
        loading={detailLoading}
      />
    </div>
  </main>
</div>
```

状态变量（替换旧的 `filter`/`setFilter` 等）：

```typescript
const [filterOpen, setFilterOpen] = useState(false)
const [paramValues, setParamValues] = useState<Record<string, number | string>>({})
const [screenItems, setScreenItems] = useState<Candidate[]>([])
const [screenTotal, setScreenTotal] = useState(0)
const [screenUpdatedAt, setScreenUpdatedAt] = useState<string | null>(null)
const [screening, setScreening] = useState(false)
const [indexList, setIndexList] = useState<IndexInfo[]>([])
const [indexConstituentMap, setIndexConstituentMap] = useState<Record<string, Set<string>>>({})
```

`runScreen` 逻辑：

```typescript
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
      setSelectedName(res.items[0].name)
    }
  } catch {
    setScreenItems([])
    setScreenTotal(0)
  } finally {
    setScreening(false)
  }
}, [strategy, paramValues])
```

`useEffect` 初始化：切换 preset 时重置 `paramValues` 为 `Object.fromEntries(preset.params.map(p => [p.key, p.value]))`，并调用 `api.screenFundamentalResult(strategy)` 加载上次结果；加载指数列表。

`useEffect` 加载详情：当 `selectedCode` 变化且基本面策略时，从 `screenItems` 中找到对应 `Candidate` 传给 `StockDetailPanel`。

- [ ] **Step 2: Commit**

```bash
git add frontend/src/App.tsx
git commit -m "refactor: 基本面页面重构为抽屉 + 结果列表 + 详情布局"
```

---

### Task 19: 清理 mock 数据 + 验证构建通过

**Files:**
- Modify: `frontend/src/data/signals.ts:1-32`
- Modify: `frontend/src/data/mock.ts:1-174`

- [ ] **Step 1: 删除 `signals.ts` 中的 `KEYWORDS`，保留其他导出（如有）**

```typescript
// signals.ts 清空为:
// 已移除 KEYWORDS 常量。研报关键词信号由后端 fundamentalscreen 的 _display_signals 统一返回在 signals[] 中。
export {}
```

（若其他地方未引用 `signals.ts` 的其他导出，可完全删除该文件）

- [ ] **Step 2: 更新 `mock.ts` 的 `CANDIDATES` 和 `STOCK_DETAIL` 适配新类型**

```typescript
// CANDIDATES 增加 risks 和 drawdownFromHigh
export const CANDIDATES: Candidate[] = [
  {
    code: "sz000001", name: "平安银行", industry: "银行",
    score: 85.5, signals: ["highGrowth", "newHigh"], extraSignals: 2,
    netProfitYoY: 70, revenueYoY: 30,
    risks: [
      { label: "业绩持续下滑", ok: true },
      { label: "股价创历史新低", ok: true },
      { label: "行业景气下行", ok: true },
    ],
    drawdownFromHigh: 0.05,
  },
]

// STOCK_DETAIL 移除了 score/scoreDelta/signals/signalCount/drawdownFromHigh/risks
// quarters 增加 netProfitQuarterly/revenueQuarterly
export const STOCK_DETAIL: StockDetail = {
  code: "sz000001", name: "平安银行", industry: "银行", subIndustry: "银行",
  price: 12.5, yearHigh: 15.0, yearHighDate: "2025-01-15",
  quarters: [
    { quarter: "2025Q1", netProfit: 1.0, revenue: 5.0, netProfitQuarterly: 1.0, revenueQuarterly: 5.0 },
    { quarter: "2025Q2", netProfit: 2.5, revenue: 12.0, netProfitQuarterly: 1.5, revenueQuarterly: 7.0 },
  ],
  latestNote: "",
  klineDay: [], klineWeek: [], klineMonth: [], klineQuarter: [],
  highLine: 15.0,
  reports: [],
}
```

- [ ] **Step 3: 运行前端构建验证所有改动一致**

```bash
cd frontend && npm run build
```
Expected: 构建成功，无类型错误。

- [ ] **Step 4: Commit**

```bash
git add frontend/src/data/signals.ts frontend/src/data/mock.ts
git commit -m "chore: 清理 mock 数据适配新类型；删除 signals.ts KEYWORDS"
```

---

### Task 20: 终验——运行全部后端测试

**Files:** 无

- [ ] **Step 1: 运行全部后端测试**

```bash
cd backend && source venv/bin/activate && pytest -v
```
Expected: 全部 PASS

- [ ] **Step 2: 若有失败修复后最终 commit**

```bash
git add -A
git commit -m "fix: 终验修复测试问题"
```

---

## 执行顺序与依赖

```
Task 1 (yoy_threshold) ──┐
Task 2 (models)         ──┼── 并行
Task 3 (candidate扩展)   ──┤
                           ├── Task 4 (阈值+过滤) ── Task 5 (revenueYoY) ── Task 6 (presets) ── Task 10 (result API)
Task 7 (指数抓取)        ──┤
Task 8 (刷新扩展)        ──┘

Task 11 (indices API) ── 独立（依赖 Task 2 建表）
Task 9  (stock_detail) ── 独立
Task 12 (前端 types) ── 最早的前端任务
Task 13 (前端 api) ── 依赖 Task 12
Task 14 (FilterPanel) ── 依赖 Task 12
Task 15 (CandidateListCard) ── 依赖 Task 12/13
Task 16 (StockDetailPanel) ── 依赖 Task 12
Task 17 (ProfitRevenueChart) ── 依赖 Task 12
Task 18 (App.tsx) ── 依赖 Task 14/15/16
Task 19 (mock 清理) ── 依赖 Task 12/18
Task 20 (终验) ── 依赖全部
```
