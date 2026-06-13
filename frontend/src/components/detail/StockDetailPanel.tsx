import { ArrowLeft, Star, X } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { StatCards } from './StatCards'
import { ProfitRevenueChart } from './ProfitRevenueChart'
import { PriceChart } from './PriceChart'
import { ResearchReports } from './ResearchReports'
import { RiskChecklist } from './RiskChecklist'
import type { StockDetail } from '@/types'

export function StockDetailPanel({
  detail,
  onClose,
}: {
  detail: StockDetail
  onClose: () => void
}) {
  return (
    <Card className="flex h-full flex-col overflow-hidden">
      {/* header */}
      <div className="flex items-center gap-3 border-b border-line-soft px-5 py-4">
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
      <div className="flex-1 space-y-5 overflow-y-auto px-5 py-5">
        <StatCards detail={detail} />

        <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
          <div className="rounded-[14px] border border-line-soft bg-paper p-4">
            <ProfitRevenueChart data={detail.quarters} />
            <p className="tnum mt-1 text-[12px] text-ink-soft">{detail.latestNote}</p>
          </div>
          <div className="rounded-[14px] border border-line-soft bg-paper p-4">
            <PriceChart
              stockName={detail.name}
              klineDay={detail.klineDay}
              klineWeek={detail.klineWeek}
              klineMonth={detail.klineMonth}
              klineQuarter={detail.klineQuarter}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
          <div className="rounded-[14px] border border-line-soft bg-paper p-4">
            <ResearchReports reports={detail.reports} />
          </div>
          <div className="rounded-[14px] border border-line-soft bg-paper p-4">
            <RiskChecklist risks={detail.risks} />
          </div>
        </div>

        <p className="border-t border-line-soft pt-4 text-[12px] leading-relaxed text-ink-faint">
          免责声明：本系统基于公开数据与研报分析生成，仅供参考，不构成任何投资建议。
        </p>
      </div>
    </Card>
  )
}
