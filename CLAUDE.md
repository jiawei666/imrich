# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目简介

i'mRich 选股器：A 股选股工具。后端基于 akshare/东方财富/新浪等数据源抓取行情与财报，落地到本地 SQLite，提供技术面与基本面两类选股策略；前端是单页应用，展示候选股、个股详情、研报与刷新进度。

## 常用命令

### 一键启动（推荐）

```bash
./dev.sh   # 同时启动后端（:8311）和前端（:5173），Ctrl+C 一并停止
```

### 后端（`backend/`，FastAPI + SQLAlchemy）

```bash
cd backend
source venv/bin/activate              # 已有 venv；或 python -m venv venv && pip install -r requirements.txt
uvicorn app.main:app --reload --port 8311  # 启动 API（http://localhost:8311）
pytest                                # 全部测试
pytest tests/test_screen.py           # 单个文件
pytest tests/test_screen.py::test_xxx # 单个用例
pytest -k "kdj"                       # 按名称过滤
```

- 访问国内数据源（新浪/东方财富等）需要走代理，代理变量在 `backend/.env`（`http_proxy`/`https_proxy` 等）。运行抓取相关代码前需先 `source` 或在 shell 中导出这些变量。
- 测试通过环境变量 `IMRICH_DB_PATH` 把数据库指向临时文件（见 `tests/conftest.py`），不会污染 `backend/data/imrich.db`。

### 前端（`frontend/`，React 19 + Vite + Tailwind v4）

```bash
cd frontend
npm install
npm run dev       # 开发服务器，默认 http://localhost:5173（后端 CORS 已放行此端口）
npm run build     # tsc -b 类型检查 + vite build
npm run lint      # eslint
```

- API 基址由 `VITE_API_BASE` 决定，默认 `http://localhost:8311`。
- 路径别名 `@` → `frontend/src`（见 `vite.config.ts`）。

## 架构要点

### 数据流总览

数据源 → `app/data/fetch_*.py` 抓取 → `app/refresh.py` 落库（SQLite）→ `app/screen.py` / `app/fundamental_screen.py` 读库选股 → FastAPI 路由 (`app/main.py`) → 前端 `lib/api.ts`。

### 后端选股的两条路径

`run_screen(preset_id, params)`（`app/screen.py`）按预设分流：

- **技术面**（`TECHNICAL_PRESETS = {"trend-support", "b2"}`）：走 `run_technical_screen`。一次性加载全市场未退市日 K 到内存（`_load_kline_data`，先经 `pool_filters.filter_default_pool` 过滤 ST/北交所/次新股），对每只股票用 `Selector.evaluate(hist)` 判定并产出 `diagnostics`。
- **基本面**（`FUNDAMENTAL_PRESETS = {"super-growth", "oversold-bluechip"}`）：走 `run_fundamental_screen`，基于财报/预告/研报数据做筛选与打分。

新增技术面策略时需三处协同：
1. `app/selectors.py`：实现 Selector 类（约定接口 `_hist_for`、`_passes_filters`、`evaluate`、`diagnose`、`select`），并注册进 `SELECTOR_REGISTRY`。
2. `app/presets.py`：在 `_PARAM_SPECS`（暴露给 UI 的可调标量参数）、`_FIXED_DEFAULTS`（不进 UI 的固定/嵌套默认值）、`_NAMES`（中文名）登记。`build_selector` 会合并这三者再用 `params` 覆盖。
3. `app/screen.py`：把 preset id 加入 `TECHNICAL_PRESETS`。

技术指标计算集中在 `app/indicators.py`（KDJ、知行短期趋势/多空线、BBI、DIF、峰谷检测等），Selector 组合这些指标。

### 数据刷新（异步后台任务 + 进度状态）

刷新由 `app/refresh.py` 驱动，分两个任务组，进度存于模块级全局 `STATE`（`kline` / `fundamental` 两组，每组含若干 `RefreshStep`）：

- `run_kline_refresh`：步骤1 股票列表 diff（退市做软删除 `delisted_at`）、步骤2 日 K 全量重抓 + 周/月/季重采样（`app/data/resample.py`）。`reload_stock_list=False` 可跳过步骤1。
- `run_fundamental_refresh`：财报、业绩预告/快报、申万行业指数、研报元数据、研报 PDF 下载解析（研报仅对候选池前 N 只下载，见函数内 `candidate_screen_fn`）。

刷新通过 `POST /refresh/kline`、`POST /refresh/fundamental` 触发（`BackgroundTasks`，立即返回 202）。`GET /refresh/status` 返回 `STATE`，并用数据库实际入库量回填进度（避免内存计数为 0 时前端看到假进度）。各抓取函数都以 `*_fn` 参数注入，测试时传 fake 实现，无需联网。

### 数据库

`app/db.py`：SQLite，路径由 `app/config.py:get_db_path()` 决定（默认 `backend/data/imrich.db`，可用 `IMRICH_DB_PATH` 覆盖）。`init_db()` 会重建 engine 并 `SessionLocal.configure` 原地改绑，使已 import 了 `SessionLocal` 的模块也用上新 engine——测试切换 DB 依赖此机制。模型见 `app/models.py`（`Stock`、`KlineDay/Week/Month/Quarter`、`FinancialReport`、`Forecast`、`IndustryIndex`、`ResearchReport`）。股票 `code` 带市场前缀（如 `sz000001`）。

### 前端结构

`src/App.tsx` 是瘦身外壳，只持有跨页面共享状态：`view`（`'home' | 'screen'`，默认 `'home'`）和 `strategy`（`StrategyId`）。渲染结构：`Sidebar`（受控）+ `StrategySidebar`（仅 screen 视图）+ `HomePage` / `ScreenPage`。

- `src/pages/HomePage.tsx`：首页数据更新看板。自包含组件，自己订阅 `/refresh/status` SSE 并拉取 `/meta`。7 个任务卡片（配置数组 `TASKS` 驱动）+ 摘要卡（"一键更新全部"）。
- `src/pages/ScreenPage.tsx`：选股页，承接原 App.tsx 中选股相关的全部状态与 JSX。`forwardRef` 暴露 `toggleFilter()`。根据策略类别渲染 `TechnicalScreenView` 或基本面三段式布局。
- `src/components/layout/PageHeader.tsx`：共享头部组件（仅 `title: string`），替代原 `TopBar.tsx`。
- 所有后端调用集中在 `src/lib/api.ts`；类型定义在 `src/types.ts`。
- 刷新相关端点：`POST /refresh/stock-list`、`POST /refresh/kline`、`POST /refresh/all`、`POST /refresh/fundamental/{step}`。当 `STATE["all"].status == "running"` 时所有 `/refresh/*` POST 返回 409。
- `src/data/mock.ts`、`src/data/signals.ts` 提供初始/兜底 mock 数据（后端不可用时降级展示）。
- UI 组件库为本地 shadcn 风格（`src/components/ui/`，基于 Radix + class-variance-authority），图表用 echarts-for-react。

## 文档

`docs/superpowers/specs`、`docs/superpowers/plans` 存放需求规格与实现计划。
