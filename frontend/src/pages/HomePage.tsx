import { useEffect, useRef, useState } from 'react'
import { AlertCircle, Loader2, RotateCw } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ProgressBar } from '@/components/ui/progress'
import { PageHeader } from '@/components/layout/PageHeader'
import { api } from '@/lib/api'
import type { MetaResponse, RefreshStatus } from '@/types'
import {
  TASKS,
  computeOverallProgress,
  estimateEta,
} from '@/components/home/refreshStatus'
import { RefreshFlowCurve } from '@/components/home/RefreshFlowCurve'

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

  const { doneCount, overallPct } = computeOverallProgress(status)
  const eta = estimateEta(status)

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
    </div>
  )
}
