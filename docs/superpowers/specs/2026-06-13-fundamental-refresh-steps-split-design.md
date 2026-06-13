# 基本面刷新步骤拆分 + forecasts UNIQUE 约束修复

## 背景

当前基本面刷新是 5 个步骤串行执行，前端只有一个"刷新基本面"按钮一键触发全部。存在两个问题：

1. **forecasts 表 UNIQUE 约束冲突 bug**：业绩预告数据中同一股票同一报告期有多条不同指标（净利润、营业收入等），它们的 `(code, report_date, source)` 完全相同，插入时触发唯一约束冲突。
2. **无法单独刷新某一步骤**：用户只想重新抓取财报数据或行业指数，必须全量刷新。

## 目标

1. 修复 forecasts UNIQUE 约束 bug
2. 5 个步骤可独立触发、独立展示进度
3. 保留一键全刷功能
4. 步骤间依赖检查（如研报解析依赖研报元数据）
5. 无依赖步骤可并发执行

## 设计

### 一、RefreshStep 状态扩展

`RefreshStep` 新增 `status` 和 `error` 字段，每个步骤拥有独立运行状态：

```python
@dataclass
class RefreshStep:
    label: str
    status: str = "idle"      # idle | running | done | error
    error: Optional[str] = None
    done: int = 0
    total: int = 0
    elapsed: str = "00:00"
    progress: int = 0
```

`RefreshGroup` 去掉 `status`/`updatedAt`/`error`，只保留 `steps[]` 作为容器。每个步骤的状态直接在各自的 ActivityPill 中展示，不再有整体进度。

### 二、独立刷新 API + 依赖检查

新增 5 个独立端点：

| 端点 | 步骤 | 依赖 |
|------|------|------|
| `POST /refresh/fundamental/financial` | 财报数据 | 无 |
| `POST /refresh/fundamental/forecasts` | 业绩预告快报 | 无 |
| `POST /refresh/fundamental/industry` | 申万行业指数 | 无 |
| `POST /refresh/fundamental/research-meta` | 研报元数据 | 无 |
| `POST /refresh/fundamental/research-pdfs` | 研报解析 | research-meta 完成 |

依赖检查：请求 research-pdfs 时，如果 research-meta 步骤 status 不是 `done`，返回 `409 Conflict` + `{"error": "请先刷新研报元数据"}`。

并发控制：
- 每个步骤 status=running 时重复触发返回 409
- 不同步骤之间可并发（各自独立 session，不冲突）
- 一键全刷 `POST /refresh/fundamental` 保留，后端内部编排执行顺序：
- 步骤 1、2、3 通过 `asyncio.gather` 并发执行（各自在独立线程中运行）
- 步骤 1/2/3 全部完成后执行步骤 4
- 步骤 4 完成后执行步骤 5
- 一键全刷与单步刷新共享同一套 `_cancel_flag` 和 SSE 推送机制

### 三、forecasts 表 UNIQUE 约束修复

唯一约束从 `(code, report_date, source)` 改为 `(code, report_date, source, indicator)`，让不同指标的预告各自独立存储。

`express`（业绩快报）来源无 indicator 字段，赋固定值 `"业绩快报"`，避免 NULL 在唯一约束中的陷阱（SQLite 中两个 NULL 不被视为相等）。

`_refresh_forecasts` 的 upsert 查询条件同步改为 `filter_by(code=..., report_date=..., source=..., indicator=...)`，并在 `s.add(obj)` 后加 `s.flush()` 防止同 session 内重复插入。

数据库迁移：删除旧约束 `uq_forecast`，创建新约束 `uq_forecast_indicator`。

### 四、前端刷新界面改造

**步骤进度展示**：每个步骤旁显示独立的 ActivityPill：
- idle：不显示（或灰色小按钮）
- running：转圈 + 进度百分比
- done：红色 ✓（与技术面统一）
- error：红色提示 + error 信息

**独立刷新按钮**：每个步骤旁加小按钮：
- 该步骤 running 时按钮禁用
- research-pdfs 刷新时，research-meta 未完成则按钮禁用 + tooltip 提示

**一键全刷按钮保留**：按依赖顺序触发全部步骤（1、2、3 并发，4→5 串行）

**SSE 推送结构调整**：`fundamental.steps[]` 每个元素带 `status/error`，前端直接用每步的 status 渲染。`fundamental` 去掉整体 `status`/`updatedAt`/`error`。

### 五、数据流总览

```
前端点击单步刷新按钮
  → POST /refresh/fundamental/{step}
  → 依赖检查（409 或通过）
  → asyncio.to_thread(_refresh_xxx)
  → 步骤 status → running
  → 抓取数据 → upsert 写库
  → 步骤 status → done/error
  → SSE 推送步骤状态更新
  → 前端 ActivityPill 更新

前端点击一键全刷
  → POST /refresh/fundamental
  → 并发执行步骤1、2、3
  → 串行执行步骤4、5
  → SSE 推送各步骤状态更新
  → 前端各 ActivityPill 逐个更新
```
