import { AlertCircle, Check, Loader2, RotateCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Wordmark } from './Logo'
import { ProgressBar } from '@/components/ui/progress'
import type { ActivityItem, RefreshStatus, StrategyId } from '@/types'
import { STRATEGY_CATEGORY } from '@/types'

function InlineProgress({ label, step }: { label: string; step: { progress: number; done: number; total: number } | undefined }) {
  if (!step) return null
  if (step.total === 0) {
    return <span className="text-[12px] text-ink-faint">{label}: 待执行</span>
  }
  if (step.progress >= 100 && step.done > 0) {
    return <span className="flex items-center gap-1 text-[12px] text-up">{label}: 已完成 <Check className="size-3" /></span>
  }
  // running
  return (
    <span className="flex items-center gap-2 text-[12px]">
      <span className="flex items-center gap-1 text-brand">
        <Loader2 className="size-3 animate-spin" />
        {label}: {step.progress}%
      </span>
      <ProgressBar value={step.progress} className="w-16" />
    </span>
  )
}

// 实时动态：后台任务（如技术面筛选）状态徽标，与上方刷新进度的纯文字样式区分
function ActivityPill({ item }: { item: ActivityItem }) {
  if (item.status === 'running') {
    return (
      <span className="flex items-center gap-1.5 rounded-full bg-paper-2 px-3 py-1 text-[12px] text-brand">
        <Loader2 className="size-3 animate-spin" />
        {item.label}中...
      </span>
    )
  }
  if (item.status === 'error') {
    return (
      <span className="flex items-center gap-1.5 rounded-full bg-paper-2 px-3 py-1 text-[12px] text-down">
        <AlertCircle className="size-3" />
        {item.label}失败{item.detail ? ` · ${item.detail}` : ''}
      </span>
    )
  }
  return (
    <span className="flex items-center gap-1.5 rounded-full bg-paper-2 px-3 py-1 text-[12px] text-up">
      <Check className="size-3" />
      {item.label}完成{item.detail ? ` · ${item.detail}` : ''}
    </span>
  )
}

export function TopBar({
  updatedAt,
  strategy,
  refreshStatus,
  activities,
  onRefreshKline,
  onRefreshFundamental,
}: {
  updatedAt: string
  strategy: StrategyId
  refreshStatus?: RefreshStatus
  activities: ActivityItem[]
  onRefreshKline: (reloadStockList: boolean) => void
  onRefreshFundamental: () => void
}) {
  const isTechnical = STRATEGY_CATEGORY[strategy] === 'technical'
  const klineGroup = refreshStatus?.kline
  const klineSteps = klineGroup?.steps
  // kline 有两个 step: [0]=股票列表, [1]=K线数据
  const stockListStep = klineSteps?.[0]
  const klineDataStep = klineSteps?.[1]
  const fundamentalGroup = refreshStatus?.fundamental
  const fundamentalSteps = fundamentalGroup?.steps

  return (
    <header className="relative z-50 flex h-16 shrink-0 items-center gap-6 border-b border-line bg-cream/80 px-6 backdrop-blur">
      <Wordmark className="h-9 w-auto" />

      <div className="ml-auto flex items-center gap-3">
        {/* 实时动态：后台任务进行中/完成状态 */}
        <div className="flex items-center gap-2">
          {activities.map((item) => <ActivityPill key={item.id} item={item} />)}
        </div>

        {/* 进度信息 */}
        {isTechnical ? (
          <div className="flex items-center gap-3">
            <InlineProgress label="股票列表" step={stockListStep} />
            <InlineProgress label="K线数据" step={klineDataStep} />
          </div>
        ) : (
          <div className="flex items-center gap-3">
            {fundamentalSteps?.map((step, i) => (
              <InlineProgress key={i} label={step.label} step={step} />
            ))}
          </div>
        )}

        <span className="text-[13px] text-ink-soft">
          数据更新于 <span className="tnum">{updatedAt}</span>
        </span>

        {/* 技术面：刷新行情按钮 */}
        {isTechnical && (
          <div className="group relative">
            <Button variant="outline" size="sm" title="更新K线数据（日/周/月/季），建议每日收盘后执行">
              <RotateCw className="size-3.5" />
              刷新行情
            </Button>
            <div className="pointer-events-none absolute right-0 top-full z-50 pt-1 opacity-0 transition-opacity group-hover:pointer-events-auto group-hover:opacity-100">
              <div className="w-52 rounded-xl border border-line bg-paper shadow-lg">
                <button onClick={() => onRefreshKline(true)} className="flex w-full flex-col px-4 py-2.5 text-left text-sm transition-colors hover:bg-paper-2 rounded-t-xl">
                  <span className="font-medium text-ink">完整刷新</span>
                  <span className="text-[11px] text-ink-soft">重新拉取股票列表 + K线</span>
                </button>
                <div className="mx-3 border-t border-line-soft" />
                <button onClick={() => onRefreshKline(false)} className="flex w-full flex-col px-4 py-2.5 text-left text-sm transition-colors hover:bg-paper-2 rounded-b-xl">
                  <span className="font-medium text-ink">仅刷新K线</span>
                  <span className="text-[11px] text-ink-soft">跳过股票列表，更快</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 基本面：刷新基本面按钮 */}
        {!isTechnical && (
          <Button variant="outline" size="sm" onClick={onRefreshFundamental} title="更新财报、业绩预告快报、行业指数与研报数据，财报季前后建议执行">
            <RotateCw className="size-3.5" />
            刷新基本面
          </Button>
        )}
      </div>
    </header>
  )
}
