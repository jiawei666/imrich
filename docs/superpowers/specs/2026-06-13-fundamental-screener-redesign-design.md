# 基本面策略页面重构设计

日期：2026-06-13

## 背景

前端基本面策略（创新高超级成长 `super-growth`、低位错杀蓝筹 `oversold-bluechip`）页面存在以下问题：

1. 仍有多处 mock/占位数据：`signals.ts` 的研报关键词列表、`mock.ts` 的候选股与详情、`StockDetail` 里 `score/scoreDelta/signals/signalCount/drawdownFromHigh/risks` 全是写死值。
2. 前端 `FilterPanel` 的 `FilterState` 字段（`priceFromHigh`/`sectorThreshold`/`keywords`/`pool`/`industry` 等）与后端 `presets.py` 实际声明的参数（`netProfitYoY`/`revenueYoY`/`drawdownMin`/`keywordWindow`）严重不一致——多数滑块调整对筛选结果**没有任何影响**。
3. 即使是同名参数（如 `netProfitYoY`），后端的过滤阈值也大多硬编码在 `app/signals.py` 的函数默认值里，`params` 实际只用到了 `keywordWindow`。
4. 没有行业维度数据，"行业过滤"是 5 个硬编码选项，后端不读取。
5. 净利润/营收图表的"单季度/累计"切换是装饰性的，两个 tab 数据相同；后端已有 `compute_single_quarter_series`（差分算法）但未被调用。
6. 两个策略目前共用同一套筛选项和展示面板，但实际上参数和"卖点"并不相同。
7. 筛选结果不落库，刷新页面即丢失，必须重新点击"运行筛选"。

## 目标

1. `FilterPanel` 改为按后端 `preset.params` 动态渲染——**有什么参数就渲染什么**，不再维护一份可能不一致的前端默认值集合。
2. 两个策略的筛选参数、过滤阈值真正在后端生效；新增按行业过滤。
3. 新增申万行业维度表（一级+二级），支撑行业过滤下拉。
4. 筛选结果（按 score 排序）按策略分别落库，"上次结果"持久化，打开页面即可看到。
5. 两个策略的筛选项与结果展示面板按各自特点差异化。
6. 筛选项移入左侧抽屉，结果列表固定高度展示。
7. 单季度/累计图表真正生效。
8. 清理所有失效的 mock/占位数据。

## 范围之外（本次不做）

- 申万行业指数独立过滤开关（用户明确表示先不做；行业指数仍仅用于 `industryNewHigh`/风险信号）。
- 申万三级行业（只做一级+二级两层）。
- 基本面"全市场浏览"模式——基本面页面只展示筛选结果，不提供类似技术面 `dataSource: 'market'` 的全市场列表。
- 按日期的历史筛选快照（`/screen/history` 系列）——那是技术面专属机制，基本面结果独立存入 `FundamentalCandidate` 行表，每次运行覆盖该 preset 旧结果。
- 服务端分页/虚拟滚动——筛选结果是"通过严格条件的候选股"，数量可控，固定高度容器内原生滚动即可；若未来结果量显著增大可再迭代。

---

## 一、数据模型变更

### 1.1 新增 `Industry` 行业维度表

```python
class Industry(Base):
    __tablename__ = "industries"

    code: Mapped[str] = mapped_column(String, primary_key=True)
    name: Mapped[str] = mapped_column(String)
    level: Mapped[int] = mapped_column(Integer)  # 1 = 一级行业, 2 = 二级行业
    parent_name: Mapped[Optional[str]] = mapped_column(String, nullable=True)  # 二级行业对应的一级行业名称
```

数据来源：
- 一级行业：`ak.sw_index_first_info()`（新封装 `get_sw_industries_first()`）
- 二级行业：现有 `get_sw_industries()`（`ak.sw_index_second_info()`），该接口返回的 DataFrame 本身带"上级行业"列，扩展现有函数把它一并返回为 `parent_name`

### 1.2 `Candidate` / `_candidate()` 扩展字段

`app/fundamental_screen.py::_candidate()` 输出新增两个字段：

- `risks: RiskItem[]`——从 `build_fundamental_rows` 已计算的布尔信号映射：

  ```python
  [
      {"label": "业绩持续下滑", "ok": not row.get("risk_profit_decline")},
      {"label": "股价创历史新低", "ok": not row.get("risk_price_new_low")},
      {"label": "行业景气下行", "ok": not row.get("risk_industry_down")},
  ]
  ```

- `drawdownFromHigh: float`——`(max(closes) - 最新close) / max(closes)`，需要在 `build_fundamental_rows` 构造 `row` 时一并算出存入 `row["drawdown_from_high"]`（`closes` 已是局部变量，顺手算）。

前端 `Candidate` 接口同步新增 `risks: RiskItem[]` 和 `drawdownFromHigh: number`（`RiskItem` 类型已存在，复用）。

### 1.3 新增 `FundamentalCandidate` 独立结果表

`ScreenSnapshot` 以 JSON blob 存储全量结果，不适合后续 Agent 对单只股票做字段扩展（更新一条记录需整体序列化/反序列化）。因此基本面筛选结果独立建行表：

```python
class FundamentalCandidate(Base):
    __tablename__ = "fundamental_candidates"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    preset_id: Mapped[str] = mapped_column(String, index=True)  # super-growth / oversold-bluechip
    code: Mapped[str] = mapped_column(String, index=True)
    name: Mapped[str] = mapped_column(String)
    industry: Mapped[str] = mapped_column(String, default="")
    score: Mapped[float] = mapped_column(Float)
    signals: Mapped[str] = mapped_column(String)           # JSON array of SignalKey
    extra_signals: Mapped[int] = mapped_column(Integer, default=0)
    net_profit_yoy: Mapped[float] = mapped_column(Float)
    revenue_yoy: Mapped[float] = mapped_column(Float)
    drawdown_from_high: Mapped[float] = mapped_column(Float)
    risks: Mapped[str] = mapped_column(String)              # JSON array of RiskItem
    params_json: Mapped[str] = mapped_column(String)        # 本次筛选使用的参数
    rank: Mapped[int] = mapped_column(Integer)              # 排名（按 score 降序，1-based）
    updated_at: Mapped[str] = mapped_column(String)
```

每次"运行筛选"：
1. 计算完成、按 score 降序排序后，`DELETE FROM fundamental_candidates WHERE preset_id = ?` 清空该策略旧结果
2. 逐行 `INSERT` 新结果（`rank` = 行号 1-based）
3. `updated_at` 统一为当前时间

打开页面/切换策略：直接 `SELECT * FROM fundamental_candidates WHERE preset_id = ? ORDER BY rank`，若结果非空则直接返回（不重新计算），`MAX(updated_at)` 作为"上次筛选时间"展示。

不使用 `/screen/history` / `/screen/history/{date}`（继续只服务技术面）。

### 1.4 新增 `IndexConstituent` 宽基指数成分股表

指数成分股**不参与筛选打分**，仅作为结果列表上的二次过滤维度（用户跑完筛选后，在结果列表上按"沪深300/中证500/..."过滤子集）。

```python
class IndexConstituent(Base):
    __tablename__ = "index_constituents"

    index_code: Mapped[str] = mapped_column(String, primary_key=True)   # 000300, 000905, ...
    stock_code: Mapped[str] = mapped_column(String, primary_key=True)   # 带市场前缀
    index_name: Mapped[str] = mapped_column(String)                     # 沪深300, 中证500, ...
```

数据来源：`ak.index_stock_cons_csindex(symbol)`（中证指数官网），支持沪深300/中证500/中证1000/中证2000/科创50 等中证系宽基。

刷新：在 `run_fundamental_refresh` 里新增一个步骤，遍历目标指数列表，每次全量 upsert（`DELETE WHERE index_code = ?` → `INSERT` 新成分股），确保成分股调仓后数据更新。

前端使用：`/meta` 或独立接口返回可用指数列表（`index_code + index_name`）；选中某指数后，前端对已加载的结果 `items` 做客户端过滤（`stock_code in index_constituents[selectedIndex]`），**不重新请求后端**。

---

## 二、后端改动

### 2.1 行业数据刷新（一级+二级）

`app/data/fetch_fundamental.py`：
- `get_sw_industries()` 扩展：返回值增加 `parent_name`（取自 `sw_index_second_info()` 的"上级行业"列）。
- 新增 `get_sw_industries_first() -> list[dict]`：调用 `ak.sw_index_first_info()`，返回 `[{"code", "name"}]`。

`app/refresh.py::_refresh_industry_index`：在原循环之前，先把一级行业（`level=1, parent_name=None`）和二级行业（`level=2, parent_name=...`）upsert 写入 `Industry` 表（按 `code` 主键更新或插入）。其余逐行业抓取 `IndustryIndex` 历史 + 写 `Stock.industry` 的逻辑不变。

### 2.2 两策略最终参数表

| 字段 | super-growth | oversold-bluechip | 接入点 |
|---|---|---|---|
| `netProfitYoY` | 净利润同比下限（默认 50） | 净利润同比下限（默认 0） | `high_growth(threshold=...)` / `low_position_oversold(yoy_threshold=...)` |
| `revenueYoY` | 营收同比下限（默认 20），**新增为真实过滤条件** | — | `run_fundamental_screen_from_rows` 过滤条件 |
| `drawdownMin` | — | 距一年高回撤下限（默认 35） | `low_position_oversold(drawdown_threshold=.../100)` |
| `keywordWindow` | 研报关键词时间窗（默认 90，现状已生效） | 同左 | `has_research_keyword(window_days=...)` |
| `industry` | 行业过滤（新增，默认"全部"） | 同左 | `build_fundamental_rows` 按 `stock.industry` 过滤 |

`app/presets.py` 的 `_FUNDAMENTAL_PRESETS` 按上表调整两个策略的 `params` 列表。

`PresetParam` 类型扩展（兼容技术面现有数据，新增字段均可选）：

```typescript
export interface PresetParam {
  key: string
  label: string
  type?: 'number' | 'select'   // 缺省 'number'
  value: number | string
  min?: number
  max?: number
  step?: number
  unit?: string
  options?: { value: string; label: string; group?: string }[]  // type === 'select' 时使用
}
```

`industry` 参数声明为 `type: "select"`，`value: ""`（空字符串 = 全部行业）。其 `options` 在 `/presets` 响应时运行时填充：查询 `Industry`（`level=2`），`group` 字段填二级行业的 `parent_name`（一级行业名），前端据此做一级分组展示；并在最前面补一项 `{value: "", label: "全部行业"}`。

### 2.3 阈值参数接入计算

`app/signals.py` 函数签名调整（均已有默认值形参，补充阈值即可）：

```python
def low_position_oversold(closes, current_yoy, drawdown_threshold: float = 0.35, yoy_threshold: float = 0.0) -> bool:
    if not closes or current_yoy is None or current_yoy <= yoy_threshold:
        return False
    ...
```

`app/fundamental_rows.py` 调用处改为从 `params` 读取（注意单位：`presets.py` 里的百分数 vs 函数内部的小数）：

```python
"high_growth": high_growth(financial.net_profit_yoy, threshold=params.get("netProfitYoY", 50)),
...
"oversold": low_position_oversold(
    closes, financial.net_profit_yoy,
    drawdown_threshold=params.get("drawdownMin", 35) / 100,
    yoy_threshold=params.get("netProfitYoY", 0),
),
```

`run_fundamental_screen_from_rows` 的 `super-growth` 分支新增营收同比过滤：

```python
if preset_id == "super-growth":
    if not (
        row.get("high_growth") and row.get("price_new_high") and row.get("research_signals")
        and (row.get("revenueYoY") or 0) > params.get("revenueYoY", 20)
    ):
        continue
```

### 2.4 行业过滤

`build_fundamental_rows` 在构造完 `rows` 列表、计算 `sector_effect`/`alpha` 之前，按 `params.get("industry")` 过滤：

```python
if params.get("industry"):
    rows = [r for r in rows if r["industry"] == params["industry"]]
```

（放在 `sector_effect`/`alpha` 计算之前结果一致，且减少无关行业的计算量。）

### 2.5 新增信号：`oversold`（低位超跌）

当前 `oversold-bluechip` 的核心入选条件 `oversold`（回撤超过阈值且净利同比转正）完全不在 `SignalKey`/`signals[]` 里，导致该策略候选股的"命中信号"列可能是空的。

- `frontend/src/types.ts`：`SignalKey` 新增 `'oversold' // 低位超跌`
- `app/fundamental_screen.py::_display_signals` 新增：

  ```python
  if row.get("oversold"):
      signals.append("oversold")
  ```

- `WEIGHTS["oversold"] = 15`（介于 `beatExpect`(16) 和 `sectorEffect`(12) 之间）

### 2.6 新增基本面专属结果接口（独立于技术面 `/screen/result`）

`app/screen.py` 新增：

```python
def run_fundamental_screen_result(preset_id: str, params: dict | None) -> dict:
    if preset_id not in FUNDAMENTAL_PRESETS:
        raise KeyError(f"未知基本面预设: {preset_id}")

    if params is None:
        # 读上次结果
        with SessionLocal() as s:
            rows = (s.query(FundamentalCandidate)
                    .filter_by(preset_id=preset_id)
                    .order_by(FundamentalCandidate.rank)
                    .all())
        items = [_candidate_to_dict(r) for r in rows]
        updated_at = max((r.updated_at for r in rows), default=None)
    else:
        # 运行筛选 + 写结果表
        candidates = run_fundamental_screen(preset_id, params)  # 内部已按 score 降序排序
        params_json = json.dumps(params, sort_keys=True)
        now = datetime.now().isoformat()
        with SessionLocal() as s:
            s.query(FundamentalCandidate).filter_by(preset_id=preset_id).delete()
            for i, c in enumerate(candidates):
                s.add(FundamentalCandidate(
                    preset_id=preset_id, code=c["code"], name=c["name"],
                    industry=c["industry"], score=c["score"],
                    signals=json.dumps(c["signals"]), extra_signals=c["extraSignals"],
                    net_profit_yoy=c["netProfitYoY"], revenue_yoy=c["revenueYoY"],
                    drawdown_from_high=c.get("drawdownFromHigh", 0),
                    risks=json.dumps(c.get("risks", [])),
                    params_json=params_json, rank=i + 1, updated_at=now,
                ))
            s.commit()
        items = candidates
        updated_at = now

    return {"items": items, "total": len(items), "updatedAt": updated_at}
```

`app/main.py` 新增路由：

```python
@app.get("/screen/fundamental/result")
def fundamental_screen_result(preset: str, params: str = Query(default=None)):
    try:
        parsed = json.loads(params) if params else None
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="params 不是合法 JSON")
    try:
        return run_fundamental_screen_result(preset, parsed)
    except KeyError as e:
        raise HTTPException(status_code=400, detail=str(e))
```

前端新增类型与 API：

```typescript
export interface FundamentalScreenResultResponse {
  items: Candidate[]
  total: number
  updatedAt: string | null
}

// api.ts
screenFundamentalResult: (preset: string, params?: Record<string, number | string>) => {
  const qs = new URLSearchParams()
  qs.set('preset', preset)
  if (params) qs.set('params', JSON.stringify(params))
  return get<FundamentalScreenResultResponse>(`/screen/fundamental/result?${qs.toString()}`)
}
```

旧的 `GET /screen?preset=super-growth...`（`api.screenFundamental`）保留不动（向后兼容），前端基本面页面改用新接口。

### 2.7 单季度/累计财务数据

`app/stock_detail.py::get_stock_detail` 调用已有的 `app.signals.compute_single_quarter_series`：

```python
report_dates = [row.report_date for row in financials]
net_profit_q = compute_single_quarter_series(report_dates, [row.net_profit for row in financials])
revenue_q = compute_single_quarter_series(report_dates, [row.revenue for row in financials])

"quarters": [
    {
        "quarter": _quarter(row.report_date),
        "netProfit": (row.net_profit or 0) / 1e8,
        "revenue": (row.revenue or 0) / 1e8,
        "netProfitQuarterly": (net_profit_q[i] / 1e8) if net_profit_q[i] is not None else None,
        "revenueQuarterly": (revenue_q[i] / 1e8) if revenue_q[i] is not None else None,
    }
    for i, row in enumerate(financials)
],
```

`QuarterPoint` 类型同步新增 `netProfitQuarterly: number | null` / `revenueQuarterly: number | null`。

### 2.8 `StockDetail` 占位字段清理

`StockDetail` 类型与 `get_stock_detail()` **移除** `score`、`scoreDelta`、`signals`、`signalCount`、`drawdownFromHigh`、`risks` 六个字段——它们本质是"基本面筛选打分"的产物，不属于通用的"单只股票详情"接口（该接口也会被技术面查看 K 线复用，那种场景没有基本面 score 的概念）。这些数据改由前端从筛选结果里的 `Candidate` 对象提供（见 3.4）。`scoreDelta`（环比）因为不再有"全市场历史快照"也没有合理数据来源，一并移除。

---

## 三、前端改动

### 3.1 `FilterPanel` 动态化 + 左侧抽屉

参照 `TechnicalScreenView` + `TechnicalFilterCard` 的现成模式：

- 抽屉：`absolute left-0 top-0 z-30 ... w-[180px] ...`，点击外部关闭（`mousedown` 监听），通过 `useImperativeHandle` 暴露 `toggleFilter`。
- 筛选卡片按 `preset.params` 动态渲染：
  - `type` 缺省/`'number'` → 滑块（沿用 `TechnicalFilterCard` 的样式）
  - `type === 'select'` → 下拉框，`options` 按 `group`（一级行业）分组渲染（用于 `industry`）
- `paramValues: Record<string, number | string>`，切换 preset 时重置为 `Object.fromEntries(preset.params.map(p => [p.key, p.value]))`
- "运行筛选" → `api.screenFundamentalResult(strategy, paramValues)`，成功后 `setFilterOpen(false)`
- 进入页面/切换 preset 时，先调用 `api.screenFundamentalResult(strategy)`（不带 `params`）尝试加载"上次结果"

去掉的旧字段（不在 `preset.params` 里）：`priceFromHigh`、`sectorThreshold`、`keywords`、`pool`。

### 3.2 结果列表组件（独立于 `StockListCard`）

新建一个固定高度、内部滚动的列表卡片（命名如 `CandidateListCard`），结构上参考 `StockListCard` 的"卡片+滚动区"布局，但**不复用其分页/全市场/历史快照逻辑**（方案B：基本面没有全市场模式，结果集一次性返回）：

- 顶部工具栏：
  - "上次筛选时间"（`updatedAt`，无则提示"尚未运行筛选，点击左侧筛选后运行"）+ 结果总数
  - **名称搜索**（文本框实时过滤，客户端 `items.filter(i => i.name.includes(q))`）
  - **宽基指数过滤**下拉框（选项来自 `/meta` 或独立接口返回的指数列表 `{index_code, index_name}`）：选中某指数后，客户端将 `items` 与 `IndexConstituent` 的股票集合取交集，选择"全部"时不过滤。该组件与筛选抽屉**无关**——指数过滤是结果列表自己的二次过滤，不影响 `run_fundamental_screen` 的入参。
  - 排序下拉：对已过滤的 `items` 做**客户端排序**（按 `score`/`netProfitYoY`/`revenueYoY`）
- 列表区域固定高度、`overflow-y-auto`，不做服务端分页
- 点击行 → 选中股票，联动右侧 `StockDetailPanel`

### 3.3 两策略差异化结果列

共用列：代码 / 名称 / 行业 / 综合得分 / 命中信号（`signals[]` + `extraSignals`）/ 净利润同比 / 营收同比

`oversold-bluechip` 额外列：**距一年高点回撤**（`drawdownFromHigh`）——`super-growth` 不展示（候选股本身贴近年内高点，该值常年接近 0，无信息量）。

### 3.4 `StockDetailPanel` 打通

选中候选股时，组件接收两部分数据并合并展示：

1. 当前选中的 `Candidate` 对象（来自结果列表，已在内存中）：提供 `score`、`signals`、`extraSignals`、`risks`、`drawdownFromHigh`、`netProfitYoY`、`revenueYoY`
2. `api.stockDetail(code)`（`/stock/{code}`）：提供 `price`、`yearHigh`/`yearHighDate`、`quarters`、`klineDay/Week/Month/Quarter`、`reports`、`latestNote`

`StockDetailPanel` 新增一个可选 prop（如 `candidate?: Candidate`），基本面场景传入并渲染"综合得分/命中信号/风险检查清单"等区块；其他场景（若有）不传则不渲染这些区块。`signalCount` 直接由前端 `signals.length + extraSignals` 计算，不需要后端字段。

### 3.5 净利润营收图表单季度/累计

`ProfitRevenueChart.tsx`：
- `mode` 状态语义改为 `'quarterly' | 'cumulative'`
- `mode === 'quarterly'` 时 series 使用 `netProfitQuarterly`/`revenueQuarterly`（首个数据点可能为 `null`，图表按现有 echarts 配置对 `null` 的处理——断点不连线）
- `mode === 'cumulative'` 时 series 使用现有 `netProfit`/`revenue`
- 标题去掉硬编码的"（单季度）"后缀，根据 `mode` 动态显示"单季度"/"累计"

---

## 四、Mock 数据清理清单

| 项 | 处理 |
|---|---|
| `frontend/src/data/signals.ts` 的 `KEYWORDS` | 删除——FilterPanel 不再有"研报关键词多选"，命中的关键词信号已体现在 `signals[]`（`orderFull`/`capexExpand`/`newProduct`/`domesticSub`/`industryRecover`/`valuationRepair`） |
| `frontend/src/data/mock.ts` `CANDIDATES`/`STOCK_DETAIL` | 保留作网络异常兜底，但需同步更新结构以匹配新的 `Candidate`/`StockDetail` 类型（新增/删除的字段） |
| `FilterPanel` 硬编码 `POOLS`（全部A股/沪深300...） | 删除（不在 `preset.params` 内） |
| `FilterPanel` 硬编码"行业过滤"5 选项 | 替换为 `industry` 参数的 `options`（来自 `Industry` 表，按一级行业分组） |
| `FilterPanel` `sectorThreshold`/`keywords`/`priceFromHigh` | 删除 |
| `CandidateResults` 排序 `<Select>`（未绑定） | 改为真实客户端排序（见 3.2） |
| `CandidateResults` 静态"暂无更多数据" | 改为"上次筛选时间 + 总数"展示，结果为空时引导"运行筛选" |
| `StockDetail.score/scoreDelta/signals/signalCount/drawdownFromHigh/risks` 占位 | 从类型与 `get_stock_detail()` 移除（见 2.8），由 `StockDetailPanel` 的 `candidate` prop 提供（见 3.4） |
| `ProfitRevenueChart` 标题硬编码"（单季度）" | 改为按 `mode` 动态显示（见 3.5） |

---

## 五、影响文件清单

后端：
- `app/models.py`（新增 `Industry`、`FundamentalCandidate`、`IndexConstituent`）
- `app/data/fetch_fundamental.py`（一级行业 + 二级行业 `parent_name`；新增宽基指数成分股抓取）
- `app/refresh.py`（`_refresh_industry_index` 写 `Industry` 表；新增宽基指数成分股刷新步骤）
- `app/presets.py`（两策略 `params` 调整、`industry` 参数动态 `options`）
- `app/signals.py`（`low_position_oversold` 新增 `yoy_threshold`）
- `app/fundamental_rows.py`（阈值参数接入、行业过滤、`drawdown_from_high`）
- `app/fundamental_screen.py`（`_candidate` 新增 `risks`/`drawdownFromHigh`，`_display_signals` 新增 `oversold`，`WEIGHTS` 新增 `oversold`，`revenueYoY` 过滤条件）
- `app/screen.py`（`run_fundamental_screen_result` 读写 `FundamentalCandidate` 表）
- `app/main.py`（新增 `/screen/fundamental/result`；新增或扩展 `/meta` 返回宽基指数列表）
- `app/stock_detail.py`（单季度序列、移除占位字段）

前端：
- `src/types.ts`（`PresetParam`/`Candidate`/`QuarterPoint`/`StockDetail`/`SignalKey` 调整）
- `src/lib/api.ts`（新增 `screenFundamentalResult`）
- `src/components/screener/FilterPanel.tsx`（动态渲染 + 抽屉）
- `src/components/screener/CandidateResults.tsx` → 新结果列表组件
- `src/components/detail/StockDetailPanel.tsx`（接入 `candidate` prop）
- `src/components/detail/ProfitRevenueChart.tsx`（单季度/累计切换）
- `src/data/signals.ts`、`src/data/mock.ts`（清理/同步）
- `src/App.tsx`（基本面页面整体布局：抽屉 + 结果列表 + 详情区）
