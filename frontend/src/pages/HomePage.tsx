import { useEffect, useRef, useState } from 'react'
import {
  AlertCircle,
  Loader2,
  RotateCw,
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ProgressBar } from '@/components/ui/progress'
import { PageHeader } from '@/components/layout/PageHeader'
import { api } from '@/lib/api'
import type { MetaResponse, RefreshStatus } from '@/types'
import {
  type RefreshTaskConfig,
  TASKS,
  isStepDone,
  StatusBadge,
} from '@/components/home/refreshStatus'

/* ─── 配置 ─── */

const DOMAINS: { title: string; keys: string[]; gridClass: string }[] = [
  { title: '技术面数据', keys: ['stock-list', 'kline-data'], gridClass: 'grid-cols-1 lg:grid-cols-2' },
  {
    title: '基本面数据',
    keys: ['financial', 'forecasts', 'industry', 'research-meta', 'research-pdfs'],
    gridClass: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3',
  },
]

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
  const Icon = config.icon

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
    <Card className="flex flex-col p-5">
      <div className="flex items-start gap-3">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-[10px] bg-paper-2 text-ink-soft">
          <Icon className="size-[18px]" />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-[13px] font-semibold tracking-tight text-ink">{config.label}</h3>
          <p className="mt-0.5 text-[12px] leading-snug text-ink-faint">{config.description}</p>
        </div>
      </div>

      <div className="mt-4 flex flex-1 flex-col justify-end gap-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <StatusBadge step={step} />
            {step.done > 0 && (
              <span className="text-[11px] text-ink-faint tnum">· {step.done.toLocaleString()} 条</span>
            )}
          </div>
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
      </div>
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
  const stockCount = status?.kline.steps[0]?.done ?? 0

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
      <PageHeader />
      <main className="flex-1 overflow-y-auto p-6">
        {/* 总览 */}
        <Card className="mb-6 bg-brand-soft">
          <CardContent className="flex flex-wrap items-center justify-between gap-4 py-6">
            <div className="flex flex-wrap items-center gap-6">
              <div>
                <h2 className="text-base font-semibold text-ink">数据更新中心</h2>
                {allRunning ? (
                  <p className="mt-1 flex items-center gap-1.5 text-sm text-brand">
                    <Loader2 className="size-4 animate-spin" />
                    全部更新中...
                  </p>
                ) : status?.all.status === 'error' ? (
                  <p className="mt-1 flex items-center gap-1.5 text-sm text-down">
                    <AlertCircle className="size-4" />
                    {status.all.error ?? '更新失败'}
                  </p>
                ) : (
                  <p className="mt-1 text-sm text-ink-soft">
                    {status?.all.updatedAt ? `上次一键更新于 ${status.all.updatedAt}` : '暂无一键更新记录'}
                  </p>
                )}
              </div>
              <div className="border-l border-line pl-6">
                <div className="text-2xl font-bold text-ink tnum">{stockCount > 0 ? stockCount.toLocaleString() : '--'}</div>
                <div className="text-[12px] text-ink-faint">在库股票数</div>
              </div>
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
          </CardContent>
        </Card>

        {/* 数据分组 */}
        {DOMAINS.map((domain) => (
          <div key={domain.title} className="mb-5">
            <h2 className="mb-3 text-[12px] font-medium text-ink-soft">{domain.title}</h2>
            <div className={`grid gap-4 ${domain.gridClass}`}>
              {TASKS.filter((t) => domain.keys.includes(t.key)).map((config) => (
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
