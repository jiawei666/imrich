import { Card } from '@/components/ui/card'
import { ProgressBar } from '@/components/ui/progress'
import { Skeleton } from '@/components/ui/skeleton'

export type StatTone = 'green' | 'amber' | 'brand'

const BAR_CLASS: Record<StatTone, string> = {
  green: 'bg-down',
  amber: 'bg-amber-500',
  brand: 'bg-brand',
}

interface StatCardProps {
  label: string
  value: string
  /** 进度条百分比 0–100 */
  pct: number
  tone?: StatTone
  loading?: boolean
}

/** 首页顶部统计卡：标题 + 大号数值 + 底部进度条与百分比 */
export function StatCard({ label, value, pct, tone = 'green', loading }: StatCardProps) {
  return (
    <Card className="flex flex-col gap-4 p-5">
      <div className="text-[13px] font-medium text-ink-soft">{label}</div>
      {loading ? (
        <Skeleton className="h-9 w-24" />
      ) : (
        <div className="text-[32px] font-extrabold leading-none tnum text-ink">{value}</div>
      )}
      <div className="flex items-center gap-3">
        <ProgressBar
          value={loading ? 0 : pct}
          barClassName={BAR_CLASS[tone]}
          className="h-1.5 flex-1"
        />
        <span className="w-9 shrink-0 text-right text-[12px] tnum text-ink-faint">
          {loading ? '—' : `${pct}%`}
        </span>
      </div>
    </Card>
  )
}
