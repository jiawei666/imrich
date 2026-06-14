# 低位错杀蓝筹策略简化 + A/B 场景区分 + 抽屉 bug 修复

> 日期: 2026-06-14
> 状态: 已确认，待实施

## 背景与目标

`oversold-bluechip` 策略当前暴露给 UI 的参数过多（9 个），其中蓝筹判定依赖「市值 + 连续盈利 + 毛利率」三条件，调节负担重且与「蓝筹」语义不够直接。本次改造：

1. 蓝筹判定改为「是否在宽基指数成分股内」，删除 3 个冗余参数。
2. 错杀场景 A/B 在前端可区分（当前看不出区别）。
3. 重构筛选抽屉为「遮罩式」关闭模型，简化实现并顺便修复点击行业下拉项误关抽屉的 bug。

## Part 1 — 蓝筹判定改为指数成分股

### 定义

蓝筹 = 股票在以下任一宽基指数成分股内：

| 指数 | index_code |
|------|-----------|
| 上证50 | 000016 |
| 沪深300 | 000300 |
| 中证500 | 000905 |

明确**排除**：科创50（000688，成长/科技）、中证1000（000852，小盘股，1001~2000 位）。
中证1000/科创50 仍由 `refresh` 抓取入 `index_constituents`（供前端指数过滤等使用），仅不计入蓝筹判定。

### 代码改动

**`app/signals.py`**
- `is_bluechip` 改签名为 `is_bluechip(code: str, bluechip_codes: set[str]) -> bool`，函数体为 `return code in bluechip_codes`。
- 删除原市值 / 连续盈利季度 / 毛利率（含金融豁免）逻辑。
- 新增模块常量 `BLUECHIP_INDEX_CODES = {"000016", "000300", "000905"}`。

**`app/fundamental_rows.py`**
- `build_fundamental_rows` 中一次性查询 `IndexConstituent`，过滤 `index_code in BLUECHIP_INDEX_CODES`，构造 `bluechip_codes: set[str]`。
- 改调用为 `is_bc = is_bluechip(stock.code, bluechip_codes)`。
- 移除对 `report_history` / `stock.industry` / `params` 的市值相关传参依赖（这些字段其它逻辑仍在用，保留变量本身）。

**`app/presets.py`**
- `oversold-bluechip` 参数列表删除：`bluechipMarketCap`、`bluechipProfitQuarters`、`bluechipMinGrossMargin`。
- 保留 6 个参数：`drawdownMin`、`ttmYoyThreshold`、`deepDrawdown`、`deepTtmYoy`、`keywordWindow`、`industry`。

## Part 2 — A/B 场景区分

### 场景定义（不变，仅产出命中档位）

- **场景 A（普通超跌）**：回撤 ≥ `drawdownMin` 且 TTM 同比 > `ttmYoyThreshold`
- **场景 B（深度超跌）**：回撤 ≥ `deepDrawdown` 且 TTM 同比 > `deepTtmYoy` 且年报净利 > 0

B 优先判定（满足 B 即记 B，否则再判 A）。

### 后端

**`app/signals.py`**
- 新增 `oversold_scenario(closes, ttm_yoy, *, drawdown_min, ttm_threshold, deep_drawdown, deep_ttm_threshold, annual_net_profit) -> Optional[str]`，返回 `"A" | "B" | None`。
- `oversold_bluechip` 保留为 bool（实现可改为 `oversold_scenario(...) is not None`，避免逻辑重复），供评分与硬筛使用。

**`app/fundamental_rows.py`**
- 行数据新增 `oversold_scenario` 字段（调用 `oversold_scenario(...)`，入参与现有 `oversold_bluechip` 调用一致）。

**`app/fundamental_screen.py`**
- `_display_signals`：当 `row["oversold_scenario"] == "A"` 输出信号 `oversoldBluechipA`；`== "B"` 输出 `oversoldBluechipB`；不再直接输出 `oversoldBluechip`。
- `WEIGHTS`：保留 `oversoldBluechip` 权重含义，新增 `oversoldBluechipA` / `oversoldBluechipB` 同等权重（沿用 20），或在打分前把两者归一到原权重。硬筛 `if not row.get("oversold_bluechip")` 不变。

### 前端

**`src/data/signals.ts`**
- 移除/替换 `oversoldBluechip`，新增：
  - `oversoldBluechipA`: `{ label: '错杀·普通超跌', tone: 'neutral' }`
  - `oversoldBluechipB`: `{ label: '错杀·深度超跌', tone: 'ink' }`（更醒目）

**`src/types.ts`**
- `SignalKey` 联合类型用 `oversoldBluechipA` / `oversoldBluechipB` 替换 `oversoldBluechip`。

候选列表「命中信号」列复用现有 `SignalBadgeList`，无需新增表格列。

## Part 3 — 抽屉重构为遮罩式

### 现状与问题

`src/components/ui/filter-drawer.tsx` 当前是**非模态**抽屉（`absolute` 浮在结果区左侧，无遮罩），靠挂在 `document` 上的 `mousedown` 监听 + `setTimeout(0)` 实现「点外面关闭」。问题：

- 实现复杂、有时序 hack。
- bug：行业下拉用 Radix `Popover`，内容渲染在 portal（不在 `drawerRef` 子树内），点击下拉项时 `e.target` 在 portal → 被判为「点抽屉外」→ 误关。`Select` 同为 portal，同样隐患。

### 重构方案（遮罩式）

`FilterDrawer` 改为渲染「遮罩 + 抽屉」两部分（共享组件，基本面与技术面两处一起生效）：

- **遮罩（scrim）**：抽屉打开时在其父容器内渲染 `absolute inset-0` 的半透明遮罩（如 `bg-ink/20`，带淡入淡出），z-index 低于抽屉（抽屉 `z-30`，遮罩 `z-20`）。点击遮罩 → `onClose()`。
- **关闭方式**：点遮罩、按 ESC、筛选按钮再次点击、运行筛选后自动关（现有 `runScreen`/技术面 apply 已 `setFilterOpen(false)`）。
- **删除** `document` 的 `mousedown` 监听与 `setTimeout`。改用 `keydown` 监听 ESC：`if (e.key === 'Escape' && !e.defaultPrevented) onClose()`（`defaultPrevented` 守卫避免与 Radix Popover 自身 ESC 关闭冲突导致双关）。
- bug 自然消失：遮罩是父容器内的真实元素，Radix 弹层 portal 渲染在 `body` 且 z-index 更高、位于遮罩之上，点击弹层项不会命中遮罩，不触发关闭。

遮罩锚定在抽屉父容器（`App.tsx` 的 `relative flex flex-1` 结果区 / `TechnicalScreenView` 的对应 `relative` 容器），因此遮罩只覆盖结果区，侧边栏与顶栏仍可见可用。

> 注：`IndustryCombobox` 的 Popover、参数 `Select` 无需改动，重构后均不再误关抽屉。

## 测试

- 后端：
  - `is_bluechip`：在/不在 `bluechip_codes` 集合的判定。
  - `oversold_scenario`：A、B、None 三种返回，含 B 优先、年报净利兜底。
  - `build_fundamental_rows` / `run_fundamental_screen`：构造含 `IndexConstituent` 的测试库，验证蓝筹股入选且 `oversold_scenario` 正确产出对应信号。
  - `presets`：`oversold-bluechip` 不再含被删的 3 个参数。
  - 检查并更新引用旧 `is_bluechip` 签名 / 旧参数的现有测试。
- 前端：`npm run build` 类型检查通过（`SignalKey` 改动牵连处）。

## 代码改动清单

- `app/signals.py`：`is_bluechip` 重写、新增 `BLUECHIP_INDEX_CODES`、新增 `oversold_scenario`、`oversold_bluechip` 复用。
- `app/fundamental_rows.py`：构造 `bluechip_codes`、改 `is_bluechip` 调用、新增 `oversold_scenario` 字段。
- `app/fundamental_screen.py`：`_display_signals` 输出 A/B 信号、`WEIGHTS` 增项。
- `app/presets.py`：删 3 个参数。
- `src/data/signals.ts`、`src/types.ts`：A/B 信号标签。
- `src/components/ui/filter-drawer.tsx`：重构为遮罩式（scrim + ESC，移除 document 监听）。
</content>
</invoke>
