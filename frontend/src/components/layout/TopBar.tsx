import { Check, Loader2, RotateCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Wordmark } from './Logo'
import { ProgressBar } from '@/components/ui/progress'
import type { RefreshStatus, StrategyId } from '@/types'
import { STRATEGY_CATEGORY } from '@/types'

function InlineProgress({ label, status }: { label: string; status: { status: string; steps: { progress: number; done: number; total: number }[] } }) {
  if (status.status === 'idle') {
    return <span className="text-[12px] text-ink-faint">{label}: 待执行</span>
  }
  if (status.status === 'done') {
    return <span className="flex items-center gap-1 text-[12px] text-up">{label}: 已完成 <Check className="size-3" /></span>
  }
  if (status.status === 'error') {
    return <span className="text-[12px] text-down">{label}: 失败</span>
  }
  // running
  const avgProgress = status.steps.length > 0 ? Math.round(status.steps.reduce((a, t) => a + t.progress, 0) / status.steps.length) : 0
  return (
    <span className="flex items-center gap-2 text-[12px]">
      <span className="flex items-center gap-1 text-brand">
        <Loader2 className="size-3 animate-spin" />
        {label}: {avgProgress}%
      </span>
      <ProgressBar value={avgProgress} className="w-20" />
    </span>
  )
}

export function TopBar({
  updatedAt,
  strategy,
  refreshStatus,
  onRefreshKline,
  onRefreshFundamental,
}: {
  updatedAt: string
  strategy: StrategyId
  refreshStatus?: RefreshStatus
  onRefreshKline: (reloadStockList: boolean) => void
  onRefreshFundamental: () => void
}) {
  const isTechnical = STRATEGY_CATEGORY[strategy] === 'technical'
  const klineGroup = refreshStatus?.kline ?? { status: 'idle', steps: [] }
  const fundamentalGroup = refreshStatus?.fundamental ?? { status: 'idle', steps: [] }

  return (
    <header className="relative z-50 flex h-16 shrink-0 items-center gap-6 border-b border-line bg-cream/80 px-6 backdrop-blur">
      <Wordmark className="h-9 w-auto" />

      <div className="ml-auto flex items-center gap-3">
        {/* 进度信息 */}
        {isTechnical ? (
          <InlineProgress label="行情" status={klineGroup} />
        ) : (
          <InlineProgress label="基本面" status={fundamentalGroup} />
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
