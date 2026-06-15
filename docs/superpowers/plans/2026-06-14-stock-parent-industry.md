# Stock 表新增 parent_industry 字段 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stock 表新增 `parent_industry` 字段，刷新时同步写入一级行业，删除所有运行时反查 Industry 表的代码，技术面走势卡片把行业信息从独立 header 移到 PriceChart 股票名称旁。

**Architecture:** Stock 模型加字段 → 刷新逻辑同步写入 → screen.py / stock_detail.py 删反查 → 前端 PriceChart 接受副标题 props → TechnicalScreenView 去掉 header、传 props 给 PriceChart。

**Tech Stack:** SQLAlchemy (model), FastAPI/Pydantic (schema), React/TypeScript (frontend)

---

### Task 1: Stock 模型加 parent_industry 字段

**Files:**
- Modify: `backend/app/models.py:16` (Stock 类)

- [ ] **Step 1: 在 Stock 类新增字段**

在 `industry` 字段下方新增：

```python
parent_industry: Mapped[Optional[str]] = mapped_column(String, nullable=True)  # 申万一级行业
```

- [ ] **Step 2: 运行后端测试确认无破坏**

Run: `cd backend && source venv/bin/activate && pytest tests/ -x -q`
Expected: 全部通过（新字段 nullable，不影响现有逻辑）

- [ ] **Step 3: 提交**

```bash
git add backend/app/models.py
git commit -m "feat: Stock 模型新增 parent_industry 字段"
```

---

### Task 2: 刷新逻辑同步写入 parent_industry

**Files:**
- Modify: `backend/app/refresh.py:398` (_refresh_industry_index 函数)
- Modify: `backend/tests/test_refresh_fundamental.py` (3 个测试)

- [ ] **Step 1: 修改刷新代码**

在 `refresh.py` 约行 398，`stock.industry = industry["name"]` 之后加一行：

```python
stock.industry = industry["name"]
stock.parent_industry = industry.get("parent_name")
```

- [ ] **Step 2: 更新测试 — test_run_fundamental_refresh_full**

在 `tests/test_refresh_fundamental.py` 的 `test_run_fundamental_refresh_full` 中，`industries_fn` 返回的二级行业字典加上 `parent_name`：

```python
industries_fn=lambda: [{"code": "850111", "name": "银行", "parent_name": "金融"}],
```

在断言处（约行 74）新增：

```python
assert stock.parent_industry == "金融"
```

- [ ] **Step 3: 更新测试 — test_refresh_industry_index_persists_completed_and_skips_failed**

该测试的 `industries_fn` 返回列表中没有 `parent_name`（即 `parent_name` 为 None），需给有 parent_name 的行业加上：

```python
industries_fn=lambda: [
    {"code": "850111", "name": "银行", "parent_name": "金融"},
    {"code": "850222", "name": "白色家电", "parent_name": "家用电器"},
    {"code": "850333", "name": "汽车", "parent_name": "汽车"},
],
```

在断言处新增：

```python
assert s.get(Stock, "sz000001").parent_industry == "金融"
assert s.get(Stock, "sz000003").parent_industry == "汽车"
```

- [ ] **Step 4: 更新测试 — test_refresh_industry_index_writes_industry_dimension_table**

该测试的 `industries_fn` 已返回 `parent_name`，在断言处新增：

```python
# Stock 表没有被写入成分股（constituents_fn 返回空），所以不测 parent_industry
```

但需新增一个断言确认成分股场景下 `parent_industry` 被写入。修改 `constituents_fn` 返回非空列表：

```python
constituents_fn=lambda code: ["sz000001"] if code == "850111" else [],
```

新增断言：

```python
stock = s.get(Stock, "sz000001")
assert stock is not None
assert stock.parent_industry == "金融"
```

- [ ] **Step 5: 运行后端测试**

Run: `cd backend && source venv/bin/activate && pytest tests/ -x -q`
Expected: 全部通过

- [ ] **Step 6: 提交**

```bash
git add backend/app/refresh.py backend/tests/test_refresh_fundamental.py
git commit -m "feat: 刷新行业指数时同步写入 stock.parent_industry"
```

---

### Task 3: screen.py 删反查逻辑，从 Stock 表直接取 parent_industry

**Files:**
- Modify: `backend/app/screen.py:172-218` (run_screen_result 函数)

- [ ] **Step 1: 重写 run_screen_result 中的补充逻辑**

将行 172-218 替换为：

```python
def run_screen_result(preset_id: str, params: dict | None = None, history_date: str | None = None) -> dict:
    """统一筛选结果入口，返回 ScreenResultResponse 格式。

    - 有 params → 运行筛选
    - 有 history_date → 返回历史快照
    - 两者互斥
    """
    from app.db import SessionLocal as _SL
    from app.models import Stock as _Stock

    if params is not None and history_date is not None:
        raise ValueError("params 和 history_date 不可同时传入")

    if history_date is not None:
        candidates = get_screen_snapshot(preset_id, history_date)
        if candidates is None:
            return {"items": [], "total": 0}
    else:
        candidates = run_screen(preset_id, params or {})

    # 补充 market_cap 和 parent_industry
    codes = [c["code"] for c in candidates]
    stock_info: dict[str, dict] = {}
    if codes:
        with _SL() as s:
            for row in s.query(_Stock.code, _Stock.market_cap, _Stock.parent_industry).filter(_Stock.code.in_(codes)).all():
                stock_info[row.code] = {"market_cap": row.market_cap, "parent_industry": row.parent_industry}

    items = []
    for c in candidates:
        info = stock_info.get(c["code"], {})
        items.append({
            "code": c["code"],
            "name": c["name"],
            "industry": c.get("industry") or None,
            "parent_industry": info.get("parent_industry"),
            "market_cap": info.get("market_cap"),
            "close": c.get("close"),
            "pct_chg": c.get("pctChg"),
            "diagnostics": c.get("diagnostics"),
            "sort_key": c.get("sortKey"),
            "trigger_date": c.get("triggerDate"),
        })

    return {"items": items, "total": len(items)}
```

关键变化：
- 删掉 `from app.models import ... Industry as _Industry`
- 删掉 `parent_map` 整段反查逻辑
- `cap_map` 改为 `stock_info`，一次查询取 `market_cap` + `parent_industry`

- [ ] **Step 2: 运行后端测试**

Run: `cd backend && source venv/bin/activate && pytest tests/ -x -q`
Expected: 全部通过

- [ ] **Step 3: 提交**

```bash
git add backend/app/screen.py
git commit -m "refactor: screen.py 删 Industry 表反查，从 Stock 直接取 parent_industry"
```

---

### Task 4: stock_detail.py 删反查逻辑，从 Stock 直接取 parent_industry

**Files:**
- Modify: `backend/app/stock_detail.py:7,98-106,119` (import + get_stock_detail 函数)
- Modify: `backend/tests/test_stock_detail.py` (2 个测试)

- [ ] **Step 1: 修改 import**

行 7 删掉 `Industry`：

```python
from app.models import FinancialReport, KlineDay, KlineMonth, KlineQuarter, KlineWeek, ResearchReport, Stock
```

- [ ] **Step 2: 删反查代码，改用 stock.parent_industry**

将行 98-106 替换为：

```python
parent_industry_name = stock.parent_industry
```

- [ ] **Step 3: 更新测试 — test_get_stock_detail_returns_quarterly_data**

行 10 的 Stock 构造加 `parent_industry=None`（或省略，nullable 字段默认 None）。断言不变（`industry` fallback 为 `stock.industry`，因为 `parent_industry_name` 为 None）。

无需改动，因为 `parent_industry` 默认 None，`parent_industry_name or stock.industry` 仍为 `"银行"`。

- [ ] **Step 4: 更新测试 — test_get_stock_detail_industry_uses_parent_name**

该测试原来插入 Industry 行来提供 `parent_name`，现在改为直接在 Stock 上设 `parent_industry`：

```python
def test_get_stock_detail_industry_uses_parent_name(db_path):
    init_db()
    with SessionLocal() as s:
        s.add(Stock(code="sz000002", name="测试股份", industry="锂电池", parent_industry="电力设备"))
        s.commit()
    detail = get_stock_detail("sz000002")
    assert detail["industry"] == "电力设备"
    assert detail["subIndustry"] == "锂电池"
```

同时删掉该测试文件 import 中的 `Industry`（行 3）：

```python
from app.models import FinancialReport, KlineDay, KlineMonth, KlineQuarter, KlineWeek, ResearchReport, Stock
```

- [ ] **Step 5: 运行后端测试**

Run: `cd backend && source venv/bin/activate && pytest tests/ -x -q`
Expected: 全部通过

- [ ] **Step 6: 提交**

```bash
git add backend/app/stock_detail.py backend/tests/test_stock_detail.py
git commit -m "refactor: stock_detail.py 删 Industry 表反查，从 Stock 直接取 parent_industry"
```

---

### Task 5: 前端 PriceChart 接受副标题 props

**Files:**
- Modify: `frontend/src/components/detail/PriceChart.tsx:458-489` (PriceChart 组件)

- [ ] **Step 1: 修改 PriceChart 组件签名和渲染**

将 PriceChart 组件的 props 扩展，接受 `stockCode` 和 `subTitle`（用于股票代码 + 行业信息）：

```tsx
export function PriceChart({
  stockName,
  stockCode,
  subTitle,
  klineDay,
  klineWeek,
  klineMonth,
  klineQuarter,
}: {
  stockName?: string
  stockCode?: string
  subTitle?: string
  klineDay: Kline[]
  klineWeek: Kline[]
  klineMonth: Kline[]
  klineQuarter: Kline[]
}) {
  const [period, setPeriod] = useState<KlineTimeframe>('day')
  const dataMap: Record<KlineTimeframe, Kline[]> = {
    day: klineDay, week: klineWeek, month: klineMonth, quarter: klineQuarter,
  }
  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <div className="flex items-baseline gap-2">
          <span className="text-[15px] font-semibold text-ink">{stockName ?? '股价走势'}</span>
          {stockCode && <span className="tnum text-sm text-ink-faint">{stockCode}</span>}
          {subTitle && <span className="text-[13px] text-ink-soft">{subTitle}</span>}
        </div>
        <Tabs value={period} onValueChange={(v) => setPeriod(v as KlineTimeframe)}>
          <TabsList className="h-7 p-0.5">
            {PERIODS.map(({ key, label }) => (
              <TabsTrigger key={key} value={key} className="px-2.5 py-1 text-xs">{label}</TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>
      <ChartBody key={period} data={dataMap[period]} period={period} />
    </div>
  )
```

- [ ] **Step 2: 运行前端类型检查**

Run: `cd frontend && npx tsc --noEmit`
Expected: 通过（新 props 均为 optional，不破坏现有调用）

- [ ] **Step 3: 提交**

```bash
git add frontend/src/components/detail/PriceChart.tsx
git commit -m "feat: PriceChart 接受 stockCode 和 subTitle props"
```

---

### Task 6: TechnicalScreenView 去掉 header，传 props 给 PriceChart

**Files:**
- Modify: `frontend/src/components/technical/TechnicalScreenView.tsx:241-306`

- [ ] **Step 1: 删 selectedRow useMemo 和独立 header，给 PriceChart 传 props**

删掉行 241-244 的 `selectedRow` useMemo。

将行 284-306 的 Card 内容替换为：

```tsx
        <div className="min-w-0">
          <Card className="relative">
            <LoadingOverlay show={klineLoading} />
            <CardContent className="pt-5">
              <PriceChart
                stockName={selectedName}
                stockCode={selectedCode || undefined}
                subTitle={
                  stockData.length > 0
                    ? (() => {
                        const row = stockData.find((s) => s.code === selectedCode)
                        if (!row?.parent_industry && !row?.industry) return undefined
                        return `${row?.parent_industry ?? '—'} · ${row?.industry ?? '—'}`
                      })()
                    : undefined
                }
                klineDay={kline.day} klineWeek={kline.week}
                klineMonth={kline.month} klineQuarter={kline.quarter}
              />
            </CardContent>
          </Card>
        </div>
```

- [ ] **Step 2: 运行前端类型检查**

Run: `cd frontend && npx tsc --noEmit`
Expected: 通过

- [ ] **Step 3: 提交**

```bash
git add frontend/src/components/technical/TechnicalScreenView.tsx
git commit -m "refactor: 技术面走势卡片行业信息从 header 移到 PriceChart 名称旁"
```

---

### Task 7: 全量验证

**Files:** 无新增/修改

- [ ] **Step 1: 运行后端全部测试**

Run: `cd backend && source venv/bin/activate && pytest tests/ -x -q`
Expected: 全部通过

- [ ] **Step 2: 运行前端类型检查**

Run: `cd frontend && npx tsc --noEmit`
Expected: 通过

- [ ] **Step 3: 运行前端 lint**

Run: `cd frontend && npm run lint`
Expected: 通过

- [ ] **Step 4: 最终提交（如有遗漏修复）**

如有修复，提交。否则跳过。
