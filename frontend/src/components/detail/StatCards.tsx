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
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
      {/* 当前价 & 价格信息 */}
      <Panel>
        <div className="grid grid-cols-[1fr_auto] gap-y-2 text-sm">
          <span className="text-ink-soft">当前价</span>
          <span className="tnum font-semibold text-ink">{detail.price}</span>
          <span className="text-ink-soft">一年内最高价</span>
          <span className="tnum font-semibold text-ink">{detail.yearHigh}</span>
          <span className="text-[11px] text-ink-faint">（{detail.yearHighDate}）</span>
          <span />
        </div>
      </Panel>

      {/* 行业信息 */}
      <Panel>
        <div className="grid grid-cols-[1fr_auto] gap-y-2 text-sm">
          <span className="text-ink-soft">行业</span>
          <span className="font-medium text-ink">{detail.industry}</span>
          <span className="text-ink-soft">子行业</span>
          <span className="font-medium text-ink">{detail.subIndustry}</span>
        </div>
      </Panel>
    </div>
  )
}
