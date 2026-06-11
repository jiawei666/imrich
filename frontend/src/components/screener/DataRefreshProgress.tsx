import { Check, Loader2, AlertCircle, Clock } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ProgressRing } from '@/components/ui/progress'
import { REFRESH_STATUS } from '@/data/mock'
import type { RefreshGroup, RefreshStatus } from '@/types'

const STATUS_CONFIG: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  running:  { label: '正在执行', icon: <Loader2 className="size-4 animate-spin" />, color: 'text-brand' },
  done:     { label: '已完成',   icon: <Check className="size-4" strokeWidth={2.5} />, color: 'text-up' },
  error:    { label: '执行失败', icon: <AlertCircle className="size-4" />, color: 'text-down' },
  idle:     { label: '待执行',   icon: <Clock className="size-4" />, color: 'text-ink-soft' },
}

function RunningBanner({ status, category }: { status: RefreshStatus; category: 'fundamental' | 'technical' }) {
  const kline = status.kline
  const fundamental = status.fundamental
  const hasActive = kline.status === 'running' || fundamental.status === 'running'
  const hasError = kline.status === 'error' || fundamental.status === 'error'

  if (!hasActive && !hasError) return null

  const tasks: { name: string; group: RefreshGroup }[] = []
  if (category === 'technical' && kline.status !== 'idle') tasks.push({ name: '行情', group: kline })
  if (category === 'fundamental' && fundamental.status !== 'idle') tasks.push({ name: '基本面', group: fundamental })

  return (
    <div className={`rounded-xl border px-4 py-3 flex items-center gap-3 ${
      hasError
        ? 'border-down/30 bg-down/8'
        : 'border-brand/30 bg-brand/8'
    }`}>
      {tasks.map((t) => {
        const cfg = STATUS_CONFIG[t.group.status]
        return (
          <div key={t.name} className="flex items-center gap-2 text-sm font-medium">
            <span className={cfg.color}>{cfg.icon}</span>
            <span className={cfg.color}>{t.name} {cfg.label}</span>
            {t.group.error && (
              <span className="text-down text-xs truncate max-w-[200px]">{t.group.error}</span>
            )}
          </div>
        )
      })}
    </div>
  )
}

function Group({ title, group }: { title: string; group: RefreshGroup }) {
  const isTerminal = group.status === 'done' || group.status === 'error'
  return (
    <div className="space-y-2.5">
      <div className="text-xs font-medium text-ink-soft">{title}</div>
      {group.status === 'error' && group.error && (
        <div className="rounded-xl border border-down/30 bg-down/8 px-3.5 py-2.5 text-sm text-down">
          {group.error}
        </div>
      )}
      {/* 任务已结束时不展示步骤列表，避免与顶部 RunningBanner 重复 */}
      {isTerminal ? null : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {group.steps.map((t) => {
            const done = t.progress >= 100 && t.total > 0
            const active = group.status === 'running' && !done
            return (
              <div
                key={t.label}
                className={`flex items-center justify-between gap-3 rounded-xl border bg-paper-2/50 p-3.5 ${
                  active ? 'border-brand/40' : 'border-line-soft'
                }`}
              >
                <div className="flex min-w-0 flex-col gap-1">
                  <span className="truncate text-sm font-medium text-ink">{t.label}</span>
                  <span className="tnum text-[12px] text-ink-soft">{t.done} / {t.total}</span>
                  <span className="tnum text-[11px] text-ink-faint">耗时 {t.elapsed}</span>
                </div>
                {done ? (
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-up/12 text-up">
                    <Check className="size-4" strokeWidth={2.5} />
                  </span>
                ) : (
                  <div className="relative grid shrink-0 place-items-center">
                    <ProgressRing value={t.progress} />
                    <span className="tnum absolute text-[10px] font-semibold text-brand">{t.progress}%</span>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

export function DataRefreshProgress({ status, category }: { status?: RefreshStatus; category: 'fundamental' | 'technical' }) {
  const s = status ?? REFRESH_STATUS
  return (
    <Card>
      <CardHeader>
        <CardTitle>数据刷新进度</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <RunningBanner status={s} category={category} />
        {category === 'technical' && <Group title="任务组A · 行情" group={s.kline} />}
        {category === 'fundamental' && <Group title="任务组B · 基本面" group={s.fundamental} />}
      </CardContent>
    </Card>
  )
}