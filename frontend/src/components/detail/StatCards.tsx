import { ArrowUp, ChevronRight } from 'lucide-react'
import { SignalBadgeList } from '@/components/screener/SignalBadge'
import type { StockDetail } from '@/types'

function Panel({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-[14px] border border-line-soft bg-paper-2/40 p-4">
      {children}
    </div>
  )
}

export function StatCards({ detail }: { detail: StockDetail }) {
  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
      {/* 综合得分 */}
      <Panel>
        <div className="text-xs text-ink-soft">综合得分</div>
        <div className="mt-2 flex items-baseline gap-1">
          <span className="tnum text-[32px] font-bold leading-none text-ink">
            {detail.score.toFixed(1)}
          </span>
          <span className="text-sm text-ink-faint">/ 100</span>
        </div>
        <div className="mt-2 flex items-center gap-1 text-xs text-up">
          <span className="text-ink-faint">较昨日</span>
          <ArrowUp className="size-3" />
          <span className="tnum font-medium">{detail.scoreDelta.toFixed(1)}</span>
        </div>
      </Panel>

      {/* 命中信号 */}
      <Panel>
        <div className="flex items-center justify-between">
          <div className="text-xs text-ink-soft">
            命中信号<span className="ml-1 text-ink-faint">（{detail.signalCount}）</span>
          </div>
          <button className="flex cursor-pointer items-center text-xs text-ink-faint transition-colors hover:text-brand">
            更多 <ChevronRight className="size-3.5" />
          </button>
        </div>
        <div className="mt-3">
          <SignalBadgeList signals={detail.signals} />
        </div>
      </Panel>

      {/* 当前价 */}
      <Panel>
        <div className="grid grid-cols-[1fr_auto] gap-y-2 text-sm">
          <span className="text-ink-soft">当前价</span>
          <span className="tnum font-semibold text-ink">{detail.price}</span>
          <span className="text-ink-soft">距一年高点回撤</span>
          <span className="tnum font-semibold text-down">
            {detail.drawdownFromHigh}%
          </span>
          <span className="text-ink-soft">一年内最高价</span>
          <span className="tnum font-semibold text-ink">{detail.yearHigh}</span>
          <span className="text-[11px] text-ink-faint">（{detail.yearHighDate}）</span>
          <span />
        </div>
      </Panel>
    </div>
  )
}
