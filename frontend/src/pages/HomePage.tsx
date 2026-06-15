import { useEffect, useRef, useState } from 'react'
import { AlertCircle, Check, Loader2, RotateCw } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ProgressBar } from '@/components/ui/progress'
import { PageHeader } from '@/components/layout/PageHeader'
import { api } from '@/lib/api'
import type { MetaResponse, RefreshStatus, RefreshStep } from '@/types'

/* ─── 配置 ─── */

interface RefreshTaskConfig {
  key: string
  label: string
  step: (status: RefreshStatus) => RefreshStep
  updatedAt: (meta: MetaResponse) => string | null
  trigger: () => Promise<unknown>
  dependsOn?: string[]
}

const TASKS: RefreshTaskConfig[] = [
  {
    key: 'stock-list',
    label: '股票列表',
    step: (s) => s.kline.steps[0],
    updatedAt: (m) => m.stockList.updatedAt,
    trigger: () => api.refreshStockList(),
  },
  {
    key: 'kline-data',
    label: 'K线数据（日+周+月+季）',
    step: (s) => s.kline.steps[1],
    updatedAt: (m) => m.klineDay.updatedAt,
    trigger: () => api.refreshKline(),
    dependsOn: ['stock-list'],
  },
  {
    key: 'financial',
    label: '财报数据',
    step: (s) => s.fundamental.steps[0],
    updatedAt: (m) => m.financialReports.updatedAt,
    trigger: () => api.refreshFundamentalStep('financial'),
  },
  {
    key: 'forecasts',
    label: '业绩预告快报',
    step: (s) => s.fundamental.steps[1],
    updatedAt: (m) => m.forecasts.updatedAt,
    trigger: () => api.refreshFundamentalStep('forecasts'),
  },
  {
    key: 'industry',
    label: '行业与指数数据',
    step: (s) => s.fundamental.steps[2],
    updatedAt: (m) => m.industryIndex.updatedAt,
    trigger: () => api.refreshFundamentalStep('industry'),
  },
  {
    key: 'research-meta',
    label: '研报元数据',
    step: (s) => s.fundamental.steps[3],
    updatedAt: (m) => m.researchReports.stage1UpdatedAt,
    trigger: () => api.refreshFundamentalStep('research-meta'),
    dependsOn: ['stock-list'],
  },
  {
    key: 'research-pdfs',
    label: '研报PDF解析',
    step: (s) => s.fundamental.steps[4],
    updatedAt: (m) => m.researchReports.stage2UpdatedAt,
    trigger: () => api.refreshFundamentalStep('research-pdfs'),
    dependsOn: ['research-meta'],
  },
]

const STAGES = [
  { title: '阶段1 · 无依赖，可并行', keys: ['stock-list', 'financial', 'forecasts', 'industry'] },
  { title: '阶段2 · 依赖股票列表完成', keys: ['kline-data', 'research-meta'] },
  { title: '阶段3 · 依赖研报元数据完成', keys: ['research-pdfs'] },
]

/* ─── 辅助 ─── */

function isStepDone(step: RefreshStep): boolean {
  return step.status === 'done' || (step.status === 'idle' && step.total > 0)
}

function StatusBadge({ step }: { step: RefreshStep }) {
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

/* ─── 任务卡片 ─── */

function TaskCard({
  config,
  status,
  meta,
  allRunning,
  onRefresh,
}: {
  config: RefreshTaskConfig
  status: RefreshStatus | undefined
  meta: MetaResponse | undefined
  allRunning: boolean
  onRefresh: (key: string) => void
}) {
  const step = status ? config.step(status) : { label: config.label, status: 'idle' as const, error: null, progress: 0, done: 0, total: 0, elapsed: '00:00' }
  const running = step.status === 'running'
  const updatedAt = meta ? config.updatedAt(meta) : null

  // 依赖检查
  let blockedDep: string | null = null
  if (config.dependsOn && status) {
    for (const depKey of config.dependsOn) {
      const depConfig = TASKS.find((t) => t.key === depKey)
      if (depConfig && !isStepDone(depConfig.step(status))) {
        blockedDep = depConfig.label
        break
      }
    }
  }

  const disabled = running || allRunning || !!blockedDep
  const title = allRunning
    ? '全部更新中，请稍候'
    : blockedDep
      ? `请先完成：${blockedDep}`
      : running
        ? '正在执行中'
        : `刷新${config.label}`

  return (
    <Card className="flex flex-col">
      <CardHeader>
        <CardTitle className="text-[13px]">{config.label}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col justify-between gap-3">
        <div className="flex items-center justify-between">
          <StatusBadge step={step} />
          {updatedAt && <span className="text-[11px] text-ink-faint tnum">{updatedAt}</span>}
        </div>
        {running && <ProgressBar value={step.progress} className="h-1.5" />}
        <Button
          variant="outline"
          size="sm"
          disabled={disabled}
          title={title}
          onClick={() => onRefresh(config.key)}
          className="self-start"
        >
          <RotateCw className={`size-3.5 ${running ? 'animate-spin' : ''}`} />
          刷新
        </Button>
      </CardContent>
    </Card>
  )
}

/* ─── 主组件 ─── */

export function HomePage() {
  const [status, setStatus] = useState<RefreshStatus | undefined>(undefined)
  const [meta, setMeta] = useState<MetaResponse | undefined>(undefined)

  const prevStatusRef = useRef<Record<string, string>>({})

  const reloadMeta = () => api.meta().then(setMeta).catch(() => setMeta(undefined))

  useEffect(() => {
    api.meta().then(setMeta).catch(() => setMeta(undefined))
  }, [])

  // SSE 订阅
  useEffect(() => {
    const close = api.refreshStatusStream((s) => {
      setStatus(s)
      // 任意 step 从 running 变为非 running 时刷新 meta
      const prev = prevStatusRef.current
      for (const groupKey of ['kline', 'fundamental', 'all'] as const) {
        const group = s[groupKey]
        for (let i = 0; i < group.steps.length; i++) {
          const stepKey = `${groupKey}.${i}`
          if (prev[stepKey] === 'running' && group.steps[i].status !== 'running') {
            reloadMeta()
          }
          prev[stepKey] = group.steps[i].status
        }
        // all 组本身
        const allKey = `${groupKey}._status`
        if (prev[allKey] === 'running' && group.status !== 'running') {
          reloadMeta()
        }
        prev[allKey] = group.status
      }
    })
    return close
  }, [])

  const allRunning = status?.all.status === 'running'

  const handleRefresh = async (key: string) => {
    const config = TASKS.find((t) => t.key === key)
    if (!config) return
    try {
      await config.trigger()
    } catch {
      // 409 等错误静默处理
    }
  }

  const handleRefreshAll = async () => {
    try {
      await api.refreshAll()
    } catch {
      // 409 等错误静默处理
    }
  }

  return (
    <div className="flex min-w-0 flex-1 flex-col">
      <PageHeader title="数据更新" />
      <main className="flex-1 overflow-y-auto p-6">
        {/* 摘要卡 */}
        <Card className="mb-6">
          <CardContent className="flex items-center justify-between py-4">
            <div className="flex items-center gap-3">
              {allRunning ? (
                <>
                  <Loader2 className="size-5 animate-spin text-brand" />
                  <span className="text-sm text-brand">全部更新中...</span>
                </>
              ) : status?.all.status === 'error' ? (
                <>
                  <AlertCircle className="size-5 text-down" />
                  <span className="text-sm text-down">{status.all.error ?? '更新失败'}</span>
                </>
              ) : (
                <span className="text-sm text-ink-soft">
                  {status?.all.updatedAt ? `上次一键更新于 ${status.all.updatedAt}` : '暂无一键更新记录'}
                </span>
              )}
            </div>
            <Button
              variant="primary"
              size="sm"
              disabled={allRunning}
              onClick={handleRefreshAll}
              title={allRunning ? '全部更新中，请稍候' : '一键更新全部'}
            >
              <RotateCw className={`size-3.5 ${allRunning ? 'animate-spin' : ''}`} />
              一键更新全部
            </Button>
          </CardContent>
        </Card>

        {/* 阶段列表 */}
        {STAGES.map((stage) => (
          <div key={stage.title} className="mb-5">
            <h2 className="mb-3 text-[12px] font-medium text-ink-soft">{stage.title}</h2>
            <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
              {TASKS.filter((t) => stage.keys.includes(t.key)).map((config) => (
                <TaskCard
                  key={config.key}
                  config={config}
                  status={status}
                  meta={meta}
                  allRunning={allRunning}
                  onRefresh={handleRefresh}
                />
              ))}
            </div>
          </div>
        ))}
      </main>
    </div>
  )
}
