# 技术面战法二次优化设计：筛选反馈 + 股票列表滚动加载/键盘导航

日期：2026-06-13

## 概述

两项相对独立的优化，均聚焦技术面战法面板（`TechnicalScreenView`）：

1. **「运行筛选」按钮加载态反馈** —— `/screen` 接口计算耗时本身是正常的，但目前前端点击后没有任何反馈，用户不知道是否在计算。
2. **股票列表卡片改为动态高度 + 无限滚动 + 键盘上下键导航** —— 去掉分页器，列表随视口高度自适应并在内部滚动，滚动到底部自动加载更多；选中某行后可用键盘上下键在列表中切换选中股票，并联动 K 线图。全市场 / 搜索 / 筛选结果三种模式统一处理。

均为前端为主的改动，第 2 项涉及 `/stocks/search` 接口的小幅扩展（增加分页）。

## 需求清单

| # | 需求 | 涉及文件 |
|---|------|---------|
| 1 | 运行筛选按钮显示加载态（禁用 + spinner + "筛选中..."） | `TechnicalScreenView.tsx`, `TechnicalFilterCard.tsx` |
| 2 | 股票列表动态高度、滚动到底部自动加载下一批（全市场/搜索/筛选结果三种模式统一） | `StockListCard.tsx`, `backend/app/main.py`, `backend/app/schemas.py`, `frontend/src/types.ts`, `frontend/src/lib/api.ts` |
| 3 | 列表行点击后获得焦点，键盘上下键切换选中股票并联动 K 线图 | `StockListCard.tsx` |

---

## 1. 运行筛选按钮加载态反馈

### 当前状态

`TechnicalScreenView.tsx` 的 `runScreen`：

```ts
const runScreen = useMemo(() => async () => {
  try {
    const res = await api.screenTechnical(strategy, paramValues)
    ...
  } catch {
    ...
  }
  setFilterOpen(false)
}, [strategy, paramValues])
```

请求期间没有任何状态变化，「运行筛选」按钮在等待期间和平时看起来一样，用户无法判断是否点击生效、是否仍在计算。

### 改动

**`TechnicalScreenView.tsx`**：
- 新增 `const [screening, setScreening] = useState(false)`
- `runScreen` 改为 `try { setScreening(true); ... } finally { setScreening(false) }`，成功/失败都会重置
- 把 `screening` 作为新 prop 传给 `TechnicalFilterCard`

**`TechnicalFilterCard.tsx`**：
- 新增 `loading: boolean` prop
- 「运行筛选」按钮：
  - `disabled={loading}`（防止重复点击触发多个并发请求）
  - `loading=true` 时显示旋转的 `Loader2`（`lucide-react`）+ 文案「筛选中...」
  - `loading=false` 时显示原文案「运行筛选」

### 数据流

点击「运行筛选」→ `screening=true` → 按钮立即变为禁用 + 旋转图标 + 「筛选中...」→ `await api.screenTechnical(...)` → `finally` 中 `screening=false` → 按钮恢复；成功时抽屉关闭并展示结果（沿用现有逻辑），失败时维持现有的"清空 candidates + 切到 screened 模式"行为。

---

## 2. 股票列表：动态高度 + 无限滚动 + 键盘导航

### 2.1 当前状态

`StockListCard.tsx`：
- 全市场模式：服务端分页，`PAGE_SIZE=10`，`fetchData` 按 `page` 请求并**替换** `data`，配 `<Pagination>`
- 筛选结果模式：`candidates`（`screenedData`）是一次性全量数据，前端按 `screenedPage` 用 `.slice()` 分页，配 `<Pagination>`
- 搜索模式：`/stocks/search` 固定 `limit(20)`，不分页，无 `total`
- 三种模式共用 `CardContent`，但内容随表格行数自然撑高，整页（`<main>`）滚动

### 2.2 动态高度布局

- `CardContent` 中表格所在的容器（现有 `<div className="overflow-x-auto">`）外层增加：
  - `max-h-[calc(100vh-220px)] overflow-y-auto`（220px 为顶部栏、卡片头部/搜索框、页面边距的近似总高度，具体数值在实现时按真实渲染效果微调）
  - 作为本节后续"滚动到底部自动加载"和"键盘导航 scrollIntoView"的滚动根（记为 `scrollRef`）
- `<thead>` 增加 `sticky top-0 z-10 bg-paper`（或当前实际背景色变量），滚动时表头保持可见
- `<main>` 保留现有 `overflow-y-auto` 作为兜底（极端窄/矮视口下整体仍可滚动），正常桌面宽度下列表会先在自身区域内滚动

### 2.3 全市场模式：滚动加载

State 调整：
- `data: StockListItem[]` 改为**累积**数组（不再每页替换）
- `page`：下一个待加载页码，初始 1
- `total: number`：来自接口（不变）
- `hasMore = data.length < total`
- 新增 `loadingMore: boolean`（区分首屏/排序变化的整体 `loading` 和滚动追加的 `loadingMore`）
- `PAGE_SIZE` 从 10 调大到 30

逻辑：
- 首次加载 / `sortBy`/`sortOrder` 变化：重置 `data=[]`、`page=1`、`loading=true`，请求第 1 页（`pageSize=30`），写入 `data`/`total`
- 滚动到底部（哨兵进入视口）且 `hasMore && !loadingMore && !loading`：`loadingMore=true` → 请求 `page+1` → append 到 `data`、`page+=1` → `loadingMore=false`；底部显示一行小号"加载中..."

### 2.4 搜索模式：滚动加载（含后端改动）

**后端 `backend/app/main.py` `/stocks/search`**：
- 新增 `page: int = Query(1, ge=1)`、`page_size: int = Query(30, ge=1, le=100)`
- 查询改为先 `.count()` 得到 `total`，再 `.offset((page-1)*page_size).limit(page_size)`（替换现有 `.limit(20)`）

**`backend/app/schemas.py`**：
- `StockSearchResponse` 新增 `total: int`、`page: int`、`pageSize: int`（与 `StockListResponse` 对齐）

**前端**：
- `types.ts`：`StockSearchResponse` 同步增加 `total`/`page`/`pageSize`
- `api.ts`：`searchStocks(q, page?, pageSize?)` 增加分页参数

**`StockListCard.tsx`**：
- 搜索关键词变化（防抖后）：重置 `searchResults=[]`、`searchPage=1`、`searching=true`，请求第 1 页，记录 `searchTotal`
- 滚动到底部且 `searchResults.length < searchTotal`：请求 `searchPage+1` 并 append、`searchPage+=1`（用 `searchLoadingMore` 与 `searching` 区分）

### 2.5 筛选结果模式：滚动加载

- 删除 `screenedPage` 及对应 `<Pagination>`
- 新增 `visibleCount`，初始 30
- 渲染 `candidates.slice(0, visibleCount)`
- 滚动到底部且 `visibleCount < candidates.length`：`visibleCount += 30`（纯本地操作，无需 loading 提示）
- `screenedData` 变化（重新筛选）：`visibleCount` 重置为 30（替代现有重置 `screenedPage` 的 `useEffect`）

### 2.6 滚动到底部的统一触发机制

- 在 `scrollRef` 容器内、表格末尾放置一个哨兵元素（如空 `<tr><td colSpan=...></td></tr>` 或表格后的 `<div>`）
- 用一个 `IntersectionObserver`，`root: scrollRef.current`，监听该哨兵
- 哨兵进入视口时，根据当前模式（market / search / screened）调用对应的"加载更多"逻辑（2.3 / 2.4 / 2.5）

### 2.7 键盘上下键导航

- `scrollRef` 容器增加 `tabIndex={0}`，`onKeyDown` 处理 `ArrowUp` / `ArrowDown`（`e.preventDefault()`，避免触发默认滚动）
- 维护 `rowRefs: Map<string, HTMLTableRowElement>`，每行 `<tr>` 通过 `ref` 回调注册/注销
- 行点击时：除现有 `onSelectCode(code, name)` 外，调用 `scrollRef.current?.focus()`
- `onKeyDown` 逻辑（`currentList` = 当前模式已渲染数组：market→`data`，search→`searchResults`，screened→`candidates.slice(0, visibleCount)`）：
  - `idx = currentList.findIndex(x => x.code === activeCode)`
  - **ArrowDown**：
    - `idx === -1` → 选中 `currentList[0]`（如存在）
    - `idx < currentList.length - 1` → 选中 `currentList[idx + 1]`
    - `idx === currentList.length - 1 && hasMore` → 先触发对应模式的"加载更多"，数据到达后选中新出现的第一条（即原 `currentList.length` 位置的元素）
    - 否则不动
  - **ArrowUp**：
    - `idx === -1` → 选中 `currentList[0]`（如存在）
    - `idx === 0` → 不动
    - 否则 → 选中 `currentList[idx - 1]`
  - 选中后调用 `rowRefs.get(code)?.scrollIntoView({ block: 'nearest' })`

### 2.8 视觉提示

- `scrollRef` 容器：`focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/30`（或项目中等价的焦点环样式），提示该区域已"激活"，可用键盘导航

---

## 测试计划

**后端**：
- `/stocks/search` 新增分页参数后的测试：验证 `total`/`page`/`pageSize` 字段正确，`offset`/`limit` 行为正确（多页不重复、不漏数据）

**前端（手动验证）**：
- 「运行筛选」点击后按钮立即显示"筛选中..."并禁用，完成后恢复，结果区域更新
- 全市场模式：滚动到列表底部自动加载下一批；切换排序后列表重置为第一批
- 搜索模式：输入关键词后滚动到底部可加载更多结果
- 筛选结果模式：滚动到底部展示更多候选股
- 点击任意行后，使用键盘上下键切换选中股票，K 线图随之联动更新，选中行始终保持在可视区域内
- 在已加载列表的最后一条按下方向键，触发自动加载下一批并继续选中

**类型检查/构建**：`npx tsc --noEmit`、`npm run lint`、`pytest` 全部通过
