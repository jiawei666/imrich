# 基本面刷新步骤拆分 + forecasts UNIQUE 约束修复 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复 forecasts UNIQUE 约束 bug，并将基本面 5 个刷新步骤拆分为可独立触发、独立展示进度的刷新单元，同时保留一键全刷功能。

**Architecture:** 后端每个步骤暴露独立 API 端点，各自管理 RefreshStep 的 status/error；RefreshGroup 去掉整体 status，前端从每个步骤的独立状态渲染进度；一键全刷端点内部编排并发+串行执行。

**Tech Stack:** FastAPI + SQLAlchemy + SQLite（后端），React 19 + TypeScript（前端）

---

## 文件结构

| 操作 | 文件 | 职责 |
|------|------|------|
| Modify | `backend/app/models.py` | Forecast 唯一约束改为 (code, report_date, source, indicator) |
| Modify | `backend/app/data/fetch_fundamental.py` | fetch_express_reports 添加 indicator="业绩快报" |
| Modify | `backend/app/refresh.py` | RefreshStep 加 status/error；RefreshGroup 去掉 status/updatedAt/error；拆分 run_fundamental_refresh 为独立函数 + 一键全刷编排；_refresh_forecasts 修复 upsert + flush |
| Modify | `backend/app/main.py` | 新增 5 个单步刷新端点 + 依赖检查 |
| Modify | `frontend/src/types.ts` | RefreshStep 加 status/error；RefreshGroup 去掉 status/updatedAt/error |
| Modify | `frontend/src/lib/api.ts` | 新增 5 个单步刷新 API 调用 |
| Modify | `frontend/src/components/layout/TopBar.tsx` | 基本面步骤加独立刷新按钮 + ActivityPill；一键全刷按钮保留 |
| Modify | `frontend/src/App.tsx` | 传递单步刷新回调给 TopBar；SSE 状态处理适配新结构 |

---

### Task 1: 修复 Forecast 模型唯一约束

**Files:**
- Modify: `backend/app/models.py:93-96`
- Modify: `backend/app/db.py` (添加迁移逻辑)

- [ ] **Step 1: 修改 Forecast 模型唯一约束**

在 `backend/app/models.py` 中，将 Forecast 的 `__table_args__` 从：

```python
__table_args__ = (
    UniqueConstraint("code", "report_date", "source", name="uq_forecast"),
    Index("ix_forecasts_code_date", "code", "report_date"),
)
```

改为：

```python
__table_args__ = (
    UniqueConstraint("code", "report_date", "source", "indicator", name="uq_forecast_indicator"),
    Index("ix_forecasts_code_date", "code", "report_date"),
)
```

- [ ] **Step 2: 在 init_db 中添加迁移逻辑**

在 `backend/app/db.py` 的 `init_db()` 函数中，在 `Base.metadata.create_all` 之后添加迁移代码，处理已有数据库的约束变更：

```python
def _migrate_forecasts_constraint(engine):
    """将 forecasts 表唯一约束从 (code,report_date,source) 迁移到 (code,report_date,source,indicator)。"""
    with engine.connect() as conn:
        # 检查旧约束是否存在
        result = conn.execute(text(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='forecasts'"
        ))
        if result.fetchone() is None:
            return  # 表不存在，无需迁移

        # 检查旧约束是否存在
        result = conn.execute(text(
            "SELECT name FROM sqlite_master WHERE type='index' AND name='uq_forecast' AND tbl_name='forecasts'"
        ))
        if result.fetchone() is not None:
            # 旧约束存在，先去重再迁移
            conn.execute(text(
                "DELETE FROM forecasts WHERE id NOT IN ("
                "  SELECT MIN(id) FROM forecasts GROUP BY code, report_date, source, indicator"
                ")"
            ))
            conn.execute(text("DROP INDEX uq_forecast"))
            conn.execute(text(
                "CREATE UNIQUE INDEX uq_forecast_indicator ON forecasts (code, report_date, source, indicator)"
            ))
            conn.commit()
```

在 `init_db()` 的 `Base.metadata.create_all(bind=engine)` 之后调用 `_migrate_forecasts_constraint(engine)`。

- [ ] **Step 3: 修改 fetch_express_reports 添加 indicator**

在 `backend/app/data/fetch_fundamental.py` 的 `fetch_express_reports` 函数中，给每行数据添加 `"indicator": "业绩快报"`：

```python
def fetch_express_reports(report_date: str) -> list[dict]:
    df = ak.stock_yjkb_em(date=report_date)
    rows: list[dict] = []
    for _, r in df.iterrows():
        rows.append({
            "code": _norm_code(r["股票代码"]),
            "report_date": _to_date(report_date),
            "source": "express",
            "indicator": "业绩快报",
            "net_profit": _to_float(r["净利润-净利润"]),
            "net_profit_yoy": _to_float(r["净利润-同比增长"]),
            "revenue": _to_float(r["营业收入-营业收入"]),
            "revenue_yoy": _to_float(r["营业收入-同比增长"]),
            "notice_date": str(r["公告日期"]) if pd.notna(r["公告日期"]) else None,
        })
    return rows
```

- [ ] **Step 4: 修改 _refresh_forecasts 的 upsert 逻辑**

在 `backend/app/refresh.py` 的 `_refresh_forecasts` 函数中：

1. 将 `filter_by` 条件加入 `indicator`：

```python
obj = (
    s.query(Forecast)
    .filter_by(code=row["code"], report_date=row["report_date"], source=row["source"], indicator=row.get("indicator"))
    .one_or_none()
)
if obj is None:
    obj = Forecast(code=row["code"], report_date=row["report_date"], source=row["source"], indicator=row.get("indicator"))
    s.add(obj)
    s.flush()
```

2. 同样修改 `_refresh_financial_reports`，在 `s.add(obj)` 后加 `s.flush()` 作为防御性措施。

3. 同样修改 `_refresh_industry_index`，在 `s.add(obj)` 后加 `s.flush()`。

- [ ] **Step 5: 运行测试验证**

Run: `cd backend && source venv/bin/activate && pytest tests/ -v`
Expected: 全部 PASS

- [ ] **Step 6: Commit**

```bash
git add backend/app/models.py backend/app/db.py backend/app/data/fetch_fundamental.py backend/app/refresh.py
git commit -m "fix: forecasts 唯一约束加入 indicator + express 固定 indicator 值 + upsert flush 防重复"
```

---

### Task 2: RefreshStep 状态扩展 + RefreshGroup 简化

**Files:**
- Modify: `backend/app/refresh.py:32-46`

- [ ] **Step 1: 修改 RefreshStep 和 RefreshGroup 数据类**

将 `RefreshStep` 从：

```python
@dataclass
class RefreshStep:
    label: str
    done: int = 0
    total: int = 0
    elapsed: str = "00:00"
    progress: int = 0
```

改为：

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

将 `RefreshGroup` 从：

```python
@dataclass
class RefreshGroup:
    status: str = "idle"
    updatedAt: Optional[str] = None
    error: Optional[str] = None
    steps: List[RefreshStep] = field(default_factory=list)
```

改为：

```python
@dataclass
class RefreshGroup:
    steps: List[RefreshStep] = field(default_factory=list)
```

- [ ] **Step 2: 更新所有使用 RefreshGroup.status 的代码**

在 `refresh.py` 中，所有 `group.status = "xxx"` / `group.error = "xxx"` / `group.updatedAt = "xxx"` 的地方需要替换为操作步骤的 status。具体修改：

1. `run_kline_refresh` 函数中：
   - `group.status = "running"` → 改为设置所有步骤 status？不，kline 不改，kline 的 RefreshGroup 保留 status/updatedAt/error 不变（只改 fundamental）。所以需要 kline 和 fundamental 使用不同的 RefreshGroup 结构。

**修正方案**：kline 组保留整体 status（用户没有要求拆分 kline），只有 fundamental 组去掉整体 status。用一个更简单的方案——`RefreshGroup` 保留原有字段，但 fundamental 组的 `status`/`updatedAt`/`error` 不再被前端使用，前端只看各步骤的独立 status。这样改动最小。

撤回 Step 1 的 RefreshGroup 修改，只改 RefreshStep：

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

`RefreshGroup` 保持不变。前端对 fundamental 组只使用 `steps[].status`，忽略 `status`/`updatedAt`/`error`。

- [ ] **Step 3: 更新 _new_state 初始化**

`_new_state()` 无需改动，RefreshStep 的 `status` 和 `error` 有默认值。

- [ ] **Step 4: 更新各刷新函数的步骤状态管理**

在 `_refresh_financial_reports`、`_refresh_forecasts`、`_refresh_industry_index`、`refresh_research_metadata`、`refresh_research_pdfs` 中，开始时设置 `step.status = "running"`，成功完成时设置 `step.status = "done"`，异常时设置 `step.status = "error"` + `step.error = str(e)`。

以 `_refresh_financial_reports` 为例，在函数开头加 `step.status = "running"`，在 `s.commit()` 之后加 `step.status = "done"`，异常捕获中加 `step.status = "error"; step.error = str(e)`。

- [ ] **Step 5: 更新 get_status_snapshot**

`get_status_snapshot` 中 fundamental 组的回填逻辑需要适配：当步骤 status 为 idle 时用数据库实际量回填。回填后如果 count > 0 则将 status 设为 "done"。

- [ ] **Step 6: 运行测试验证**

Run: `cd backend && source venv/bin/activate && pytest tests/ -v`
Expected: 全部 PASS

- [ ] **Step 7: Commit**

```bash
git add backend/app/refresh.py
git commit -m "refactor: RefreshStep 加独立 status/error，各步骤自行管理运行状态"
```

---

### Task 3: 拆分 run_fundamental_refresh 为独立步骤函数 + 一键全刷编排

**Files:**
- Modify: `backend/app/refresh.py:328-411`

- [ ] **Step 1: 新增 5 个公开的独立步骤执行函数**

在 `refresh.py` 中新增 5 个函数，每个函数只执行一个步骤，接收与当前内部函数相同的参数：

```python
def run_financial_refresh(financial_fn=None):
    """独立执行步骤1：财报数据刷新。"""
    if financial_fn is None:
        from app.data.fetch_fundamental import fetch_financial_reports
        financial_fn = fetch_financial_reports
    group = STATE["fundamental"]
    step = group.steps[0]
    if step.status == "running":
        return
    step.status = "running"
    step.error = None
    try:
        _refresh_financial_reports(group, financial_fn)
        step.status = "done"
    except Exception as e:
        step.status = "error"
        step.error = str(e)
        raise

def run_forecasts_refresh(forecast_fn=None, express_fn=None):
    """独立执行步骤2：业绩预告快报刷新。"""
    if forecast_fn is None:
        from app.data.fetch_fundamental import fetch_forecasts
        forecast_fn = fetch_forecasts
    if express_fn is None:
        from app.data.fetch_fundamental import fetch_express_reports
        express_fn = fetch_express_reports
    group = STATE["fundamental"]
    step = group.steps[1]
    if step.status == "running":
        return
    step.status = "running"
    step.error = None
    try:
        _refresh_forecasts(group, forecast_fn, express_fn)
        step.status = "done"
    except Exception as e:
        step.status = "error"
        step.error = str(e)
        raise

def run_industry_refresh(industries_fn=None, industry_hist_fn=None, constituents_fn=None):
    """独立执行步骤3：申万行业指数刷新。"""
    if industries_fn is None:
        from app.data.fetch_fundamental import get_sw_industries
        industries_fn = get_sw_industries
    if industry_hist_fn is None:
        from app.data.fetch_fundamental import get_industry_index_hist
        industry_hist_fn = get_industry_index_hist
    if constituents_fn is None:
        from app.data.fetch_fundamental import get_industry_constituents
        constituents_fn = get_industry_constituents
    group = STATE["fundamental"]
    step = group.steps[2]
    if step.status == "running":
        return
    step.status = "running"
    step.error = None
    try:
        _refresh_industry_index(group, industries_fn, industry_hist_fn, constituents_fn)
        step.status = "done"
    except Exception as e:
        step.status = "error"
        step.error = str(e)
        raise

def run_research_meta_refresh(research_meta_fn=None):
    """独立执行步骤4：研报元数据刷新。"""
    if research_meta_fn is None:
        from app.data.fetch_research import fetch_research_metadata
        research_meta_fn = fetch_research_metadata
    group = STATE["fundamental"]
    step = group.steps[3]
    if step.status == "running":
        return
    step.status = "running"
    step.error = None
    try:
        refresh_research_metadata(research_meta_fn, group=group)
        step.status = "done"
    except Exception as e:
        step.status = "error"
        step.error = str(e)
        raise

def run_research_pdfs_refresh(candidate_screen_fn=None, research_download_fn=None, research_parse_fn=None, research_directory=None):
    """独立执行步骤5：研报PDF解析刷新。依赖步骤4完成。"""
    group = STATE["fundamental"]
    step4 = group.steps[3]
    if step4.status != "done":
        raise RuntimeError("请先刷新研报元数据")
    if candidate_screen_fn is None:
        from app.fundamental_screen import run_fundamental_screen
        candidate_screen_fn = run_fundamental_screen
    if research_download_fn is None:
        from app.data.fetch_research import download_pdf
        research_download_fn = download_pdf
    if research_parse_fn is None:
        from app.data.fetch_research import parse_pdf_text
        research_parse_fn = parse_pdf_text
    if research_directory is None:
        research_directory = Path("backend/data/research")
    step = group.steps[4]
    if step.status == "running":
        return
    step.status = "running"
    step.error = None
    try:
        candidate_codes = [row["code"] for row in candidate_screen_fn("super-growth", {})[:200]]
        candidate_codes += [row["code"] for row in candidate_screen_fn("oversold-bluechip", {})[:200]]
        refresh_research_pdfs(
            sorted(set(candidate_codes)),
            research_directory,
            download_fn=research_download_fn,
            parse_fn=research_parse_fn,
            group=group,
        )
        step.status = "done"
    except Exception as e:
        step.status = "error"
        step.error = str(e)
        raise
```

- [ ] **Step 2: 改造 run_fundamental_refresh 为编排函数**

将 `run_fundamental_refresh` 改为调用上述 5 个函数，并用 `concurrent.futures.ThreadPoolExecutor` 实现步骤 1/2/3 并发，4→5 串行：

```python
def run_fundamental_refresh(
    financial_fn=None, forecast_fn=None, express_fn=None,
    industries_fn=None, industry_hist_fn=None, constituents_fn=None,
    research_meta_fn=None, candidate_screen_fn=None,
    research_download_fn=None, research_parse_fn=None,
    research_directory=None,
) -> None:
    """一键全刷：步骤1/2/3并发，4→5串行。"""
    group = STATE["fundamental"]
    group.status = "running"
    try:
        from concurrent.futures import ThreadPoolExecutor, as_completed
        with ThreadPoolExecutor(max_workers=3) as pool:
            futs = {
                pool.submit(run_financial_refresh, financial_fn): 0,
                pool.submit(run_forecasts_refresh, forecast_fn, express_fn): 1,
                pool.submit(run_industry_refresh, industries_fn, industry_hist_fn, constituents_fn): 2,
            }
            for fut in as_completed(futs):
                try:
                    fut.result()
                except Exception:
                    pass  # 错误已记录在 step.error 中

        run_research_meta_refresh(research_meta_fn)
        run_research_pdfs_refresh(candidate_screen_fn, research_download_fn, research_parse_fn, research_directory)

        group.status = "done"
        group.updatedAt = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    except Exception as e:
        group.status = "error"
        group.error = str(e)
        raise
```

- [ ] **Step 3: 从内部 _refresh_* 函数中移除 group.status 管理**

`_refresh_financial_reports`、`_refresh_forecasts`、`_refresh_industry_index` 内部不再设置 `group.status`，因为各步骤的 `step.status` 已由外层的 `run_*_refresh` 函数管理。

- [ ] **Step 4: 运行测试验证**

Run: `cd backend && source venv/bin/activate && pytest tests/ -v`
Expected: 全部 PASS

- [ ] **Step 5: Commit**

```bash
git add backend/app/refresh.py
git commit -m "feat: 基本面刷新拆分为 5 个独立函数 + 一键全刷并发编排"
```

---

### Task 4: 新增 5 个单步刷新 API 端点

**Files:**
- Modify: `backend/app/main.py:65-78`

- [ ] **Step 1: 新增单步刷新端点**

在 `main.py` 中，紧跟 `refresh_fundamental` 端点之后新增 5 个端点：

```python
FUNDAMENTAL_STEP_DEPS = {
    "research-pdfs": ("research-meta", "请先刷新研报元数据"),
}

@app.post("/refresh/fundamental/{step}", status_code=202)
async def refresh_fundamental_step(step: str):
    """单步刷新基本面数据。"""
    # 依赖检查
    if step in FUNDAMENTAL_STEP_DEPS:
        dep_step, msg = FUNDAMENTAL_STEP_DEPS[step]
        from app.refresh import STATE
        step_map = {
            "financial": 0, "forecasts": 1, "industry": 2,
            "research-meta": 3, "research-pdfs": 4,
        }
        dep_idx = step_map.get(dep_step)
        if dep_idx is not None and STATE["fundamental"].steps[dep_idx].status != "done":
            raise HTTPException(status_code=409, detail=msg)

    # 重复触发检查
    from app.refresh import STATE
    step_map = {
        "financial": 0, "forecasts": 1, "industry": 2,
        "research-meta": 3, "research-pdfs": 4,
    }
    idx = step_map.get(step)
    if idx is None:
        raise HTTPException(status_code=404, detail=f"未知步骤: {step}")
    if STATE["fundamental"].steps[idx].status == "running":
        raise HTTPException(status_code=409, detail="该步骤正在执行中")

    # 分发执行
    dispatch = {
        "financial": lambda: refresh.run_financial_refresh(),
        "forecasts": lambda: refresh.run_forecasts_refresh(),
        "industry": lambda: refresh.run_industry_refresh(),
        "research-meta": lambda: refresh.run_research_meta_refresh(),
        "research-pdfs": lambda: refresh.run_research_pdfs_refresh(
            candidate_screen_fn=run_fundamental_screen,
            research_download_fn=download_pdf,
            research_parse_fn=parse_pdf_text,
        ),
    }
    t = asyncio.create_task(asyncio.to_thread(dispatch[step]))
    _refresh_tasks.add(t)
    t.add_done_callback(_refresh_tasks.discard)
    return {"status": "accepted"}
```

- [ ] **Step 2: 运行测试验证**

Run: `cd backend && source venv/bin/activate && pytest tests/ -v`
Expected: 全部 PASS

- [ ] **Step 3: Commit**

```bash
git add backend/app/main.py
git commit -m "feat: 新增 5 个单步刷新 API 端点 + 依赖检查 + 重复触发检查"
```

---

### Task 5: 前端类型 + API 适配

**Files:**
- Modify: `frontend/src/types.ts:127-145`
- Modify: `frontend/src/lib/api.ts:26-43`

- [ ] **Step 1: 更新 RefreshStep 类型**

在 `frontend/src/types.ts` 中，将 `RefreshStep` 从：

```typescript
export interface RefreshStep {
  label: string
  done: number
  total: number
  elapsed: string
  progress: number
}
```

改为：

```typescript
export interface RefreshStep {
  label: string
  status: 'idle' | 'running' | 'done' | 'error'
  error: string | null
  done: number
  total: number
  elapsed: string
  progress: number
}
```

- [ ] **Step 2: 新增单步刷新 API 调用**

在 `frontend/src/lib/api.ts` 中，新增：

```typescript
refreshFundamentalStep: async (step: string) => {
  const r = await fetch(`${BASE}/refresh/fundamental/${step}`, { method: 'POST' })
  if (!r.ok) {
    const body = await r.json().catch(() => ({}))
    throw new Error(body.detail || `${r.status}`)
  }
  return r.json()
},
```

- [ ] **Step 3: 运行前端类型检查**

Run: `cd frontend && npx tsc --noEmit`
Expected: 无类型错误

- [ ] **Step 4: Commit**

```bash
git add frontend/src/types.ts frontend/src/lib/api.ts
git commit -m "feat: 前端 RefreshStep 加 status/error + 新增单步刷新 API"
```

---

### Task 6: 前端 TopBar 改造 — 步骤独立刷新按钮 + ActivityPill

**Files:**
- Modify: `frontend/src/components/layout/TopBar.tsx`
- Modify: `frontend/src/App.tsx`

- [ ] **Step 1: 改造 InlineProgress 组件**

将 `InlineProgress` 改造为同时展示步骤状态和刷新按钮的组件：

```typescript
function InlineProgress({
  label,
  step,
  onRefresh,
  disabled,
  tooltip,
}: {
  label: string
  step: { status?: string; error?: string | null; progress: number; done: number; total: number } | undefined
  onRefresh?: () => void
  disabled?: boolean
  tooltip?: string
}) {
  if (!step) return null
  const status = step.status ?? 'idle'

  if (status === 'idle' && step.total === 0) {
    return (
      <span className="text-[12px] text-ink-faint">{label}: 待执行</span>
    )
  }
  if (status === 'done') {
    return (
      <span className="flex items-center gap-1 text-[12px] text-down">
        {label}: 已完成 <Check className="size-3" />
      </span>
    )
  }
  if (status === 'error') {
    return (
      <span className="flex items-center gap-1 text-[12px] text-down" title={step.error ?? undefined}>
        <AlertCircle className="size-3" />
        {label}失败
      </span>
    )
  }
  if (status === 'running') {
    return (
      <span className="flex items-center gap-2 text-[12px]">
        <span className="flex items-center gap-1 text-brand">
          <Loader2 className="size-3 animate-spin" />
          {label}: {step.progress}%
        </span>
        <ProgressBar value={step.progress} className="w-16" />
      </span>
    )
  }
  // idle with data
  return (
    <span className="flex items-center gap-1 text-[12px] text-up">
      {label}: 已完成 <Check className="size-3" />
    </span>
  )
}
```

- [ ] **Step 2: 给基本面步骤添加独立刷新按钮**

在 TopBar 中，基本面步骤区域改为每步带刷新按钮：

```typescript
{fundamentalSteps?.map((step, i) => (
  <div key={i} className="flex items-center gap-1">
    <InlineProgress label={step.label} step={step} />
    <button
      onClick={() => onRefreshFundamentalStep?.(FUNDAMENTAL_STEP_KEYS[i])}
      disabled={step.status === 'running' || (i === 4 && fundamentalSteps[3].status !== 'done')}
      title={i === 4 && fundamentalSteps[3].status !== 'done' ? '请先刷新研报元数据' : `刷新${step.label}`}
      className="ml-0.5 text-ink-soft hover:text-ink transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
    >
      <RotateCw className="size-3" />
    </button>
  </div>
))}
```

其中 `FUNDAMENTAL_STEP_KEYS = ['financial', 'forecasts', 'industry', 'research-meta', 'research-pdfs']`。

TopBar 组件签名新增 `onRefreshFundamentalStep` prop：

```typescript
onRefreshFundamentalStep?: (step: string) => void
```

- [ ] **Step 3: 更新 App.tsx 传递回调**

在 `App.tsx` 中新增：

```typescript
const triggerRefreshFundamentalStep = (step: string) => {
  api.refreshFundamentalStep(step).catch(() => {})
}
```

传递给 TopBar：

```typescript
<TopBar
  updatedAt={updatedAt}
  strategy={strategy}
  refreshStatus={refreshStatus}
  activities={activities}
  onRefreshKline={triggerRefreshKline}
  onRefreshFundamental={triggerRefreshFundamental}
  onRefreshFundamentalStep={triggerRefreshFundamentalStep}
/>
```

- [ ] **Step 4: 适配 SSE 状态处理**

在 `App.tsx` 的 SSE 回调中，fundamental 组不再有整体 status，改为监听各步骤状态变化：

```typescript
useEffect(() => {
  const close = api.refreshStatusStream((status) => {
    setRefreshStatus(status)
    const prev = prevStatusRef.current
    // kline 整体状态变化时 reloadMeta
    if (prev.kline === 'running' && status.kline.status !== 'running') {
      reloadMeta()
    }
    // fundamental 任意步骤从 running 变为非 running 时 reloadMeta
    if (prev.fundamentalSteps) {
      for (let i = 0; i < status.fundamental.steps.length; i++) {
        if (prev.fundamentalSteps[i] === 'running' && status.fundamental.steps[i].status !== 'running') {
          reloadMeta()
        }
      }
    }
    prev.kline = status.kline.status
    prev.fundamentalSteps = status.fundamental.steps.map(s => s.status)
  })
  return close
}, [])
```

`prevStatusRef` 类型改为 `{ kline?: string; fundamentalSteps?: string[] }`。

- [ ] **Step 5: 运行前端类型检查**

Run: `cd frontend && npx tsc --noEmit`
Expected: 无类型错误

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/layout/TopBar.tsx frontend/src/App.tsx
git commit -m "feat: 基本面步骤独立刷新按钮 + ActivityPill + SSE 适配"
```

---

### Task 7: 端到端验证

- [ ] **Step 1: 启动后端**

Run: `cd backend && source venv/bin/activate && uvicorn app.main:app --reload`

- [ ] **Step 2: 验证 forecasts UNIQUE 约束修复**

手动触发基本面刷新，观察 forecasts 步骤不再报 IntegrityError：

```bash
curl -X POST http://localhost:8000/refresh/fundamental/forecasts
```

- [ ] **Step 3: 验证单步刷新端点**

```bash
curl -X POST http://localhost:8000/refresh/fundamental/financial
curl -X POST http://localhost:8000/refresh/fundamental/forecasts
curl -X POST http://localhost:8000/refresh/fundamental/industry
```

每个应返回 `{"status": "accepted"}`。

- [ ] **Step 4: 验证依赖检查**

```bash
curl -X POST http://localhost:8000/refresh/fundamental/research-pdfs
```

如果 research-meta 未完成，应返回 409。

- [ ] **Step 5: 验证重复触发检查**

对同一 running 步骤再次 POST，应返回 409。

- [ ] **Step 6: 启动前端验证界面**

Run: `cd frontend && npm run dev`

在浏览器中验证：
- 基本面步骤各显示独立状态（转圈/红色✓/报错）
- 每步旁有独立刷新按钮
- 一键全刷按钮仍可用
- research-pdfs 按钮在 research-meta 未完成时禁用

- [ ] **Step 7: 最终 Commit（如有修复）**

```bash
git add -A
git commit -m "fix: 端到端验证修复"
```
