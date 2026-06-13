# 技术战法面板优化设计

日期：2026-06-13

## 背景

技术战法面板（`TechnicalScreenView`）存在两个问题：

1. **股票列表展示不一致**：`StockListCard` 内部有三种表格实现（全市场 6 列、筛选结果 5 列、搜索 3 列），列结构、样式、交互各不相同。
2. **历史筛选入口不可达**：历史下拉框仅在筛选结果模式（`screenMode === 'screened'`）下可见，全市场模式下无法查看历史筛选结果。

## 设计原则

- 统一列表展示，消除模式切换的概念
- 接口职责清晰，不过度合并也不过度拆分
- 前端组件只负责展示，不关心数据来源

## 接口设计

### 1. `GET /stocks` — 股票列表（全市场 + 搜索）

| 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `q` | string | 否 | 搜索关键词，无则返回全市场列表 |
| `page` | int | 否 | 页码，默认 1 |
| `page_size` | int | 否 | 每页条数，默认 30 |
| `sort_by` | string | 否 | 排序字段（code/name/market_cap） |
| `sort_order` | string | 否 | 排序方向（asc/desc） |

**响应**：

```typescript
interface StockListResponse {
  items: StockRow[]
  total: number
}
```

**合并说明**：原 `/stocks/search` 接口废弃，搜索逻辑合并到 `/stocks?q=xxx`。

### 2. `GET /screen/result` — 筛选结果（运行筛选 + 历史快照）

| 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `preset` | string | 是 | 策略 ID（trend-support / b2） |
| `params` | string | 否 | 筛选参数 JSON，如 `{"n":20}` |
| `history_date` | string | 否 | 历史快照日期，如 `2026-06-13` |

**行为**：
- 有 `params` → 运行筛选并返回结果
- 有 `history_date` → 返回指定日期的历史快照结果
- 两者互斥，不可同时传

**响应**：

```typescript
interface ScreenResultResponse {
  items: StockRow[]
  total: number
}
```

**合并说明**：原 `/screen` 和 `/screen/history/{date}` 合并到此接口。

### 3. `GET /screen/history` — 历史日期列表（保持不变）

| 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `preset` | string | 是 | 策略 ID |

**响应**：`ScreenSnapshotMeta[]`（保持不变）

### 统一数据结构

```typescript
interface StockRow {
  code: string
  name: string
  industry: string | null
  market_cap: number | null
  close: number | null
  pct_chg: number | null
  // 以下仅筛选结果有值
  diagnostics?: Record<string, number>
  sort_key?: string
  trigger_date?: string
}
```

6 列统一展示，缺失数据用 `—` 占位。

## 前端组件改造

### StockListCard

**移除**：
- `screenedData` prop
- `MarketTable` / `ScreenedTable` / 搜索结果表格 三个内部组件
- `isScreened` 模式判断逻辑

**改为**：
- 接收 `data: StockRow[]` + `total: number` 统一数据
- 内部只渲染一个 `StockTable`，6 列固定结构
- 搜索框输入后由父组件调用 `/stocks?q=xxx` 获取数据
- 历史下拉框始终可见（有历史数据时），由父组件传入 `historyList`
- 保留分页/排序逻辑（全市场模式服务端分页，筛选结果客户端全量展示）

**Props 简化**：

```typescript
interface StockListCardProps {
  data: StockRow[]
  total: number
  loading?: boolean
  selectedCode?: string
  onSelectCode?: (code: string, name: string) => void
  onSearch?: (q: string) => void          // 搜索回调
  onLoadMore?: () => void                  // 分页加载更多
  onSort?: (sortBy: string, sortOrder: string) => void
  historyList?: ScreenSnapshotMeta[]
  selectedHistoryDate?: string
  onSelectHistoryDate?: (date: string) => void
  onClearHistory?: () => void              // 清除历史选择，返回全市场
}
```

### TechnicalScreenView

**移除**：
- `screenMode` 状态（不再区分 market/screened）
- `candidates` 状态的筛选/全市场区分逻辑

**改为**：
- `stockData: StockRow[]` + `stockTotal: number` 统一状态
- `dataSource: 'market' | 'screen' | 'history'` 轻量标记（仅用于决定清除按钮文案等 UI 细节）
- 「运行筛选」→ 调用 `/screen/result?preset=xx&params=xx`，结果写入 `stockData`
- 选择历史日期 → 调用 `/screen/result?preset=xx&history_date=xx`，结果写入 `stockData`
- 清除筛选/搜索 → 调用 `/stocks`，结果写入 `stockData`
- 组件挂载时加载 `/stocks` + `/screen/history?preset=xx`

### api.ts

**新增**：

```typescript
// 统一股票列表（全市场 + 搜索）
stocks: (params: { q?: string; page?: number; pageSize?: number; sortBy?: string; sortOrder?: string } = {}) => {
  // 构建查询参数，调用 GET /stocks
},

// 统一筛选结果（运行筛选 + 历史快照）
screenResult: (params: { preset: string; params?: Record<string, number>; historyDate?: string }) => {
  // 构建查询参数，调用 GET /screen/result
},
```

**废弃**：`stockList`、`searchStocks`、`screenTechnical`、`screenHistoryDetail`（暂保留代码，标记 deprecated）

## 旧接口处理

- 旧接口（`/stocks/search`、`/screen`、`/screen/history/{date}`）暂时保留，标记 deprecated
- 前端迁移完成后可在后续版本删除

## 改动范围

| 文件 | 改动 |
|---|---|
| `backend/app/main.py` | 新增 `/stocks?q=` 搜索参数、新增 `/screen/result` 接口 |
| `backend/app/screen.py` | 调整筛选结果返回格式，统一为 `StockRow` |
| `frontend/src/lib/api.ts` | 新增 `stocks()`、`screenResult()`，废弃旧方法 |
| `frontend/src/types.ts` | 新增 `StockRow`、`ScreenResultResponse` |
| `frontend/src/components/screener/StockListCard.tsx` | 重构为统一列表组件 |
| `frontend/src/components/technical/TechnicalScreenView.tsx` | 去掉 screenMode，统一数据流 |
