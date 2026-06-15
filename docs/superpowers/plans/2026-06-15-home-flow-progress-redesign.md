# 首页「数据工厂」流动进度可视化 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把首页 `HomePage` 从"总览卡片 + 两组任务网格"重做成"标题行 + 一张整体进度卡片（百分比/已完成数/预计完成时间/进度条 + 一条带流动动画的 7 任务节点曲线）"，hover 节点弹出任务详情。

**Architecture:** 抽出共享逻辑模块 `refreshStatus.tsx`（任务配置 `TASKS`、状态判定、整体进度与 ETA 计算、`StatusBadge`）。新增 `RefreshFlowCurve`（HTML flex 节点行 + CSS 流动渐变连线 + hover 弹出 `RefreshTaskDetail`）。`HomePage` 仅保留数据获取/SSE 逻辑并改写 `<main>`。流动效果用纯 CSS（`repeating-linear-gradient` + `background-position` 动画 + 跑动光点），无新增依赖。

**Tech Stack:** React 19 + Vite + Tailwind v4 + lucide-react。前端无单元测试框架，每个任务以 `npm run build`（`tsc -b` 类型检查 + vite build）和 `npm run lint` 验证，最后做浏览器手动验证。

---

## 文件结构

- **新增** `frontend/src/components/home/refreshStatus.tsx` — 共享：`RefreshTaskConfig` 类型、`TASKS` 数组、`isStepDone`、`nodeState`、`getBlockedDep`、`StatusBadge`、`computeOverallProgress`、`estimateEta`。
- **新增** `frontend/src/components/home/RefreshTaskDetail.tsx` — hover 弹出的单任务详情卡片（内容来自原 `TaskCard` 信息区，含操作按钮）。
- **新增** `frontend/src/components/home/RefreshFlowCurve.tsx` — 7 节点横向曲线，节点状态着色 + CSS 流动连线，每个节点 hover 显示 `RefreshTaskDetail`。
- **修改** `frontend/src/pages/HomePage.tsx` — 保留数据获取/SSE/`handleRefresh`/`handleRefreshAll`，从此文件移除 `RefreshTaskConfig`/`TASKS`/`isStepDone`/`StatusBadge`（改为从 `refreshStatus.tsx` import）、删除 `DOMAINS`/`TaskCard`/旧总览卡片/底部内容，`<main>` 改写为标题行 + 整体进度卡片。
- **修改** `frontend/src/index.css` — 新增 `@keyframes flow-dash` 与 `@keyframes flow-comet`。

> 说明：相对 spec，连线的"流动"由 CSS `repeating-linear-gradient` + `background-position` 动画实现（而非 SVG `<path>` + `<animateMotion>`），原因是 HTML flex 布局下按节点状态对每段连线独立着色、并保证响应式宽度对齐更可靠；spec 的视觉意图（流动虚线 + 跑动光点）完全保留。

---

## Task 1: 抽出共享模块 `refreshStatus.tsx`

**Files:**
- Create: `frontend/src/components/home/refreshStatus.tsx`
- Modify: `frontend/src/pages/HomePage.tsx`（删除已迁移的定义，改为 import；本任务暂不改动 `<main>` 布局，保证可编译）

- [ ] **Step 1: 创建共享模块**

创建 `frontend/src/components/home/refreshStatus.tsx`，完整内容：

```tsx
import {
  AlertCircle,
  CandlestickChart,
  Check,
  Database,
  FileDown,
  FileSearch,
  FileText,
  Loader2,
  Megaphone,
  PieChart,
  type LucideIcon,
} from 'lucide-react'
import { api } from '@/lib/api'
import type { MetaResponse, RefreshStatus, RefreshStep } from '@/types'

/* ─── 任务配置 ─── */

export interface RefreshTaskConfig {
  key: string
  label: string
  shortLabel: string
  description: string
  icon: LucideIcon
  step: (status: RefreshStatus) => RefreshStep
  updatedAt: (meta: MetaResponse) => string | null
  trigger: () => Promise<unknown>
  dependsOn?: string[]
}

export const TASKS: RefreshTaskConfig[] = [
  {
    key: 'stock-list',
    label: '股票列表',
    shortLabel: '股票列表',
    description: '全市场股票名称、行业分类与上市状态',
    icon: Database,
    step: (s) => s.kline.steps[0],
    updatedAt: (m) => m.stockList.updatedAt,
    trigger: () => api.refreshStockList(),
  },
  {
    key: 'kline-data',
    label: 'K线数据（日+周+月+季）',
    shortLabel: 'K线数据',
    description: '日 / 周 / 月 / 季 K 线，技术面选股的基础行情数据',
    icon: CandlestickChart,
    step: (s) => s.kline.steps[1],
    updatedAt: (m) => m.klineDay.updatedAt,
    trigger: () => api.refreshKline(),
    dependsOn: ['stock-list'],
  },
  {
    key: 'financial',
    label: '财报数据',
    shortLabel: '财报数据',
    description: '最新一期财务报表，含营收、净利润等核心指标',
    icon: FileText,
    step: (s) => s.fundamental.steps[0],
    updatedAt: (m) => m.financialReports.updatedAt,
    trigger: () => api.refreshFundamentalStep('financial'),
  },
  {
    key: 'forecasts',
    label: '业绩预告快报',
    shortLabel: '业绩预告',
    description: '上市公司业绩预告与业绩快报',
    icon: Megaphone,
    step: (s) => s.fundamental.steps[1],
    updatedAt: (m) => m.forecasts.updatedAt,
    trigger: () => api.refreshFundamentalStep('forecasts'),
  },
  {
    key: 'industry',
    label: '行业与指数数据',
    shortLabel: '行业数据',
    description: '申万行业分类及行业指数走势',
    icon: PieChart,
    step: (s) => s.fundamental.steps[2],
    updatedAt: (m) => m.industryIndex.updatedAt,
    trigger: () => api.refreshFundamentalStep('industry'),
  },
  {
    key: 'research-meta',
    label: '研报元数据',
    shortLabel: '研报元数据',
    description: '个股研报标题、机构、发布日期等元信息',
    icon: FileSearch,
    step: (s) => s.fundamental.steps[3],
    updatedAt: (m) => m.researchReports.stage1UpdatedAt,
    trigger: () => api.refreshFundamentalStep('research-meta'),
    dependsOn: ['stock-list'],
  },
  {
    key: 'research-pdfs',
    label: '研报PDF解析',
    shortLabel: '研报PDF',
    description: '下载并解析候选股研报全文（依赖研报元数据）',
    icon: FileDown,
    step: (s) => s.fundamental.steps[4],
    updatedAt: (m) => m.researchReports.stage2UpdatedAt,
    trigger: () => api.refreshFundamentalStep('research-pdfs'),
    dependsOn: ['research-meta'],
  },
]

/* ─── 状态判定 ─── */

export function isStepDone(step: RefreshStep): boolean {
  return step.status === 'done' || (step.status === 'idle' && step.total > 0)
}

export type NodeState = 'done' | 'running' | 'error' | 'waiting'

export function nodeState(step: RefreshStep): NodeState {
  if (step.status === 'error') return 'error'
  if (step.status === 'running') return 'running'
  if (isStepDone(step)) return 'done'
  return 'waiting'
}

/** 返回阻塞当前任务的未完成依赖的中文名，无则 null */
export function getBlockedDep(
  config: RefreshTaskConfig,
  status: RefreshStatus | undefined
): string | null {
  if (!config.dependsOn || !status) return null
  for (const depKey of config.dependsOn) {
    const dep = TASKS.find((t) => t.key === depKey)
    if (dep && !isStepDone(dep.step(status))) return dep.label
  }
  return null
}

/* ─── 整体进度 & ETA ─── */

export function computeOverallProgress(
  status: RefreshStatus | undefined
): { doneCount: number; overallPct: number } {
  if (!status) return { doneCount: 0, overallPct: 0 }
  const steps = TASKS.map((t) => t.step(status))
  const doneCount = steps.filter(isStepDone).length
  const effective = steps.map((s) =>
    isStepDone(s) ? 100 : s.status === 'running' ? s.progress : 0
  )
  const overallPct = Math.round(
    effective.reduce((a, b) => a + b, 0) / TASKS.length
  )
  return { doneCount, overallPct }
}

function parseElapsed(elapsed: string): number {
  const parts = elapsed.split(':').map(Number)
  if (parts.length !== 2 || parts.some(Number.isNaN)) return 0
  return parts[0] * 60 + parts[1]
}

/** 基于当前正在运行任务估算整体预计完成时间，返回 "HH:MM:SS"，无可估算任务返回 "--" */
export function estimateEta(
  status: RefreshStatus | undefined,
  now: Date = new Date()
): string {
  if (!status) return '--'
  let maxRemaining = 0
  let hasRunning = false
  for (const t of TASKS) {
    const step = t.step(status)
    if (step.status === 'running' && step.progress > 0) {
      const elapsed = parseElapsed(step.elapsed)
      const total = elapsed / (step.progress / 100)
      const remaining = Math.max(0, total - elapsed)
      if (remaining > maxRemaining) maxRemaining = remaining
      hasRunning = true
    }
  }
  if (!hasRunning) return '--'
  const eta = new Date(now.getTime() + maxRemaining * 1000)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(eta.getHours())}:${pad(eta.getMinutes())}:${pad(eta.getSeconds())}`
}

/* ─── 状态徽章（节点下方 / 详情卡片复用）─── */

export function StatusBadge({ step }: { step: RefreshStep }) {
  if (step.status === 'running') {
    return (
      <span className="flex items-center gap-1.5 text-[12px] text-brand">
        <Loader2 className="size-3.5 animate-spin" />
        {step.progress}%
      </span>
    )
  }
  if (step.status === 'error') {
    return (
      <span className="flex items-center gap-1 text-[12px] text-down" title={step.error ?? undefined}>
        <AlertCircle className="size-3.5" />
        失败
      </span>
    )
  }
  if (isStepDone(step)) {
    return (
      <span className="flex items-center gap-1 text-[12px] text-up">
        <Check className="size-3.5" />
        已完成
      </span>
    )
  }
  return <span className="text-[12px] text-ink-faint">待执行</span>
}
```

- [ ] **Step 2: 在 `HomePage.tsx` 中删除已迁移的定义并改为 import**

打开 `frontend/src/pages/HomePage.tsx`：

1. 删除顶部 lucide-react import 中仅被迁移代码使用的图标。本任务结束后 `HomePage.tsx` 仍保留旧的 `TaskCard`/总览卡片渲染（下个 Task 才删），所以这些图标暂时仍在用——**本步骤不要动 import 和 `TaskCard`/`DOMAINS`**，只删除并替换以下三处定义：

2. 删除 `interface RefreshTaskConfig { ... }` 整段（第 25-34 行附近）。
3. 删除 `const TASKS: RefreshTaskConfig[] = [ ... ]` 整段（第 36-103 行附近）。
4. 删除 `function isStepDone(...) { ... }`（第 116-118 行附近）和 `function StatusBadge(...) { ... }`（第 120-146 行附近）。
5. 在文件顶部 import 区加入：

```tsx
import {
  RefreshTaskConfig,
  TASKS,
  isStepDone,
  StatusBadge,
} from '@/components/home/refreshStatus'
```

注意 `RefreshTaskConfig` 是 type，按项目 lint 习惯用 `import { type RefreshTaskConfig, TASKS, isStepDone, StatusBadge }`。`TaskCard` 仍引用 `RefreshTaskConfig`/`StatusBadge`/`isStepDone`，import 后即可编译。

6. 清理 `HomePage.tsx` 顶部 lucide-react import：移除现在已无引用的图标（`CandlestickChart`、`Database`、`FileDown`、`FileSearch`、`FileText`、`Megaphone`、`PieChart`、`type LucideIcon`、`Check`），保留仍被 `TaskCard`/总览卡片使用的（`AlertCircle`、`Loader2`、`RotateCw`）。

- [ ] **Step 3: 类型检查 + 构建**

Run: `cd frontend && npm run build`
Expected: 构建成功，无 TS 报错。

- [ ] **Step 4: Lint**

Run: `cd frontend && npm run lint`
Expected: 无新增 error。

- [ ] **Step 5: Commit**

```bash
cd /Users/yuanjiawei/ai-coding/iamrich
git add frontend/src/components/home/refreshStatus.tsx frontend/src/pages/HomePage.tsx
git commit -m "refactor: extract home refresh status/config into shared module

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: 新增流动动画 keyframes

**Files:**
- Modify: `frontend/src/index.css`

- [ ] **Step 1: 添加 keyframes**

在 `frontend/src/index.css` 末尾（`@layer base { ... }` 之后）追加：

```css
/* 数据工厂流动连线动画 */
@keyframes flow-dash {
  to {
    background-position-x: 14px;
  }
}

@keyframes flow-comet {
  0% {
    left: -8px;
    opacity: 0;
  }
  20% {
    opacity: 1;
  }
  80% {
    opacity: 1;
  }
  100% {
    left: 100%;
    opacity: 0;
  }
}
```

- [ ] **Step 2: 构建验证**

Run: `cd frontend && npm run build`
Expected: 构建成功。

- [ ] **Step 3: Commit**

```bash
cd /Users/yuanjiawei/ai-coding/iamrich
git add frontend/src/index.css
git commit -m "feat: add flow-dash and flow-comet keyframes for data factory curve

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: 新增 `RefreshTaskDetail` 详情组件

**Files:**
- Create: `frontend/src/components/home/RefreshTaskDetail.tsx`

- [ ] **Step 1: 创建组件**

创建 `frontend/src/components/home/RefreshTaskDetail.tsx`，完整内容：

```tsx
import { RotateCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ProgressBar } from '@/components/ui/progress'
import {
  StatusBadge,
  isStepDone,
  type RefreshTaskConfig,
} from '@/components/home/refreshStatus'
import type { MetaResponse, RefreshStep } from '@/types'

interface RefreshTaskDetailProps {
  config: RefreshTaskConfig
  step: RefreshStep
  meta: MetaResponse | undefined
  blockedDep: string | null
  allRunning: boolean
  onRefresh: (key: string) => void
}

export function RefreshTaskDetail({
  config,
  step,
  meta,
  blockedDep,
  allRunning,
  onRefresh,
}: RefreshTaskDetailProps) {
  const running = step.status === 'running'
  const updatedAt = meta ? config.updatedAt(meta) : null

  const disabled = running || allRunning || !!blockedDep
  const buttonTitle = allRunning
    ? '全部更新中，请稍候'
    : blockedDep
      ? `请先完成：${blockedDep}`
      : running
        ? '正在执行中'
        : `刷新${config.label}`

  const buttonLabel = running
    ? '执行中'
    : step.status === 'error'
      ? '重试'
      : isStepDone(step)
        ? '重新执行'
        : '立即执行'

  return (
    <div className="w-64 rounded-[12px] border border-line bg-paper p-4 shadow-lg">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-[13px] font-semibold tracking-tight text-ink">{config.label}</h3>
          <p className="mt-0.5 text-[11px] leading-snug text-ink-faint">{config.description}</p>
        </div>
        <StatusBadge step={step} />
      </div>

      <div className="mt-3 space-y-1.5 text-[12px] text-ink-soft">
        {step.status === 'error' ? (
          <p className="text-down">{step.error ?? '更新失败'}</p>
        ) : running ? (
          <>
            <ProgressBar value={step.progress} className="h-1.5" />
            <div className="flex items-center justify-between tnum text-ink-faint">
              <span>已耗时 {step.elapsed}</span>
              {step.total > 0 && (
                <span>
                  {step.done.toLocaleString()} / {step.total.toLocaleString()}
                </span>
              )}
            </div>
          </>
        ) : isStepDone(step) ? (
          <div className="flex items-center justify-between tnum text-ink-faint">
            <span>{updatedAt ?? '—'}</span>
            {step.done > 0 && <span>{step.done.toLocaleString()} 条</span>}
          </div>
        ) : blockedDep ? (
          <p className="text-ink-faint">需先完成：{blockedDep}</p>
        ) : (
          <p className="text-ink-faint">待执行</p>
        )}
      </div>

      <Button
        variant="outline"
        size="sm"
        disabled={disabled}
        title={buttonTitle}
        onClick={() => onRefresh(config.key)}
        className="mt-3 w-full"
      >
        <RotateCw className={`size-3.5 ${running ? 'animate-spin' : ''}`} />
        {buttonLabel}
      </Button>
    </div>
  )
}
```

- [ ] **Step 2: 构建验证**

Run: `cd frontend && npm run build`
Expected: 构建成功（组件尚未被引用，但类型应通过）。

- [ ] **Step 3: Lint**

Run: `cd frontend && npm run lint`
Expected: 无新增 error。

- [ ] **Step 4: Commit**

```bash
cd /Users/yuanjiawei/ai-coding/iamrich
git add frontend/src/components/home/RefreshTaskDetail.tsx
git commit -m "feat: add RefreshTaskDetail hover card component

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: 新增 `RefreshFlowCurve` 曲线组件

**Files:**
- Create: `frontend/src/components/home/RefreshFlowCurve.tsx`

- [ ] **Step 1: 创建组件**

创建 `frontend/src/components/home/RefreshFlowCurve.tsx`，完整内容：

```tsx
import { AlertCircle, Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import { RefreshTaskDetail } from '@/components/home/RefreshTaskDetail'
import {
  StatusBadge,
  TASKS,
  getBlockedDep,
  nodeState,
  type NodeState,
} from '@/components/home/refreshStatus'
import type { MetaResponse, RefreshStatus, RefreshStep } from '@/types'

interface RefreshFlowCurveProps {
  status: RefreshStatus | undefined
  meta: MetaResponse | undefined
  allRunning: boolean
  onRefresh: (key: string) => void
}

const SEGMENT_COLOR: Record<'done' | 'active' | 'waiting', string> = {
  done: 'var(--color-ink)',
  active: 'var(--color-brand)',
  waiting: 'var(--color-line)',
}

function segmentKind(left: NodeState, right: NodeState): 'done' | 'active' | 'waiting' {
  const active = (s: NodeState) => s === 'running' || s === 'error'
  if (active(left) || active(right)) return 'active'
  if (left === 'done' && right === 'done') return 'done'
  return 'waiting'
}

function Segment({ kind }: { kind: 'done' | 'active' | 'waiting' }) {
  const color = SEGMENT_COLOR[kind]
  return (
    <div
      className="relative h-[3px] flex-1 animate-[flow-dash_0.9s_linear_infinite]"
      style={{
        backgroundImage: `repeating-linear-gradient(90deg, ${color} 0 8px, transparent 8px 14px)`,
        backgroundSize: '14px 100%',
      }}
    >
      {kind === 'active' && (
        <span className="pointer-events-none absolute top-1/2 size-1.5 -translate-y-1/2 rounded-full bg-brand shadow-[0_0_6px_2px_var(--color-brand)] animate-[flow-comet_1.6s_linear_infinite]" />
      )}
    </div>
  )
}

function NodeCircle({ state }: { state: NodeState }) {
  if (state === 'done') {
    return (
      <div className="flex size-9 items-center justify-center rounded-full bg-ink text-white">
        <Check className="size-[18px]" strokeWidth={2.4} />
      </div>
    )
  }
  if (state === 'error') {
    return (
      <div className="flex size-9 items-center justify-center rounded-full bg-brand text-white">
        <AlertCircle className="size-[18px]" />
      </div>
    )
  }
  if (state === 'running') {
    return (
      <div className="relative flex size-9 items-center justify-center rounded-full border-2 border-brand bg-paper">
        <span className="absolute inset-0 rounded-full border-2 border-brand animate-ping opacity-60" />
        <span className="size-2.5 rounded-full bg-brand" />
      </div>
    )
  }
  return <div className="size-9 rounded-full border-2 border-line bg-paper" />
}

function FlowNode({
  index,
  total,
  step,
  state,
  shortLabel,
  detail,
}: {
  index: number
  total: number
  step: RefreshStep
  state: NodeState
  shortLabel: string
  detail: React.ReactNode
}) {
  // 首尾节点的详情卡片做边缘对齐，避免溢出容器
  const align =
    index === 0
      ? 'left-0'
      : index === total - 1
        ? 'right-0'
        : 'left-1/2 -translate-x-1/2'

  return (
    <div className="group relative flex w-[76px] shrink-0 flex-col items-center">
      <NodeCircle state={state} />
      <div className="mt-2 text-center text-[11px] font-medium leading-tight text-ink">
        {shortLabel}
      </div>
      <div className="mt-0.5 flex justify-center">
        <StatusBadge step={step} />
      </div>

      {/* hover 详情：pb-2 形成可悬停桥接区 */}
      <div
        className={cn(
          'pointer-events-none absolute bottom-full z-50 pb-2 opacity-0 transition-opacity duration-150',
          'group-hover:pointer-events-auto group-hover:opacity-100',
          align
        )}
      >
        {detail}
      </div>
    </div>
  )
}

export function RefreshFlowCurve({ status, meta, allRunning, onRefresh }: RefreshFlowCurveProps) {
  const states: NodeState[] = TASKS.map((t) =>
    status ? nodeState(t.step(status)) : 'waiting'
  )

  return (
    <div className="flex items-start">
      {TASKS.map((config, i) => {
        const step = status
          ? config.step(status)
          : {
              label: config.label,
              status: 'idle' as const,
              error: null,
              progress: 0,
              done: 0,
              total: 0,
              elapsed: '00:00',
            }
        const blockedDep = getBlockedDep(config, status)
        const node = (
          <FlowNode
            key={config.key}
            index={i}
            total={TASKS.length}
            step={step}
            state={states[i]}
            shortLabel={config.shortLabel}
            detail={
              <RefreshTaskDetail
                config={config}
                step={step}
                meta={meta}
                blockedDep={blockedDep}
                allRunning={allRunning}
                onRefresh={onRefresh}
              />
            }
          />
        )
        if (i === TASKS.length - 1) return node
        // 连线段：垂直对齐到节点圆心（圆 size-9 = 36px，圆心距顶部 18px，线高 3px）
        return [
          node,
          <div key={`seg-${config.key}`} className="flex flex-1 pt-[16px]">
            <Segment kind={segmentKind(states[i], states[i + 1])} />
          </div>,
        ]
      })}
    </div>
  )
}
```

- [ ] **Step 2: 构建验证**

Run: `cd frontend && npm run build`
Expected: 构建成功。

- [ ] **Step 3: Lint**

Run: `cd frontend && npm run lint`
Expected: 无新增 error。

- [ ] **Step 4: Commit**

```bash
cd /Users/yuanjiawei/ai-coding/iamrich
git add frontend/src/components/home/RefreshFlowCurve.tsx
git commit -m "feat: add RefreshFlowCurve with flowing connectors and hover detail

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: 改写 `HomePage` 主体并清理旧布局

**Files:**
- Modify: `frontend/src/pages/HomePage.tsx`

- [ ] **Step 1: 删除旧的 `TaskCard`、`DOMAINS`，更新 import**

打开 `frontend/src/pages/HomePage.tsx`：

1. 删除 `const DOMAINS: ... = [ ... ]` 整段。
2. 删除 `function TaskCard({ ... }) { ... }` 整段。
3. 删除现有从 `'@/components/home/refreshStatus'` 的 import（`RefreshTaskConfig`、`StatusBadge`、`isStepDone`），替换为新的：

```tsx
import {
  TASKS,
  computeOverallProgress,
  estimateEta,
} from '@/components/home/refreshStatus'
import { RefreshFlowCurve } from '@/components/home/RefreshFlowCurve'
```

4. 顶部 import 清理：现在 `HomePage` 仅用到 `AlertCircle`、`Loader2`、`RotateCw`（见下方新 JSX）。把 lucide-react import 收敛为：

```tsx
import { AlertCircle, Loader2, RotateCw } from 'lucide-react'
```

5. 删除不再使用的 import：`Card, CardContent`（改用下方 `Card`，仍需要 `Card`）、`ProgressBar`（整体进度条要用，保留）。最终非 lucide import 应为：

```tsx
import { useEffect, useRef, useState } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ProgressBar } from '@/components/ui/progress'
import { PageHeader } from '@/components/layout/PageHeader'
import { api } from '@/lib/api'
import type { MetaResponse, RefreshStatus } from '@/types'
```

> 注意：`RefreshStep` 类型不再在 `HomePage.tsx` 直接使用，可从 type import 中移除。

- [ ] **Step 2: 改写组件内派生值与 `<main>`**

在 `HomePage` 函数体内，`const allRunning = ...` 之后、`handleRefresh` 之前，删除 `const stockCount = ...`，加入：

```tsx
  const { doneCount, overallPct } = computeOverallProgress(status)
  const eta = estimateEta(status)
```

将 `return ( ... )` 中 `<main>` 整体替换为：

```tsx
      <main className="flex-1 overflow-y-auto p-6">
        {/* 标题行 */}
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold tracking-tight text-ink">数据工厂</h1>
            <p className="mt-1 text-[13px] text-ink-faint">
              实时掌握数据更新进度，确保选股引擎高效运行
            </p>
          </div>
          <Button
            variant="primary"
            size="lg"
            disabled={allRunning}
            onClick={handleRefreshAll}
            title={allRunning ? '全部更新中，请稍候' : '一键更新全部'}
          >
            <RotateCw className={`size-4 ${allRunning ? 'animate-spin' : ''}`} />
            一键更新全部
          </Button>
        </div>

        {/* 整体进度卡片 */}
        <Card className="p-6">
          <div className="flex items-end justify-between gap-4">
            <div>
              <div className="text-[12px] font-medium text-ink-soft">整体进度</div>
              <div className="mt-1 flex items-baseline gap-3">
                <span className="text-3xl font-bold tnum text-brand">{overallPct}%</span>
                <span className="text-[13px] text-ink-faint tnum">{doneCount}/{TASKS.length} 完成</span>
              </div>
            </div>
            <div className="text-right">
              <div className="text-[12px] font-medium text-ink-soft">预计完成时间</div>
              {status?.all.status === 'error' ? (
                <div className="mt-1 flex items-center justify-end gap-1.5 text-[13px] text-down">
                  <AlertCircle className="size-4" />
                  {status.all.error ?? '更新失败'}
                </div>
              ) : allRunning ? (
                <div className="mt-1 flex items-center justify-end gap-1.5 text-lg font-semibold tnum text-ink">
                  <Loader2 className="size-4 animate-spin text-brand" />
                  {eta}
                </div>
              ) : (
                <div className="mt-1 text-lg font-semibold tnum text-ink">{eta}</div>
              )}
            </div>
          </div>

          <ProgressBar value={overallPct} className="mt-4 h-2.5" />

          <div className="mt-10">
            <RefreshFlowCurve
              status={status}
              meta={meta}
              allRunning={allRunning}
              onRefresh={handleRefresh}
            />
          </div>
        </Card>
      </main>
```

- [ ] **Step 3: 类型检查 + 构建**

Run: `cd frontend && npm run build`
Expected: 构建成功，无 TS 报错（确认无残留对 `CardContent`/`stockCount`/`DOMAINS`/`TaskCard`/`RefreshStep` 的引用）。

- [ ] **Step 4: Lint**

Run: `cd frontend && npm run lint`
Expected: 无新增 error / unused import。

- [ ] **Step 5: Commit**

```bash
cd /Users/yuanjiawei/ai-coding/iamrich
git add frontend/src/pages/HomePage.tsx
git commit -m "feat: redesign home page with overall progress and flow curve

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 6: 手动浏览器验证

**Files:** 无（验证任务）

- [ ] **Step 1: 启动后端与前端**

后端（若未运行）：

```bash
cd /Users/yuanjiawei/ai-coding/iamrich/backend && source venv/bin/activate && uvicorn app.main:app --reload
```

前端：

```bash
cd /Users/yuanjiawei/ai-coding/iamrich/frontend && npm run dev
```

打开 `http://localhost:5173`，进入"首页"。

- [ ] **Step 2: 验证静态展示**

确认：
- 标题"数据工厂"+ 副标题，右侧"一键更新全部"按钮。
- 整体进度卡片：百分比、`X/7 完成`、预计完成时间（无任务运行时显示 `--`）、整体进度条与 `computeOverallProgress` 一致。
- 7 个节点按 `TASKS` 顺序（股票列表→K线数据→财报数据→业绩预告→行业数据→研报元数据→研报PDF）排列，已完成节点为深蓝实心圆 + 白勾，等待节点为灰色空心圆。
- 连线持续流动（虚线向右流动）。

- [ ] **Step 3: 验证运行中/失败状态**

由于真实数据可能全为"已完成"，临时构造其它状态进行视觉验证：在浏览器 devtools Console 无法直接改 React state，改用以下任一方式：
- 触发某个单任务刷新（hover 节点 → 点击"重新执行/立即执行"），观察该节点变红色脉冲圆环、下方"运行中 X%"、相邻连线段变红并出现跑动光点、预计完成时间出现 `HH:MM:SS`。
- 或在 `RefreshFlowCurve.tsx` 临时把 `states` 写死为包含 `'running'`/`'error'`/`'waiting'` 的数组，肉眼确认四种节点样式与连线着色后还原。

确认：运行中=红色脉冲圆环 + "运行中 X%"；失败=红色实心圆 + AlertCircle + "失败"；活跃相邻连线段=红色 + 跑动光点。

- [ ] **Step 4: 验证 hover 详情**

- hover 任一节点，上方弹出 `RefreshTaskDetail`：标题=完整任务名、状态徽章、信息区（完成时间/条数 或 进度/耗时 或 依赖提示 或 错误）、底部按钮（重新执行/立即执行/重试，运行中禁用）。
- 鼠标从节点移到详情卡片不消失（pb-2 桥接生效），可点击按钮。
- hover 第一个节点（股票列表）与最后一个节点（研报PDF），详情卡片不溢出卡片左右边缘。
- 被依赖阻塞的任务（如依赖未完成时的 K线数据 / 研报PDF）详情显示"需先完成：xxx"且按钮禁用。

- [ ] **Step 5: 验证操作链路**

- 点击"一键更新全部"，按钮进入禁用/加载态，预计完成时间区出现 spinner + ETA；节点与连线随 SSE 推送实时更新；完成后整体进度到 100%、`7/7 完成`。
- 若清理过临时改动（Step 3 的写死 states），确认已还原并 `npm run build` 通过。

- [ ] **Step 6: 最终构建确认**

Run: `cd frontend && npm run build && npm run lint`
Expected: 均通过，无临时调试代码残留。

---

## Self-Review 记录

- **Spec 覆盖**：整体布局（Task 5）、整体百分比/已完成数/ETA 计算（Task 1 `computeOverallProgress`/`estimateEta` + Task 5 展示）、ETA 错误态（Task 5）、`RefreshFlowCurve` 节点 4 状态与连线着色（Task 4）、流动动画（Task 2 keyframes + Task 4 Segment）、`RefreshTaskDetail` 内容与操作按钮（Task 3）、首尾节点边缘对齐（Task 4 `align`）、移除 `TaskCard`/`DOMAINS`/总览卡片/底部内容（Task 5）、保留数据获取/SSE（Task 1/5 未触碰相关逻辑）、index.css keyframes（Task 2）—— 均有对应任务。
- **类型一致性**：`RefreshTaskConfig`/`TASKS`/`isStepDone`/`StatusBadge`/`nodeState`/`getBlockedDep`/`computeOverallProgress`/`estimateEta`/`NodeState` 在 Task 1 定义，后续 Task 3/4/5 的引用签名一致。`status.all.status`/`status.all.error` 来自 `RefreshStatus.all: RefreshGroup`（types.ts 已有）。
- **无占位符**：所有代码步骤给出完整内容。
- **测试说明**：前端无单测框架，故以 `npm run build`（tsc 类型检查）+ `npm run lint` + Task 6 手动浏览器验证替代 TDD 流程。
