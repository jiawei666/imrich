/* eslint-disable react-refresh/only-export-components -- 共享配置/工具模块，与组件共同导出属预期设计 */
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
