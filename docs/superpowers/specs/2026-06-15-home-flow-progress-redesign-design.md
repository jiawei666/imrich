# 首页「数据工厂」流动进度可视化重新设计

## 背景

当前 `HomePage.tsx`（详见 [[2026-06-15-home-refresh-dashboard-design]]）用"总览卡片 + 两组任务网格（`TaskCard` × 7）"展示 7 个数据刷新任务的状态，每个任务一张常驻卡片，底部还有"温馨提示"文案。

用户提供了新的视觉参考图 `frontend/public/index.png`，希望首页改为"整体进度 + 一条带流动动画的任务节点曲线"的布局，并对详情展示方式提出了明确调整：

1. 任务详情不需要重新设计内容，只需要重新封装成**一个可复用组件**。
2. 鼠标 hover 到曲线上的某个节点时，自动弹出该任务的详情组件。
3. 页面整体只保留"整体进度"区域和"任务节点曲线"，移除底部常驻的任务详情网格和提示文案。
4. 任务节点曲线需要做出"流动"的动态效果。

## 目标

- 重做 `HomePage.tsx` 的 `<main>` 内容：标题行 + 一张"整体进度卡片"（百分比/已完成数/预计完成时间/整体进度条 + 任务节点曲线）。
- 新增 `RefreshFlowCurve` 组件：渲染 7 个任务节点的横向曲线，节点状态着色，带常驻流动动画。
- 新增 `RefreshTaskDetail` 组件：hover 节点时展示的详情卡片，内容来自现有 `TaskCard`，并保留单任务"刷新/重新执行/立即执行"操作。
- 移除：`TaskCard`、`DOMAINS` 分组网格渲染、"数据更新中心"总览大卡片、底部提示文案。
- 数据获取、SSE 订阅、`meta` 拉取、`TASKS` 配置数组、`isStepDone` 判定逻辑全部保留，只是渲染方式改变；新增"整体百分比/已完成数/预计完成时间"的计算逻辑。

## 一、整体布局

```
<PageHeader />                                     ← 不变，仅 logo 条

<main>
  数据工厂                                [⟲ 一键更新全部]
  实时掌握数据更新进度，确保选股引擎高效运行

  ┌─ 整体进度卡片 ──────────────────────────────────┐
  │ 整体进度                            预计完成时间   │
  │ 71%   5/7 完成                       14:32:08    │
  │ ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓░░░░░░░░░░░░░░░░░░░░░░░░░░   │ ← 整体进度条
  │                                                  │
  │  ●──●──●──◉──○──○──○      RefreshFlowCurve      │
  │ 股票 K线 财报 预告 行业 研报元 研报PDF             │
  │ 已完成 已完成 已完成 运行中45% 等待 等待 等待       │
  └──────────────────────────────────────────────-─┘
</main>
```

- 标题行右侧的"一键更新全部"按钮复用现有 `handleRefreshAll` / `allRunning` 禁用与 `title` 提示逻辑。
- 整张"整体进度卡片"是页面唯一保留的卡片；其余内容（旧的"数据更新中心"大卡片、"在库股票数"展示、两组任务网格、底部"最后更新"与"温馨提示"）全部移除。

## 二、整体进度区计算逻辑

新增三个派生值，放在 `HomePage.tsx`（或新建的辅助模块，见第六节）：

### 1. 已完成数 / 总数

```ts
const doneCount = TASKS.filter(t => status && isStepDone(t.step(status))).length
// 展示为 `${doneCount}/7 完成`
```

### 2. 整体百分比

每个任务的"有效进度"：已完成记 100，运行中记 `step.progress`，其余（等待执行/失败）记 0。整体百分比 = 7 个有效进度的平均值，四舍五入：

```ts
const effective = (step: RefreshStep) =>
  isStepDone(step) ? 100 : step.status === 'running' ? step.progress : 0

const overallPct = status
  ? Math.round(TASKS.reduce((sum, t) => sum + effective(t.step(status)), 0) / TASKS.length)
  : 0
```

### 3. 预计完成时间（前端估算）

- 取 `status` 中所有 `step.status === 'running'` 且 `step.progress > 0` 的任务。
- 对每个这样的任务，估算其总耗时 = `elapsedSeconds / (progress / 100)`，剩余时间 = `总耗时 - elapsedSeconds`。
  - `elapsed` 字段格式固定为 `MM:SS`（见 `backend/app/refresh.py` 的 `_fmt`），解析为秒：`mm * 60 + ss`。
- 整体剩余时间 = 上述剩余时间中的**最大值**（"一键更新全部"按依赖图分阶段并发执行，多个任务可能同时 running，整体完成时间取决于最慢的那个）。
- 预计完成时间 = `当前时间 + 整体剩余时间`，格式化为 `HH:MM:SS`（24 小时制）。
- **边界情况**：
  - 没有任何 `running` 且 `progress > 0` 的任务（包括全部 idle/done，或刚开始 progress 还是 0）→ 显示 `--`。
  - `status?.all.status === 'error'` → 该位置改为展示错误信息（复用现有 `status.all.error ?? '更新失败'` 文案），样式同现有 `text-down`。
- **已知局限**（写明以避免后续产生歧义）：仅基于"当前正在跑的任务"估算，不预测尚未开始的后续阶段耗时；随着"一键更新全部"进入下一阶段，预计完成时间会重新计算并可能变化。这是"前端自动估算"在没有历史耗时数据支撑下的合理近似，不追求精确。

## 三、RefreshFlowCurve 组件

新建 `frontend/src/components/home/RefreshFlowCurve.tsx`。

### Props

```ts
interface RefreshFlowCurveProps {
  status: RefreshStatus | undefined
  meta: MetaResponse | undefined
  allRunning: boolean
  onRefresh: (key: string) => void
}
```

内部按 `TASKS` 数组顺序（股票列表 → K线数据 → 财报数据 → 业绩预告快报 → 行业与指数数据 → 研报元数据 → 研报PDF解析）渲染 7 个节点，这个顺序已经满足现有依赖关系（`dependsOn`）。

### 节点状态与样式

| 状态 | 判定 | 节点样式 | 节点下方文案（复用 `StatusBadge` 文案逻辑） |
|---|---|---|---|
| 已完成 | `isStepDone(step)` | 深蓝（`--color-ink`）实心圆 + 白色 `Check` 图标 | "已完成" |
| 运行中 | `step.status === 'running'` | 品牌红（`--color-brand`）空心圆环，尺寸略大，常驻柔和脉冲动画 | "运行中 {progress}%" |
| 失败 | `step.status === 'error'` | 品牌红实心圆 + 白色 `AlertCircle` 图标（静态，不带脉冲，与"运行中"区分） | "失败"（hover 时在详情组件里看具体 error） |
| 等待执行 | 其余情况（含被依赖阻塞） | 灰色（`--color-line` 描边）空心小圆 | "等待执行" |

> 等待执行的任务是否被依赖阻塞，节点本身不做区分（避免引入第 5 种视觉状态），阻塞信息放在 hover 详情组件里展示。

### 连接线

7 个节点用直线等距连接（`节点` 之间的"曲线感"主要来自配色渐变与流动动画，而非几何弯曲，以保证响应式宽度下节点与下方文案对齐简单可靠）。每段连接线（节点 i 与节点 i+1 之间）按两端节点状态独立判色：

- 若任一端节点是"运行中"或"失败" → 该段为品牌红
- 否则若两端节点都是"已完成" → 该段为深蓝
- 否则 → 灰色虚线（等待执行段）

这条规则在"一键更新全部"并发执行（多个任务同时 running，且在 `TASKS` 顺序中不连续）时仍能正确高亮所有与"活跃任务"相邻的连线段。

### 流动动画

整条路径常驻播放流动效果，不依赖是否有任务在跑（让首页常态下也有"活的系统"感）。采用两层叠加，均为纯 CSS/SVG，无新增依赖：

1. **流动虚线**：路径 `stroke-dasharray` + CSS `@keyframes` 持续平移 `stroke-dashoffset`，产生虚线向右连续流动的纹理。`@keyframes` 定义在 `frontend/src/index.css`。
2. **跑动光点**：在路径上叠加 1～2 个小圆点，用 SVG `<animateMotion>` 沿路径循环移动，模拟"数据包"穿行；品牌红色的活跃段可以让光点更亮/更快，做轻微强调。

## 四、RefreshTaskDetail 组件

新建 `frontend/src/components/home/RefreshTaskDetail.tsx`，内容沿用现有 `TaskCard` 的信息区（不重新设计字段），打包成 hover 弹出的详情卡片。

### Props

```ts
interface RefreshTaskDetailProps {
  config: RefreshTaskConfig
  step: RefreshStep
  meta: MetaResponse | undefined
  blockedDep: string | null   // 沿用 TaskCard 现有的依赖检查逻辑
  allRunning: boolean
  onRefresh: (key: string) => void
}
```

### 内容

- 标题行：任务名（`config.label`）+ `StatusBadge`
- 信息区（按状态展示，对应原 `TaskCard` 中的信息）：
  - **已完成**：完成时间（`config.updatedAt(meta)`）+ 已抓取条数（`step.done` 条，`step.done > 0` 时展示）
  - **运行中**：进度 `{step.progress}%` + 已耗时（`step.elapsed`）+ `{step.done}/{step.total}` 条（`step.total > 0` 时展示）
  - **等待执行**：若 `blockedDep` 非空，展示"需先完成：{blockedDep}"；否则展示"待执行"
  - **失败**：展示 `step.error`
- 操作按钮：复用现有 `TaskCard` 的 `disabled`/`title` 判定（`running || allRunning || !!blockedDep`），点击调用 `onRefresh(config.key)`：
  - 已完成 → "重新执行"
  - 等待执行 → "立即执行"
  - 运行中 → 按钮禁用，显示加载态（"执行中"）
  - 失败 → "重试"

### 交互与定位

- 用纯 CSS 实现 hover 显示，不引入额外的 JS 状态：每个节点外层包一层 `group relative`，详情卡片用 `absolute … opacity-0 invisible group-hover:opacity-100 group-hover:visible` 定位在节点正上方。
- 详情卡片默认水平居中对齐节点（`left-1/2 -translate-x-1/2`）；对第一个/最后一个节点做边缘对齐（避免溢出容器），通过传入节点 `index` 与总数 `7` 判断首尾，调整 `left`/`right` 与 `translate-x`。

## 五、移除内容汇总

- `TaskCard` 组件及其渲染（被 `RefreshFlowCurve` 节点 + `RefreshTaskDetail` 取代）
- `DOMAINS` 分组数组与两组任务网格渲染
- "数据更新中心"总览大卡片（含"全部更新中/上次一键更新于/在库股票数"展示）——其中"全部更新中"/错误文案迁移到新整体进度卡片的"预计完成时间"位置（见第二节边界情况），"在库股票数"不再展示
- 底部"最后更新"时间戳 + "温馨提示"文案

数据获取、SSE 订阅（`prevStatusRef` / `reloadMeta` 模式）、`api.meta()` 拉取、`TASKS` 配置数组、`isStepDone` 判定逻辑全部保留。

## 六、文件改动清单

- **新增** `frontend/src/components/home/RefreshFlowCurve.tsx`
- **新增** `frontend/src/components/home/RefreshTaskDetail.tsx`
- **新增** `frontend/src/components/home/refreshStatus.tsx`：从 `HomePage.tsx` 中抽出 `isStepDone`、`StatusBadge`（返回 JSX，故用 `.tsx`）、新增的 `computeOverallProgress`（返回 `doneCount`/`overallPct`）、`estimateEta`，供 `HomePage` / `RefreshFlowCurve` / `RefreshTaskDetail` 共用。
- **修改** `frontend/src/pages/HomePage.tsx`：
  - 保留 `TASKS`、`useEffect` 数据获取与 SSE 订阅逻辑。
  - `<main>` 重写为"标题行 + 整体进度卡片（统计区 + `RefreshFlowCurve`）"。
  - 删除 `TaskCard`、`StatusBadge`（移到 `refreshStatus.ts`）、`DOMAINS`、旧总览卡片与底部提示的 JSX。
- **修改** `frontend/src/index.css`：新增流动虚线动画所需的 `@keyframes`（如 `flow-dash`）。

## 验证方式

- `npm run lint` / `npm run build`（`tsc -b` 类型检查 + vite build）。
- 启动 `npm run dev`，在浏览器中验证：
  - 整体百分比、`X/7 完成`、整体进度条与实际 `status`/`meta` 数据一致。
  - 7 个节点按 `TASKS` 顺序排列，4 种状态（已完成/运行中/失败/等待执行）配色与文案正确——若当前后端数据全是"已完成"，需要临时构造/篡改一份 `RefreshStatus`（例如在浏览器里通过修改 SSE 返回或本地 mock）以覆盖"运行中"/"失败"/"等待执行"三种状态的视觉与 hover 详情。
  - hover 任一节点弹出 `RefreshTaskDetail`，内容与按钮可用性符合状态；首尾节点的详情卡片不溢出容器。
  - 流动虚线 + 跑动光点动画常驻播放，不卡顿。
  - 点击"一键更新全部"与详情卡片里的"刷新/立即执行"按钮，行为与现有 `handleRefresh`/`handleRefreshAll` 一致（409 静默处理等）。
