# 首页数据更新看板设计

## 背景

目前数据更新入口分散在 `TopBar`：技术面策略下是"刷新行情"（股票列表+K线，下拉选"完整刷新/仅刷新K线"），基本面策略下是"刷新基本面"（一键全刷）+ 5 个步骤各自的小刷新按钮，外加实时动态 activity pills（展示筛选执行状态）。

策略选股依赖数据已更新（"数据更新了才能执行策略选股"），但更新入口绑定在当前选中的策略类别上，技术面和基本面的更新任务无法在同一处统一查看/触发，也没有"一键更新全部"且尊重任务间依赖关系的入口。

## 目标

1. 新增独立的"首页"，作为应用默认页面，集中展示全部 7 个数据更新任务的状态与触发入口。
2. 梳理 7 个任务的依赖图，提供"一键更新全部"按钮，按依赖关系分阶段并发执行。
3. 去掉 TopBar 原有的刷新按钮、各步骤进度文字、时间戳、activity pills；选股页改为极简 `PageHeader`（仅显示策略名称）。

## 任务依赖图

| 任务 | 对应后端函数 | 触发端点 | 依赖 |
|---|---|---|---|
| ① 股票列表 | `run_stock_list_refresh`（新，原 `run_kline_refresh` step1） | `POST /refresh/stock-list`（新） | 无 |
| ② K线数据（日+周+月+季） | `run_kline_data_refresh`（新，原 `run_kline_refresh` step2） | `POST /refresh/kline`（去掉 `reload_stock_list` 参数） | ① |
| ③ 财报数据 | `run_financial_refresh`（已存在） | `POST /refresh/fundamental/financial`（已存在） | 无 |
| ④ 业绩预告快报 | `run_forecasts_refresh`（已存在） | `POST /refresh/fundamental/forecasts`（已存在） | 无 |
| ⑤ 行业与指数数据 | `run_industry_refresh`（已存在） | `POST /refresh/fundamental/industry`（已存在） | 无 |
| ⑥ 研报元数据 | `run_research_meta_refresh`（已存在，内部 `_all_stock_codes()`） | `POST /refresh/fundamental/research-meta`（已存在） | ① |
| ⑦ 研报PDF解析 | `run_research_pdfs_refresh`（已存在） | `POST /refresh/fundamental/research-pdfs`（已存在） | ⑥ |

"一键更新全部"按依赖图分三阶段执行：

- **阶段1（并行）**：①③④⑤
- **阶段2（① 完成后并行，与阶段1未完成的③④⑤互不阻塞）**：②⑥
- **阶段3（⑥ 完成后）**：⑦

## 一、整体导航与页面拆分

- `App.tsx` 瘦身为外壳，只持有跨页面共享状态：`view`（`'home' | 'screen'`，默认 `'home'`）和 `strategy`（`StrategyId`）。渲染结构：

  ```
  <Sidebar activeView={view} onNavigate={setView} />
  {view === 'screen' && <StrategySidebar strategy={strategy} onSelect={(s) => { setStrategy(s); setView('screen') }} ... />}
  {view === 'home' ? <HomePage /> : <ScreenPage strategy={strategy} />}
  ```

- `Sidebar.tsx` 改为受控组件，导航项调整为：新增 `{ key: 'home', label: '首页', icon: Home }` 放在最前；原 `选股` 项的图标从 `Home` 换成 `LineChart`（避免与首页图标重复）；其余（自选股/策略库/回测/设置）不变。

- 新增 `src/pages/HomePage.tsx`：自包含组件，自己订阅 `/refresh/status` SSE 并拉取 `/meta`，不需要从 `App` 接收 props。

- 新增 `src/pages/ScreenPage.tsx`：承接现 `App.tsx` 中选股相关的全部状态与 JSX——`presets`、`selectedCode`、`paramValues`、`screenItems`、`screenTotal`、`screenUpdatedAt`、`screening`、`indexList`、`indexConstituentMap`、`selectedCandidate`、`filterOpen`、`stockDetail`、`detailError`、`detailLoading`，以及 `FilterDrawer`/`FundamentalCandidateListCard`/`StockDetailPanel`/`TechnicalScreenView` 的渲染逻辑。通过 props 接收 `strategy`。

- 新增共享组件 `src/components/layout/PageHeader.tsx`，替代 `TopBar.tsx`：只接收 `title: string`，渲染一条简化头部栏。
  - `HomePage` 用 `<PageHeader title="数据更新" />`
  - `ScreenPage` 用 `<PageHeader title={activePreset?.name ?? ''} />`

## 二、后端：任务拆分与编排（`app/refresh.py` / `app/main.py` / `app/meta.py`）

### 拆分 `run_kline_refresh`

- `run_stock_list_refresh(constituents_fn=None)`：原 step1 逻辑（抓取股票列表、分页进度回调、写入/软删除 `Stock`），维护 `STATE["kline"].steps[0]`。运行中重复触发直接返回。
- `run_kline_data_refresh(kline_fn=None)`：原 step2 逻辑（从 DB 读取现有未退市代码、逐股抓 K 线、日+周+月+季写库），维护 `STATE["kline"].steps[1]`。运行中重复触发直接返回。完成后更新 `STATE["kline"].status`/`updatedAt`（两步都做完才算 `kline` 整体 done，与现状一致）。
- 旧的 `run_kline_refresh` 整体删除。

### 移除 `run_fundamental_refresh`

原"一键刷新基本面"（steps0-2 并行 + 3→4 串行）整体删除，逻辑被新的 `run_full_refresh` 取代。

### 新增 `run_full_refresh`

```python
def run_full_refresh(
    constituents_fn=None, kline_fn=None,
    financial_fn=None, forecast_fn=None, express_fn=None,
    industries_fn=None, industry_hist_fn=None, industry_constituents_fn=None,
    industries_first_fn=None, index_constituents_fn=None,
    research_meta_fn=None,
    research_download_fn=None, research_parse_fn=None, research_directory=None,
) -> None:
    """一键更新全部：按依赖图分三阶段并发执行 7 个任务。"""
```

- 运行中重复触发（`STATE["all"].status == "running"`）直接返回。
- 用一个 `ThreadPoolExecutor` 提交任务：
  1. 阶段1：提交 `run_stock_list_refresh` / `run_financial_refresh` / `run_forecasts_refresh` / `run_industry_refresh`。
  2. `run_stock_list_refresh` 的 future `.result()` 返回后（无论成功失败都继续），提交阶段2：`run_kline_data_refresh` / `run_research_meta_refresh`。
  3. `run_research_meta_refresh` 的 future `.result()` 返回后，提交阶段3：`run_research_pdfs_refresh`。
  4. 等待所有 future 完成，收集异常。
- 各任务自身已经把状态/错误写入对应 `STATE[...].steps[i]`；`run_full_refresh` 额外维护整体 `STATE["all"]`（`running` → `done`/`error`，`error` 取第一个出现的异常信息）。
- `STATE["all"]` 复用现有 `RefreshGroup` 结构（`steps=[]`），`_new_state()` 增加 `"all": RefreshGroup()`。`_backfill_state_from_db()` 不处理 `all`（进程重启后 `all` 恢复为 `idle`，是预期行为——它只反映"最近一次一键更新全部"的状态，不影响各任务卡片自身基于 DB 的回填）。

### `app/main.py` 端点改动

- 新增 `POST /refresh/stock-list` → `asyncio.to_thread(refresh.run_stock_list_refresh)`
- `POST /refresh/kline` 去掉 `reload_stock_list` 查询参数 → `asyncio.to_thread(refresh.run_kline_data_refresh)`
- 新增 `POST /refresh/all` → `asyncio.to_thread(refresh.run_full_refresh, research_meta_fn=fetch_research_metadata, research_download_fn=download_pdf, research_parse_fn=parse_pdf_text)`（研报相关 fn 注入方式与原 `/refresh/fundamental` 一致）
- 删除 `POST /refresh/fundamental`（bundled）；保留 5 个 `POST /refresh/fundamental/{step}`
- 所有 `/refresh/*` 系列 POST 端点（含新增的 `/refresh/stock-list`、`/refresh/kline`、`/refresh/all`、`/refresh/fundamental/{step}`）统一增加检查：若 `refresh.STATE["all"].status == "running"`，返回 `409 {"detail": "全部更新中，请稍候"}`。

### `app/meta.py`

- `researchReports` 增加 `stage2UpdatedAt`：最近一次 `stage == "parsed"` 的 `ResearchReport.updated_at`，供"研报PDF解析"卡片展示上次更新时间。

## 三、前端：首页面板（`HomePage.tsx`）

布局：

```
PageHeader: "数据更新"

┌─ 摘要卡 ─────────────────────────────────────┐
│ 状态文案（见下） ...................  [一键更新全部] │
└──────────────────────────────────────────────┘

阶段1 · 无依赖，可并行
[股票列表] [财报数据] [业绩预告快报] [行业与指数数据]

阶段2 · 依赖股票列表完成
[K线数据] [研报元数据]

阶段3 · 依赖研报元数据完成
[研报PDF解析]
```

**摘要卡**：
- `all.status === 'running'`：spinner + "全部更新中..."，按钮 disabled（loading 态）。
- `all.status === 'error'`：展示 `all.error`。
- 其余情况：展示 `all.updatedAt`（"上次一键更新于 xxx"，无记录则"暂无记录"），按钮可点击，点击调用 `api.refreshAll()`。

**任务卡片**（配置数组驱动，避免 7 份重复 JSX）：

```ts
interface RefreshTaskConfig {
  key: string
  label: string
  step: (status: RefreshStatus) => RefreshStep   // 取对应 step
  updatedAt: (meta: MetaResponse) => string | null
  trigger: () => Promise<unknown>
  dependsOn?: string[]   // 依赖的其他 task key
}
```

7 项配置分别指向：
1. `stock-list` → `kline.steps[0]` / `meta.stockList.updatedAt` / `api.refreshStockList`
2. `kline-data` → `kline.steps[1]` / `meta.klineDay.updatedAt` / `api.refreshKline`，`dependsOn=['stock-list']`
3. `financial` → `fundamental.steps[0]` / `meta.financialReports.updatedAt` / `api.refreshFundamentalStep('financial')`
4. `forecasts` → `fundamental.steps[1]` / `meta.forecasts.updatedAt` / `api.refreshFundamentalStep('forecasts')`
5. `industry` → `fundamental.steps[2]` / `meta.industryIndex.updatedAt` / `api.refreshFundamentalStep('industry')`
6. `research-meta` → `fundamental.steps[3]` / `meta.researchReports.stage1UpdatedAt` / `api.refreshFundamentalStep('research-meta')`，`dependsOn=['stock-list']`
7. `research-pdfs` → `fundamental.steps[4]` / `meta.researchReports.stage2UpdatedAt` / `api.refreshFundamentalStep('research-pdfs')`，`dependsOn=['research-meta']`

每张卡片展示：标题、上次更新时间、状态（复用现有 `InlineProgress` 的状态判断：`idle`→待执行、`running`→进度条+百分比、`done`/`idle且有历史数据`→已完成、`error`→失败+hover详情）、"刷新"按钮。

按钮禁用条件：自身 `step.status === 'running'`，或 `all.status === 'running'`，或 `dependsOn` 中存在未完成的依赖（`status !== 'done' && !(status === 'idle' && total > 0)`），并通过 `title` 提示禁用原因（"全部更新中，请稍候" / "请先完成：股票列表"）。

`HomePage` 内的 SSE 处理沿用现 `App.tsx` 的 `reloadMeta`/`prevStatusRef` 模式：当某个 step 从 `running` 变为非 `running` 时调用 `api.meta()` 刷新"上次更新时间"。

## 四、清理范围

**前端**
- 删除 `activities` / `reportActivity` / `ActivityItem` / `ActivityStatus` / `onActivity`：去掉 TopBar 的 activity pills 后，整条链路（`App.tsx` 的 state 与回调、`TechnicalScreenView.tsx` 的 `onActivity` prop 及调用、`types.ts` 里的两个类型）均为死代码，一并删除。
- 删除 `TopBar.tsx`，替换为 `PageHeader.tsx`。
- `api.ts`：删除 `refreshFundamental()`；`refreshKline()` 去掉 `reloadStockList` 参数；新增 `refreshStockList()`、`refreshAll()`。
- `types.ts`：`RefreshStatus` 增加 `all: RefreshGroup`；`MetaResponse.researchReports` 增加 `stage2UpdatedAt: string | null`。

**后端**
- 删除旧 `run_kline_refresh`、`run_fundamental_refresh`。
- 删除 `POST /refresh/fundamental`（bundled）端点。

**测试影响范围**（具体用例改动在实现计划中列出）
- `tests/test_refresh.py`：针对 `run_kline_refresh` 的 4 个用例 → 拆分为 `run_stock_list_refresh` / `run_kline_data_refresh` 各自的用例。
- `tests/test_refresh_fundamental.py`：针对 `run_fundamental_refresh` 的用例 → 改为针对 `run_full_refresh`。
- `tests/test_api.py`：`/refresh/kline`、`/refresh/fundamental` 端点用例同步调整为新端点路径。
- `tests/test_refresh_stream.py`：`get_status_snapshot()` 的快照断言需要包含新的 `"all"` 字段。

**文档**
- `CLAUDE.md` 的"前端结构"一节需要同步更新，反映 `App.tsx`（瘦身外壳）/ `HomePage.tsx` / `ScreenPage.tsx` / `PageHeader.tsx` 的新结构，以及 `/refresh` 端点的变化。

## 数据流总览

```
首页点击"一键更新全部"
  → POST /refresh/all
  → run_full_refresh: 阶段1并发(①③④⑤) → ①完成后阶段2并发(②⑥) → ⑥完成后阶段3(⑦)
  → 各任务自身写入 STATE[group].steps[i]；run_full_refresh 维护 STATE["all"]
  → SSE 推送 STATE 快照（含 all）
  → HomePage 各卡片按 step 状态更新；step 完成时触发 reloadMeta() 更新"上次更新时间"
  → all.status 变为 done/error，摘要卡更新

首页点击单个卡片"刷新"
  → POST /refresh/stock-list | /refresh/kline | /refresh/fundamental/{step}
  → 若 all.status === 'running'，返回 409
  → 否则与一键更新全部共用同一套 STATE/SSE 推送
```
