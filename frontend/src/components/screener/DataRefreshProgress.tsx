import { Check } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ProgressRing } from '@/components/ui/progress'
import { REFRESH_STATUS } from '@/data/mock'
import type { RefreshGroup, RefreshStatus } from '@/types'

function Group({ title, group }: { title: string; group: RefreshGroup }) {
  return (
    <div className="space-y-2.5">
      <div className="text-xs font-medium text-ink-soft">{title}</div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {group.steps.map((t) => {
          const done = t.progress >= 100 && t.total > 0
          return (
            <div
              key={t.label}
              className="flex items-center justify-between gap-3 rounded-xl border border-line-soft bg-paper-2/50 p-3.5"
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
    </div>
  )
}

export function DataRefreshProgress({ status }: { status?: RefreshStatus }) {
  const s = status ?? REFRESH_STATUS
  return (
    <Card>
      <CardHeader>
        <CardTitle>数据刷新进度</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <Group title="任务组A · 行情" group={s.kline} />
        <Group title="任务组B · 基本面" group={s.fundamental} />
      </CardContent>
    </Card>
  )
}
