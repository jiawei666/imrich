# 低位错杀蓝筹简化 + A/B 区分 + 抽屉遮罩重构 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 `oversold-bluechip` 策略的蓝筹判定改为宽基指数成分股、删掉 3 个冗余参数、前端区分错杀场景 A/B，并把筛选抽屉重构为遮罩式关闭。

**Architecture:** 后端蓝筹判定从「市值+盈利+毛利率」改为「股票在 上证50/沪深300/中证500 成分股集合内」；错杀判定新增 `oversold_scenario` 返回 A/B/None，前端拆成两个信号标签展示；共享 `FilterDrawer` 组件改为「遮罩 + 抽屉」结构，用点遮罩/ESC 关闭，移除挂在 document 上的 mousedown 监听（顺带消除 Radix portal 误关 bug）。

**Tech Stack:** Python (FastAPI + SQLAlchemy, pytest)、React 19 + Vite + Tailwind v4。

参考规格：`docs/superpowers/specs/2026-06-14-oversold-bluechip-simplify-design.md`

---

## 文件结构

- `backend/app/signals.py` — 新增 `BLUECHIP_INDEX_CODES`、新增 `oversold_scenario`、重写 `is_bluechip`；移除旧 `oversold_bluechip` 函数。
- `backend/app/fundamental_rows.py` — 构造 `bluechip_codes` 集合、改 `is_bluechip` 调用、新增 `oversold_scenario` 行字段、`oversold_bluechip` 字段改为由 scenario 派生。
- `backend/app/fundamental_screen.py` — `_display_signals` 产出 A/B 信号、`WEIGHTS` 增项。
- `backend/app/presets.py` — 删除 3 个参数。
- `backend/tests/test_oversold_bluechip.py` — 新增：`oversold_scenario`、`is_bluechip`、`build_fundamental_rows`、`_display_signals` 测试。
- `backend/tests/test_presets.py` — 增补：被删参数缺席断言。
- `frontend/src/types.ts`、`frontend/src/data/signals.ts` — A/B 信号标签。
- `frontend/src/components/ui/filter-drawer.tsx` — 遮罩式重构。

---

## Task 1: 蓝筹判定改为指数成分股 + 新增 `oversold_scenario`

`is_bluechip` 签名变更、`oversold_bluechip` 函数移除都是破坏性改动，唯一调用点 `fundamental_rows.py` 必须在同一任务内同步修改，保证提交后测试全绿。

**Files:**
- Modify: `backend/app/signals.py:127-152`（重写 `is_bluechip`，新增常量）、`:213-237`（`oversold_bluechip` → `oversold_scenario`）
- Modify: `backend/app/fundamental_rows.py:6`（imports models）、`:9-23`（imports signals）、`:42-50`（查询）、`:114-154`（调用与字段）
- Test: `backend/tests/test_oversold_bluechip.py`（新建）

- [ ] **Step 1: 写失败测试**

创建 `backend/tests/test_oversold_bluechip.py`：

```python
from app.signals import oversold_scenario, is_bluechip, BLUECHIP_INDEX_CODES


def _closes(drawdown: float) -> list[float]:
    """peak=100，最后一根 = 100*(1-drawdown)。"""
    return [100.0, 100.0 * (1 - drawdown)]


def test_scenario_a():
    s = oversold_scenario(_closes(0.30), 5.0, 0.25, -15, 0.50, -30, 100)
    assert s == "A"


def test_scenario_b_priority_over_a():
    # 回撤 0.55 + ttm -25：A 不满足(-25 not > -15)，B 满足
    s = oversold_scenario(_closes(0.55), -25.0, 0.25, -15, 0.50, -30, 100)
    assert s == "B"


def test_scenario_b_requires_positive_annual_profit():
    s = oversold_scenario(_closes(0.55), -25.0, 0.25, -15, 0.50, -30, -1)
    assert s is None


def test_scenario_none_when_shallow():
    s = oversold_scenario(_closes(0.10), 5.0, 0.25, -15, 0.50, -30, 100)
    assert s is None


def test_scenario_none_when_ttm_missing():
    assert oversold_scenario(_closes(0.30), None, 0.25, -15, 0.50, -30, 100) is None


def test_bluechip_index_codes_constant():
    assert BLUECHIP_INDEX_CODES == {"000016", "000300", "000905"}


def test_is_bluechip_membership():
    codes = {"sh600519", "sz000001"}
    assert is_bluechip("sh600519", codes) is True
    assert is_bluechip("sz000002", codes) is False


def test_build_rows_bluechip_and_scenario(db_path):
    from app.db import init_db, SessionLocal
    init_db()
    from app.models import Stock, FinancialReport, KlineDay, IndexConstituent
    from app.fundamental_rows import build_fundamental_rows

    with SessionLocal() as s:
        # sh600519 在沪深300 → 蓝筹；sz000002 不在任何蓝筹指数
        s.add(IndexConstituent(index_code="000300", stock_code="sh600519", index_name="沪深300"))
        for code in ("sh600519", "sz000002"):
            s.add(Stock(code=code, name=code, market_cap=1000.0, industry="食品饮料",
                        is_st=False, is_bj=False, listed_at="2010-01-01"))
            s.add(FinancialReport(code=code, report_date="2023-12-31", net_profit=95.0,
                                  net_profit_yoy=3.0, revenue=500.0, revenue_yoy=2.0, gross_margin=50.0))
            s.add(FinancialReport(code=code, report_date="2024-12-31", net_profit=100.0,
                                  net_profit_yoy=5.0, revenue=520.0, revenue_yoy=4.0, gross_margin=50.0))
            # 回撤 30%：peak 100 → 70
            for i, close in enumerate([100.0, 90.0, 80.0, 70.0]):
                s.add(KlineDay(code=code, date=f"2024-0{i + 1}-01", open=close, close=close,
                               high=close, low=close, volume=1000.0))
        s.commit()

    rows = build_fundamental_rows({})
    by_code = {r["code"]: r for r in rows}
    assert by_code["sh600519"]["is_bluechip"] is True
    assert by_code["sh600519"]["oversold_scenario"] == "A"
    assert by_code["sh600519"]["oversold_bluechip"] is True
    assert by_code["sz000002"]["is_bluechip"] is False
```

> `db_path` 来自 `backend/tests/conftest.py`，会把 `IMRICH_DB_PATH` 指向临时库。

- [ ] **Step 2: 运行确认失败**

Run: `cd backend && source venv/bin/activate && pytest tests/test_oversold_bluechip.py -v`
Expected: FAIL（`ImportError: cannot import name 'oversold_scenario'`）

- [ ] **Step 3: 改 `signals.py` —— 新增 `oversold_scenario`，重写 `is_bluechip`**

3a. 把现有 `is_bluechip`（约 127-152 行，含市值/盈利/毛利率逻辑）整体替换为：

```python
BLUECHIP_INDEX_CODES = {"000016", "000300", "000905"}  # 上证50 / 沪深300 / 中证500


def is_bluechip(code: str, bluechip_codes: set[str]) -> bool:
    """蓝筹判定：股票是否在宽基蓝筹指数成分股集合内。"""
    return code in bluechip_codes
```

3b. 把现有 `oversold_bluechip`（约 213-237 行）整体替换为：

```python
def oversold_scenario(
    closes: list[float],
    ttm_yoy: Optional[float],
    drawdown_min: float = 0.25,
    ttm_threshold: float = -15,
    deep_drawdown: float = 0.50,
    deep_ttm_threshold: float = -30,
    annual_net_profit: Optional[float] = None,
) -> Optional[str]:
    """蓝筹错杀命中的场景：'B'(深度超跌) 优先于 'A'(普通超跌)，都不满足返回 None。"""
    if not closes or ttm_yoy is None:
        return None
    peak = max(closes)
    if peak <= 0:
        return None
    drawdown = 1 - closes[-1] / peak

    if (
        drawdown >= deep_drawdown
        and ttm_yoy > deep_ttm_threshold
        and annual_net_profit is not None
        and annual_net_profit > 0
    ):
        return "B"
    if drawdown >= drawdown_min and ttm_yoy > ttm_threshold:
        return "A"
    return None
```

- [ ] **Step 4: 改 `fundamental_rows.py` 调用点**

4a. 修改 models import（`backend/app/fundamental_rows.py:6`）——加入 `IndexConstituent`：

```python
from app.models import FinancialReport, Forecast, IndexConstituent, IndustryIndex, KlineDay, ResearchReport, Stock
```

4b. 修改 signals import（约第 9-23 行）——把 `oversold_bluechip` 换成 `oversold_scenario`，新增 `BLUECHIP_INDEX_CODES`，`is_bluechip` 保留：

```python
from app.signals import (
    beat_expect,
    calc_ttm_yoy,
    high_growth,
    industry_new_high,
    is_bluechip,
    BLUECHIP_INDEX_CODES,
    low_position_oversold,
    oversold_scenario,
    price_new_high,
    profit_new_high,
    risk_industry_down,
    risk_price_new_low,
    risk_profit_decline,
    risk_structural_decline,
)
```

4c. 在 `build_fundamental_rows` 的查询块（约第 43-49 行的 `with SessionLocal() as s:` 内）追加一行查询蓝筹成分股：

```python
        constituents = s.query(IndexConstituent).filter(
            IndexConstituent.index_code.in_(BLUECHIP_INDEX_CODES)
        ).all()
```

并在该 `with` 块结束之后（紧跟 `klines = ...` 出 with 块处，约第 50 行后）构造集合：

```python
    bluechip_codes = {c.stock_code for c in constituents}
```

4d. 替换蓝筹判定调用（原第 115 行）：

```python
        is_bc = is_bluechip(stock.code, bluechip_codes)
```

4e. 在 `rows.append({...})` 之前（约第 122 行 `structural_decline = ...` 附近）计算 `_scenario`：

```python
        _scenario = oversold_scenario(
            closes, ttm_yoy_val,
            float(params.get("drawdownMin", 25)) / 100,
            float(params.get("ttmYoyThreshold", -15)),
            float(params.get("deepDrawdown", 50)) / 100,
            float(params.get("deepTtmYoy", -30)),
            annual_np,
        )
```

4f. 替换错杀字段块（原第 144-154 行的 `"is_bluechip"`/`"ttm_yoy"`/`"annual_net_profit"`/`"oversold_bluechip"` 部分）。把原来的：

```python
                # 蓝筹策略专用
                "is_bluechip": is_bc,
                "ttm_yoy": ttm_yoy_val,
                "annual_net_profit": annual_np,
                "oversold_bluechip": oversold_bluechip(
                    closes, ttm_yoy_val,
                    drawdown_min=float(params.get("drawdownMin", 25)) / 100,
                    ttm_threshold=float(params.get("ttmYoyThreshold", -15)),
                    deep_drawdown=float(params.get("deepDrawdown", 50)) / 100,
                    deep_ttm_threshold=float(params.get("deepTtmYoy", -30)),
                    annual_net_profit=annual_np,
                ),
```

替换为：

```python
                # 蓝筹策略专用
                "is_bluechip": is_bc,
                "ttm_yoy": ttm_yoy_val,
                "annual_net_profit": annual_np,
                "oversold_scenario": _scenario,
                "oversold_bluechip": _scenario is not None,
```

- [ ] **Step 5: 运行确认通过**

Run: `cd backend && source venv/bin/activate && pytest tests/test_oversold_bluechip.py -v`
Expected: PASS（9 passed）

- [ ] **Step 6: 全量回归**

Run: `cd backend && source venv/bin/activate && pytest -q`
Expected: PASS（全绿）

- [ ] **Step 7: 提交**

```bash
git add backend/app/signals.py backend/app/fundamental_rows.py backend/tests/test_oversold_bluechip.py
git commit -m "feat: 蓝筹判定改为宽基指数成分股，新增 oversold_scenario

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: presets 删除 3 个参数

**Files:**
- Modify: `backend/app/presets.py:58-71`
- Test: `backend/tests/test_presets.py`

- [ ] **Step 1: 写失败测试**

在 `backend/tests/test_presets.py` 末尾追加：

```python
def test_oversold_bluechip_drops_market_cap_and_quality_params():
    p = next(p for p in get_presets() if p["id"] == "oversold-bluechip")
    keys = {param["key"] for param in p["params"]}
    assert "bluechipMarketCap" not in keys
    assert "bluechipProfitQuarters" not in keys
    assert "bluechipMinGrossMargin" not in keys
    # 保留的 6 个
    assert keys == {
        "drawdownMin", "ttmYoyThreshold", "deepDrawdown",
        "deepTtmYoy", "keywordWindow", "industry",
    }
```

- [ ] **Step 2: 运行确认失败**

Run: `cd backend && source venv/bin/activate && pytest tests/test_presets.py::test_oversold_bluechip_drops_market_cap_and_quality_params -v`
Expected: FAIL（断言失败，`bluechipMarketCap` 仍在）

- [ ] **Step 3: 删除参数**

在 `backend/app/presets.py` 的 `oversold-bluechip` 参数列表里，删除这三行（约 62-64 行）：

```python
            {"key": "bluechipMarketCap", "label": "蓝筹最低市值", "value": 500, "min": 200, "max": 2000, "step": 100, "unit": "亿"},
            {"key": "bluechipProfitQuarters", "label": "连续盈利季度数", "value": 4, "min": 2, "max": 8, "step": 1},
            {"key": "bluechipMinGrossMargin", "label": "最低毛利率", "value": 10, "min": 0, "max": 40, "step": 5, "unit": "%"},
```

删除后该预设 `params` 应只剩：`drawdownMin`、`ttmYoyThreshold`、`deepDrawdown`、`deepTtmYoy`、`keywordWindow`、`industry`。

- [ ] **Step 4: 运行确认通过**

Run: `cd backend && source venv/bin/activate && pytest tests/test_presets.py -v`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add backend/app/presets.py backend/tests/test_presets.py
git commit -m "feat: oversold-bluechip 删除市值/盈利季度/毛利率三个参数

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: 筛选结果产出 A/B 信号

**Files:**
- Modify: `backend/app/fundamental_screen.py:6-21`（WEIGHTS）、`:24-43`（`_display_signals`）
- Test: `backend/tests/test_oversold_bluechip.py`（追加）

- [ ] **Step 1: 追加失败测试**

在 `backend/tests/test_oversold_bluechip.py` 末尾追加：

```python
from app.fundamental_screen import _display_signals, run_fundamental_screen_from_rows


def test_display_signals_scenario_a():
    assert "oversoldBluechipA" in _display_signals({"oversold_scenario": "A"})


def test_display_signals_scenario_b():
    assert "oversoldBluechipB" in _display_signals({"oversold_scenario": "B"})


def test_screen_emits_scenario_b_signal():
    rows = [{
        "code": "sh600519", "name": "贵州茅台", "industry": "食品饮料",
        "is_bluechip": True, "oversold_bluechip": True, "oversold_scenario": "B",
        "risk_price_new_low": False, "risk_industry_down": False,
        "risk_structural_decline": False,
        "drawdown_from_high": 0.55, "ttm_yoy": -25,
        "netProfitYoY": -25, "revenueYoY": -5,
    }]
    out = run_fundamental_screen_from_rows("oversold-bluechip", rows, {})
    assert len(out) == 1
    assert "oversoldBluechipB" in out[0]["signals"]
```

- [ ] **Step 2: 运行确认失败**

Run: `cd backend && source venv/bin/activate && pytest tests/test_oversold_bluechip.py -k "display_signals or scenario_b_signal" -v`
Expected: FAIL（信号里没有 `oversoldBluechipA/B`）

- [ ] **Step 3: 改 `_display_signals`**

在 `backend/app/fundamental_screen.py` 的 `_display_signals` 中，把：

```python
    if row.get("oversold_bluechip"):
        signals.append("oversoldBluechip")
```

替换为：

```python
    scenario = row.get("oversold_scenario")
    if scenario == "A":
        signals.append("oversoldBluechipA")
    elif scenario == "B":
        signals.append("oversoldBluechipB")
```

- [ ] **Step 4: 改 `WEIGHTS`**

在 `WEIGHTS` 字典中，把：

```python
    "oversoldBluechip": 20,
```

替换为：

```python
    "oversoldBluechipA": 20,
    "oversoldBluechipB": 20,
```

- [ ] **Step 5: 运行确认通过**

Run: `cd backend && source venv/bin/activate && pytest tests/test_oversold_bluechip.py -v`
Expected: PASS

- [ ] **Step 6: 全量回归**

Run: `cd backend && source venv/bin/activate && pytest -q`
Expected: PASS（全绿）

- [ ] **Step 7: 提交**

```bash
git add backend/app/fundamental_screen.py backend/tests/test_oversold_bluechip.py
git commit -m "feat: 候选结果按场景产出 oversoldBluechipA/B 信号

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: 前端信号标签拆成 A/B

无前端单测，靠 `npm run build`（含 tsc）与 `npm run lint` 验证。

**Files:**
- Modify: `frontend/src/types.ts:15-16`
- Modify: `frontend/src/data/signals.ts:22`

- [ ] **Step 1: 改 `types.ts` 的 `SignalKey`**

把（约 16 行）：

```ts
  | 'oversoldBluechip' // 蓝筹错杀
```

替换为：

```ts
  | 'oversoldBluechipA' // 错杀·普通超跌
  | 'oversoldBluechipB' // 错杀·深度超跌
```

- [ ] **Step 2: 改 `signals.ts` 的 `SIGNAL_META`**

把（约 22 行）：

```ts
  oversoldBluechip: { label: '蓝筹错杀', tone: 'ink' },
```

替换为：

```ts
  oversoldBluechipA: { label: '错杀·普通超跌', tone: 'neutral' },
  oversoldBluechipB: { label: '错杀·深度超跌', tone: 'ink' },
```

- [ ] **Step 3: 类型检查 + 构建**

Run: `cd frontend && npm run build`
Expected: 构建成功，无 TS 报错（`SIGNAL_META` 现已覆盖 `SignalKey` 全部成员）。

- [ ] **Step 4: lint**

Run: `cd frontend && npm run lint`
Expected: 通过（无新增错误）。

- [ ] **Step 5: 提交**

```bash
git add frontend/src/types.ts frontend/src/data/signals.ts
git commit -m "feat: 前端蓝筹错杀信号拆成 A/B 两个标签

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: 筛选抽屉重构为遮罩式

**Files:**
- Modify (整文件重写): `frontend/src/components/ui/filter-drawer.tsx`

- [ ] **Step 1: 重写组件**

把 `frontend/src/components/ui/filter-drawer.tsx` 整个文件替换为：

```tsx
import { useEffect, type ReactNode } from 'react'
import { cn } from '@/lib/utils'

/**
 * 共享筛选抽屉：左侧滑入 + 半透明遮罩。
 * 关闭方式：点击遮罩、按 ESC、或由外部（筛选按钮 / 运行筛选）置 open=false。
 */
export function FilterDrawer({
  open,
  onClose,
  title = '筛选参数',
  children,
}: {
  open: boolean
  onClose: () => void
  title?: string
  children: ReactNode
}) {
  // ESC 关闭；defaultPrevented 守卫避免与 Radix 弹层自身 ESC 关闭冲突造成双关
  useEffect(() => {
    if (!open) return
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !e.defaultPrevented) onClose()
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [open, onClose])

  return (
    <>
      {/* 遮罩：点击关闭。关闭态淡出且不拦截点击 */}
      <div
        aria-hidden
        onClick={onClose}
        className={cn(
          'absolute inset-0 z-20 bg-ink/20 transition-opacity duration-200',
          open ? 'opacity-100' : 'pointer-events-none opacity-0',
        )}
      />
      {/* 抽屉本体 */}
      <div
        data-open={open ? '' : undefined}
        className="
          absolute left-0 top-0 z-30 flex h-full w-[220px] flex-col
          bg-cream/90 backdrop-blur-md
          shadow-[4px_0_20px_-6px_rgba(43,58,77,0.10)]
          transition-transform duration-200 ease-out
          -translate-x-full
          data-open:translate-x-0
        "
      >
        {/* header */}
        <div className="px-4 pt-5 pb-3">
          <span className="text-[13px] font-semibold text-ink">{title}</span>
        </div>
        {/* scroll body */}
        <div className="flex-1 overflow-y-auto px-4 pb-5">
          {children}
        </div>
      </div>
    </>
  )
}
```

要点：移除了 `useRef` 与挂在 `document` 上的 `mousedown` 监听/`setTimeout`；遮罩是父容器内真实元素，Radix 弹层（Popover/Select）portal 渲染在 `body` 且 z-index 更高，点击弹层项不会命中遮罩，因此不再误关抽屉。

- [ ] **Step 2: 类型检查 + 构建**

Run: `cd frontend && npm run build`
Expected: 构建成功（`cn` 来自 `@/lib/utils`，已被其它组件使用）。

- [ ] **Step 3: lint**

Run: `cd frontend && npm run lint`
Expected: 通过。

- [ ] **Step 4: 手动验证（开发服务器）**

Run: `cd frontend && npm run dev`
然后在浏览器：切到「低位错杀蓝筹」→ 点筛选按钮开抽屉 → 点「行业过滤」下拉并选一个行业 → **抽屉不应关闭**；点结果区遮罩或按 ESC → 抽屉关闭；技术面战法抽屉同样行为。

- [ ] **Step 5: 提交**

```bash
git add frontend/src/components/ui/filter-drawer.tsx
git commit -m "refactor: 筛选抽屉改为遮罩式关闭，修复点选行业误关 bug

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## 收尾验证

- [ ] 后端全量：`cd backend && source venv/bin/activate && pytest -q` 全绿
- [ ] 前端：`cd frontend && npm run build && npm run lint` 通过
- [ ] 手动确认：低位错杀蓝筹候选列表「命中信号」能看到「错杀·普通超跌 / 错杀·深度超跌」之分；抽屉行业筛选不再误关。
</content>
