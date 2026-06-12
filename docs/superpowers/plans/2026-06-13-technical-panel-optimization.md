# 技术面战法前端面板优化 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 对技术面战法前端面板进行 11 项优化，包括布局重构、K线图交互修复、数据展示增强和搜索功能新增。

**Architecture:** 最小改动方案——逐项修改对应文件，不改变整体架构。后端新增搜索接口和扩展 /stocks 返回字段；前端按组件边界逐个修改。

**Tech Stack:** React 19 + TypeScript + ECharts + Tailwind v4 (前端), FastAPI + SQLAlchemy + SQLite (后端)

---

## File Structure

| 文件 | 操作 | 职责 |
|------|------|------|
| `backend/app/schemas.py` | 修改 | StockListItem 新增 close/pct_chg 字段 |
| `backend/app/kline_service.py` | 修改 | 返回 volume 字段 |
| `backend/app/main.py` | 修改 | /stocks 扩展返回 close/pct_chg；新增 /stocks/search |
| `backend/app/schemas.py` | 修改 | 新增 StockSearchItem schema |
| `frontend/src/types.ts` | 修改 | Kline 新增 volume；StockListItem 新增 close/pct_chg；新增 StockSearchItem |
| `frontend/src/lib/api.ts` | 修改 | 新增 searchStocks 方法 |
| `frontend/src/components/detail/PriceChart.tsx` | 修改 | tooltip 行为/样式、成交量区域、KDJ只显示J线、x轴间隔 |
| `frontend/src/components/layout/TopBar.tsx` | 修改 | 进度信息移入、按钮按类别显示 |
| `frontend/src/components/layout/StrategySidebar.tsx` | 修改 | 筛选按钮、抽屉展开逻辑 |
| `frontend/src/components/technical/TechnicalFilterCard.tsx` | 修改 | 适配抽屉竖向布局 |
| `frontend/src/components/technical/TechnicalScreenView.tsx` | 修改 | 移除进度/筛选卡片、抽屉状态、名字联动、默认选中第一条 |
| `frontend/src/components/screener/StockListCard.tsx` | 修改 | 新增列、搜索框、onSelectCode 传递 name |
| `frontend/src/App.tsx` | 修改 | 移除 DataRefreshProgress、传递 refreshStatus 给 TopBar |

---

### Task 1: 后端 — K线接口返回 volume 字段

**Files:**
- Modify: `backend/app/kline_service.py:34-46`
- Modify: `backend/app/schemas.py:20-31`

- [ ] **Step 1: 在 KlinePoint schema 中新增 volume 字段**

在 `backend/app/schemas.py` 的 `KlinePoint` 类中新增：

```python
class KlinePoint(BaseModel):
    date: str
    open: float
    close: float
    high: float
    low: float
    volume: Optional[float] = None
    k: Optional[float] = None
    d: Optional[float] = None
    j: Optional[float] = None
    whiteLine: Optional[float] = None
    yellowLine: Optional[float] = None
```

- [ ] **Step 2: 在 kline_service.py 的返回数据中包含 volume**

在 `backend/app/kline_service.py` 的 `data.append({...})` 中新增 volume 字段：

```python
data.append({
    "date": df["date"].iloc[i],
    "open": round(float(df["open"].iloc[i]), 2),
    "close": round(float(df["close"].iloc[i]), 2),
    "high": round(float(df["high"].iloc[i]), 2),
    "low": round(float(df["low"].iloc[i]), 2),
    "volume": round(float(df["volume"].iloc[i]), 2) if pd.notna(df["volume"].iloc[i]) else None,
    "k": _round(kdj["K"].iloc[i]),
    "d": _round(kdj["D"].iloc[i]),
    "j": _round(kdj["J"].iloc[i]),
    "whiteLine": _round(white.iloc[i]),
    "yellowLine": _round(yellow.iloc[i]),
})
```

- [ ] **Step 3: 手动验证**

启动后端 `cd backend && source venv/bin/activate && uvicorn app.main:app --reload`，访问 `http://localhost:8000/stock/sz000001/kline?period=day`，确认返回数据中包含 `volume` 字段。

- [ ] **Step 4: Commit**

```bash
git add backend/app/kline_service.py backend/app/schemas.py
git commit -m "feat: K线接口返回 volume 字段"
```

---

### Task 2: 后端 — /stocks 接口扩展返回 close 和 pct_chg

**Files:**
- Modify: `backend/app/schemas.py:39-49`
- Modify: `backend/app/main.py:133-161`

- [ ] **Step 1: 在 StockListItem schema 中新增 close/pct_chg 字段**

在 `backend/app/schemas.py` 的 `StockListItem` 类中新增：

```python
class StockListItem(BaseModel):
    code: str
    name: str
    market_cap: Optional[float] = None
    industry: Optional[str] = None
    is_st: bool = False
    is_bj: bool = False
    listed_at: Optional[str] = None
    updated_at: Optional[str] = None
    close: Optional[float] = None
    pct_chg: Optional[float] = None

    model_config = {"from_attributes": True}
```

- [ ] **Step 2: 修改 /stocks 路由，从最新日K获取 close/pct_chg**

修改 `backend/app/main.py` 中的 `stock_list` 函数，在查询后为每只股票从 `kline_day` 获取最新收盘价和涨跌幅：

```python
@app.get("/stocks", response_model=StockListResponse)
def stock_list(
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
        total = base_q.count()

        sort_col = getattr(Stock, sort_by)
        if sort_order == "desc":
            sort_col = sa_desc(sort_col)
        else:
            sort_col = sort_col.asc()

        rows = base_q.order_by(sort_col).offset((page - 1) * page_size).limit(page_size).all()

        # 获取这些股票的最新日K收盘价
        codes = [r.code for r in rows]
        latest_kline = {}
        if codes:
            # 子查询：每只股票最新日期的K线
            kline_rows = (s.query(KlineDay.code, KlineDay.close, KlineDay.date)
                          .filter(KlineDay.code.in_(codes))
                          .order_by(KlineDay.code, KlineDay.date.desc())
                          .all())
            seen_codes = set()
            for kr in kline_rows:
                if kr.code not in seen_codes:
                    seen_codes.add(kr.code)
                    latest_kline[kr.code] = {"close": kr.close, "date": kr.date}

            # 获取前一日收盘价计算涨跌幅
            prev_kline = {}
            kline_rows2 = (s.query(KlineDay.code, KlineDay.close, KlineDay.date)
                           .filter(KlineDay.code.in_(codes))
                           .order_by(KlineDay.code, KlineDay.date.desc())
                           .all())
            code_prev_dates = {}
            for kr in kline_rows2:
                if kr.code not in code_prev_dates:
                    code_prev_dates[kr.code] = []
                code_prev_dates[kr.code].append(kr)
            for code, krs in code_prev_dates.items():
                if len(krs) >= 2:
                    prev_close = krs[1].close  # 第二新的就是前一日
                    curr_close = krs[0].close
                    if prev_close and prev_close > 0:
                        prev_kline[code] = round((curr_close - prev_close) / prev_close * 100, 2)

        items = []
        for r in rows:
            item = StockListItem.model_validate(r)
            if r.code in latest_kline:
                item.close = round(latest_kline[r.code]["close"], 2)
            if r.code in prev_kline:
                item.pct_chg = prev_kline[r.code]
            items.append(item)

    return StockListResponse(
        total=total,
        page=page,
        pageSize=page_size,
        data=items,
    )
```

- [ ] **Step 3: 启动后端验证**

访问 `http://localhost:8000/stocks?page=1&page_size=5`，确认返回数据包含 `close` 和 `pct_chg`。

- [ ] **Step 4: Commit**

```bash
git add backend/app/schemas.py backend/app/main.py
git commit -m "feat: /stocks 接口返回最新收盘价和涨跌幅"
```

---

### Task 3: 后端 — 新增 /stocks/search 搜索接口

**Files:**
- Modify: `backend/app/schemas.py`
- Modify: `backend/app/main.py`

- [ ] **Step 1: 新增 StockSearchItem schema 和 StockSearchResponse**

在 `backend/app/schemas.py` 末尾添加：

```python
class StockSearchItem(BaseModel):
    code: str
    name: str
    close: Optional[float] = None
    pct_chg: Optional[float] = None


class StockSearchResponse(BaseModel):
    data: List[StockSearchItem]
```

- [ ] **Step 2: 在 main.py 新增 /stocks/search 路由**

在 `backend/app/main.py` 中的 `stock_list` 路由后面添加：

```python
@app.get("/stocks/search", response_model=StockSearchResponse)
def stock_search(q: str = Query(..., min_length=1)):
    from app.db import SessionLocal
    from app.models import Stock, KlineDay

    with SessionLocal() as s:
        rows = (s.query(Stock)
                .filter(Stock.delisted_at.is_(None),
                        (Stock.code.contains(q)) | (Stock.name.contains(q)))
                .limit(20)
                .all())

        # 获取最新收盘价
        codes = [r.code for r in rows]
        latest_close = {}
        if codes:
            kline_rows = (s.query(KlineDay.code, KlineDay.close)
                          .filter(KlineDay.code.in_(codes))
                          .order_by(KlineDay.code, KlineDay.date.desc())
                          .all())
            seen = set()
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
                pct_chg=None,  # 搜索结果简化，不计算涨跌幅
            ))

    return StockSearchResponse(data=items)
```

> **注：** 拼音首字母搜索需要 pypinyin 库，作为简化实现先用 code 和 name 的 contains 搜索。后续如需拼音支持可迭代添加。

- [ ] **Step 3: 验证**

访问 `http://localhost:8000/stocks/search?q=平安` 确认返回匹配结果。

- [ ] **Step 4: Commit**

```bash
git add backend/app/schemas.py backend/app/main.py
git commit -m "feat: 新增 /stocks/search 搜索接口"
```

---

### Task 4: 前端 — 类型定义和 API 层更新

**Files:**
- Modify: `frontend/src/types.ts`
- Modify: `frontend/src/lib/api.ts`

- [ ] **Step 1: 更新 types.ts**

在 `Kline` 接口中新增 `volume`：

```typescript
export interface Kline {
  date: string
  open: number
  close: number
  low: number
  high: number
  volume?: number | null
  k?: number | null
  d?: number | null
  j?: number | null
  whiteLine?: number | null
  yellowLine?: number | null
}
```

在 `StockListItem` 接口中新增 `close` 和 `pct_chg`：

```typescript
export interface StockListItem {
  code: string
  name: string
  market_cap: number | null
  industry: string | null
  is_st: boolean
  is_bj: boolean
  listed_at: string | null
  updated_at: string | null
  close: number | null
  pct_chg: number | null
}
```

在文件末尾新增 `StockSearchItem`：

```typescript
export interface StockSearchItem {
  code: string
  name: string
  close: number | null
  pct_chg: number | null
}
```

- [ ] **Step 2: 更新 api.ts — 新增 searchStocks 方法**

在 `frontend/src/lib/api.ts` 中：
1. 在 import 中新增 `StockSearchItem`
2. 在 `api` 对象中新增：

```typescript
searchStocks: (q: string) =>
  get<{ data: StockSearchItem[] }>(`/stocks/search?q=${encodeURIComponent(q)}`),
```

- [ ] **Step 3: 验证编译**

运行 `cd frontend && npx tsc --noEmit` 确认无类型错误。

- [ ] **Step 4: Commit**

```bash
git add frontend/src/types.ts frontend/src/lib/api.ts
git commit -m "feat: 前端类型定义和 API 层更新"
```

---

### Task 5: 前端 — PriceChart 全面优化（tooltip、成交量、KDJ、x轴）

**Files:**
- Modify: `frontend/src/components/detail/PriceChart.tsx`

这是改动最大的任务，涵盖规格 #3/#5/#6/#7/#9/#10。

- [ ] **Step 1: 重写 tooltipFormatter — 颜色区分、收盘价右上角、只显示J线、成交量**

替换整个 `tooltipFormatter` 函数：

```typescript
function tooltipFormatter(params: any[]) {
  if (!params || params.length === 0) return ''
  const date = params[0]?.axisValue ?? ''

  // K线数据
  const kline = params.find((p: any) => p.seriesName === 'K线' || p.seriesName === '收盘')
  let isUp = true
  let closePrice = ''
  const fields: string[] = []

  if (kline && Array.isArray(kline.data)) {
    isUp = kline.data[1] >= kline.data[0]
    closePrice = String(kline.data[1])
    fields.push(`<span style="color:#8b96a1">开盘:</span> ${kline.data[0]}`)
    fields.push(`<span style="color:#8b96a1">最低:</span> ${kline.data[2]}`)
    fields.push(`<span style="color:#8b96a1">最高:</span> ${kline.data[3]}`)
  } else if (kline && kline.data != null) {
    isUp = true
    closePrice = String(kline.data)
    fields.push(`<span style="color:#8b96a1">收盘:</span> ${kline.data}`)
  }

  const closeColor = isUp ? '#c0392b' : '#2f8f6f'

  // 成交量
  const vol = params.find((p: any) => p.seriesName === '成交量')
  if (vol?.data != null && vol.data !== '-') {
    fields.push(`<span style="color:#6b7fa3">成交量:</span> ${vol.data}`)
  }

  // 白线黄线
  const white = params.find((p: any) => p.seriesName === '白线')
  const yellow = params.find((p: any) => p.seriesName === '黄线')
  if (white?.data != null) fields.push(`<span style="color:#2b6cb0">白线:</span> ${white.data}`)
  if (yellow?.data != null) fields.push(`<span style="color:#c79a3a">黄线:</span> ${yellow.data}`)

  // J 线
  const j = params.find((p: any) => p.seriesName === 'J')
  let jHtml = ''
  if (j?.data != null) {
    jHtml = `<div style="margin-top:4px;padding-top:4px;border-top:1px solid #e9e0c9">
      <span style="color:#c0392b">J:</span> ${j.data}</div>`
  }

  const html = `<div style="position:relative;min-width:120px">
    <div style="font-weight:600;margin-bottom:4px">${date}
      <span style="float:right;font-size:16px;font-weight:700;color:${closeColor}">${closePrice}</span>
    </div>
    ${fields.join('<br/>')}
    ${jHtml}
  </div>`

  return html
}
```

- [ ] **Step 2: 修改 ChartBody — 移除点击固定逻辑，移除 pinnedIndex/pinnedRef**

1. 删除 `const [pinnedIndex, setPinnedIndex] = useState<number | null>(null)` 这一行
2. 删除整个 `// 点击K线固定/取消 tooltip` 的 `useEffect` 块（第112-135行），包括 `const pinnedRef = useRef<number | null>(null)`

- [ ] **Step 3: 修改 tooltip 配置 — triggerOn 改为 mousemove**

将 `tooltip` 配置中的 `triggerOn: 'mousemove|click'` 改为：

```typescript
triggerOn: 'mousemove',
```

- [ ] **Step 4: 修改 KDJ 只显示 J 线**

将 `kdjSeries` 替换为：

```typescript
const kdjSeries = hasKdj
  ? [
      { type: 'line' as const, xAxisIndex: 2, yAxisIndex: 2, name: 'J', data: data.map((d) => d.j ?? null),
        symbol: 'none', lineStyle: { color: '#c0392b', width: 1 }, connectNulls: true },
    ]
  : []
```

注意 `xAxisIndex` 和 `yAxisIndex` 改为 2（因为成交量占 index 1）。

- [ ] **Step 5: 新增成交量系列**

在 `kdjSeries` 定义之前添加成交量系列：

```typescript
const volumeSeries = [{
  type: 'bar' as const,
  xAxisIndex: 1,
  yAxisIndex: 1,
  name: '成交量',
  data: data.map((d) => ({
    value: d.volume ?? 0,
    itemStyle: { color: d.close >= d.open ? 'rgba(192,57,43,0.6)' : 'rgba(47,143,111,0.6)' },
  })),
}]
```

- [ ] **Step 6: 修改 grid 为三区域布局**

将 `grid` 配置替换为：

```typescript
grid: hasKdj
  ? [{ left: 8, right: 12, top: 28, height: '46%', containLabel: true },    // K线
     { left: 8, right: 12, top: '56%', height: '14%', containLabel: true },  // 成交量
     { left: 8, right: 12, top: '76%', height: '14%', containLabel: true }]  // KDJ
  : [{ left: 8, right: 12, top: 28, height: '58%', containLabel: true },
     { left: 8, right: 12, top: '68%', height: '18%', containLabel: true }],
```

- [ ] **Step 7: 修改 xAxis — 三区域联动**

将 `xAxis` 配置替换为：

```typescript
xAxis: hasKdj
  ? [{ ...xCommon, axisLabel: { show: false }, gridIndex: 0 },
     { ...xCommon, axisLabel: { show: false }, gridIndex: 1 },
     { ...xCommon, gridIndex: 2, axisLabel: { color: INK_SOFT, fontSize: 10, formatter: (v: string) => v.slice(0, 7), interval: Math.max(Math.floor(data.length / 8), 0) } }]
  : [{ ...xCommon, axisLabel: { show: false }, gridIndex: 0 },
     { ...xCommon, gridIndex: 1, axisLabel: { color: INK_SOFT, fontSize: 10, formatter: (v: string) => v.slice(0, 7), interval: Math.max(Math.floor(data.length / 8), 0) } }],
```

- [ ] **Step 8: 修改 yAxis — 三区域**

将 `yAxis` 配置替换为：

```typescript
yAxis: hasKdj
  ? [{ scale: true, position: 'right', gridIndex: 0, splitLine: { lineStyle: { color: '#f0e8d4' } },
       axisLabel: { color: INK_SOFT, fontSize: 10 } },
     { position: 'right', gridIndex: 1, splitNumber: 2, splitLine: { show: false },
       axisLabel: { color: INK_SOFT, fontSize: 10, formatter: (v: number) => v >= 10000 ? `${(v/10000).toFixed(0)}万` : String(Math.round(v)) } },
     { scale: true, position: 'right', gridIndex: 2, splitNumber: 2, splitLine: { lineStyle: { color: '#f0e8d4' } },
       axisLabel: { color: INK_SOFT, fontSize: 10 } }]
  : [{ scale: true, position: 'right', gridIndex: 0, splitLine: { lineStyle: { color: '#f0e8d4' } },
       axisLabel: { color: INK_SOFT, fontSize: 10 } },
     { position: 'right', gridIndex: 1, splitNumber: 2, splitLine: { show: false },
       axisLabel: { color: INK_SOFT, fontSize: 10, formatter: (v: number) => v >= 10000 ? `${(v/10000).toFixed(0)}万` : String(Math.round(v)) } }],
```

- [ ] **Step 9: 修改 dataZoom 和 axisPointer — 三区域联动**

将 `dataZoom` 配置改为：

```typescript
dataZoom: [{ type: 'inside', xAxisIndex: hasKdj ? [0, 1, 2] : [0, 1],
  start: zoomRef.current.start, end: zoomRef.current.end,
  zoomOnMouseWheel: true, moveOnMouseMove: true }],
```

`axisPointer` 保持不变（已使用 `xAxisIndex: 'all'`）。

- [ ] **Step 10: 修改 legend — 移除 K/D，加入成交量**

将 legend 配置改为：

```typescript
legend: { show: true, top: 0, right: 8, textStyle: { color: INK_SOFT, fontSize: 10 },
  data: hasKdj ? ['白线', '黄线', '成交量', 'J'] : ['白线', '黄线', '成交量'] },
```

- [ ] **Step 11: 修改 series — 加入成交量系列**

将 `series` 配置改为：

```typescript
series: [...priceSeries, ...overlaySeries, ...volumeSeries, ...kdjSeries],
```

- [ ] **Step 12: 修改图表高度**

将 `ReactECharts` 的 `style={{ height: hasKdj ? 360 : 260 }}` 改为：

```typescript
style={{ height: hasKdj ? 420 : 320 }}
```

- [ ] **Step 13: 验证**

启动前端 `cd frontend && npm run dev`，选择一只股票查看K线图，确认：
1. tooltip 鼠标移动触发、离开消失
2. 左右滑动流畅
3. 收盘价红色/绿色显示在右上角
4. 成交量区域在K线下方、KDJ上方
5. KDJ 区域只显示 J 线
6. x 轴标签间隔合理

- [ ] **Step 14: Commit**

```bash
git add frontend/src/components/detail/PriceChart.tsx
git commit -m "feat: PriceChart 优化 - tooltip/成交量/KDJ只显示J线/x轴间隔"
```

---

### Task 6: 前端 — TopBar 重构（进度信息移入 + 按钮按类别显示）

**Files:**
- Modify: `frontend/src/components/layout/TopBar.tsx`
- Modify: `frontend/src/App.tsx`

- [ ] **Step 1: 重写 TopBar.tsx**

替换整个 `TopBar.tsx`：

```typescript
import { Check, Loader2, RotateCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Wordmark } from './Logo'
import { ProgressBar } from '@/components/ui/progress'
import type { RefreshStatus, StrategyId } from '@/types'
import { STRATEGY_CATEGORY } from '@/types'

function InlineProgress({ label, status }: { label: string; status: { status: string; steps: { progress: number; done: number; total: number }[] } }) {
  const s = status
  if (s.status === 'idle') {
    return <span className="text-[12px] text-ink-faint">{label}: 待执行</span>
  }
  if (s.status === 'done') {
    return <span className="flex items-center gap-1 text-[12px] text-up">{label}: 已完成 <Check className="size-3" /></span>
  }
  if (s.status === 'error') {
    return <span className="text-[12px] text-down">{label}: 失败</span>
  }
  // running
  const avgProgress = s.steps.length > 0 ? Math.round(s.steps.reduce((a, t) => a + t.progress, 0) / s.steps.length) : 0
  return (
    <span className="flex items-center gap-2 text-[12px]">
      <span className="flex items-center gap-1 text-brand">
        <Loader2 className="size-3 animate-spin" />
        {label}: {avgProgress}%
      </span>
      <ProgressBar value={avgProgress} className="w-20" />
    </span>
  )
}

export function TopBar({
  updatedAt,
  strategy,
  refreshStatus,
  onRefreshKline,
  onRefreshFundamental,
}: {
  updatedAt: string
  strategy: StrategyId
  refreshStatus?: RefreshStatus
  onRefreshKline: (reloadStockList: boolean) => void
  onRefreshFundamental: () => void
}) {
  const isTechnical = STRATEGY_CATEGORY[strategy] === 'technical'
  const klineGroup = refreshStatus?.kline ?? { status: 'idle', steps: [] }
  const fundamentalGroup = refreshStatus?.fundamental ?? { status: 'idle', steps: [] }

  return (
    <header className="relative z-50 flex h-16 shrink-0 items-center gap-6 border-b border-line bg-cream/80 px-6 backdrop-blur">
      <Wordmark className="h-9 w-auto" />

      <div className="ml-auto flex items-center gap-3">
        {/* 进度信息 */}
        {isTechnical ? (
          <InlineProgress label="行情" status={klineGroup} />
        ) : (
          <InlineProgress label="基本面" status={fundamentalGroup} />
        )}

        <span className="text-[13px] text-ink-soft">
          数据更新于 <span className="tnum">{updatedAt}</span>
        </span>

        {/* 技术面：刷新行情按钮 */}
        {isTechnical && (
          <div className="group relative">
            <Button variant="outline" size="sm" title="更新K线数据（日/周/月/季），建议每日收盘后执行">
              <RotateCw className="size-3.5" />
              刷新行情
            </Button>
            <div className="pointer-events-none absolute right-0 top-full z-50 pt-1 opacity-0 transition-opacity group-hover:pointer-events-auto group-hover:opacity-100">
              <div className="w-52 rounded-xl border border-line bg-paper shadow-lg">
                <button onClick={() => onRefreshKline(true)} className="flex w-full flex-col px-4 py-2.5 text-left text-sm transition-colors hover:bg-paper-2 rounded-t-xl">
                  <span className="font-medium text-ink">完整刷新</span>
                  <span className="text-[11px] text-ink-soft">重新拉取股票列表 + K线</span>
                </button>
                <div className="mx-3 border-t border-line-soft" />
                <button onClick={() => onRefreshKline(false)} className="flex w-full flex-col px-4 py-2.5 text-left text-sm transition-colors hover:bg-paper-2 rounded-b-xl">
                  <span className="font-medium text-ink">仅刷新K线</span>
                  <span className="text-[11px] text-ink-soft">跳过股票列表，更快</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 基本面：刷新基本面按钮 */}
        {!isTechnical && (
          <Button variant="outline" size="sm" onClick={onRefreshFundamental} title="更新财报、业绩预告快报、行业指数与研报数据，财报季前后建议执行">
            <RotateCw className="size-3.5" />
            刷新基本面
          </Button>
        )}
      </div>
    </header>
  )
}
```

- [ ] **Step 2: 更新 App.tsx — 传递 strategy 和 refreshStatus 给 TopBar**

在 `App.tsx` 中修改 TopBar 的 props：

```typescript
<TopBar
  updatedAt={updatedAt}
  strategy={strategy}
  refreshStatus={refreshStatus}
  onRefreshKline={triggerRefreshKline}
  onRefreshFundamental={triggerRefreshFundamental}
/>
```

- [ ] **Step 3: 更新 App.tsx — 移除基本面视图中的 DataRefreshProgress**

在 `App.tsx` 中：
1. 删除 `import { DataRefreshProgress } from '@/components/screener/DataRefreshProgress'`
2. 在基本面视图中删除 `<DataRefreshProgress status={refreshStatus} category="fundamental" />`

- [ ] **Step 4: 验证**

启动前端，确认：
1. 技术面模式下 TopBar 只显示"刷新行情"按钮和行情进度
2. 基本面模式下 TopBar 只显示"刷新基本面"按钮和基本面进度
3. 基本面视图中没有独立的进度卡片

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/layout/TopBar.tsx frontend/src/App.tsx
git commit -m "feat: TopBar 重构 - 进度信息移入 + 按钮按类别显示"
```

---

### Task 7: 前端 — 筛选卡片改为左侧抽屉

**Files:**
- Modify: `frontend/src/components/layout/StrategySidebar.tsx`
- Modify: `frontend/src/components/technical/TechnicalFilterCard.tsx`
- Modify: `frontend/src/components/technical/TechnicalScreenView.tsx`

- [ ] **Step 1: 修改 StrategySidebar — 增加筛选按钮和抽屉**

替换 `StrategySidebar.tsx`：

```typescript
import { SlidersHorizontal } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Preset } from '@/types'
import type { StrategyId } from '@/types'

const FUNDAMENTAL: { id: StrategyId; label: string }[] = [
  { id: 'super-growth', label: '创新高超级成长' },
  { id: 'oversold-bluechip', label: '低位错杀蓝筹' },
]

const TECHNICAL: { id: StrategyId; label: string }[] = [
  { id: 'trend-support', label: '双线战法' },
  { id: 'b2', label: 'B2战法' },
]

function Item({
  id, label, active, indent, onSelect, showFilter, filterOpen, onToggleFilter,
}: {
  id: StrategyId
  label: string
  active: boolean
  indent?: boolean
  onSelect: (s: StrategyId) => void
  showFilter?: boolean
  filterOpen?: boolean
  onToggleFilter?: () => void
}) {
  return (
    <div className="flex items-center gap-0.5">
      <button
        onClick={() => onSelect(id)}
        className={cn(
          'flex flex-1 items-center justify-between rounded-lg px-3 py-2 text-left text-[13px] transition-colors',
          indent && 'pl-6',
          active
            ? 'bg-brand-soft font-medium text-brand-strong'
            : 'text-ink-soft hover:bg-paper-2 hover:text-ink',
        )}
      >
        <span>{label}</span>
        {active && !showFilter && <span className="size-1.5 rounded-full bg-brand" />}
      </button>
      {showFilter && active && (
        <button
          onClick={onToggleFilter}
          className={cn(
            'rounded-md p-1.5 transition-colors',
            filterOpen ? 'bg-brand-soft text-brand' : 'text-ink-faint hover:bg-paper-2 hover:text-ink-soft',
          )}
          title="筛选参数"
        >
          <SlidersHorizontal className="size-3.5" />
        </button>
      )}
    </div>
  )
}

export function StrategySidebar({
  strategy, onSelect, filterOpen, onToggleFilter,
}: {
  strategy: StrategyId
  onSelect: (s: StrategyId) => void
  filterOpen?: boolean
  onToggleFilter?: () => void
}) {
  const isTechnical = strategy === 'trend-support' || strategy === 'b2'

  return (
    <aside className="flex w-[180px] shrink-0 flex-col gap-1 border-r border-line bg-paper/40 px-3 py-5">
      <div className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-wide text-ink-faint">
        策略选择
      </div>
      {FUNDAMENTAL.map((s) => (
        <Item key={s.id} {...s} active={strategy === s.id} onSelect={onSelect} />
      ))}

      <div className="my-2 border-t border-line-soft" />
      <div className="px-3 pb-1 text-[12px] font-medium text-ink-soft">技术面战法</div>
      {TECHNICAL.map((s) => (
        <Item
          key={s.id}
          {...s}
          active={strategy === s.id}
          indent
          onSelect={onSelect}
          showFilter={isTechnical}
          filterOpen={filterOpen}
          onToggleFilter={onToggleFilter}
        />
      ))}
    </aside>
  )
}
```

- [ ] **Step 2: 修改 TechnicalFilterCard — 适配抽屉竖向布局**

替换 `TechnicalFilterCard.tsx`：

```typescript
import { Button } from '@/components/ui/button'
import { NumberField } from '@/components/ui/field'
import type { Preset } from '@/types'

export function TechnicalFilterCard({
  preset,
  paramValues,
  onParamChange,
  onApply,
}: {
  preset: Preset | null
  paramValues: Record<string, number>
  onParamChange: (key: string, value: number) => void
  onApply: () => void
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="text-xs font-medium text-ink-soft">{preset?.name ?? '技术面战法'}</div>
      {preset && (
        <div className="flex flex-col gap-3">
          {preset.params.map((p) => (
            <NumberField
              key={p.key}
              label={p.label}
              op="="
              unit={p.unit ?? ''}
              value={paramValues[p.key] ?? p.value}
              onChange={(v) => onParamChange(p.key, v)}
            />
          ))}
        </div>
      )}
      <Button variant="primary" size="sm" onClick={onApply} className="w-full">运行筛选</Button>
    </div>
  )
}
```

- [ ] **Step 3: 修改 TechnicalScreenView — 抽屉状态管理、移除进度/筛选卡片、名字联动、默认选中**

替换 `TechnicalScreenView.tsx`：

```typescript
import { useEffect, useMemo, useRef, useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { StockListCard } from '@/components/screener/StockListCard'
import { PriceChart } from '@/components/detail/PriceChart'
import { TechnicalFilterCard } from './TechnicalFilterCard'
import { api } from '@/lib/api'
import type { Kline, KlineTimeframe, Preset, RefreshStatus, StrategyId, TechnicalCandidate } from '@/types'

const EMPTY_KLINE: Record<KlineTimeframe, Kline[]> = { day: [], week: [], month: [], quarter: [] }

type ScreenMode = 'market' | 'screened'

export function TechnicalScreenView({
  strategy,
  preset,
  refreshStatus,
  filterOpen,
  onToggleFilter,
}: {
  strategy: StrategyId
  preset: Preset | null
  refreshStatus?: RefreshStatus
  filterOpen?: boolean
  onToggleFilter?: () => void
}) {
  const [paramValues, setParamValues] = useState<Record<string, number>>({})
  const [candidates, setCandidates] = useState<TechnicalCandidate[]>([])
  const [selectedCode, setSelectedCode] = useState<string>('')
  const [selectedName, setSelectedName] = useState<string>('')
  const [screenMode, setScreenMode] = useState<ScreenMode>('market')
  const [kline, setKline] = useState<Record<KlineTimeframe, Kline[]>>(EMPTY_KLINE)
  const [highLine, setHighLine] = useState(0)
  const [highLabel, setHighLabel] = useState('历史高点')

  // 切换策略时重置参数为预设默认 + 切回市场模式
  useEffect(() => {
    if (preset) setParamValues(Object.fromEntries(preset.params.map((p) => [p.key, p.value])))
    setScreenMode('market')
  }, [preset])

  const runScreen = useMemo(() => async () => {
    try {
      const res = await api.screenTechnical(strategy, paramValues)
      setCandidates(res)
      setScreenMode('screened')
      if (res[0]) {
        setSelectedCode(res[0].code)
        setSelectedName(res[0].name)
      }
    } catch {
      setCandidates([])
      setScreenMode('screened')
    }
    // 运行筛选后自动收起抽屉
    onToggleFilter?.()
  }, [strategy, paramValues, onToggleFilter])

  const clearScreen = () => {
    setScreenMode('market')
  }

  const handleSelectCode = (code: string, name: string) => {
    setSelectedCode(code)
    setSelectedName(name)
  }

  // 选中股票 → 拉取四周期K线
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
        setHighLine(results[0].highLine)
        setHighLabel(results[0].highLabel)
      } catch {
        if (!cancelled) setKline(EMPTY_KLINE)
      }
    }
    load()
    return () => { cancelled = true }
  }, [selectedCode])

  const showScreenedData = screenMode === 'screened' ? candidates : undefined

  // 点击抽屉外区域收起
  const drawerRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!filterOpen) return
    const handleClickOutside = (e: MouseEvent) => {
      if (drawerRef.current && !drawerRef.current.contains(e.target as Node)) {
        onToggleFilter?.()
      }
    }
    // 延迟绑定，避免打开按钮的点击事件立即触发关闭
    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside)
    }, 0)
    return () => {
      clearTimeout(timer)
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [filterOpen, onToggleFilter])

  return (
    <div className="flex flex-1 overflow-hidden">
      {/* 筛选抽屉 */}
      {filterOpen && (
        <div ref={drawerRef} className="flex w-[180px] shrink-0 flex-col gap-1 border-r border-line bg-paper/40 px-3 py-5">
          <TechnicalFilterCard
            preset={preset}
            paramValues={paramValues}
            onParamChange={(k, v) => setParamValues((s) => ({ ...s, [k]: v }))}
            onApply={runScreen}
          />
        </div>
      )}

      {/* 主内容区 */}
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex flex-1 gap-5 overflow-y-auto p-6">
          <div className="flex min-w-0 flex-1 flex-col gap-5">
            <StockListCard
              screenedData={showScreenedData}
              selectedCode={selectedCode}
              onSelectCode={handleSelectCode}
              onClearScreen={clearScreen}
            />
          </div>
          <div className="min-w-0 flex-1">
            <Card>
              <CardContent className="pt-5">
                <PriceChart
                  stockName={selectedName}
                  klineDay={kline.day} klineWeek={kline.week}
                  klineMonth={kline.month} klineQuarter={kline.quarter}
                  highLine={highLine} highLabel={highLabel}
                />
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: 更新 App.tsx — 传递 filterOpen/onToggleFilter**

在 `App.tsx` 中：
1. 新增状态：`const [filterOpen, setFilterOpen] = useState(false)`
2. 传递给 StrategySidebar：`<StrategySidebar strategy={strategy} onSelect={setStrategy} filterOpen={filterOpen} onToggleFilter={() => setFilterOpen(v => !v)} />`
3. 传递给 TechnicalScreenView：`<TechnicalScreenView strategy={strategy} preset={activePreset} refreshStatus={refreshStatus} filterOpen={filterOpen} onToggleFilter={() => setFilterOpen(v => !v)} />`
4. 切换策略时关闭抽屉，在 `setStrategy` 附近添加：当 strategy 改变时 setFilterOpen(false)

更新 `App.tsx` 中策略切换逻辑：

```typescript
const handleStrategyChange = (s: StrategyId) => {
  setStrategy(s)
  setFilterOpen(false)
}
```

然后在 JSX 中用 `handleStrategyChange` 替换 `setStrategy` 传给 StrategySidebar。

- [ ] **Step 5: 验证**

启动前端，确认：
1. 技术面策略旁有筛选图标按钮
2. 点击筛选按钮展开抽屉，参数竖向排列
3. 点击"运行筛选"后抽屉自动收起
4. 点击抽屉外区域抽屉收起
5. 切换策略时抽屉收起

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/layout/StrategySidebar.tsx frontend/src/components/technical/TechnicalFilterCard.tsx frontend/src/components/technical/TechnicalScreenView.tsx frontend/src/App.tsx
git commit -m "feat: 筛选卡片改为左侧抽屉 + 股票名字联动修复"
```

---

### Task 8: 前端 — StockListCard 优化（新增列、搜索框、onSelectCode 传递 name、默认选中第一条）

**Files:**
- Modify: `frontend/src/components/screener/StockListCard.tsx`

- [ ] **Step 1: 修改 StockListCardProps — onSelectCode 增加 name 参数**

将 `onSelectCode` 的类型改为：

```typescript
onSelectCode?: (code: string, name: string) => void
```

- [ ] **Step 2: 修改 MarketTable — 新增收盘价和涨跌幅列，行点击传递 name**

在 `MarketTable` 的 `<thead>` 中，在"行业"列后添加：

```typescript
<th className="px-2 pb-2 text-right font-medium">收盘价</th>
<th className="px-2 pb-2 text-right font-medium">涨跌幅</th>
```

在 `<tbody>` 的行渲染中，在"行业"列后添加：

```typescript
<td className="tnum px-2 py-2.5 text-right text-sm text-ink">
  {s.close != null ? s.close.toFixed(2) : '—'}
</td>
<td className="tnum px-2 py-2.5 text-right text-[13px]">
  {s.pct_chg != null ? (
    <span className={s.pct_chg >= 0 ? 'text-up' : 'text-down'}>
      {s.pct_chg >= 0 ? '+' : ''}{s.pct_chg.toFixed(2)}%
    </span>
  ) : '—'}
</td>
```

修改行点击事件，传递 name：

```typescript
onClick={onRowClick ? () => onRowClick(s.code, s.name) : undefined}
```

- [ ] **Step 3: 修改 ScreenedTable — 行点击传递 name**

将行点击事件改为：

```typescript
onClick={onRowClick ? () => onRowClick(c.code, c.name) : undefined}
```

- [ ] **Step 4: 在 StockListCard 顶部添加搜索框**

在 `StockListCard` 组件中添加搜索状态和 UI。在 `const isScreened = ...` 之后添加：

```typescript
// ---- 搜索 ----
const [searchQuery, setSearchQuery] = useState('')
const [searchResults, setSearchResults] = useState<StockSearchItem[] | null>(null)
const [searching, setSearching] = useState(false)
```

在 import 中新增：

```typescript
import { Search } from 'lucide-react'
import type { StockSearchItem } from '@/types'
```

添加搜索逻辑（在搜索相关 state 之后）：

```typescript
// 搜索防抖
useEffect(() => {
  if (!searchQuery.trim()) {
    setSearchResults(null)
    return
  }
  const timer = setTimeout(async () => {
    setSearching(true)
    try {
      const res = await api.searchStocks(searchQuery.trim())
      setSearchResults(res.data)
    } catch {
      setSearchResults([])
    } finally {
      setSearching(false)
    }
  }, 300)
  return () => clearTimeout(timer)
}, [searchQuery])
```

在 `<CardHeader>` 之后、`<CardContent>` 之前添加搜索框 UI：

```typescript
{/* 搜索框 */}
<div className="px-4 pb-2">
  <div className="relative">
    <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-ink-faint" />
    <input
      type="text"
      value={searchQuery}
      onChange={(e) => setSearchQuery(e.target.value)}
      placeholder="搜索代码/名称..."
      className="w-full rounded-lg border border-line-soft bg-paper-2/50 py-1.5 pl-8 pr-3 text-[13px] text-ink placeholder:text-ink-faint/60 focus:border-brand focus:outline-none"
    />
  </div>
</div>
```

- [ ] **Step 5: 搜索结果展示**

在 `<CardContent>` 内部，添加搜索结果的渲染逻辑。在加载/错误/空状态的判断之前，添加搜索模式的判断：

```typescript
{/* ---- 搜索模式 ---- */}
{searchResults !== null && (
  <>
    {searching ? (
      <div className="flex items-center justify-center py-6 text-sm text-ink-faint">搜索中...</div>
    ) : searchResults.length === 0 ? (
      <div className="flex items-center justify-center py-6 text-sm text-ink-faint">无匹配结果</div>
    ) : (
      <table className="w-full border-collapse">
        <thead>
          <tr className="text-left text-xs text-ink-faint">
            <th className="px-2 pb-2 font-medium">代码</th>
            <th className="px-2 pb-2 font-medium">名称</th>
            <th className="px-2 pb-2 text-right font-medium">收盘价</th>
          </tr>
        </thead>
        <tbody>
          {searchResults.map((s) => {
            const on = s.code === activeCode
            return (
              <tr
                key={s.code}
                onClick={() => handleRowClick(s.code, s.name)}
                className={cn(
                  'cursor-pointer border-t border-line-soft transition-colors duration-200 hover:bg-paper-2/70',
                  on && 'bg-brand-soft',
                )}
              >
                <td className="tnum px-2 py-2.5 text-[13px] text-ink-soft">{s.code}</td>
                <td className="px-2 py-2.5 text-sm font-semibold text-ink">{s.name}</td>
                <td className="tnum px-2 py-2.5 text-right text-sm text-ink">
                  {s.close != null ? s.close.toFixed(2) : '—'}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    )}
  </>
)}

{/* ---- 正常模式（搜索框为空时）---- */}
{searchResults === null && (
  <>
    {/* 原有的全市场/筛选模式内容 */}
  </>
)}
```

需要用 `{searchResults === null && (...)}` 包裹原有的全市场/筛选模式内容。具体做法：在 `<CardContent className="pt-2">` 内部，将原有的全市场加载/错误/空状态区块和筛选模式区块用 `{searchResults === null && ( ... )}` 包裹，搜索模式区块用 `{searchResults !== null && ( ... )}` 包裹，两者平级。

- [ ] **Step 6: 默认选中第一条 — 在 StockListCard 中添加回调**

修改 `StockListCardProps`，新增 `onFirstLoad` 回调：

```typescript
interface StockListCardProps {
  screenedData?: TechnicalCandidate[]
  selectedCode?: string
  onSelectCode?: (code: string, name: string) => void
  onClearScreen?: () => void
  onFirstLoad?: (code: string, name: string) => void
}
```

在 `fetchData` 的 `useEffect` 之后，添加首次加载自动选中逻辑：

```typescript
// 首次加载完成后通知父组件选中第一条
const hasNotifiedRef = useRef(false)
useEffect(() => {
  if (!isScreened && data.length > 0 && !hasNotifiedRef.current) {
    hasNotifiedRef.current = true
    onFirstLoad?.(data[0].code, data[0].name)
  }
}, [data, isScreened, onFirstLoad])
```

在 import 中新增 `useRef`。

- [ ] **Step 7: 更新 TechnicalScreenView — 传递 onFirstLoad**

在 `TechnicalScreenView.tsx` 中，传递 `onFirstLoad` 给 StockListCard：

```typescript
<StockListCard
  screenedData={showScreenedData}
  selectedCode={selectedCode}
  onSelectCode={handleSelectCode}
  onClearScreen={clearScreen}
  onFirstLoad={(code, name) => {
    setSelectedCode(code)
    setSelectedName(name)
  }}
/>
```

- [ ] **Step 8: 验证**

启动前端，确认：
1. 股票列表新增收盘价和涨跌幅列
2. 搜索框输入关键词后显示搜索结果
3. 点击搜索结果选中股票，K线图更新
4. 清空搜索框恢复原列表
5. 页面首次加载时自动选中第一条股票

- [ ] **Step 9: Commit**

```bash
git add frontend/src/components/screener/StockListCard.tsx frontend/src/components/technical/TechnicalScreenView.tsx
git commit -m "feat: 股票列表增加收盘价/涨跌幅列 + 搜索功能 + 默认选中第一条"
```

---

### Task 9: 前端 — 清理 DataRefreshProgress 引用

**Files:**
- Modify: `frontend/src/components/technical/TechnicalScreenView.tsx`（已在 Task 7 中移除）
- Verify: `frontend/src/App.tsx`（已在 Task 6 中移除）

- [ ] **Step 1: 确认无残留引用**

运行 `grep -r "DataRefreshProgress" frontend/src/`，确认除了组件文件本身外无其他引用。如果 App.tsx 和 TechnicalScreenView.tsx 中已无引用，则 OK。

- [ ] **Step 2: 可选 — 保留或删除 DataRefreshProgress.tsx 文件**

功能已完全移入 TopBar，该组件文件不再被使用。可以选择删除或保留备用。如删除：

```bash
rm frontend/src/components/screener/DataRefreshProgress.tsx
```

- [ ] **Step 3: Commit（如删除了文件）**

```bash
git add -A
git commit -m "chore: 删除已废弃的 DataRefreshProgress 组件"
```

---

### Task 10: 全局验证与修复

**Files:** 可能涉及上述所有文件

- [ ] **Step 1: TypeScript 编译检查**

```bash
cd frontend && npx tsc --noEmit
```

修复所有类型错误。

- [ ] **Step 2: 前端 lint 检查**

```bash
cd frontend && npm run lint
```

修复 lint 警告和错误。

- [ ] **Step 3: 后端测试**

```bash
cd backend && source venv/bin/activate && pytest
```

确保所有现有测试通过。

- [ ] **Step 4: 端到端手动验证**

启动前后端，逐一检查 11 项需求：

1. ✅ 进度信息在 TopBar 右侧，无独立进度卡片
2. ✅ 技术面只显示"刷新行情"，基本面只显示"刷新基本面"
3. ✅ K线图 x 轴标签间隔加大
4. ✅ 筛选抽屉在左侧，挤压式，点击外区域收起
5. ✅ 点击股票列表，K线卡片标题显示正确股票名字
6. ✅ tooltip 鼠标移动触发、离开消失，左右滑动流畅
7. ✅ tooltip 收盘价红/绿色右上角，其他字段颜色区分
8. ✅ 股票列表新增收盘价和涨跌幅列
9. ✅ 成交量独立区域在 K线下方、KDJ上方
10. ✅ KDJ 只显示 J 线
11. ✅ 搜索框可用，搜索结果点击跳转

- [ ] **Step 5: Final Commit**

```bash
git add -A
git commit -m "chore: 技术面战法前端面板优化 - 最终验证与修复"
```
