import { Check, Clock } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ProgressRing } from '@/components/ui/progress'
import { REFRESH_TASKS } from '@/data/mock'

export function DataRefreshProgress() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>数据刷新进度</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          {REFRESH_TASKS.map((t) => (
            <div
              key={t.label}
              className="flex items-center justify-between gap-3 rounded-xl border border-line-soft bg-paper-2/50 p-3.5"
            >
              <div className="flex flex-col gap-1">
                <span className="text-sm font-medium text-ink">{t.label}</span>
                <span className="tnum text-[12px] text-ink-soft">
                  {t.done} / {t.total}
                </span>
                <span className="tnum text-[11px] text-ink-faint">
                  耗时 {t.elapsed}
                </span>
              </div>
              {t.status === 'done' ? (
                <span className="flex size-8 items-center justify-center rounded-full bg-up/12 text-up">
                  <Check className="size-4" strokeWidth={2.5} />
                </span>
              ) : (
                <div className="relative grid place-items-center">
                  <ProgressRing value={t.progress} />
                  <span className="tnum absolute text-[10px] font-semibold text-brand">
                    {t.progress}%
                  </span>
                </div>
              )}
            </div>
          ))}
        </div>
        <div className="flex items-center gap-1.5 text-[12px] text-ink-faint">
          <Clock className="size-3.5" />
          下次自动刷新：今天 15:30
        </div>
      </CardContent>
    </Card>
  )
}
