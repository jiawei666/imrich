# 技术战法面板优化 — 统一列表 + 历史入口

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将技术战法面板的股票列表统一为单一组件，6 列一致展示；历史筛选下拉框始终可见，全市场模式下也可选择历史结果。

**Architecture:** 后端将搜索合并到 `/stocks?q=`，新增 `/screen/result` 合并筛选与历史快照结果；前端 `StockListCard` 重构为纯展示组件，接收统一 `StockRow[]` 数据，`TechnicalScreenView` 统一管理数据获取逻辑，消除 `screenMode` 模式切换。

**Tech Stack:** FastAPI + SQLAlchemy (后端)，React 19 + TypeScript + Tailwind v4 (前端)

---

## File Structure

| 文件 | 责任 | 操作 |
|---|---|---|
| `backend/app/schemas.py` | 新增 `StockRow`、`ScreenResultResponse` schema | 修改 |
| `backend/app/main.py` | `/stocks` 增加 `q` 参数；新增 `/screen/result` 路由 | 修改 |
| `backend/app/screen.py` | 新增 `run_screen_result` 函数，统一返回 `StockRow` 格式 | 修改 |
| `backend/tests/test_stock_list.py` | 新增搜索参数测试 | 修改 |
| `backend/tests/test_screen.py` | 新增 `/screen/result` 路由测试 | 修改 |
| `frontend/src/types.ts` | 新增 `StockRow`、`ScreenResultResponse` 类型 | 修改 |
| `frontend/src/lib/api.ts` | 新增 `stocks()`、`screenResult()`；废弃旧方法 | 修改 |
| `frontend/src/components/screener/StockListCard.tsx` | 重构为统一列表组件 | 重写 |
| `frontend/src/components/technical/TechnicalScreenView.tsx` | 去掉 screenMode，统一数据流 | 重写 |

---

### Task 1: 后端 — 新增 StockRow schema

**Files:**
- Modify: `backend/app/schemas.py`

- [ ] **Step 1: 在 schemas.py 末尾添加 StockRow 和 ScreenResultResponse**

```python
class StockRow(BaseModel):
    """统一的股票行数据，全市场/搜索/筛选结果共用"""
    code: str
    name: str
    industry: Optional[str] = None
    market_cap: Optional[float] = None
    close: Optional[float] = None
    pct_chg: Optional[float] = None
    # 以下仅筛选结果有值
    diagnostics: Optional[Dict[str, float]] = None
    sort_key: Optional[str] = None
    trigger_date: Optional[str] = None


class ScreenResultResponse(BaseModel):
    items: List[StockRow]
    total: int
```

- [ ] **Step 2: 验证 schema 可正常 import**

Run: `cd /Users/yuanjiawei/ai-coding/iamrich/backend && source venv/bin/activate && python -c "from app.schemas import StockRow, ScreenResultResponse; print('OK')"`
Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add backend/app/schemas.py
git commit -m "feat: 新增 StockRow 和 ScreenResultResponse schema"
```

---

### Task 2: 后端 — `/stocks` 接口增加搜索参数 `q`

**Files:**
- Modify: `backend/app/main.py`
- Modify: `backend/tests/test_stock_list.py`

- [ ] **Step 1: 修改 `/stocks` 路由，增加 `q` 参数**

在 `backend/app/main.py` 中，修改 `stock_list` 函数签名，增加 `q` 参数，并在函数体内加入搜索逻辑：

```python
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
            kline_rows = (s.query(KlineDay.code, KlineDay.close, KlineDay.date)
                          .filter(KlineDay.code.in_(codes))
                          .order_by(KlineDay.code, KlineDay.date.desc())
                          .all())
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
```

注意：此处保留 `StockListResponse` 作为响应模型（不改为 `StockRow`），因为全市场列表仍需 `is_st`、`is_bj` 等字段。`StockRow` 仅在前端统一展示层使用，后端全市场接口仍返回 `StockListItem`。

- [ ] **Step 2: 在 test_stock_list.py 添加搜索参数测试**

在 `backend/tests/test_stock_list.py` 末尾追加：

```python
def test_stock_list_search_via_q(client, db_path):
    init_db()
    with SessionLocal() as s:
        for i in range(5):
            s.add(Stock(code=f"sz00000{i}", name=f"测试股{i}"))
        s.add(Stock(code="sh600001", name="无关股"))
        s.commit()

    # 搜索 "测试"
    r = client.get("/stocks?q=测试&page_size=10")
    assert r.status_code == 200
    body = r.json()
    assert body["total"] == 5
    assert all("测试" in d["name"] for d in body["data"])

    # 搜索 "sz000"
    r2 = client.get("/stocks?q=sz000&page_size=10")
    assert r2.status_code == 200
    assert r2.json()["total"] == 5

    # 搜索无结果
    r3 = client.get("/stocks?q=不存在&page_size=10")
    assert r3.status_code == 200
    assert r3.json()["total"] == 0

    # 无 q 参数 = 全市场
    r4 = client.get("/stocks?page_size=10")
    assert r4.json()["total"] == 6
```

- [ ] **Step 3: 运行测试验证**

Run: `cd /Users/yuanjiawei/ai-coding/iamrich/backend && source venv/bin/activate && pytest tests/test_stock_list.py -v`
Expected: 所有测试通过

- [ ] **Step 4: Commit**

```bash
git add backend/app/main.py backend/tests/test_stock_list.py
git commit -m "feat: /stocks 接口增加搜索参数 q"
```

---

### Task 3: 后端 — 新增 `/screen/result` 路由

**Files:**
- Modify: `backend/app/screen.py`
- Modify: `backend/app/main.py`
- Modify: `backend/tests/test_screen.py`

- [ ] **Step 1: 在 screen.py 新增 `run_screen_result` 函数**

在 `backend/app/screen.py` 末尾添加：

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

    # 补充 market_cap
    codes = [c["code"] for c in candidates]
    cap_map: dict[str, float | None] = {}
    if codes:
        with _SL() as s:
            for row in s.query(_Stock.code, _Stock.market_cap).filter(_Stock.code.in_(codes)).all():
                cap_map[row.code] = row.market_cap

    items = []
    for c in candidates:
        items.append({
            "code": c["code"],
            "name": c["name"],
            "industry": c.get("industry") or None,
            "market_cap": cap_map.get(c["code"]),
            "close": c.get("close"),
            "pct_chg": c.get("pctChg"),
            "diagnostics": c.get("diagnostics"),
            "sort_key": c.get("sortKey"),
            "trigger_date": c.get("triggerDate"),
        })

    return {"items": items, "total": len(items)}
```

- [ ] **Step 2: 在 main.py 新增 `/screen/result` 路由**

在 `backend/app/main.py` 中，在 `screen_history_detail` 路由之后添加：

```python
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
```

- [ ] **Step 3: 在 test_screen.py 添加路由测试**

在 `backend/tests/test_screen.py` 末尾追加：

```python
def test_screen_result_with_params(client, db_path):
    init_db()
    closes = [20 - i * 0.4 for i in range(40)] + [(20 - 39 * 0.4) * 1.06]
    vols = [1000.0] * 40 + [5000.0]
    _seed_with_date("sz000001", closes, vols)

    r = client.get("/screen/result?preset=b2&params={}")
    assert r.status_code == 200
    body = r.json()
    assert "items" in body
    assert "total" in body
    if body["items"]:
        item = body["items"][0]
        assert "code" in item
        assert "name" in item
        assert "industry" in item
        assert "market_cap" in item
        assert "close" in item
        assert "pct_chg" in item


def test_screen_result_with_history_date(client, db_path):
    init_db()
    closes = [20 - i * 0.4 for i in range(40)] + [(20 - 39 * 0.4) * 1.06]
    vols = [1000.0] * 40 + [5000.0]
    _seed_with_date("sz000001", closes, vols)

    # 先运行一次以生成快照
    run_technical_screen("b2", {})
    from app.screen import list_screen_snapshots
    history = list_screen_snapshots("b2")
    assert len(history) > 0

    date = history[0]["date"]
    r = client.get(f"/screen/result?preset=b2&history_date={date}")
    assert r.status_code == 200
    body = r.json()
    assert "items" in body
    assert body["total"] >= 0


def test_screen_result_rejects_both_params(client, db_path):
    r = client.get("/screen/result?preset=b2&params={}&history_date=2025-01-01")
    assert r.status_code == 400
```

- [ ] **Step 4: 运行测试验证**

Run: `cd /Users/yuanjiawei/ai-coding/iamrich/backend && source venv/bin/activate && pytest tests/test_screen.py -v`
Expected: 所有测试通过

- [ ] **Step 5: Commit**

```bash
git add backend/app/screen.py backend/app/main.py backend/tests/test_screen.py
git commit -m "feat: 新增 /screen/result 统一筛选结果接口"
```

---

### Task 4: 前端 — 新增类型定义和 API 方法

**Files:**
- Modify: `frontend/src/types.ts`
- Modify: `frontend/src/lib/api.ts`

- [ ] **Step 1: 在 types.ts 末尾添加 StockRow 和 ScreenResultResponse**

```typescript
/** 统一的股票行数据，全市场/搜索/筛选结果共用 */
export interface StockRow {
  code: string
  name: string
  industry: string | null
  market_cap: number | null
  close: number | null
  pct_chg: number | null
  diagnostics?: Record<string, number>
  sort_key?: string
  trigger_date?: string
}

/** /screen/result 接口响应 */
export interface ScreenResultResponse {
  items: StockRow[]
  total: number
}
```

- [ ] **Step 2: 在 api.ts 中新增 `stocks` 和 `screenResult` 方法，废弃旧方法**

在 `api` 对象中，在 `screenHistoryDetail` 之后添加：

```typescript
  /** 统一股票列表（全市场 + 搜索） */
  stocks: (params: { q?: string; page?: number; pageSize?: number; sortBy?: string; sortOrder?: string } = {}) => {
    const qs = new URLSearchParams()
    if (params.q) qs.set('q', params.q)
    if (params.page) qs.set('page', String(params.page))
    if (params.pageSize) qs.set('page_size', String(params.pageSize))
    if (params.sortBy) qs.set('sort_by', params.sortBy)
    if (params.sortOrder) qs.set('sort_order', params.sortOrder)
    const q = qs.toString()
    return get<StockListResponse>(`/stocks${q ? `?${q}` : ''}`)
  },

  /** 统一筛选结果（运行筛选 + 历史快照） */
  screenResult: (params: { preset: string; params?: Record<string, number>; historyDate?: string }) => {
    const qs = new URLSearchParams()
    qs.set('preset', params.preset)
    if (params.params) qs.set('params', JSON.stringify(params.params))
    if (params.historyDate) qs.set('history_date', params.historyDate)
    return get<ScreenResultResponse>(`/screen/result?${qs.toString()}`)
  },
```

同时在 `stockList`、`searchStocks`、`screenTechnical`、`screenHistoryDetail` 方法上方添加 `/** @deprecated 使用 stocks() 替代 */` 或 `/** @deprecated 使用 screenResult() 替代 */` 注释。

- [ ] **Step 3: 验证 TypeScript 编译**

Run: `cd /Users/yuanjiawei/ai-coding/iamrich/frontend && npx tsc --noEmit 2>&1 | head -20`
Expected: 无新增错误（旧代码仍引用废弃方法，故不会报错）

- [ ] **Step 4: Commit**

```bash
git add frontend/src/types.ts frontend/src/lib/api.ts
git commit -m "feat: 前端新增 StockRow 类型、stocks() 和 screenResult() API"
```

---

### Task 5: 前端 — 重构 StockListCard 为统一列表组件

**Files:**
- Rewrite: `frontend/src/components/screener/StockListCard.tsx`

- [ ] **Step 1: 重写 StockListCard.tsx**

完整替换为以下代码：

```tsx
import { useCallback, useEffect, useRef, useState } from 'react'
import type { KeyboardEvent, ReactElement } from 'react'
import { ArrowUpDown, ArrowUp, ArrowDown, Loader2, PackageOpen, RefreshCw, X, Search } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { StockRow, StockSortField, SortOrder, ScreenSnapshotMeta } from '@/types'

const PAGE_SIZE = 30

interface ListRow {
  code: string
  name: string
}

function fmtCap(cap: number | null): string {
  if (cap == null) return '—'
  if (cap >= 10000) return `${(cap / 10000).toFixed(2)} 万亿`
  return `${cap.toFixed(1)} 亿`
}

function fmtPctChg(pctChg: number | null): ReactElement | string {
  if (pctChg == null) return '—'
  return (
    <span className={pctChg >= 0 ? 'text-up' : 'text-down'}>
      {pctChg >= 0 ? '+' : ''}{pctChg.toFixed(2)}%
    </span>
  )
}

function fmtClose(close: number | null): string {
  if (close == null) return '—'
  return close.toFixed(2)
}

interface StockListCardProps {
  /** 统一的股票行数据 */
  data: StockRow[]
  /** 数据总数（用于标题展示） */
  total: number
  /** 加载中 */
  loading?: boolean
  /** 加载更多中 */
  loadingMore?: boolean
  /** 当前选中的股票代码 */
  selectedCode?: string
  /** 点击行回调 */
  onSelectCode?: (code: string, name: string) => void
  /** 搜索回调 */
  onSearch?: (q: string) => void
  /** 加载更多回调（分页） */
  onLoadMore?: () => void
  /** 排序回调 */
  onSort?: (sortBy: StockSortField, sortOrder: SortOrder) => void
  /** 当前排序字段 */
  sortBy?: StockSortField
  /** 当前排序方向 */
  sortOrder?: SortOrder
  /** 是否显示排序（全市场模式） */
  showSort?: boolean
  /** 是否显示分页加载更多 */
  hasMore?: boolean
  /** 历史快照日期列表 */
  historyList?: ScreenSnapshotMeta[]
  /** 当前选中的历史日期 */
  selectedHistoryDate?: string
  /** 选择历史日期回调 */
  onSelectHistoryDate?: (date: string) => void
  /** 清除历史选择回调 */
  onClearHistory?: () => void
  /** 错误信息 */
  error?: string | null
  /** 重试回调 */
  onRetry?: () => void
}

export function StockListCard({
  data,
  total,
  loading = false,
  loadingMore = false,
  selectedCode,
  onSelectCode,
  onSearch,
  onLoadMore,
  onSort,
  sortBy = 'code',
  sortOrder = 'asc',
  showSort = false,
  hasMore = false,
  historyList,
  selectedHistoryDate,
  onSelectHistoryDate,
  onClearHistory,
  error,
  onRetry,
}: StockListCardProps) {
  // ---- 搜索 ----
  const [searchQuery, setSearchQuery] = useState('')

  // 搜索关键词变化（防抖）→ 通知父组件
  useEffect(() => {
    const query = searchQuery.trim()
    const timer = setTimeout(() => {
      onSearch?.(query)
    }, 300)
    return () => clearTimeout(timer)
  }, [searchQuery, onSearch])

  // ---- 排序 ----
  const handleSort = (col: StockSortField) => {
    if (!onSort) return
    if (sortBy === col) {
      onSort(col, sortOrder === 'asc' ? 'desc' : 'asc')
    } else {
      onSort(col, 'asc')
    }
  }

  const sortIcon = (col: StockSortField): ReactElement => {
    if (sortBy !== col) return <ArrowUpDown className="size-3 text-ink-faint/50" />
    return sortOrder === 'asc' ? (
      <ArrowUp className="size-3 text-brand" />
    ) : (
      <ArrowDown className="size-3 text-brand" />
    )
  }

  // ---- 滚动容器 + 滚动到底自动加载 ----
  const scrollRef = useRef<HTMLDivElement>(null)
  const sentinelRef = useRef<HTMLDivElement>(null)
  const loadMoreRef = useRef(onLoadMore)
  useEffect(() => { loadMoreRef.current = onLoadMore }, [onLoadMore])

  useEffect(() => {
    const root = scrollRef.current
    const sentinel = sentinelRef.current
    if (!root || !sentinel) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && hasMore) loadMoreRef.current?.()
      },
      { root, threshold: 0 },
    )
    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [hasMore])

  // ---- 行选中 + 键盘导航 ----
  const activeCode = selectedCode
  const rowRefs = useRef<Map<string, HTMLTableRowElement>>(new Map())

  const registerRow = (code: string) => (el: HTMLTableRowElement | null) => {
    if (el) rowRefs.current.set(code, el)
    else rowRefs.current.delete(code)
  }

  const selectRow = useCallback((row: ListRow) => {
    onSelectCode?.(row.code, row.name)
    requestAnimationFrame(() => {
      rowRefs.current.get(row.code)?.scrollIntoView({ block: 'nearest' })
    })
  }, [onSelectCode])

  const handleRowClick = (code: string, name: string) => {
    onSelectCode?.(code, name)
    scrollRef.current?.focus()
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return
    if (data.length === 0) return
    e.preventDefault()
    const idx = data.findIndex((x) => x.code === activeCode)
    if (e.key === 'ArrowDown') {
      if (idx === -1) {
        selectRow(data[0])
      } else if (idx < data.length - 1) {
        selectRow(data[idx + 1])
      }
    } else {
      if (idx === -1) {
        selectRow(data[0])
      } else if (idx > 0) {
        selectRow(data[idx - 1])
      }
    }
  }

  const title = '股票列表'
  const subtitle = `共 ${total.toLocaleString()} 只`

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-3">
        <div className="flex items-baseline gap-3">
          <CardTitle>{title}</CardTitle>
          <span className="text-[13px] text-ink-faint">{subtitle}</span>
        </div>
        <div className="flex items-center gap-2">
          {/* 搜索框 */}
          <div className="relative w-40">
            <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-ink-faint" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="搜索代码/名称..."
              className="w-full rounded-lg border border-line-soft bg-paper-2/50 py-1.5 pl-8 pr-3 text-[13px] text-ink placeholder:text-ink-faint/60 focus:border-brand focus:outline-none"
            />
          </div>
          {/* 历史下拉框 — 有历史数据时始终可见 */}
          {historyList && historyList.length > 0 && (
            <select
              value={selectedHistoryDate ?? ''}
              onChange={(e) => {
                const v = e.target.value
                if (v === '') {
                  onClearHistory?.()
                } else {
                  onSelectHistoryDate?.(v)
                }
              }}
              className="rounded-lg border border-line-soft bg-paper-2/50 px-2 py-1.5 text-[13px] text-ink focus:border-brand focus:outline-none"
            >
              <option value="">全部股票</option>
              {historyList.map((h) => (
                <option key={h.date} value={h.date}>
                  {h.date}（{h.count}只）
                </option>
              ))}
            </select>
          )}
        </div>
      </CardHeader>

      <CardContent className="pt-2">
        <div
          ref={scrollRef}
          tabIndex={0}
          onKeyDown={handleKeyDown}
          className="max-h-[calc(100vh-220px)] overflow-y-auto overflow-x-auto rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/30"
        >
          {loading && data.length === 0 ? (
            <div className="flex items-center justify-center py-10 text-sm text-ink-faint">
              加载中...
            </div>
          ) : error ? (
            <div className="flex flex-col items-center gap-2 py-10">
              <span className="text-sm text-red-500">{error}</span>
              {onRetry && (
                <Button variant="outline" size="sm" onClick={onRetry}>
                  <RefreshCw className="size-3" />
                  重试
                </Button>
              )}
            </div>
          ) : data.length === 0 ? (
            <div className="flex flex-col items-center gap-1.5 py-10 text-center">
              <PackageOpen className="size-7 text-ink-faint/60" strokeWidth={1.5} />
              <span className="text-sm text-ink-soft">暂无数据</span>
            </div>
          ) : (
            <table className="w-full border-collapse">
              <thead>
                <tr className="sticky top-0 z-10 bg-paper text-left text-xs text-ink-faint">
                  <th
                    className={cn(
                      'px-2 pb-2 font-medium',
                      showSort && 'cursor-pointer select-none hover:text-ink-soft',
                    )}
                    onClick={showSort ? () => handleSort('code') : undefined}
                  >
                    <span className="inline-flex items-center gap-1">
                      代码 {showSort && sortIcon('code')}
                    </span>
                  </th>
                  <th
                    className={cn(
                      'px-2 pb-2 font-medium',
                      showSort && 'cursor-pointer select-none hover:text-ink-soft',
                    )}
                    onClick={showSort ? () => handleSort('name') : undefined}
                  >
                    <span className="inline-flex items-center gap-1">
                      名称 {showSort && sortIcon('name')}
                    </span>
                  </th>
                  <th className="px-2 pb-2 font-medium">行业</th>
                  <th
                    className={cn(
                      'px-2 pb-2 text-right font-medium',
                      showSort && 'cursor-pointer select-none hover:text-ink-soft',
                    )}
                    onClick={showSort ? () => handleSort('market_cap') : undefined}
                  >
                    <span className="inline-flex items-center gap-1">
                      市值 {showSort && sortIcon('market_cap')}
                    </span>
                  </th>
                  <th className="px-2 pb-2 text-right font-medium">收盘价</th>
                  <th className="px-2 pb-2 text-right font-medium">涨跌幅</th>
                </tr>
              </thead>
              <tbody>
                {data.map((s) => {
                  const on = s.code === activeCode
                  return (
                    <tr
                      key={s.code}
                      ref={registerRow(s.code)}
                      onClick={() => handleRowClick(s.code, s.name)}
                      className={cn(
                        'cursor-pointer border-t border-line-soft transition-colors duration-200 hover:bg-paper-2/70',
                        on && 'bg-brand-soft',
                      )}
                    >
                      <td className="tnum px-2 py-2.5 text-[13px] text-ink-soft">{s.code}</td>
                      <td className="px-2 py-2.5 text-sm font-semibold text-ink">{s.name}</td>
                      <td className="px-2 py-2.5 text-[13px] text-ink-soft">{s.industry || '—'}</td>
                      <td className="tnum px-2 py-2.5 text-right text-[13px] text-ink-soft">{fmtCap(s.market_cap)}</td>
                      <td className="tnum px-2 py-2.5 text-right text-sm text-ink">{fmtClose(s.close)}</td>
                      <td className="tnum px-2 py-2.5 text-right text-[13px]">{fmtPctChg(s.pct_chg)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}

          {/* 加载更多提示 + 哨兵 */}
          {loadingMore && (
            <div className="flex items-center justify-center gap-1.5 py-3 text-xs text-ink-faint">
              <Loader2 className="size-3 animate-spin" />
              加载中...
            </div>
          )}
          <div ref={sentinelRef} className="h-px" />
        </div>
      </CardContent>
    </Card>
  )
}
```

- [ ] **Step 2: 验证 TypeScript 编译**

Run: `cd /Users/yuanjiawei/ai-coding/iamrich/frontend && npx tsc --noEmit 2>&1 | head -30`
Expected: 仅有 `TechnicalScreenView.tsx` 中因旧 props 导致的类型错误（下一步修复）

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/screener/StockListCard.tsx
git commit -m "refactor: 重构 StockListCard 为统一列表组件"
```

---

### Task 6: 前端 — 重构 TechnicalScreenView，消除 screenMode

**Files:**
- Rewrite: `frontend/src/components/technical/TechnicalScreenView.tsx`

- [ ] **Step 1: 重写 TechnicalScreenView.tsx**

完整替换为以下代码：

```tsx
import { forwardRef, useCallback, useEffect, useMemo, useRef, useState, useImperativeHandle } from 'react'
import { X } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { StockListCard } from '@/components/screener/StockListCard'
import { PriceChart } from '@/components/detail/PriceChart'
import { TechnicalFilterCard } from './TechnicalFilterCard'
import { api } from '@/lib/api'
import type { ActivityStatus, Kline, KlineTimeframe, Preset, StrategyId, StockRow, ScreenSnapshotMeta, StockSortField, SortOrder } from '@/types'

const EMPTY_KLINE: Record<KlineTimeframe, Kline[]> = { day: [], week: [], month: [], quarter: [] }

export interface TechnicalScreenViewHandle {
  toggleFilter: () => void
}

export const TechnicalScreenView = forwardRef<TechnicalScreenViewHandle, {
  strategy: StrategyId
  preset: Preset | null
  onActivity: (id: string, status: ActivityStatus, label: string, detail?: string) => void
}>(function TechnicalScreenView({
  strategy,
  preset,
  onActivity,
}, ref) {
  const [paramValues, setParamValues] = useState<Record<string, number>>({})
  const [selectedCode, setSelectedCode] = useState<string>('')
  const [selectedName, setSelectedName] = useState<string>('')
  const [kline, setKline] = useState<Record<KlineTimeframe, Kline[]>>(EMPTY_KLINE)
  const [filterOpen, setFilterOpen] = useState(false)
  const [screening, setScreening] = useState(false)
  const screeningRef = useRef(false)

  // ---- 统一列表数据 ----
  const [stockData, setStockData] = useState<StockRow[]>([])
  const [stockTotal, setStockTotal] = useState(0)
  const [stockLoading, setStockLoading] = useState(true)
  const [stockLoadingMore, setStockLoadingMore] = useState(false)
  const [stockError, setStockError] = useState<string | null>(null)
  const [nextPage, setNextPage] = useState(1)
  const [sortBy, setSortBy] = useState<StockSortField>('code')
  const [sortOrder, setSortOrder] = useState<SortOrder>('asc')

  // ---- 搜索 / 历史 / 数据源标记 ----
  const [searchQuery, setSearchQuery] = useState('')
  const [historyList, setHistoryList] = useState<ScreenSnapshotMeta[]>([])
  const [selectedHistoryDate, setSelectedHistoryDate] = useState<string | null>(null)
  // 'market' = 全市场列表, 'screen' = 筛选结果, 'history' = 历史结果
  const [dataSource, setDataSource] = useState<'market' | 'screen' | 'history'>('market')

  const isMarketMode = dataSource === 'market'

  // 暴露 toggleFilter
  useImperativeHandle(ref, () => ({
    toggleFilter: () => setFilterOpen((v) => !v),
  }))

  // ---- 加载全市场列表 ----
  const fetchMarketData = useCallback(async (page: number = 1, append: boolean = false) => {
    if (page === 1) {
      setStockLoading(true)
      setStockError(null)
    } else {
      setStockLoadingMore(true)
    }
    try {
      const res = await api.stocks({
        q: searchQuery || undefined,
        page,
        pageSize: 30,
        sortBy,
        sortOrder,
      })
      // 将 StockListItem 映射为 StockRow
      const items: StockRow[] = res.data.map((s) => ({
        code: s.code,
        name: s.name,
        industry: s.industry,
        market_cap: s.market_cap,
        close: s.close,
        pct_chg: s.pct_chg,
      }))
      if (append) {
        setStockData((prev) => [...prev, ...items])
      } else {
        setStockData(items)
        if (items.length > 0 && page === 1 && !selectedCode) {
          setSelectedCode(items[0].code)
          setSelectedName(items[0].name)
        }
      }
      setStockTotal(res.total)
      setNextPage(page + 1)
    } catch {
      if (!append) setStockError('加载失败')
    } finally {
      setStockLoading(false)
      setStockLoadingMore(false)
    }
  }, [searchQuery, sortBy, sortOrder, selectedCode])

  // 初始加载 / 排序/搜索变化时重新加载
  useEffect(() => {
    if (isMarketMode) fetchMarketData(1, false)
  }, [fetchMarketData, isMarketMode])

  // ---- 加载历史列表 ----
  const loadHistoryList = useCallback(async () => {
    try {
      const hList = await api.screenHistory(strategy)
      setHistoryList(hList)
    } catch {
      setHistoryList([])
    }
  }, [strategy])

  useEffect(() => {
    loadHistoryList()
  }, [loadHistoryList])

  // ---- 切换策略时重置 ----
  useEffect(() => {
    if (preset) {
      const defaults = Object.fromEntries(preset.params.map((p) => [p.key, p.value]))
      setParamValues(() => defaults)
    }
    setFilterOpen(false)
    setSearchQuery('')
    setSelectedHistoryDate(null)
    setDataSource('market')
    setHistoryList([])
    setSelectedCode('')
    setSelectedName('')
  }, [preset])

  // ---- 选中股票 → 拉取K线 ----
  useEffect(() => {
    if (!selectedCode) return
    let cancelled = false
    const load = async () => {
      try {
        const periods: KlineTimeframe[] = ['day', 'week', 'month', 'quarter']
        const results = await Promise.all(periods.map((p) => api.stockKline(selectedCode, p)))
        if (cancelled) return
        setKline({
          day: results[0].data, week: results[1].data,
          month: results[2].data, quarter: results[3].data,
        })
      } catch {
        if (!cancelled) setKline(EMPTY_KLINE)
      }
    }
    load()
    return () => { cancelled = true }
  }, [selectedCode])

  // ---- 搜索回调 ----
  const handleSearch = useCallback((q: string) => {
    setSearchQuery(q)
    setSelectedHistoryDate(null)
    setDataSource('market')
  }, [])

  // ---- 排序回调 ----
  const handleSort = useCallback((newSortBy: StockSortField, newSortOrder: SortOrder) => {
    setSortBy(newSortBy)
    setSortOrder(newSortOrder)
  }, [])

  // ---- 加载更多回调 ----
  const handleLoadMore = useCallback(() => {
    if (stockLoadingMore || stockData.length >= stockTotal) return
    fetchMarketData(nextPage, true)
  }, [stockLoadingMore, stockData, stockTotal, nextPage, fetchMarketData])

  // ---- 运行筛选 ----
  const runScreenFn = useMemo(() => async () => {
    if (screeningRef.current) return
    screeningRef.current = true
    setScreening(true)
    setFilterOpen(false)
    const label = `${preset?.name ?? '技术面'}筛选`
    onActivity('technical-screen', 'running', label)
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
      onActivity('technical-screen', 'done', label, `共 ${res.total} 只入选`)
      // 刷新历史列表
      loadHistoryList()
    } catch {
      setStockData([])
      setStockTotal(0)
      setDataSource('screen')
      onActivity('technical-screen', 'error', label, '请求失败')
    } finally {
      screeningRef.current = false
      setScreening(false)
    }
  }, [strategy, paramValues, preset, onActivity, loadHistoryList])

  // ---- 选择历史日期 ----
  const handleSelectHistoryDate = useCallback(async (date: string) => {
    if (date === selectedHistoryDate) return
    try {
      const res = await api.screenResult({ preset: strategy, historyDate: date })
      setStockData(res.items)
      setStockTotal(res.total)
      setDataSource('history')
      setSelectedHistoryDate(date)
      setSearchQuery('')
      if (res.items[0]) {
        setSelectedCode(res.items[0].code)
        setSelectedName(res.items[0].name)
      }
    } catch {
      // 请求失败时不切换
    }
  }, [strategy, selectedHistoryDate])

  // ---- 清除历史选择 → 返回全市场 ----
  const handleClearHistory = useCallback(() => {
    setSelectedHistoryDate(null)
    setDataSource('market')
    setSearchQuery('')
  }, [])

  // ---- 抽屉外点击收起 ----
  const drawerRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!filterOpen) return
    const handleClickOutside = (e: MouseEvent) => {
      if (drawerRef.current && !drawerRef.current.contains(e.target as Node)) {
        setFilterOpen(false)
      }
    }
    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside)
    }, 0)
    return () => {
      clearTimeout(timer)
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [filterOpen])

  return (
    <div className="relative flex flex-1 overflow-hidden">
      {/* 筛选抽屉 */}
      {filterOpen && (
        <div
          ref={drawerRef}
          className="absolute left-0 top-0 z-30 flex h-full w-[180px] flex-col border-r border-line bg-paper/95 px-3 py-5 shadow-lg backdrop-blur-sm"
        >
          <div className="mb-3 flex items-center justify-between">
            <span className="text-xs font-medium text-ink-soft">筛选参数</span>
            <button
              onClick={() => setFilterOpen(false)}
              className="rounded-md p-1 text-ink-faint hover:bg-paper-2 hover:text-ink-soft"
            >
              <X className="size-3.5" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto">
            <TechnicalFilterCard
              preset={preset}
              paramValues={paramValues}
              onParamChange={(k, v) => setParamValues((s) => ({ ...s, [k]: v }))}
              onApply={runScreenFn}
              loading={screening}
            />
          </div>
        </div>
      )}

      {/* 主内容区 */}
      <main className="grid flex-1 grid-cols-1 gap-5 overflow-y-auto p-6 2xl:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
        <div className="flex min-w-0 flex-col gap-5">
          <StockListCard
            data={stockData}
            total={stockTotal}
            loading={stockLoading}
            loadingMore={stockLoadingMore}
            selectedCode={selectedCode}
            onSelectCode={handleSelectCode}
            onSearch={handleSearch}
            onLoadMore={isMarketMode ? handleLoadMore : undefined}
            onSort={isMarketMode ? handleSort : undefined}
            sortBy={sortBy}
            sortOrder={sortOrder}
            showSort={isMarketMode}
            hasMore={isMarketMode && stockData.length < stockTotal}
            historyList={historyList.length > 0 ? historyList : undefined}
            selectedHistoryDate={selectedHistoryDate ?? undefined}
            onSelectHistoryDate={handleSelectHistoryDate}
            onClearHistory={handleClearHistory}
            error={stockError}
            onRetry={isMarketMode ? () => fetchMarketData(1, false) : undefined}
          />
        </div>
        <div className="min-w-0">
          <Card>
            <CardContent className="pt-5">
              <PriceChart
                stockName={selectedName}
                klineDay={kline.day} klineWeek={kline.week}
                klineMonth={kline.month} klineQuarter={kline.quarter}
              />
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  )

  function handleSelectCode(code: string, name: string) {
    setSelectedCode(code)
    setSelectedName(name)
  }
})
```

- [ ] **Step 2: 验证 TypeScript 编译**

Run: `cd /Users/yuanjiawei/ai-coding/iamrich/frontend && npx tsc --noEmit 2>&1 | head -30`
Expected: 无错误

- [ ] **Step 3: 验证前端 lint**

Run: `cd /Users/yuanjiawei/ai-coding/iamrich/frontend && npm run lint 2>&1 | tail -10`
Expected: 无新增错误

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/technical/TechnicalScreenView.tsx
git commit -m "refactor: TechnicalScreenView 消除 screenMode，统一数据流"
```

---

### Task 7: 端到端验证

**Files:**
- None (验证 only)

- [ ] **Step 1: 运行后端全部测试**

Run: `cd /Users/yuanjiawei/ai-coding/iamrich/backend && source venv/bin/activate && pytest -v 2>&1 | tail -30`
Expected: 全部通过

- [ ] **Step 2: 运行前端构建**

Run: `cd /Users/yuanjiawei/ai-coding/iamrich/frontend && npm run build 2>&1 | tail -15`
Expected: 构建成功

- [ ] **Step 3: 手动验证**

1. 启动后端：`cd backend && source venv/bin/activate && uvicorn app.main:app --reload`
2. 启动前端：`cd frontend && npm run dev`
3. 在浏览器中验证：
   - 打开技术战法面板，股票列表显示 6 列（代码/名称/行业/市值/收盘价/涨跌幅）
   - 搜索框输入关键词，列表切换为搜索结果，仍为 6 列
   - 清空搜索，列表恢复全市场
   - 历史下拉框在无筛选时也可见（如有历史数据）
   - 选择历史日期，列表展示历史结果
   - 选择「全部股票」，列表恢复全市场
   - 运行筛选，列表展示筛选结果，仍为 6 列
   - 切换策略，列表重置为全市场

- [ ] **Step 4: Commit（如有修复）**

```bash
git add -A
git commit -m "fix: 端到端验证修复"
```

---

## Self-Review Checklist

### 1. Spec Coverage

| 规格要求 | 对应任务 |
|---|---|
| `/stocks` 增加搜索参数 `q` | Task 2 |
| `/screen/result` 合并筛选与历史 | Task 3 |
| `/screen/history` 保持不变 | 无需改动 |
| 统一 `StockRow` 数据结构 | Task 1 (后端) + Task 4 (前端) |
| `StockListCard` 统一 6 列展示 | Task 5 |
| 历史下拉框始终可见 | Task 5 |
| `TechnicalScreenView` 去掉 `screenMode` | Task 6 |
| 搜索合并到 `/stocks?q=` | Task 2 |
| 旧接口标记 deprecated | Task 4 |

### 2. Placeholder Scan

无 TBD/TODO/占位符。

### 3. Type Consistency

- `StockRow.code`: string ✓ (Task 1 → Task 4 → Task 5 → Task 6 全部一致)
- `StockRow.market_cap`: `number | null` (前端) / `Optional[float]` (后端) ✓
- `StockRow.pct_chg`: `number | null` (前端) / `Optional[float]` (后端) ✓
- `ScreenResultResponse.items`: `List[StockRow]` ✓
- `api.screenResult` 返回 `ScreenResultResponse` ✓
- `handleSort` 签名 `(StockSortField, SortOrder)` 与 `StockListCard` 的 `onSort` prop 一致 ✓
