import { useEffect, useRef, useState } from 'react'
import { AlertCircle, RotateCw } from 'lucide-react'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'
import type { MetaResponse, RefreshStatus } from '@/types'
import {
  TASKS,
  latestMetaUpdateFull,
  nodeState,
  type NodeState,
} from '@/components/home/refreshStatus'
import { StatCard } from '@/components/home/StatCard'
import { TaskList } from '@/components/home/TaskList'

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

  const loading = status === undefined
  const allRunning = status?.all?.status === 'running'
  const errorMsg = status?.all?.status === 'error' ? status?.all?.error ?? '更新失败' : null

  const states: NodeState[] = TASKS.map((t) => (status ? nodeState(t.step(status)) : 'waiting'))
  const total = TASKS.length
  const doneCount = states.filter((s) => s === 'done').length
  const pendingCount = total - doneCount
  const donePct = total ? Math.round((doneCount / total) * 100) : 0
  const pendingPct = total ? Math.round((pendingCount / total) * 100) : 0

  const lastUpdate = latestMetaUpdateFull(meta)

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
      <main className="flex-1 overflow-y-auto px-8 py-7">
        <div className="mx-auto flex max-w-6xl flex-col gap-6">
          {/* 头部 */}
          <header className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="text-[22px] font-bold tracking-tight text-ink">数据更新中心</h1>
              <p className="mt-1 text-[13px] text-ink-faint">
                实时掌握数据更新状态，确保投资决策基于最新数据
              </p>
            </div>
            <div className="flex items-center gap-3">
              {errorMsg ? (
                <span className="flex items-center gap-1.5 text-[12px] text-brand">
                  <AlertCircle className="size-3.5" />
                  {errorMsg}
                </span>
              ) : (
                <span className="text-[12px] text-ink-faint">
                  最后更新：<span className="tnum">{lastUpdate ?? '—'}</span>
                </span>
              )}
              <button
                type="button"
                onClick={handleRefreshAll}
                disabled={loading || allRunning}
                title={allRunning ? '全部更新中，请稍候' : '一键更新全部'}
                className="flex size-9 items-center justify-center rounded-lg border border-line bg-paper text-ink-soft transition-colors hover:bg-paper-2 hover:text-ink disabled:cursor-not-allowed disabled:opacity-50"
              >
                <RotateCw className={cn('size-4', allRunning && 'animate-spin text-brand')} />
              </button>
            </div>
          </header>

          {/* 统计卡 */}
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
            <StatCard
              label="当日更新进度"
              value={`${doneCount} / ${total}`}
              pct={donePct}
              tone="brand"
              loading={loading}
            />
            <StatCard
              label="已完成"
              value={String(doneCount)}
              pct={doneCount > 0 ? 100 : 0}
              tone="brand"
              loading={loading}
            />
            <StatCard
              label="待执行"
              value={String(pendingCount)}
              pct={pendingPct}
              tone="brand"
              loading={loading}
            />
          </div>

          {/* 任务列表 */}
          <TaskList
            status={status}
            meta={meta}
            allRunning={!!allRunning}
            onRefresh={handleRefresh}
          />

          {/* 页脚 */}
          <footer className="pt-1 pb-2 text-center text-[11px] leading-relaxed text-ink-faint">
            <p>数据来源：同花顺 · 东方财富 · 申万行业</p>
            <p>免责声明：数据仅供参考，不构成投资建议</p>
          </footer>
        </div>
      </main>
    </div>
  )
}
