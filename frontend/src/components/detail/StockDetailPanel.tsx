import { ArrowLeft, Star, X } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { LoadingOverlay } from '@/components/ui/loading-overlay'
import { Button } from '@/components/ui/button'
import { SignalBadgeList } from '@/components/screener/SignalBadge'
import { ProfitRevenueChart } from './ProfitRevenueChart'
import { PriceChart } from './PriceChart'
import { ResearchReports } from './ResearchReports'
import { RiskChecklist } from './RiskChecklist'
import type { StockDetail, Candidate } from '@/types'

export function StockDetailPanel({
  detail,
  candidate,
  onClose,
  loading,
}: {
  detail: StockDetail
  candidate?: Candidate | null
  onClose: () => void
  loading?: boolean
}) {
  return (
    <Card className="relative flex h-full flex-col overflow-hidden">
      <LoadingOverlay show={!!loading} />
      {/* header */}
      <div className="flex items-center gap-3 border-b border-line-soft px-4 py-3">
        <button
          onClick={onClose}
          className="flex cursor-pointer items-center text-ink-faint transition-colors hover:text-ink"
        >
          <ArrowLeft className="size-5" />
        </button>
        <div className="flex items-baseline gap-2.5">
          <h2 className="text-lg font-bold text-ink">{detail.name}</h2>
          <span className="tnum text-sm text-ink-faint">{detail.code}</span>
        </div>
        <span className="ml-1 text-[13px] text-ink-soft">
          {detail.industry} · {detail.subIndustry}
        </span>
        <div className="ml-auto flex items-center gap-2">
          <Button variant="outline" size="sm">
            <Star className="size-3.5" />
            加入自选
          </Button>
          <button
            onClick={onClose}
            className="flex size-8 cursor-pointer items-center justify-center rounded-lg text-ink-faint transition-colors hover:bg-paper-2 hover:text-ink"
          >
            <X className="size-4" />
          </button>
        </div>
      </div>

      {/* scroll body */}
      <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">

        {candidate && (
          <div className="flex items-center gap-3 rounded-[14px] border border-line-soft bg-paper px-3 py-2">
            <div className="flex shrink-0 items-baseline gap-1.5 border-r border-line-soft pr-3">
              <span className="text-xs text-ink-soft">综合得分</span>
              <span className="text-xl font-bold text-brand">{candidate.score.toFixed(1)}</span>
            </div>
            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1">
              <span className="mr-1 shrink-0 text-xs text-ink-soft">命中信号</span>
              <SignalBadgeList signals={candidate.signals} max={99} />
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
          <div className="rounded-[14px] border border-line-soft bg-paper p-3">
            <ProfitRevenueChart data={detail.quarters} />
            <p className="tnum mt-1 text-[12px] text-ink-soft">{detail.latestNote}</p>
          </div>
          <div className="flex flex-col rounded-[14px] border border-line-soft bg-paper p-3">
            <ResearchReports reports={detail.reports} />
          </div>
        </div>

        <div className="rounded-[14px] border border-line-soft bg-paper p-3">
          <PriceChart
            stockName={detail.name}
            klineDay={detail.klineDay}
            klineWeek={detail.klineWeek}
            klineMonth={detail.klineMonth}
            klineQuarter={detail.klineQuarter}
          />
        </div>

        {candidate?.risks && candidate.risks.length > 0 && (
          <div className="rounded-[14px] border border-line-soft bg-paper p-3">
            <RiskChecklist risks={candidate.risks} />
          </div>
        )}

        <p className="border-t border-line-soft pt-3 text-[12px] leading-relaxed text-ink-faint">
          免责声明：本系统基于公开数据与研报分析生成，仅供参考，不构成任何投资建议。
        </p>
      </div>
    </Card>
  )
}
