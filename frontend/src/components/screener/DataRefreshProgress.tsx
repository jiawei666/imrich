import { Check, Loader2, AlertCircle, Clock } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ProgressBar } from '@/components/ui/progress'
import { REFRESH_STATUS } from '@/data/mock'
import type { RefreshGroup, RefreshStatus } from '@/types'

const STATUS_CONFIG: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  running: { label: '正在执行', icon: <Loader2 className="size-4 animate-spin" />, color: 'text-brand' },
  done: { label: '已完成', icon: <Check className="size-4" strokeWidth={2.5} />, color: 'text-up' },
  error: { label: '执行失败', icon: <AlertCircle className="size-4" />, color: 'text-down' },
  idle: { label: '待执行', icon: <Clock className="size-4" />, color: 'text-ink-soft' },
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
    <div className={`rounded-xl border px-4 py-3 flex items-center gap-3 ${hasError
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
  return (
    <div className="space-y-2.5">
      <div className="text-xs font-medium text-ink-soft">{title}</div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {group.steps.map((t) => {
          const done = t.progress >= 100 && t.total > 0
          const active = group.status === 'running' && !done
          const isError = group.status === 'error'
          return (
            <div
              key={t.label}
              className={`flex flex-col gap-2 rounded-xl border bg-paper-2/50 p-3.5 ${active ? 'border-brand/40' : isError ? 'border-down/30' : 'border-line-soft'
                }`}
            >
              <div className="flex items-center justify-between">
                <span className="truncate text-sm font-medium text-ink">{t.label}</span>
                <span className="tnum shrink-0 text-[12px] text-ink-soft">{t.done} / {t.total}</span>
              </div>
              {/* 进度条 */}
              <ProgressBar value={t.progress} className={isError ? '[&>div]:bg-down' : ''} />
              <div className="flex items-center justify-between">
                <span className="tnum text-[11px] text-ink-faint">
                  {done ? '已完成' : active ? `${t.progress}%` : isError ? '失败' : '待执行'}
                </span>
                <span className="tnum text-[11px] text-ink-faint">耗时 {t.elapsed}</span>
              </div>
            </div>
          )
        })}
      </div>
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